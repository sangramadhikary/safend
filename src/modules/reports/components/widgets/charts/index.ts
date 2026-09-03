'use client';

// Named exports to avoid Next.js Pages Router "export *" restriction
// NOTE: BarChart/LineChart/DonutChart were removed — they contained mock data.
// The dashboard now uses DashboardWidget with real, branch-filtered queries.
export { AreaChart } from './AreaChart';
export { RacingBarChart } from './RacingBarChart';
