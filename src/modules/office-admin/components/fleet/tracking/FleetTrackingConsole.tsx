'use client';

import { useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CircleDot,
  Gauge,
  IndianRupee,
  List,
  MapPin,
  Radio,
  RefreshCw,
  Route as RouteIcon,
  Settings2,
  TimerReset,
} from 'lucide-react';
import {
  RANGE_PRESETS,
  dayCount,
  resolveRange,
  todayInIST,
  type DayRange,
  type RangePreset,
} from '@/services/traccar/traccarTime';
import {
  deviceRatePerKm,
  formatCurrency,
  formatDuration,
  formatKm,
  formatSpeed,
  isRecentlyActive,
  metresToKm,
} from '@/services/traccar/traccarFormat';
import {
  useRefreshTracking,
  useStopsReport,
  useSummaryReport,
  useTraccarDevices,
  useTripsReport,
} from './useTrackingData';
import { buildDeviceColors, type TrackingScope } from './trackingUtils';
import { DeviceFilter } from './DeviceFilter';
import { LivePanel } from './panels/LivePanel';
import { ReplayPanel } from './panels/ReplayPanel';
import { TripsPanel } from './panels/TripsPanel';
import { StopsPanel } from './panels/StopsPanel';
import { EventsPanel } from './panels/EventsPanel';
import { AnalyticsPanel } from './panels/AnalyticsPanel';
import { DevicesPanel } from './panels/DevicesPanel';

/**
 * Patrolling & trips console.
 *
 * One filter bar (devices + date range + live interval) feeds every view, so
 * switching between the map, tables and analytics keeps the same scope and
 * reuses the cached report data.
 */

type ViewId = 'live' | 'replay' | 'trips' | 'stops' | 'events' | 'analytics' | 'devices';

const VIEWS: ReadonlyArray<{ id: ViewId; label: string; icon: typeof Radio }> = [
  { id: 'live', label: 'Live', icon: Radio },
  { id: 'replay', label: 'Replay', icon: RouteIcon },
  { id: 'trips', label: 'Trips', icon: List },
  { id: 'stops', label: 'Stops', icon: TimerReset },
  { id: 'events', label: 'Events', icon: Bell },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'devices', label: 'Devices', icon: Settings2 },
];

const REFRESH_OPTIONS = [
  { value: 0, label: 'Manual' },
  { value: 15_000, label: '15 s' },
  { value: 30_000, label: '30 s' },
  { value: 60_000, label: '1 min' },
  { value: 300_000, label: '5 min' },
];

export function FleetTrackingConsole() {
  const today = todayInIST();

  const [view, setView] = useState<ViewId>('live');
  const [preset, setPreset] = useState<RangePreset>('today');
  const [customRange, setCustomRange] = useState<DayRange>({ startDate: today, endDate: today });
  const [selectedIds, setSelectedIds] = useState<number[] | null>(null);
  const [refreshMs, setRefreshMs] = useState(30_000);

  const range = useMemo(() => resolveRange(preset, customRange), [preset, customRange]);

  const devicesQuery = useTraccarDevices();
  // Memoised so the empty-array fallback does not create a new reference on
  // every render and invalidate every downstream memo.
  const devices = useMemo(() => devicesQuery.data ?? [], [devicesQuery.data]);
  const colors = useMemo(() => buildDeviceColors(devices), [devices]);
  const refreshAll = useRefreshTracking();

  // Default to every device until the user narrows it down.
  const effectiveIds = useMemo(
    () => selectedIds ?? devices.map((device) => device.id),
    [selectedIds, devices]
  );

  const scope: TrackingScope = useMemo(
    () => ({
      devices,
      selected: devices.filter((device) => effectiveIds.includes(device.id)),
      selectedIds: effectiveIds,
      range,
      colors,
      refreshMs,
    }),
    [devices, effectiveIds, range, colors, refreshMs]
  );

  // Headline numbers come from the aggregate reports, shared with the panels.
  const summaryQuery = useSummaryReport(effectiveIds, range);
  const tripsQuery = useTripsReport(effectiveIds, range);
  const stopsQuery = useStopsReport(effectiveIds, range);

  const kpis = useMemo(() => {
    const summaries = summaryQuery.data ?? [];
    const trips = tripsQuery.data ?? [];
    const stops = stopsQuery.data ?? [];

    const totalMetres = summaries.reduce((sum, row) => sum + (row.distance || 0), 0);
    const maxSpeed = summaries.reduce((peak, row) => Math.max(peak, row.maxSpeed || 0), 0);
    const drivingMs = trips.reduce((sum, trip) => sum + (trip.duration || 0), 0);
    const idleMs = stops.reduce((sum, stop) => sum + (stop.duration || 0), 0);
    const reimbursement = summaries.reduce((sum, row) => {
      const rate = deviceRatePerKm(devices.find((device) => device.id === row.deviceId));
      return sum + metresToKm(row.distance || 0) * rate;
    }, 0);

    return {
      totalMetres,
      maxSpeed,
      drivingMs,
      idleMs,
      reimbursement,
      tripCount: trips.length,
      stopCount: stops.length,
      reportedDevices: new Set(summaries.map((row) => row.deviceId)).size,
      liveNow: scope.selected.filter((device) => isRecentlyActive(device.lastUpdate)).length,
    };
  }, [summaryQuery.data, tripsQuery.data, stopsQuery.data, devices, scope.selected]);

  const loadingKpis = summaryQuery.isLoading || tripsQuery.isLoading || stopsQuery.isLoading;
  const days = dayCount(range);

  // Device loading / access problems block everything, so surface them first.
  if (devicesQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    );
  }

  if (devicesQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>Could not reach the GPS server: {devicesQuery.error.message}</span>
          <Button size="sm" variant="outline" onClick={() => devicesQuery.refetch()}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (devices.length === 0) {
    return (
      <Alert>
        <Radio className="h-4 w-4" />
        <AlertDescription>
          No trackers are registered on the GPS server yet. Add a device from a vehicle&apos;s
          record, then it will appear here.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-2.5">
        <DeviceFilter
          devices={devices}
          selectedIds={effectiveIds}
          onChange={setSelectedIds}
          colors={colors}
        />

        <div className="flex flex-wrap items-center gap-1">
          {RANGE_PRESETS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={preset === option.value ? 'default' : 'ghost'}
              className="h-8 px-2.5 text-xs"
              onClick={() => setPreset(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={customRange.startDate}
              max={customRange.endDate}
              onChange={(event) =>
                setCustomRange((current) => ({ ...current, startDate: event.target.value }))
              }
              className="h-8 w-[140px] text-xs"
              aria-label="Range start date"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={customRange.endDate}
              min={customRange.startDate}
              max={today}
              onChange={(event) =>
                setCustomRange((current) => ({ ...current, endDate: event.target.value }))
              }
              className="h-8 w-[140px] text-xs"
              aria-label="Range end date"
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />
            <Select
              value={String(refreshMs)}
              onValueChange={(value) => setRefreshMs(Number(value))}
            >
              <SelectTrigger className="h-8 w-[104px] text-xs" aria-label="Live refresh interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFRESH_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button size="sm" variant="outline" className="h-8" onClick={refreshAll}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <Kpi
          icon={RouteIcon}
          label="Distance"
          value={formatKm(kpis.totalMetres)}
          hint={`${days} day${days > 1 ? 's' : ''} · ${kpis.reportedDevices} reporting`}
          loading={loadingKpis}
          tone="text-emerald-600"
        />
        <Kpi
          icon={List}
          label="Trips"
          value={String(kpis.tripCount)}
          hint={`${formatDuration(kpis.drivingMs)} moving`}
          loading={loadingKpis}
          tone="text-blue-600"
        />
        <Kpi
          icon={TimerReset}
          label="Stops"
          value={String(kpis.stopCount)}
          hint={`${formatDuration(kpis.idleMs)} idle`}
          loading={loadingKpis}
          tone="text-amber-600"
        />
        <Kpi
          icon={Gauge}
          label="Top speed"
          value={formatSpeed(kpis.maxSpeed)}
          hint="Fastest fix in range"
          loading={loadingKpis}
          tone="text-orange-600"
        />
        <Kpi
          icon={IndianRupee}
          label="Reimbursement"
          value={formatCurrency(kpis.reimbursement)}
          hint="From each device's rate/km"
          loading={loadingKpis}
          tone="text-violet-600"
        />
        <Kpi
          icon={Radio}
          label="Live now"
          value={`${kpis.liveNow}/${scope.selected.length}`}
          hint="Reported in last 15 min"
          loading={false}
          tone="text-green-600"
        />
        <Kpi
          icon={MapPin}
          label="Devices"
          value={`${scope.selected.length}`}
          hint={`of ${devices.length} registered`}
          loading={false}
          tone="text-slate-600"
        />
      </div>

      {/* ── View switcher ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 border-b pb-2">
        {VIEWS.map((option) => {
          const Icon = option.icon;
          const active = view === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setView(option.id)}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#D71920] text-white shadow-xs'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {option.label}
            </button>
          );
        })}

        {scope.selectedIds.length === 0 && (
          <Badge variant="outline" className="ml-2 border-amber-200 bg-amber-50 text-amber-700">
            Select at least one device
          </Badge>
        )}
      </div>

      {/* ── Active view ───────────────────────────────────────────────────── */}
      {view === 'live' && <LivePanel scope={scope} />}
      {view === 'replay' && <ReplayPanel scope={scope} />}
      {view === 'trips' && <TripsPanel scope={scope} />}
      {view === 'stops' && <StopsPanel scope={scope} />}
      {view === 'events' && <EventsPanel scope={scope} />}
      {view === 'analytics' && <AnalyticsPanel scope={scope} />}
      {view === 'devices' && <DevicesPanel scope={scope} />}
    </div>
  );
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  loading,
  tone,
}: {
  icon: typeof Radio;
  label: string;
  value: string;
  hint: string;
  loading: boolean;
  tone: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${tone}`} />
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-1.5 h-6 w-20" />
      ) : (
        <p className="mt-1 text-lg font-bold leading-tight">{value}</p>
      )}
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}
