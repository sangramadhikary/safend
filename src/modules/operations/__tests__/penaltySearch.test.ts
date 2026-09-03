import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { searchPenalties } from '../utils/penaltyFiltering';
import {
  PenaltyRecord,
  PENALTY_STATUSES,
  ALL_OFFENSES,
  OFFENSE_TYPES,
  SOURCES_OF_INFORMATION,
  HR_ACTIONS,
} from '../schemas/penaltySchema';

/**
 * Property 3: Search filtering correctness
 * **Validates: Requirements 3.7**
 *
 * The search filter checks if the search term (case-insensitive) appears in any of:
 * staff_name, post_name, offense, offense_type, or description.
 */

// Generator for a valid PenaltyRecord
const penaltyRecordArb: fc.Arbitrary<PenaltyRecord> = fc.record({
  id: fc.uuid(),
  staff_id: fc.uuid(),
  staff_name: fc.string({ minLength: 1, maxLength: 30 }),
  post_id: fc.uuid(),
  post_name: fc.string({ minLength: 1, maxLength: 30 }),
  violation_date: fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString().split('T')[0]),
  source_of_information: fc.constantFrom(...SOURCES_OF_INFORMATION),
  offense_type: fc.constantFrom(...OFFENSE_TYPES),
  offense: fc.constantFrom(...ALL_OFFENSES),
  weight: fc.integer({ min: 1, max: 5 }),
  description: fc.string({ minLength: 1, maxLength: 100 }),
  evidence_url: fc.option(fc.webUrl(), { nil: null }),
  status: fc.constantFrom(...PENALTY_STATUSES),
  hr_action: fc.option(fc.constantFrom(...HR_ACTIONS), { nil: null }),
  financial_penalty_amount: fc.option(fc.integer({ min: 100, max: 10000 }), { nil: null }),
  hr_notes: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  related_entity_id: fc.oneof(fc.uuid(), fc.constant(null)),
  related_entity_type: fc.oneof(fc.constant('patrol'), fc.constant(null), fc.constant('manual')),
  created_at: fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString()),
  updated_at: fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString()),
});

const penaltyListArb = fc.array(penaltyRecordArb, { minLength: 0, maxLength: 20 });

describe('Property 3: Search filtering correctness', () => {
  it('empty search term returns all records', () => {
    fc.assert(
      fc.property(penaltyListArb, (penalties) => {
        const result = searchPenalties(penalties, '');
        expect(result).toHaveLength(penalties.length);
        expect(result).toEqual(penalties);
      }),
      { numRuns: 200 }
    );
  });

  it('a search term matching staff_name includes that record', () => {
    fc.assert(
      fc.property(penaltyRecordArb, (penalty) => {
        const name = penalty.staff_name;
        if (name.length === 0) return;
        const sub = name.substring(0, Math.max(1, Math.floor(name.length / 2)));
        const result = searchPenalties([penalty], sub);
        expect(result).toContain(penalty);
      }),
      { numRuns: 200 }
    );
  });

  it('a search term matching post_name includes that record', () => {
    fc.assert(
      fc.property(penaltyRecordArb, (penalty) => {
        const name = penalty.post_name;
        if (name.length === 0) return;
        const sub = name.substring(0, Math.max(1, Math.floor(name.length / 2)));
        const result = searchPenalties([penalty], sub);
        expect(result).toContain(penalty);
      }),
      { numRuns: 200 }
    );
  });

  it('a search term matching offense includes that record', () => {
    fc.assert(
      fc.property(penaltyRecordArb, (penalty) => {
        const off = penalty.offense;
        const sub = off.substring(0, Math.max(1, Math.floor(off.length / 2)));
        const result = searchPenalties([penalty], sub);
        expect(result).toContain(penalty);
      }),
      { numRuns: 200 }
    );
  });

  it('a search term matching description includes that record', () => {
    fc.assert(
      fc.property(penaltyRecordArb, (penalty) => {
        const desc = penalty.description;
        if (desc.length === 0) return;
        const sub = desc.substring(0, Math.max(1, Math.floor(desc.length / 2)));
        const result = searchPenalties([penalty], sub);
        expect(result).toContain(penalty);
      }),
      { numRuns: 200 }
    );
  });

  it('search is case-insensitive', () => {
    fc.assert(
      fc.property(penaltyRecordArb, (penalty) => {
        const name = penalty.staff_name;
        if (name.length === 0) return;
        const upper = name.toUpperCase();
        const lower = name.toLowerCase();
        const resultUpper = searchPenalties([penalty], upper);
        const resultLower = searchPenalties([penalty], lower);
        expect(resultUpper).toEqual(resultLower);
      }),
      { numRuns: 200 }
    );
  });

  it('records NOT containing the search term anywhere are excluded', () => {
    const uniqueMarker = 'XYZZY_UNIQUE_MARKER_12345';

    fc.assert(
      fc.property(penaltyListArb, (penalties) => {
        const recordsWithoutMarker = penalties.filter(p =>
          !p.staff_name.toLowerCase().includes(uniqueMarker.toLowerCase()) &&
          !p.post_name.toLowerCase().includes(uniqueMarker.toLowerCase()) &&
          !p.offense.toLowerCase().includes(uniqueMarker.toLowerCase()) &&
          !p.offense_type.toLowerCase().includes(uniqueMarker.toLowerCase()) &&
          !p.description.toLowerCase().includes(uniqueMarker.toLowerCase())
        );
        const result = searchPenalties(recordsWithoutMarker, uniqueMarker);
        expect(result).toHaveLength(0);
      }),
      { numRuns: 200 }
    );
  });
});
