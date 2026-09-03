import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { requiresAttachment, INLINE_UNSAFE_TYPES } from '../content-type';

/**
 * Feature: security-hardening, Property 12: Inline-unsafe types map to an attachment disposition
 *
 * Validates: Requirements 9.7
 *
 * For any declared MIME type, the attachment-required predicate returns true if
 * and only if the type is one of the inline-unsafe types (image/svg+xml,
 * text/plain, text/csv, application/rtf).
 */
describe('Property 12: Inline-unsafe types map to an attachment disposition', () => {
  const inlineUnsafe = INLINE_UNSAFE_TYPES as readonly string[];

  it('returns true iff the declared type is one of the inline-unsafe types', () => {
    // Generator mixes guaranteed inline-unsafe types with arbitrary strings so
    // both branches of the iff are exercised across the input space.
    const arbType = fc.oneof(
      fc.constantFrom(...inlineUnsafe),
      fc.string(),
    );

    fc.assert(
      fc.property(arbType, (declaredType) => {
        const expected = inlineUnsafe.includes(declaredType);
        expect(requiresAttachment(declaredType)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('every inline-unsafe type requires an attachment disposition', () => {
    fc.assert(
      fc.property(fc.constantFrom(...inlineUnsafe), (declaredType) => {
        expect(requiresAttachment(declaredType)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
