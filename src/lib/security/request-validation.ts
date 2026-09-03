/**
 * Request-body schema validation control (Requirement 8.1).
 *
 * Every API route that accepts a request body must validate it against a
 * schema and enforce a per-field maximum of 10,000 characters before the body
 * is used. A body that does not conform to the schema, or that carries any
 * string field longer than the cap, is rejected so the caller can respond with
 * HTTP 400 while preserving state and performing no side effect.
 *
 * This module is a pure function over (`schema`, `body`): it never performs
 * I/O and never mutates the input. Validation is built on `zod`, so callers
 * supply a `zod` schema describing the expected shape and the control layers
 * the universal per-field length cap on top of it.
 */

import type { ZodType } from 'zod';

/** Maximum allowed length, in characters, of any single string field value. */
export const MAX_FIELD_LENGTH = 10_000;

/** The outcome of validating a request body. */
export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Recursively determine whether any string value reachable within `value`
 * exceeds {@link MAX_FIELD_LENGTH} characters. Arrays and plain objects are
 * walked; non-string leaves are ignored. The input is only read, never
 * mutated.
 *
 * @returns the offending value's location path when one is found, else `null`.
 */
function findOverLengthField(value: unknown, path: string): string | null {
  if (typeof value === 'string') {
    return value.length > MAX_FIELD_LENGTH ? path || '(root)' : null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findOverLengthField(value[i], `${path}[${i}]`);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      const found = findOverLengthField(child, childPath);
      if (found) {
        return found;
      }
    }
    return null;
  }
  return null;
}

/**
 * Validate `body` against `schema` and enforce the per-field length cap.
 *
 * The body is accepted if and only if it conforms to `schema` **and** every
 * string value within it is at most {@link MAX_FIELD_LENGTH} characters. Any
 * non-conforming or over-length field causes rejection. The input is never
 * mutated; on success the parsed (schema-typed) value is returned.
 *
 * The length cap is checked first so an over-length field is rejected even
 * when the schema itself would have accepted it.
 *
 * @param schema - the `zod` schema describing the expected body shape
 * @param body - the parsed request body to validate (already JSON-decoded)
 * @returns a {@link ValidationResult} that never mutates `body`
 */
export function validateRequestBody<T>(
  schema: ZodType<T>,
  body: unknown,
): ValidationResult<T> {
  const overLengthPath = findOverLengthField(body, '');
  if (overLengthPath !== null) {
    return {
      ok: false,
      error: `Field "${overLengthPath}" exceeds the maximum length of ${MAX_FIELD_LENGTH} characters`,
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request body' };
  }

  return { ok: true, data: parsed.data };
}
