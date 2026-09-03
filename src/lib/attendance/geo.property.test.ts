import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  DEFAULT_GEOFENCE_RADIUS_M,
  MAX_GEOFENCE_RADIUS_M,
  MIN_GEOFENCE_RADIUS_M,
  effectiveRadius,
} from './geo';

// Feature: qr-field-attendance, Property 3: Effective geofence radius selection
// **Validates: Requirements 6.3, 6.4**
describe('Property 3: Effective geofence radius selection', () => {
  it('uses every configured radius in the inclusive valid range', () => {
    fc.assert(
      fc.property(
        fc.double({
          min: MIN_GEOFENCE_RADIUS_M,
          max: MAX_GEOFENCE_RADIUS_M,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (configuredRadius) => {
          expect(effectiveRadius(configuredRadius)).toBe(configuredRadius);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('uses the default for missing, null, non-finite, or out-of-range radii', () => {
    const invalidOrMissingRadius = fc.oneof(
      fc.constant(undefined),
      fc.constant(null),
      fc.constant(Number.NaN),
      fc.constant(Number.POSITIVE_INFINITY),
      fc.constant(Number.NEGATIVE_INFINITY),
      fc.double({
        max: MIN_GEOFENCE_RADIUS_M - Number.EPSILON,
        noNaN: true,
        noDefaultInfinity: true,
      }),
      fc.double({
        min: MAX_GEOFENCE_RADIUS_M + Number.EPSILON * MAX_GEOFENCE_RADIUS_M,
        noNaN: true,
        noDefaultInfinity: true,
      }),
    );

    fc.assert(
      fc.property(invalidOrMissingRadius, (configuredRadius) => {
        expect(effectiveRadius(configuredRadius)).toBe(
          DEFAULT_GEOFENCE_RADIUS_M,
        );
      }),
      { numRuns: 100 },
    );
  });
});
