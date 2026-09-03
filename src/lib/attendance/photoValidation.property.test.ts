import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  ACCEPTED_PHOTO_CONTENT_TYPES,
  MAX_PHOTO_SIZE_BYTES,
  isAcceptablePhoto,
  validatePhoto,
} from './photoValidation';

// Feature: qr-field-attendance, Property 13: Photo acceptability
// **Validates: Requirements 14.4, 14.5**
describe('Property 13: Photo acceptability', () => {
  it('accepts a photo iff its size and content type satisfy both allowlists', () => {
    const sizeArb = fc.oneof(
      fc.integer({ min: -MAX_PHOTO_SIZE_BYTES, max: MAX_PHOTO_SIZE_BYTES * 2 }),
      fc.constantFrom(
        Number.NaN,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        0,
        1,
        MAX_PHOTO_SIZE_BYTES,
        MAX_PHOTO_SIZE_BYTES + 1,
      ),
    );
    const contentTypeArb = fc.oneof(
      fc.string(),
      fc.constantFrom(
        ...ACCEPTED_PHOTO_CONTENT_TYPES,
        'image/jpg',
        'image/jpeg; charset=utf-8',
        'IMAGE/PNG',
      ),
    );

    fc.assert(
      fc.property(sizeArb, contentTypeArb, (size, contentType) => {
        const validSize =
          Number.isFinite(size) && size > 0 && size <= MAX_PHOTO_SIZE_BYTES;
        const validContentType = (ACCEPTED_PHOTO_CONTENT_TYPES as readonly string[]).includes(
          contentType,
        );
        const expectedAcceptable = validSize && validContentType;

        expect(isAcceptablePhoto(size, contentType)).toBe(expectedAcceptable);
        expect(validatePhoto(size, contentType).ok).toBe(expectedAcceptable);
      }),
      { numRuns: 250 },
    );
  });
});
