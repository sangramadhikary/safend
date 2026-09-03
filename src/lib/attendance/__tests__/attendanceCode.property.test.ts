import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  ATTENDANCE_SCHEME,
  ATTENDANCE_VERSION,
  formatAttendanceCode,
  isUuid,
  parseAttendanceCode,
} from '../attendanceCode';

/**
 * **Validates: Requirements 1.2, 1.3, 1.4, 16.1, 16.5**
 *
 * Feature: qr-field-attendance, Property 1: Attendance code round-trip and classification
 */

const codePrefix = `${ATTENDANCE_SCHEME}:${ATTENDANCE_VERSION}:`;
const hexCharacter = fc.constantFrom(...'0123456789abcdefABCDEF');
const hexSegment = (length: number) =>
  fc.array(hexCharacter, { minLength: length, maxLength: length }).map((characters) =>
    characters.join(''),
  );

const validPostId = fc
  .tuple(hexSegment(8), hexSegment(4), hexSegment(4), hexSegment(4), hexSegment(12))
  .map((segments) => segments.join('-'));

const malformedPayload = fc.oneof(
  fc.string({ maxLength: 100 }).filter((payload) => !isUuid(payload.trimEnd())),
  validPostId.map((postId) => `${postId}x`),
);

// A "not-attendance" code uses a scheme the parser does not recognise at all.
// Note: `safend-attendance:v2:...` is NOT included here — the parser now
// supports a v2 signed format, so those are classified as `ok`/`malformed`,
// never `not-attendance`. Only genuinely foreign schemes belong here.
const nonAttendanceCode = fc.oneof(
  fc
    .string({ maxLength: 100 })
    .filter(
      (raw) =>
        !raw.trim().startsWith(codePrefix) &&
        !raw.trim().startsWith(`${ATTENDANCE_SCHEME}:v2:`),
    ),
  // Different scheme name entirely (case-sensitive prefix mismatch).
  fc.string({ maxLength: 100 }).map((payload) => `SAFEND-ATTENDANCE:${ATTENDANCE_VERSION}:${payload}`),
);

describe('Property 1: Attendance code round-trip and classification', () => {
  it('round-trips valid post IDs and classifies malformed and unrelated codes', () => {
    fc.assert(
      fc.property(
        validPostId,
        malformedPayload,
        nonAttendanceCode,
        fc.integer({ min: 1, max: 5 }),
        (postId, invalidPayload, unrelatedCode, repetitions) => {
          const formatted = formatAttendanceCode(postId);

          expect(parseAttendanceCode(formatted)).toEqual({ kind: 'ok', postId });

          for (let index = 0; index < repetitions; index += 1) {
            expect(parseAttendanceCode(formatAttendanceCode(postId))).toEqual({
              kind: 'ok',
              postId,
            });
          }

          expect(parseAttendanceCode(`${codePrefix}${invalidPayload}`)).toEqual({
            kind: 'malformed',
          });
          expect(parseAttendanceCode(unrelatedCode)).toEqual({ kind: 'not-attendance' });
        },
      ),
      { numRuns: 100 },
    );
  });
});
