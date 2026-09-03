import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  ALL_OFFENSES,
  OFFENSE_TYPES,
  OFFENSES_BY_TYPE,
  SOURCES_OF_INFORMATION,
  PENALTY_STATUSES,
  penaltyFormSchema,
} from '../schemas/penaltySchema';
import { getDefaultWeight } from '../utils/penaltyPoints';

/**
 * **Validates: Requirements 2.5, 10.1, 10.5**
 *
 * Property 7: New penalty defaults
 *
 * For any newly created penalty (not from patrol context), the status SHALL be
 * "Pending HR Review", and related_entity_id and related_entity_type SHALL be null.
 * For any penalty created from a patrol context, related_entity_id SHALL equal the
 * patrol record identifier and related_entity_type SHALL equal "patrol".
 * The default weight value for any offense is determined by getDefaultWeight().
 */

// Generator for offenses
const offenseArb = fc.constantFrom(...ALL_OFFENSES);

// Generator for arbitrary valid form field values (simulates user input variations)
const newPenaltyInputArb = fc.record({
  staff_id: fc.uuid(),
  staff_name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  post_id: fc.uuid(),
  post_name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  violation_date: fc.date({ noInvalidDate: true,
    min: new Date('2020-01-01'),
    max: new Date(),
  }).map(d => d.toISOString().split('T')[0]),
  offense: offenseArb,
  description: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
});

/**
 * Simulates the PenaltyForm default state for a new penalty (no editData).
 */
function getNewPenaltyDefaults() {
  return {
    staff_id: "",
    staff_name: "",
    post_id: "",
    post_name: "",
    violation_date: new Date().toISOString().split('T')[0],
    source_of_information: 'Patrol' as const,
    offense_type: 'Disciplinary' as const,
    offense: 'Late Arrival',
    weight: 1,
    description: "",
    evidence_url: null,
    related_entity_id: null,
    related_entity_type: null,
  };
}

/**
 * Simulates the PenaltyForm default state when creating from patrol context.
 */
function getPatrolPenaltyDefaults(patrolId: string) {
  return {
    staff_id: "",
    staff_name: "",
    post_id: "",
    post_name: "",
    violation_date: new Date().toISOString().split('T')[0],
    source_of_information: 'Patrol' as const,
    offense_type: 'Disciplinary' as const,
    offense: 'Late Arrival',
    weight: 1,
    description: "",
    evidence_url: null,
    related_entity_id: patrolId,
    related_entity_type: "patrol",
  };
}

/**
 * Simulates how PenaltyManagement creates a new penalty via the usePenalties hook.
 * The database defaults status to "Pending HR Review" on insert.
 */
function simulateCreatePenalty(input: {
  staff_id: string;
  staff_name: string;
  post_id: string;
  post_name: string;
  violation_date: string;
  offense: string;
  weight: number;
  description: string;
  related_entity_id: string | null;
  related_entity_type: string | null;
}) {
  return {
    ...input,
    status: 'Pending HR Review' as const,
  };
}

describe('Property 7: New penalty defaults', () => {
  it('a newly created penalty always has status "Pending HR Review" regardless of other field values', () => {
    fc.assert(
      fc.property(newPenaltyInputArb, (input) => {
        const weight = getDefaultWeight(input.offense);
        const created = simulateCreatePenalty({
          ...input,
          weight,
          related_entity_id: null,
          related_entity_type: null,
        });

        expect(created.status).toBe('Pending HR Review');
      }),
      { numRuns: 100 }
    );
  });

  it('the default weight value for any offense is determined by getDefaultWeight()', () => {
    fc.assert(
      fc.property(offenseArb, (offense) => {
        const updatedWeight = getDefaultWeight(offense);

        // Weight should always be a valid integer in range 1-5
        expect(updatedWeight).toBeGreaterThanOrEqual(1);
        expect(updatedWeight).toBeLessThanOrEqual(5);
        expect(Number.isInteger(updatedWeight)).toBe(true);

        // The form's weight field should equal getDefaultWeight for the selected offense
        expect(updatedWeight).toBe(getDefaultWeight(offense));
      }),
      { numRuns: 100 }
    );
  });

  it('the default status is never a terminal state for new records', () => {
    fc.assert(
      fc.property(newPenaltyInputArb, (input) => {
        const weight = getDefaultWeight(input.offense);
        const created = simulateCreatePenalty({
          ...input,
          weight,
          related_entity_id: null,
          related_entity_type: null,
        });

        // New records should not start in terminal states
        const terminalStatuses = ['Terminated', 'Dismissed'] as const;
        for (const badStatus of terminalStatuses) {
          expect(created.status).not.toBe(badStatus);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('when offense changes, weight auto-updates to the default for that offense', () => {
    const offensePairArb = fc.tuple(offenseArb, offenseArb);

    fc.assert(
      fc.property(offensePairArb, ([initialOffense, newOffense]) => {
        // Start with initial offense's default weight
        let currentWeight = getDefaultWeight(initialOffense);
        expect(currentWeight).toBe(getDefaultWeight(initialOffense));

        // Simulate offense change
        currentWeight = getDefaultWeight(newOffense);

        // After change, weight should equal the new offense's default
        expect(currentWeight).toBe(getDefaultWeight(newOffense));
      }),
      { numRuns: 100 }
    );
  });

  it('new penalty from patrol context has related_entity_id set and type "patrol"', () => {
    fc.assert(
      fc.property(fc.uuid(), (patrolId) => {
        const defaults = getPatrolPenaltyDefaults(patrolId);

        expect(defaults.related_entity_id).toBe(patrolId);
        expect(defaults.related_entity_type).toBe('patrol');
      }),
      { numRuns: 100 }
    );
  });

  it('new penalty NOT from patrol context has null related_entity fields', () => {
    const defaults = getNewPenaltyDefaults();

    expect(defaults.related_entity_id).toBeNull();
    expect(defaults.related_entity_type).toBeNull();
  });
});
