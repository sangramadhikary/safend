'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BarChart3, Download } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  deviceLabel,
  deviceRatePerKm,
  deviceSubLabel,
  formatCurrency,
  formatDuration,
  formatKm,
  formatSpeed,
  knotsToKmph,
  metresToKm,
} from '@/services/traccar/traccarFormat';
import { eachDate, istDateOf, istHourOf } from '@/services/traccar/traccarTime';
import { HEAD_OFFICE, farthestFromOffice, isAtOffice } from '@/lib/officeLocation';
import { useStopsReport, useSummaryReport, useTripsReport } from '../useTrackingData';
import { downloadCsv, toCsv, type TrackingScope } from '../trackingUtils';
import { NoSelection, PanelEmpty, PanelError, PanelLoading } from './PanelState';

/**
 * Analytics view: the same report data as the tables, rolled up into daily
 * trends, a per-device league table and the reimbursement each person is owed.
 */
export function AnalyticsPanel({ scope }: { scope: TrackingScope }) {
  const dailyQuery = useSummaryReport(scope.selectedIds, scope.range, { daily: true });
  const totalQuery = useSummaryReport(scope.selectedIds, scope.range);
  const tripsQuery = useTripsReport(scope.selectedIds, scope.range);
  const stopsQuery = useStopsReport(scope.selectedIds, scope.range);

  /** Distance per IST day, one series per device. */
  const dailySeries = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const date of eachDate(scope.range)) {
      byDate.set(date, { date: date.slice(5) });
    }

    for (const row of dailyQuery.data ?? []) {
      // A daily row is stamped with the window it covers; bucket by its start.
      const date = istDateOf(row.startTime);
      const bucket = byDate.get(date);
      if (!bucket) continue;
      const key = `d${row.deviceId}`;
      bucket[key] = Number(((bucket[key] as number) ?? 0) + metresToKm(row.distance));
    }

    return [...byDate.values()];
  }, [dailyQuery.data, scope.range]);

  /** Trip starts bucketed by hour of day, showing when the field is active. */
  const hourlySeries = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({
      hour: `${String(hour).padStart(2, '0')}h`,
      trips: 0,
    }));
    for (const trip of tripsQuery.data ?? []) {
      const hour = istHourOf(trip.startTime);
      if (hour >= 0 && hour < 24) buckets[hour].trips += 1;
    }
    return buckets;
  }, [tripsQuery.data]);

  /** One row per device with everything the reports can tell us. */
  const deviceRows = useMemo(() => {
    const totals = totalQuery.data ?? [];
    const trips = tripsQuery.data ?? [];
    const stops = stopsQuery.data ?? [];
    const daily = dailyQuery.data ?? [];

    return scope.selected
      .map((device) => {
        const summary = totals.find((row) => row.deviceId === device.id);
        const deviceTrips = trips.filter((trip) => trip.deviceId === device.id);
        const deviceStops = stops.filter((stop) => stop.deviceId === device.id);
        const activeDays = new Set(
          daily
            .filter((row) => row.deviceId === device.id && (row.distance || 0) > 0)
            .map((row) => istDateOf(row.startTime))
        ).size;

        const metres = summary?.distance ?? 0;
        const rate = deviceRatePerKm(device);

        // How far this person got from the head office, taken from trip and stop
        // coordinates (the summary report carries no positions).
        const reach = farthestFromOffice([
          ...deviceTrips.flatMap((trip) => [
            { latitude: trip.startLat, longitude: trip.startLon },
            { latitude: trip.endLat, longitude: trip.endLon },
          ]),
          ...deviceStops.map((stop) => ({ latitude: stop.latitude, longitude: stop.longitude })),
        ]);

        return {
          device,
          km: metresToKm(metres),
          metres,
          farthestKm: reach?.km ?? 0,
          officeStops: deviceStops.filter((stop) => isAtOffice(stop)).length,
          trips: deviceTrips.length,
          stops: deviceStops.length,
          movingMs: deviceTrips.reduce((sum, trip) => sum + trip.duration, 0),
          idleMs: deviceStops.reduce((sum, stop) => sum + stop.duration, 0),
          maxSpeed: summary?.maxSpeed ?? 0,
          activeDays,
          rate,
          cost: metresToKm(metres) * rate,
          color: scope.colors[device.id] ?? '#94A3B8',
        };
      })
      .sort((a, b) => b.km - a.km);
  }, [totalQuery.data, tripsQuery.data, stopsQuery.data, dailyQuery.data, scope]);

  const deviceNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const device of scope.selected) names[`d${device.id}`] = deviceLabel(device);
    return names;
  }, [scope.selected]);

  const grandTotals = useMemo(
    () => ({
      km: deviceRows.reduce((sum, row) => sum + row.km, 0),
      cost: deviceRows.reduce((sum, row) => sum + row.cost, 0),
      trips: deviceRows.reduce((sum, row) => sum + row.trips, 0),
      movingMs: deviceRows.reduce((sum, row) => sum + row.movingMs, 0),
    }),
    [deviceRows]
  );

  const exportCsv = () => {
    const csv = toCsv(deviceRows, [
      { header: 'Person', value: (row) => deviceLabel(row.device) },
      { header: 'Details', value: (row) => deviceSubLabel(row.device) },
      { header: 'Device id', value: (row) => row.device.uniqueId },
      { header: 'Distance (km)', value: (row) => row.km.toFixed(2) },
      { header: 'Trips', value: (row) => row.trips },
      { header: 'Stops', value: (row) => row.stops },
      { header: 'Moving time', value: (row) => formatDuration(row.movingMs) },
      { header: 'Idle time', value: (row) => formatDuration(row.idleMs) },
      { header: 'Top speed (km/h)', value: (row) => Math.round(knotsToKmph(row.maxSpeed)) },
      { header: 'Farthest from office (km)', value: (row) => row.farthestKm.toFixed(2) },
      { header: 'Stops at office', value: (row) => row.officeStops },
      { header: 'Days active', value: (row) => row.activeDays },
      { header: 'Rate/km', value: (row) => row.rate },
      { header: 'Reimbursement', value: (row) => Math.round(row.cost) },
    ]);
    downloadCsv(`fleet-analytics-${scope.range.startDate}-to-${scope.range.endDate}.csv`, csv);
  };

  if (scope.selectedIds.length === 0) return <NoSelection />;
  if (totalQuery.isLoading || dailyQuery.isLoading) return <PanelLoading rows={8} />;
  if (totalQuery.isError) {
    return <PanelError error={totalQuery.error} onRetry={() => totalQuery.refetch()} />;
  }
  if (deviceRows.every((row) => row.km === 0)) {
    return (
      <PanelEmpty
        icon={BarChart3}
        title="Nothing to analyse yet"
        hint="No distance was recorded for the selected devices in this range."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">Distance per day</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailySeries} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  unit=" km"
                  width={62}
                />
                <ReTooltip
                  formatter={(value: number, key: string) => [
                    `${Number(value).toFixed(1)} km`,
                    deviceNames[key] ?? key,
                  ]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend
                  formatter={(key: string) => (
                    <span style={{ fontSize: 11 }}>{deviceNames[key] ?? key}</span>
                  )}
                />
                {scope.selected.map((device) => (
                  <Bar
                    key={device.id}
                    dataKey={`d${device.id}`}
                    stackId="km"
                    fill={scope.colors[device.id] ?? '#94A3B8'}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">Trip starts by hour (IST)</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px] pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlySeries} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval={2}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={44}
                />
                <ReTooltip
                  formatter={(value: number) => [`${value} trips`, 'Trips']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="trips" radius={[3, 3, 0, 0]}>
                  {hourlySeries.map((bucket) => (
                    <Cell
                      key={bucket.hour}
                      fill={bucket.trips > 0 ? '#2563EB' : '#E2E8F0'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm">Per-device breakdown</CardTitle>
          <Button size="sm" variant="outline" className="h-7" onClick={exportCsv}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person / device</TableHead>
                  <TableHead className="text-right">Distance</TableHead>
                  <TableHead className="text-right">Trips</TableHead>
                  <TableHead className="text-right">Moving</TableHead>
                  <TableHead className="text-right">Idle</TableHead>
                  <TableHead className="text-right">Top speed</TableHead>
                  <TableHead className="text-right" title="Farthest straight-line distance reached from the head office">
                    Reach
                  </TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead className="text-right">Rate/km</TableHead>
                  <TableHead className="text-right">Reimbursement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deviceRows.map((row) => (
                  <TableRow key={row.device.id}>
                    <TableCell className="py-2">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium leading-tight">
                            {deviceLabel(row.device)}
                          </span>
                          <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                            {deviceSubLabel(row.device) || row.device.uniqueId}
                          </span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="py-2 text-right text-sm font-semibold">
                      {formatKm(row.metres)}
                    </TableCell>
                    <TableCell className="py-2 text-right text-sm">{row.trips}</TableCell>
                    <TableCell className="py-2 text-right text-sm">
                      {formatDuration(row.movingMs)}
                    </TableCell>
                    <TableCell className="py-2 text-right text-sm text-muted-foreground">
                      {formatDuration(row.idleMs)}
                    </TableCell>
                    <TableCell className="py-2 text-right text-sm">
                      {formatSpeed(row.maxSpeed)}
                    </TableCell>
                    <TableCell className="py-2 text-right text-sm text-muted-foreground">
                      {row.farthestKm > 0 ? `${row.farthestKm.toFixed(1)} km` : '—'}
                    </TableCell>
                    <TableCell className="py-2 text-right text-sm">{row.activeDays}</TableCell>
                    <TableCell className="py-2 text-right text-sm">
                      {row.rate > 0 ? `₹${row.rate}` : '—'}
                    </TableCell>
                    <TableCell className="py-2 text-right text-sm font-semibold">
                      {row.rate > 0 ? formatCurrency(row.cost) : '—'}
                    </TableCell>
                  </TableRow>
                ))}

                <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                  <TableCell className="py-2 text-sm">
                    Total
                    <Badge variant="outline" className="ml-2 h-4 px-1 text-[9px] font-normal">
                      {deviceRows.length} devices
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 text-right text-sm">
                    {grandTotals.km.toFixed(1)} km
                  </TableCell>
                  <TableCell className="py-2 text-right text-sm">{grandTotals.trips}</TableCell>
                  <TableCell className="py-2 text-right text-sm">
                    {formatDuration(grandTotals.movingMs)}
                  </TableCell>
                  {/* idle, top speed, reach, days, rate */}
                  <TableCell colSpan={5} />
                  <TableCell className="py-2 text-right text-sm">
                    {formatCurrency(grandTotals.cost)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        Reimbursement uses the rate stored on each tracker — set it per person in the Devices tab or
        on the vehicle record. Reach is the farthest straight-line distance from {HEAD_OFFICE.name}{' '}
        ({HEAD_OFFICE.latitude.toFixed(5)}, {HEAD_OFFICE.longitude.toFixed(5)}), the reference point
        for every distance in this console.
      </p>
    </div>
  );
}
