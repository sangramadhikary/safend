'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, LocateFixed, Loader2, MapPin } from 'lucide-react';
import { geocodeAddress, googleMapsLoader } from '@/lib/googleMaps';

export interface MapPinPickerProps {
  lat?: number;
  lng?: number;
  /** Street address — used to auto-geocode the initial pin position. */
  address?: string;
  /** District / city — appended to the geocoding query. */
  district?: string;
  /** State name — appended to the geocoding query. */
  state?: string;
  /** 6-digit Indian pincode — most reliable geocoding anchor. */
  pincode?: string;
  onChange: (lat: number, lng: number) => void;
}

// ─── India bounding box ───────────────────────────────────────────────────────
const INDIA_BOUNDS = {
  minLat: 6.5,  maxLat: 35.7,
  minLng: 68.1, maxLng: 97.4,
};

function isWithinIndia(lat: number, lng: number): boolean {
  return (
    lat >= INDIA_BOUNDS.minLat && lat <= INDIA_BOUNDS.maxLat &&
    lng >= INDIA_BOUNDS.minLng && lng <= INDIA_BOUNDS.maxLng
  );
}

const INDIA_LAT_LNG_BOUNDS = {
  north: INDIA_BOUNDS.maxLat + 2, south: INDIA_BOUNDS.minLat - 2,
  east:  INDIA_BOUNDS.maxLng + 2, west:  INDIA_BOUNDS.minLng - 2,
};

/** Parse "lat, lng" / "lat lng" pasted into the coordinate box. */
function parseCoordsFromText(text: string): { lat: number; lng: number } | null {
  const m = text.trim().match(
    /^(-?\d{1,3}(?:\.\d+)?)\s*[,\s]+\s*(-?\d{1,3}(?:\.\d+)?)$/
  );
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  return { lat, lng };
}

function buildGeoQuery(
  address?: string, pincode?: string, district?: string, state?: string
): string | null {
  const parts: string[] = [];
  if (address && address.trim().length > 6) parts.push(address.trim());
  if (district && district.trim()) parts.push(district.trim());
  if (state && state.trim()) parts.push(state.trim());
  if (pincode && pincode.trim().length === 6) parts.push(pincode.trim());
  if (parts.length === 0) return null;
  parts.push('India');
  return parts.join(', ');
}

interface Suggestion {
  placeId: string;
  main: string;
  secondary: string;
}

// ─── Inner component (browser only) ──────────────────────────────────────────
function MapPinPickerInner({
  lat, lng, address, pincode, district, state, onChange,
}: MapPinPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const coordRef     = useRef<HTMLInputElement>(null);
  const mapRef       = useRef<google.maps.Map | null>(null);
  const markerRef    = useRef<google.maps.Marker | null>(null);
  const initializedRef = useRef(false);

  const autoSvcRef   = useRef<google.maps.places.AutocompleteService | null>(null);
  const geocoderRef  = useRef<google.maps.Geocoder | null>(null);

  const geoTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevQueryRef   = useRef('');
  const userPinnedRef  = useRef(false);

  const [mapReady, setMapReady]       = useState(false);
  const [searchText, setSearchText]   = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching]     = useState(false);
  const [pinned, setPinned]           = useState<{ lat: number; lng: number } | null>(
    lat && lng && isWithinIndia(lat, lng) ? { lat, lng } : null
  );

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // ── Move pin + map to coordinates ─────────────────────────────────────────
  const pinAt = useCallback((newLat: number, newLng: number, zoom = 17) => {
    if (!isWithinIndia(newLat, newLng)) return false;
    const pos = { lat: newLat, lng: newLng };
    if (markerRef.current) markerRef.current.setPosition(pos);
    if (mapRef.current) {
      mapRef.current.setCenter(pos);
      mapRef.current.setZoom(zoom);
    }
    setPinned(pos);
    onChangeRef.current(newLat, newLng);
    return true;
  }, []);

  // ── Initialise the map once ───────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    if (!googleMapsLoader) return;
    initializedRef.current = true;

    let cancelled = false;

    Promise.all([
      googleMapsLoader.importLibrary('maps'),
      googleMapsLoader.importLibrary('places'),
      googleMapsLoader.importLibrary('geocoding'),
    ]).then(() => {
      if (cancelled || !containerRef.current) return;

      const startLat = lat && isWithinIndia(lat, lng ?? 78) ? lat : 20.5937;
      const startLng = lng && isWithinIndia(lat ?? 20, lng)  ? lng : 78.9629;
      const initZoom = lat && lng && isWithinIndia(lat, lng) ? 16  : 5;

      const map = new google.maps.Map(containerRef.current, {
        center: { lat: startLat, lng: startLng },
        zoom: initZoom,
        mapTypeId: 'roadmap',
        restriction: { latLngBounds: INDIA_LAT_LNG_BOUNDS, strictBounds: false },
        minZoom: 4,
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: false,
        clickableIcons: false,
        gestureHandling: 'greedy',
      });

      const marker = new google.maps.Marker({
        position: { lat: startLat, lng: startLng },
        map,
        draggable: true,
        animation: google.maps.Animation.DROP,
        title: 'Drag or click the map to set the exact location',
      });

      marker.addListener('dragend', () => {
        const pos = marker.getPosition();
        if (!pos) return;
        const mlat = pos.lat(), mlng = pos.lng();
        if (!isWithinIndia(mlat, mlng)) {
          marker.setPosition({ lat: startLat, lng: startLng });
          return;
        }
        userPinnedRef.current = true;
        setPinned({ lat: mlat, lng: mlng });
        onChangeRef.current(mlat, mlng);
      });

      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        const clat = e.latLng.lat(), clng = e.latLng.lng();
        if (!isWithinIndia(clat, clng)) return;
        marker.setPosition(e.latLng);
        userPinnedRef.current = true;
        setPinned({ lat: clat, lng: clng });
        onChangeRef.current(clat, clng);
      });

      mapRef.current      = map;
      markerRef.current   = marker;
      autoSvcRef.current  = new google.maps.places.AutocompleteService();
      geocoderRef.current = new google.maps.Geocoder();
      setMapReady(true);

      // Dialogs animate in — nudge the map to re-measure once settled so tiles
      // fill the container instead of leaving a blank area.
      setTimeout(() => google.maps.event.trigger(map, 'resize'), 250);
      setTimeout(() => google.maps.event.trigger(map, 'resize'), 800);
    });

    return () => {
      cancelled = true;
      mapRef.current = null;
      markerRef.current = null;
      autoSvcRef.current = null;
      geocoderRef.current = null;
      initializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keep the map sized to its container ───────────────────────────────────
  useEffect(() => {
    if (!mapReady || !containerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (mapRef.current) google.maps.event.trigger(mapRef.current, 'resize');
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [mapReady]);

  // ── Sync externally-supplied coordinates ──────────────────────────────────
  useEffect(() => {
    if (!markerRef.current || !mapRef.current || !lat || !lng) return;
    if (!isWithinIndia(lat, lng)) return;
    markerRef.current.setPosition({ lat, lng });
    mapRef.current.setCenter({ lat, lng });
    mapRef.current.setZoom(17);
    setPinned({ lat, lng });
  }, [lat, lng]);

  // ── Auto-geocode from the form's address fields ───────────────────────────
  useEffect(() => {
    if (!mapReady || userPinnedRef.current) return;

    const query = buildGeoQuery(address, pincode, district, state);
    if (!query || query === prevQueryRef.current) return;
    prevQueryRef.current = query;

    if (geoTimerRef.current) clearTimeout(geoTimerRef.current);
    geoTimerRef.current = setTimeout(async () => {
      const result = await geocodeAddress(query);
      if (!result) return;
      const hasFullAddress = !!(address && address.trim().length > 6);
      pinAt(result.lat, result.lng, hasFullAddress ? 17 : 15);
    }, 600);

    return () => {
      if (geoTimerRef.current) clearTimeout(geoTimerRef.current);
    };
  }, [mapReady, address, pincode, district, state, pinAt]);

  // ── Fetch autocomplete predictions (own dropdown, not Google's widget) ────
  useEffect(() => {
    if (!autoSvcRef.current || searchText.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    searchTimerRef.current = setTimeout(() => {
      setSearching(true);
      autoSvcRef.current!.getPlacePredictions(
        {
          input: searchText.trim(),
          componentRestrictions: { country: 'in' },
        },
        (predictions, status) => {
          setSearching(false);
          if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
            setSuggestions([]);
            return;
          }
          setSuggestions(
            predictions.slice(0, 6).map((p) => ({
              placeId:   p.place_id,
              main:      p.structured_formatting.main_text,
              secondary: p.structured_formatting.secondary_text ?? '',
            }))
          );
        }
      );
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchText]);

  // ── Resolve a chosen suggestion to lat/lng via the Geocoder ───────────────
  const selectSuggestion = useCallback((s: Suggestion) => {
    if (!geocoderRef.current) return;
    setSuggestions([]);
    setSearchText(s.main);

    geocoderRef.current.geocode({ placeId: s.placeId }, (results, status) => {
      if (status !== 'OK' || !results?.[0]) return;
      const loc = results[0].geometry.location;
      userPinnedRef.current = true;
      pinAt(loc.lat(), loc.lng(), 17);
    });
  }, [pinAt]);

  // ── Go button — coordinates first, then geocode as address ────────────────
  const goToCoord = useCallback(async () => {
    const val = coordRef.current?.value.trim() ?? '';
    if (!val) return;

    const coords = parseCoordsFromText(val);
    if (coords) {
      userPinnedRef.current = true;
      if (pinAt(coords.lat, coords.lng, 17) && coordRef.current) {
        coordRef.current.value = '';
      }
      return;
    }

    const result = await geocodeAddress(`${val}, India`);
    if (result) {
      userPinnedRef.current = true;
      if (pinAt(result.lat, result.lng, 17) && coordRef.current) {
        coordRef.current.value = '';
      }
    }
  }, [pinAt]);

  return (
    <div className="flex h-full flex-col gap-1.5">
      {/* Map canvas */}
      <div
        ref={containerRef}
        className="flex-1 min-h-[200px] w-full rounded-md border overflow-hidden bg-muted"
        style={{ position: 'relative', zIndex: 0 }}
      />

      {/* ── Address search with our own dropdown (renders inside the dialog,
             so it is always clickable — Google's own pac-container gets blocked
             by Radix Dialog's pointer-events trap). ── */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search address…"
          disabled={!mapReady}
          className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-8 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          aria-label="Search address"
          autoComplete="off"
        />
        {searching && (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}

        {suggestions.length > 0 && (
          <ul className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-56 overflow-y-auto rounded-md border bg-popover shadow-lg">
            {suggestions.map((s) => (
              <li key={s.placeId}>
                <button
                  type="button"
                  onClick={() => selectSuggestion(s)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                >
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.main}</span>
                    {s.secondary && (
                      <span className="block truncate text-muted-foreground">{s.secondary}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Coordinate paste + Go ── */}
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <LocateFixed className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={coordRef}
            type="text"
            placeholder="Paste coordinates: 20.44966, 85.89405"
            disabled={!mapReady}
            className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 font-mono text-sm shadow-sm placeholder:font-sans placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            aria-label="Enter coordinates"
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); goToCoord(); }
            }}
          />
        </div>
        <button
          type="button"
          onClick={goToCoord}
          disabled={!mapReady}
          title="Go to coordinates"
          className="rounded-md bg-[#D71920] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#b5151b] focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        >
          Go
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground">
        {pinned
          ? `Pinned at ${pinned.lat.toFixed(6)}, ${pinned.lng.toFixed(6)} · drag pin or click map to adjust`
          : 'Search, paste coordinates, or click the map to pin the location'}
      </p>
    </div>
  );
}

// ─── Public export ───────────────────────────────────────────────────────────
export function MapPinPicker(props: MapPinPickerProps) {
  if (typeof window === 'undefined') {
    return (
      <div className="flex h-full min-h-[200px] w-full items-center justify-center rounded-md border bg-muted">
        <p className="text-xs text-muted-foreground">Loading map…</p>
      </div>
    );
  }
  return <MapPinPickerInner {...props} />;
}
