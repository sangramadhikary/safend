'use client';
import { useState } from 'react';
import { useAccountsData } from '@/hooks/accounts/useAccountsData';
import { useAccountsContext } from '@/contexts/AccountsContext';
import { AccountsService, ReportData } from '@/services/accounts/AccountsService';
import { DateRangeSelector } from '@/components/accounts/DateRangeSelector';
import { ChartComponent } from '@/components/accounts/ChartComponent';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { formatIndianCurrency } from '@/utils/errorHandler';
import { ArrowUpRight, ArrowDownRight, DollarSign, BarChart3, PieChart } from 'lucide-react';

export interface FinancialsMISProps {
  filter: string;
}

export function FinancialsMIS({ filter }: FinancialsMISProps) {
  const { selectedBranch, dateRange, setDateRange } = useAccountsContext();
  const [activeTab, setActiveTab] = useState('income');
  const [groupBy, setGroupBy] = useState('month');
  
  const startDate = dateRange?.startDate.toISOString().split('T')[0];
  const endDate = dateRange?.endDate.toISOString().split('T')[0];
  
  // Fetch income report data
  const { 
    data: incomeReport, 
    isLoading: isLoadingIncome 
  } = useAccountsData(
    () => startDate && endDate 
      ? AccountsService.getIncomeReport({
          startDate,
          endDate,
          branchId: selectedBranch || undefined,
          groupBy
        })
      : Promise.resolve({ labels: [], datasets: [], summary: { total: 0, average: 0, growth: 0, ytd: 0 } }),
    [selectedBranch, startDate, endDate, groupBy, activeTab],
    { labels: [], datasets: [], summary: { total: 0, average: 0, growth: 0, ytd: 0 } },
    "Failed to load income report data"
  );
  
  // Fetch expense report data
  const {
    data: expenseReport,
    isLoading: isLoadingExpense
  } = useAccountsData(
    () => startDate && endDate && activeTab === 'expense'
      ? AccountsService.getExpenseReport({
          startDate,
          endDate,
          branchId: selectedBranch || undefined,
          groupBy
        })
      : Promise.resolve({ labels: [], datasets: [], summary: { total: 0, average: 0, growth: 0, ytd: 0 } }),
    [selectedBranch, startDate, endDate, groupBy, activeTab],
    { labels: [], datasets: [], summary: { total: 0, average: 0, growth: 0, ytd: 0 } },
    "Failed to load expense report data"
  );
  
  const handleDateRangeChange = (range: { startDate: Date; endDate: Date }) => {
    setDateRange(range);
  };
  
  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };
  
  const handleGroupingChange = (value: string) => {
    setGroupBy(value);
  };
  
  // Helper function to get arrow icon based on growth value
  const getGrowthIcon = (growth: number) => {
    return growth >= 0 
      ? <ArrowUpRight className="h-4 w-4 text-green-500" /> 
      : <ArrowDownRight className="h-4 w-4 text-red-500" />;
  };
  
  // Helper function to get color class based on growth value
  const getGrowthColorClass = (growth: number) => {
    return growth >= 0 ? 'text-green-500' : 'text-red-500';
  };

  // Summary cards for income tab
  const renderIncomeSummary = () => {
    const summary = incomeReport?.summary || { total: 0, average: 0, growth: 0, ytd: 0 };
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(summary.total)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              For selected period
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(summary.average)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Per {groupBy}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Growth</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              {getGrowthIcon(summary.growth)}
              <span className={`text-2xl font-bold ${getGrowthColorClass(summary.growth)}`}>
                {Math.abs(summary.growth)}%
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Compared to previous period
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Year to Date</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(summary.ytd)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Current financial year
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };
  
  // Summary cards for expense tab
  const renderExpenseSummary = () => {
    const summary = expenseReport?.summary || { total: 0, average: 0, growth: 0, ytd: 0 };
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(summary.total)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              For selected period
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(summary.average)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Per {groupBy}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Growth</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              {getGrowthIcon(summary.growth)}
              <span className={`text-2xl font-bold ${getGrowthColorClass(summary.growth)}`}>
                {Math.abs(summary.growth)}%
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Compared to previous period
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Year to Date</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatIndianCurrency(summary.ytd)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Current financial year
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const formatReportData = (data: ReportData | null): any => {
    if (!data) return null;
    
    return {
      labels: data.labels,
      datasets: data.datasets
    };
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Financials & MIS</h2>
          <p className="text-muted-foreground">
            Analyze financial performance and generate reports
          </p>
        </div>
        <DateRangeSelector onRangeChange={handleDateRangeChange} className="min-w-72" />
      </div>
      
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="income">Income</TabsTrigger>
          <TabsTrigger value="expense">Expenses</TabsTrigger>
        </TabsList>
        
        <TabsContent value="income" className="space-y-4">
          {renderIncomeSummary()}
          
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold">Income Trends</h3>
            <Select value={groupBy} onValueChange={handleGroupingChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select Grouping" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="quarter">Quarterly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <ChartComponent
            type="line"
            title="Income"
            description="Income trends over time"
            data={formatReportData(incomeReport) || {labels: [], datasets: []}}
            currency={true}
            height={300}
          />
        </TabsContent>
        
        <TabsContent value="expense" className="space-y-4">
          {renderExpenseSummary()}
          
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold">Expense Trends</h3>
            <Select value={groupBy} onValueChange={handleGroupingChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select Grouping" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="quarter">Quarterly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <ChartComponent
            type="line"
            title="Expenses"
            description="Expense trends over time"
            data={formatReportData(expenseReport) || {labels: [], datasets: []}}
            currency={true}
            height={300}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
