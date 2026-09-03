/**
 * Contracted rate basis — how a monthly contract price converts into a per-duty rate.
 *
 * This used to be guessed, in two places, inconsistently:
 *   · OneTimeInvoiceForm inferred a monthly price as `dayRate * 26`
 *   · calculations.ts then divided that price by `days || 30` (calendar days)
 * so a 26-day contract was silently billed on a 31-day divisor.
 *
 * The divisor is a commercial term, not a system default, so it now travels with
 * the contract: it is set on the work order and snapshotted onto every invoice
 * line raised against it.
 *
 * Duties served in excess of the contracted basis bill at the SAME per-duty rate
 * (there is no cap at the monthly price) — e.g. 31 duties on a 26-day contract
 * bills 31 × (price ÷ 26). `exceedsBasis` is surfaced for display only.
 */

export type RateBasis = 'calendar_month' | 'fixed_days' | 'per_duty';

export const DEFAULT_RATE_BASIS: RateBasis = 'calendar_month';

/** Conventional fixed-day divisor in Indian manpower contracts (26-day month). */
export const CONVENTIONAL_BASIS_DAYS = 26;

export const RATE_BASIS_OPTIONS: {
  value: RateBasis;
  label: string;
  hint: string;
  /** Whether `basisDays` must be supplied alongside. */
  needsBasisDays: boolean;
}[] = [
  {
    value: 'calendar_month',
    label: 'Calendar month',
    hint: 'Monthly price ÷ actual days in the billed month (28/29/30/31).',
    needsBasisDays: false,
  },
  {
    value: 'fixed_days',
    label: 'Fixed days per month',
    hint: 'Monthly price ÷ an agreed fixed figure (commonly 26), whatever the month.',
    needsBasisDays: true,
  },
  {
    value: 'per_duty',
    label: 'Per duty rate',
    hint: 'The contract states the per-duty rate directly — nothing is divided.',
    needsBasisDays: false,
  },
];

export function rateBasisLabel(basis: RateBasis | null | undefined): string {
  return RATE_BASIS_OPTIONS.find((o) => o.value === basis)?.label ?? 'Not set';
}

/** Calendar days in the month of a DD/MM/YYYY, DD-MM-YYYY or ISO date string. */
export function daysInMonthOf(dateStr?: string | null): number {
  if (dateStr) {
    const parts = String(dateStr).split(/[/\-.]/);
    // DD/MM/YYYY — the format the invoice header uses
    if (parts.length === 3 && parts[0].length <= 2) {
      const m = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      if (m >= 1 && m <= 12 && y > 1900) return new Date(y, m, 0).getDate();
    }
    const d = new Date(dateStr);
    if (!Number.isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

export interface RateBasisInput {
  basis?: RateBasis | null;
  /** Required when basis is 'fixed_days'. */
  basisDays?: number | null;
  /** Start of the billed service period (ISO). Preferred source for 'calendar_month'. */
  periodStart?: string | null;
  /** Invoice date, used for 'calendar_month' when no service period is recorded. */
  invoiceDate?: string | null;
  /**
   * Legacy per-line divisor. Only consulted when `basis` is absent, so invoices
   * raised before rate basis existed keep rendering exactly as they were issued.
   */
  legacyDays?: number | null;
}

export interface ResolvedRateBasis {
  /** What the contract price is divided by. 1 for a per-duty contract. */
  divisor: number;
  basis: RateBasis;
  /** True when `basis` was absent and the legacy divisor was used. */
  isLegacy: boolean;
  /** Human-readable divisor for printing, e.g. "26 days", "31 days", "per duty". */
  divisorLabel: string;
}

/**
 * Resolves the divisor for a line.
 *
 * Returns `divisor: 0` when the basis is `fixed_days` with no usable
 * `basisDays` — callers must treat that as "cannot bill this line" rather than
 * substituting a default, because guessing a divisor is a pricing error.
 */
export function resolveRateBasis(input: RateBasisInput): ResolvedRateBasis {
  const { basis, basisDays, periodStart, invoiceDate, legacyDays } = input;

  if (!basis) {
    const legacy = Number(legacyDays) || 0;
    const divisor = legacy > 0 ? legacy : daysInMonthOf(invoiceDate);
    return {
      divisor,
      basis: 'calendar_month',
      isLegacy: true,
      divisorLabel: `${divisor} days`,
    };
  }

  if (basis === 'per_duty') {
    return { divisor: 1, basis, isLegacy: false, divisorLabel: 'per duty' };
  }

  if (basis === 'fixed_days') {
    const d = Number(basisDays) || 0;
    return {
      divisor: d > 0 ? d : 0,
      basis,
      isLegacy: false,
      divisorLabel: d > 0 ? `${d} days` : 'basis days not set',
    };
  }

  const d = daysInMonthOf(periodStart || invoiceDate);
  return { divisor: d, basis, isLegacy: false, divisorLabel: `${d} days` };
}

/**
 * Printable derivation shown beneath the rate on the invoice, so a reader can
 * reproduce the figure. This is what makes the line verifiable on its face.
 *   fixed_days      → "₹16,000 ÷ 26"
 *   calendar_month  → "₹16,000 ÷ 31"
 *   per_duty        → "contracted per duty"
 */
export function describeRateDerivation(
  contractPrice: number,
  resolved: ResolvedRateBasis,
  formatter: (n: number) => string = (n) => n.toLocaleString('en-IN')
): string {
  if (resolved.basis === 'per_duty') return 'contracted per duty';
  if (!resolved.divisor) return 'basis not set';
  return `\u20B9${formatter(contractPrice)} \u00F7 ${resolved.divisor}`;
}

/** True when duties billed exceed the contracted basis (display hint only). */
export function exceedsBasis(duties: number, resolved: ResolvedRateBasis): boolean {
  if (resolved.basis === 'per_duty' || !resolved.divisor) return false;
  return Number(duties) > resolved.divisor;
}
