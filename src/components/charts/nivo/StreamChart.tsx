'use client';

import { ResponsiveStream } from '@nivo/stream';
import { nivoTheme, departmentColors } from './theme';

interface StreamChartProps {
  data: any[];
  keys: string[];
  height?: number;
}

export function StreamChart({ data, keys, height = 400 }: StreamChartProps) {
  // Guard: nivo ResponsiveStream requires a non-empty array
  if (!Array.isArray(data) || data.length === 0 || !Array.isArray(keys) || keys.length === 0) {
    return (
      <div style={{ height: `${height}px` }} className="flex items-center justify-center text-muted-foreground text-sm">
        No data available
      </div>
    );
  }

  // Sanitize: strip any keys from data objects that aren't in the keys array,
  // and ensure every key has a numeric value — nivo/stream crashes otherwise
  const safeData = data.map((row) => {
    const clean: Record<string, number> = {};
    for (const k of keys) {
      const val = Number(row[k]);
      clean[k] = isFinite(val) ? val : 0;
    }
    return clean;
  });

  return (
    <div style={{ height: `${height}px` }}>
      <ResponsiveStream
        data={safeData}
        keys={keys}
        theme={nivoTheme}
        margin={{ top: 50, right: 110, bottom: 50, left: 60 }}
        axisTop={null}
        axisRight={null}
        axisBottom={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: 'Month',
          legendOffset: 36,
        }}
        axisLeft={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: 'Budget (₹)',
          legendOffset: -50,
          format: (value) => `${(value / 100000).toFixed(0)}L`,
        }}
        offsetType="silhouette"
        colors={(d) => departmentColors[d.id] || '#dc2626'}
        fillOpacity={0.85}
        borderColor={{ theme: 'background' }}
        enableGridX={true}
        enableGridY={true}
        curve="catmullRom"
        animate={true}
        motionConfig="gentle"
        legends={[
          {
            anchor: 'bottom-right',
            direction: 'column',
            translateX: 100,
            itemWidth: 80,
            itemHeight: 20,
            itemTextColor: 'hsl(var(--foreground))',
            symbolSize: 12,
            symbolShape: 'circle',
            effects: [
              {
                on: 'hover',
                style: {
                  itemTextColor: 'hsl(var(--primary))',
                },
              },
            ],
          },
        ]}
        tooltip={({ layer }: any) => (
          <div className="bg-popover text-popover-foreground px-3 py-2 rounded-md border shadow-lg">
            <strong>{layer.id}</strong>
            <div className="text-sm">
              Department Budget Flow
            </div>
          </div>
        )}
      />
    </div>
  );
}
