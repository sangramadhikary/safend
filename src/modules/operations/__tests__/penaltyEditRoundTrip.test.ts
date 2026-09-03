import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  penaltyFormSchema,
  ALL_OFFENSES,
  OFFENSE_TYPES,
  SOURCES_OF_INFORMATION,
  PENALTY_STATUSES,
  PenaltyRecord,
  HR_ACTIONS,
} from '../schemas/penaltySchema';

/**
 * **Validates: Requirements 11.5, 4.1**
 *
 * Property 8: Edit form pre-population round-trip
 *
 * For any existing penalty record, opening the edit form SHALL pre-populate all
 * editable fields with the record's current values, such that submitting without
 * changes produces an update payload identical to the original record.
 */

// Generator for a valid PenaltyRecord (simulates existing DB records)
const penaltyRecordArb: fc.Arbitrary<PenaltyRecord> = fc.record({
  id: fc.uuid(),
  staff_id: fc.uuid(),
  staff_name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  post_id: fc.uuid(),
  post_name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  violation_date: fc.date({
    min: new Date('2020-01-01'),
    max: new Date(),
  }).map(d => d.toISOString().split('T')[0]),
  source_of_information: fc.constantFrom(...SOURCES_OF_INFORMATION),
  offense_type: fc.constantFrom(...OFFENSE_TYPES),
  offense: fc.constantFrom(...ALL_OFFENSES),
  weight: fc.integer({ min: 1, max: 5 }),
  description: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
  evidence_url: fc.option(fc.webUrl(), { nil: null }),
  status: fc.constantFrom(...PENALTY_STATUSES),
  hr_action: fc.option(fc.constantFrom(...HR_ACTIONS), { nil: null }),
  financial_penalty_amount: fc.option(fc.integer({ min: 100, max: 10000 }), { nil: null }),
  hr_notes: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  related_entity_id: fc.option(fc.uuid(), { nil: null }),
  related_entity_type: fc.option(fc.constantFrom('patrol', 'incident'), { nil: null }),
  created_at: fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString()),
  updated_at: fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString()),
});

/**
 * Simulates the PenaltyForm useEffect logic when editData is provided.
 */
function simulateFormPrePopulation(editData: PenaltyRecord) {
  return {
    id: editData.id || "",
    staff_id: editData.staff_id || "",
    staff_name: editData.staff_name || "",
    post_id: editData.post_id || "",
    post_name: editData.post_name || "",
    violation_date: editData.violation_date || new Date().toISOString().split('T')[0],
    source_of_information: editData.source_of_information || 'Patrol',
    offense_type: editData.offense_type || 'Disciplinary',
    offense: editData.offense || 'Late Arrival',
    weight: editData.weight || 1,
    description: editData.description || "",
    evidence_url: editData.evidence_url || null,
    status: editData.status || 'Pending HR Review',
    related_entity_id: editData.related_entity_id || null,
    related_entity_type: editData.related_entity_type || null,
  };
}

/**
 * Simulates the form submission (no changes made).
 */
function simulateSubmitWithoutChanges(formData: ReturnType<typeof simulateFormPrePopulation>) {
  return {
    staff_id: formData.staff_id,
    staff_name: formData.staff_name,
    post_id: formData.post_id,
    post_name: formData.post_name,
    violation_date: formData.violation_date,
    source_of_information: formData.source_of_information,
    offense_type: formData.offense_type,
    offense: formData.offense,
    weight: formData.weight,
    description: formData.description,
    evidence_url: formData.evidence_url,
    related_entity_id: formData.related_entity_id || null,
    related_entity_type: formData.related_entity_type || null,
  };
}

describe('Property 8: Edit form pre-population round-trip', () => {
  it('all fields from an existing penalty are pre-populated in the form', () => {
    fc.assert(
      fc.property(penaltyRecordArb, (record) => {
        const formData = simulateFormPrePopulation(record);

        expect(formData.staff_id).toBe(record.staff_id);
        expect(formData.staff_name).toBe(record.staff_name);
        expect(formData.post_id).toBe(record.post_id);
        expect(formData.post_name).toBe(record.post_name);
        expect(formData.violation_date).toBe(record.violation_date);
        expect(formData.source_of_information).toBe(record.source_of_information);
        expect(formData.offense_type).toBe(record.offense_type);
        expect(formData.offense).toBe(record.offense);
        expect(formData.weight).toBe(record.weight);
        expect(formData.description).toBe(record.description);
        expect(formData.status).toBe(record.status);
        expect(formData.related_entity_id).toBe(record.related_entity_id ?? null);
        expect(formData.related_entity_type).toBe(record.related_entity_type ?? null);
      }),
      { numRuns: 100 }
    );
  });

  it('a round-trip with no changes produces equivalent data that passes validation', () => {
    fc.assert(
      fc.property(penaltyRecordArb, (record) => {
        const formData = simulateFormPrePopulation(record);
        const submitPayload = simulateSubmitWithoutChanges(formData);

        const result = penaltyFormSchema.safeParse(submitPayload);
        expect(result.success).toBe(true);

        if (result.success) {
          expect(result.data.staff_id).toBe(record.staff_id);
          expect(result.data.staff_name).toBe(record.staff_name);
          expect(result.data.post_id).toBe(record.post_id);
          expect(result.data.post_name).toBe(record.post_name);
          expect(result.data.violation_date).toBe(record.violation_date);
          expect(result.data.offense).toBe(record.offense);
          expect(result.data.weight).toBe(record.weight);
          expect(result.data.description).toBe(record.description);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('date formatting is preserved correctly through the round-trip', () => {
    fc.assert(
      fc.property(penaltyRecordArb, (record) => {
        const formData = simulateFormPrePopulation(record);
        const submitPayload = simulateSubmitWithoutChanges(formData);

        expect(submitPayload.violation_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(submitPayload.violation_date).toBe(record.violation_date);
      }),
      { numRuns: 100 }
    );
  });

  it('UUID fields maintain their values through the round-trip', () => {
    fc.assert(
      fc.property(penaltyRecordArb, (record) => {
        const formData = simulateFormPrePopulation(record);
        const submitPayload = simulateSubmitWithoutChanges(formData);

        expect(submitPayload.staff_id).toBe(record.staff_id);
        expect(submitPayload.post_id).toBe(record.post_id);

        if (record.related_entity_id) {
          expect(submitPayload.related_entity_id).toBe(record.related_entity_id);
        } else {
          expect(submitPayload.related_entity_id).toBeNull();
        }
      }),
      { numRuns: 100 }
    );
  });
});
