'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipContentProps,
} from 'recharts';
import { ClientOnly } from '@/components/ClientOnly';

// Illustrative growth in active personnel deployed over recent years.
const DATA = [
  { year: '2018', personnel: 600 },
  { year: '2019', personnel: 950 },
  { year: '2020', personnel: 1300 },
  { year: '2021', personnel: 1700 },
  { year: '2022', personnel: 2050 },
  { year: '2023', personnel: 2400 },
  { year: '2024', personnel: 2700 },
];

function ChartTooltip({ active, payload, label }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-safend-slate-grey">{label}</p>
      <p className="text-sm font-heading font-bold text-[#D71920]">
        {payload[0].value?.toLocaleString()} personnel
      </p>
    </div>
  );
}

export function GrowthChart() {
  return (
    <ClientOnly>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={DATA}
            margin={{ top: 10, right: 12, left: -16, bottom: 0 }}
          >
            <defs>
              <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D71920" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#D71920" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#E5E7EB"
              vertical={false}
            />
            <XAxis
              dataKey="year"
              tick={{ fill: '#6B7280', fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: '#E5E7EB' }}
            />
            <YAxis
              tick={{ fill: '#6B7280', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#D71920', strokeOpacity: 0.2 }} />
            <Area
              type="monotone"
              dataKey="personnel"
              stroke="#D71920"
              strokeWidth={2.5}
              fill="url(#growthFill)"
              activeDot={{ r: 5, fill: '#D71920', stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ClientOnly>
  );
}
