'use client';

import { cn } from "@/lib/utils";
import { CountUp } from "./CountUp";

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  prefix?: string;
  suffix?: string;
  formatter?: (value: number) => string;
}

export function StatCard({
  title,
  value,
  icon,
  trend,
  className,
  prefix = "",
  suffix = "",
  formatter,
}: StatCardProps) {
  return (
    <div className={cn("glass-card p-6 hover-scale", className)}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="text-3xl font-bold mt-2">
            {formatter ? (
              formatter(value)
            ) : (
              <>
                {prefix}
                <CountUp to={value} duration={2} separator="," />
                {suffix}
              </>
            )}
          </div>
          {trend && (
            <div className="flex items-center mt-2">
              <span
                className={cn(
                  "text-xs font-medium",
                  trend.isPositive ? "text-green-500" : "text-safend-red"
                )}
              >
                {trend.isPositive ? "+" : "-"}{trend.value}%
              </span>
              <span className="text-xs text-muted-foreground ml-1">vs last month</span>
            </div>
          )}
        </div>
        <div className="p-3 bg-secondary rounded-lg">{icon}</div>
      </div>
    </div>
  );
}
