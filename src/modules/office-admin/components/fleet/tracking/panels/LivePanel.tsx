'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  BatteryCharging,
  BatteryMedium,
  Building2,
  Compass,
  Crosshair,
  ExternalLink,
  Gauge,
  MapPin,
  Mountain,
  Navigation,
  Radio,
  Satellite,
  Signal,
} from 'lucide-react';
import {
  batteryTone,
  courseToCompass,
  deviceLabel,
  deviceSubLabel,
  formatIstDateTime,
  formatKm,
  formatRelative,
  formatSpeed,
  isRecentlyActive,
} from '@/services/traccar/traccarFormat';
import {
  describeFromOffice,
  distanceFromOfficeKm,
  isAtOffice,
  locationLabel,
  shortFromOffice,
} from '@/lib/officeLocation';
import type { TraccarPosition } from '@/services/traccar/traccarTypes';
import { MapCanvas } from '../MapCanvas';
import type { MapPin as MapPinShape, HudRow } from '../TrackMap';
import { useLivePositions, useOperationalPostPins, useRentedPropertyPins } from '../useTrackingData';
import { mapsLink, type TrackingScope } from '../trackingUtils';
import { NoSelection, PanelError } from './PanelState';

/**
 * Live view: where everyone is right now, with the full telemetry Traccar keeps
 * on the latest fix. Polls on the interval chosen in the console toolbar.
 */
export function LivePanel({ scope }: { scope: TrackingScope }) {
  const [focusId, setFocusId] = useState<number | null>(null);
  const [showPosts, setShowPosts] = useState(true);
  const [showProperties, setShowProperties] = useState(true);
  const [showOffice, setShowOffice] = useState(true);
  const positionsQuery = useLivePositions(scope.refreshMs, scope.selectedIds.length > 0);
  const postPinsQuery = useOperationalPostPins();
  const propertyPinsQuery = useRentedPropertyPins();

  const rows = useMemo(() => {
    const byDevice = new Map<number, TraccarPosition>();
    for (const position of positionsQuery.data ?? []) {
      const existing = byDevice.get(position.deviceId);
      // Keep the newest fix if the server returns more than one per device.
      if (!existing || new Date(position.fixTime) > new Date(existing.fixTime)) {
        byDevice.set(position.deviceId, position);
      }
    }

    return scope.selected
      .map((device) => ({ device, position: byDevice.get(device.id) }))
      .sort((a, b) => {
        // Reporting devices first, then most recently seen.
        const aTime = a.position ? new Date(a.position.fixTime).getTime() : 0;
        const bTime = b.position ? new Date(b.position.fixTime).getTime() : 0;
        return bTime - aTime;
      });
  }, [positionsQuery.data, scope.selected]);

  const pins = useMemo<MapPinShape[]>(
    () =>
      rows
        .filter((row) => row.position)
        .map(({ device, position }) => {
          const fix = position as TraccarPosition;
          return {
            id: `live-${device.id}`,
            latitude: fix.latitude,
            longitude: fix.longitude,
            color: scope.colors[device.id] ?? '#94A3B8',
            title: deviceLabel(device),
            kind: 'live' as const,
            course: fix.course,
            moving: Boolean(fix.attributes?.motion),
            lines: [
              `${formatSpeed(fix.speed)} · ${courseToCompass(fix.course)}`,
              describeFromOffice(fix),
              `Seen ${formatRelative(fix.fixTime)}`,
              locationLabel(fix, fix.address),
            ],
          };
        }),
    [rows, scope.colors]
  );

  const focusPoint = useMemo(() => {
    if (focusId === null) return null;
    const match = rows.find((row) => row.device.id === focusId);
    if (!match?.position) return null;
    return { latitude: match.position.latitude, longitude: match.position.longitude, zoom: 17 };
  }, [focusId, rows]);

  /** HUD rows for the fullscreen overlay — one entry per device with telemetry. */
  const hudRows = useMemo<HudRow[]>(() =>
    rows.map(({ device, position }) => ({
      deviceId: device.id,
      label: deviceLabel(device),
      subLabel: deviceSubLabel(device) || device.uniqueId,
      color: scope.colors[device.id] ?? '#94A3B8',
      speed: position ? formatSpeed(position.speed) : '—',
      heading: position ? `${courseToCompass(position.course)} ${Math.round(position.course)}°` : '—',
      fromOffice: position ? describeFromOffice(position) : '—',
      lastSeen: position ? formatRelative(position.fixTime) : formatRelative(device.lastUpdate),
      address: position ? locationLabel(position, position.address) : 'No position',
      moving: Boolean(position?.attributes?.motion),
      active: isRecentlyActive(position?.fixTime ?? device.lastUpdate),
    })),
    [rows, scope.colors]
  );

  const reporting = rows.filter((row) => row.position).length;

  /** Split against the office radius, and find who is furthest out. */
  const officeSplit = useMemo(() => {
    const positioned = rows.filter((row) => row.position);
    const atOffice = positioned.filter((row) => isAtOffice(row.position!)).length;
    const farthest = positioned.reduce<{ name: string; km: number } | null>((best, row) => {
      const km = distanceFromOfficeKm(row.position!);
      return !best || km > best.km ? { name: deviceLabel(row.device), km } : best;
    }, null);
    return { atOffice, inField: positioned.length - atOffice, farthest };
  }, [rows]);

  if (scope.selectedIds.length === 0) return <NoSelection />;
  if (positionsQuery.isError) {
    return <PanelError error={positionsQuery.error} onRetry={() => positionsQuery.refetch()} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      <Card className="overflow-hidden">
        {/* ── Layer toggles ──────────────────────────────────────────── */}
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
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={showOffice}
              onChange={(e) => setShowOffice(e.target.checked)}
              className="h-3.5 w-3.5 accent-blue-800"
            />
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm bg-[#1D4ED8]" />
              Head Office
            </span>
          </label>
        </div>
        <div className="h-[520px]">
          <MapCanvas
            pins={pins}
            postPins={postPinsQuery.data ?? []}
            propertyPins={propertyPinsQuery.data ?? []}
            showPosts={showPosts}
            showProperties={showProperties}
            showOffice={showOffice}
            hudRows={hudRows}
            fitSignal={`live-${scope.selectedIds.join(',')}`}
            focus={focusPoint}
          />
        </div>
      </Card>

      <Card className="flex max-h-[560px] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-green-600" />
            <span className="text-sm font-semibold">Live telemetry</span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {reporting}/{rows.length} reporting
            {positionsQuery.isFetching && ' · updating'}
          </span>
        </div>

        {/* Everything is measured from the head office. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-blue-50/50 px-3 py-1.5 text-[11px]">
          <span className="flex items-center gap-1 font-medium text-blue-700">
            <Building2 className="h-3 w-3" />
            {officeSplit.atOffice} at office
          </span>
          <span className="text-muted-foreground">{officeSplit.inField} in the field</span>
          {officeSplit.farthest && officeSplit.farthest.km >= 0.15 && (
            <span className="ml-auto truncate text-muted-foreground">
              Farthest: {officeSplit.farthest.name} · {officeSplit.farthest.km.toFixed(1)} km
            </span>
          )}
        </div>

        {/* `min-h-0` lets this flex child shrink inside the card's max-height so it
            actually scrolls instead of overflowing. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="divide-y">
            {rows.map(({ device, position }) => {
              const colour = scope.colors[device.id] ?? '#94A3B8';
              const active = isRecentlyActive(position?.fixTime ?? device.lastUpdate);
              const battery = position?.attributes?.batteryLevel;
              const charging = Boolean(position?.attributes?.charge);
              const moving = Boolean(position?.attributes?.motion);
              const odometer = position?.attributes?.totalDistance;

              return (
                <button
                  key={device.id}
                  type="button"
                  onClick={() => setFocusId(device.id)}
                  disabled={!position}
                  className={`w-full px-3 py-2.5 text-left transition-colors ${
                    position ? 'hover:bg-muted/60' : 'opacity-60'
                  } ${focusId === device.id ? 'bg-muted/70' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colour }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium leading-tight">
                          {deviceLabel(device)}
                        </span>
                        {moving ? (
                          <Badge className="h-4 border-green-200 bg-green-50 px-1 text-[9px] text-green-700">
                            moving
                          </Badge>
                        ) : active ? (
                          <Badge className="h-4 border-slate-200 bg-slate-50 px-1 text-[9px] text-slate-600">
                            parked
                          </Badge>
                        ) : null}
                      </div>

                      <p className="truncate text-[11px] leading-tight text-muted-foreground">
                        {deviceSubLabel(device) || device.uniqueId}
                      </p>

                      {position ? (
                        <>
                          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                            <Metric icon={Gauge} value={formatSpeed(position.speed)} />
                            <Metric
                              icon={Compass}
                              value={`${courseToCompass(position.course)} ${Math.round(position.course)}°`}
                            />
                            <Metric
                              icon={charging ? BatteryCharging : BatteryMedium}
                              value={battery === undefined ? '—' : `${Math.round(battery)}%`}
                              tone={batteryTone(battery)}
                            />
                            <Metric
                              icon={Signal}
                              value={`±${Math.round(position.accuracy || 0)} m`}
                            />
                            {/* Distance from head office — the reference centre. */}
                            <Metric
                              icon={Building2}
                              value={shortFromOffice(position)}
                              tone={
                                isAtOffice(position) ? 'text-blue-600' : 'text-muted-foreground'
                              }
                            />
                            {odometer !== undefined && (
                              <Metric icon={Navigation} value={formatKm(odometer, 0)} />
                            )}
                            <Metric
                              icon={Mountain}
                              value={`${Math.round(position.altitude || 0)} m`}
                            />
                          </div>

                          <p className="mt-1.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                              {locationLabel(position, position.address)}
                            </span>
                          </p>

                          <div className="mt-1 flex items-center justify-between">
                            <span
                              className={`text-[10px] ${active ? 'text-green-600' : 'text-muted-foreground'}`}
                            >
                              {formatIstDateTime(position.fixTime)} · {formatRelative(position.fixTime)}
                            </span>
                            <span className="flex items-center gap-2">
                              <a
                                href={mapsLink(position.latitude, position.longitude)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline"
                              >
                                Maps <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                              <Crosshair className="h-3 w-3 text-muted-foreground" />
                            </span>
                          </div>
                        </>
                      ) : (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Satellite className="h-3 w-3" />
                          No position on record · last contact {formatRelative(device.lastUpdate)}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}

function Metric({
  icon: Icon,
  value,
  tone,
}: {
  icon: typeof Gauge;
  value: string;
  tone?: string;
}) {
  return (
    <span className={`flex items-center gap-1 ${tone ?? 'text-muted-foreground'}`}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate font-medium">{value}</span>
    </span>
  );
}
