/**
 * Attendance QR code scheme (pure, dependency-free).
 *
 * A posted QR code encodes a single post identifier using a namespaced,
 * versioned URI so that unrelated QR codes are unambiguously rejected:
 *
 *   safend-attendance:v1:<post_id>
 *
 * where `<post_id>` is a canonical UUID. Parsing distinguishes three
 * outcomes required by the scanner flow:
 *   - `ok`              — correct scheme and a syntactically valid post_id (R1.2)
 *   - `malformed`       — correct scheme but a bad/missing post_id     (R1.3)
 *   - `not-attendance`  — wrong scheme entirely                        (R1.4)
 *
 * `formatAttendanceCode` and `parseAttendanceCode` round-trip for any valid
 * post_id, which anchors per-post QR generation (R16.1, R16.5).
 */

export const ATTENDANCE_SCHEME = 'safend-attendance';
export const ATTENDANCE_VERSION = 'v1';

/** Prefix shared by every attendance code, e.g. "safend-attendance:v1:". */
const CODE_PREFIX = `${ATTENDANCE_SCHEME}:${ATTENDANCE_VERSION}:`;

/**
 * The result of parsing raw scanned text against the attendance scheme.
 * - `ok`: correct scheme with a valid UUID `postId`.
 * - `malformed`: correct scheme prefix, but the payload is not a valid UUID.
 * - `not-attendance`: the text does not use the attendance scheme at all.
 */
export type ParseResult =
  | { kind: 'ok'; postId: string }
  | { kind: 'malformed' }
  | { kind: 'not-attendance' };

/**
 * Canonical UUID matcher (RFC 4122 form: 8-4-4-4-12 hex digits).
 * Accepts any version/variant nibble to stay permissive about the UUID
 * generation strategy while still rejecting non-UUID payloads. Matching is
 * case-insensitive.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns true when `value` is a syntactically valid canonical UUID. */
export function isUuid(value: string): boolean {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Builds the QR payload for a post. The `postId` must be a valid UUID;
 * passing an invalid value throws so callers never generate a code that the
 * scanner would classify as `malformed`.
 */
export function formatAttendanceCode(postId: string): string {
  if (!isUuid(postId)) {
    throw new Error(`Invalid post_id for attendance code: ${String(postId)}`);
  }
  return `${CODE_PREFIX}${postId}`;
}

/**
 * Parses raw scanned QR text into a `ParseResult`.
 *
 * Supports both formats:
 *   - v1: safend-attendance:v1:<post_id>
 *   - v2: safend-attendance:v2:<post_id>:<timestamp>:<signature>
 *
 * For v2, this only extracts the postId client-side. The actual HMAC
 * verification happens server-side at /api/attendance/checkin/verify.
 */
export function parseAttendanceCode(raw: string): ParseResult {
  if (typeof raw !== 'string') {
    return { kind: 'not-attendance' };
  }

  const text = raw.trim();

  // v2 signed format: safend-attendance:v2:{postId}:{timestamp}:{signature}
  if (text.startsWith(`${ATTENDANCE_SCHEME}:v2:`)) {
    const parts = text.split(':');
    if (parts.length !== 5) {
      return { kind: 'malformed' };
    }
    const postId = parts[2];
    if (!isUuid(postId)) {
      return { kind: 'malformed' };
    }
    return { kind: 'ok', postId };
  }

  // v1 legacy format: safend-attendance:v1:<post_id>
  if (!text.startsWith(CODE_PREFIX)) {
    return { kind: 'not-attendance' };
  }

  const payload = text.slice(CODE_PREFIX.length);

  if (!isUuid(payload)) {
    return { kind: 'malformed' };
  }

  return { kind: 'ok', postId: payload };
}
