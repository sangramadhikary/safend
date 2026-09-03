'use client';

import React, { useState, useEffect } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';

interface RacingBarChartProps {
  data: any[];
  xAxisKey: string;
  barKey: string;
  colors: string[];
  height?: number | string;
  showGrid?: boolean;
  showLegend?: boolean;
  animationDuration?: number;
  autoPlay?: boolean;
  steps?: number;
  valueFormatter?: (value: number) => string;
}

export function RacingBarChart({
  data,
  xAxisKey,
  barKey,
  colors,
  height = 300,
  showGrid = true,
  showLegend = true,
  animationDuration = 1000,
  autoPlay = true,
  steps = 10,
  valueFormatter = (value: number) => value.toLocaleString()
}: RacingBarChartProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [chartData, setChartData] = useState<any[]>([]);

  // Calculate the maximum value for proper scaling
  const maxValue = Math.max(...data.flatMap(item => 
    Object.entries(item)
      .filter(([key]) => key !== xAxisKey)
      .map(([, value]) => Number(value))
  ));

  // Update chart data when step changes
  useEffect(() => {
    if (data && data.length > 0) {
      // Get the current data point or use the last one if we've reached the end
      const currentData = data[Math.min(currentStep, data.length - 1)];
      
      // Create a new array with all items up to the current step
      const newChartData = data.slice(0, currentStep + 1).map((item, index) => {
        // For the current step, use the full value
        if (index === currentStep) {
          return item;
        }
        // For previous steps, use their values as they were
        return item;
      });
      
      setChartData(newChartData);
    }
  }, [data, currentStep]);

  // Auto-advance steps if autoPlay is enabled
  useEffect(() => {
    if (!autoPlay || !data || data.length === 0) return;
    
    const timer = setInterval(() => {
      setCurrentStep((prev) => {
        const next = prev + 1;
        // Reset to beginning when we reach the end
        return next >= data.length ? 0 : next;
      });
    }, animationDuration);
    
    return () => clearInterval(timer);
  }, [autoPlay, data, animationDuration]);

  // If no data is provided, show a placeholder
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] bg-muted/20 rounded-md">
        <p className="text-muted-foreground">No data to display</p>
      </div>
    );
  }

  // Extract all keys except the xAxis key for the bars
  const dataKeys = Object.keys(data[0]).filter(key => key !== xAxisKey);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
      >
        {showGrid && <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />}
        <XAxis 
          type="number"
          domain={[0, maxValue * 1.1]} // Add 10% padding to the max value
          tickFormatter={valueFormatter}
        />
        <YAxis 
          type="category"
          dataKey={xAxisKey}
          width={120} 
          tick={{ fontSize: 12 }}
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
        
        {dataKeys.map((key, index) => (
          <Bar 
            key={key}
            dataKey={key}
            fill={colors[index % colors.length]}
            animationDuration={animationDuration}
            label={{ 
              position: 'right',
              formatter: (value: number) => valueFormatter(value),
              fontSize: 12
            }}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
