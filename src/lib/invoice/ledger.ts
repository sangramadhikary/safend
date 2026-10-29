/**
 * Invoice ledger arithmetic for the UI.
 *
 * The database is the source of truth (supabase/migrations/
 * 20261029000000_invoice_ledger_integrity.sql): every receipt is stored as
 * allocation rows in receivable_payments, and receivables.paid_amount,
 * tds_credited and credit_applied are maintained from them by trigger. This
 * module only mirrors those rules so screens can show balances and preview a
 * receipt before it is recorded. record_receipt re-checks everything.
 *
 *   balance = total_amount + opening_balance − paid_amount
 *
 * paid_amount counts cash + TDS + credit notes applied. opening_balance holds
 * dues carried onto an invoice that have no invoice row of their own; dues that
 * do have a row stay owed on that older invoice.
 *
 * All sums are done in integer paise so ₹0.01 differences cannot accumulate.
 */

/** Balances within one paisa are treated as settled (same as the database). */
export const LEDGER_EPSILON = 0.01;

/** Sec 194C rate for a company contractor, used as the TDS cap when an invoice has no rate. */
export const DEFAULT_TDS_CAP_RATE = 2;

/** Rupees → integer paise, rounding half away from zero like Postgres round(). */
export function toPaise(value: unknown): number {
  const v = Number(value);
  if (!Number.isFinite(v)) return 0;
  const scaled = Number((Math.abs(v) * 100).toFixed(6));
  return Math.sign(v) * Math.round(scaled);
}

/** Integer paise → rupees (never returns -0). */
export function fromPaise(paise: number): number {
  return paise / 100 || 0;
}

/** Round to 2 decimals the way the database does. */
export function round2(value: unknown): number {
  return fromPaise(toPaise(value));
}

/** Sum amounts exactly (in paise) and return rupees. */
export function sumMoney(values: Iterable<unknown>): number {
  let total = 0;
  for (const v of values) total += toPaise(v);
  return fromPaise(total);
}

/** The receivables columns the ledger rules read. Numeric columns may arrive as strings. */
export interface LedgerRow {
  id?: string;
  category?: string | null;
  status?: string | null;
  reference_number?: string | null;
  created_at?: string | null;
  /** Taxable value (pre-GST). */
  amount?: number | string | null;
  total_amount?: number | string | null;
  opening_balance?: number | string | null;
  paid_amount?: number | string | null;
  tds_credited?: number | string | null;
  credit_applied?: number | string | null;
  tds_rate?: number | string | null;
}

/** total + opening balance − everything credited. Negative when overpaid or for credit notes. */
export function invoiceBalance(row: LedgerRow): number {
  return fromPaise(toPaise(row.total_amount) + toPaise(row.opening_balance) - toPaise(row.paid_amount));
}

/**
 * What the row still contributes to receivables. Cancelled and received rows
 * contribute nothing (the database only reaches 'received' when the balance is
 * cleared). Open credit notes stay negative so totals net them off.
 */
export function outstandingAmount(row: LedgerRow): number {
  if (row.status === 'cancelled' || row.status === 'received') return 0;
  return invoiceBalance(row);
}

/** Amount the client still has to pay on this row (never negative). */
export function amountDue(row: LedgerRow): number {
  return Math.max(0, outstandingAmount(row));
}

/** Everything credited so far (cash + TDS), excluding credit notes. */
export function amountReceived(row: LedgerRow): number {
  return fromPaise(toPaise(row.paid_amount) - toPaise(row.credit_applied));
}

/** Cash actually received so far (excludes TDS and credit notes). */
export function cashReceived(row: LedgerRow): number {
  return fromPaise(toPaise(row.paid_amount) - toPaise(row.credit_applied) - toPaise(row.tds_credited));
}

/** True when some payment is recorded and money is still owed. */
export function isPartlyPaid(row: LedgerRow): boolean {
  return toPaise(row.paid_amount) > 0 && amountDue(row) > LEDGER_EPSILON;
}

/** True when the row owes more than it was billed for, e.g. a legacy receipt not yet re-attributed. */
export function isOverpaid(row: LedgerRow): boolean {
  return row.status !== 'cancelled' && (row.category ?? 'Invoices') === 'Invoices'
    && invoiceBalance(row) < -LEDGER_EPSILON;
}

function taxableValue(row: LedgerRow): number {
  const taxable = toPaise(row.amount);
  return taxable > 0 ? taxable : toPaise(row.total_amount);
}

/**
 * Most TDS that can still be credited on this invoice: its TDS rate (at least
 * the 2% Sec 194C rate) on the taxable value, less TDS already credited. The
 * database allows ₹1 of rounding slack on top of this.
 */
export function tdsCap(row: LedgerRow): number {
  const rate = Math.max(Number(row.tds_rate) || 0, DEFAULT_TDS_CAP_RATE);
  const cap = Math.round((taxableValue(row) * rate) / 100) - toPaise(row.tds_credited);
  return fromPaise(Math.max(0, cap));
}

/**
 * TDS to pre-fill for the next receipt: the invoice's own TDS rate on its
 * taxable value, less TDS already credited, never more than is still due.
 * Returns 0 when the invoice has no TDS rate, or when an earlier payment was
 * recorded without its TDS (legacy rows), because the remaining TDS is then
 * unknown and guessing it closed invoices short.
 */
export function suggestedTds(row: LedgerRow, opts: { legacyTdsUnknown?: boolean } = {}): number {
  const rate = Number(row.tds_rate) || 0;
  if (rate <= 0 || opts.legacyTdsUnknown) return 0;
  const expected = Math.round((taxableValue(row) * rate) / 100) - toPaise(row.tds_credited);
  return fromPaise(Math.max(0, Math.min(expected, toPaise(amountDue(row)))));
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export interface ReceiptAllocation {
  id: string;
  referenceNumber: string | null;
  cash: number;
  tds: number;
  outstandingBefore: number;
  outstandingAfter: number;
}

export interface ReceiptPlan {
  allocations: ReceiptAllocation[];
  /** Cash left over after every selected invoice is cleared (an overpayment). */
  leftover: number;
  /** Cash + TDS applied across all invoices. */
  total: number;
  /** Balance left on the target invoice after this receipt. */
  targetBalanceAfter: number;
  /** Problems record_receipt would reject. Empty when the receipt can be saved. */
  errors: string[];
}

export interface ReceiptPlanInput {
  /** The invoice the receipt is recorded against; it is paid last. */
  target: LedgerRow & { id: string };
  /** Older invoices of the same client this receipt also pays, oldest first. */
  carried?: Array<LedgerRow & { id: string }>;
  /** Cash (or cheque/bank amount) received. */
  cash: number;
  /** TDS withheld per invoice id. */
  tds?: Record<string, number>;
}

/** Oldest first, the same order record_receipt allocates in. */
export function sortOldestFirst<T extends LedgerRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
    || String(a.reference_number ?? '').localeCompare(String(b.reference_number ?? '')));
}

/**
 * Preview how a receipt will be allocated. Mirrors record_receipt: cash goes to
 * the carried invoices oldest first and to the target last; each invoice takes
 * at most what it still owes after its own TDS; anything left over is an
 * overpayment and is refused.
 */
export function planReceipt(input: ReceiptPlanInput): ReceiptPlan {
  const errors: string[] = [];
  const carried = sortOldestFirst((input.carried ?? []).filter((r) => r.id !== input.target.id));
  const ordered = [...carried, input.target];
  let remaining = Math.max(0, toPaise(input.cash));
  if (toPaise(input.cash) < 0) errors.push('The amount received cannot be negative.');
  const allocations: ReceiptAllocation[] = [];
  let total = 0;

  for (const row of ordered) {
    const ref = row.reference_number ?? null;
    const out = row.status === 'received' ? 0 : Math.max(0, toPaise(invoiceBalance(row)));
    const tds = toPaise(input.tds?.[row.id] ?? 0);
    if (tds < 0) errors.push('TDS cannot be negative.');
    if (tds > 0) {
      const cap = toPaise(tdsCap(row));
      if (tds > cap + 100) {
        errors.push(`TDS of ${rupees(fromPaise(tds))} on invoice ${ref ?? ''} is more than can apply to it (at most ${rupees(fromPaise(cap))}).`);
      } else if (tds > out) {
        errors.push(`TDS of ${rupees(fromPaise(tds))} is more than invoice ${ref ?? ''} still owes (${rupees(fromPaise(out))}).`);
      }
    }
    const cash = Math.min(remaining, Math.max(out - Math.max(tds, 0), 0));
    remaining -= cash;
    if (cash > 0 || tds > 0) {
      allocations.push({
        id: row.id, referenceNumber: ref, cash: fromPaise(cash), tds: fromPaise(Math.max(tds, 0)),
        outstandingBefore: fromPaise(out), outstandingAfter: fromPaise(out - cash - Math.max(tds, 0)),
      });
      total += cash + Math.max(tds, 0);
    }
  }

  if (remaining > 0) {
    errors.push(`OVERPAYMENT: ${rupees(fromPaise(remaining))} is more than the selected invoices owe. Reduce the amount, or tick the older invoices this payment also covers.`);
  }
  if (total <= 0 && errors.length === 0) errors.push('Nothing to record: enter the amount received.');

  const targetAlloc = allocations.find((a) => a.id === input.target.id);
  const targetBefore = input.target.status === 'received' ? 0 : Math.max(0, toPaise(invoiceBalance(input.target)));
  return {
    allocations,
    leftover: fromPaise(remaining),
    total: fromPaise(total),
    targetBalanceAfter: targetAlloc ? targetAlloc.outstandingAfter : fromPaise(targetBefore),
    errors,
  };
}

/**
 * Split a typed "previous due" into what is already owed on the included older
 * invoices (they stay the debtors of their own balances) and the remainder,
 * which becomes this invoice's opening_balance (dues with no invoice on file).
 * A figure lower than the included invoices still owe is rejected: those
 * balances are real and cannot be shrunk by typing a smaller number.
 */
export function resolvePreviousDue(typed: number, includedTotal: number): { openingBalance: number; error: string | null } {
  const typedP = Math.max(0, toPaise(typed));
  const includedP = Math.max(0, toPaise(includedTotal));
  // Up to ₹1 short is whole-rupee rounding of the included balances, not a smaller due.
  if (typedP < includedP && includedP - typedP <= 100) return { openingBalance: 0, error: null };
  if (typedP < includedP) {
    return {
      openingBalance: 0,
      error: `Previous due ${rupees(fromPaise(typedP))} is less than the ${rupees(fromPaise(includedP))} still owed on the included invoices. Untick an invoice or correct the amount.`,
    };
  }
  return { openingBalance: fromPaise(typedP - includedP), error: null };
}

/** Annual MSME delayed-payment interest rate (3 × RBI bank rate) when configured, else null. */
export function msmeInterestRate(): number | null {
  const rate = Number(process.env.NEXT_PUBLIC_MSME_INTEREST_ANNUAL_RATE);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * Interest accrued on an overdue balance under MSMED Act s.16: compound
 * interest with monthly rests at the configured annual rate, from the day after
 * the due date. Display only; it is never added to the invoice.
 */
export function lateInterest(balance: number, dueDate: string | null | undefined, asOf: Date, annualRate: number | null): number {
  if (!annualRate || !dueDate || balance <= LEDGER_EPSILON) return 0;
  const due = new Date(`${dueDate.slice(0, 10)}T00:00:00`);
  const days = Math.floor((asOf.getTime() - due.getTime()) / 86_400_000);
  if (!Number.isFinite(days) || days <= 0) return 0;
  const monthly = annualRate / 1200;
  const months = Math.floor(days / 30);
  const restDays = days - months * 30;
  const grown = balance * Math.pow(1 + monthly, months) * (1 + (monthly * restDays) / 30);
  return round2(grown - balance);
}
