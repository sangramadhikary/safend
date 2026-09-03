'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Banknote, Loader2, CheckCircle2, Users } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { persistPayrollRecoveries } from '@/services/supabase/PayrollDeductionService';

/**
 * Salary approval queue for Accounts. Approving a payroll run marks it PAID, posts the
 * net salary as a payable, and persists all advance/loan/deposit recoveries — decrementing
 * each employee's outstanding balance. This is the "money actually disbursed" transition.
 */
export function SalaryApprovalsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['salary-approvals'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('payroll_runs')
        .select('id, from_date, to_date, total_employees, total_net, status, employee_details, created_at')
        .in('status', ['SENT_TO_ACCOUNTS', 'APPROVED'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const approveMut = useMutation({
    mutationFn: async (run: any) => {
      setProcessingId(run.id);
      const cycleMonth = (run.from_date || '').slice(0, 7); // YYYY-MM
      const employees = Array.isArray(run.employee_details) ? run.employee_details : [];

      // 1. Persist recoveries — decrement advance balances, write deduction audit rows
      await persistPayrollRecoveries(employees, run.id, cycleMonth);

      // 2. Post the net salary as a payable (Salary & Wages)
      await supabaseClient.from('payables').insert({
        category: 'Salary & Wages',
        description: `Salary payout — ${run.from_date} to ${run.to_date}`,
        vendor_name: null,
        amount: run.total_net,
        total_amount: run.total_net,
        status: 'paid',
        due_date: run.to_date,
      });

      // 3. Mark the run paid
      const { error } = await supabaseClient.from('payroll_runs').update({ status: 'PAID' }).eq('id', run.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['employee-advances'] });
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      queryClient.invalidateQueries({ queryKey: ['accounts-dash'] });
      toast({ title: 'Salary Approved & Paid', description: 'Recoveries applied and payable posted.' });
      setProcessingId(null);
    },
    onError: (e: any) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
      setProcessingId(null);
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Banknote className="h-4 w-4 text-green-600" />
          Salary Payments Pending Approval
          {runs.length > 0 && <Badge className="bg-green-600 ml-2">{runs.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No salary payments awaiting approval.</p>
        ) : (
          <div className="space-y-3">
            {runs.map((run: any) => (
              <div key={run.id} className="flex items-center justify-between gap-3 rounded-xl border p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-sm">
                    {run.from_date && run.to_date
                      ? `${new Date(run.from_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — ${new Date(run.to_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                      : 'Payroll Run'}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Users className="h-3 w-3" /> {run.total_employees} employees · ₹{(run.total_net || 0).toLocaleString()} net
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Recoveries (loan/deposit/mess) applied automatically on approval.</p>
                </div>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 shrink-0"
                  disabled={approveMut.isPending}
                  onClick={() => approveMut.mutate(run)}
                >
                  {processingId === run.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Approve & Pay</>}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
