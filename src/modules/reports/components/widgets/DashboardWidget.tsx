'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Download, RefreshCw, Maximize2 } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { ClientOnly } from "@/components/ClientOnly";
import { useDashboardChartData } from "../../hooks/useDashboardChartData";

interface DashboardWidgetProps {
  title: string;
  description?: string;
  type: string;
}

// Standard chart colors
const COLORS = ['#D71920', '#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#06b6d4'];

const formatValue = (value: number) => {
  if (value >= 1000000) return `₹${(value / 100000).toFixed(0)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return value.toString();
};

export function DashboardWidget({ title, description, type }: DashboardWidgetProps) {
  // Real, branch-filtered data (RLS scopes results to the user's branch automatically)
  const { chartType, data, keys, isLoading } = useDashboardChartData(title);

  const renderChart = () => {
    if (isLoading) {
      return <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">Loading…</div>;
    }
    if (!data || data.length === 0) {
      return <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No data for this branch yet</div>;
    }
    switch (chartType) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={formatValue} />
              <Tooltip formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, undefined]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {keys.map((key, i) => (
                <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {keys.map((key, i) => (
                <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );
      case 'area':
        return (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={formatValue} />
              <Tooltip formatter={(v: number) => [v >= 1000 ? `₹${v.toLocaleString('en-IN')}` : v, undefined]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {keys.map((key, i) => (
                <Area key={key} type="monotone" dataKey={key} fill={COLORS[i % COLORS.length]} fillOpacity={0.15} stroke={COLORS[i % COLORS.length]} strokeWidth={2} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        );
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" outerRadius={85} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {data.map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [v.toLocaleString('en-IN'), undefined]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        );
      default:
        return <div className="p-6 text-center text-muted-foreground">Chart not available</div>;
    }
  };

  return (
    <Card>
      <CardHeader className="py-4 px-6 flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-medium">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Refresh</DropdownMenuItem>
            <DropdownMenuItem className="flex items-center gap-2"><Download className="h-4 w-4" /> Download</DropdownMenuItem>
            <DropdownMenuItem className="flex items-center gap-2"><Maximize2 className="h-4 w-4" /> Expand</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <ClientOnly>
          {renderChart()}
        </ClientOnly>
      </CardContent>
    </Card>
  );
}
