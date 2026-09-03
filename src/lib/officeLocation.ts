import { haversineKm } from '@/services/traccar/traccarFormat';

/**
 * Head office coordinates — the reference centre for every GPS calculation.
 *
 * All posts are coordinated from this location, so distances, "at office"
 * detection and trip endpoint labelling are all measured against it rather than
 * against an arbitrary map centre.
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export const HEAD_OFFICE = {
  name: 'Head Office',
  latitude: 20.401686363106908,
  longitude: 85.88196753728205,
  /**
   * A fix inside this radius counts as being at the office.
   *
   * 80 m keeps "on site" to the building footprint and immediate entrance —
   * the compound plus parking without drawing in the adjacent road.
   */
  radiusMetres: 80,
} as const;

/** Straight-line distance from the office, in kilometres. */
export function distanceFromOfficeKm(point: GeoPoint): number {
  return haversineKm(
    HEAD_OFFICE.latitude,
    HEAD_OFFICE.longitude,
    point.latitude,
    point.longitude
  );
}

/** Straight-line distance from the office, in metres. */
export function distanceFromOfficeMetres(point: GeoPoint): number {
  return distanceFromOfficeKm(point) * 1000;
}

/** Whether a point falls inside the office radius. */
export function isAtOffice(point: GeoPoint, radiusMetres = HEAD_OFFICE.radiusMetres): boolean {
  return distanceFromOfficeMetres(point) <= radiusMetres;
}

/** `at office` / `340 m from office` / `12.4 km from office` */
export function describeFromOffice(point: GeoPoint): string {
  if (isAtOffice(point)) return 'at office';
  const km = distanceFromOfficeKm(point);
  if (km < 1) return `${Math.round(km * 1000)} m from office`;
  return `${km.toFixed(1)} km from office`;
}

/** Short form for badges: `Office` or `4.2 km` */
export function shortFromOffice(point: GeoPoint): string {
  if (isAtOffice(point)) return 'Office';
  const km = distanceFromOfficeKm(point);
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/**
 * Label a location, preferring "Head Office" over a reverse-geocoded string
 * when the point is on site — the geocoder returns a generic road name there.
 */
export function locationLabel(point: GeoPoint, address: string | null | undefined): string {
  if (isAtOffice(point)) return HEAD_OFFICE.name;
  return address || `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
}

/** Compass bearing from the office to a point, in degrees. */
export function bearingFromOffice(point: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const lat1 = toRad(HEAD_OFFICE.latitude);
  const lat2 = toRad(point.latitude);
  const dLon = toRad(point.longitude - HEAD_OFFICE.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Farthest point from the office in a series, with its distance. */
export function farthestFromOffice<T extends GeoPoint>(
  points: T[]
): { point: T; km: number } | null {
  let best: { point: T; km: number } | null = null;
  for (const point of points) {
    const km = distanceFromOfficeKm(point);
    if (!best || km > best.km) best = { point, km };
  }
  return best;
}
