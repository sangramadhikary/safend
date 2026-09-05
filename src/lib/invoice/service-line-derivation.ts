/**
 * Derive an invoice service line's billing figures from a work order's stored
 * service instances.
 *
 * WHY THIS EXISTS
 * ----------------
 * When raising a one-time invoice from an existing work order, each active
 * service type (unarmed guards, armed guards, ...) becomes one service line.
 * The work order stores, per shift (day / afternoon / night), an `enabled`
 * flag, a `quantity` (headcount) and a `rate` — and that `rate` is the MONTHLY
 * price PER PERSONNEL, the same value the quotation builder sums in
 * calculatePostMonthlySubtotal ("Monthly value of one post's services" =
 * Σ quantity × rate over enabled shifts).
 *
 * The invoice engine (calculations.ts) then prices a line as:
 *
 *     rate   = woPricePerMonth / days      (per-duty rate)
 *     amount = rate × duties
 *
 * where `woPricePerMonth` is the per-personnel monthly price and `duties` is the
 * TOTAL duties served across all personnel. So a full month of N guards is
 * woPrice = per-guard monthly, duties = N × days.
 *
 * THE BUGS THIS REPLACES
 * ----------------------
 * The previous inline derivation:
 *   1. read only `day.rate`, so a night-only service (e.g. an armed guard on the
 *      night shift) derived a WO price of ₹0;
 *   2. multiplied that rate by 26, inflating an already-monthly figure ~26×;
 *   3. set duties = headcount (e.g. 2) instead of a full month of service
 *      (headcount × days), so the computed amount was a tiny fraction of the
 *      real monthly value.
 */

/** Number stored on a shift's rate — may be a number or numeric string. */
type MonetaryRate = number | string | null | undefined;

interface Shift {
  enabled?: boolean;
  quantity?: number;
  rate?: MonetaryRate;
}

export interface ServiceInstanceLike {
  shiftType?: '8H' | '12H' | string;
  shifts?: {
    day?: Shift;
    afternoon?: Shift;
    night?: Shift;
  };
}

export interface DerivedServiceLine {
  /** Total personnel across all enabled shifts on this instance. */
  totalManpower: number;
  /** Shift type for this line ('12H' or '8H'). */
  shiftType: '8H' | '12H';
  /** Monthly price PER PERSONNEL (weighted average when shift rates differ). 0 when no rate data. */
  woPricePerMonth: number;
  /** Total duties across all personnel for the billing period = manpower × active service-days. */
  duties: number;
}

function parseRate(r: MonetaryRate): number {
  const n = typeof r === 'number' ? r : parseFloat(String(r ?? ''));
  return Number.isFinite(n) ? n : 0;
}

/** Weekday keys as used by the stored serviceDays map, indexed by Date.getDay(). */
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/**
 * Count how many days in a billing period an instance is actually active,
 * honouring its `serviceDays` weekday map.
 *
 *  - An absent/empty map means the service runs EVERY day → returns the full
 *    period day count (backward compatible with all-days services).
 *  - Otherwise counts only the dates whose weekday is enabled. e.g. a
 *    Sunday-only guard over July 2026 → the number of Sundays in July.
 *
 * This is exactly how billing already treated it in practice: invoice 26270018
 * billed the Sunday-only 8H guard 4 duties (÷31 × 4), not a full month, while
 * the all-days 12H guard got the full 31.
 *
 * When no dates are supplied (e.g. the "current month" default before a period
 * is chosen) we cannot enumerate weekdays, so we fall back to the plain day
 * count — the period-sync effect recomputes precisely once real dates are set.
 */
export function countActiveServiceDays(
  serviceDays: Record<string, boolean> | undefined | null,
  periodDays: number,
  start?: string | null,
  end?: string | null,
): number {
  const fullDays = Math.round(Number(periodDays) > 0 ? Number(periodDays) : 30);

  // No per-weekday restriction → active every day of the period.
  const hasRestriction =
    !!serviceDays && Object.values(serviceDays).some((v) => v === false);
  if (!hasRestriction) return fullDays;

  // Need concrete dates to enumerate weekdays; otherwise fall back.
  if (!start || !end) return fullDays;
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return fullDays;
  if (endDate < startDate) return fullDays;

  let count = 0;
  const cursor = new Date(startDate);
  // Guard against pathological ranges.
  let guard = 0;
  while (cursor <= endDate && guard < 3660) {
    const key = DAY_KEYS[cursor.getDay()];
    if (serviceDays![key] !== false) count += 1;
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return count;
}

export interface DeriveOptions {
  /** Total days in the billing period (drives duties for all-day services). */
  periodDays: number;
  /** Billing period start ISO date (YYYY-MM-DD), for enumerating active weekdays. */
  periodStart?: string | null;
  /** Billing period end ISO date (YYYY-MM-DD). */
  periodEnd?: string | null;
}

/**
 * Derive billing lines for one service TYPE from its service instances.
 *
 * Returns ONE line PER instance (not a single merged line), because different
 * instances can have different shift types, rates and — crucially — different
 * `serviceDays`, which produce different duty counts. Merging them would lose
 * that (a Sunday-only guard and an all-days guard bill different duties). This
 * matches how issued invoices already split the lines.
 *
 * For each instance:
 *   - woPricePerMonth = Σ(quantity × rate) over enabled shifts, ÷ headcount
 *     (the per-personnel monthly rate; a weighted average if shift rates differ)
 *   - duties          = headcount × active service-days in the period
 *
 * Instances with zero enabled manpower are skipped.
 */
export function deriveServiceLines(
  instances: ServiceInstanceLike[],
  fallbackShiftType: '8H' | '12H',
  opts: DeriveOptions,
): DerivedServiceLine[] {
  if (!Array.isArray(instances) || instances.length === 0) return [];

  const periodDays = Math.round(Number(opts.periodDays) > 0 ? Number(opts.periodDays) : 30);
  const out: DerivedServiceLine[] = [];

  for (const inst of instances) {
    const shiftType: '8H' | '12H' = inst?.shiftType === '12H' ? '12H' : fallbackShiftType;
    const s = inst?.shifts || {};

    let manpower = 0;
    let monthlyPrice = 0;

    if (s.day?.enabled) {
      const q = s.day.quantity || 0;
      manpower += q;
      monthlyPrice += q * parseRate(s.day.rate);
    }
    // Afternoon shift only applies to 8H rosters (12H has day + night).
    if (s.afternoon?.enabled && shiftType === '8H') {
      const q = s.afternoon.quantity || 0;
      manpower += q;
      monthlyPrice += q * parseRate(s.afternoon.rate);
    }
    if (s.night?.enabled) {
      const q = s.night.quantity || 0;
      manpower += q;
      monthlyPrice += q * parseRate(s.night.rate);
    }

    if (manpower === 0) continue;

    const perPersonnelMonthly = monthlyPrice > 0 ? monthlyPrice / manpower : 0;
    const activeDays = countActiveServiceDays(
      (inst as { serviceDays?: Record<string, boolean> })?.serviceDays,
      periodDays,
      opts.periodStart,
      opts.periodEnd,
    );

    out.push({
      totalManpower: manpower,
      shiftType,
      woPricePerMonth: perPersonnelMonthly > 0 ? Math.round(perPersonnelMonthly) : 0,
      duties: manpower * activeDays,
    });
  }

  return out;
}

/**
 * Number of days represented by a service period, used to drive a service
 * line's Days field (which in turn scales duties for a full month of service).
 *
 *  - Month mode: the calendar day count of that month (April 2026 → 30,
 *    Feb 2026 → 28, Feb 2028 → 29). Pass `YYYY-MM`.
 *  - Range mode: the INCLUSIVE day count between start and end ISO dates
 *    (`YYYY-MM-DD`), so 1 Apr → 30 Apr = 30 days.
 *
 * Returns null when the input is missing or unparseable, so callers can leave
 * the existing Days value untouched rather than blanking it.
 */
export function daysInServicePeriod(input: {
  mode: 'month' | 'range';
  month?: string | null;
  start?: string | null;
  end?: string | null;
}): number | null {
  if (input.mode === 'month') {
    if (!input.month) return null;
    const [y, m] = input.month.split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
    // Day 0 of the next month = last day of month m.
    return new Date(y, m, 0).getDate();
  }

  // Range mode: inclusive day count.
  if (!input.start || !input.end) return null;
  const start = new Date(`${input.start}T00:00:00`);
  const end = new Date(`${input.end}T00:00:00`);
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / 86_400_000) + 1;
}
