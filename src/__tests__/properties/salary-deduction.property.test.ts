import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateSalaryDeduction } from '@/utils/salaryDeduction';

/**
 * **Validates: Requirements 2.5**
 *
 * Feature: employee-self-service-hub, Property 2: Salary Deduction Calculation
 *
 * For any valid daily_rate > 0 and days > 0:
 *   deduction(daily_rate, days) = daily_rate × days
 *   deduction(daily_rate, 2 × days) = 2 × deduction(daily_rate, days)
 *
 * The salary deduction is a linear function of daily rate and leave days.
 */

describe('Property 2: Salary Deduction Calculation (Metamorphic)', () => {
  // Use realistic ranges for daily rates (₹100 to ₹10,000) and days (1 to 365)
  const dailyRateArb = fc.double({ min: 1, max: 10_000, noNaN: true, noDefaultInfinity: true });
  const daysArb = fc.integer({ min: 1, max: 365 });

  it('deduction equals daily_rate × days', () => {
    fc.assert(
      fc.property(dailyRateArb, daysArb, (dailyRate, days) => {
        const deduction = calculateSalaryDeduction(dailyRate, days);
        const expected = dailyRate * days;
        expect(deduction).toBeCloseTo(expected, 10);
      }),
      { numRuns: 100 }
    );
  });

  it('metamorphic: doubling the days doubles the deduction', () => {
    fc.assert(
      fc.property(
        dailyRateArb,
        fc.integer({ min: 1, max: 182 }), // max 182 so 2*days <= 365
        (dailyRate, days) => {
          const deductionSingle = calculateSalaryDeduction(dailyRate, days);
          const deductionDouble = calculateSalaryDeduction(dailyRate, 2 * days);
          expect(deductionDouble).toBeCloseTo(2 * deductionSingle, 10);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('deduction is always positive when rate > 0 and days > 0', () => {
    fc.assert(
      fc.property(dailyRateArb, daysArb, (dailyRate, days) => {
        const deduction = calculateSalaryDeduction(dailyRate, days);
        expect(deduction).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('linearity: deduction(rate, a + b) = deduction(rate, a) + deduction(rate, b)', () => {
    fc.assert(
      fc.property(
        dailyRateArb,
        fc.integer({ min: 1, max: 180 }),
        fc.integer({ min: 1, max: 180 }),
        (dailyRate, a, b) => {
          const deductionSum = calculateSalaryDeduction(dailyRate, a + b);
          const deductionA = calculateSalaryDeduction(dailyRate, a);
          const deductionB = calculateSalaryDeduction(dailyRate, b);
          // Use precision 8 to account for floating-point representation differences
          expect(deductionSum).toBeCloseTo(deductionA + deductionB, 8);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('identity: deduction(rate, 1) equals rate', () => {
    fc.assert(
      fc.property(dailyRateArb, (dailyRate) => {
        const deduction = calculateSalaryDeduction(dailyRate, 1);
        expect(deduction).toBeCloseTo(dailyRate, 10);
      }),
      { numRuns: 100 }
    );
  });

  it('returns 0 when dailyRate is 0 or negative', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -10_000, max: 0, noNaN: true, noDefaultInfinity: true }),
        daysArb,
        (invalidRate, days) => {
          const deduction = calculateSalaryDeduction(invalidRate, days);
          expect(deduction).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns 0 when days is 0 or negative', () => {
    fc.assert(
      fc.property(
        dailyRateArb,
        fc.integer({ min: -365, max: 0 }),
        (dailyRate, invalidDays) => {
          const deduction = calculateSalaryDeduction(dailyRate, invalidDays);
          expect(deduction).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
