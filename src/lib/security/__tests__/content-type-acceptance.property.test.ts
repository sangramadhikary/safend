import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  ALLOWED_TYPES,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_DOCUMENT_TYPES,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
  MAX_DOCUMENT_SIZE,
  isAllowedType,
  maxSizeForType,
} from '../content-type';

/**
 * Feature: security-hardening, Property 9: Upload acceptance enforces type
 * membership and per-category size caps
 *
 * Validates: Requirements 9.2, 9.4
 *
 * Upload acceptance is the conjunction of two pure-function checks extracted
 * from the upload route:
 *   - type membership: `isAllowedType` must be true (Req 9.2)
 *   - size cap: the byte size must not exceed `maxSizeForType` (Req 9.4),
 *     where the cap is 10 MB for image types, 100 MB for video types, and
 *     50 MB for all other allowed (document) types.
 *
 * A file is "accepted" iff its declared type is in the allowed-types union and
 * its size is within the per-category cap.
 */
function isAccepted(declaredType: string, size: number): boolean {
  return isAllowedType(declaredType) && size <= maxSizeForType(declaredType);
}

/** Expected cap derived independently from the requirement, not the impl. */
function expectedCap(declaredType: string): number {
  if ((ALLOWED_VIDEO_TYPES as readonly string[]).includes(declaredType)) {
    return 100 * 1024 * 1024;
  }
  if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(declaredType)) {
    return 10 * 1024 * 1024;
  }
  return 50 * 1024 * 1024;
}

// Generators -----------------------------------------------------------------

const allowedTypeArb = fc.constantFrom(...ALLOWED_TYPES);

// Arbitrary strings that are NOT in the allowed-types union (disallowed types).
const disallowedTypeArb = fc
  .string()
  .filter((s) => !(ALLOWED_TYPES as readonly string[]).includes(s));

const sizeArb = fc.integer({ min: 0, max: 200 * 1024 * 1024 });

describe('Property 9: upload acceptance enforces type membership and size caps', () => {
  it('accepts an allowed type iff its size is within the per-category cap', () => {
    fc.assert(
      fc.property(allowedTypeArb, sizeArb, (declaredType, size) => {
        const cap = expectedCap(declaredType);
        const accepted = isAccepted(declaredType, size);
        if (size <= cap) {
          expect(accepted).toBe(true);
        } else {
          expect(accepted).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('rejects any disallowed type regardless of size', () => {
    fc.assert(
      fc.property(disallowedTypeArb, sizeArb, (declaredType, size) => {
        expect(isAllowedType(declaredType)).toBe(false);
        expect(isAccepted(declaredType, size)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('resolves the correct per-category cap for every allowed type', () => {
    fc.assert(
      fc.property(allowedTypeArb, (declaredType) => {
        expect(maxSizeForType(declaredType)).toBe(expectedCap(declaredType));
      }),
      { numRuns: 100 },
    );
  });

  it('rejects allowed types exactly one byte over the cap and accepts at the cap boundary', () => {
    fc.assert(
      fc.property(allowedTypeArb, (declaredType) => {
        const cap = expectedCap(declaredType);
        // At the boundary: accepted.
        expect(isAccepted(declaredType, cap)).toBe(true);
        // One byte over: rejected.
        expect(isAccepted(declaredType, cap + 1)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('uses the documented category caps (10/100/50 MB)', () => {
    expect(MAX_IMAGE_SIZE).toBe(10 * 1024 * 1024);
    expect(MAX_VIDEO_SIZE).toBe(100 * 1024 * 1024);
    expect(MAX_DOCUMENT_SIZE).toBe(50 * 1024 * 1024);
    for (const t of ALLOWED_DOCUMENT_TYPES) {
      expect(maxSizeForType(t)).toBe(MAX_DOCUMENT_SIZE);
    }
  });
});
