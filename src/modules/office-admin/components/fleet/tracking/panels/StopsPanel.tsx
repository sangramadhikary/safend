'use client';

import { useMemo, useState } from 'react';
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
import { ArrowDown, ArrowUp, Building2, Download, ExternalLink, TimerReset } from 'lucide-react';
import {
  formatDuration,
  formatIstDateTime,
  formatIstTime,
} from '@/services/traccar/traccarFormat';
import { isAtOffice, locationLabel, shortFromOffice } from '@/lib/officeLocation';
import { useStopsReport } from '../useTrackingData';
import {
  deviceNameById,
  downloadCsv,
  mapsLink,
  toCsv,
  type TrackingScope,
} from '../trackingUtils';
import { NoSelection, PanelEmpty, PanelError, PanelLoading } from './PanelState';

type SortKey = 'startTime' | 'duration' | 'device';

/** Dwell thresholds used to colour a stop. */
const LONG_STOP_MS = 30 * 60 * 1000;
const VERY_LONG_STOP_MS = 2 * 60 * 60 * 1000;

/**
 * Stops view: where a device sat still and for how long. Long dwells are called
 * out, since those are what a supervisor usually wants to ask about.
 */
export function StopsPanel({ scope }: { scope: TrackingScope }) {
  const [sortKey, setSortKey] = useState<SortKey>('duration');
  const [descending, setDescending] = useState(true);

  const stopsQuery = useStopsReport(scope.selectedIds, scope.range);

  const rows = useMemo(() => {
    const enriched = (stopsQuery.data ?? []).map((stop) => ({
      stop,
      key: `${stop.deviceId}-${stop.positionId}-${stop.startTime}`,
      name: deviceNameById(scope, stop.deviceId, stop.deviceName),
      color: scope.colors[stop.deviceId] ?? '#94A3B8',
      // Measured against the head office, so a halt on site reads as such
      // instead of showing whatever road the geocoder picked.
      atOffice: isAtOffice(stop),
      fromOffice: shortFromOffice(stop),
    }));

    const direction = descending ? -1 : 1;
    return enriched.sort((a, b) => {
      switch (sortKey) {
        case 'device':
          return a.name.localeCompare(b.name) * direction;
        case 'startTime':
          return (
            (new Date(a.stop.startTime).getTime() - new Date(b.stop.startTime).getTime()) * direction
          );
        case 'duration':
        default:
          return (a.stop.duration - b.stop.duration) * direction;
      }
    });
  }, [stopsQuery.data, scope, sortKey, descending]);

  const totals = useMemo(() => {
    const idle = rows.reduce((sum, row) => sum + row.stop.duration, 0);
    const long = rows.filter((row) => row.stop.duration >= LONG_STOP_MS).length;
    const longest = rows.reduce((peak, row) => Math.max(peak, row.stop.duration), 0);
    const officeStops = rows.filter((row) => row.atOffice);
    return {
      idle,
      long,
      longest,
      atOffice: officeStops.length,
      officeIdle: officeStops.reduce((sum, row) => sum + row.stop.duration, 0),
    };
  }, [rows]);

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
      { header: 'Arrived', value: (row) => formatIstDateTime(row.stop.startTime) },
      { header: 'Left', value: (row) => formatIstDateTime(row.stop.endTime) },
      { header: 'Duration', value: (row) => formatDuration(row.stop.duration) },
      { header: 'Minutes', value: (row) => Math.round(row.stop.duration / 60000) },
      { header: 'Address', value: (row) => locationLabel(row.stop, row.stop.address) },
      { header: 'At office', value: (row) => (row.atOffice ? 'Yes' : 'No') },
      { header: 'Distance from office', value: (row) => row.fromOffice },
      { header: 'Latitude', value: (row) => row.stop.latitude },
      { header: 'Longitude', value: (row) => row.stop.longitude },
    ]);
    downloadCsv(`stops-${scope.range.startDate}-to-${scope.range.endDate}.csv`, csv);
  };

  if (scope.selectedIds.length === 0) return <NoSelection />;
  if (stopsQuery.isLoading) return <PanelLoading />;
  if (stopsQuery.isError) {
    return <PanelError error={stopsQuery.error} onRetry={() => stopsQuery.refetch()} />;
  }
  if (rows.length === 0) {
    return (
      <PanelEmpty
        icon={TimerReset}
        title="No stops recorded"
        hint="Either the devices kept moving through this range, or they reported nothing at all."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{rows.length} stops</Badge>
          <span>
            <strong className="text-foreground">{formatDuration(totals.idle)}</strong> idle in total
          </span>
          <span>
            <strong className="text-foreground">{formatDuration(totals.longest)}</strong> longest
          </span>
          {totals.long > 0 && (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
              {totals.long} over 30 min
            </Badge>
          )}
          {totals.atOffice > 0 && (
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
              {totals.atOffice} at office · {formatDuration(totals.officeIdle)}
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
                <SortableHead
                  label="Person / device"
                  active={sortKey === 'device'}
                  descending={descending}
                  onClick={() => toggleSort('device')}
                />
                <SortableHead
                  label="Arrived"
                  active={sortKey === 'startTime'}
                  descending={descending}
                  onClick={() => toggleSort('startTime')}
                />
                <TableHead>Left</TableHead>
                <SortableHead
                  label="Stopped for"
                  active={sortKey === 'duration'}
                  descending={descending}
                  onClick={() => toggleSort('duration')}
                  align="right"
                />
                <TableHead>Location</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((row) => {
                const veryLong = row.stop.duration >= VERY_LONG_STOP_MS;
                const long = row.stop.duration >= LONG_STOP_MS;

                return (
                  <TableRow key={row.key}>
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
                      {formatIstDateTime(row.stop.startTime)}
                    </TableCell>
                    <TableCell className="py-2 text-sm">
                      {formatIstTime(row.stop.endTime)}
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <Badge
                        variant="outline"
                        className={
                          veryLong
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : long
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                        }
                      >
                        {formatDuration(row.stop.duration)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[320px] py-2">
                      <p className="flex items-center gap-1.5 truncate text-sm">
                        {row.atOffice && (
                          <Building2 className="h-3 w-3 shrink-0 text-blue-600" />
                        )}
                        <span className="truncate">
                          {locationLabel(row.stop, row.stop.address)}
                        </span>
                        {!row.atOffice && (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {row.fromOffice}
                          </span>
                        )}
                      </p>
                      <a
                        href={mapsLink(row.stop.latitude, row.stop.longitude)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                      >
                        {row.stop.latitude.toFixed(5)}, {row.stop.longitude.toFixed(5)}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </TableCell>
                  </TableRow>
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
