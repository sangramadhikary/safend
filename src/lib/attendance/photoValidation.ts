/**
 * Photo acceptability rules for QR field-attendance check-in submissions.
 *
 * This is a pure, dependency-free module. It encodes the server-side
 * pre-store validation applied before a captured photo is uploaded to the
 * private `attendance-photos` bucket (see design "Check-In Service" step 3).
 *
 * A photo is acceptable if and only if:
 *   - its size is greater than 0 and no more than 10,485,760 bytes (10 MiB), and
 *   - its content type is `image/jpeg` or `image/png`.
 *
 * Requirements: 14.4, 14.5
 */

/** Maximum accepted photo size in bytes (10,485,760 = 10 MiB). */
export const MAX_PHOTO_SIZE_BYTES = 10_485_760;

/** Content types accepted for attendance photos. */
export const ACCEPTED_PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png'] as const;

export type AcceptedPhotoContentType = (typeof ACCEPTED_PHOTO_CONTENT_TYPES)[number];

/** Machine-readable reason a photo was rejected. */
export type PhotoRejectionReason = 'invalid_size' | 'invalid_content_type';

export type PhotoValidationResult =
  | { ok: true }
  | { ok: false; reason: PhotoRejectionReason };

/**
 * Whether a photo size (in bytes) is within the accepted range.
 * Valid when `0 < size <= MAX_PHOTO_SIZE_BYTES`. Non-finite or non-numeric
 * sizes are rejected.
 */
export function isAcceptablePhotoSize(size: unknown): size is number {
  return (
    typeof size === 'number' &&
    Number.isFinite(size) &&
    size > 0 &&
    size <= MAX_PHOTO_SIZE_BYTES
  );
}

/**
 * Whether a content type is one of the accepted image types
 * (`image/jpeg` or `image/png`).
 */
export function isAcceptablePhotoContentType(
  contentType: unknown,
): contentType is AcceptedPhotoContentType {
  return (
    typeof contentType === 'string' &&
    (ACCEPTED_PHOTO_CONTENT_TYPES as readonly string[]).includes(contentType)
  );
}

/**
 * Combined acceptability predicate: true iff both the size and the content
 * type are acceptable.
 */
export function isAcceptablePhoto(size: unknown, contentType: unknown): boolean {
  return isAcceptablePhotoSize(size) && isAcceptablePhotoContentType(contentType);
}

/**
 * Validate a photo's size and content type, returning a machine-readable
 * rejection reason when unacceptable. Size is checked before content type.
 */
export function validatePhoto(size: unknown, contentType: unknown): PhotoValidationResult {
  if (!isAcceptablePhotoSize(size)) {
    return { ok: false, reason: 'invalid_size' };
  }
  if (!isAcceptablePhotoContentType(contentType)) {
    return { ok: false, reason: 'invalid_content_type' };
  }
  return { ok: true };
}
