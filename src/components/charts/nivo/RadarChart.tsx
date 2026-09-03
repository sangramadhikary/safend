'use client';

import { ResponsiveRadar } from '@nivo/radar';
import { nivoTheme, extendedColors } from './theme';

interface RadarChartProps {
  data: any[];
  keys: string[];
  indexBy: string;
  height?: number;
}

export function RadarChart({ data, keys, indexBy, height = 500 }: RadarChartProps) {
  return (
    <div style={{ height: `${height}px` }}>
      <ResponsiveRadar
        data={data}
        keys={keys}
        indexBy={indexBy}
        theme={nivoTheme}
        valueFormat=">-.2f"
        margin={{ top: 70, right: 80, bottom: 40, left: 80 }}
        borderColor={{ from: 'color' }}
        gridLevels={5}
        gridShape="circular"
        gridLabelOffset={36}
        enableDots={true}
        dotSize={8}
        dotColor={{ theme: 'background' }}
        dotBorderWidth={2}
        dotBorderColor={{ from: 'color' }}
        enableDotLabel={false}
        colors={extendedColors}
        fillOpacity={0.25}
        blendMode="multiply"
        animate={true}
        motionConfig="gentle"
        isInteractive={true}
        legends={[
          {
            anchor: 'top-left',
            direction: 'column',
            translateX: -50,
            translateY: -40,
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
      />
    </div>
  );
}
