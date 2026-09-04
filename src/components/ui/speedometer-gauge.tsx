'use client';
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface SpeedometerGaugeProps {
  value: number; // 0-100
  size?: number;
  className?: string;
  showControls?: boolean;
  label?: string;
  animated?: boolean;
}

export function SpeedometerGauge({
  value,
  size = 200,
  className,
  showControls = true,
  label = 'Coverage',
  animated = true
}: SpeedometerGaugeProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [animatedValue, setAnimatedValue] = useState(0);

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        setCurrentTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  // Animate value changes
  useEffect(() => {
    if (animated) {
      const timer = setTimeout(() => {
        setAnimatedValue(value);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setAnimatedValue(value);
    }
  }, [value, animated]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStart = () => setIsRunning(true);
  const handlePause = () => setIsRunning(false);
  const handleReset = () => {
    setIsRunning(false);
    setCurrentTime(0);
  };

  // Calculate needle angle (-90 to 90 degrees)
  const needleAngle = (animatedValue / 100) * 180 - 90;
  
  // Color based on value
  const getColor = (val: number) => {
    if (val >= 80) return 'hsl(var(--success))';
    if (val >= 60) return 'hsl(var(--warning))';
    return 'hsl(var(--destructive))';
  };

  const radius = (size - 40) / 2;
  const strokeWidth = 8;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * Math.PI; // Half circle

  return (
    <div className={cn('flex flex-col items-center space-y-4', className)}>
      {/* Speedometer */}
      <div className="relative" style={{ width: size, height: size / 2 + 30 }}>
        <svg
          width={size}
          height={size / 2 + 30}
          className="transform"
        >
          {/* Background arc */}
          <path
            d={`M ${strokeWidth} ${size / 2} A ${normalizedRadius} ${normalizedRadius} 0 0 1 ${size - strokeWidth} ${size / 2}`}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          
          {/* Progress arc */}
          <motion.path
            d={`M ${strokeWidth} ${size / 2} A ${normalizedRadius} ${normalizedRadius} 0 0 1 ${size - strokeWidth} ${size / 2}`}
            fill="none"
            stroke={getColor(animatedValue)}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ 
              strokeDashoffset: circumference - (animatedValue / 100) * circumference 
            }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />

          {/* Center point */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r="6"
            fill="hsl(var(--foreground))"
          />

          {/* Needle */}
          <motion.line
            x1={size / 2}
            y1={size / 2}
            x2={size / 2}
            y2={strokeWidth + 10}
            stroke="hsl(var(--foreground))"
            strokeWidth="3"
            strokeLinecap="round"
            initial={{ rotate: -90 }}
            animate={{ rotate: needleAngle }}
            transition={{ duration: 1, ease: 'easeOut' }}
            style={{ 
              transformOrigin: `${size / 2}px ${size / 2}px`,
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
            }}
          />

          {/* Scale marks */}
          {[0, 25, 50, 75, 100].map((mark, index) => {
            const angle = (mark / 100) * 180 - 90;
            const x1 = size / 2 + (normalizedRadius - 15) * Math.cos((angle * Math.PI) / 180);
            const y1 = size / 2 + (normalizedRadius - 15) * Math.sin((angle * Math.PI) / 180);
            const x2 = size / 2 + (normalizedRadius - 5) * Math.cos((angle * Math.PI) / 180);
            const y2 = size / 2 + (normalizedRadius - 5) * Math.sin((angle * Math.PI) / 180);
            
            return (
              <g key={mark}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth="2"
                />
                <text
                  x={x1 - 8}
                  y={y1 + 5}
                  fill="hsl(var(--muted-foreground))"
                  fontSize="12"
                  textAnchor="middle"
                >
                  {mark}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Center display */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-center">
          <motion.div
            className="text-2xl font-bold"
            style={{ color: getColor(animatedValue) }}
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            {Math.round(animatedValue)}%
          </motion.div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </div>

      {/* Timer and Controls */}
      {showControls && (
        <div className="flex flex-col items-center space-y-3">
          <div className="text-lg font-mono bg-muted px-3 py-1 rounded">
            {formatTime(currentTime)}
          </div>
          <div className="flex space-x-2">
            <Button
              size="sm"
              variant={isRunning ? "outline" : "default"}
              onClick={isRunning ? handlePause : handleStart}
              className="flex items-center gap-1"
            >
              {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isRunning ? 'Pause' : 'Start'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              className="flex items-center gap-1"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
