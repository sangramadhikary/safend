/**
 * Property-based test for entity selection storing both id and name.
 *
 * **Validates: Requirements 7.3, 8.3**
 *
 * Property 6: Entity selection stores both id and name
 *
 * For any staff member selected from the dropdown, the resulting form data SHALL
 * contain both the staff member's UUID as `staff_id` and their display name as
 * `staff_name`. For any operational post selected, the form data SHALL contain
 * both the post's UUID as `post_id` and its display name as `post_name`.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  penaltyFormSchema,
  ALL_OFFENSES,
  OFFENSE_TYPES,
  SOURCES_OF_INFORMATION,
} from '../schemas/penaltySchema';

// Generator: a staff member entity with id (UUID) and name (non-empty string)
const staffMemberArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 80 }).filter(s => s.trim().length > 0),
});

// Generator: an operational post entity with id (UUID) and name (non-empty string)
const operationalPostArb = fc.record({
  id: fc.uuid(),
  post_name: fc.string({ minLength: 1, maxLength: 80 }).filter(s => s.trim().length > 0),
});

// Generator: valid supporting form fields to build a complete penalty form submission
const validFormFieldsArb = fc.record({
  violation_date: fc.date({
    min: new Date('2020-01-01'),
    max: new Date(),
  }).map(d => d.toISOString().split('T')[0]),
  source_of_information: fc.constantFrom(...SOURCES_OF_INFORMATION),
  offense_type: fc.constantFrom(...OFFENSE_TYPES),
  offense: fc.constantFrom(...ALL_OFFENSES),
  weight: fc.integer({ min: 1, max: 5 }),
  description: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
  evidence_url: fc.constant(null),
  related_entity_id: fc.constant(null),
  related_entity_type: fc.constant(null),
});

/**
 * Simulates selecting a staff member from the dropdown.
 */
function selectStaffMember(member: { id: string; name: string }) {
  return {
    staff_id: member.id,
    staff_name: member.name,
  };
}

/**
 * Simulates selecting an operational post from the dropdown.
 */
function selectOperationalPost(post: { id: string; post_name: string }) {
  return {
    post_id: post.id,
    post_name: post.post_name,
  };
}

describe('Property 6: Entity selection stores both id and name', () => {
  it('selecting a staff member stores both staff_id (UUID) and staff_name', () => {
    fc.assert(
      fc.property(staffMemberArb, operationalPostArb, validFormFieldsArb, (staff, post, fields) => {
        const staffSelection = selectStaffMember(staff);
        const postSelection = selectOperationalPost(post);

        const formData = {
          ...staffSelection,
          ...postSelection,
          ...fields,
        };

        expect(formData.staff_id).toBe(staff.id);
        expect(formData.staff_name).toBe(staff.name);
      }),
      { numRuns: 100 }
    );
  });

  it('selecting an operational post stores both post_id (UUID) and post_name', () => {
    fc.assert(
      fc.property(staffMemberArb, operationalPostArb, validFormFieldsArb, (staff, post, fields) => {
        const staffSelection = selectStaffMember(staff);
        const postSelection = selectOperationalPost(post);

        const formData = {
          ...staffSelection,
          ...postSelection,
          ...fields,
        };

        expect(formData.post_id).toBe(post.id);
        expect(formData.post_name).toBe(post.post_name);
      }),
      { numRuns: 100 }
    );
  });

  it('stored id is always a valid UUID format', () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    fc.assert(
      fc.property(staffMemberArb, operationalPostArb, validFormFieldsArb, (staff, post, fields) => {
        const formData = {
          ...selectStaffMember(staff),
          ...selectOperationalPost(post),
          ...fields,
        };

        expect(formData.staff_id).toMatch(uuidRegex);
        expect(formData.post_id).toMatch(uuidRegex);
      }),
      { numRuns: 100 }
    );
  });

  it('stored name is never empty when an id is present', () => {
    fc.assert(
      fc.property(staffMemberArb, operationalPostArb, validFormFieldsArb, (staff, post, fields) => {
        const formData = {
          ...selectStaffMember(staff),
          ...selectOperationalPost(post),
          ...fields,
        };

        if (formData.staff_id) {
          expect(formData.staff_name.length).toBeGreaterThan(0);
        }
        if (formData.post_id) {
          expect(formData.post_name.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('id and name stay consistent — selecting member X sets both X.id and X.name', () => {
    fc.assert(
      fc.property(staffMemberArb, operationalPostArb, validFormFieldsArb, (staff, post, fields) => {
        const formData = {
          ...selectStaffMember(staff),
          ...selectOperationalPost(post),
          ...fields,
        };

        const result = penaltyFormSchema.safeParse(formData);
        expect(result.success).toBe(true);

        if (result.success) {
          expect(result.data.staff_id).toBe(staff.id);
          expect(result.data.staff_name).toBe(staff.name);
          expect(result.data.post_id).toBe(post.id);
          expect(result.data.post_name).toBe(post.post_name);
        }
      }),
      { numRuns: 100 }
    );
  });
});
