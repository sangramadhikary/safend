'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Building2,
  Crosshair,
  Maximize2,
  Minimize2,
  SkipBack,
  SkipForward,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  courseToCompass,
  formatIstTime,
  formatSpeed,
  knotsToKmph,
  speedColor,
} from '@/services/traccar/traccarFormat';
import {
  GOOGLE_MAPS_KEY,
  googleTileLayerUrl,
  preloadGoogleMaps,
} from '@/lib/googleMaps';
import { HEAD_OFFICE, describeFromOffice } from '@/lib/officeLocation';

// Pre-warm the Maps JS API for the tile session calls below.
preloadGoogleMaps();

// ─── Pin label styling ────────────────────────────────────────────────────────
// Leaflet tooltips default to a boxed, arrowed callout that reads as heavy when
// dozens are on screen at once. These are flattened into small, borderless
// captions so a dense cluster of posts stays legible.
if (typeof document !== 'undefined' && !document.getElementById('safend-pin-label-style')) {
  const style = document.createElement('style');
  style.id = 'safend-pin-label-style';
  style.textContent = `
    .safend-pin-label {
      background: rgba(255,255,255,.92);
      border: none;
      border-radius: 3px;
      box-shadow: 0 1px 2px rgba(0,0,0,.18);
      color: #1e3a8a;
      font-size: 9px;
      font-weight: 600;
      letter-spacing: .01em;
      line-height: 1.25;
      padding: 1px 4px;
      max-width: 96px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      pointer-events: none;
    }
    .safend-pin-label::before { display: none; }
    .safend-pin-label-property { color: #9a3412; }
  `;
  document.head.appendChild(style);
}

/**
 * Leaflet map for the fleet tracking console.
 *
 * Two behaviours worth knowing about:
 *
 * 1. The map instance is created once and kept. Data changes only rebuild the
 *    relevant layer group, so a live refresh every few seconds never resets the
 *    user's pan/zoom.
 * 2. Replay runs on a wall-clock timeline rather than by array index. Devices
 *    report at different rates, so stepping index-by-index would drift them out
 *    of sync; interpolating each track at a shared timestamp keeps every marker
 *    where it actually was at that moment.
 */

// ─── Public shapes ────────────────────────────────────────────────────────────

export interface TrackPosition {
  latitude: number;
  longitude: number;
  /** Knots, as Traccar reports it. */
  speed: number;
  course?: number;
  fixTime: string;
  attributes?: { batteryLevel?: number; motion?: boolean; [key: string]: unknown };
}

export interface MapTrack {
  deviceId: number;
  label: string;
  color: string;
  positions: TrackPosition[];
}

export type PinKind = 'live' | 'stop' | 'start' | 'end' | 'post' | 'property';

export interface MapPin {
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  title: string;
  /** Extra popup lines, already formatted. */
  lines?: string[];
  kind: PinKind;
  course?: number;
  moving?: boolean;
  /** Short text drawn inside a stop pin, e.g. a dwell duration. */
  badge?: string;
  /** Geofence radius in metres — drawn as a circle around post/property pins. */
  radiusMetres?: number;
}

export type BaseLayerId = 'roads' | 'satellite' | 'hybrid' | 'osm';

/** Human labels for the base-layer switcher buttons. */
const BASE_LAYER_LABELS: Record<BaseLayerId, string> = {
  roads: 'Roads',
  satellite: 'Satellite',
  hybrid: 'Hybrid',
  osm: 'OSM',
};

export interface TrackMapProps {
  tracks?: MapTrack[];
  pins?: MapPin[];
  /** Operational post location pins (blue building markers). */
  postPins?: MapPin[];
  /** Rented property location pins (orange house markers). */
  propertyPins?: MapPin[];
  /** Draw a dot at every GPS fix, coloured by speed. */
  showTrackPoints?: boolean;
  /** Show the playback bar and animated markers. */
  enableReplay?: boolean;
  /** Change this value to re-fit the viewport to the current data. */
  fitSignal?: string | number;
  /** Recentre on a point without changing the data. */
  focus?: { latitude: number; longitude: number; zoom?: number } | null;
  /** Mark the head office and its radius. On by default — it is the reference point. */
  showOffice?: boolean;
  /** Show operational post pins. */
  showPosts?: boolean;
  /** Show rented property pins. */
  showProperties?: boolean;
  /** Device telemetry rows for fullscreen HUD. */
  hudRows?: HudRow[];
  className?: string;
}

/** One row in the fullscreen HUD panel — live telemetry for a single device. */
export interface HudRow {
  deviceId: number;
  label: string;
  subLabel?: string;
  color: string;
  speed: string;
  heading: string;
  fromOffice: string;
  lastSeen: string;
  address: string;
  moving: boolean;
  active: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Build a Leaflet TileLayer for a base-map choice.
 *
 * Delegates to the shared googleTileLayerUrl helper (src/lib/googleMaps.ts)
 * so the session cache and fallback logic live in one place.
 */
async function buildTileLayer(id: BaseLayerId): Promise<L.TileLayer> {
  const isOsm = id === 'osm' || !GOOGLE_MAPS_KEY;
  if (isOsm) {
    return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 20,
    });
  }
  const mapType = id === 'roads' ? 'roadmap' : id === 'satellite' ? 'satellite' : 'hybrid';
  const url = await googleTileLayerUrl(mapType);
  return L.tileLayer(url, {
    attribution: url.includes('openstreetmap') ? '&copy; OpenStreetMap contributors' : '&copy; Google Maps',
    maxZoom: 20,
  });
}

const REPLAY_SPEEDS = [30, 60, 120, 300, 600, 1800] as const;

/** The office is the operating centre, so it is also the map's home view. */
const DEFAULT_CENTER: L.LatLngExpression = [HEAD_OFFICE.latitude, HEAD_OFFICE.longitude];
const DEFAULT_ZOOM = 13;

/** How far the camera stays zoomed in while following a device. */
const FOLLOW_ZOOM = 16;
/** Step size for the replay nudge buttons. */
const STEP_MS = 30_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Device names come from the GPS server, so never inject them as raw HTML. */
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Group consecutive fixes into runs that share a speed colour.
 *
 * One polyline per segment would mean thousands of layers on a busy day; one
 * per colour run keeps it to a few dozen while still showing where the vehicle
 * was slow or speeding.
 */
function colouredRuns(positions: TrackPosition[]): Array<{ color: string; coords: L.LatLngTuple[] }> {
  const runs: Array<{ color: string; coords: L.LatLngTuple[] }> = [];

  for (let i = 1; i < positions.length; i++) {
    const previous = positions[i - 1];
    const current = positions[i];
    const colour = speedColor(knotsToKmph(current.speed));
    const last = runs[runs.length - 1];

    if (last && last.color === colour) {
      last.coords.push([current.latitude, current.longitude]);
    } else {
      runs.push({
        color: colour,
        coords: [
          [previous.latitude, previous.longitude],
          [current.latitude, current.longitude],
        ],
      });
    }
  }

  return runs;
}

/**
 * A pushpin, drawn as if stuck into the map: round head, thin steel needle
 * tapering to a point at the bottom. The needle tip is the icon's anchor, so it
 * sits exactly on the coordinate the way a real pin would.
 */
function pushpinSvg(head: string, shadowSide: string): string {
  return `<svg viewBox="0 0 18 26" width="18" height="26" aria-hidden="true"
               style="filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.35))">
    <!-- needle -->
    <path d="M8.35 13.5 H9.65 L9.15 25.4 L9 25.8 L8.85 25.4 Z" fill="#8b93a1"/>
    <path d="M9.15 13.5 H9.65 L9.15 25.4 Z" fill="#6b7280"/>
    <!-- head -->
    <circle cx="9" cy="8" r="6.4" fill="${head}"/>
    <path d="M9 1.6a6.4 6.4 0 0 1 0 12.8 6.4 6.4 0 0 0 0-12.8z" fill="${shadowSide}" opacity=".55"/>
    <circle cx="9" cy="8" r="6.4" fill="none" stroke="#ffffff" stroke-width="1.6"/>
    <!-- specular highlight -->
    <ellipse cx="6.7" cy="5.6" rx="2" ry="1.4" fill="#ffffff" opacity=".5"
             transform="rotate(-28 6.7 5.6)"/>
  </svg>`;
}

function pinIcon(pin: MapPin): L.DivIcon {
  const colour = pin.color;

  // ── Operational post: pushpin (name shown as a tooltip) ───────────────────
  if (pin.kind === 'post') {
    return L.divIcon({
      className: 'safend-pin',
      html: pushpinSvg('#2563eb', '#1e40af'),
      iconSize: [18, 26],
      iconAnchor: [9, 26],
      popupAnchor: [0, -22],
    });
  }

  // ── Rented property: orange house marker ──────────────────────────────────
  if (pin.kind === 'property') {
    return L.divIcon({
      className: 'safend-pin',
      html: pushpinSvg('#ea580c', '#9a3412'),
      iconSize: [18, 26],
      iconAnchor: [9, 26],
      popupAnchor: [0, -22],
    });
  }

  if (pin.kind === 'stop') {
    const badge = pin.badge ? escapeHtml(pin.badge) : '';
    return L.divIcon({
      className: 'safend-pin',
      html: `<div class="flex flex-col items-center">
        <div class="h-4 w-4 rounded-full border-2 border-white shadow-sm" style="background:${colour}"></div>
        ${badge ? `<span class="mt-0.5 rounded bg-white/90 px-1 text-[9px] font-medium text-gray-700 shadow-sm">${badge}</span>` : ''}
      </div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }

  if (pin.kind === 'start' || pin.kind === 'end') {
    const isStart = pin.kind === 'start';
    return L.divIcon({
      className: 'safend-pin',
      html: `<div class="h-3.5 w-3.5 rounded-full border-2 shadow-sm" style="background:${isStart ? colour : '#ffffff'};border-color:${isStart ? '#ffffff' : colour}"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }

  // Live pin: heading arrow plus a pulse while the device is in motion.
  const rotation = Number.isFinite(pin.course) ? (pin.course as number) : 0;
  return L.divIcon({
    className: 'safend-pin',
    html: `<div class="relative flex h-7 w-7 items-center justify-center">
      ${pin.moving ? `<span class="absolute inline-flex h-7 w-7 animate-ping rounded-full opacity-40" style="background:${colour}"></span>` : ''}
      <span class="relative flex h-5 w-5 items-center justify-center rounded-full border-2 border-white shadow-md" style="background:${colour}">
        <svg viewBox="0 0 24 24" class="h-3 w-3 text-white" style="transform:rotate(${rotation}deg)" fill="currentColor" aria-hidden="true">
          <path d="M12 2 L18 21 L12 17 L6 21 Z" />
        </svg>
      </span>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function pinPopup(pin: MapPin): string {
  const lines = (pin.lines ?? [])
    .map((line) => `<div class="text-[11px] text-gray-600">${escapeHtml(line)}</div>`)
    .join('');
  return `<div class="min-w-[160px]"><div class="text-xs font-semibold text-gray-900">${escapeHtml(pin.title)}</div>${lines}</div>`;
}

/** Position of a track at an instant, or null when it has no fix yet. */
function interpolateAt(
  positions: TrackPosition[],
  times: number[],
  at: number
): { latitude: number; longitude: number; speed: number; course?: number; index: number } | null {
  if (positions.length === 0 || at < times[0]) return null;

  // Past the last fix: hold the final position.
  if (at >= times[times.length - 1]) {
    const last = positions[positions.length - 1];
    return { ...last, index: positions.length - 1 };
  }

  // Binary search for the fix at or before `at`.
  let low = 0;
  let high = times.length - 1;
  while (low < high - 1) {
    const mid = (low + high) >> 1;
    if (times[mid] <= at) low = mid;
    else high = mid;
  }

  const from = positions[low];
  const to = positions[low + 1];
  const span = times[low + 1] - times[low];
  const ratio = span > 0 ? (at - times[low]) / span : 0;

  return {
    latitude: from.latitude + (to.latitude - from.latitude) * ratio,
    longitude: from.longitude + (to.longitude - from.longitude) * ratio,
    speed: from.speed,
    course: from.course,
    index: low,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TrackMap({
  tracks = [],
  pins = [],
  postPins = [],
  propertyPins = [],
  showTrackPoints = false,
  enableReplay = false,
  fitSignal,
  focus = null,
  showOffice = true,
  showPosts = true,
  showProperties = true,
  hudRows,
  className,
}: TrackMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const officeLayerRef = useRef<L.LayerGroup | null>(null);
  const trackLayerRef = useRef<L.LayerGroup | null>(null);
  const pinLayerRef = useRef<L.LayerGroup | null>(null);
  const postLayerRef = useRef<L.LayerGroup | null>(null);
  const propertyLayerRef = useRef<L.LayerGroup | null>(null);
  const replayLayerRef = useRef<L.LayerGroup | null>(null);
  const replayMarkersRef = useRef<Map<number, { marker: L.Marker; trail: L.Polyline }>>(new Map());

  const [baseLayer, setBaseLayer] = useState<BaseLayerId>('roads');
  const [ready, setReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── Replay state ───────────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const [multiplier, setMultiplier] = useState<number>(120);
  const [cursor, setCursor] = useState(0); // ms since epoch
  /** Device the camera tracks during playback; null keeps the camera still. */
  const [followId, setFollowId] = useState<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const cursorRef = useRef(0);
  const playingRef = useRef(false);
  const followIdRef = useRef<number | null>(null);
  followIdRef.current = followId;

  /** Tracks that actually have geometry, with pre-computed fix times. */
  const timedTracks = useMemo(
    () =>
      tracks
        .filter((track) => track.positions.length > 0)
        .map((track) => ({
          ...track,
          times: track.positions.map((position) => new Date(position.fixTime).getTime()),
        })),
    [tracks]
  );

  const timeline = useMemo(() => {
    let start = Number.POSITIVE_INFINITY;
    let end = Number.NEGATIVE_INFINITY;
    for (const track of timedTracks) {
      if (track.times.length === 0) continue;
      start = Math.min(start, track.times[0]);
      end = Math.max(end, track.times[track.times.length - 1]);
    }
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
  }, [timedTracks]);

  // ── Create the map once ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      preferCanvas: true,
    });
    mapRef.current = map;

    officeLayerRef.current = L.layerGroup().addTo(map);
    trackLayerRef.current = L.layerGroup().addTo(map);
    replayLayerRef.current = L.layerGroup().addTo(map);
    pinLayerRef.current = L.layerGroup().addTo(map);
    postLayerRef.current = L.layerGroup().addTo(map);
    propertyLayerRef.current = L.layerGroup().addTo(map);
    setReady(true);

    // Captured now so cleanup does not read a ref that may have been replaced.
    const replayMarkers = replayMarkersRef.current;

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      map.remove();
      mapRef.current = null;
      baseLayerRef.current = null;
      officeLayerRef.current = null;
      trackLayerRef.current = null;
      pinLayerRef.current = null;
      replayLayerRef.current = null;
      replayMarkers.clear();
      setReady(false);
    };
  }, []);

  // Keep the map sized to its container (panels change height when data loads).
  useEffect(() => {
    if (!ready || !mapRef.current || !containerRef.current) return;
    const map = mapRef.current;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [ready]);

  // ── Base layer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;

    let cancelled = false;
    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);

    buildTileLayer(baseLayer).then((layer) => {
      if (cancelled || !mapRef.current) return;
      layer.addTo(map);
      layer.bringToBack();
      baseLayerRef.current = layer;
    });

    return () => { cancelled = true; };
  }, [ready, baseLayer]);

  // ── Head office overlay ────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !officeLayerRef.current) return;
    const group = officeLayerRef.current;
    group.clearLayers();
    if (!showOffice) return;

    const centre: L.LatLngTuple = [HEAD_OFFICE.latitude, HEAD_OFFICE.longitude];

    // The radius that counts as "at office" in every calculation.
    L.circle(centre, {
      radius: HEAD_OFFICE.radiusMetres,
      color: '#1D4ED8',
      weight: 1.5,
      opacity: 0.7,
      fillColor: '#3B82F6',
      fillOpacity: 0.1,
      dashArray: '4 4',
      interactive: false,
    }).addTo(group);

    L.marker(centre, {
      icon: L.divIcon({
        className: 'safend-pin',
        html: `<div class="flex flex-col items-center">
          <span class="flex h-6 w-6 items-center justify-center rounded-md border-2 border-white bg-[#1D4ED8] shadow-md">
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 text-white" fill="currentColor" aria-hidden="true">
              <path d="M4 21V8l8-5 8 5v13h-6v-6h-4v6H4z" />
            </svg>
          </span>
          <span class="mt-0.5 whitespace-nowrap rounded bg-white/90 px-1 text-[9px] font-semibold text-[#1D4ED8] shadow-sm">${escapeHtml(HEAD_OFFICE.name)}</span>
        </div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
      zIndexOffset: 200,
    })
      .bindPopup(
        `<div class="min-w-[160px]">
          <div class="text-xs font-semibold text-gray-900">${escapeHtml(HEAD_OFFICE.name)}</div>
          <div class="text-[11px] text-gray-600">${HEAD_OFFICE.latitude.toFixed(6)}, ${HEAD_OFFICE.longitude.toFixed(6)}</div>
          <div class="text-[11px] text-gray-600">${HEAD_OFFICE.radiusMetres} m on-site radius</div>
        </div>`
      )
      .addTo(group);
  }, [ready, showOffice]);

  // ── Route geometry ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !trackLayerRef.current) return;
    const group = trackLayerRef.current;
    group.clearLayers();

    for (const track of timedTracks) {
      for (const run of colouredRuns(track.positions)) {
        L.polyline(run.coords, {
          color: run.color,
          weight: 4,
          opacity: enableReplay ? 0.35 : 0.85,
          lineCap: 'round',
        }).addTo(group);
      }

      if (showTrackPoints) {
        for (const position of track.positions) {
          L.circleMarker([position.latitude, position.longitude], {
            radius: 2.5,
            color: speedColor(knotsToKmph(position.speed)),
            weight: 0,
            fillOpacity: 0.85,
          })
            .bindTooltip(
              `${escapeHtml(track.label)}<br/>${formatIstTime(position.fixTime, true)} · ${formatSpeed(position.speed)}`,
              { direction: 'top' }
            )
            .addTo(group);
        }
      }
    }
  }, [ready, timedTracks, showTrackPoints, enableReplay]);

  // ── Pins ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !pinLayerRef.current) return;
    const group = pinLayerRef.current;
    group.clearLayers();

    for (const pin of pins) {
      if (!Number.isFinite(pin.latitude) || !Number.isFinite(pin.longitude)) continue;
      L.marker([pin.latitude, pin.longitude], { icon: pinIcon(pin), title: pin.title })
        .bindPopup(pinPopup(pin))
        .addTo(group);
    }
  }, [ready, pins]);

  // ── Operational post pins ──────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !postLayerRef.current) return;
    const group = postLayerRef.current;
    group.clearLayers();
    if (!showPosts) return;

    for (const pin of postPins) {
      if (!Number.isFinite(pin.latitude) || !Number.isFinite(pin.longitude)) continue;

      // Geofence circle — the radius attendance check-in is allowed within.
      L.circle([pin.latitude, pin.longitude], {
        radius: pin.radiusMetres ?? 50,
        color: '#2563eb',
        weight: 1,
        opacity: 0.55,
        fillColor: '#3B82F6',
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(group);

      L.marker([pin.latitude, pin.longitude], {
        icon: pinIcon(pin),
        title: pin.title,
        zIndexOffset: 300,
      })
        .bindTooltip(escapeHtml(pin.title), {
          permanent: true,
          direction: 'bottom',
          offset: [0, 1],
          className: 'safend-pin-label',
        })
        .bindPopup(pinPopup(pin))
        .addTo(group);
    }
  }, [ready, postPins, showPosts]);

  // ── Rented property pins ───────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !propertyLayerRef.current) return;
    const group = propertyLayerRef.current;
    group.clearLayers();
    if (!showProperties) return;

    for (const pin of propertyPins) {
      if (!Number.isFinite(pin.latitude) || !Number.isFinite(pin.longitude)) continue;
      L.marker([pin.latitude, pin.longitude], { icon: pinIcon(pin), title: pin.title })
        .bindTooltip(escapeHtml(pin.title), {
          permanent: true,
          direction: 'bottom',
          offset: [0, 1],
          className: 'safend-pin-label safend-pin-label-property',
        })
        .bindPopup(pinPopup(pin))
        .addTo(group);
    }
  }, [ready, propertyPins, showProperties]);

  // ── Fit viewport ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const points: L.LatLngTuple[] = [];

    for (const track of timedTracks) {
      for (const position of track.positions) points.push([position.latitude, position.longitude]);
    }
    for (const pin of pins) {
      if (Number.isFinite(pin.latitude) && Number.isFinite(pin.longitude)) {
        points.push([pin.latitude, pin.longitude]);
      }
    }
    for (const pin of postPins) {
      if (Number.isFinite(pin.latitude) && Number.isFinite(pin.longitude)) {
        points.push([pin.latitude, pin.longitude]);
      }
    }
    for (const pin of propertyPins) {
      if (Number.isFinite(pin.latitude) && Number.isFinite(pin.longitude)) {
        points.push([pin.latitude, pin.longitude]);
      }
    }

    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16 });
    } else if (points.length === 1) {
      map.setView(points[0], 15);
    }
    // Refit only when the caller signals new data, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitSignal]);

  // ── External focus ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !mapRef.current || !focus) return;
    mapRef.current.setView([focus.latitude, focus.longitude], focus.zoom ?? 16, {
      animate: true,
    });
  }, [ready, focus]);

  // ── Replay markers ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !replayLayerRef.current) return;
    const group = replayLayerRef.current;
    group.clearLayers();
    replayMarkersRef.current.clear();

    if (!enableReplay || !timeline) return;

    for (const track of timedTracks) {
      const first = track.positions[0];
      const marker = L.marker([first.latitude, first.longitude], {
        icon: pinIcon({
          id: String(track.deviceId),
          latitude: first.latitude,
          longitude: first.longitude,
          color: track.color,
          title: track.label,
          kind: 'live',
          course: first.course,
          moving: true,
        }),
        zIndexOffset: 500,
      })
        .bindTooltip(escapeHtml(track.label), { direction: 'top', offset: [0, -12] })
        .addTo(group);

      const trail = L.polyline([], { color: track.color, weight: 5, opacity: 0.95 }).addTo(group);
      replayMarkersRef.current.set(track.deviceId, { marker, trail });
    }
  }, [ready, enableReplay, timedTracks, timeline]);

  // Reset the cursor whenever a new timeline arrives.
  useEffect(() => {
    if (!timeline) return;
    cursorRef.current = timeline.start;
    setCursor(timeline.start);
    setPlaying(false);
    playingRef.current = false;
  }, [timeline]);

  /** Move every replay marker and trail to the given instant. */
  const renderAt = useCallback(
    (at: number) => {
      for (const track of timedTracks) {
        const handles = replayMarkersRef.current.get(track.deviceId);
        if (!handles) continue;

        const state = interpolateAt(track.positions, track.times, at);
        if (!state) {
          handles.marker.setOpacity(0);
          handles.trail.setLatLngs([]);
          continue;
        }

        handles.marker.setOpacity(1);
        handles.marker.setLatLng([state.latitude, state.longitude]);

        const trail: L.LatLngTuple[] = track.positions
          .slice(0, state.index + 1)
          .map((position) => [position.latitude, position.longitude]);
        trail.push([state.latitude, state.longitude]);
        handles.trail.setLatLngs(trail);

        // Keep the camera on the followed device, panning only once it drifts
        // near the edge so the map does not jitter on every frame.
        if (followIdRef.current === track.deviceId && mapRef.current) {
          const map = mapRef.current;
          const target = L.latLng(state.latitude, state.longitude);
          if (map.getZoom() < FOLLOW_ZOOM - 2) {
            map.setView(target, FOLLOW_ZOOM, { animate: false });
          } else if (!map.getBounds().pad(-0.28).contains(target)) {
            map.panTo(target, { animate: true, duration: 0.4 });
          }
        }
      }
    },
    [timedTracks]
  );

  // Keep markers in step with the cursor (covers scrubbing and playback).
  useEffect(() => {
    if (!enableReplay || !timeline) return;
    renderAt(cursor);
  }, [enableReplay, timeline, cursor, renderAt]);

  // ── Playback loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || !timeline) return;

    lastFrameRef.current = performance.now();

    const step = (now: number) => {
      if (!playingRef.current) return;

      const elapsed = now - lastFrameRef.current;
      lastFrameRef.current = now;

      const next = cursorRef.current + elapsed * multiplier;
      if (next >= timeline.end) {
        cursorRef.current = timeline.end;
        setCursor(timeline.end);
        playingRef.current = false;
        setPlaying(false);
        return;
      }

      cursorRef.current = next;
      setCursor(next);
      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [playing, multiplier, timeline]);

  const togglePlay = () => {
    if (!timeline) return;
    if (playing) {
      playingRef.current = false;
      setPlaying(false);
      return;
    }
    // Restart from the beginning once the run has finished.
    if (cursorRef.current >= timeline.end) {
      cursorRef.current = timeline.start;
      setCursor(timeline.start);
    }
    playingRef.current = true;
    setPlaying(true);
  };

  const handleScrub = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!timeline) return;
    const value = Number(event.target.value);
    cursorRef.current = value;
    setCursor(value);
  };

  /** Nudge the cursor along the timeline, clamped to its ends. */
  const stepBy = useCallback(
    (deltaMs: number) => {
      if (!timeline) return;
      const next = Math.min(timeline.end, Math.max(timeline.start, cursorRef.current + deltaMs));
      cursorRef.current = next;
      setCursor(next);
    },
    [timeline]
  );

  /** Zoom the map without leaving the playback bar. */
  const zoomBy = useCallback((delta: number) => {
    mapRef.current?.zoomIn(delta, { animate: true });
  }, []);

  /** Frame the whole route again and drop out of follow mode. */
  const fitRoute = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const points: L.LatLngTuple[] = [];
    for (const track of timedTracks) {
      for (const position of track.positions) points.push([position.latitude, position.longitude]);
    }
    if (points.length === 0) return;

    setFollowId(null);
    if (points.length === 1) map.setView(points[0], 15, { animate: true });
    else map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16, animate: true });
  }, [timedTracks]);

  /** Follow a device, or stop following when it is already the active one. */
  const toggleFollow = useCallback(
    (deviceId: number) => {
      const next = followId === deviceId ? null : deviceId;
      setFollowId(next);
      if (next === null) return;

      const track = timedTracks.find((candidate) => candidate.deviceId === next);
      const map = mapRef.current;
      if (!track || !map) return;

      const state = interpolateAt(track.positions, track.times, cursorRef.current);
      const target = state ?? track.positions[0];
      map.setView([target.latitude, target.longitude], FOLLOW_ZOOM, { animate: true });
    },
    [followId, timedTracks]
  );

  /** Centre back on the office, the reference point for every distance shown. */
  const goToOffice = useCallback(() => {
    setFollowId(null);
    mapRef.current?.setView([HEAD_OFFICE.latitude, HEAD_OFFICE.longitude], 15, { animate: true });
  }, []);

  // Keyboard shortcuts while the replay bar is available. Ignored whenever the
  // user is typing, so the console's search and date fields keep working.
  useEffect(() => {
    if (!enableReplay || !timeline) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case ' ':
          event.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          stepBy(event.shiftKey ? -STEP_MS * 10 : -STEP_MS);
          break;
        case 'ArrowRight':
          event.preventDefault();
          stepBy(event.shiftKey ? STEP_MS * 10 : STEP_MS);
          break;
        case 'f':
          fitRoute();
          break;
        case 'o':
          goToOffice();
          break;
        case '+':
        case '=':
          zoomBy(1);
          break;
        case '-':
          zoomBy(-1);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // `togglePlay` is recreated each render but only reads refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableReplay, timeline, stepBy, fitRoute, goToOffice, zoomBy, playing]);

  /** Live readout for the current cursor, one row per moving device. */
  const cursorReadout = useMemo(() => {
    if (!enableReplay || !timeline) return [];
    return timedTracks.map((track) => {
      const state = interpolateAt(track.positions, track.times, cursor);
      return {
        deviceId: track.deviceId,
        label: track.label,
        color: track.color,
        speed: state ? formatSpeed(state.speed) : '—',
        heading: state?.course !== undefined ? courseToCompass(state.course) : '—',
        fromOffice: state ? describeFromOffice(state) : '—',
        started: Boolean(state),
      };
    });
  }, [enableReplay, timeline, timedTracks, cursor]);

  const progress = timeline
    ? Math.round(((cursor - timeline.start) / (timeline.end - timeline.start)) * 100)
    : 0;

  /** Toggle native browser fullscreen on the map wrapper element. */
  const toggleFullscreen = useCallback(() => {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen().catch(() => {
        // Fullscreen request may be denied (e.g. iframe without allow="fullscreen")
      });
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Keep isFullscreen state in sync with the browser fullscreen state
  // (handles Esc key exit as well as programmatic exit).
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  return (
    <div ref={wrapperRef} className={`relative flex h-full w-full flex-col ${isFullscreen ? 'bg-white' : ''} ${className ?? ''}`}>
      <div ref={containerRef} className="min-h-[320px] flex-1" />

      {/* Base layer switch */}
      <div className="absolute right-3 top-3 z-500 flex overflow-hidden rounded-lg border bg-white/95 shadow-xs backdrop-blur-sm">
        {(Object.keys(BASE_LAYER_LABELS) as BaseLayerId[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setBaseLayer(id)}
            aria-pressed={baseLayer === id}
            className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              baseLayer === id ? 'bg-[#D71920] text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {BASE_LAYER_LABELS[id]}
          </button>
        ))}
      </div>

      {/* Camera controls */}
      <div className="absolute right-3 top-14 z-500 flex flex-col overflow-hidden rounded-lg border bg-white/95 shadow-xs backdrop-blur-sm">
        <MapAction label="Zoom in" onClick={() => zoomBy(1)}>
          <ZoomIn className="h-4 w-4" />
        </MapAction>
        <MapAction label="Zoom out" onClick={() => zoomBy(-1)}>
          <ZoomOut className="h-4 w-4" />
        </MapAction>
        <MapAction label="Fit to route (F)" onClick={fitRoute}>
          <Crosshair className="h-4 w-4" />
        </MapAction>
        <MapAction label="Centre on head office (O)" onClick={goToOffice}>
          <Building2 className="h-4 w-4" />
        </MapAction>
        <MapAction label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen}>
          {isFullscreen
            ? <Minimize2 className="h-4 w-4" />
            : <Maximize2 className="h-4 w-4" />
          }
        </MapAction>
      </div>

      {/* ── Fullscreen HUD: device telemetry overlay ─────────────────────── */}
      {isFullscreen && hudRows && hudRows.length > 0 && (
        <div className="absolute bottom-24 left-3 z-[500] w-72 max-h-[calc(100vh-140px)] overflow-y-auto rounded-xl border bg-white/95 shadow-xl backdrop-blur-sm">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-semibold">Live Devices ({hudRows.length})</span>
          </div>
          <div className="divide-y">
            {hudRows.map((row) => (
              <div key={row.deviceId} className={`px-3 py-2 ${row.active ? '' : 'opacity-50'}`}>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">{row.label}</span>
                  {row.moving && (
                    <span className="shrink-0 rounded bg-green-100 px-1 py-0.5 text-[9px] font-medium text-green-700">moving</span>
                  )}
                </div>
                {row.subLabel && (
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{row.subLabel}</p>
                )}
                <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                  <span>🚗 {row.speed}</span>
                  <span>🧭 {row.heading}</span>
                  <span>🏢 {row.fromOffice}</span>
                  <span>🕐 {row.lastSeen}</span>
                </div>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">📍 {row.address}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Fullscreen legend ─────────────────────────────────────────────── */}
      {isFullscreen && (
        <div className="absolute bottom-24 right-3 z-[500] rounded-xl border bg-white/95 px-3 py-2 shadow-xl backdrop-blur-sm">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Legend</p>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#D71920] text-white text-[8px]">▲</span>
              <span>Staff device (live)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-600 text-white text-[8px]">🛡</span>
              <span>Security post</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-orange-600 text-white text-[8px]">🏠</span>
              <span>Rented property</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-white text-[8px]">⬛</span>
              <span>Head office</span>
            </div>
          </div>
        </div>
      )}

      {/* Playback */}
      {enableReplay && timeline && (
        <div className="absolute bottom-3 left-3 right-3 z-500 space-y-2 rounded-xl border bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? 'Pause replay' : 'Play replay'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#D71920] text-white transition-colors hover:bg-[#b5151b]"
            >
              {playing ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor" aria-hidden="true">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={() => stepBy(-STEP_MS)}
              aria-label="Step back 30 seconds"
              title="Back 30s (←, shift for 5 min)"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-gray-600 transition-colors hover:bg-gray-100"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </button>

            <input
              type="range"
              min={timeline.start}
              max={timeline.end}
              step={1000}
              value={cursor}
              onChange={handleScrub}
              aria-label="Replay position"
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-gray-200 accent-[#D71920]"
            />

            <button
              type="button"
              onClick={() => stepBy(STEP_MS)}
              aria-label="Step forward 30 seconds"
              title="Forward 30s (→, shift for 5 min)"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-gray-600 transition-colors hover:bg-gray-100"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>

            <span className="min-w-[74px] text-right font-mono text-xs text-gray-700">
              {formatIstTime(new Date(cursor).toISOString(), true)}
            </span>

            <select
              value={multiplier}
              onChange={(event) => setMultiplier(Number(event.target.value))}
              aria-label="Replay speed"
              className="rounded border bg-white px-1.5 py-1 text-xs text-gray-700"
            >
              {REPLAY_SPEEDS.map((speed) => (
                <option key={speed} value={speed}>
                  {speed}×
                </option>
              ))}
            </select>
          </div>

          {/* Click a device to lock the camera onto it while the replay runs. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {cursorReadout.map((row) => {
              const following = followId === row.deviceId;
              return (
                <button
                  key={row.deviceId}
                  type="button"
                  onClick={() => toggleFollow(row.deviceId)}
                  disabled={!row.started}
                  aria-pressed={following}
                  title={following ? 'Stop following' : `Follow ${row.label}`}
                  className={`flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] transition-colors ${
                    following
                      ? 'border-[#D71920] bg-red-50 text-gray-900'
                      : row.started
                        ? 'border-transparent text-gray-700 hover:bg-gray-100'
                        : 'border-transparent text-gray-300'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
                  <span className="max-w-[120px] truncate font-medium">{row.label}</span>
                  <span className="font-mono">{row.speed}</span>
                  <span className="text-gray-400">{row.heading}</span>
                  <span className="text-gray-400">· {row.fromOffice}</span>
                  {following && <Crosshair className="h-3 w-3 text-[#D71920]" />}
                </button>
              );
            })}

            <span className="ml-auto flex items-center gap-2 text-[10px] text-gray-400">
              <span className="hidden sm:inline">space play · ←/→ step · F fit · O office</span>
              <span>{progress}%</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Square icon button for the camera control cluster. */
function MapAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center border-b text-gray-600 transition-colors last:border-b-0 hover:bg-gray-100 hover:text-gray-900"
    >
      {children}
    </button>
  );
}
