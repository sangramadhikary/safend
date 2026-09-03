import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { NextRequest } from 'next/server';

const { fromSpy } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://attendance.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  return { fromSpy: vi.fn() };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: fromSpy }),
}));

import { POST } from '../../../app/api/attendance/checkin/route';

// Feature: qr-field-attendance, Property 17: Server-side coordinate rejection
// **Validates: Requirements 6.9**

const nonNumericArb = fc.string({ minLength: 1, maxLength: 40 }).map((value) => `invalid:${value}`);
// The route distinguishes two rejection reasons (see route.ts / checkinSchema.ts):
//   - a MISSING coordinate is a generic `validation` error (reason: 'validation')
//   - a PRESENT but non-numeric / out-of-range coordinate is `invalid_location`
// Both must return 400 and create no record. We carry the expected reason with
// each generated case so the assertion matches the real behavior.
const invalidCoordinateArb = fc.oneof(
  fc.constant({ field: 'gps_lat' as const, value: undefined, expectedReason: 'validation' as const }),
  fc.constant({ field: 'gps_lng' as const, value: undefined, expectedReason: 'validation' as const }),
  nonNumericArb.map((value) => ({ field: 'gps_lat' as const, value, expectedReason: 'invalid_location' as const })),
  nonNumericArb.map((value) => ({ field: 'gps_lng' as const, value, expectedReason: 'invalid_location' as const })),
  fc.oneof(
    fc.double({ min: 90.000_000_000_1, max: 1e9, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: -1e9, max: -90.000_000_000_1, noNaN: true, noDefaultInfinity: true }),
  ).map((value) => ({ field: 'gps_lat' as const, value, expectedReason: 'invalid_location' as const })),
  fc.oneof(
    fc.double({ min: 180.000_000_000_1, max: 1e9, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: -1e9, max: -180.000_000_000_1, noNaN: true, noDefaultInfinity: true }),
  ).map((value) => ({ field: 'gps_lng' as const, value, expectedReason: 'invalid_location' as const })),
);

function requestFor(field: 'gps_lat' | 'gps_lng', value: unknown, clientId: number): NextRequest {
  const form = new FormData();
  const fields = {
    post_id: '00000000-0000-4000-8000-000000000001', employee_code: 'EMP001',
    shift_key: 'day', service_type_key: 'guarding', gps_lat: '12.9716', gps_lng: '77.5946',
    gps_accuracy_m: '5', consent_accepted_at: '2025-01-01T00:00:00.000Z',
  };
  for (const [key, entry] of Object.entries(fields)) if (key !== field) form.set(key, entry);
  if (value !== undefined) form.set(field, String(value));
  return new NextRequest('http://localhost/api/attendance/checkin', {
    method: 'POST', body: form, headers: { 'x-forwarded-for': `property-${clientId}` },
  });
}
describe('Property 17: Server-side coordinate rejection', () => {
  beforeEach(() => fromSpy.mockClear());

  it('rejects every missing, non-numeric, or out-of-range coordinate without creating a record', async () => {
    let clientId = 0;
    await fc.assert(
      fc.asyncProperty(invalidCoordinateArb, async ({ field, value, expectedReason }) => {
        const response = await POST(requestFor(field, value, clientId++));

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
          ok: false,
          reason: expectedReason,
          field,
        });
        expect(fromSpy).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});