import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { verifyInput } from './checkinSchema';

// Feature: qr-field-attendance, Property 18: Employee code validation
// **Validates: Requirements 3.8**

const whitespaceOnlyEmployeeCodeArb = fc.string({
  unit: fc.constantFrom(' ', '\t', '\n', '\r', '\u00a0'),
  minLength: 1,
  maxLength: 100,
});

const overlongEmployeeCodeArb = fc.string({
  unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('')),
  minLength: 51,
  maxLength: 100,
});

const invalidEmployeeCodeArb = fc.oneof(
  fc.constant(''),
  whitespaceOnlyEmployeeCodeArb,
  overlongEmployeeCodeArb,
);

describe('Property 18: Employee code validation', () => {
  it('rejects every empty, whitespace-only, or over-50-character code with no parsed lookup data', () => {
    fc.assert(
      fc.property(fc.uuid(), invalidEmployeeCodeArb, (postId, employeeCode) => {
        const result = verifyInput.safeParse({
          post_id: postId,
          employee_code: employeeCode,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ path: ['employee_code'] }),
            ]),
          );
          expect('data' in result).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
