import { describe, expect, it } from 'vitest';
import { computeSettlement } from './payment-settlement';

/**
 * These tests pin the settlement rule that fixes the "short payment marked as
 * fully received" bug. The prior inline logic OR-ed a UI intent
 * (`paymentType === 'full'`) into the settlement decision, which let a payment
 * that did NOT cover the payable flip the invoice to `received`. Settlement is
 * now derived solely from the arithmetic.
 */
describe('computeSettlement', () => {
  it('marks fully paid when a single payment clears the payable', () => {
    // taxable 100000 + 18% GST = 118000; client pays 116000 cash + 2000 TDS.
    const r = computeSettlement({
      totalAmount: 118000,
      previousDue: 0,
      alreadyPaid: 0,
      amount: 116000,
      tds: 2000,
    });
    expect(r.totalPayable).toBe(118000);
    expect(r.newTotalPaid).toBe(118000);
    expect(r.balanceAmount).toBe(0);
    expect(r.fullyPaid).toBe(true);
  });

  it('does NOT mark fully paid when the collected amount is short (the bug)', () => {
    // Only 58000 cash + 1000 TDS = 59000 credited against 118000 payable.
    const r = computeSettlement({
      totalAmount: 118000,
      previousDue: 0,
      alreadyPaid: 0,
      amount: 58000,
      tds: 1000,
    });
    expect(r.balanceAmount).toBe(59000);
    // The old code would have returned fullyPaid=true if paymentType was 'full'.
    // The fix ties settlement to the money actually collected.
    expect(r.fullyPaid).toBe(false);
  });

  it('includes carried-forward previous balance in the payable', () => {
    // Own total 19352 + previous 4125 = 23477 payable. Client pays 19024 + 328 TDS.
    const r = computeSettlement({
      totalAmount: 19352,
      previousDue: 4125,
      alreadyPaid: 0,
      amount: 19024,
      tds: 328,
    });
    expect(r.totalPayable).toBe(23477);
    expect(r.newTotalPaid).toBe(19352);
    expect(r.balanceAmount).toBe(4125);
    expect(r.fullyPaid).toBe(false);
  });

  it('settles across multiple payments without double counting', () => {
    // First payment 58000 + 1000 TDS recorded, then the remainder clears it.
    const first = computeSettlement({
      totalAmount: 118000,
      previousDue: 0,
      alreadyPaid: 0,
      amount: 58000,
      tds: 1000,
    });
    expect(first.balanceAmount).toBe(59000);
    expect(first.fullyPaid).toBe(false);

    // alreadyPaid = the prior payment credited as (cash + tds) = 59000.
    const second = computeSettlement({
      totalAmount: 118000,
      previousDue: 0,
      alreadyPaid: 59000,
      amount: 58000,
      tds: 1000,
    });
    expect(second.newTotalPaid).toBe(118000);
    expect(second.balanceAmount).toBe(0);
    expect(second.fullyPaid).toBe(true);
  });

  it('treats a sub-paisa residual as settled (rounding tolerance)', () => {
    const r = computeSettlement({
      totalAmount: 1000,
      previousDue: 0,
      alreadyPaid: 0,
      amount: 999.995,
      tds: 0,
    });
    expect(r.fullyPaid).toBe(true);
  });

  it('never reports a negative balance', () => {
    const r = computeSettlement({
      totalAmount: 1000,
      previousDue: 0,
      alreadyPaid: 0,
      amount: 1500,
      tds: 0,
    });
    expect(r.balanceAmount).toBe(0);
    expect(r.fullyPaid).toBe(true);
  });
});
