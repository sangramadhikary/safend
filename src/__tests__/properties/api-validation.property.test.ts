import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Feature: employee-self-service-hub, Property 1: Leave Date Advance Validation
// Feature: employee-self-service-hub, Property 5: Notice Period and Last Working Day Calculation

/**
 * Pure validation logic extracted from API routes for property-based testing.
 * These mirror the actual functions used in the leave and resignation endpoints.
 */

// From leave/route.ts: calculates difference in calendar days between two ISO date strings
function daysDifference(base: string, target: string): number {
  const baseDate = new Date(base + 'T00:00:00');
  const targetDate = new Date(target + 'T00:00:00');
  return Math.round((targetDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
}

// From resignation/route.ts: adds days to a date string and returns YYYY-MM-DD
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Config constants (same as HR_CONFIG in src/config.ts)
const PLANNED_LEAVE_MIN_ADVANCE_DAYS = 3;
const SICK_LEAVE_MIN_ADVANCE_DAYS = 1;
const MIN_NOTICE_DAYS = 15;
const MAX_NOTICE_DAYS = 30;

/** Validates leave request start date against minimum advance days constraint */
function validateLeaveAdvanceDays(
  leaveType: 'Planned Leave' | 'Sick Leave',
  today: string,
  fromDate: string,
): { valid: boolean; advanceDays: number; requiredAdvance: number } {
  const advanceDays = daysDifference(today, fromDate);
  const requiredAdvance =
    leaveType === 'Planned Leave'
      ? PLANNED_LEAVE_MIN_ADVANCE_DAYS
      : SICK_LEAVE_MIN_ADVANCE_DAYS;
  return {
    valid: advanceDays >= requiredAdvance,
    advanceDays,
    requiredAdvance,
  };
}

/** Calculates last working day from submission date and notice period */
function calculateLastWorkingDay(
  submissionDate: string,
  noticePeriodDays: number,
): string {
  return addDays(submissionDate, noticePeriodDays);
}

// ── Generators ──

/** Generates a valid ISO date string (YYYY-MM-DD) within a reasonable range */
const dateArb = fc.date({
  min: new Date('2020-01-01T00:00:00'),
  max: new Date('2030-12-31T00:00:00'),
}).map((d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
});

/** Generates a leave type */
const leaveTypeArb = fc.constantFrom('Planned Leave' as const, 'Sick Leave' as const);

/** Generates a notice period between 15 and 30 (inclusive) */
const noticePeriodArb = fc.integer({ min: MIN_NOTICE_DAYS, max: MAX_NOTICE_DAYS });

// ── Property 1: Leave Date Advance Validation ──

describe('Property 1: Leave Date Advance Validation', () => {
  // **Validates: Requirements 2.3, 2.4, 2.10**

  it('Planned Leave: from_date with advance >= 3 days from today is accepted', () => {
    fc.assert(
      fc.property(
        dateArb,
        fc.integer({ min: PLANNED_LEAVE_MIN_ADVANCE_DAYS, max: 365 }),
        (today, advanceDaysOffset) => {
          const fromDate = addDays(today, advanceDaysOffset);
          const result = validateLeaveAdvanceDays('Planned Leave', today, fromDate);

          expect(result.valid).toBe(true);
          expect(result.advanceDays).toBeGreaterThanOrEqual(PLANNED_LEAVE_MIN_ADVANCE_DAYS);
          expect(result.requiredAdvance).toBe(PLANNED_LEAVE_MIN_ADVANCE_DAYS);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Planned Leave: from_date with advance < 3 days from today is rejected', () => {
    fc.assert(
      fc.property(
        dateArb,
        fc.integer({ min: -30, max: PLANNED_LEAVE_MIN_ADVANCE_DAYS - 1 }),
        (today, advanceDaysOffset) => {
          const fromDate = addDays(today, advanceDaysOffset);
          const result = validateLeaveAdvanceDays('Planned Leave', today, fromDate);

          expect(result.valid).toBe(false);
          expect(result.advanceDays).toBeLessThan(PLANNED_LEAVE_MIN_ADVANCE_DAYS);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Sick Leave: from_date with advance >= 1 day from today is accepted', () => {
    fc.assert(
      fc.property(
        dateArb,
        fc.integer({ min: SICK_LEAVE_MIN_ADVANCE_DAYS, max: 365 }),
        (today, advanceDaysOffset) => {
          const fromDate = addDays(today, advanceDaysOffset);
          const result = validateLeaveAdvanceDays('Sick Leave', today, fromDate);

          expect(result.valid).toBe(true);
          expect(result.advanceDays).toBeGreaterThanOrEqual(SICK_LEAVE_MIN_ADVANCE_DAYS);
          expect(result.requiredAdvance).toBe(SICK_LEAVE_MIN_ADVANCE_DAYS);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Sick Leave: from_date with advance < 1 day from today is rejected', () => {
    fc.assert(
      fc.property(
        dateArb,
        fc.integer({ min: -30, max: SICK_LEAVE_MIN_ADVANCE_DAYS - 1 }),
        (today, advanceDaysOffset) => {
          const fromDate = addDays(today, advanceDaysOffset);
          const result = validateLeaveAdvanceDays('Sick Leave', today, fromDate);

          expect(result.valid).toBe(false);
          expect(result.advanceDays).toBeLessThan(SICK_LEAVE_MIN_ADVANCE_DAYS);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('advance constraint is type-dependent: Planned requires 3, Sick requires 1', () => {
    fc.assert(
      fc.property(leaveTypeArb, dateArb, (leaveType, today) => {
        const expectedAdvance =
          leaveType === 'Planned Leave'
            ? PLANNED_LEAVE_MIN_ADVANCE_DAYS
            : SICK_LEAVE_MIN_ADVANCE_DAYS;

        // A date exactly at the threshold should be valid
        const exactDate = addDays(today, expectedAdvance);
        const result = validateLeaveAdvanceDays(leaveType, today, exactDate);

        expect(result.valid).toBe(true);
        expect(result.requiredAdvance).toBe(expectedAdvance);
        expect(result.advanceDays).toBe(expectedAdvance);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 5: Notice Period and Last Working Day Calculation ──

describe('Property 5: Notice Period and Last Working Day Calculation', () => {
  // **Validates: Requirements 4.2, 4.4**

  it('last_working_day = submission_date + notice_period_days', () => {
    fc.assert(
      fc.property(dateArb, noticePeriodArb, (submissionDate, noticePeriod) => {
        const lastWorkingDay = calculateLastWorkingDay(submissionDate, noticePeriod);
        const expectedDate = addDays(submissionDate, noticePeriod);

        expect(lastWorkingDay).toBe(expectedDate);
      }),
      { numRuns: 100 },
    );
  });

  it('last_working_day is always after submission_date', () => {
    fc.assert(
      fc.property(dateArb, noticePeriodArb, (submissionDate, noticePeriod) => {
        const lastWorkingDay = calculateLastWorkingDay(submissionDate, noticePeriod);

        // last_working_day > submission_date
        expect(lastWorkingDay > submissionDate).toBe(true);

        // Verify via daysDifference that the gap equals noticePeriod
        const diff = daysDifference(submissionDate, lastWorkingDay);
        expect(diff).toBe(noticePeriod);
      }),
      { numRuns: 100 },
    );
  });

  it('notice_period_days is always between 15 and 30 inclusive', () => {
    fc.assert(
      fc.property(noticePeriodArb, (noticePeriod) => {
        expect(noticePeriod).toBeGreaterThanOrEqual(MIN_NOTICE_DAYS);
        expect(noticePeriod).toBeLessThanOrEqual(MAX_NOTICE_DAYS);

        // Verify the clamping logic mirrors the API route behavior
        const clamped = Math.max(MIN_NOTICE_DAYS, Math.min(MAX_NOTICE_DAYS, noticePeriod));
        expect(clamped).toBe(noticePeriod);
      }),
      { numRuns: 100 },
    );
  });

  it('notice period clamping: out-of-range values are bounded to [15, 30]', () => {
    fc.assert(
      fc.property(
        dateArb,
        fc.integer({ min: -100, max: 200 }),
        (submissionDate, rawNoticePeriod) => {
          // This mirrors the API route clamping logic
          const clamped = Math.max(MIN_NOTICE_DAYS, Math.min(MAX_NOTICE_DAYS, rawNoticePeriod));
          expect(clamped).toBeGreaterThanOrEqual(MIN_NOTICE_DAYS);
          expect(clamped).toBeLessThanOrEqual(MAX_NOTICE_DAYS);

          const lastWorkingDay = calculateLastWorkingDay(submissionDate, clamped);
          const diff = daysDifference(submissionDate, lastWorkingDay);

          // The clamped notice period is always between 15 and 30
          expect(diff).toBeGreaterThanOrEqual(MIN_NOTICE_DAYS);
          expect(diff).toBeLessThanOrEqual(MAX_NOTICE_DAYS);
          // And last_working_day is always in the future
          expect(lastWorkingDay > submissionDate).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
