import { describe, expect, it } from 'vitest';
import { deriveServiceLine } from './service-line-derivation';

/**
 * Ground-truth data is the real "SPD, CENTRAL STORE" work order:
 *   Unarmed Guards (12H): day qty 1 @ 15000, night qty 1 @ 15000  → 2 guards, 15000/guard
 *   Armed  Guards (12H):  night qty 1 @ 20000 (day disabled)      → 1 guard,  20000/guard
 * The invoice formula is amount = (woPricePerMonth / days) × duties.
 */
describe('deriveServiceLine (one-time invoice from work order)', () => {
  const DAYS = 30;

  it('unarmed 12H: per-personnel rate 15000, duties = 2 guards × 30 days', () => {
    const line = deriveServiceLine(
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
      DAYS,
    );
    expect(line).not.toBeNull();
    expect(line!.totalManpower).toBe(2);
    expect(line!.woPricePerMonth).toBe(15000);
    expect(line!.duties).toBe(60);
    // amount reconciles to a full month for 2 guards = 30000
    const amount = (line!.woPricePerMonth / DAYS) * line!.duties;
    expect(amount).toBe(30000);
  });

  it('armed 12H night-only: WO price is 20000 (NOT 0) — the day-rate-only bug', () => {
    const line = deriveServiceLine(
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
      DAYS,
    );
    expect(line).not.toBeNull();
    expect(line!.totalManpower).toBe(1);
    // Old code read only day.rate → 0. Fixed code reads the enabled night shift.
    expect(line!.woPricePerMonth).toBe(20000);
    expect(line!.duties).toBe(30);
    const amount = (line!.woPricePerMonth / DAYS) * line!.duties;
    expect(amount).toBe(20000);
  });

  it('does NOT multiply an already-monthly rate by 26', () => {
    const line = deriveServiceLine(
      [{ shiftType: '12H', shifts: { day: { enabled: true, quantity: 1, rate: 15000 } } }],
      '12H',
      DAYS,
    );
    // Old bug: 15000 × 26 = 390000. Fixed: 15000.
    expect(line!.woPricePerMonth).toBe(15000);
  });

  it('per-personnel rate is a weighted average when shift rates differ', () => {
    const line = deriveServiceLine(
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
      DAYS,
    );
    // monthlyPrice = 10000 + 12000 + 2×14000 = 50000; manpower = 4 → 12500/guard
    expect(line!.totalManpower).toBe(4);
    expect(line!.woPricePerMonth).toBe(12500);
    expect(line!.duties).toBe(120);
  });

  it('ignores the afternoon shift on a 12H roster', () => {
    const line = deriveServiceLine(
      [
        {
          shiftType: '12H',
          shifts: {
            day: { enabled: true, quantity: 1, rate: 15000 },
            afternoon: { enabled: true, quantity: 5, rate: 99999 }, // must be ignored on 12H
            night: { enabled: true, quantity: 1, rate: 15000 },
          },
        },
      ],
      '12H',
      DAYS,
    );
    expect(line!.totalManpower).toBe(2); // afternoon 5 excluded
    expect(line!.woPricePerMonth).toBe(15000);
  });

  it('accepts numeric-string rates', () => {
    const line = deriveServiceLine(
      [{ shiftType: '8H', shifts: { day: { enabled: true, quantity: 1, rate: '18000' } } }],
      '8H',
      DAYS,
    );
    expect(line!.woPricePerMonth).toBe(18000);
  });

  it('returns null when no shift has enabled manpower', () => {
    const line = deriveServiceLine(
      [{ shiftType: '8H', shifts: { day: { enabled: false, quantity: 0, rate: 0 } } }],
      '8H',
      DAYS,
    );
    expect(line).toBeNull();
  });
});

import { daysInServicePeriod } from './service-line-derivation';

describe('daysInServicePeriod', () => {
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
