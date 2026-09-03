import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { evaluateGeofence } from './geo';

// Feature: qr-field-attendance, Property 5: Low-accuracy flagging
// **Validates: Requirements 6.8, 6.11**
describe('Property 5: Low-accuracy flagging', () => {
  it('flags accuracy iff it is missing, non-numeric, or greater than the applicable radius', () => {
    const cases = fc
      .double({ min: 1, max: 10_000, noNaN: true, noDefaultInfinity: true })
      .chain((radiusM) =>
        fc.tuple(
          fc.constant(radiusM),
          fc.oneof(
            fc.double({
              min: -10_000,
              max: 20_000,
              noNaN: true,
              noDefaultInfinity: true,
            }),
            fc.constant(radiusM),
            fc.constant(radiusM + 0.000_001),
            fc.constantFrom<unknown>(
              null,
              undefined,
              Number.NaN,
              Number.POSITIVE_INFINITY,
              Number.NEGATIVE_INFINITY,
              'not-a-number',
              true,
              {},
            ),
          ),
        ),
      );

    fc.assert(
      fc.property(cases, ([radiusM, accuracy]) => {
        const expected =
          typeof accuracy !== 'number' ||
          !Number.isFinite(accuracy) ||
          accuracy > radiusM;
        const result = evaluateGeofence(
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0 },
          accuracy as number | null | undefined,
          radiusM,
        );

        expect(result.lowAccuracy).toBe(expected);
      }),
      { numRuns: 250 },
    );
  });
});