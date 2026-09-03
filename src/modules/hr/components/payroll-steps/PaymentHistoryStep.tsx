'use client';
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock } from "lucide-react";
import { supabaseClient } from "@/integrations/supabase/client";

interface PayrollRun {
  id: string;
  from_date: string;
  to_date: string;
  payroll_type: string;
  type_label: string;
  selection_label: string;
  total_employees: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  status: string;
  created_at: string;
}

export function PaymentHistoryStep() {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPayrollRuns();
  }, []);

  const fetchPayrollRuns = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseClient
        .from('payroll_runs')
        .select('id, from_date, to_date, payroll_type, type_label, selection_label, total_employees, total_gross, total_deductions, total_net, status, created_at')
        .in('status', ['APPROVED', 'PAID', 'COMPLETED'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRuns(data || []);
    } catch (err) {
      console.error('Error fetching payroll runs:', err);
      setRuns([]);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;
  const formatDate = (date: string) => new Date(date).toLocaleDateString('en-IN');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">{status}</Badge>;
      case 'PAID':
      case 'COMPLETED':
        return <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100">{status}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Payment History</CardTitle>
          <CardDescription>
            View past salary payments that have been approved and processed by Accounts.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="font-medium">No payment history yet</p>
              <p className="text-sm mt-1">Completed payments will appear here.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Employees</TableHead>
                  <TableHead className="text-right">Gross (₹)</TableHead>
                  <TableHead className="text-right">Deductions (₹)</TableHead>
                  <TableHead className="text-right">Net (₹)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">
                      {formatDate(run.from_date)} → {formatDate(run.to_date)}
                    </TableCell>
                    <TableCell>{run.type_label}</TableCell>
                    <TableCell className="text-center">{run.total_employees}</TableCell>
                    <TableCell className="text-right">{formatCurrency(run.total_gross)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(run.total_deductions)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(run.total_net)}</TableCell>
                    <TableCell>{getStatusBadge(run.status)}</TableCell>
                    <TableCell>{formatDate(run.created_at)}</TableCell>
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
