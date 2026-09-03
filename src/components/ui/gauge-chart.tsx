'use client';
import React from 'react';
import { cn } from '@/lib/utils';

interface GaugeChartProps {
  value: number; // Percentage value (0-100)
  size?: number;
  strokeWidth?: number;
  className?: string;
  showLabels?: boolean;
  animated?: boolean;
}

export function GaugeChart({
  value,
  size = 200,
  strokeWidth = 12,
  className,
  showLabels = true,
  animated = true
}: GaugeChartProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius; // Half circle
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (value / 100) * circumference;
  
  // Calculate needle angle (180 degrees for semi-circle)
  const needleAngle = -90 + (value / 100) * 180;
  
  // Get color based on value ranges
  const getColor = (val: number) => {
    if (val <= 40) return 'hsl(var(--destructive))'; // Critical/Low - Red
    if (val <= 70) return 'hsl(var(--warning))'; // Moderate - Orange/Yellow
    return 'hsl(var(--success))'; // Good - Green
  };

  const getLabel = (val: number) => {
    if (val <= 40) return 'Critical';
    if (val <= 70) return 'Moderate';
    return 'Good';
  };

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="relative" style={{ width: size, height: size / 2 + 40 }}>
        <svg
          width={size}
          height={size / 2 + 20}
          className="transform"
          style={{ overflow: 'visible' }}
        >
          {/* Background arc */}
          <path
            d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          
          {/* Value arc */}
          <path
            d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
            fill="none"
            stroke={getColor(value)}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            className={animated ? 'transition-all duration-1000 ease-out' : ''}
            transform={`rotate(180 ${size / 2} ${size / 2})`}
          />
          
          {/* Needle */}
          <g
            transform={`translate(${size / 2}, ${size / 2})`}
            className={animated ? 'transition-transform duration-1000 ease-out' : ''}
            style={{ transform: `translate(${size / 2}px, ${size / 2}px) rotate(${needleAngle}deg)` }}
          >
            <line
              x1="0"
              y1="0"
              x2={radius - strokeWidth}
              y2="0"
              stroke="hsl(var(--foreground))"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle
              cx="0"
              cy="0"
              r="4"
              fill="hsl(var(--foreground))"
            />
          </g>
          
          {/* Range labels */}
          {showLabels && (
            <>
              <text
                x={20}
                y={size / 2 + 15}
                className="text-xs fill-muted-foreground"
                textAnchor="start"
              >
                0%
              </text>
              <text
                x={size / 2}
                y={25}
                className="text-xs fill-muted-foreground"
                textAnchor="middle"
              >
                50%
              </text>
              <text
                x={size - 20}
                y={size / 2 + 15}
                className="text-xs fill-muted-foreground"
                textAnchor="end"
              >
                100%
              </text>
            </>
          )}
        </svg>
        
        {/* Center value display */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-center">
          <div className="text-2xl font-bold text-foreground">
            {Math.round(value)}%
          </div>
          <div className="text-sm text-muted-foreground">
            {getLabel(value)}
          </div>
        </div>
      </div>
      
      {/* Legend */}
      {showLabels && (
        <div className="flex justify-between w-full max-w-xs mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-destructive"></div>
            Critical
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-warning"></div>
            Moderate
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-success"></div>
            Good
          </span>
        </div>
      )}
    </div>
  );
}
