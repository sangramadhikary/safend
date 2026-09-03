import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';

import { EARTH_RADIUS_M, evaluateGeofence, haversineMeters } from './geo';

const coordinateArbitrary = fc.record({
  lat: fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
  lng: fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
});

describe('Property 4: Haversine distance and geofence comparison', () => {
  // Feature: qr-field-attendance, Property 4: Haversine distance and geofence comparison
  // **Validates: Requirements 6.1, 6.5, 6.6**
  it('computes a non-negative symmetric rounded distance and applies a strict radius comparison', () => {
    fc.assert(
      fc.property(
        coordinateArbitrary,
        coordinateArbitrary,
        fc.integer({ min: 1, max: 10_000 }),
        (a, b, radiusM) => {
          const distanceAB = haversineMeters(a, b);
          const distanceBA = haversineMeters(b, a);

          expect(distanceAB).toBeGreaterThanOrEqual(0);
          expect(distanceAB).toBe(distanceBA);
          expect(haversineMeters(a, a)).toBe(0);
          expect(distanceAB).toBe(Math.round(distanceAB * 10) / 10);

          const evaluation = evaluateGeofence(a, b, 1, radiusM);
          expect(evaluation.distanceM).toBe(distanceAB);
          expect(evaluation.withinGeofence).toBe(distanceAB < radiusM);

          const boundaryDeltaLng = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI);
          const boundary = evaluateGeofence(
            { lat: 0, lng: 0 },
            { lat: 0, lng: boundaryDeltaLng },
            1,
            radiusM,
          );
          expect(boundary.distanceM).toBe(radiusM);
          expect(boundary.withinGeofence).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
