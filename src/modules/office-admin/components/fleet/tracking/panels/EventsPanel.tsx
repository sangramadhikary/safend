'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Bell, Download } from 'lucide-react';
import { formatIstDate, formatIstTime } from '@/services/traccar/traccarFormat';
import { istDateOf } from '@/services/traccar/traccarTime';
import { useEventsReport } from '../useTrackingData';
import {
  deviceNameById,
  downloadCsv,
  eventLabel,
  eventTone,
  toCsv,
  type TrackingScope,
} from '../trackingUtils';
import { NoSelection, PanelEmpty, PanelError, PanelLoading } from './PanelState';

/**
 * Events view: the raw device event log grouped by IST day, with a filter over
 * the event types actually present in the range.
 */
export function EventsPanel({ scope }: { scope: TrackingScope }) {
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const eventsQuery = useEventsReport(scope.selectedIds, scope.range);

  const events = useMemo(
    () =>
      (eventsQuery.data ?? [])
        .slice()
        .sort((a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime()),
    [eventsQuery.data]
  );

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) {
      counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [events]);

  const filtered = useMemo(
    () => (typeFilter ? events.filter((event) => event.type === typeFilter) : events),
    [events, typeFilter]
  );

  /** Group into IST days so the timeline reads top-down by date. */
  const grouped = useMemo(() => {
    const byDay = new Map<string, typeof filtered>();
    for (const event of filtered) {
      const day = istDateOf(event.eventTime);
      const bucket = byDay.get(day);
      if (bucket) bucket.push(event);
      else byDay.set(day, [event]);
    }
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const exportCsv = () => {
    const csv = toCsv(filtered, [
      { header: 'Person / device', value: (event) => deviceNameById(scope, event.deviceId) },
      { header: 'Event', value: (event) => eventLabel(event.type) },
      { header: 'Raw type', value: (event) => event.type },
      { header: 'Time (IST)', value: (event) => `${istDateOf(event.eventTime)} ${formatIstTime(event.eventTime, true)}` },
      { header: 'Geofence id', value: (event) => event.geofenceId || '' },
    ]);
    downloadCsv(`events-${scope.range.startDate}-to-${scope.range.endDate}.csv`, csv);
  };

  if (scope.selectedIds.length === 0) return <NoSelection />;
  if (eventsQuery.isLoading) return <PanelLoading />;
  if (eventsQuery.isError) {
    return <PanelError error={eventsQuery.error} onRetry={() => eventsQuery.refetch()} />;
  }
  if (events.length === 0) {
    return (
      <PanelEmpty
        icon={Bell}
        title="No events in this range"
        hint="Traccar raises events for motion start/stop, geofence crossings and alarms. Configure geofences under Devices to get crossing alerts."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={typeFilter === null ? 'default' : 'outline'}
          className="h-7 px-2.5 text-xs"
          onClick={() => setTypeFilter(null)}
        >
          All ({events.length})
        </Button>
        {typeCounts.map(([type, count]) => (
          <Button
            key={type}
            size="sm"
            variant={typeFilter === type ? 'default' : 'outline'}
            className="h-7 px-2.5 text-xs"
            onClick={() => setTypeFilter(type)}
          >
            {eventLabel(type)} ({count})
          </Button>
        ))}

        <Button size="sm" variant="outline" className="ml-auto h-7" onClick={exportCsv}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="max-h-[560px] overflow-y-auto">
          <div className="p-3">
            {grouped.map(([day, dayEvents]) => (
              <div key={day} className="mb-4 last:mb-0">
                <div className="sticky top-0 z-10 -mx-3 mb-2 bg-white/95 px-3 py-1 backdrop-blur-sm">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {formatIstDate(`${day}T06:00:00.000+05:30`)} · {dayEvents.length} events
                  </span>
                </div>

                <ol className="relative space-y-1.5 border-l pl-4">
                  {dayEvents.map((event) => (
                    <li key={event.id} className="relative">
                      <span
                        className="absolute left-[-21px] top-2 h-2 w-2 rounded-full ring-2 ring-white"
                        style={{ backgroundColor: scope.colors[event.deviceId] ?? '#94A3B8' }}
                      />
                      <div className="flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {formatIstTime(event.eventTime, true)}
                        </span>
                        <Badge variant="outline" className={`h-5 text-[10px] ${eventTone(event.type)}`}>
                          {eventLabel(event.type)}
                        </Badge>
                        <span className="truncate text-sm">
                          {deviceNameById(scope, event.deviceId)}
                        </span>
                        {event.geofenceId > 0 && (
                          <span className="text-[11px] text-muted-foreground">
                            geofence #{event.geofenceId}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
