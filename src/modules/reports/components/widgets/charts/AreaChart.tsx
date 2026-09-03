'use client';

import React from 'react';
import { 
  AreaChart as RechartsAreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';

interface AreaChartProps {
  data: any[];
  xAxisKey: string;
  areaKeys: {
    key: string;
    name: string;
    color: string;
    stackId?: string;
  }[];
  height?: number | string;
  showGrid?: boolean;
  showLegend?: boolean;
  fillOpacity?: number;
  valueFormatter?: (value: number) => string;
}

export function AreaChart({
  data,
  xAxisKey,
  areaKeys,
  height = 300,
  showGrid = true,
  showLegend = true,
  fillOpacity = 0.6,
  valueFormatter = (value: number) => value.toLocaleString()
}: AreaChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] bg-muted/20 rounded-md">
        <p className="text-muted-foreground">No data to display</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
        <XAxis 
          dataKey={xAxisKey}
          tick={{ fontSize: 12 }}
          tickLine={{ stroke: "#e5e7eb" }}
          axisLine={{ stroke: "#e5e7eb" }}
        />
        <YAxis 
          tick={{ fontSize: 12 }}
          tickLine={{ stroke: "#e5e7eb" }}
          axisLine={{ stroke: "#e5e7eb" }}
          tickFormatter={valueFormatter}
        />
        <Tooltip 
          formatter={(value: number) => [valueFormatter(value), '']}
          contentStyle={{
            backgroundColor: 'white',
            borderRadius: '6px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            border: '1px solid #e5e7eb',
            fontSize: '12px'
          }}
        />
        {showLegend && <Legend wrapperStyle={{ fontSize: '12px', marginTop: '10px' }} />}
        
        {areaKeys.map((areaKey, index) => (
          <Area
            key={areaKey.key}
            type="monotone"
            dataKey={areaKey.key}
            name={areaKey.name}
            stroke={areaKey.color}
            fill={areaKey.color}
            fillOpacity={fillOpacity}
            stackId={areaKey.stackId}
          />
        ))}
      </RechartsAreaChart>
    </ResponsiveContainer>
  );
}
