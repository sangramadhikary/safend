import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { filterPenaltiesByTab, getFilterOptionsForTab } from '../utils/penaltyFiltering';
import {
  PenaltyRecord,
  PENALTY_STATUSES,
  ALL_OFFENSES,
  OFFENSE_TYPES,
  SOURCES_OF_INFORMATION,
  HR_ACTIONS,
  PenaltyStatus,
} from '../schemas/penaltySchema';

/**
 * Property 2: Tab filtering correctness
 * **Validates: Requirements 3.4, 3.5, 3.6, 10.3**
 */

// Generator for a valid PenaltyRecord
const penaltyRecordArb: fc.Arbitrary<PenaltyRecord> = fc.record({
  id: fc.uuid(),
  staff_id: fc.uuid(),
  staff_name: fc.string({ minLength: 1, maxLength: 30 }),
  post_id: fc.uuid(),
  post_name: fc.string({ minLength: 1, maxLength: 30 }),
  violation_date: fc.date({ noInvalidDate: true, min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString().split('T')[0]),
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
  created_at: fc.date({ noInvalidDate: true, min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString()),
  updated_at: fc.date({ noInvalidDate: true, min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString()),
});

const penaltyListArb = fc.array(penaltyRecordArb, { minLength: 0, maxLength: 20 });

describe('Property 2: Tab filtering correctness', () => {
  it('"All" tab shows all penalties regardless of status', () => {
    fc.assert(
      fc.property(penaltyListArb, (penalties) => {
        const result = filterPenaltiesByTab(penalties, 'all');
        expect(result).toHaveLength(penalties.length);
        expect(result).toEqual(penalties);
      }),
      { numRuns: 200 }
    );
  });

  it('"Pending HR Review" tab only shows penalties with that status', () => {
    fc.assert(
      fc.property(penaltyListArb, (penalties) => {
        const result = filterPenaltiesByTab(penalties, 'Pending HR Review');
        expect(result.every(p => p.status === 'Pending HR Review')).toBe(true);
        const expected = penalties.filter(p => p.status === 'Pending HR Review');
        expect(result).toHaveLength(expected.length);
      }),
      { numRuns: 200 }
    );
  });

  it('"Suspended" tab only shows penalties with status "Suspended"', () => {
    fc.assert(
      fc.property(penaltyListArb, (penalties) => {
        const result = filterPenaltiesByTab(penalties, 'Suspended');
        expect(result.every(p => p.status === 'Suspended')).toBe(true);
        const expected = penalties.filter(p => p.status === 'Suspended');
        expect(result).toHaveLength(expected.length);
      }),
      { numRuns: 200 }
    );
  });

  it('"Terminated" tab only shows penalties with status "Terminated"', () => {
    fc.assert(
      fc.property(penaltyListArb, (penalties) => {
        const result = filterPenaltiesByTab(penalties, 'Terminated');
        expect(result.every(p => p.status === 'Terminated')).toBe(true);
        const expected = penalties.filter(p => p.status === 'Terminated');
        expect(result).toHaveLength(expected.length);
      }),
      { numRuns: 200 }
    );
  });

  it('"patrol" tab only shows penalties with source_of_information "Patrol"', () => {
    fc.assert(
      fc.property(penaltyListArb, (penalties) => {
        const result = filterPenaltiesByTab(penalties, 'patrol');
        expect(result.every(p => p.source_of_information === 'Patrol')).toBe(true);
        const expected = penalties.filter(p => p.source_of_information === 'Patrol');
        expect(result).toHaveLength(expected.length);
      }),
      { numRuns: 200 }
    );
  });

  it('filtering is exhaustive: no records are lost or duplicated for any status tab', () => {
    const statusTabArb = fc.constantFrom<PenaltyStatus>(...PENALTY_STATUSES);

    fc.assert(
      fc.property(penaltyListArb, statusTabArb, (penalties, tab) => {
        const result = filterPenaltiesByTab(penalties, tab);
        expect(result.every(p => penalties.includes(p))).toBe(true);
        const expected = penalties.filter(p => p.status === tab);
        expect(result).toEqual(expected);
      }),
      { numRuns: 200 }
    );
  });
});
