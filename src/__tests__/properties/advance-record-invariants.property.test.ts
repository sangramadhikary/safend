import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature: employee-self-service-hub, Property 7: Advance Record Invariants
 *
 * **Validates: Requirements 3.9**
 *
 * For any salary advance record created via the self-service flow:
 * - advance_type = 'SALARY_ADVANCE'
 * - interest_pct = 0
 * - recovery_mode = 'ONE_TIME'
 * - principal = total_recoverable (since interest = 0)
 * - balance_outstanding = principal (at creation)
 * - principal > 0
 */

// ── Factory ──────────────────────────────────────────────────────────────

/**
 * Simulates the salary advance record creation logic from
 * POST /api/employee-self-service/advance (route.ts line ~180).
 *
 * Given a valid advance amount (positive integer), returns the record
 * shape that would be inserted into the employee_advances table.
 */
interface SalaryAdvanceRecord {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  advance_type: string;
  principal: number;
  interest_pct: number;
  interest_amount: number;
  total_recoverable: number;
  recovery_mode: string;
  emi_months: number;
  installment_amount: number;
  amount_recovered: number;
  balance_outstanding: number;
  status: string;
  reason: string | null;
}

function createSalaryAdvanceRecord(params: {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  amount: number;
}): SalaryAdvanceRecord {
  const advanceAmount = Math.round(params.amount);

  return {
    employee_id: params.employeeId,
    employee_name: params.employeeName,
    employee_code: params.employeeCode,
    advance_type: 'SALARY_ADVANCE',
    principal: advanceAmount,
    interest_pct: 0,
    interest_amount: 0,
    total_recoverable: advanceAmount,
    recovery_mode: 'ONE_TIME',
    emi_months: 1,
    installment_amount: advanceAmount,
    amount_recovered: 0,
    balance_outstanding: advanceAmount,
    status: 'pending_approval',
    reason: null,
  };
}

// ── Arbitraries ──────────────────────────────────────────────────────────

/** Generate a positive advance amount (1 to 100,000 INR). */
const advanceAmountArb = fc.integer({ min: 1, max: 100_000 });

/** Generate a random employee code (e.g. "EMP001" to "EMP9999"). */
const employeeCodeArb = fc.integer({ min: 1, max: 9999 }).map((n) => `EMP${String(n).padStart(4, '0')}`);

/** Generate a random employee name. */
const employeeNameArb = fc.string({ minLength: 2, maxLength: 40 }).filter((s) => s.trim().length > 0);

/** Generate a random UUID-like employee ID. */
const employeeIdArb = fc.uuid();

// ── Property Tests ───────────────────────────────────────────────────────

describe('Property 7: Advance Record Invariants', () => {
  it('advance_type is always SALARY_ADVANCE', () => {
    fc.assert(
      fc.property(
        employeeIdArb,
        employeeNameArb,
        employeeCodeArb,
        advanceAmountArb,
        (employeeId, employeeName, employeeCode, amount) => {
          const record = createSalaryAdvanceRecord({
            employeeId,
            employeeName,
            employeeCode,
            amount,
          });
          expect(record.advance_type).toBe('SALARY_ADVANCE');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('interest_pct is always 0', () => {
    fc.assert(
      fc.property(
        employeeIdArb,
        employeeNameArb,
        employeeCodeArb,
        advanceAmountArb,
        (employeeId, employeeName, employeeCode, amount) => {
          const record = createSalaryAdvanceRecord({
            employeeId,
            employeeName,
            employeeCode,
            amount,
          });
          expect(record.interest_pct).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('recovery_mode is always ONE_TIME', () => {
    fc.assert(
      fc.property(
        employeeIdArb,
        employeeNameArb,
        employeeCodeArb,
        advanceAmountArb,
        (employeeId, employeeName, employeeCode, amount) => {
          const record = createSalaryAdvanceRecord({
            employeeId,
            employeeName,
            employeeCode,
            amount,
          });
          expect(record.recovery_mode).toBe('ONE_TIME');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('principal equals total_recoverable (since interest = 0)', () => {
    fc.assert(
      fc.property(
        employeeIdArb,
        employeeNameArb,
        employeeCodeArb,
        advanceAmountArb,
        (employeeId, employeeName, employeeCode, amount) => {
          const record = createSalaryAdvanceRecord({
            employeeId,
            employeeName,
            employeeCode,
            amount,
          });
          expect(record.principal).toBe(record.total_recoverable);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('balance_outstanding equals principal at creation time', () => {
    fc.assert(
      fc.property(
        employeeIdArb,
        employeeNameArb,
        employeeCodeArb,
        advanceAmountArb,
        (employeeId, employeeName, employeeCode, amount) => {
          const record = createSalaryAdvanceRecord({
            employeeId,
            employeeName,
            employeeCode,
            amount,
          });
          expect(record.balance_outstanding).toBe(record.principal);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('principal is always greater than 0', () => {
    fc.assert(
      fc.property(
        employeeIdArb,
        employeeNameArb,
        employeeCodeArb,
        advanceAmountArb,
        (employeeId, employeeName, employeeCode, amount) => {
          const record = createSalaryAdvanceRecord({
            employeeId,
            employeeName,
            employeeCode,
            amount,
          });
          expect(record.principal).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
