import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  buildPendingCheckInRecord,
  parseCheckInFields,
  REQUIRED_CHECK_IN_FIELDS,
  type PendingCheckInRecord,
} from './checkinSchema';

// Feature: qr-field-attendance, Property 7: Missing required field is rejected without a record
// **Validates: Requirements 7.6**

const nonBlankTokenArb = fc.string({
  unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('')),
  minLength: 1,
  maxLength: 50,
});

const validSubmissionArb = fc.record({
  post_id: fc.uuid(),
  employee_code: nonBlankTokenArb,
  shift_key: fc.constantFrom('day' as const, 'afternoon' as const, 'night' as const),
  service_type_key: nonBlankTokenArb,
  gps_lat: fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
  gps_lng: fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
  gps_accuracy_m: fc.double({ min: 0.001, max: 20_000, noNaN: true, noDefaultInfinity: true }),
  consent_accepted_at: fc.integer({ min: 0, max: 3_650 }).map(
    (days) => new Date(Date.UTC(2020, 0, 1 + days)).toISOString(),
  ),
});

describe('Property 7: Missing required field is rejected without a record', () => {
  it('names any omitted required field and does not construct a check-in record', () => {
    fc.assert(
      fc.property(
        validSubmissionArb,
        fc.constantFrom(...REQUIRED_CHECK_IN_FIELDS),
        (submission, omittedField) => {
          const raw: Record<string, unknown> = { ...submission };
          delete raw[omittedField];

          const validation = parseCheckInFields(raw);
          let record: PendingCheckInRecord | undefined;
          if (validation.ok) {
            record = buildPendingCheckInRecord({
              fields: validation.data,
              employeeUuid: '00000000-0000-4000-8000-000000000001',
              checkInDate: '2025-01-01',
              geofence: { distanceM: 0, radiusM: 50, withinGeofence: true, lowAccuracy: false },
              photoPath: 'attendance/2025-01-01/photo.jpg',
            });
          }

          expect(validation).toMatchObject({
            ok: false,
            reason: 'missing_field',
            field: omittedField,
          });
          if (!validation.ok) {
            expect(validation.message).toContain(omittedField);
          }
          expect(record).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});
