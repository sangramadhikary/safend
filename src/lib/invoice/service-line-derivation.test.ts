import { describe, expect, it } from 'vitest';
import { deriveServiceLines, countActiveServiceDays, daysInServicePeriod } from './service-line-derivation';

const FULL_MONTH = { periodDays: 30, periodStart: '2026-04-01', periodEnd: '2026-04-30' };

/**
 * Ground-truth data is the real "SPD, CENTRAL STORE" work order:
 *   Unarmed Guards (12H): day qty 1 @ 15000, night qty 1 @ 15000  → 2 guards, 15000/guard
 *   Armed  Guards (12H):  night qty 1 @ 20000 (day disabled)      → 1 guard,  20000/guard
 * The invoice formula is amount = (woPricePerMonth / days) × duties.
 * deriveServiceLines returns ONE line PER instance.
 */
describe('deriveServiceLines (one-time invoice from work order)', () => {
  it('unarmed 12H all-days: per-personnel rate 15000, duties = 2 × 30', () => {
    const [line] = deriveServiceLines(
      [
        {
          shiftType: '12H',
          shifts: {
            day: { enabled: true, quantity: 1, rate: 15000 },
            afternoon: { enabled: false, quantity: 0, rate: 0 },
            night: { enabled: true, quantity: 1, rate: 15000 },
          },
        },
      ],
      '12H',
      FULL_MONTH,
    );
    expect(line.totalManpower).toBe(2);
    expect(line.woPricePerMonth).toBe(15000);
    expect(line.duties).toBe(60);
    expect((line.woPricePerMonth / 30) * line.duties).toBe(30000);
  });

  it('armed 12H night-only: WO price is 20000 (NOT 0) — the day-rate-only bug', () => {
    const [line] = deriveServiceLines(
      [
        {
          shiftType: '12H',
          shifts: {
            day: { enabled: false, quantity: 0, rate: 0 },
            afternoon: { enabled: false, quantity: 0, rate: 0 },
            night: { enabled: true, quantity: 1, rate: 20000 },
          },
        },
      ],
      '12H',
      FULL_MONTH,
    );
    expect(line.totalManpower).toBe(1);
    expect(line.woPricePerMonth).toBe(20000);
    expect(line.duties).toBe(30);
    expect((line.woPricePerMonth / 30) * line.duties).toBe(20000);
  });

  it('does NOT multiply an already-monthly rate by 26', () => {
    const [line] = deriveServiceLines(
      [{ shiftType: '12H', shifts: { day: { enabled: true, quantity: 1, rate: 15000 } } }],
      '12H',
      FULL_MONTH,
    );
    expect(line.woPricePerMonth).toBe(15000);
  });

  it('per-personnel rate is a weighted average when shift rates differ', () => {
    const [line] = deriveServiceLines(
      [
        {
          shiftType: '8H',
          shifts: {
            day: { enabled: true, quantity: 1, rate: 10000 },
            afternoon: { enabled: true, quantity: 1, rate: 12000 },
            night: { enabled: true, quantity: 2, rate: 14000 },
          },
        },
      ],
      '8H',
      FULL_MONTH,
    );
    // monthlyPrice = 10000 + 12000 + 2×14000 = 50000; manpower = 4 → 12500/guard
    expect(line.totalManpower).toBe(4);
    expect(line.woPricePerMonth).toBe(12500);
    expect(line.duties).toBe(120);
  });

  it('ignores the afternoon shift on a 12H roster', () => {
    const [line] = deriveServiceLines(
      [
        {
          shiftType: '12H',
          shifts: {
            day: { enabled: true, quantity: 1, rate: 15000 },
            afternoon: { enabled: true, quantity: 5, rate: 99999 }, // ignored on 12H
            night: { enabled: true, quantity: 1, rate: 15000 },
          },
        },
      ],
      '12H',
      FULL_MONTH,
    );
    expect(line.totalManpower).toBe(2);
    expect(line.woPricePerMonth).toBe(15000);
  });

  it('accepts numeric-string rates', () => {
    const [line] = deriveServiceLines(
      [{ shiftType: '8H', shifts: { day: { enabled: true, quantity: 1, rate: '18000' } } }],
      '8H',
      FULL_MONTH,
    );
    expect(line.woPricePerMonth).toBe(18000);
  });

  it('skips instances with zero enabled manpower', () => {
    const lines = deriveServiceLines(
      [{ shiftType: '8H', shifts: { day: { enabled: false, quantity: 0, rate: 0 } } }],
      '8H',
      FULL_MONTH,
    );
    expect(lines).toHaveLength(0);
  });

  it('emits ONE line PER instance (WO-2026-9559 Aryan Site unarmed guards)', () => {
    // Real config: an 8H night Sunday-only guard @10850 and a 12H night all-days
    // guard @15000. July 2026 has 4 Sundays.
    const lines = deriveServiceLines(
      [
        {
          shiftType: '8H',
          shifts: { night: { enabled: true, quantity: 1, rate: 10850 } },
          serviceDays: { mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: true },
        } as any,
        {
          shiftType: '12H',
          shifts: { night: { enabled: true, quantity: 1, rate: 15000 } },
          serviceDays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true },
        } as any,
      ],
      '8H',
      { periodDays: 31, periodStart: '2026-07-01', periodEnd: '2026-07-31' },
    );
    expect(lines).toHaveLength(2);

    // 8H Sunday-only: 4 Sundays in July 2026 → duties 4, amount 10850/31×4 = 1400
    expect(lines[0]).toMatchObject({ shiftType: '8H', woPricePerMonth: 10850, duties: 4 });
    expect(Math.round((lines[0].woPricePerMonth / 31) * lines[0].duties)).toBe(1400);

    // 12H all-days: duties 31, amount 15000
    expect(lines[1]).toMatchObject({ shiftType: '12H', woPricePerMonth: 15000, duties: 31 });
    expect((lines[1].woPricePerMonth / 31) * lines[1].duties).toBe(15000);

    // The two lines reconcile to the invoice 26270018 taxable of 16400.
    const total =
      Math.round((lines[0].woPricePerMonth / 31) * lines[0].duties) +
      (lines[1].woPricePerMonth / 31) * lines[1].duties;
    expect(total).toBe(16400);
  });
});

describe('countActiveServiceDays', () => {
  it('all-days (no restriction) returns the full period day count', () => {
    expect(countActiveServiceDays(undefined, 30, '2026-04-01', '2026-04-30')).toBe(30);
    expect(
      countActiveServiceDays(
        { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true },
        30,
        '2026-04-01',
        '2026-04-30',
      ),
    ).toBe(30);
  });

  it('Sunday-only over July 2026 = 4 Sundays', () => {
    const sundayOnly = { mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: true };
    expect(countActiveServiceDays(sundayOnly, 31, '2026-07-01', '2026-07-31')).toBe(4);
  });

  it('weekdays-only (Mon-Fri) over a known week', () => {
    const weekdays = { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false };
    // 2026-04-06 (Mon) .. 2026-04-12 (Sun) → 5 weekdays.
    expect(countActiveServiceDays(weekdays, 7, '2026-04-06', '2026-04-12')).toBe(5);
  });

  it('falls back to full days when a restriction exists but no dates are given', () => {
    const sundayOnly = { mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: true };
    expect(countActiveServiceDays(sundayOnly, 30, null, null)).toBe(30);
  });
});

describe('daysInServicePeriod month/range', () => {
  it('month mode: April 2026 = 30 days', () => {
    expect(daysInServicePeriod({ mode: 'month', month: '2026-04' })).toBe(30);
  });

  it('month mode: January = 31 days', () => {
    expect(daysInServicePeriod({ mode: 'month', month: '2026-01' })).toBe(31);
  });

  it('month mode: non-leap February = 28 days', () => {
    expect(daysInServicePeriod({ mode: 'month', month: '2026-02' })).toBe(28);
  });

  it('month mode: leap February = 29 days', () => {
    expect(daysInServicePeriod({ mode: 'month', month: '2028-02' })).toBe(29);
  });

  it('range mode: inclusive full month 1 Apr -> 30 Apr = 30', () => {
    expect(daysInServicePeriod({ mode: 'range', start: '2026-04-01', end: '2026-04-30' })).toBe(30);
  });

  it('range mode: single day = 1', () => {
    expect(daysInServicePeriod({ mode: 'range', start: '2026-04-15', end: '2026-04-15' })).toBe(1);
  });

  it('range mode: partial 1 Apr -> 15 Apr = 15', () => {
    expect(daysInServicePeriod({ mode: 'range', start: '2026-04-01', end: '2026-04-15' })).toBe(15);
  });

  it('returns null on missing/invalid input', () => {
    expect(daysInServicePeriod({ mode: 'month', month: '' })).toBeNull();
    expect(daysInServicePeriod({ mode: 'month', month: '2026-13' })).toBeNull();
    expect(daysInServicePeriod({ mode: 'range', start: '2026-04-10', end: '2026-04-01' })).toBeNull();
    expect(daysInServicePeriod({ mode: 'range', start: '', end: '' })).toBeNull();
  });
});

/**
 * Reproduces the effect's line-rescaling reducer to prove the August scenario:
 * a full-month line built for a 30-day month must become 31 days / rescaled
 * duties when the Service Period changes to August (31 days).
 */
function syncLinesToPeriod(
  lines: { daysInMonth: string; manpower: string; duties: string }[],
  periodDays: number | null,
) {
  if (!periodDays || periodDays <= 0) return lines;
  return lines.map(l => {
    const oldDays = parseFloat(l.daysInMonth) || 0;
    if (oldDays === periodDays) return l;
    const manpower = parseFloat(l.manpower) || 0;
    const duties = parseFloat(l.duties) || 0;
    const next = { ...l, daysInMonth: String(periodDays) };
    if (manpower > 0 && oldDays > 0 && duties === manpower * oldDays) {
      next.duties = String(manpower * periodDays);
    }
    return next;
  });
}

describe('period sync (August 31-day scenario)', () => {
  it('updates Days 30 -> 31 and rescales full-month duties for August', () => {
    const aug = daysInServicePeriod({ mode: 'month', month: '2026-08' });
    expect(aug).toBe(31);

    const before = [
      { daysInMonth: '30', manpower: '2', duties: '60' }, // unarmed, full month
      { daysInMonth: '30', manpower: '1', duties: '30' }, // armed, full month
    ];
    const after = syncLinesToPeriod(before, aug);
    expect(after[0]).toMatchObject({ daysInMonth: '31', duties: '62' });
    expect(after[1]).toMatchObject({ daysInMonth: '31', duties: '31' });
  });

  it('leaves a manually customised duties line untouched (only updates Days)', () => {
    const aug = daysInServicePeriod({ mode: 'month', month: '2026-08' });
    // duties (45) != manpower(2) × oldDays(30)=60 → user-edited, don't rescale.
    const before = [{ daysInMonth: '30', manpower: '2', duties: '45' }];
    const after = syncLinesToPeriod(before, aug);
    expect(after[0]).toMatchObject({ daysInMonth: '31', duties: '45' });
  });
});
