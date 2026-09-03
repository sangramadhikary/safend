'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Trophy, Medal, Award } from 'lucide-react';

interface RacingBarData {
  id: string;
  name: string;
  value: number;
  maxValue?: number;
  color?: string;
  department?: string;
}

interface RacingBarChartProps {
  data: RacingBarData[];
  className?: string;
  animated?: boolean;
  showPercentage?: boolean;
  direction?: 'horizontal' | 'vertical';
  maxBars?: number;
  title?: string;
  height?: number;
}

export function RacingBarChart({
  data,
  className,
  animated = true,
  showPercentage = true,
  direction = 'horizontal',
  maxBars = 8,
  title,
  height = 300
}: RacingBarChartProps) {
  const [animatedData, setAnimatedData] = useState<RacingBarData[]>([]);
  const [isRacing, setIsRacing] = useState(false);

  // Sort and limit data
  const sortedData = data
    .sort((a, b) => b.value - a.value)
    .slice(0, maxBars);

  const maxValue = Math.max(...sortedData.map(d => d.maxValue || d.value));

  useEffect(() => {
    if (animated) {
      setIsRacing(true);
      const timer = setTimeout(() => {
        setAnimatedData(sortedData);
        setIsRacing(false);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setAnimatedData(sortedData);
    }
  }, [data, animated]);

  const getColor = (index: number, customColor?: string) => {
    if (customColor) return customColor;
    
    const colors = [
      'hsl(var(--primary))',
      'hsl(var(--accent))',
      'hsl(var(--success))',
      'hsl(var(--warning))',
      'hsl(var(--destructive))',
      'hsl(220, 70%, 50%)',
      'hsl(280, 70%, 50%)',
      'hsl(320, 70%, 50%)'
    ];
    return colors[index % colors.length];
  };

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="h-4 w-4 text-yellow-500" />;
      case 1:
        return <Medal className="h-4 w-4 text-gray-400" />;
      case 2:
        return <Award className="h-4 w-4 text-orange-600" />;
      default:
        return <div className="h-4 w-4 rounded-full bg-muted flex items-center justify-center text-xs font-bold">{index + 1}</div>;
    }
  };

  const formatValue = (value: number, max?: number) => {
    if (showPercentage && max) {
      return `${Math.round((value / max) * 100)}%`;
    }
    return value.toLocaleString();
  };

  if (direction === 'vertical') {
    return (
      <div className={cn('space-y-4', className)} style={{ height }}>
        {title && (
          <h3 className="text-lg font-semibold text-center">{title}</h3>
        )}
        <div className="flex items-end justify-center space-x-2 h-full">
          <AnimatePresence>
            {animatedData.map((item, index) => {
              const barHeight = (item.value / maxValue) * (height - 80);
              return (
                <motion.div
                  key={item.id}
                  className="flex flex-col items-center space-y-2"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ delay: index * 0.1, duration: 0.5 }}
                >
                  <div className="text-xs text-center font-medium min-h-8 flex items-center">
                    {formatValue(item.value, item.maxValue)}
                  </div>
                  <motion.div
                    className="rounded-t-lg relative"
                    style={{
                      backgroundColor: getColor(index, item.color),
                      width: '40px'
                    }}
                    initial={{ height: 0 }}
                    animate={{ height: barHeight }}
                    transition={{ 
                      delay: index * 0.1 + 0.3, 
                      duration: 0.8, 
                      ease: 'easeOut' 
                    }}
                  />
                  <div className="text-xs text-center max-w-[60px]">
                    <div className="font-medium truncate">{item.name}</div>
                    {item.department && (
                      <div className="text-muted-foreground truncate">{item.department}</div>
                    )}
                  </div>
                  <div className="flex justify-center">
                    {getRankIcon(index)}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {title && (
        <h3 className="text-lg font-semibold">{title}</h3>
      )}
      <div className="space-y-3">
        <AnimatePresence>
          {animatedData.map((item, index) => {
            const percentage = (item.value / maxValue) * 100;
            return (
              <motion.div
                key={item.id}
                className="flex items-center space-x-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
              >
                <div className="flex items-center space-x-2 min-w-[120px]">
                  {getRankIcon(index)}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{item.name}</div>
                    {item.department && (
                      <div className="text-xs text-muted-foreground truncate">{item.department}</div>
                    )}
                  </div>
                </div>
                
                <div className="flex-1 flex items-center space-x-3">
                  <div className="flex-1 bg-muted rounded-full h-6 relative overflow-hidden">
                    <motion.div
                      className="h-full rounded-full flex items-center px-2 text-white text-xs font-medium"
                      style={{ backgroundColor: getColor(index, item.color) }}
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ 
                        delay: index * 0.1 + 0.3, 
                        duration: 0.8, 
                        ease: 'easeOut' 
                      }}
                    >
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: index * 0.1 + 0.8 }}
                        className="text-xs font-medium"
                      >
                        {formatValue(item.value, item.maxValue)}
                      </motion.span>
                    </motion.div>
                  </div>
                  
                  <div className="text-sm font-medium min-w-[60px] text-right">
                    {formatValue(item.value, item.maxValue)}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      
      {isRacing && (
        <motion.div
          className="text-center text-sm text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          Racing in progress...
        </motion.div>
      )}
    </div>
  );
}
