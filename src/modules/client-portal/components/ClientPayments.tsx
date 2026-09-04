'use client';

import { useMemo } from 'react';
import { useClientProfile, useClientInvoices } from '../hooks/useClientData';
import { CreditCard, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ClientPayments() {
  const { data: profile } = useClientProfile();
  const { data: invoices, isLoading } = useClientInvoices(profile?.client_name);

  // Unpaid = anything not yet paid or cancelled (created / issued / open / overdue).
  const pendingInvoices = useMemo(
    () => (invoices || []).filter((inv: any) => inv.status !== 'received' && inv.status !== 'cancelled'),
    [invoices]
  );

  const paidInvoices = useMemo(
    () => (invoices || []).filter((inv: any) => inv.status === 'received'),
    [invoices]
  );

  const totalDue = pendingInvoices.reduce((s: number, inv: any) => s + (inv.total_amount || 0), 0);
  const totalPaid = paidInvoices.reduce((s: number, inv: any) => s + (inv.total_amount || 0), 0);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-28 rounded-xl bg-gray-100" />
        <div className="h-64 rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Payment Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Due</p>
              <p className="text-2xl font-bold text-foreground dark:text-white">
                ₹{totalDue.toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-gray-400">{pendingInvoices.length} pending invoices</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Paid</p>
              <p className="text-2xl font-bold text-foreground dark:text-white">
                ₹{totalPaid.toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-gray-400">{paidInvoices.length} invoices cleared</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Payments */}
      {pendingInvoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <CreditCard className="h-12 w-12 mb-3 opacity-40" />
          <p className="font-medium">No pending payments</p>
          <p className="text-sm mt-1">All dues are cleared</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-foreground dark:text-white">Pending Payments</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Contact your account manager or use bank transfer to clear dues
            </p>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {pendingInvoices.map((inv: any) => {
              const isOverdue = inv.status === 'overdue' || (inv.due_date && new Date(inv.due_date) < new Date());
              return (
                <div key={inv.id} className="px-4 py-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground dark:text-white">
                        {inv.reference_number || 'INV'}
                      </p>
                      {isOverdue && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">
                          OVERDUE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{inv.description}</p>
                    {inv.due_date && (
                      <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                        Due: {new Date(inv.due_date).toLocaleDateString('en-IN')}
                      </p>
                    )}
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-base font-bold text-foreground dark:text-white">
                      ₹{(inv.total_amount || 0).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Total Outstanding
            </span>
            <span className="text-lg font-bold text-[#D71920]">
              ₹{totalDue.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      )}

      {/* Payment Instructions */}
      <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-4 border border-blue-200 dark:border-blue-800/30">
        <h4 className="font-medium text-blue-900 dark:text-blue-300 text-sm mb-2">
          Payment Information
        </h4>
        <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
          Please make payments via NEFT/RTGS to the account shared in your invoice.
          After transfer, please share the UTR number with your account manager for faster reconciliation.
        </p>
      </div>
    </div>
  );
}
