'use client';

import { useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Building2,
  Eye,
  EyeOff,
  Gauge,
  Info,
  MapPin,
  Route as RouteIcon,
  TimerReset,
} from 'lucide-react';
import {
  deviceLabel,
  formatDuration,
  formatIstTime,
  knotsToKmph,
  pathLengthKm,
  speedColor,
} from '@/services/traccar/traccarFormat';
import { dayCount } from '@/services/traccar/traccarTime';
import type { TraccarPosition } from '@/services/traccar/traccarTypes';
import { HEAD_OFFICE, distanceFromOfficeKm, isAtOffice } from '@/lib/officeLocation';
import { MapCanvas } from '../MapCanvas';
import type { MapPin as MapPinShape, MapTrack } from '../TrackMap';
import { useRouteReport, useStopsReport, useOperationalPostPins, useRentedPropertyPins } from '../useTrackingData';
import type { TrackingScope } from '../trackingUtils';
import { NoSelection, PanelEmpty, PanelError } from './PanelState';

/** Days of history we load without asking — a full route report is heavy. */
const AUTO_LOAD_DAY_LIMIT = 3;

/**
 * Replay view: the actual path travelled, animated on a shared timeline with
 * speed-graded colouring and the stops overlaid.
 */
export function ReplayPanel({ scope }: { scope: TrackingScope }) {
  const [hidden, setHidden] = useState<number[]>([]);
  const [showPoints, setShowPoints] = useState(false);
  const [showStops, setShowStops] = useState(true);
  const [showOffice, setShowOffice] = useState(true);
  const [forceLoad, setForceLoad] = useState(false);

  const days = dayCount(scope.range);
  const overLimit = days > AUTO_LOAD_DAY_LIMIT;
  const shouldLoad = scope.selectedIds.length > 0 && (!overLimit || forceLoad);

  const routeQuery = useRouteReport(scope.selectedIds, scope.range, shouldLoad);
  const stopsQuery = useStopsReport(scope.selectedIds, scope.range, shouldLoad);
  const postPinsQuery = useOperationalPostPins();
  const propertyPinsQuery = useRentedPropertyPins();
  const [showPosts, setShowPosts] = useState(true);
  const [showProperties, setShowProperties] = useState(true);

  /** Positions grouped per device and ordered in time. */
  const tracks = useMemo<MapTrack[]>(() => {
    const positions = routeQuery.data ?? [];
    const grouped = new Map<number, TraccarPosition[]>();

    for (const position of positions) {
      const bucket = grouped.get(position.deviceId);
      if (bucket) bucket.push(position);
      else grouped.set(position.deviceId, [position]);
    }

    return scope.selected
      .map((device) => {
        const points = (grouped.get(device.id) ?? [])
          .slice()
          .sort((a, b) => new Date(a.fixTime).getTime() - new Date(b.fixTime).getTime());
        return {
          deviceId: device.id,
          label: deviceLabel(device),
          color: scope.colors[device.id] ?? '#94A3B8',
          positions: points,
        };
      })
      .filter((track) => track.positions.length > 0);
  }, [routeQuery.data, scope.selected, scope.colors]);

  const visibleTracks = useMemo(
    () => tracks.filter((track) => !hidden.includes(track.deviceId)),
    [tracks, hidden]
  );

  /** Start / end markers plus stop markers for the visible devices. */
  const pins = useMemo<MapPinShape[]>(() => {
    const result: MapPinShape[] = [];

    for (const track of visibleTracks) {
      const first = track.positions[0];
      const last = track.positions[track.positions.length - 1];

      result.push({
        id: `start-${track.deviceId}`,
        latitude: first.latitude,
        longitude: first.longitude,
        color: track.color,
        title: `${track.label} — start`,
        kind: 'start',
        lines: [formatIstTime(first.fixTime, true)],
      });
      result.push({
        id: `end-${track.deviceId}`,
        latitude: last.latitude,
        longitude: last.longitude,
        color: track.color,
        title: `${track.label} — last fix`,
        kind: 'end',
        lines: [formatIstTime(last.fixTime, true)],
      });
    }

    if (showStops) {
      const visibleIds = new Set(visibleTracks.map((track) => track.deviceId));
      for (const stop of stopsQuery.data ?? []) {
        if (!visibleIds.has(stop.deviceId)) continue;
        result.push({
          id: `stop-${stop.deviceId}-${stop.positionId}`,
          latitude: stop.latitude,
          longitude: stop.longitude,
          color: '#475569',
          title: `Stopped ${formatDuration(stop.duration)}`,
          kind: 'stop',
          badge: formatDuration(stop.duration),
          lines: [
            `${formatIstTime(stop.startTime)} → ${formatIstTime(stop.endTime)}`,
            stop.address || `${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}`,
          ],
        });
      }
    }

    return result;
  }, [visibleTracks, showStops, stopsQuery.data]);

  /** Per-device figures derived from the points themselves. */
  const stats = useMemo(
    () =>
      tracks.map((track) => {
        const speeds = track.positions.map((position) => knotsToKmph(position.speed));
        const moving = track.positions.filter((position) => knotsToKmph(position.speed) >= 3).length;
        const first = track.positions[0];
        const last = track.positions[track.positions.length - 1];
        const spanMs = new Date(last.fixTime).getTime() - new Date(first.fixTime).getTime();

        // Farthest the device got from the head office on this route.
        const reachKm = track.positions.reduce(
          (peak, position) => Math.max(peak, distanceFromOfficeKm(position)),
          0
        );

        return {
          deviceId: track.deviceId,
          label: track.label,
          color: track.color,
          km: pathLengthKm(track.positions),
          points: track.positions.length,
          topSpeed: speeds.length ? Math.max(...speeds) : 0,
          movingShare: track.positions.length ? moving / track.positions.length : 0,
          firstFix: first.fixTime,
          lastFix: last.fixTime,
          spanMs,
          reachKm,
          startedAtOffice: isAtOffice(first),
          endedAtOffice: isAtOffice(last),
        };
      }),
    [tracks]
  );

  const totalPoints = tracks.reduce((sum, track) => sum + track.positions.length, 0);

  if (scope.selectedIds.length === 0) return <NoSelection />;

  if (overLimit && !forceLoad) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>
            {days} days selected. A full route replay downloads every GPS fix, so it is not loaded
            automatically beyond {AUTO_LOAD_DAY_LIMIT} days.
          </span>
          <Button size="sm" variant="outline" onClick={() => setForceLoad(true)}>
            Load anyway
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (routeQuery.isError) {
    return <PanelError error={routeQuery.error} onRetry={() => routeQuery.refetch()} />;
  }

  if (routeQuery.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <Skeleton className="h-[560px] w-full" />
        <Skeleton className="h-[560px] w-full" />
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <PanelEmpty
        icon={RouteIcon}
        title="No movement recorded for this range"
        hint="The selected devices did not report any positions. Check that the Traccar Client app is running on their phones."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/20 px-3 py-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <Switch checked={showPoints} onCheckedChange={setShowPoints} />
          Show every fix
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <Switch checked={showStops} onCheckedChange={setShowStops} />
          Show stops ({stopsQuery.data?.length ?? 0})
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <Switch checked={showOffice} onCheckedChange={setShowOffice} />
          Show {HEAD_OFFICE.name}
        </label>

        <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>{totalPoints.toLocaleString('en-IN')} fixes</span>
          <SpeedLegend />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          {/* ── Layer toggles ──────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3 border-b px-3 py-2 text-xs">
            <span className="font-medium text-muted-foreground">Show on map:</span>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={showPosts}
                onChange={(e) => setShowPosts(e.target.checked)}
                className="h-3.5 w-3.5 accent-blue-600"
              />
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-blue-600" />
                Security Posts
                {postPinsQuery.data && (
                  <span className="text-muted-foreground">({postPinsQuery.data.length})</span>
                )}
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={showProperties}
                onChange={(e) => setShowProperties(e.target.checked)}
                className="h-3.5 w-3.5 accent-orange-600"
              />
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-orange-600" />
                Rented Properties
                {propertyPinsQuery.data && (
                  <span className="text-muted-foreground">({propertyPinsQuery.data.length})</span>
                )}
              </span>
            </label>
          </div>
          <div className="h-[520px]">
            <MapCanvas
              tracks={visibleTracks}
              pins={pins}
              postPins={postPinsQuery.data ?? []}
              propertyPins={propertyPinsQuery.data ?? []}
              showPosts={showPosts}
              showProperties={showProperties}
              showTrackPoints={showPoints}
              showOffice={showOffice}
              enableReplay
              fitSignal={`replay-${scope.range.startDate}-${scope.range.endDate}-${visibleTracks.map((t) => t.deviceId).join(',')}`}
            />
          </div>
        </Card>

        <Card className="flex max-h-[560px] flex-col overflow-hidden">
          <div className="border-b px-3 py-2.5 text-sm font-semibold">
            Devices on this route
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="divide-y">
              {stats.map((row) => {
                const isHidden = hidden.includes(row.deviceId);
                return (
                  <div key={row.deviceId} className={`px-3 py-2.5 ${isHidden ? 'opacity-45' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {row.label}
                      </span>
                      <button
                        type="button"
                        aria-label={isHidden ? 'Show on map' : 'Hide from map'}
                        onClick={() =>
                          setHidden((current) =>
                            current.includes(row.deviceId)
                              ? current.filter((id) => id !== row.deviceId)
                              : [...current, row.deviceId]
                          )
                        }
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>

                    <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <RouteIcon className="h-3 w-3" />
                        <strong className="font-semibold text-foreground">
                          {row.km.toFixed(1)} km
                        </strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <Gauge className="h-3 w-3" />
                        max {Math.round(row.topSpeed)} km/h
                      </span>
                      <span className="flex items-center gap-1">
                        <TimerReset className="h-3 w-3" />
                        {formatDuration(row.spanMs)} span
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {row.points} fixes
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Building2 className="h-3 w-3 shrink-0 text-blue-600" />
                      <span>
                        {row.reachKm.toFixed(1)} km max from office
                        {row.startedAtOffice && ' · started on site'}
                        {row.endedAtOffice && ' · ended on site'}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        {formatIstTime(row.firstFix)} → {formatIstTime(row.lastFix)}
                      </span>
                      <Badge variant="outline" className="h-4 px-1 text-[9px]">
                        {Math.round(row.movingShare * 100)}% moving
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Legend for the speed-graded route colouring. */
function SpeedLegend() {
  const bands = [0, 10, 30, 50, 70, 90];
  return (
    <span className="flex items-center gap-1">
      <span className="mr-0.5">Speed</span>
      {bands.map((kmph) => (
        <span
          key={kmph}
          title={`${kmph} km/h`}
          className="h-2 w-4 rounded-sm"
          style={{ backgroundColor: speedColor(kmph) }}
        />
      ))}
      <span className="ml-0.5">fast</span>
    </span>
  );
}
