'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HandCoins, Wallet, Users, Loader2, Flag, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';
import { format } from 'date-fns';

const TYPE_LABEL: Record<string, string> = {
  LOAN: 'Loan Recovery',
  JOINING_DEPOSIT: 'Joining Deposit',
  MESS: 'Mess Charges',
  PENALTY: 'Penalty Deduction',
};

/**
 * Live Payroll Receivables — money employees owe the company. Sourced from:
 *  - employee_advances (outstanding loan/deposit balances)
 *  - payroll_deductions (amounts recovered per cycle: loan, deposit, mess, penalty)
 */
export function PayrollReceivablesSection() {
  const cycleMonth = format(new Date(), 'yyyy-MM');

  // Active advances = outstanding employee receivables
  const { data: advances = [], isLoading: l1 } = useQuery({
    queryKey: ['payroll-receivables-advances'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('employee_advances')
        .select('id, employee_name, employee_code, advance_type, total_recoverable, amount_recovered, balance_outstanding, is_flagged, status')
        .in('status', ['active', 'written_off']);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Recoveries this cycle (all deduction types)
  const { data: recoveries = [], isLoading: l2 } = useQuery({
    queryKey: ['payroll-receivables-recoveries', cycleMonth],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('payroll_deductions')
        .select('deduction_type, recovered_amount, cycle_month')
        .eq('cycle_month', cycleMonth);
      if (error) throw error;
      return data ?? [];
    },
  });

  const isLoading = l1 || l2;

  const stats = useMemo(() => {
    const active = advances.filter((a: any) => a.status === 'active');
    const outstanding = active.reduce((s: number, a: any) => s + (a.balance_outstanding || 0), 0);
    const recoveredToDate = advances.reduce((s: number, a: any) => s + (a.amount_recovered || 0), 0);
    const employees = new Set(active.map((a: any) => a.employee_code)).size;
    const flagged = active.filter((a: any) => a.is_flagged).length;
    const recoveredThisCycle = recoveries.reduce((s: number, r: any) => s + (r.recovered_amount || 0), 0);
    return { outstanding, recoveredToDate, employees, flagged, recoveredThisCycle };
  }, [advances, recoveries]);

  // Recovered-this-cycle grouped by type
  const byType = useMemo(() => {
    const m: Record<string, number> = {};
    recoveries.forEach((r: any) => {
      m[r.deduction_type] = (m[r.deduction_type] || 0) + (r.recovered_amount || 0);
    });
    return m;
  }, [recoveries]);

  const activeAdvances = advances.filter((a: any) => a.status === 'active' && (a.balance_outstanding || 0) > 0);

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex justify-between items-start">
            <div><p className="text-xs text-muted-foreground">Outstanding</p><p className="text-2xl font-bold text-amber-600">₹{stats.outstanding.toLocaleString()}</p></div>
            <Wallet className="h-5 w-5 text-amber-500" />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Owed by {stats.employees} employee{stats.employees !== 1 ? 's' : ''}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex justify-between items-start">
            <div><p className="text-xs text-muted-foreground">Recovered This Cycle</p><p className="text-2xl font-bold text-green-600">₹{stats.recoveredThisCycle.toLocaleString()}</p></div>
            <TrendingUp className="h-5 w-5 text-green-600" />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">{format(new Date(), 'MMMM yyyy')}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex justify-between items-start">
            <div><p className="text-xs text-muted-foreground">Recovered To Date</p><p className="text-2xl font-bold">₹{stats.recoveredToDate.toLocaleString()}</p></div>
            <HandCoins className="h-5 w-5 text-blue-600" />
          </div>
        </CardContent></Card>
        <Card className={stats.flagged > 0 ? 'border-red-300' : ''}><CardContent className="p-4">
          <div className="flex justify-between items-start">
            <div><p className="text-xs text-muted-foreground">Red-Flagged</p><p className="text-2xl font-bold text-red-600">{stats.flagged}</p></div>
            <Flag className="h-5 w-5 text-red-600" />
          </div>
        </CardContent></Card>
      </div>

      {/* Recovered this cycle by type */}
      {Object.keys(byType).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Recovered This Cycle by Type</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(byType).map(([type, amt]) => (
                <div key={type} className="rounded-lg bg-muted/50 p-3">
                  <p className="text-[11px] text-muted-foreground">{TYPE_LABEL[type] || type}</p>
                  <p className="text-base font-bold">₹{amt.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Outstanding employee receivables */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-[#D71920]" />
            Outstanding Employee Receivables
            {activeAdvances.length > 0 && <Badge variant="outline" className="ml-1">{activeAdvances.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeAdvances.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No outstanding employee receivables. Loans and joining deposits from HR appear here.</p>
          ) : (
            <div className="space-y-2">
              {activeAdvances.map((a: any) => {
                const pct = a.total_recoverable > 0
                  ? Math.round(((a.total_recoverable - a.balance_outstanding) / a.total_recoverable) * 100) : 0;
                return (
                  <div key={a.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{a.employee_name}</p>
                          <span className="text-xs text-muted-foreground">{a.employee_code}</span>
                          {a.is_flagged && <Badge className="bg-red-600 gap-1 text-[10px]"><Flag className="h-2.5 w-2.5" /> Flagged</Badge>}
                        </div>
                        <p className="text-[11px] text-muted-foreground">{TYPE_LABEL[a.advance_type] || a.advance_type}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-amber-600">₹{a.balance_outstanding.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground">of ₹{a.total_recoverable.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
