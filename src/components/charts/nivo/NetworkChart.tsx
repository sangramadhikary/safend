'use client';

import { ResponsiveNetwork } from '@nivo/network';
import { nivoTheme } from './theme';

interface NetworkChartProps {
  data: any;
  height?: number;
}

export function NetworkChart({ data, height = 500 }: NetworkChartProps) {
  return (
    <div style={{ height: `${height}px` }}>
      <ResponsiveNetwork
        data={data}
        theme={nivoTheme}
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        linkDistance={80}
        centeringStrength={0.3}
        repulsivity={6}
        nodeSize={24}
        activeNodeSize={36}
        nodeColor={(e: any) => e.color}
        nodeBorderWidth={1}
        nodeBorderColor={{
          from: 'color',
          modifiers: [['darker', 0.8]],
        }}
        linkThickness={2}
        linkBlendMode="multiply"
        motionConfig="gentle"
        animate={true}
      />
    </div>
  );
}
