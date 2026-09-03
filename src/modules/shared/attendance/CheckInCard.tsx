'use client';

/**
 * CheckInCard — a single pending check-in in the shared Approval Queue.
 *
 * Renders every piece of evidence an Approver must see for one record (R10.2):
 * the captured photo, a Leaflet map marker at the captured GPS location, the
 * server-computed distance to the post, the check-in timestamp, the employee
 * identifier, and the post identifier. It shows an out-of-geofence badge when
 * the record is outside the geofence (R10.3) and a low-accuracy badge when the
 * record is flagged low-accuracy (R10.4). When either the photo or the map
 * cannot be loaded, an "evidence unavailable" placeholder is shown in place of
 * that item while the remaining fields keep rendering (R10.5).
 *
 * The photo is never a public URL: the card fetches the authorized photo route
 * (`/api/attendance/checkin/{id}/photo`), which returns a short-lived signed URL
 * `{ url }` for approvers only (R8.4, R8.7). Any failure — network error, 403,
 * 410 (expired), 502 — resolves to the placeholder.
 *
 * Approve/reject actions are delegated to the parent (the queue wires them to
 * the resolve route); this component only gathers the optional reviewer note.
 *
 * Requirements: 10.2, 10.3, 10.4, 10.5
 */

import { useEffect, useRef, useState } from 'react';
import {
  MapPin,
  Sun,
  Sunset,
  Moon,
  ImageOff,
  MapPinOff,
  AlertTriangle,
  Crosshair,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  User,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CheckInViewModel } from './useApprovalQueue';
import type { ShiftKey } from '@/lib/attendance/lifecycle';

// ---------------------------------------------------------------------------
// Shift presentation (mirrors the Sun/Sunset/Moon convention used across the
// supervisor portal, e.g. SupervisorDeployments / SupervisorAttendance).
// ---------------------------------------------------------------------------

const SHIFT_META: Record<ShiftKey, { label: string; Icon: typeof Sun }> = {
  day: { label: 'Day', Icon: Sun },
  afternoon: { label: 'Afternoon', Icon: Sunset },
  night: { label: 'Night', Icon: Moon },
};

/** Format an ISO timestamp for display, falling back to the raw value. */
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Map marker (single point, raw Leaflet via dynamic import — matches the
// repo's existing MapPinPicker / LeafletMap convention rather than react-leaflet).
// ---------------------------------------------------------------------------

interface CheckInMapProps {
  lat: number;
  lng: number;
  /** Bubbles up an initialization failure so the card can show a placeholder. */
  onError: () => void;
}

function CheckInMap({ lat, lng, onError }: CheckInMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;

    import('leaflet')
      .then(async (L) => {
        if (cancelled || !containerRef.current || mapRef.current) return;

        // Fix the default marker icon paths (bundlers otherwise drop them).
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl:
            'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          shadowUrl:
            'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });

        const map = L.map(containerRef.current, {
          center: [lat, lng],
          zoom: 16,
          zoomControl: false,
          attributionControl: false,
          dragging: true,
          scrollWheelZoom: false,
        });

        // Official Google Map Tiles API — keyed, ToS-compliant.
        const { buildGoogleTileLayer } = await import('@/lib/googleMaps');
        const tileLayer = await buildGoogleTileLayer('roadmap');
        if (cancelled) { map.remove(); return; }
        tileLayer.addTo(map);

        // Red circle marker — clearly visible on satellite imagery too.
        L.circleMarker([lat, lng], {
          radius: 9,
          color: '#ffffff',
          weight: 2,
          fillColor: '#D71920',
          fillOpacity: 1,
        }).addTo(map);

        mapRef.current = map;
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current();
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      className="h-40 w-full rounded-md border overflow-hidden bg-muted"
      style={{ position: 'relative', zIndex: 0 }}
      aria-label="Check-in location map"
    />
  );
}

// ---------------------------------------------------------------------------
// Evidence-unavailable placeholder (R10.5)
// ---------------------------------------------------------------------------

function EvidencePlaceholder({
  kind,
  message,
}: {
  kind: 'photo' | 'map';
  message: string;
}) {
  const Icon = kind === 'photo' ? ImageOff : MapPinOff;
  return (
    <div
      className="flex h-40 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/50 text-center text-xs text-muted-foreground"
      role="status"
    >
      <Icon className="h-6 w-6 opacity-60" />
      <span>{message}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photo (fetches the authorized signed-URL route, falls back to placeholder)
// ---------------------------------------------------------------------------

function CheckInPhoto({ item }: { item: CheckInViewModel }) {
  // `failed` covers every unavailable path: expired, non-ok response, network
  // error, or the <img> itself failing to load (R10.5).
  const [failed, setFailed] = useState<boolean>(item.photoExpired);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!item.photoExpired);

  useEffect(() => {
    if (item.photoExpired) {
      setFailed(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setUrl(null);

    fetch(item.photoRef)
      .then(async (res) => {
        if (!res.ok) throw new Error(`photo ${res.status}`);
        const body = (await res.json()) as { url?: string };
        if (!body?.url) throw new Error('no signed url');
        if (!cancelled) setUrl(body.url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item.photoRef, item.photoExpired]);

  if (failed) {
    return (
      <EvidencePlaceholder kind="photo" message="Photo evidence unavailable" />
    );
  }

  if (loading || !url) {
    return (
      <div className="flex h-40 w-full items-center justify-center rounded-md border bg-muted">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={`Check-in photo for ${item.employeeId}`}
      className="h-40 w-full rounded-md border object-cover"
      onError={() => setFailed(true)}
    />
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export interface CheckInCardProps {
  item: CheckInViewModel;
  /** Approve the record; optional reviewer note is not used for approve. */
  onApprove: (id: string) => void | Promise<void>;
  /** Reject the record with an optional reviewer note (≤ 500 chars). */
  onReject: (id: string, notes?: string) => void | Promise<void>;
  /** True while a resolve action for this card is in flight. */
  isResolving?: boolean;
}

export function CheckInCard({
  item,
  onApprove,
  onReject,
  isResolving = false,
}: CheckInCardProps) {
  const [mapFailed, setMapFailed] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [notes, setNotes] = useState('');

  const isBrowser = typeof window !== 'undefined';
  const shift = SHIFT_META[item.shiftKey] ?? { label: item.shiftKey, Icon: Sun };
  const ShiftIcon = shift.Icon;

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-3 p-4">
        {/* Header: employee + post + shift */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{item.employeeId}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate" title={item.postId}>
                Post {item.postId}
              </span>
            </div>
          </div>
          <Badge variant="secondary" className="gap-1">
            <ShiftIcon className="h-3.5 w-3.5" />
            {shift.label}
          </Badge>
        </div>

        {/* Attention indicators (R10.3, R10.4) */}
        {(item.outOfGeofence || item.lowAccuracy) && (
          <div className="flex flex-wrap gap-2">
            {item.outOfGeofence && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Out of geofence
              </Badge>
            )}
            {item.lowAccuracy && (
              <Badge
                variant="outline"
                className="gap-1 border-amber-500 text-amber-600"
              >
                <Crosshair className="h-3.5 w-3.5" />
                Low accuracy
              </Badge>
            )}
          </div>
        )}

        {/* Evidence: photo + map (R10.2, R10.5) */}
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckInPhoto item={item} />
          {isBrowser && !mapFailed ? (
            <CheckInMap
              lat={item.mapLocation.lat}
              lng={item.mapLocation.lng}
              onError={() => setMapFailed(true)}
            />
          ) : (
            <EvidencePlaceholder
              kind="map"
              message="Map location unavailable"
            />
          )}
        </div>

        {/* Facts: distance, timestamp, coords (R10.2) */}
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Distance to post</dt>
            <dd className="font-medium">{item.distanceM.toFixed(1)} m</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Accuracy</dt>
            <dd className="font-medium">
              {item.gpsAccuracyM == null
                ? 'Unknown'
                : `${item.gpsAccuracyM.toFixed(1)} m`}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Check-in time
            </dt>
            <dd className="font-medium">{formatTimestamp(item.timestamp)}</dd>
          </div>
        </dl>

        {/* Reject note field */}
        {showReject && (
          <div className="space-y-1">
            <label
              htmlFor={`reject-notes-${item.id}`}
              className="text-xs font-medium text-muted-foreground"
            >
              Rejection note (optional, max 500 chars)
            </label>
            <textarea
              id={`reject-notes-${item.id}`}
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border bg-background p-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-ring"
              placeholder="Reason for rejection…"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {!showReject ? (
            <>
              <Button
                size="sm"
                variant="gradient"
                disabled={isResolving}
                onClick={() => onApprove(item.id)}
                className="flex-1"
              >
                {isResolving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isResolving}
                onClick={() => setShowReject(true)}
                className="flex-1"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="destructive"
                disabled={isResolving}
                onClick={() => onReject(item.id, notes.trim() || undefined)}
                className="flex-1"
              >
                {isResolving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Confirm reject
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={isResolving}
                onClick={() => {
                  setShowReject(false);
                  setNotes('');
                }}
                className={cn('flex-1')}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default CheckInCard;
