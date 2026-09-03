import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  penaltyFormSchema,
  ALL_OFFENSES,
  OFFENSE_TYPES,
  OFFENSES_BY_TYPE,
  SOURCES_OF_INFORMATION,
  PENALTY_STATUSES,
} from '../schemas/penaltySchema';

/**
 * Property 9: Database constraint enforcement
 * **Validates: Requirements 1.2, 1.3, 1.4**
 *
 * Verifies that the Zod schema enforces the same constraints that would be
 * enforced at the database level (as defined in scripts/create_penalties_table.sql).
 */
describe('Property 9: Database constraint enforcement', () => {
  // Helper: generate a valid base form data object
  const validFormData = () => ({
    staff_id: '550e8400-e29b-41d4-a716-446655440000',
    staff_name: 'John Doe',
    post_id: '660e8400-e29b-41d4-a716-446655440000',
    post_name: 'Main Gate',
    violation_date: '2024-01-15',
    source_of_information: 'Patrol' as const,
    offense_type: 'Disciplinary' as const,
    offense: 'Late Arrival',
    weight: 1,
    description: 'Was late by 10 minutes',
    evidence_url: null,
    related_entity_id: null,
    related_entity_type: null,
  });

  it('weight must be between 1 and 5 (matching CHECK constraint)', () => {
    fc.assert(
      fc.property(
        fc.integer().filter((n) => n < 1 || n > 5),
        (invalidWeight) => {
          const data = { ...validFormData(), weight: invalidWeight };
          const result = penaltyFormSchema.safeParse(data);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('weight within 1-5 are accepted', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        (validWeight) => {
          const data = { ...validFormData(), weight: validWeight };
          const result = penaltyFormSchema.safeParse(data);
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('offense_type must be one of the valid enum values', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter(
          (s) => !(OFFENSE_TYPES as readonly string[]).includes(s)
        ),
        (invalidType) => {
          const data = { ...validFormData(), offense_type: invalidType };
          const result = penaltyFormSchema.safeParse(data);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all valid offense types are accepted', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...OFFENSE_TYPES),
        (validType) => {
          // Pick a valid offense for the given type
          const offenses = OFFENSES_BY_TYPE[validType];
          const data = { ...validFormData(), offense_type: validType, offense: offenses[0] };
          const result = penaltyFormSchema.safeParse(data);
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('date cannot be in the future', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3650 }),
        (daysInFuture) => {
          const futureDate = new Date();
          futureDate.setDate(futureDate.getDate() + daysInFuture);
          const futureDateStr = futureDate.toISOString().split('T')[0];
          const data = { ...validFormData(), violation_date: futureDateStr };
          const result = penaltyFormSchema.safeParse(data);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('past and today dates are accepted', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3650 }),
        (daysInPast) => {
          const pastDate = new Date();
          pastDate.setDate(pastDate.getDate() - daysInPast);
          const pastDateStr = pastDate.toISOString().split('T')[0];
          const data = { ...validFormData(), violation_date: pastDateStr };
          const result = penaltyFormSchema.safeParse(data);
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('required fields cannot be null or empty', () => {
    const requiredStringFields = [
      'staff_id',
      'staff_name',
      'post_id',
      'post_name',
      'violation_date',
      'description',
    ] as const;

    fc.assert(
      fc.property(
        fc.constantFrom(...requiredStringFields),
        fc.constantFrom('', null, undefined),
        (field, emptyValue) => {
          const data = { ...validFormData(), [field]: emptyValue };
          const result = penaltyFormSchema.safeParse(data);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('non-integer weight values are rejected', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1.01, max: 4.99, noNaN: true }).filter(
          (n) => !Number.isInteger(n)
        ),
        (nonIntWeight) => {
          const data = { ...validFormData(), weight: nonIntWeight };
          const result = penaltyFormSchema.safeParse(data);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
