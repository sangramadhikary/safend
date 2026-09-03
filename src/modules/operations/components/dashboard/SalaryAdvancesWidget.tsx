'use client';

import { RacingBarChart } from "@/components/ui/racing-bar-chart";
import { Wallet } from "lucide-react";
import { format } from 'date-fns';

interface SalaryAdvance {
  id: string;
  employeeName: string;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'processed';
  txnDate: string;
}

interface SalaryAdvancesWidgetProps {
  data: SalaryAdvance[];
  config?: Record<string, any>;
}

export default function SalaryAdvancesWidget({ data, config }: SalaryAdvancesWidgetProps) {
  const defaultConfig = {
    showPending: true,
    showApproved: true,
    showProcessed: false,
    limit: 8,
  };

  // Combine default config with user customizations
  const widgetConfig = config ? { ...defaultConfig, ...config } : defaultConfig;

  // Filter and transform data for racing bar chart
  const filteredData = data
    .filter(item => {
      if (item.status === 'pending' && !widgetConfig.showPending) return false;
      if (item.status === 'approved' && !widgetConfig.showApproved) return false;
      if (item.status === 'processed' && !widgetConfig.showProcessed) return false;
      return true;
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, widgetConfig.limit);

  // Transform data for racing bar chart
  const maxAmount = Math.max(...filteredData.map(item => item.amount));
  const chartData = filteredData.map(item => ({
    id: item.id,
    name: item.employeeName,
    value: item.amount,
    maxValue: maxAmount,
    department: item.reason,
    color: item.status === 'pending' 
      ? 'hsl(var(--warning))' 
      : item.status === 'approved' 
        ? 'hsl(var(--success))' 
        : 'hsl(var(--primary))'
  }));

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (data.length === 0) {
    return (
      <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
        <Wallet className="h-12 w-12 mb-2 opacity-50" />
        <p className="text-sm">No salary advances found</p>
        <p className="text-xs mt-1">Advances will appear here when processed</p>
      </div>
    );
  }

  if (filteredData.length === 0) {
    return (
      <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
        <Wallet className="h-12 w-12 mb-2 opacity-50" />
        <p className="text-sm">No advances match your filters</p>
        <p className="text-xs mt-1">Adjust filter settings to see more results</p>
      </div>
    );
  }

  return (
    <div className="h-[300px] p-4">
      <RacingBarChart
        data={chartData}
        title="Salary Advances Marathon"
        animated={true}
        showPercentage={false}
        direction="horizontal"
        maxBars={widgetConfig.limit}
        height={260}
        className="h-full"
      />
    </div>
  );
}
