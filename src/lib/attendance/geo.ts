/**
 * Pure, dependency-free geo + geofence math for QR field attendance.
 *
 * All trust-bearing geofence decisions are recomputed server-side from these
 * helpers; no client-provided distance or within-geofence value is ever used.
 *
 * Requirements: 6.1, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.11
 */

/** Earth radius used by the haversine great-circle formula (R6.1). */
export const EARTH_RADIUS_M = 6_371_000;

/** Radius applied when a Post has no configured geofence (R6.4). */
export const DEFAULT_GEOFENCE_RADIUS_M = 50;

/** Smallest accepted configured geofence radius, in meters (R6.3). */
export const MIN_GEOFENCE_RADIUS_M = 1;

/** Largest accepted configured geofence radius, in meters (R6.3). */
export const MAX_GEOFENCE_RADIUS_M = 10_000;

export interface Coord {
  lat: number;
  lng: number;
}

export interface GeofenceEval {
  /** Great-circle distance from the GPS fix to the Post, rounded to 1 decimal. */
  distanceM: number;
  /** The applicable geofence radius used for the comparison. */
  radiusM: number;
  /** True iff distance is strictly less than the radius (R6.5, R6.6). */
  withinGeofence: boolean;
  /** True iff accuracy is missing/NaN or greater than the radius (R6.8, R6.11). */
  lowAccuracy: boolean;
}

/** Returns true when `v` is a finite number within the valid latitude range. */
export function isValidLat(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90;
}

/** Returns true when `v` is a finite number within the valid longitude range. */
export function isValidLng(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180;
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance in meters between two coordinates using the haversine
 * formula with an Earth radius of 6,371,000 m, rounded to one decimal place
 * (R6.1).
 */
export function haversineMeters(a: Coord, b: Coord): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  // Clamp to [0, 1] to guard against floating-point overshoot before asin.
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  const meters = EARTH_RADIUS_M * c;

  return Math.round(meters * 10) / 10;
}

/**
 * Applicable geofence radius: the configured value when it is a finite number
 * in the inclusive range 1..10,000 meters, otherwise the default of 50 m
 * (R6.3, R6.4).
 */
export function effectiveRadius(geofenceRadius?: number | null): number {
  if (
    typeof geofenceRadius === 'number' &&
    Number.isFinite(geofenceRadius) &&
    geofenceRadius >= MIN_GEOFENCE_RADIUS_M &&
    geofenceRadius <= MAX_GEOFENCE_RADIUS_M
  ) {
    return geofenceRadius;
  }
  return DEFAULT_GEOFENCE_RADIUS_M;
}

/**
 * Recompute the distance to the Post, the within-geofence flag (strictly
 * less-than comparison), and the low-accuracy flag. Distance and accuracy are
 * carried through for storage on the check-in record (R6.1, R6.5-R6.8, R6.11).
 */
export function evaluateGeofence(
  gps: Coord,
  post: Coord,
  accuracyM: number | null | undefined,
  geofenceRadius?: number | null,
): GeofenceEval {
  const radiusM = effectiveRadius(geofenceRadius);
  const distanceM = haversineMeters(gps, post);
  const withinGeofence = distanceM < radiusM;

  const accuracyMissing =
    typeof accuracyM !== 'number' || !Number.isFinite(accuracyM);
  const lowAccuracy = accuracyMissing || accuracyM > radiusM;

  return { distanceM, radiusM, withinGeofence, lowAccuracy };
}
