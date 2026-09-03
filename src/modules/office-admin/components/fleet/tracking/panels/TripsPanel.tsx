'use client';

import { Fragment, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowDown,
  ArrowUp,
  Building2,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  List,
} from 'lucide-react';
import { isAtOffice, locationLabel, shortFromOffice } from '@/lib/officeLocation';
import {
  deviceRatePerKm,
  formatCurrency,
  formatDuration,
  formatIstDateTime,
  formatIstTime,
  formatKm,
  formatSpeed,
  metresToKm,
} from '@/services/traccar/traccarFormat';
import { useTripsReport } from '../useTrackingData';
import {
  deviceNameById,
  downloadCsv,
  findDevice,
  mapsLink,
  toCsv,
  type TrackingScope,
} from '../trackingUtils';
import { NoSelection, PanelEmpty, PanelError, PanelLoading } from './PanelState';

type SortKey = 'startTime' | 'distance' | 'duration' | 'maxSpeed' | 'device';

/**
 * Trips view: every discrete journey Traccar detected, with the addresses it
 * reverse-geocoded for the start and end points and the reimbursement each trip
 * earns at the device's own rate per km.
 */
export function TripsPanel({ scope }: { scope: TrackingScope }) {
  const [sortKey, setSortKey] = useState<SortKey>('startTime');
  const [descending, setDescending] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const tripsQuery = useTripsReport(scope.selectedIds, scope.range);

  const rows = useMemo(() => {
    const trips = tripsQuery.data ?? [];

    const enriched = trips.map((trip) => {
      const device = findDevice(scope, trip.deviceId);
      const rate = deviceRatePerKm(device);
      return {
        trip,
        key: `${trip.deviceId}-${trip.startPositionId}-${trip.endPositionId}`,
        name: deviceNameById(scope, trip.deviceId, trip.deviceName),
        color: scope.colors[trip.deviceId] ?? '#94A3B8',
        rate,
        cost: metresToKm(trip.distance) * rate,
        // Endpoints are classified against the head office radius.
        startedAtOffice: isAtOffice({ latitude: trip.startLat, longitude: trip.startLon }),
        endedAtOffice: isAtOffice({ latitude: trip.endLat, longitude: trip.endLon }),
      };
    });

    const direction = descending ? -1 : 1;
    return enriched.sort((a, b) => {
      switch (sortKey) {
        case 'device':
          return a.name.localeCompare(b.name) * direction;
        case 'distance':
          return (a.trip.distance - b.trip.distance) * direction;
        case 'duration':
          return (a.trip.duration - b.trip.duration) * direction;
        case 'maxSpeed':
          return (a.trip.maxSpeed - b.trip.maxSpeed) * direction;
        case 'startTime':
        default:
          return (
            (new Date(a.trip.startTime).getTime() - new Date(b.trip.startTime).getTime()) * direction
          );
      }
    });
  }, [tripsQuery.data, scope, sortKey, descending]);

  const totals = useMemo(
    () => ({
      distance: rows.reduce((sum, row) => sum + row.trip.distance, 0),
      duration: rows.reduce((sum, row) => sum + row.trip.duration, 0),
      cost: rows.reduce((sum, row) => sum + row.cost, 0),
      fromOffice: rows.filter((row) => row.startedAtOffice).length,
      toOffice: rows.filter((row) => row.endedAtOffice).length,
    }),
    [rows]
  );

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDescending((current) => !current);
      return;
    }
    setSortKey(key);
    setDescending(true);
  };

  const exportCsv = () => {
    const csv = toCsv(rows, [
      { header: 'Person / device', value: (row) => row.name },
      { header: 'Start', value: (row) => formatIstDateTime(row.trip.startTime) },
      { header: 'End', value: (row) => formatIstDateTime(row.trip.endTime) },
      { header: 'Duration', value: (row) => formatDuration(row.trip.duration) },
      { header: 'Distance (km)', value: (row) => metresToKm(row.trip.distance).toFixed(2) },
      { header: 'Avg speed (km/h)', value: (row) => formatSpeed(row.trip.averageSpeed) },
      { header: 'Max speed (km/h)', value: (row) => formatSpeed(row.trip.maxSpeed) },
      {
        header: 'From',
        value: (row) =>
          locationLabel(
            { latitude: row.trip.startLat, longitude: row.trip.startLon },
            row.trip.startAddress
          ),
      },
      {
        header: 'To',
        value: (row) =>
          locationLabel(
            { latitude: row.trip.endLat, longitude: row.trip.endLon },
            row.trip.endAddress
          ),
      },
      { header: 'Started at office', value: (row) => (row.startedAtOffice ? 'Yes' : 'No') },
      { header: 'Ended at office', value: (row) => (row.endedAtOffice ? 'Yes' : 'No') },
      { header: 'Rate/km', value: (row) => row.rate },
      { header: 'Reimbursement', value: (row) => Math.round(row.cost) },
    ]);
    downloadCsv(`trips-${scope.range.startDate}-to-${scope.range.endDate}.csv`, csv);
  };

  if (scope.selectedIds.length === 0) return <NoSelection />;
  if (tripsQuery.isLoading) return <PanelLoading />;
  if (tripsQuery.isError) {
    return <PanelError error={tripsQuery.error} onRetry={() => tripsQuery.refetch()} />;
  }
  if (rows.length === 0) {
    return (
      <PanelEmpty
        icon={List}
        title="No trips in this range"
        hint="Traccar records a trip once a device moves continuously. Short hops may appear under Stops instead."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{rows.length} trips</Badge>
          <span>
            <strong className="text-foreground">{formatKm(totals.distance)}</strong> covered
          </span>
          <span>
            <strong className="text-foreground">{formatDuration(totals.duration)}</strong> moving
          </span>
          <span>
            <strong className="text-foreground">{formatCurrency(totals.cost)}</strong> reimbursable
          </span>
          {(totals.fromOffice > 0 || totals.toOffice > 0) && (
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
              <Building2 className="mr-1 h-3 w-3" />
              {totals.fromOffice} from office · {totals.toOffice} back
            </Badge>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <SortableHead
                  label="Person / device"
                  active={sortKey === 'device'}
                  descending={descending}
                  onClick={() => toggleSort('device')}
                />
                <SortableHead
                  label="Started"
                  active={sortKey === 'startTime'}
                  descending={descending}
                  onClick={() => toggleSort('startTime')}
                />
                <SortableHead
                  label="Duration"
                  active={sortKey === 'duration'}
                  descending={descending}
                  onClick={() => toggleSort('duration')}
                  align="right"
                />
                <SortableHead
                  label="Distance"
                  active={sortKey === 'distance'}
                  descending={descending}
                  onClick={() => toggleSort('distance')}
                  align="right"
                />
                <SortableHead
                  label="Max speed"
                  active={sortKey === 'maxSpeed'}
                  descending={descending}
                  onClick={() => toggleSort('maxSpeed')}
                  align="right"
                />
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((row) => {
                const isOpen = expanded === row.key;
                return (
                  <Fragment key={row.key}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpanded(isOpen ? null : row.key)}
                    >
                      <TableCell className="py-2">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: row.color }}
                          />
                          <span className="truncate text-sm font-medium">{row.name}</span>
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-sm">
                        {formatIstDateTime(row.trip.startTime)}
                      </TableCell>
                      <TableCell className="py-2 text-right text-sm">
                        {formatDuration(row.trip.duration)}
                      </TableCell>
                      <TableCell className="py-2 text-right text-sm font-semibold">
                        {formatKm(row.trip.distance)}
                      </TableCell>
                      <TableCell className="py-2 text-right text-sm">
                        {formatSpeed(row.trip.maxSpeed)}
                      </TableCell>
                      <TableCell className="py-2 text-right text-sm">
                        {row.rate > 0 ? formatCurrency(row.cost) : '—'}
                      </TableCell>
                    </TableRow>

                    {isOpen && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={7} className="py-3">
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <Endpoint
                              label="From"
                              time={formatIstTime(row.trip.startTime, true)}
                              address={row.trip.startAddress}
                              latitude={row.trip.startLat}
                              longitude={row.trip.startLon}
                            />
                            <Endpoint
                              label="To"
                              time={formatIstTime(row.trip.endTime, true)}
                              address={row.trip.endAddress}
                              latitude={row.trip.endLat}
                              longitude={row.trip.endLon}
                            />
                          </div>

                          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
                            <span>Avg speed {formatSpeed(row.trip.averageSpeed)}</span>
                            <span>
                              Odometer {formatKm(row.trip.startOdometer, 0)} →{' '}
                              {formatKm(row.trip.endOdometer, 0)}
                            </span>
                            {row.rate > 0 && <span>Rate ₹{row.rate}/km</span>}
                            {row.trip.driverName && <span>Driver {row.trip.driverName}</span>}
                            {row.trip.spentFuel > 0 && (
                              <span>Fuel {row.trip.spentFuel.toFixed(2)} L</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function SortableHead({
  label,
  active,
  descending,
  onClick,
  align = 'left',
}: {
  label: string;
  active: boolean;
  descending: boolean;
  onClick: () => void;
  align?: 'left' | 'right';
}) {
  return (
    <TableHead className={align === 'right' ? 'text-right' : undefined}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 text-xs font-medium transition-colors hover:text-foreground ${
          active ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        {label}
        {active &&
          (descending ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </TableHead>
  );
}

function Endpoint({
  label,
  time,
  address,
  latitude,
  longitude,
}: {
  label: string;
  time: string;
  address: string | null;
  latitude: number;
  longitude: number;
}) {
  const point = { latitude, longitude };
  const onSite = isAtOffice(point);

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label} · {time}
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm">
        {onSite && <Building2 className="h-3.5 w-3.5 shrink-0 text-blue-600" />}
        <span>{locationLabel(point, address)}</span>
        {!onSite && (
          <span className="text-[10px] text-muted-foreground">{shortFromOffice(point)} out</span>
        )}
      </p>
      <a
        href={mapsLink(latitude, longitude)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
      >
        {latitude.toFixed(5)}, {longitude.toFixed(5)}
        <ExternalLink className="h-2.5 w-2.5" />
      </a>
    </div>
  );
}
