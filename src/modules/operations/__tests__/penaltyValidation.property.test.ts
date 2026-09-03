import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  penaltyFormSchema,
  ALL_OFFENSES,
  OFFENSE_TYPES,
  SOURCES_OF_INFORMATION,
} from '../schemas/penaltySchema';

/**
 * **Validates: Requirements 11.1, 11.3, 11.4**
 *
 * Property 4: Form validation rejects invalid submissions
 *
 * For any form submission where at least one required field is missing or empty,
 * OR where weight is not an integer between 1 and 5,
 * OR where violation_date is in the future,
 * the Zod schema validation SHALL fail and the submission SHALL be prevented.
 */

// Helper: generate a valid base form data object using arbitraries
const validFormData = () => ({
  staff_id: fc.uuid().map((id) => id),
  staff_name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  post_id: fc.uuid().map((id) => id),
  post_name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  violation_date: fc.date({ noInvalidDate: true,
    min: new Date('2020-01-01'),
    max: new Date(),
  }).map((d) => d.toISOString().split('T')[0]),
  source_of_information: fc.constantFrom(...SOURCES_OF_INFORMATION),
  offense_type: fc.constantFrom(...OFFENSE_TYPES),
  offense: fc.constantFrom(...ALL_OFFENSES),
  weight: fc.integer({ min: 1, max: 5 }),
  description: fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
  evidence_url: fc.constant(null),
  related_entity_id: fc.constant(null),
  related_entity_type: fc.constant(null),
});

describe('Property 4: Form validation rejects invalid submissions', () => {
  it('rejects invalid UUIDs for staff_id', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !s.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.constantFrom(...ALL_OFFENSES),
        fc.integer({ min: 1, max: 5 }),
        fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
        (invalidUuid, postId, staffName, postName, offense, weight, description) => {
          const data = {
            staff_id: invalidUuid,
            staff_name: staffName,
            post_id: postId,
            post_name: postName,
            violation_date: '2024-01-15',
            source_of_information: 'Patrol',
            offense_type: 'Disciplinary',
            offense,
            weight,
            description,
            evidence_url: null,
            related_entity_id: null,
            related_entity_type: null,
          };
          const result = penaltyFormSchema.safeParse(data);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('rejects future dates for violation_date', () => {
    fc.assert(
      fc.property(
        fc.date({ noInvalidDate: true, min: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), max: new Date('2030-12-31') }),
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.constantFrom(...ALL_OFFENSES),
        fc.integer({ min: 1, max: 5 }),
        fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
        (futureDate, staffId, postId, staffName, postName, offense, weight, description) => {
          const data = {
            staff_id: staffId,
            staff_name: staffName,
            post_id: postId,
            post_name: postName,
            violation_date: futureDate.toISOString().split('T')[0],
            source_of_information: 'Patrol',
            offense_type: 'Disciplinary',
            offense,
            weight,
            description,
            evidence_url: null,
            related_entity_id: null,
            related_entity_type: null,
          };
          const result = penaltyFormSchema.safeParse(data);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('rejects weight outside 1-5 range', () => {
    fc.assert(
      fc.property(
        fc.integer().filter((n) => n < 1 || n > 5),
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.constantFrom(...ALL_OFFENSES),
        fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
        (invalidWeight, staffId, postId, staffName, postName, offense, description) => {
          const data = {
            staff_id: staffId,
            staff_name: staffName,
            post_id: postId,
            post_name: postName,
            violation_date: '2024-01-15',
            source_of_information: 'Patrol',
            offense_type: 'Disciplinary',
            offense,
            weight: invalidWeight,
            description,
            evidence_url: null,
            related_entity_id: null,
            related_entity_type: null,
          };
          const result = penaltyFormSchema.safeParse(data);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('rejects missing required fields', () => {
    const requiredFields = ['staff_id', 'staff_name', 'post_id', 'post_name', 'violation_date', 'offense', 'weight', 'description'] as const;

    fc.assert(
      fc.property(
        fc.constantFrom(...requiredFields),
        fc.uuid(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
        fc.constantFrom(...ALL_OFFENSES),
        fc.integer({ min: 1, max: 5 }),
        fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0),
        (fieldToRemove, staffId, postId, staffName, postName, offense, weight, description) => {
          const data: Record<string, unknown> = {
            staff_id: staffId,
            staff_name: staffName,
            post_id: postId,
            post_name: postName,
            violation_date: '2024-01-15',
            source_of_information: 'Patrol',
            offense_type: 'Disciplinary',
            offense,
            weight,
            description,
            evidence_url: null,
            related_entity_id: null,
            related_entity_type: null,
          };
          delete data[fieldToRemove];
          const result = penaltyFormSchema.safeParse(data);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('accepts valid data that meets all constraints', () => {
    fc.assert(
      fc.property(
        fc.record(validFormData()),
        (data) => {
          const result = penaltyFormSchema.safeParse(data);
          expect(result.success).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects empty strings for required string fields', () => {
    const stringFields = ['staff_name', 'post_name', 'description', 'offense'] as const;

    fc.assert(
      fc.property(
        fc.constantFrom(...stringFields),
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom(...ALL_OFFENSES),
        fc.integer({ min: 1, max: 5 }),
        (fieldToEmpty, staffId, postId, offense, weight) => {
          const data: Record<string, unknown> = {
            staff_id: staffId,
            staff_name: 'Valid Name',
            post_id: postId,
            post_name: 'Valid Post',
            violation_date: '2024-01-15',
            source_of_information: 'Patrol',
            offense_type: 'Disciplinary',
            offense,
            weight,
            description: 'Valid description',
            evidence_url: null,
            related_entity_id: null,
            related_entity_type: null,
          };
          data[fieldToEmpty] = '';
          const result = penaltyFormSchema.safeParse(data);
          expect(result.success).toBe(false);
        }
      ),
      { numRuns: 30 }
    );
  });
});
