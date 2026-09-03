/**
 * Property-based test for offense-to-weight mapping consistency.
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**
 *
 * Property 1: Offense-to-weight mapping consistency
 * - Every offense maps to a valid weight value (1-5)
 * - getDefaultWeight returns consistent results for the same input
 * - All defined offenses have a mapping
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ALL_OFFENSES } from '../schemas/penaltySchema';
import { getDefaultWeight, OFFENSE_WEIGHTS } from '../utils/penaltyPoints';

// Generator: picks a random offense from the defined set
const offenseArb = fc.constantFrom(...ALL_OFFENSES);

describe('Property 1: Offense-to-weight mapping consistency', () => {
  it('every offense maps to a valid weight value between 1 and 5', () => {
    fc.assert(
      fc.property(offenseArb, (offense) => {
        const weight = getDefaultWeight(offense);
        expect(weight).toBeGreaterThanOrEqual(1);
        expect(weight).toBeLessThanOrEqual(5);
        expect(Number.isInteger(weight)).toBe(true);
      })
    );
  });

  it('getDefaultWeight returns consistent results for the same input (idempotent)', () => {
    fc.assert(
      fc.property(offenseArb, (offense) => {
        const firstCall = getDefaultWeight(offense);
        const secondCall = getDefaultWeight(offense);
        expect(firstCall).toBe(secondCall);
      })
    );
  });

  it('all defined ALL_OFFENSES have a valid mapping (complete coverage)', () => {
    for (const offense of ALL_OFFENSES) {
      const weight = getDefaultWeight(offense);
      expect(weight).toBeDefined();
      expect(weight).toBeGreaterThanOrEqual(1);
      expect(weight).toBeLessThanOrEqual(5);
    }
  });

  it('maps specific offenses to their expected weight values', () => {
    expect(getDefaultWeight('Late Arrival')).toBe(1);
    expect(getDefaultWeight('Sleeping on Duty')).toBe(3);
    expect(getDefaultWeight('Theft')).toBe(5);
    expect(getDefaultWeight('Mobile Use')).toBe(2);
    expect(getDefaultWeight('Bribery')).toBe(5);
  });

  it('unknown offenses fall back to weight 1', () => {
    expect(getDefaultWeight('Unknown Offense XYZ')).toBe(1);
  });
});
