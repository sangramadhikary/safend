/**
 * Central Google Maps utilities — key, JS API loader, tile-session helper.
 *
 * Every map in the codebase imports from here so the key and session cache are
 * shared across modules rather than duplicated.
 */
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

/** Public env var — safe to embed in client bundles. */
export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? '';

// ── Backwards-compat alias used by embed-API consumers ─────────────────────
export const GOOGLE_MAPS_EMBED_KEY = GOOGLE_MAPS_KEY;

/** Build a Google Maps "place" embed URL for the given (already-encoded) query. */
export function buildMapsEmbedUrl(encodedQuery: string): string {
  return `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_KEY}&q=${encodedQuery}`;
}

// ── JS API loader (v2 functional API) ───────────────────────────────────────
/**
 * Configure the Google Maps JS API loader once at module load time.
 * setOptions() is idempotent — subsequent calls are ignored.
 */
if (GOOGLE_MAPS_KEY) {
  setOptions({ key: GOOGLE_MAPS_KEY, v: 'weekly', libraries: ['places'] });
}

/**
 * Backwards-compatible shim for consumers that called `googleMapsLoader.load()`.
 * In v2, loading is done via `importLibrary()`; this shim bridges the gap so
 * existing call sites require no changes.
 */
export const googleMapsLoader = GOOGLE_MAPS_KEY
  ? {
      load: (): Promise<void> =>
        importLibrary('maps').then(() => undefined),
      importLibrary,
    }
  : null;

/** Pre-warm the Google Maps JS API so it is ready when a map mounts. */
export function preloadGoogleMaps(): void {
  if (!GOOGLE_MAPS_KEY) return;
  importLibrary('maps').catch(() => {
    // Network failure is not critical — Leaflet falls back to OSM gracefully.
  });
}

// ── Tile-session helper (Map Tiles API 2D) ───────────────────────────────────
/**
 * Module-level cache for tile-session tokens.
 * A session is valid for hours; re-create only when a fetch fails.
 */
const sessionCache = new Map<string, string>();

type GoogleMapType = 'roadmap' | 'satellite' | 'hybrid';

/**
 * Obtain (or reuse a cached) Map Tiles API session token for the given map
 * type, then return a Leaflet-compatible tile URL.
 *
 * Billed under "Map Tiles API: 2D Map Tiles (India)":
 * first 700,000 tile requests/month free, then $0.18/1,000.
 */
export async function googleTileLayerUrl(mapType: GoogleMapType): Promise<string> {
  if (!GOOGLE_MAPS_KEY) {
    return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  }

  const cached = sessionCache.get(mapType);
  if (cached) {
    return `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${cached}&key=${GOOGLE_MAPS_KEY}`;
  }

  try {
    const res = await fetch(
      `https://tile.googleapis.com/v1/createSession?key=${GOOGLE_MAPS_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapType, language: 'en', region: 'IN' }),
      }
    );
    if (res.ok) {
      const data = (await res.json()) as { session?: string };
      if (data.session) {
        sessionCache.set(mapType, data.session);
        return `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${data.session}&key=${GOOGLE_MAPS_KEY}`;
      }
    }
  } catch {
    // fall through to undocumented fallback below
  }

  // Session creation failed — fall back to the undocumented tile URL.
  // Still shows Google Maps rather than a blank map.
  const fallback: Record<GoogleMapType, string> = {
    roadmap:   'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    satellite: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    hybrid:    'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
  };
  return fallback[mapType];
}

/**
 * Build a Leaflet TileLayer using the official Google Map Tiles API.
 * `mapType` defaults to `'roadmap'` (standard road map).
 *
 * Usage:
 *   import L from 'leaflet';
 *   const layer = await buildGoogleTileLayer();
 *   layer.addTo(map);
 */
export async function buildGoogleTileLayer(
  mapType: GoogleMapType = 'roadmap'
): Promise<import('leaflet').TileLayer> {
  const L = (await import('leaflet')).default ?? (await import('leaflet'));
  const url = await googleTileLayerUrl(mapType);
  return L.tileLayer(url, {
    attribution: url.includes('openstreetmap') ? '&copy; OpenStreetMap contributors' : '&copy; Google Maps',
    maxZoom: 20,
  });
}

/**
 * Geocode an address string using the Google Geocoding API.
 * Returns `null` when nothing matches or the request fails.
 *
 * Billed under "Geocoding (India)": first 70,000 requests/month free,
 * then $1.50/1,000.
 */
export async function geocodeAddress(
  query: string
): Promise<{ lat: number; lng: number } | null> {
  if (!GOOGLE_MAPS_KEY || !query.trim()) return null;

  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?address=${encodeURIComponent(query)}&region=in&key=${GOOGLE_MAPS_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status: string;
      results: Array<{ geometry: { location: { lat: number; lng: number } } }>;
    };
    if (data.status !== 'OK' || !data.results.length) return null;
    const { lat, lng } = data.results[0].geometry.location;
    return { lat, lng };
  } catch {
    return null;
  }
}
