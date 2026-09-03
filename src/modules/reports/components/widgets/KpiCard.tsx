'use client';

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";

interface KpiCardProps {
  title: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
  metric?: string;
  icon?: React.ReactNode;
  valuePrefix?: string;
  valueSuffix?: string;
  loading?: boolean;
  animateValue?: boolean;
  animationDuration?: number;
  tooltip?: string;
  className?: string;
  onClick?: () => void;
}

export function KpiCard({
  title,
  value,
  change,
  trend,
  metric,
  icon,
  valuePrefix = "",
  valueSuffix = "",
  loading = false,
  animateValue = true,
  animationDuration = 1000,
  tooltip,
  className = "",
  onClick
}: KpiCardProps) {
  const [animatedValue, setAnimatedValue] = useState(0);
  const isNumericValue = typeof value === 'number';
  const numericValue = isNumericValue ? value as number : 0;

  // Animation effect for numeric values
  useEffect(() => {
    if (!isNumericValue || !animateValue) return;

    // Reset animation if value is different
    setAnimatedValue(0);
    
    // Animate to target value
    const startTime = Date.now();
    const endTime = startTime + animationDuration;
    
    const updateValue = () => {
      const now = Date.now();
      const timeProgress = Math.min(1, (now - startTime) / animationDuration);
      
      // Easing function for smoother animation
      const progress = 1 - Math.pow(1 - timeProgress, 3);
      
      setAnimatedValue(Math.floor(progress * numericValue));
      
      if (now < endTime) {
        requestAnimationFrame(updateValue);
      } else {
        setAnimatedValue(numericValue);
      }
    };
    
    requestAnimationFrame(updateValue);
  }, [numericValue, isNumericValue, animateValue, animationDuration]);

  // Format the value for display
  const displayValue = isNumericValue && animateValue
    ? animatedValue.toLocaleString()
    : isNumericValue
      ? (value as number).toLocaleString()
      : value;

  return (
    <Card 
      className={`${className} ${onClick ? 'cursor-pointer hover:bg-accent/50 transition-colors' : ''}`}
      onClick={onClick}
      title={tooltip}
    >
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <div className="flex items-baseline">
              {valuePrefix && <span className="text-sm font-medium mr-0.5">{valuePrefix}</span>}
              <p className="text-2xl font-bold">
                {loading ? (
                  <BrandLoader size="sm" />
                ) : (
                  displayValue
                )}
              </p>
              {valueSuffix && <span className="text-sm font-medium ml-0.5">{valueSuffix}</span>}
            </div>
          </div>
          {icon && (
            <div className="rounded-md bg-secondary p-2">
              {icon}
            </div>
          )}
        </div>
        
        {(change !== undefined && trend) && (
          <div className="flex items-center mt-3">
            <div className={`flex items-center ${
              trend === 'up' ? 'text-green-600 dark:text-green-500' :
              trend === 'down' ? 'text-red-600 dark:text-red-500' :
              'text-gray-600 dark:text-gray-400'
            }`}>
              {trend === 'up' ? (
                <ArrowUpRight className="h-4 w-4 mr-1" />
              ) : trend === 'down' ? (
                <ArrowDownRight className="h-4 w-4 mr-1" />
              ) : null}
              <span className="font-medium">{Math.abs(change)}%</span>
            </div>
            {metric && <span className="text-xs text-muted-foreground ml-2">{metric}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
