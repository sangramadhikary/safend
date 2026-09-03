'use client';

import { cn } from "@/lib/utils";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ChartCardProps {
  title: string;
  data: any[];
  dataKey: string;
  className?: string;
  gradientId?: string;
  animationDuration?: number;
  valueFormatter?: (value: string | number) => string;
}

export function ChartCard({ 
  title, 
  data, 
  dataKey, 
  className,
  gradientId = "colorGradient",
  animationDuration = 1000,
  valueFormatter
}: ChartCardProps) {
  return (
    <Card className={cn("glass-card hover-scale overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Badge variant="secondary" className="text-xs">
          {data.length} {data.length === 1 ? 'period' : 'periods'}
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FF2121" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#FF2121" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" />
              <YAxis />
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(0, 0, 0, 0.8)",
                  borderColor: "rgba(255, 255, 255, 0.1)",
                  borderRadius: "8px",
                  color: "#fff",
                }}
                formatter={(value) => {
                  if (valueFormatter) {
                    return [valueFormatter(value as number), "Revenue"];
                  }
                  return [value, "Revenue"];
                }}
              />
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke="#FF2121"
                fillOpacity={1}
                fill={`url(#${gradientId})`}
                animationDuration={animationDuration}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
