// Feature: security-hardening, Property 15: PII projection exposes only allowlisted fields

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { projectVerificationFields, VERIFICATION_FIELDS } from '../pii';

/**
 * Property 15: PII projection exposes only allowlisted fields.
 *
 * For any input record — including ones carrying arbitrary extra and/or
 * sensitive keys — the key set of `projectVerificationFields(record)` is always
 * a subset of {@link VERIFICATION_FIELDS}. No attribute outside the allowlist
 * (e.g. `id`, `branch_id`, salary, contact details, or unknown columns) is ever
 * present on the output.
 *
 * Validates: Requirements 12.2
 */
describe('Property 15: PII projection exposes only allowlisted fields', () => {
  const allowlist = new Set<string>(VERIFICATION_FIELDS);

  // Keys drawn from the allowlist, so projection has something to copy.
  const allowlistedKeyArb = fc.constantFrom(...VERIFICATION_FIELDS);
  // Arbitrary keys, including sensitive-looking and unknown ones, plus
  // occasional collisions with the allowlist to exercise mixed records.
  const arbitraryKeyArb = fc.oneof(
    fc.string(),
    fc.constantFrom(
      'id',
      'branch_id',
      'salary',
      'email',
      'phone',
      'password',
      'ssn',
      '__proto__',
    ),
    allowlistedKeyArb,
  );

  // A record built from arbitrary key/value pairs, mixing allowlisted and
  // non-allowlisted keys with arbitrary values.
  const recordArb = fc.dictionary(
    fc.oneof(allowlistedKeyArb, arbitraryKeyArb),
    fc.anything(),
  ) as fc.Arbitrary<Record<string, unknown>>;

  it('output key set is always a subset of the allowlist', () => {
    fc.assert(
      fc.property(recordArb, (record) => {
        const projected = projectVerificationFields(record);
        for (const key of Object.keys(projected)) {
          expect(allowlist.has(key)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('drops every non-allowlisted key even when present on the input', () => {
    fc.assert(
      fc.property(recordArb, (record) => {
        const projected = projectVerificationFields(record);
        const projectedKeys = Object.keys(projected);
        for (const inputKey of Object.keys(record)) {
          if (!allowlist.has(inputKey)) {
            expect(projectedKeys.includes(inputKey)).toBe(false);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
