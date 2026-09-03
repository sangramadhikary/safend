'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDown, ArrowUp, ArrowLeftRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface SummaryData {
  totalInflow: number;
  totalOutflow: number;
  netCashFlow: number;
  averageInflow: number;
  averageOutflow: number;
  highestInflow: number;
  lowestOutflow: number;
}

const defaultSummary: SummaryData = {
  totalInflow: 0,
  totalOutflow: 0,
  netCashFlow: 0,
  averageInflow: 0,
  averageOutflow: 0,
  highestInflow: 0,
  lowestOutflow: 0,
};

const summarizeData = (data: any[]): SummaryData => {
  if (!data || !data.length) return defaultSummary;

  const totalInflow = data.reduce((sum, item) => (item.type === 'inflow' ? sum + item.amount : sum), 0);
  const totalOutflow = data.reduce((sum, item) => (item.type === 'outflow' ? sum + item.amount : sum), 0);
  const netCashFlow = totalInflow - totalOutflow;
  const averageInflow = Math.round((totalInflow / data.filter(item => item.type === 'inflow').length) * 100) / 100;
  const averageOutflow = Math.round((totalOutflow / data.filter(item => item.type === 'outflow').length) * 100) / 100;
  const highestInflow = Math.max(...data.filter(item => item.type === 'inflow').map(item => item.amount), 0);
  const lowestOutflow = Math.min(...data.filter(item => item.type === 'outflow').map(item => item.amount), 0);

  return {
    totalInflow,
    totalOutflow,
    netCashFlow,
    averageInflow,
    averageOutflow,
    highestInflow,
    lowestOutflow,
  };
};

export function SummaryStats({ data }: { data: any[] }) {
  const { totalInflow, totalOutflow, netCashFlow } = summarizeData(data);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Total Inflow</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{formatCurrency(totalInflow)}</div>
          <p className="text-xs text-muted-foreground">
            <ArrowUp className="h-4 w-4 mr-1 inline-block" />
            All income transactions
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Total Outflow</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{formatCurrency(totalOutflow)}</div>
          <p className="text-xs text-muted-foreground">
            <ArrowDown className="h-4 w-4 mr-1 inline-block" />
            All expense transactions
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Net Cash Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibond">{formatCurrency(netCashFlow)}</div>
          <p className="text-xs text-muted-foreground">
            <ArrowLeftRight className="h-4 w-4 mr-1 inline-block" />
            Inflow minus outflow
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
