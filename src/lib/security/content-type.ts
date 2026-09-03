/**
 * Upload content-type controls (Requirements 9.2, 9.3, 9.4, 9.7).
 *
 * Pure-function extraction of the type/size/magic-byte/disposition logic that
 * previously lived inline in `app/api/upload/route.ts`. Keeping these as pure
 * functions makes them independently testable (the property-based-testing
 * target) and guarantees consistent behaviour wherever uploads are validated.
 *
 * - `isAllowedType` — membership in the allowed-types union (image ∪ video ∪
 *   document). (Req 9.2)
 * - `contentMatchesDeclaredType` — best-effort magic-byte match for
 *   signature-checkable types; pass-through for unsignable types. (Req 9.3)
 * - `maxSizeForType` — per-category byte cap. (Req 9.4)
 * - `requiresAttachment` — inline-unsafe types that must be served with a
 *   `Content-Disposition: attachment`. (Req 9.7)
 */

// ── Allowed-type lists (mirror app/api/upload/route.ts) ───────────────────────

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
  'image/tiff',
] as const;

export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-ms-wmv',
  'video/mpeg',
  'video/3gpp',
] as const;

export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/rtf',
  'application/zip',
  'application/x-rar-compressed',
] as const;

export const ALLOWED_TYPES: readonly string[] = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
  ...ALLOWED_DOCUMENT_TYPES,
];

// ── Per-category size caps (Req 9.4) ──────────────────────────────────────────

/** Maximum size for image types: 10 MB. */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
/** Maximum size for video types: 100 MB. */
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
/** Maximum size for all other allowed (document) types: 50 MB. */
export const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024;

// ── Inline-unsafe types (Req 9.7) ─────────────────────────────────────────────

/**
 * Types that a browser may render inline with active/script content. They are
 * permitted as uploads but must be served with `Content-Disposition: attachment`
 * so they can never execute inline from the storage origin (stored-XSS
 * mitigation).
 */
export const INLINE_UNSAFE_TYPES = [
  'image/svg+xml',
  'text/plain',
  'text/csv',
  'application/rtf',
] as const;

/**
 * True iff the declared MIME type is in the allowed-types union (the union of
 * the allowed image, video, and document type lists). (Req 9.2)
 *
 * @param declaredType - the client-declared MIME type
 */
export function isAllowedType(declaredType: string): boolean {
  return ALLOWED_TYPES.includes(declaredType);
}

/**
 * Resolve the size cap (in bytes) for a declared MIME type's category. Image
 * types cap at 10 MB, video types at 100 MB, and every other allowed type
 * (documents) at 50 MB. (Req 9.4)
 *
 * Types outside the allowed-types union fall through to the document cap; callers
 * should reject disallowed types via {@link isAllowedType} before checking size.
 *
 * @param declaredType - the client-declared MIME type
 */
export function maxSizeForType(declaredType: string): number {
  if ((ALLOWED_VIDEO_TYPES as readonly string[]).includes(declaredType)) {
    return MAX_VIDEO_SIZE;
  }
  if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(declaredType)) {
    return MAX_IMAGE_SIZE;
  }
  return MAX_DOCUMENT_SIZE;
}

/**
 * True iff the declared MIME type can carry inline active content and therefore
 * must be stored with a `Content-Disposition: attachment`. (Req 9.7)
 *
 * @param declaredType - the client-declared MIME type
 */
export function requiresAttachment(declaredType: string): boolean {
  return (INLINE_UNSAFE_TYPES as readonly string[]).includes(declaredType);
}

/**
 * Best-effort magic-byte check: verify a file's actual leading bytes match its
 * declared MIME type for common binary formats. The client-declared MIME type
 * is spoofable, so this catches mismatches (e.g. an HTML/script payload sent as
 * `image/png`). Types without a single reliable signature (SVG, text/csv, tiff
 * variants, most video containers, rar) pass through. (Req 9.3)
 *
 * @param leadingBytes - the leading bytes of the uploaded file
 * @param declaredType - the client-declared MIME type
 * @returns true when the signature matches (or the type is unsignable), false otherwise
 */
export function contentMatchesDeclaredType(
  leadingBytes: Uint8Array,
  declaredType: string,
): boolean {
  const startsWith = (...bytes: number[]) =>
    bytes.every((b, i) => leadingBytes[i] === b);
  const asciiAt = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      if (leadingBytes[offset + i] !== text.charCodeAt(i)) return false;
    }
    return true;
  };

  switch (declaredType) {
    case 'image/jpeg':
      return startsWith(0xff, 0xd8, 0xff);
    case 'image/png':
      return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/gif':
      return asciiAt(0, 'GIF87a') || asciiAt(0, 'GIF89a');
    case 'image/webp':
      return asciiAt(0, 'RIFF') && asciiAt(8, 'WEBP');
    case 'image/bmp':
      return asciiAt(0, 'BM');
    case 'application/pdf':
      return asciiAt(0, '%PDF-');
    // ZIP-based containers (Office Open XML, zip): "PK\x03\x04" / "PK\x05\x06".
    case 'application/zip':
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return startsWith(0x50, 0x4b, 0x03, 0x04) || startsWith(0x50, 0x4b, 0x05, 0x06);
    // Legacy OLE2 Office docs: D0 CF 11 E0 A1 B1 1A E1.
    case 'application/msword':
    case 'application/vnd.ms-excel':
    case 'application/vnd.ms-powerpoint':
      return startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    default:
      // Formats without a reliable signature are allowed through the byte check.
      return true;
  }
}
