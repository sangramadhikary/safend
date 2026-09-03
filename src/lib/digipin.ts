/**
 * DIGIPIN encoder / decoder — India Post geo-coded addressing system.
 *
 * A 10-character alphanumeric code (e.g. 39J-438-TJC7) that identifies a
 * ~4 m × 4 m grid cell anywhere in India.  Inlined from the official
 * open-source algorithm (INDIAPOST-gov/digipin, MIT-licensed) so there is no
 * external runtime dependency.
 *
 * Content was adapted from the open-source DIGIPIN reference implementation
 * for compliance with licensing restrictions.
 */

const GRID = [
  ['F', 'C', '9', '8'],
  ['J', '3', '2', '7'],
  ['K', '4', '5', '6'],
  ['L', 'M', 'P', 'T'],
] as const;

const CHAR_MAP = new Map<string, [number, number]>();
for (let r = 0; r < GRID.length; r++)
  for (let c = 0; c < GRID[r].length; c++)
    CHAR_MAP.set(GRID[r][c], [r, c]);

const BOUNDS = { minLat: 2.5, maxLat: 38.5, minLon: 63.5, maxLon: 99.5 };

/** Encode a lat/lon into a 10-char DIGIPIN (e.g. "39J-438-TJC7"). */
export function encodeDIGIPIN(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'Out of Bound';
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat) return 'Out of Bound';
  if (lon < BOUNDS.minLon || lon > BOUNDS.maxLon) return 'Out of Bound';

  lat = Number(lat.toFixed(6));
  lon = Number(lon.toFixed(6));

  let [minLat, maxLat, minLon, maxLon] = [BOUNDS.minLat, BOUNDS.maxLat, BOUNDS.minLon, BOUNDS.maxLon];
  let pin = '';

  for (let level = 1; level <= 10; level++) {
    const latDiv = (maxLat - minLat) / 4;
    const lonDiv = (maxLon - minLon) / 4;
    const r = Math.min(3, Math.max(0, 3 - Math.floor((lat - minLat) / latDiv)));
    const c = Math.min(3, Math.max(0, Math.floor((lon - minLon) / lonDiv)));
    pin += GRID[r][c];
    if (level === 3 || level === 6) pin += '-';
    maxLat = minLat + latDiv * (4 - r);
    minLat = minLat + latDiv * (3 - r);
    minLon = minLon + lonDiv * c;
    maxLon = minLon + lonDiv;
  }
  return pin;
}

/** Decode a DIGIPIN into its centre { lat, lng }. Returns null if invalid. */
export function decodeDIGIPIN(pin: string): { lat: number; lng: number } | null {
  const clean = pin.replace(/-/g, '').toUpperCase();
  if (clean.length !== 10) return null;

  let [minLat, maxLat, minLon, maxLon] = [BOUNDS.minLat, BOUNDS.maxLat, BOUNDS.minLon, BOUNDS.maxLon];

  for (const ch of clean) {
    const pos = CHAR_MAP.get(ch);
    if (!pos) return null;
    const [r, c] = pos;
    const latDiv = (maxLat - minLat) / 4;
    const lonDiv = (maxLon - minLon) / 4;
    [minLat, maxLat] = [maxLat - latDiv * (r + 1), maxLat - latDiv * r];
    [minLon, maxLon] = [minLon + lonDiv * c, minLon + lonDiv * (c + 1)];
  }

  return {
    lat: Number(((minLat + maxLat) / 2).toFixed(6)),
    lng: Number(((minLon + maxLon) / 2).toFixed(6)),
  };
}

/** Validate DIGIPIN format (10 chars from the allowed set, optional hyphens). */
export function isValidDIGIPIN(pin: string): boolean {
  return decodeDIGIPIN(pin) !== null;
}
