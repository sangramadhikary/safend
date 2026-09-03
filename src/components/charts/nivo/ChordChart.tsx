'use client';

import { ResponsiveChord } from '@nivo/chord';
import { nivoTheme, extendedColors } from './theme';

interface ChordChartProps {
  data: {
    matrix: number[][];
    keys: string[];
  };
  height?: number;
}

export function ChordChart({ data, height = 500 }: ChordChartProps) {
  return (
    <div style={{ height: `${height}px` }}>
      <ResponsiveChord
        data={data.matrix}
        keys={data.keys}
        theme={nivoTheme}
        margin={{ top: 60, right: 60, bottom: 90, left: 60 }}
        valueFormat=".2f"
        padAngle={0.02}
        innerRadiusRatio={0.96}
        innerRadiusOffset={0.02}
        arcOpacity={1}
        arcBorderWidth={1}
        arcBorderColor={{
          from: 'color',
          modifiers: [['darker', 0.4]],
        }}
        ribbonOpacity={0.5}
        ribbonBorderWidth={1}
        ribbonBorderColor={{
          from: 'color',
          modifiers: [['darker', 0.4]],
        }}
        enableLabel={true}
        label="id"
        labelOffset={12}
        labelRotation={-90}
        labelTextColor={{
          from: 'color',
          modifiers: [['darker', 1]],
        }}
        colors={extendedColors}
        isInteractive={true}
        animate={true}
        motionConfig="gentle"
        legends={[
          {
            anchor: 'bottom',
            direction: 'row',
            justify: false,
            translateX: 0,
            translateY: 70,
            itemWidth: 80,
            itemHeight: 14,
            itemsSpacing: 0,
            itemTextColor: 'hsl(var(--foreground))',
            itemDirection: 'left-to-right',
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
      />
    </div>
  );
}
