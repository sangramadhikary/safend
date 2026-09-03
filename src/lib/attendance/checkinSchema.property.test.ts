import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { buildPendingCheckInRecord, checkInFields } from './checkinSchema';
import { evaluateGeofence, type Coord } from './geo';

// Feature: qr-field-attendance, Property 6: Accepted submission produces a complete pending record
// **Validates: Requirements 7.2, 7.3**

const tokenArb = fc.string({
  unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('')),
  minLength: 1,
  maxLength: 50,
});
const dateTimeArb = fc
  .integer({ min: 0, max: 3_650 })
  .map((days) => new Date(Date.UTC(2020, 0, 1 + days)).toISOString());

const acceptedSubmissionArb = fc.record({
  post_id: fc.uuid(),
  employee_code: tokenArb,
  shift_key: fc.constantFrom('day' as const, 'afternoon' as const, 'night' as const),
  service_type_key: tokenArb,
  gps_lat: fc.double({ min: -89, max: 89, noNaN: true, noDefaultInfinity: true }),
  gps_lng: fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
  gps_accuracy_m: fc.double({ min: 0.001, max: 20_000, noNaN: true, noDefaultInfinity: true }),
  consent_accepted_at: dateTimeArb,
  employeeUuid: fc.uuid(),
  checkInDate: dateTimeArb.map((value) => value.slice(0, 10)),
  photoPath: fc.uuid().map((id) => `attendance/2025-01-01/${id}.jpg`),
  radiusM: fc.integer({ min: 1, max: 10_000 }),
  insideGeofence: fc.boolean(),
});

function postFor(gps: Coord, insideGeofence: boolean): Coord {
  if (insideGeofence) return gps;
  return { lat: gps.lat <= 88 ? gps.lat + 1 : gps.lat - 1, lng: gps.lng };
}
describe('Property 6: Accepted submission produces a complete pending record', () => {
  it('preserves every required field and the server-computed geofence result', () => {
    fc.assert(
      fc.property(acceptedSubmissionArb, (input) => {
        const fields = checkInFields.parse(input);
        const gps = { lat: fields.gps_lat, lng: fields.gps_lng };
        const geofence = evaluateGeofence(
          gps,
          postFor(gps, input.insideGeofence),
          fields.gps_accuracy_m,
          input.radiusM,
        );
        const record = buildPendingCheckInRecord({
          fields,
          employeeUuid: input.employeeUuid,
          checkInDate: input.checkInDate,
          geofence,
          photoPath: input.photoPath,
        });

        expect(record).toMatchObject({
          post_id: fields.post_id,
          employee_code: fields.employee_code,
          employee_uuid: input.employeeUuid,
          shift_key: fields.shift_key,
          service_type_key: fields.service_type_key,
          check_in_date: input.checkInDate,
          gps_lat: fields.gps_lat,
          gps_lng: fields.gps_lng,
          gps_accuracy_m: fields.gps_accuracy_m,
          distance_m: geofence.distanceM,
          within_geofence: geofence.withinGeofence,
          photo_path: input.photoPath,
          status: 'pending',
        });
        expect(record.gps_lat).toBeGreaterThanOrEqual(-90);
        expect(record.gps_lat).toBeLessThanOrEqual(90);
        expect(record.gps_lng).toBeGreaterThanOrEqual(-180);
        expect(record.gps_lng).toBeLessThanOrEqual(180);
        expect(record.gps_accuracy_m).toBeGreaterThanOrEqual(0);
        expect(record.distance_m).toBeGreaterThanOrEqual(0);
        expect(typeof record.within_geofence).toBe('boolean');
        expect(record.photo_path.length).toBeGreaterThan(0);
        expect(record.within_geofence).toBe(input.insideGeofence);
      }),
      { numRuns: 100 },
    );
  });
});