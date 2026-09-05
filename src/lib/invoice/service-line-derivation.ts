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
  /** Total personnel across all enabled shifts on this line. */
  totalManpower: number;
  /** Effective shift type for the line ('12H' if any instance is 12H). */
  shiftType: '8H' | '12H';
  /** Monthly price PER PERSONNEL (weighted average when shift rates differ). 0 when no rate data. */
  woPricePerMonth: number;
  /** Total duties across all personnel for the billing period = manpower × days. */
  duties: number;
}

function parseRate(r: MonetaryRate): number {
  const n = typeof r === 'number' ? r : parseFloat(String(r ?? ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Derive the per-line billing figures for one service type from its array of
 * service instances and the number of days in the billing period.
 *
 * Returns null when the line has zero enabled manpower (nothing to bill).
 */
export function deriveServiceLine(
  instances: ServiceInstanceLike[],
  fallbackShiftType: '8H' | '12H',
  days: number,
): DerivedServiceLine | null {
  if (!Array.isArray(instances) || instances.length === 0) return null;

  const periodDays = Math.round(Number(days) > 0 ? Number(days) : 30);

  let totalManpower = 0;
  let monthlyPrice = 0; // summed line price = Σ quantity × rate over enabled shifts
  let shiftType: '8H' | '12H' = fallbackShiftType;

  for (const inst of instances) {
    // Any 12H instance makes the whole line 12H (day + night, no afternoon).
    shiftType = inst?.shiftType === '12H' ? '12H' : shiftType;
    const s = inst?.shifts || {};

    if (s.day?.enabled) {
      const q = s.day.quantity || 0;
      totalManpower += q;
      monthlyPrice += q * parseRate(s.day.rate);
    }
    // Afternoon shift only applies to 8H rosters.
    if (s.afternoon?.enabled && shiftType === '8H') {
      const q = s.afternoon.quantity || 0;
      totalManpower += q;
      monthlyPrice += q * parseRate(s.afternoon.rate);
    }
    if (s.night?.enabled) {
      const q = s.night.quantity || 0;
      totalManpower += q;
      monthlyPrice += q * parseRate(s.night.rate);
    }
  }

  if (totalManpower === 0) return null;

  const perPersonnelMonthly = monthlyPrice > 0 ? monthlyPrice / totalManpower : 0;

  return {
    totalManpower,
    shiftType,
    woPricePerMonth: perPersonnelMonthly > 0 ? Math.round(perPersonnelMonthly) : 0,
    duties: totalManpower * periodDays,
  };
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
