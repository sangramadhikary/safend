'use client';

import { ResponsiveTreeMap } from '@nivo/treemap';
import { nivoTheme } from './theme';

interface TreemapChartProps {
  data: any;
  height?: number;
}

export function TreemapChart({ data, height = 500 }: TreemapChartProps) {
  return (
    <div style={{ height: `${height}px` }}>
      <ResponsiveTreeMap
        data={data}
        theme={nivoTheme}
        identity="id"
        value="value"
        valueFormat=".02s"
        margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
        labelSkipSize={12}
        labelTextColor={{
          from: 'color',
          modifiers: [['darker', 1.2]],
        }}
        parentLabelPosition="left"
        parentLabelTextColor={{
          from: 'color',
          modifiers: [['darker', 2]],
        }}
        borderColor={{
          from: 'color',
          modifiers: [['darker', 0.1]],
        }}
        colors={{ scheme: 'nivo' }}
        animate={true}
        motionConfig="gentle"
        tooltip={({ node }) => (
          <div className="bg-popover text-popover-foreground px-3 py-2 rounded-md border shadow-lg">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: node.color }}
              />
              <strong>{node.id}</strong>
            </div>
            <div className="text-sm mt-1">
              Revenue: ₹{(node.value / 100000).toFixed(2)}L
            </div>
          </div>
        )}
      />
    </div>
  );
}
