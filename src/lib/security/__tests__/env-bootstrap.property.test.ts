import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  validateRequiredSecrets,
  assertRequiredSecrets,
  type EnvRecord,
} from '../env-bootstrap';

// Feature: security-hardening, Property 1: Required-secret bootstrap fails fast and names a missing variable
//
// For any set of required secret keys and any env-like record:
//  - When at least one required key is absent or empty (after trimming),
//    validation reports ok=false and `missing` lists only genuinely
//    missing/empty required keys (and `assertRequiredSecrets` throws naming one).
//  - When every required key is present and non-empty, validation reports
//    ok=true with an empty `missing` set (and `assertRequiredSecrets` does not throw).
//
// Validates: Requirements 4.3

/** A value that is genuinely missing: undefined or whitespace-only/empty string. */
const missingValueArb: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constant(''),
  // whitespace-only strings (spaces, tabs, newlines) are empty after trimming
  fc.string({ unit: fc.constantFrom(' ', '\t', '\n', '\r'), minLength: 1, maxLength: 5 }),
);

/** A value that counts as present: a non-empty string with at least one non-whitespace char. */
const presentValueArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => s.trim().length > 0);

/** A set of distinct required key names. */
const requiredKeysArb: fc.Arbitrary<string[]> = fc
  .uniqueArray(
    fc
      .string({ minLength: 1, maxLength: 12 })
      .filter((s) => s.trim().length > 0),
    { minLength: 1, maxLength: 8 },
  );

function isMissing(value: string | undefined): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

describe('validateRequiredSecrets', () => {
  it('Property 1: when any required key is missing/empty, ok=false and missing names only genuinely missing vars', () => {
    fc.assert(
      fc.property(
        requiredKeysArb.chain((keys) =>
          fc.record({
            keys: fc.constant(keys),
            // For each key, choose either a present or a missing value.
            values: fc.tuple(
              ...keys.map(() => fc.oneof(presentValueArb, missingValueArb)),
            ),
            // Pick at least one key index to force-be missing so the case is non-empty.
            forcedMissingIndex: fc.integer({ min: 0, max: keys.length - 1 }),
            forcedMissingValue: missingValueArb,
          }),
        ),
        ({ keys, values, forcedMissingIndex, forcedMissingValue }) => {
          // Use a null-prototype record so that ANY key name — including
          // prototype accessor names like `__proto__` — is stored as a genuine
          // own property. A plain `{}` would route `env['__proto__'] = ...`
          // through the inherited setter and silently drop the value.
          const env: EnvRecord = Object.create(null);
          keys.forEach((key, i) => {
            env[key] = values[i];
          });
          // Guarantee at least one genuinely missing required key.
          env[keys[forcedMissingIndex]] = forcedMissingValue;

          const result = validateRequiredSecrets(env, keys);

          // At least one missing => ok must be false.
          expect(result.ok).toBe(false);
          expect(result.missing.length).toBeGreaterThan(0);

          // Every reported key is a real required key that is genuinely missing.
          for (const reported of result.missing) {
            expect(keys).toContain(reported);
            expect(isMissing(env[reported])).toBe(true);
          }

          // The forced-missing key is named.
          expect(result.missing).toContain(keys[forcedMissingIndex]);

          // assertRequiredSecrets throws and names a genuinely missing variable.
          expect(() => assertRequiredSecrets(env, keys)).toThrowError(
            new RegExp(
              keys[forcedMissingIndex].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            ),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 1: when all required keys are present and non-empty, ok=true and missing is empty', () => {
    fc.assert(
      fc.property(
        requiredKeysArb.chain((keys) =>
          fc.record({
            keys: fc.constant(keys),
            values: fc.tuple(...keys.map(() => presentValueArb)),
          }),
        ),
        ({ keys, values }) => {
          // Null-prototype record: stores arbitrary key names (e.g. `__proto__`,
          // `constructor`) as real own properties rather than routing through
          // inherited accessors/methods.
          const env: EnvRecord = Object.create(null);
          keys.forEach((key, i) => {
            env[key] = values[i];
          });
          // Add some unrelated, possibly-empty extra keys; they must not affect the result.
          env['__UNRELATED_EMPTY__'] = '';
          env['__UNRELATED_PRESENT__'] = 'value';

          const result = validateRequiredSecrets(env, keys);

          expect(result.ok).toBe(true);
          expect(result.missing).toEqual([]);
          expect(() => assertRequiredSecrets(env, keys)).not.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });
});
