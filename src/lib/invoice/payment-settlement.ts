/**
 * Payment-settlement decision — the single, testable source of truth for
 * "given what was collected, how much is still owed and is the invoice fully
 * settled?" used when recording a receipt against a receivable.
 *
 * WHY THIS EXISTS
 * ----------------
 * The receive-payment flow previously decided settlement inline as:
 *
 *     const fullyPaid = balanceAmount <= 0.01 || payment.paymentType === 'full';
 *
 * The `|| paymentType === 'full'` clause let a UI *intent* ("this is a full
 * payment") override the *arithmetic*. Because the receive dialog pre-fills
 * `paymentType: 'full'`, a user who edits the amount down to a short figure but
 * leaves the type as "full" would flip the invoice to `received` while a real
 * balance remained — silently dropping the receivable.
 *
 * Settlement is a financial fact, not a UI toggle: an invoice is fully paid iff
 * the money actually collected clears the payable (within a rounding tolerance).
 * This module encodes exactly that, and is unit-tested against the failing
 * scenarios.
 *
 * ACCOUNTING MODEL (gross)
 * ------------------------
 * `totalPayable` is the gross amount owed = the invoice's own total plus any
 * carried-forward previous balance. Each recorded payment contributes
 * `cash + tds` toward it, because TDS withheld by the client is deposited to
 * the government on the supplier's behalf and so settles that portion of the
 * invoice value. `alreadyPaid` is the sum of prior payments' `(cash + tds)`.
 */

import { fromPaise, LEDGER_EPSILON, toPaise } from './ledger';

/** Rounding tolerance: balances within one paisa are treated as cleared. */
export const SETTLEMENT_EPSILON = LEDGER_EPSILON;

export interface SettlementInput {
  /** Invoice's own total (GST-inclusive), excluding carried-forward previous balance. */
  totalAmount: number;
  /** Previous outstanding balance carried forward onto this invoice (0 when none). */
  previousDue: number;
  /** Sum of prior payments already recorded, each counted as (cash + tds). */
  alreadyPaid: number;
  /** Cash received in THIS payment. */
  amount: number;
  /** TDS withheld by the client in THIS payment. */
  tds: number;
}

export interface SettlementResult {
  /** Gross amount owed on the invoice = totalAmount + previousDue (>= 0). */
  totalPayable: number;
  /** Total credited after this payment = alreadyPaid + amount + tds. */
  newTotalPaid: number;
  /** Remaining balance, floored at 0. */
  balanceAmount: number;
  /** True iff the collected money clears the payable within SETTLEMENT_EPSILON. */
  fullyPaid: boolean;
  /**
   * Money credited beyond the payable. record_receipt refuses an overpayment,
   * so a caller must treat excess > 0 as an error, not as a settled invoice.
   */
  excess: number;
}

/**
 * Compute the balance and settlement status for a receipt.
 *
 * Settlement is derived SOLELY from the arithmetic: `fullyPaid` is true only
 * when the remaining balance is cleared (<= SETTLEMENT_EPSILON). A UI
 * "full payment" intent must NOT be passed here as a settlement override — a
 * payment is full only if it actually covers what is owed.
 */
export function computeSettlement(input: SettlementInput): SettlementResult {
  // Integer paise, rounded like the database, so no sub-paisa drift.
  const payable = Math.max(0, toPaise(input.totalAmount) + toPaise(input.previousDue));
  const credited = toPaise(input.alreadyPaid) + toPaise(input.amount) + toPaise(input.tds);
  const balance = Math.max(0, payable - credited);

  return {
    totalPayable: fromPaise(payable),
    newTotalPaid: fromPaise(credited),
    balanceAmount: fromPaise(balance),
    fullyPaid: fromPaise(balance) <= SETTLEMENT_EPSILON,
    excess: fromPaise(Math.max(0, credited - payable)),
  };
}
