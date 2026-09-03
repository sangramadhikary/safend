'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  IndianRupee, TrendingUp, TrendingDown,
  FileText, Users, Loader2, ArrowRight, Banknote,
} from 'lucide-react';
import { CountUp } from '@/components/dashboard/CountUp';
import { useQuery } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';
import { applyBranchScope, getBranchScopeFilter } from '@/utils/branchScope';

export interface AccountsDashboardProps {
  filter: string;
}

export function AccountsDashboard({ filter }: AccountsDashboardProps) {
  const branchKey = getBranchScopeFilter();
  // --- Key Financial Metrics ---
  const { data: employeeCount = 0, isLoading: l1 } = useQuery({
    queryKey: ['accounts-dash', 'employee-count', branchKey],
    queryFn: async () => {
      let q = supabaseClient.from('employees').select('*', { count: 'exact', head: true }).ilike('status', 'active');
      q = applyBranchScope(q);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Pending financial penalties (penalty deductions not yet processed)
  const { data: pendingFinancialPenalties = 0, isLoading: l2 } = useQuery({
    queryKey: ['accounts-dash', 'financial-penalties', branchKey],
    queryFn: async () => {
      let q = supabaseClient.from('penalties').select('*', { count: 'exact', head: true }).eq('status', 'Financial Penalty Applied');
      q = applyBranchScope(q);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Salary/Payroll awaiting accounts approval
  const { data: pendingPayrollRuns = [], isLoading: l3 } = useQuery({
    queryKey: ['accounts-dash', 'pending-payroll', branchKey],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('payroll_runs')
        .select('id, from_date, to_date, total_employees, total_net, status, created_at')
        .eq('status', 'SENT_TO_ACCOUNTS')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Recent penalties with financial impact
  const { data: recentFinancialActions = [], isLoading: l4 } = useQuery({
    queryKey: ['accounts-dash', 'recent-financial-actions', branchKey],
    queryFn: async () => {
      let q = supabaseClient.from('penalties').select('id, staff_name, offense, status, financial_penalty_amount, created_at').in('status', ['Financial Penalty Applied', 'Terminated', 'Suspended']).order('created_at', { ascending: false }).limit(5);
      q = applyBranchScope(q);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Receivables summary
  const { data: receivablesStats, isLoading: l5 } = useQuery({
    queryKey: ['accounts-dash', 'receivables-stats', branchKey],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('receivables')
        .select('total_amount, status')
        .in('status', ['pending', 'partially_paid', 'overdue']);
      if (error) throw error;
      const totalOutstanding = (data ?? []).reduce((s, r) => s + (r.total_amount || 0), 0);
      const count = data?.length ?? 0;
      return { totalOutstanding, count };
    },
  });

  // Payables summary
  const { data: payablesStats, isLoading: l6 } = useQuery({
    queryKey: ['accounts-dash', 'payables-stats', branchKey],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('payables')
        .select('total_amount, status')
        .eq('status', 'pending');
      if (error) throw error;
      const totalPending = (data ?? []).reduce((s, r) => s + (r.total_amount || 0), 0);
      const count = data?.length ?? 0;
      return { totalPending, count };
    },
  });

  const totalPendingSalary = pendingPayrollRuns.reduce((s: number, r: any) => s + (r.total_net || 0), 0);

  const isLoading = l1 || l2 || l3 || l5 || l6;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Accounts Dashboard</h2>
        <p className="text-muted-foreground">Financial overview and pending actions</p>
      </div>

      {/* Row 1: Key Financial Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Receivables</p>
                <p className="text-2xl font-bold mt-1">
                  {isLoading ? '—' : <>₹<CountUp to={receivablesStats?.totalOutstanding ?? 0} duration={2} separator="," /></>}
                </p>
              </div>
              <div className="rounded-full p-2 bg-green-100 dark:bg-green-900/30">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{receivablesStats?.count ?? 0} outstanding invoices</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Payables</p>
                <p className="text-2xl font-bold mt-1 text-red-600">
                  {isLoading ? '—' : <>₹<CountUp to={payablesStats?.totalPending ?? 0} duration={2} separator="," /></>}
                </p>
              </div>
              <div className="rounded-full p-2 bg-red-100 dark:bg-red-900/30">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{payablesStats?.count ?? 0} pending payments</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Salary Pending</p>
                <p className="text-2xl font-bold mt-1">
                  {isLoading ? '—' : <>₹<CountUp to={totalPendingSalary} duration={2} separator="," /></>}
                </p>
              </div>
              <div className="rounded-full p-2 bg-blue-100 dark:bg-blue-900/30">
                <Banknote className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{pendingPayrollRuns.length} run{pendingPayrollRuns.length !== 1 ? 's' : ''} · {pendingPayrollRuns.reduce((s: number, r: any) => s + (r.total_employees || 0), 0)} employees</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Employees on Payroll</p>
                <p className="text-2xl font-bold mt-1">{isLoading ? '—' : <CountUp to={employeeCount} duration={2} separator="," />}</p>
              </div>
              <div className="rounded-full p-2 bg-purple-100 dark:bg-purple-900/30">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{pendingFinancialPenalties} penalty deduction{pendingFinancialPenalties !== 1 ? 's' : ''} pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Actionable Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Salary Approvals */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Banknote className="h-4 w-4 text-green-600" />
              Salary Payments Pending Approval
              {pendingPayrollRuns.length > 0 && (
                <Badge className="bg-green-600 ml-auto">{pendingPayrollRuns.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingPayrollRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No pending salary approvals</p>
            ) : (
              <div className="space-y-3">
                {pendingPayrollRuns.slice(0, 3).map((run: any) => (
                  <div key={run.id} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/10 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">
                        {run.from_date && run.to_date
                          ? `${new Date(run.from_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — ${new Date(run.to_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                          : 'Payroll Run'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {run.total_employees} employees · ₹{(run.total_net || 0).toLocaleString()} net payable
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
                {pendingPayrollRuns.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{pendingPayrollRuns.length - 3} more pending
                  </p>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  Go to Payables → Salary to approve
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* GST & Tax Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-purple-500" />
              Tax & Compliance Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 border rounded-lg">
                <div>
                  <p className="text-sm font-medium">GST Payable (Estimated)</p>
                  <p className="text-xs text-muted-foreground">Based on current month invoices</p>
                </div>
                <p className="font-semibold text-lg">₹0</p>
              </div>
              <div className="flex justify-between items-center p-3 border rounded-lg">
                <div>
                  <p className="text-sm font-medium">ITC Available (Estimated)</p>
                  <p className="text-xs text-muted-foreground">Input Tax Credit from purchases</p>
                </div>
                <p className="font-semibold text-lg text-green-600">₹0</p>
              </div>
              <div className="flex justify-between items-center p-3 border rounded-lg">
                <div>
                  <p className="text-sm font-medium">TDS to Deposit</p>
                  <p className="text-xs text-muted-foreground">Due by 7th of next month</p>
                </div>
                <p className="font-semibold text-lg">₹0</p>
              </div>
              <p className="text-xs text-muted-foreground italic">
                GST/TDS values will populate when invoice & billing module is active
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Monthly Cost Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <IndianRupee className="h-4 w-4 text-green-500" />
            Monthly Cost Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg">
              <p className="text-xs text-muted-foreground">Total Salary Expense</p>
              <p className="text-xl font-bold mt-1">₹0</p>
              <p className="text-xs text-muted-foreground">Payroll not yet processed</p>
            </div>
            <div className="text-center p-4 bg-amber-50 dark:bg-amber-900/10 rounded-lg">
              <p className="text-xs text-muted-foreground">Salary Pending Approval</p>
              <p className="text-xl font-bold mt-1">₹{totalPendingSalary.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{pendingPayrollRuns.length} run{pendingPayrollRuns.length !== 1 ? 's' : ''} pending</p>
            </div>
            <div className="text-center p-4 bg-red-50 dark:bg-red-900/10 rounded-lg">
              <p className="text-xs text-muted-foreground">Penalty Deductions</p>
              <p className="text-xl font-bold mt-1">{pendingFinancialPenalties}</p>
              <p className="text-xs text-muted-foreground">To be deducted</p>
            </div>
            <div className="text-center p-4 bg-green-50 dark:bg-green-900/10 rounded-lg">
              <p className="text-xs text-muted-foreground">Net Payable (Est.)</p>
              <p className="text-xl font-bold mt-1">—</p>
              <p className="text-xs text-muted-foreground">After payroll processing</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Row 4: Recent Financial Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Penalty Actions (Financial Impact)</CardTitle>
        </CardHeader>
        <CardContent>
          {l4 ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : recentFinancialActions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No financial penalty actions yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Offense</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="text-right">Deduction</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentFinancialActions.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.staff_name}</TableCell>
                    <TableCell>{item.offense}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{item.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium text-red-600">
                      {item.financial_penalty_amount ? `₹${item.financial_penalty_amount.toLocaleString()}` : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
