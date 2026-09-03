import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { z } from 'zod';
import { validateRequestBody, MAX_FIELD_LENGTH } from '../request-validation';

// Feature: security-hardening, Property 5: Request-body validation enforces schema and the per-field length cap
//
// For any request body validated against a schema, validation rejects any
// string field that exceeds MAX_FIELD_LENGTH characters, accepts a conforming
// body whose string fields are all within the cap, and never mutates the input.
//
// Validates: Requirements 8.1
describe('validateRequestBody', () => {
  // A schema mirroring a typical request body: a required name plus an optional
  // free-text note. Length is intentionally left unconstrained in the schema so
  // the universal per-field cap is what enforces the limit.
  const schema = z.object({
    name: z.string(),
    note: z.string().optional(),
  });

  it('Property 5: rejects any body containing a string field exceeding the per-field length cap', () => {
    fc.assert(
      fc.property(
        // A conforming base name within the cap.
        fc.string({ minLength: 0, maxLength: 50 }),
        // An over-length value: strictly greater than MAX_FIELD_LENGTH.
        fc.integer({ min: MAX_FIELD_LENGTH + 1, max: MAX_FIELD_LENGTH + 200 }),
        // Whether the over-length value lands in `name` or in `note`.
        fc.boolean(),
        (baseName, overLength, putInNote) => {
          const tooLong = 'a'.repeat(overLength);
          const body = putInNote
            ? { name: baseName, note: tooLong }
            : { name: tooLong };
          const snapshot = JSON.stringify(body);

          const result = validateRequestBody(schema, body);

          expect(result.ok).toBe(false);
          // Input must never be mutated.
          expect(JSON.stringify(body)).toBe(snapshot);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 5: accepts a conforming body whose string fields are all within the cap', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: MAX_FIELD_LENGTH }),
        fc.option(fc.string({ minLength: 0, maxLength: MAX_FIELD_LENGTH }), { nil: undefined }),
        (name, note) => {
          const body = note === undefined ? { name } : { name, note };
          const snapshot = JSON.stringify(body);

          const result = validateRequestBody(schema, body);

          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.data.name).toBe(name);
            expect(result.data.note).toBe(note);
          }
          // Input must never be mutated.
          expect(JSON.stringify(body)).toBe(snapshot);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 5: a string exactly at the cap is accepted while one character over is rejected', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const atCap = { name: 'a'.repeat(MAX_FIELD_LENGTH) };
        const overCap = { name: 'a'.repeat(MAX_FIELD_LENGTH + 1) };

        expect(validateRequestBody(schema, atCap).ok).toBe(true);
        expect(validateRequestBody(schema, overCap).ok).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
