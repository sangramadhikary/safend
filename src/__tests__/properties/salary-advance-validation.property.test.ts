import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { HR_CONFIG } from '@/config';

/**
 * Feature: employee-self-service-hub, Property 3: Salary Advance Amount Cap
 *
 * For any salary advance request, the requested amount must never exceed 50% of
 * the accumulated salary for the current month and must be greater than zero.
 *
 * ∀ request:
 *   request.amount ≤ accumulated_salary × 0.50
 *   request.amount > 0
 *
 * Validates: Requirements 3.2, 3.3
 */

/**
 * Feature: employee-self-service-hub, Property 4: Salary Advance Monthly Limit and Gap
 *
 * For any employee in any given month, the total number of salary advance submissions
 * must not exceed 3, and the gap between any two consecutive requests must be ≥ 7 days.
 *
 * ∀ employee, ∀ month:
 *   count(requests_in_month) ≤ 3
 *
 * ∀ consecutive requests r1, r2 for same employee:
 *   r2.date - r1.date ≥ 7 days
 *
 * Validates: Requirements 3.4, 3.5, 3.6, 3.7
 */

// ── Pure validation logic extracted from the advance API route ────────────

const MAX_PERCENT_OF_ACCUMULATED = HR_CONFIG.SALARY_ADVANCE.MAX_PERCENT_OF_ACCUMULATED; // 50
const MAX_REQUESTS_PER_MONTH = HR_CONFIG.SALARY_ADVANCE.MAX_REQUESTS_PER_MONTH; // 3
const MIN_GAP_DAYS = HR_CONFIG.SALARY_ADVANCE.MIN_GAP_DAYS; // 7

/**
 * Validates that a salary advance amount is within allowed bounds.
 * Returns { valid: true } if the amount passes, { valid: false, reason: string } otherwise.
 */
function validateAdvanceAmount(
  amount: number,
  accumulatedSalary: number
): { valid: boolean; reason?: string } {
  if (amount <= 0) {
    return { valid: false, reason: 'amount must be greater than zero' };
  }

  const maxAdvance = Math.floor(accumulatedSalary * (MAX_PERCENT_OF_ACCUMULATED / 100));

  if (maxAdvance <= 0) {
    return { valid: false, reason: 'No salary accumulated yet' };
  }

  if (amount > maxAdvance) {
    return { valid: false, reason: `Amount exceeds maximum allowed (₹${maxAdvance})` };
  }

  return { valid: true };
}

/**
 * Validates whether a new advance request is allowed given the monthly count.
 * Returns true if the request is allowed (count < max).
 */
function validateMonthlyLimit(requestsThisMonth: number): boolean {
  return requestsThisMonth < MAX_REQUESTS_PER_MONTH;
}

/**
 * Validates the minimum gap between consecutive advance requests.
 * @param lastRequestDate - The date (YYYY-MM-DD) of the last request
 * @param currentDate - The current date (YYYY-MM-DD)
 * @returns true if the gap is sufficient (≥ 7 days)
 */
function validateMinGap(lastRequestDate: string, currentDate: string): boolean {
  const last = new Date(lastRequestDate + 'T00:00:00');
  const current = new Date(currentDate + 'T00:00:00');
  const diffMs = current.getTime() - last.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= MIN_GAP_DAYS;
}

/**
 * Calculate the day difference between two YYYY-MM-DD date strings.
 */
function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + 'T00:00:00');
  const b = new Date(dateB + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Property Tests ───────────────────────────────────────────────────────

describe('Feature: employee-self-service-hub, Property 3: Salary Advance Amount Cap', () => {
  it('any valid advance amount must be > 0 and ≤ 50% of accumulated salary', () => {
    fc.assert(
      fc.property(
        // Generate accumulated salary: positive number representing earned salary this month
        fc.integer({ min: 1, max: 500_000 }),
        // Generate a request amount: any positive number up to accumulated salary
        fc.integer({ min: 1, max: 500_000 }),
        (accumulatedSalary, requestAmount) => {
          const maxAdvance = Math.floor(
            accumulatedSalary * (MAX_PERCENT_OF_ACCUMULATED / 100)
          );

          const result = validateAdvanceAmount(requestAmount, accumulatedSalary);

          if (requestAmount > 0 && requestAmount <= maxAdvance && maxAdvance > 0) {
            // Should be valid
            expect(result.valid).toBe(true);
          } else {
            // Should be rejected
            expect(result.valid).toBe(false);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('amount ≤ 0 is always rejected regardless of accumulated salary', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500_000 }), // accumulated salary
        fc.integer({ min: -100_000, max: 0 }), // non-positive amount
        (accumulatedSalary, amount) => {
          const result = validateAdvanceAmount(amount, accumulatedSalary);
          expect(result.valid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('amount exactly at 50% cap boundary is accepted', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 500_000 }), // accumulated salary (min 2 to ensure maxAdvance > 0)
        (accumulatedSalary) => {
          const maxAdvance = Math.floor(
            accumulatedSalary * (MAX_PERCENT_OF_ACCUMULATED / 100)
          );

          // Amount exactly at cap should be valid
          if (maxAdvance > 0) {
            const result = validateAdvanceAmount(maxAdvance, accumulatedSalary);
            expect(result.valid).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('amount 1 above the 50% cap is always rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 500_000 }), // accumulated salary
        (accumulatedSalary) => {
          const maxAdvance = Math.floor(
            accumulatedSalary * (MAX_PERCENT_OF_ACCUMULATED / 100)
          );

          if (maxAdvance > 0) {
            const result = validateAdvanceAmount(maxAdvance + 1, accumulatedSalary);
            expect(result.valid).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: employee-self-service-hub, Property 4: Salary Advance Monthly Limit and Gap', () => {
  it('monthly request count must never exceed 3 — requests beyond limit are rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }), // requests already made this month
        (requestsThisMonth) => {
          const allowed = validateMonthlyLimit(requestsThisMonth);

          if (requestsThisMonth < MAX_REQUESTS_PER_MONTH) {
            expect(allowed).toBe(true);
          } else {
            expect(allowed).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('gap between consecutive requests must be ≥ 7 days — requests within gap are rejected', () => {
    fc.assert(
      fc.property(
        // Generate a last request date within a reasonable range
        fc.integer({ min: 2024, max: 2026 }), // year
        fc.integer({ min: 1, max: 12 }), // month
        fc.integer({ min: 1, max: 28 }), // day (safe for all months)
        fc.integer({ min: 0, max: 30 }), // days since last request
        (year, month, day, gapDays) => {
          const lastDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

          // Calculate current date by adding gapDays to lastDate
          const lastDateObj = new Date(lastDate + 'T00:00:00');
          lastDateObj.setDate(lastDateObj.getDate() + gapDays);
          const currentDate = `${lastDateObj.getFullYear()}-${String(lastDateObj.getMonth() + 1).padStart(2, '0')}-${String(lastDateObj.getDate()).padStart(2, '0')}`;

          const allowed = validateMinGap(lastDate, currentDate);

          if (gapDays >= MIN_GAP_DAYS) {
            expect(allowed).toBe(true);
          } else {
            expect(allowed).toBe(false);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('a sequence of advance requests respecting both limits is always valid', () => {
    // Generate a sequence of up to 3 requests within a month, each ≥ 7 days apart
    const advanceRequestSequenceArb = fc
      .integer({ min: 1, max: 3 }) // number of requests (1 to 3)
      .chain((count) =>
        fc.tuple(
          fc.constant(count),
          // Generate gap days between requests (each ≥ 7)
          fc.array(fc.integer({ min: 7, max: 28 }), {
            minLength: Math.max(0, count - 1),
            maxLength: Math.max(0, count - 1),
          }),
          // Starting day of month (1-7 to ensure we stay in same month for small gaps)
          fc.integer({ min: 1, max: 3 })
        )
      );

    fc.assert(
      fc.property(advanceRequestSequenceArb, ([count, gaps, startDay]) => {
        // Build the sequence of request dates within January 2025
        const dates: string[] = [];
        let currentDay = startDay;

        dates.push(`2025-01-${String(currentDay).padStart(2, '0')}`);

        for (const gap of gaps) {
          currentDay += gap;
          if (currentDay > 31) return; // skip if out of month bounds
          dates.push(`2025-01-${String(currentDay).padStart(2, '0')}`);
        }

        // Verify: count ≤ 3
        expect(dates.length).toBeLessThanOrEqual(MAX_REQUESTS_PER_MONTH);

        // Verify: all consecutive gaps ≥ 7 days
        for (let i = 1; i < dates.length; i++) {
          const gap = daysBetween(dates[i - 1], dates[i]);
          expect(gap).toBeGreaterThanOrEqual(MIN_GAP_DAYS);
        }

        // Verify validation functions agree
        expect(validateMonthlyLimit(dates.length - 1)).toBe(true); // before last request
        for (let i = 1; i < dates.length; i++) {
          expect(validateMinGap(dates[i - 1], dates[i])).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('4th request in a month is always rejected regardless of gap', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 10 }), // requests already at or above limit
        (requestsThisMonth) => {
          const allowed = validateMonthlyLimit(requestsThisMonth);
          expect(allowed).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
