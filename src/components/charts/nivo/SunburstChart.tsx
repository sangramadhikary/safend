'use client';

import { ResponsiveSunburst } from '@nivo/sunburst';
import { nivoTheme } from './theme';

interface SunburstChartProps {
  data: any;
  height?: number;
}

export function SunburstChart({ data, height = 500 }: SunburstChartProps) {
  return (
    <div style={{ height: `${height}px` }}>
      <ResponsiveSunburst
        data={data}
        theme={nivoTheme}
        margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
        id="name"
        value="loc"
        cornerRadius={2}
        borderWidth={1}
        borderColor={{ theme: 'background' }}
        colors={{ scheme: 'nivo' }}
        childColor={{
          from: 'color',
          modifiers: [['brighter', 0.1]],
        }}
        enableArcLabels={true}
        arcLabelsSkipAngle={10}
        arcLabelsTextColor={{
          from: 'color',
          modifiers: [['darker', 2]],
        }}
        animate={true}
        motionConfig="gentle"
        transitionMode="pushIn"
        tooltip={({ id, value, color }) => (
          <div className="bg-popover text-popover-foreground px-3 py-2 rounded-md border shadow-lg">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <strong>{id}</strong>
            </div>
            <div className="text-sm mt-1">Employees: {value}</div>
          </div>
        )}
      />
    </div>
  );
}
