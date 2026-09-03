/**
 * Client-side GPS submission-gate predicate for the Quick Attendance Scanner.
 *
 * This is a pure, dependency-free module. It encodes the rule the Scanner uses
 * to decide whether the "submit check-in" action is enabled: the captured GPS
 * position must have a valid latitude and longitude and a reported horizontal
 * accuracy that is a number strictly greater than 0 meters.
 *
 * The Scanner uses this only to gate the submit control; the server independently
 * re-validates coordinates and recomputes the geofence (see geo.ts). Coordinate
 * range validity reuses `isValidLat`/`isValidLng` from geo.ts so the client and
 * server agree on the accepted ranges.
 *
 * Submission is enabled if and only if:
 *   - latitude is a finite number within -90..90, and
 *   - longitude is a finite number within -180..180, and
 *   - accuracy is a finite number strictly greater than 0.
 *
 * See design "Property 16: Client-side GPS submission gate".
 *
 * Requirements: 5.2
 */

import { isValidLat, isValidLng } from './geo';

/** A candidate GPS position gathered by the Scanner before submission. */
export interface GpsCandidate {
  lat: unknown;
  lng: unknown;
  accuracyM: unknown;
}

/**
 * Whether a reported horizontal accuracy is acceptable for submission:
 * a finite number strictly greater than 0 meters.
 */
export function isValidAccuracy(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * Whether the Scanner should enable submission for the given GPS candidate.
 * True iff the latitude and longitude are in range and the accuracy is a
 * number strictly greater than 0 (R5.2).
 */
export function canSubmitGps(candidate: GpsCandidate): boolean {
  return (
    isValidLat(candidate.lat) &&
    isValidLng(candidate.lng) &&
    isValidAccuracy(candidate.accuracyM)
  );
}
