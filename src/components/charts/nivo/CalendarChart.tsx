'use client';

import { ResponsiveCalendar } from '@nivo/calendar';
import { nivoTheme } from './theme';

interface CalendarChartProps {
  data: any[];
  from: string;
  to: string;
  height?: number;
}

export function CalendarChart({ data, from, to, height = 200 }: CalendarChartProps) {
  return (
    <div style={{ height: `${height}px` }}>
      <ResponsiveCalendar
        data={data}
        theme={nivoTheme}
        from={from}
        to={to}
        emptyColor="hsl(var(--muted))"
        colors={['#fee2e2', '#fca5a5', '#f87171', '#ef4444', '#dc2626']}
        margin={{ top: 40, right: 40, bottom: 40, left: 40 }}
        yearSpacing={40}
        monthBorderColor="hsl(var(--border))"
        dayBorderWidth={2}
        dayBorderColor="hsl(var(--background))"
        legends={[
          {
            anchor: 'bottom-right',
            direction: 'row',
            translateY: 36,
            itemCount: 4,
            itemWidth: 42,
            itemHeight: 36,
            itemsSpacing: 14,
            itemDirection: 'right-to-left',
          },
        ]}
        tooltip={({ day, value, color }) => (
          <div className="bg-popover text-popover-foreground px-3 py-2 rounded-md border shadow-lg">
            <strong>{day}</strong>
            <div className="text-sm mt-1">Attendance: {value}%</div>
          </div>
        )}
      />
    </div>
  );
}
