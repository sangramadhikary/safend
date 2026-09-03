'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Search, IndianRupee, Loader2, Info, Eye, Download, Pencil, MoreVertical, Printer, XCircle, Mail, CheckCircle2, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, FileDown, ChevronLeft, ChevronRight, Copy, Trash2, ShieldAlert, Upload, Undo2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';
import { applyBranchScope, getBranchScopeFilter } from '@/utils/branchScope';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/operations/usePermissions';
import { InvoiceGenerator, type InvoiceData } from './InvoiceGenerator';
import { RaiseInvoiceDialog } from './RaiseInvoiceDialog';
import { OneTimeInvoiceForm } from './OneTimeInvoiceForm';
import { InvoiceImportDialog } from './InvoiceImportDialog';
import { PayrollReceivablesSection } from './PayrollReceivablesSection';
import { recordDeletedInvoiceNumber } from '@/services/invoiceNumberService';
import { addNotification } from '@/services/supabase/NotificationService';
import { checkAndAssignOverdueCollections } from '@/services/collections/OverdueCollectionService';
import { isValidGSTIN } from '@/lib/security/lookups';
import { isEInvoiceRequired } from '@/lib/invoice/calculations';
import { resolveGstConfig, INDIAN_STATES, DEFAULT_PLACE_OF_SUPPLY, type GstType } from '@/lib/tax/gst';
import { auditActions, logAuditEvent, logChange } from '@/utils/auditLog';

interface ReceivablesProps {
  filter: string;
}

interface ReceivableEntry {
  id: string;
  category: string;
  description: string;
  client_name: string | null;
  amount: number;
  gst_amount: number | null;
  total_amount: number;
  due_date: string | null;
  status: 'pending' | 'received' | 'overdue' | 'cancelled';
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  line_items?: InvoiceLineItem[] | null;
  adjustment_type?: 'credit' | 'debit' | null;
  gst_treatment?: 'forward' | 'rcm' | 'exempt' | null;
  /** Proper DB column — replaces notes string-sniffing for GST type */
  gst_type?: GstType | null;
  /** Proper DB column — the Place of Supply selected at invoice creation */
  place_of_supply?: string | null;
  service_period_start?: string | null;
  service_period_end?: string | null;
  invoice_snapshot?: unknown | null;
  /** DB column for previous outstanding balance */
  previous_balance?: number | null;
}

interface InvoiceLineItem {
  service: string;
  post: string;
  sac?: string;
  personnel: number;
  /** Monthly rate (generated invoices) OR rate-per-duty (one-time invoices) */
  monthlyRate?: number;
  /** Rate per duty — saved by OneTimeInvoiceForm */
  woPrice?: number;
  days: number;
  duties: number;
  perDayRate?: number;
  gstRate: number;
  amount: number;
}

const RECEIVABLE_CATEGORIES = [
  'Invoices',
  'Invoice Adjustments',
  'Event Letters',
  'Payroll Receivables',
  'Taxes (ITC/TDS)',
  'Other Income',
] as const;

// Payroll receivable sub-types
const PAYROLL_RECEIVABLE_TYPES = ['Loan Recovery', 'Uniform Charges', 'Mess Charges', 'Penalty Deduction', 'EPF', 'ESIC', 'Insurance'];

// Categories without Add button (auto-generated / live views)
const NO_ADD_CATEGORIES = ['Payroll Receivables'];

export function ManageReceivables({ filter }: ReceivablesProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { userRoles } = usePermissions();
  const isAdmin = userRoles.includes('admin');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [raiseInvoiceOpen, setRaiseInvoiceOpen] = useState(false);
  const [importInvoiceOpen, setImportInvoiceOpen] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [invoiceViewOpen, setInvoiceViewOpen] = useState(false);
  const [invoiceEditOpen, setInvoiceEditOpen] = useState(false);
  const [selectedInvoiceEntry, setSelectedInvoiceEntry] = useState<ReceivableEntry | null>(null);
  const [amountDue, setAmountDue] = useState<number>(0);
  const [invoiceViewData, setInvoiceViewData] = useState<InvoiceData | null>(null);
  const [receiveAmountOpen, setReceiveAmountOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<ReceivableEntry | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  // New: Status filter, sorting, pagination, bulk selection
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'overdue' | 'received' | 'cancelled'>('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'this_month' | 'this_quarter' | 'this_year' | 'this_fy'>('all');
  const [sortField, setSortField] = useState<'due_date' | 'total_amount' | 'status' | 'created_at'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const PAGE_SIZE = 15;
  const [paymentForm, setPaymentForm] = useState({
    mode: 'Bank Transfer',          // Cash | Cheque | Bank Transfer
    receivedBy: '',                 // for Cash/Cheque
    thirdPartyName: '',             // for Authorized 3rd Person
    chequeNumber: '',               // for Cheque
    chequeDate: '',                 // for Cheque
    bankAccountId: '',              // for Bank Transfer
    transactionNumber: '',          // for Bank Transfer
    transactionDateTime: '',        // for Bank Transfer
    paymentType: 'full',            // full | partial
    amountReceived: '',
    balanceHandling: 'due_date',    // due_date | credit_note (for partial)
    balanceDueDate: '',
  });

  const { data: receivables = [], isLoading } = useQuery<ReceivableEntry[]>({
    queryKey: ['receivables', filter, getBranchScopeFilter()],
    queryFn: async () => {
      let query = supabaseClient
        .from('receivables')
        .select('*')
        .order('created_at', { ascending: false });

      if (filter && filter !== 'All Receivables') {
        query = query.eq('category', filter);
      }
      query = applyBranchScope(query);

      const { data, error } = await query;
      if (error) {
        console.warn('Receivables table query error, showing empty state');
        return [];
      }
      return (data ?? []) as ReceivableEntry[];
    },
  });

  // Bank accounts for Bank Transfer mode
  const { data: bankAccounts = [] } = useQuery<any[]>({
    queryKey: ['bank_accounts_for_receivables'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('bank_accounts')
        .select('id, account_name, bank_name, account_number')
        .eq('status', 'active');
      if (error) { console.warn('Bank accounts not available'); return []; }
      return data ?? [];
    },
  });

  // Fetch sales & operations staff for "Received By" dropdown
  const { data: staffUsers = [] } = useQuery<{ id: string; name: string; role: string }[]>({
    queryKey: ['staff_users_for_receivable_payment'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('users')
        .select('id, name, roles')
        .eq('status', 'active');
      if (error) return [];
      return (data ?? [])
        .filter((u: any) => {
          const roles: string[] = u.roles || [];
          return roles.some((r: string) => r === 'sales' || r === 'operations');
        })
        .map((u: any) => ({
          id: u.id,
          name: u.name || 'Unknown',
          role: (u.roles || []).find((r: string) => r === 'sales' || r === 'operations') || 'staff',
        }));
    },
  });

  // ─── OVERDUE CHECK: auto-detect overdue receivables and assign to sales ───
  const overdueCheckRan = useRef(false);
  useEffect(() => {
    if (overdueCheckRan.current || isLoading || receivables.length === 0) return;
    overdueCheckRan.current = true;

    checkAndAssignOverdueCollections().then((result) => {
      if (result.tasksCreated > 0) {
        toast({
          title: '⚠️ Overdue Invoices Detected',
          description: `${result.tasksCreated} overdue invoice(s) assigned to Sales for collection.`,
        });
        // Refresh receivables to show updated statuses
        queryClient.invalidateQueries({ queryKey: ['receivables'] });
      }
    }).catch(() => { /* silent — best effort */ });
  }, [isLoading, receivables.length]);

  const createReceivable = useMutation({
    mutationFn: async (entry: Omit<ReceivableEntry, 'id' | 'created_at' | 'status'>) => {
      const { data, error } = await supabaseClient
        .from('receivables')
        .insert({ ...entry, status: 'pending' })
        .select()
        .single();
      if (error) throw new Error(error.message);

      // Audited inside the mutation rather than in onSuccess so the newly created
      // row (with its server-assigned id) is in scope. Receivables have no service
      // module, so unlike HR and Sales this instrumentation has to live here.
      void auditActions.invoiceCreated(
        entry.reference_number || data.id,
        entry.client_name ?? undefined,
        entry.total_amount
      );

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      setShowAddForm(false);
      setFormData({});
      toast({ title: "Entry Added", description: "Receivable recorded successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const markAsReceived = useMutation({
    mutationFn: async (id: string) => {
      // The loaded list supplies the before-state, so no extra read is needed here.
      const entry = receivables.find(r => r.id === id);

      const { error } = await supabaseClient
        .from('receivables')
        .update({ status: 'received' })
        .eq('id', id);
      if (error) throw new Error(error.message);

      void logChange({
        action: 'accounts.invoice.update',
        target: entry?.reference_number || id,
        entityType: 'receivables',
        entityId: id,
        entityLabel: `${entry?.reference_number ?? id} — ${entry?.client_name ?? 'Unknown client'}`,
        before: { status: entry?.status ?? null },
        after: { status: 'received' },
        details: {
          clientName: entry?.client_name,
          totalAmount: entry?.total_amount,
          markedWithoutPaymentRecord: true,
        },
        logUnchanged: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      toast({ title: "Marked as Received" });
    },
  });

  const cancelInvoice = useMutation({
    mutationFn: async (id: string) => {
      // Get the invoice reference number before cancelling
      const entry = receivables.find(r => r.id === id);
      const { error } = await supabaseClient
        .from('receivables')
        .update({ status: 'cancelled' })
        .eq('id', id);
      if (error) throw new Error(error.message);

      // Record the invoice number as available for reuse
      if (entry?.reference_number) {
        try {
          await recordDeletedInvoiceNumber(entry.reference_number);
        } catch { /* non-critical */ }
      }

      // Cancelling voids an issued tax invoice and recycles its number, so the
      // amount and client are recorded explicitly — the row itself survives but
      // its commercial meaning is reversed.
      void logChange({
        action: 'accounts.invoice.cancel',
        target: entry?.reference_number || id,
        entityType: 'receivables',
        entityId: id,
        entityLabel: `${entry?.reference_number ?? id} — ${entry?.client_name ?? 'Unknown client'}`,
        before: { status: entry?.status ?? null },
        after: { status: 'cancelled' },
        details: {
          clientName: entry?.client_name,
          totalAmount: entry?.total_amount,
          gstAmount: entry?.gst_amount,
          invoiceNumberReleasedForReuse: entry?.reference_number ?? null,
        },
        logUnchanged: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      toast({ title: "Invoice Cancelled", description: "Invoice number will be available for reuse." });
    },
  });

  const undoLastPayment = useMutation({
    mutationFn: async (entry: ReceivableEntry) => {
      // Find the most recent payment for this invoice
      const { data: payments } = await supabaseClient
        .from('receivable_payments')
        .select('*')
        .eq('receivable_id', entry.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (payments && payments.length > 0) {
        const lastPayment = payments[0];
        
        // Delete it from receivable_payments
        await supabaseClient.from('receivable_payments').delete().eq('id', lastPayment.id);
        
        // If it was a bank transfer, attempt to delete the corresponding bank_transactions record using reference number
        if (lastPayment.transaction_number) {
          await supabaseClient.from('bank_transactions').delete().eq('reference_number', lastPayment.transaction_number);
        }
        
        // Calculate remaining payments to determine new status
        const { data: remainingPayments } = await supabaseClient
          .from('receivable_payments')
          .select('amount')
          .eq('receivable_id', entry.id);
          
        const totalPaidNow = remainingPayments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
        
        let newStatus = 'pending';
        if (totalPaidNow > 0) {
           newStatus = 'pending'; // Still partially pending
        } else {
           if (entry.due_date && new Date(entry.due_date) < new Date()) {
             newStatus = 'overdue';
           } else {
             newStatus = 'pending';
           }
        }
        
        // Update notes: strip the payment metadata portion but preserve original invoice metadata
        let updatedNotes = entry.notes || '';
        if (totalPaidNow === 0) {
           // Remove all PAYMENT: sections, restoring original invoice notes
           updatedNotes = updatedNotes.replace(/\s*\|\|\s*PAYMENT:.*$/s, '').trim();
           // Also handle legacy format where notes were fully overwritten with payment data
           if (/^Mode:/.test(updatedNotes)) {
             updatedNotes = '';
           }
        } else {
           updatedNotes = updatedNotes.replace(/Total Paid:\s*₹[\d,]+(?:\.\d+)?/, `Total Paid: ₹${totalPaidNow.toLocaleString('en-IN')}`);
        }

        const { error } = await supabaseClient
          .from('receivables')
          .update({ status: newStatus, notes: updatedNotes })
          .eq('id', entry.id);

        if (error) throw error;
      } else {
        // Fallback: If no payments exist in table but invoice is marked received (legacy)
        // Preserve original invoice metadata notes, only strip payment sections
        let restoredNotes = (entry.notes || '').replace(/\s*\|\|\s*PAYMENT:.*$/s, '').trim();
        if (/^Mode:/.test(restoredNotes)) restoredNotes = '';
        let newStatus = 'pending';
        if (entry.due_date && new Date(entry.due_date) < new Date()) newStatus = 'overdue';
        const { error } = await supabaseClient
          .from('receivables')
          .update({ status: newStatus, notes: restoredNotes })
          .eq('id', entry.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      toast({ title: "Payment Undone", description: "The last payment was successfully reversed.", variant: "default" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to undo payment", variant: "destructive" });
    }
  });

  // Delete invoice (admin only) — permanently removes and recycles the invoice number
  const deleteInvoice = useMutation({
    mutationFn: async (entry: ReceivableEntry) => {
      if (!isAdmin) {
        // The refusal is recorded, not just the success. An attempt by a non-admin
        // to hard-delete a tax invoice is precisely the event an audit trail exists
        // to surface, and logging only what succeeded would hide it entirely.
        void logAuditEvent({
          action: 'accounts.invoice.delete',
          target: entry.reference_number || entry.id,
          entityType: 'receivables',
          entityId: entry.id,
          outcome: 'denied',
          errorMessage: 'Only admins can delete invoices directly.',
          details: {
            clientName: entry.client_name,
            totalAmount: entry.total_amount,
            attemptedBy: 'non-admin user',
          },
        });
        throw new Error('Only admins can delete invoices directly.');
      }

      // Record the invoice number for reuse
      if (entry.reference_number) {
        await recordDeletedInvoiceNumber(entry.reference_number);
      }

      // Delete associated payments first
      try {
        await supabaseClient
          .from('receivable_payments')
          .delete()
          .eq('receivable_id', entry.id);
      } catch { /* may not have payments */ }

      // Delete the receivable
      const { error } = await supabaseClient
        .from('receivables')
        .delete()
        .eq('id', entry.id);
      if (error) throw new Error(error.message);

      // Remove any pending delete requests for this invoice
      try {
        await supabaseClient
          .from('invoice_delete_requests')
          .delete()
          .eq('receivable_id', entry.id);
      } catch { /* non-critical */ }

      // The whole entry is recorded because the row is now gone: this audit record
      // is the only remaining evidence of the invoice's existence, its value, and
      // the reason given for removing it.
      void auditActions.invoiceDeleted(entry.reference_number || entry.id, entry);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      setDeleteConfirmOpen(false);
      setEntryToDelete(null);
      setDeleteReason('');
      toast({ title: "Invoice Deleted", description: "Invoice permanently deleted. The invoice number is now available for reuse." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Request delete (non-admin) — creates a request and notifies admins
  const requestDeleteInvoice = useMutation({
    mutationFn: async ({ entry, reason }: { entry: ReceivableEntry; reason: string }) => {
      // Get current user info
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) throw new Error('Not authenticated.');

      // Get user name from auth metadata or email
      const userName = user.user_metadata?.name || user.email?.split('@')[0] || 'Unknown User';

      // Create delete request
      const { error } = await supabaseClient
        .from('invoice_delete_requests')
        .insert({
          receivable_id: entry.id,
          invoice_number: entry.reference_number || '',
          client_name: entry.client_name || '',
          amount: entry.total_amount,
          requested_by: user.id,
          requested_by_name: userName,
          reason: reason || 'No reason provided',
          status: 'pending',
        });
      if (error) throw new Error(error.message);

      // Notify all admin users
      const { data: adminRoles } = await supabaseClient
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (adminRoles && adminRoles.length > 0) {
        for (const adminRole of adminRoles) {
          await addNotification({
            userId: adminRole.user_id,
            title: 'Invoice Delete Request',
            message: `${userName} requested to delete Invoice #${entry.reference_number} (${entry.client_name || 'Unknown'}, ₹${entry.total_amount.toLocaleString('en-IN')}). Reason: ${reason || 'Not specified'}`,
            type: 'warning',
            relatedItemType: 'accounts',
            relatedItemId: entry.id,
          });
        }
      }

      void logAuditEvent({
        action: 'accounts.invoice.delete.request',
        target: entry.reference_number || entry.id,
        entityType: 'receivables',
        entityId: entry.id,
        entityLabel: `${entry.reference_number ?? entry.id} — ${entry.client_name ?? 'Unknown client'}`,
        details: {
          clientName: entry.client_name,
          totalAmount: entry.total_amount,
          reason: reason || 'No reason provided',
          requestedByName: userName,
        },
      });
    },
    onSuccess: () => {
      setDeleteConfirmOpen(false);
      setEntryToDelete(null);
      setDeleteReason('');
      toast({ title: "Delete Request Sent", description: "Your request has been sent to admin for approval." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const recordReceivedAmount = useMutation({
    mutationFn: async ({ entry, payment }: { entry: ReceivableEntry; payment: typeof paymentForm }) => {
      const amount = parseFloat(payment.amountReceived) || 0;
      const tds = parseFloat(payment.tdsDeducted) || 0;
      
      // Match openReceiveAmount: DB column is the source of truth, notes are a fallback.
      let previousDue = 0;
      if (entry.previous_balance && entry.previous_balance > 0) {
        previousDue = entry.previous_balance;
      } else {
        const prevDueMatch = (entry.notes || '').match(/Previous Due:\s*₹?([\d,]+(?:\.\d+)?)/);
        if (prevDueMatch) {
          previousDue = parseFloat(prevDueMatch[1].replace(/,/g, ''));
        }
      }
      const totalPayable = entry.total_amount + previousDue;
      
      // Determine already paid amount
      let alreadyPaid = 0;
      try {
        const { data: payments } = await supabaseClient
          .from('receivable_payments')
          .select('amount')
          .eq('receivable_id', entry.id);
        if (payments && payments.length > 0) {
          alreadyPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
        } else {
          const match = (entry.notes || '').match(/Total Paid:\s*₹([\d,]+(?:\.\d+)?)/) || 
                        (entry.notes || '').match(/Amount:\s*₹([\d,]+(?:\.\d+)?)/);
          alreadyPaid = match ? parseFloat(match[1].replace(/,/g, '')) || 0 : 0;
        }
      } catch {
        const match = (entry.notes || '').match(/Total Paid:\s*₹([\d,]+(?:\.\d+)?)/) || 
                      (entry.notes || '').match(/Amount:\s*₹([\d,]+(?:\.\d+)?)/);
        alreadyPaid = match ? parseFloat(match[1].replace(/,/g, '')) || 0 : 0;
      }
      
      const newTotalPaid = alreadyPaid + amount + tds;
      const balanceAmount = Math.max(0, totalPayable - newTotalPaid);
      const fullyPaid = balanceAmount <= 0.01 || payment.paymentType === 'full';

      // Build a notes string capturing all payment metadata for audit
      const displayReceivedBy = payment.receivedBy === '__third_party__'
        ? payment.thirdPartyName || 'Authorized 3rd Person'
        : payment.receivedBy;
      const paymentMeta: string[] = [`Mode: ${payment.mode}`];
      if (payment.mode === 'Cash') {
        paymentMeta.push(`Received By: ${displayReceivedBy}`);
      } else if (payment.mode === 'Cheque') {
        paymentMeta.push(`Received By: ${displayReceivedBy}`, `Cheque#: ${payment.chequeNumber}`, `Cheque Date: ${payment.chequeDate}`);
      } else if (payment.mode === 'Bank Transfer') {
        const acc = bankAccounts.find(b => b.id === payment.bankAccountId);
        paymentMeta.push(`Bank: ${acc?.account_name || ''} (${acc?.bank_name || ''})`, `Txn#: ${payment.transactionNumber}`, `Txn DateTime: ${payment.transactionDateTime}`);
      }
      paymentMeta.push(`Amount: ₹${amount.toLocaleString('en-IN')}`);
      if (tds > 0) paymentMeta.push(`TDS: ₹${tds.toLocaleString('en-IN')}`);
      if (!fullyPaid) {
        paymentMeta.push(`Balance: ₹${balanceAmount.toLocaleString('en-IN')}`,
          payment.balanceHandling === 'credit_note' ? `Balance → Credit Note` : `Balance Due: ${payment.balanceDueDate}`);
      }
      paymentMeta.push(`Total Paid: ₹${newTotalPaid.toLocaleString('en-IN')}`);
      const noteStr = paymentMeta.join(' | ');

      // Record payment in liability/receivable payment log if table exists
      try {
        const resolvedReceivedBy = payment.receivedBy === '__third_party__'
          ? payment.thirdPartyName || 'Authorized 3rd Person'
          : payment.receivedBy || null;

        await supabaseClient.from('receivable_payments').insert({
          receivable_id: entry.id,
          amount: amount + tds,
          mode: payment.mode,
          received_by: resolvedReceivedBy,
          cheque_number: payment.chequeNumber || null,
          cheque_date: payment.chequeDate || null,
          bank_account_id: payment.bankAccountId || null,
          transaction_number: payment.transactionNumber || null,
          transaction_datetime: payment.transactionDateTime || null,
          is_partial: !fullyPaid,
          balance_amount: balanceAmount,
          balance_handling: !fullyPaid ? payment.balanceHandling : null,
          balance_due_date: (!fullyPaid && payment.balanceHandling === 'due_date') ? payment.balanceDueDate : null,
          created_at: new Date().toISOString(),
        });
      } catch (e) { /* table may not exist yet — continue */ }

      // If bank transfer, also record as a bank credit transaction
      if (payment.mode === 'Bank Transfer' && payment.bankAccountId) {
        try {
          await supabaseClient.from('bank_transactions').insert({
            account_id: payment.bankAccountId,
            transaction_date: payment.transactionDateTime ? payment.transactionDateTime.split('T')[0] : new Date().toISOString().split('T')[0],
            type: 'credit',
            amount,
            category: 'client_receipt',
            description: `Receipt: ${entry.description} (${entry.client_name || ''})`,
            reference_number: payment.transactionNumber || null,
            payment_mode: 'neft',
            party_name: entry.client_name || null,
          });
        } catch (e) { /* continue */ }
      }

      // If cheque, auto-create entry in cheque_register for clearance tracking
      if (payment.mode === 'Cheque' && payment.chequeNumber) {
        try {
          const { getBranchScope } = await import('@/utils/branchScope');
          const scope = getBranchScope();
          await supabaseClient.from('cheque_register').insert({
            cheque_number: payment.chequeNumber,
            type: 'received',
            amount,
            issue_date: payment.chequeDate || new Date().toISOString().split('T')[0],
            party_name: entry.client_name || 'Unknown',
            purpose: `Receipt: ${entry.description}`,
            status: 'pending',
            branch_id: scope.id || null,
          });
        } catch (e) { /* cheque_register table may not exist — continue */ }
      }

      // If cash, auto-create entry in cash_register for petty cash tracking
      if (payment.mode === 'Cash') {
        try {
          const { getBranchScope } = await import('@/utils/branchScope');
          const scope = getBranchScope();
          const resolvedReceivedBy = payment.receivedBy === '__third_party__'
            ? payment.thirdPartyName || 'Authorized 3rd Person'
            : payment.receivedBy || null;
          await supabaseClient.from('cash_register').insert({
            transaction_date: new Date().toISOString().split('T')[0],
            type: 'cash_in',
            amount,
            category: 'client_receipt',
            description: `Receipt: ${entry.description} (${entry.client_name || ''})`,
            received_from: entry.client_name || 'Client',
            voucher_number: null,
            branch_id: scope.id || null,
          });
        } catch (e) { /* cash_register table may not exist — continue */ }
      }

      // If partial + credit note, create a credit note receivable for the balance
      if (!fullyPaid && payment.balanceHandling === 'credit_note' && balanceAmount > 0) {
        try {
          await supabaseClient.from('receivables').insert({
            category: 'Invoice Adjustments',
            adjustment_type: 'credit',
            description: `Credit Note for ${entry.description}`,
            client_name: entry.client_name,
            amount: -balanceAmount,
            gst_amount: 0,
            total_amount: -balanceAmount, // contra — reduces net receivables
            status: 'pending',
            notes: `Auto-generated credit note from partial payment of ${entry.description}`,
          });
        } catch (e) { /* continue */ }
      }

      // Update the original receivable
      // IMPORTANT: Preserve original invoice metadata notes (GSTIN, Address, TDS, Previous Due, etc.)
      // Payment metadata is appended with a separator so it can be cleanly stripped on undo.
      const originalNotes = (entry.notes || '').replace(/\s*\|\|\s*PAYMENT:.*$/s, '').trim();
      const fullNotes = originalNotes ? `${originalNotes} || PAYMENT: ${noteStr}` : `PAYMENT: ${noteStr}`;
      const updateData: any = {
        status: fullyPaid ? 'received' : 'pending',
        notes: fullNotes,
      };
      if (!fullyPaid && payment.balanceHandling === 'due_date' && payment.balanceDueDate) {
        updateData.due_date = payment.balanceDueDate;
      }
      const { error } = await supabaseClient.from('receivables').update(updateData).eq('id', entry.id);
      if (error) throw new Error(error.message);

      // Money movement, so the payment instrument is recorded in full: which bank
      // account, which cheque number, which transaction reference, and who took
      // custody of cash. `receivable_payments` may not exist in every environment
      // (the insert above is wrapped in a try), which makes the audit trail the
      // only guaranteed record of the receipt.
      void logChange({
        action: 'accounts.payment.receive',
        target: entry.reference_number || entry.id,
        entityType: 'receivables',
        entityId: entry.id,
        entityLabel: `${entry.reference_number ?? entry.id} — ${entry.client_name ?? 'Unknown client'}`,
        // Partial payments leave a balance outstanding and are the more common
        // source of later disputes, so they are escalated above a clean settlement.
        severity: fullyPaid ? 'notice' : 'critical',
        before: { status: entry.status, dueDate: entry.due_date, amountOutstanding: entry.total_amount },
        after: {
          status: updateData.status,
          dueDate: updateData.due_date ?? entry.due_date,
          amountOutstanding: balanceAmount,
        },
        details: {
          clientName: entry.client_name,
          invoiceTotal: entry.total_amount,
          amountReceived: amount,
          balanceAmount,
          fullyPaid,
          paymentMode: payment.mode,
          receivedBy: displayReceivedBy || null,
          chequeNumber: payment.chequeNumber || null,
          chequeDate: payment.chequeDate || null,
          bankAccount: payment.mode === 'Bank Transfer'
            ? bankAccounts.find(b => b.id === payment.bankAccountId)?.account_name ?? null
            : null,
          transactionNumber: payment.transactionNumber || null,
          transactionDateTime: payment.transactionDateTime || null,
          balanceHandling: fullyPaid ? null : payment.balanceHandling,
          creditNoteRaised: !fullyPaid && payment.balanceHandling === 'credit_note' && balanceAmount > 0,
        },
        logUnchanged: true,
      });

      return { fullyPaid, amount };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      toast({
        title: res.fullyPaid ? "Payment Received in Full" : "Partial Payment Recorded",
        description: `₹${res.amount.toLocaleString('en-IN')} recorded successfully`
      });
      setReceiveAmountOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to record payment", variant: "destructive" });
    },
  });

  const handleSendByMail = (entry: ReceivableEntry) => {
    const subject = encodeURIComponent(`Invoice ${entry.reference_number || entry.id.slice(0, 8)} - Safend Secure Solutions`);
    const body = encodeURIComponent(
      `Dear ${entry.client_name || 'Sir/Madam'},\n\n` +
      `Please find the invoice details below:\n\n` +
      `Invoice: ${entry.description}\n` +
      `Amount: ₹${entry.amount.toLocaleString('en-IN')}\n` +
      `GST: ₹${(entry.gst_amount || (entry.total_amount - entry.amount)).toLocaleString('en-IN')}\n` +
      `Total Amount: ₹${entry.total_amount.toLocaleString('en-IN')}\n` +
      `Due Date: ${entry.due_date ? new Date(entry.due_date).toLocaleDateString('en-IN') : 'N/A'}\n\n` +
      `Kindly arrange the payment at your earliest convenience.\n\n` +
      `Bank Details:\n` +
      `A/c No: 921020000544081\n` +
      `IFSC: UTIB0000091\n` +
      `A/c Name: Safend Secure Solutions Private Limited\n\n` +
      `Thank you,\n` +
      `Safend Secure Solutions Private Limited\n` +
      `accounts@safends.com | 9777023934`
    );
    // mailto: triggers the default mail client (Outlook on Windows)
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const openReceiveAmount = async (entry: ReceivableEntry) => {
    setSelectedInvoiceEntry(entry);
    
    let currentDue = entry.total_amount;
    let alreadyPaid = 0;
    
    // Fetch actual paid amount from receivable_payments
    try {
      const { data: payments } = await supabaseClient
        .from('receivable_payments')
        .select('amount')
        .eq('receivable_id', entry.id);
        
      if (payments && payments.length > 0) {
        alreadyPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        currentDue = Math.max(0, entry.total_amount - alreadyPaid);
      } else {
        const match = (entry.notes || '').match(/Total Paid:\s*₹([\d,]+(?:\.\d+)?)/) || 
                      (entry.notes || '').match(/Amount:\s*₹([\d,]+(?:\.\d+)?)/);
        alreadyPaid = match ? parseFloat(match[1].replace(/,/g, '')) || 0 : 0;
      }
    } catch {
      const match = (entry.notes || '').match(/Total Paid:\s*₹([\d,]+(?:\.\d+)?)/) || 
                    (entry.notes || '').match(/Amount:\s*₹([\d,]+(?:\.\d+)?)/);
      alreadyPaid = match ? parseFloat(match[1].replace(/,/g, '')) || 0 : 0;
    }

    let previousDue = 0;
    // Use DB column as primary source, fall back to notes
    if (entry.previous_balance && entry.previous_balance > 0) {
      previousDue = entry.previous_balance;
    } else {
      const prevDueMatch = (entry.notes || '').match(/Previous Due:\s*₹?([\d,]+(?:\.\d+)?)/);
      if (prevDueMatch) {
        previousDue = parseFloat(prevDueMatch[1].replace(/,/g, ''));
      }
    }
    // Extract TDS rate from invoice notes (e.g. "TDS: 2%"), or from snapshot
    const tdsRateMatch = (entry.notes || '').match(/TDS:\s*([\d.]+)%/);
    let tdsRate = tdsRateMatch ? parseFloat(tdsRateMatch[1]) : 0;
    if (tdsRate === 0 && entry.invoice_snapshot) {
      const snap = entry.invoice_snapshot as any;
      if (snap?.advice?.tdsRate) tdsRate = snap.advice.tdsRate;
    }
    // TDS is deducted on the taxable value (pre-GST base amount), not the total
    const taxableBase = entry.amount && entry.amount > 0 ? entry.amount : entry.total_amount;
    const tdsAmount = tdsRate > 0 ? Math.round(taxableBase * tdsRate / 100 * 100) / 100 : 0;

    // Net receivable (the actual cash to collect) = invoice total − TDS + previous
    // outstanding − amounts already paid. This mirrors the invoice Payment Advice
    // (buildPaymentAdvice) so "Total Due" here matches "Total Payable Now" there.
    const totalPayable = Math.max(0, entry.total_amount - tdsAmount + previousDue);
    currentDue = Math.max(0, totalPayable - alreadyPaid);

    setAmountDue(currentDue);
    setPaymentForm({
      mode: 'Bank Transfer',
      receivedBy: '',
      thirdPartyName: '',
      chequeNumber: '',
      chequeDate: '',
      bankAccountId: '',
      transactionNumber: '',
      transactionDateTime: new Date().toISOString().slice(0, 16),
      paymentType: currentDue >= Math.max(0, entry.total_amount - tdsAmount) ? 'full' : 'partial',
      amountReceived: String(currentDue),
      tdsDeducted: tdsAmount > 0 ? String(tdsAmount) : '',
      balanceHandling: 'due_date',
      balanceDueDate: '',
    });
    setReceiveAmountOpen(true);
  };

  const updateField = (key: string, value: string) => {
    setFormData(p => ({ ...p, [key]: value }));
  };

  // ─── FORM SUBMISSIONS ─────────────────────────────────────────────

  const handleInvoiceSubmit = () => {
    const { client_name, invoice_number, description, amount, gst_percent, due_date, client_gstin, place_of_supply } = formData;
    if (!client_name || !invoice_number || !amount) {
      toast({ title: "Validation Error", description: "Client, Invoice Number and Amount required.", variant: "destructive" });
      return;
    }
    // Validate client GSTIN format if provided (GST invoices to registered clients
    // must carry a valid recipient GSTIN — Rule 46(f) CGST Rules).
    const gstin = (client_gstin || '').trim().toUpperCase();
    if (gstin && !isValidGSTIN(gstin)) {
      toast({ title: "Invalid GSTIN", description: "Client GSTIN must be a valid 15-character GSTIN (e.g. 21ABDCS8727K1Z4).", variant: "destructive" });
      return;
    }
    // Safend is a body corporate → outward supplies are Forward Charge (or Exempt). RCM never applies here.
    const treatment = (formData.gst_treatment === 'exempt' ? 'exempt' : 'forward') as 'forward' | 'rcm' | 'exempt';
    const amt = parseFloat(amount);
    const gstPct = gst_percent ? parseFloat(gst_percent) : 0;
    const resolvedPos = (place_of_supply || DEFAULT_PLACE_OF_SUPPLY).trim();

    // ── GST engine: determine CGST+SGST vs IGST based on Place of Supply ──
    const { gstType } = resolveGstConfig(resolvedPos, treatment === 'exempt' ? 0 : gstPct);
    const gstAmt = treatment === 'forward' ? amt * (gstPct / 100) : 0;

    const noteBits: string[] = [];
    if (treatment === 'forward' && gst_percent) noteBits.push(`GST: ${gst_percent}%`);
    if (treatment === 'exempt') noteBits.push('Exempt / nil-rated supply');
    if (gstin) noteBits.push(`Client GSTIN: ${gstin}`);
    // e-Invoice IRN (mandatory for B2B once AATO > ₹5 Cr). Recorded when supplied.
    if (formData.irn && formData.irn.trim()) noteBits.push(`IRN: ${formData.irn.trim()}`);
    createReceivable.mutate({
      category: 'Invoices',
      gst_treatment: treatment,
      description: `${description || 'Service Invoice'} | Inv#: ${invoice_number}`,
      client_name,
      amount: amt,
      gst_amount: gstAmt || null,
      total_amount: amt + gstAmt,
      due_date: due_date || null,
      reference_number: invoice_number,
      // Persist as proper DB columns — no more notes string-sniffing
      place_of_supply: resolvedPos,
      gst_type: treatment === 'exempt' ? 'exempt' : gstType,
      notes: noteBits.join(' | ') || null,
    });
  };

  const handleAdjustmentSubmit = () => {
    const { adjustment_type, client_name, adj_number, reason, amount, gst_amount, date } = formData;
    const type = (adjustment_type === 'credit' ? 'credit' : 'debit') as 'credit' | 'debit';
    if (!client_name || !adj_number || !amount || !reason) {
      toast({ title: "Validation Error", description: "All required fields must be filled.", variant: "destructive" });
      return;
    }
    const amt = parseFloat(amount);
    const gst = gst_amount ? parseFloat(gst_amount) : null;
    const gross = amt + (gst || 0);
    // Credit note reduces the receivable (contra → negative); debit note increases it.
    // The GST component must carry the same sign so that GSTR-1 / GSTR-3B output tax
    // is reduced by credit notes and increased by debit notes.
    const signed = type === 'credit' ? -gross : gross;
    const signedGst = gst === null ? null : (type === 'credit' ? -gst : gst);
    const label = type === 'credit' ? 'Credit Note' : 'Debit Note';
    createReceivable.mutate({
      category: 'Invoice Adjustments',
      adjustment_type: type,
      description: `${label}: ${reason} | ${type === 'credit' ? 'CN' : 'DN'}#: ${adj_number}`,
      client_name,
      amount: type === 'credit' ? -amt : amt,
      gst_amount: signedGst,
      total_amount: signed,
      due_date: date || null,
      reference_number: adj_number,
      notes: `${label} | Reason: ${reason}`,
    });
  };

  const handleEventLetterSubmit = () => {
    const { client_name, event_name, event_date, guards_required, rate_per_guard, duration_hours } = formData;
    if (!client_name || !event_name || !event_date || !guards_required || !rate_per_guard) {
      toast({ title: "Validation Error", description: "All required fields must be filled.", variant: "destructive" });
      return;
    }
    const guards = parseInt(guards_required);
    const rate = parseFloat(rate_per_guard);
    const hours = duration_hours ? parseFloat(duration_hours) : 8;
    const total = guards * rate * hours;
    createReceivable.mutate({
      category: 'Event Letters',
      description: `Event: ${event_name} | ${guards} guards × ${hours}hrs`,
      client_name,
      amount: total,
      gst_amount: null,
      total_amount: total,
      due_date: event_date,
      reference_number: null,
      notes: `Event: ${event_name} | Date: ${event_date} | Guards: ${guards} | Rate: ₹${rate}/guard/hr | Duration: ${hours}hrs`,
    });
  };

  const handleTaxesSubmit = () => {
    const { tax_type, assessment_period, amount, expected_date, reference } = formData;
    if (!tax_type || !assessment_period || !amount) {
      toast({ title: "Validation Error", description: "Tax Type, Period and Amount required.", variant: "destructive" });
      return;
    }
    const amt = parseFloat(amount);
    createReceivable.mutate({
      category: 'Taxes (ITC/TDS)',
      description: `${tax_type} - ${assessment_period}`,
      client_name: null,
      amount: amt,
      gst_amount: null,
      total_amount: amt,
      due_date: expected_date || null,
      reference_number: reference || null,
      notes: `Type: ${tax_type} | Period: ${assessment_period}`,
    });
  };

  const handleOtherIncomeSubmit = () => {
    const { source, description, amount, date, reference } = formData;
    if (!source || !amount) {
      toast({ title: "Validation Error", description: "Source and Amount required.", variant: "destructive" });
      return;
    }
    const amt = parseFloat(amount);
    createReceivable.mutate({
      category: 'Other Income',
      description: description || source,
      client_name: source,
      amount: amt,
      gst_amount: null,
      total_amount: amt,
      due_date: date || null,
      reference_number: reference || null,
      notes: null,
    });
  };

  const handleGenericSubmit = () => {
    const { category, description, client_name, amount, gst_amount, due_date, reference_number } = formData;
    if (!category || !amount) {
      toast({ title: "Validation Error", description: "Category and Amount required.", variant: "destructive" });
      return;
    }
    const amt = parseFloat(amount);
    const gst = gst_amount ? parseFloat(gst_amount) : null;
    createReceivable.mutate({
      category,
      description: description || category,
      client_name: client_name || null,
      amount: amt,
      gst_amount: gst,
      total_amount: amt + (gst || 0),
      due_date: due_date || null,
      reference_number: reference_number || null,
      notes: null,
    });
  };

  const handleSubmit = () => {
    switch (filter) {
      case 'Invoices': return handleInvoiceSubmit();
      case 'Invoice Adjustments': return handleAdjustmentSubmit();
      case 'Event Letters': return handleEventLetterSubmit();
      case 'Taxes (ITC/TDS)': return handleTaxesSubmit();
      case 'Other Income': return handleOtherIncomeSubmit();
      default: return handleGenericSubmit();
    }
  };

  // ─── FORM RENDERERS ──────────────────────────────────────────────────

  const renderInvoiceForm = () => {
    const treatment = formData.gst_treatment || 'forward';
    const amt = formData.amount ? parseFloat(formData.amount) : 0;
    const gstPct = formData.gst_percent ? parseFloat(formData.gst_percent) : 0;
    // GST is added to the invoice total only for forward-charge supplies.
    const gstAmt = treatment === 'forward' ? amt * (gstPct / 100) : 0;
    const total = amt + gstAmt;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Client Name*</Label><Input value={formData.client_name || ''} onChange={(e) => updateField('client_name', e.target.value)} placeholder="Client/Company name" /></div>
          <div className="space-y-1"><Label>Invoice Number*</Label><Input value={formData.invoice_number || ''} onChange={(e) => updateField('invoice_number', e.target.value)} placeholder="INV-2026-001" /></div>
        </div>

        {/* GST treatment — Safend is a Private Limited Company (body corporate),
            so security-service supplies are ALWAYS Forward Charge. Per Notification
            13/2017-CT(Rate), RCM applies only when the supplier is NOT a body
            corporate — hence RCM is intentionally not offered on outward invoices. */}
        <div className="space-y-1">
          <Label>GST Treatment</Label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: 'forward', label: 'Forward Charge', hint: 'Company collects & remits GST' },
              { key: 'exempt', label: 'Exempt', hint: 'No GST (nil-rated / exempt supply)' },
            ] as const).map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => updateField('gst_treatment', t.key)}
                className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-all ${treatment === t.key ? 'border-[#D71920] bg-[#D71920]/5' : 'border-gray-200 dark:border-white/10'}`}
              >
                <span className="text-xs font-semibold">{t.label}</span>
                <span className="text-[10px] text-muted-foreground">{t.hint}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            As a Private Limited Company (body corporate), Safend charges GST under Forward Charge on all security services. Reverse Charge (RCM) does not apply to these outward supplies.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Client GSTIN</Label>
            <Input
              value={formData.client_gstin || ''}
              onChange={(e) => updateField('client_gstin', e.target.value.toUpperCase())}
              placeholder="21ABDCS8727K1Z4"
              maxLength={15}
              className={formData.client_gstin && !isValidGSTIN(formData.client_gstin) ? 'border-red-400 focus-visible:ring-red-400' : ''}
            />
            {formData.client_gstin && !isValidGSTIN(formData.client_gstin) && (
              <p className="text-[10px] text-red-500">Invalid GSTIN format (15 chars, e.g. 21ABDCS8727K1Z4)</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Place of Supply</Label>
            <Select value={formData.place_of_supply || DEFAULT_PLACE_OF_SUPPLY} onValueChange={(v) => updateField('place_of_supply', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {INDIAN_STATES.map(s => (
                  <SelectItem key={s.code} value={s.label}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(() => {
              const pos = formData.place_of_supply || DEFAULT_PLACE_OF_SUPPLY;
              const gstPct = parseFloat(formData.gst_percent || '0') || 0;
              const { gstType } = resolveGstConfig(pos, gstPct);
              return gstPct > 0 ? (
                <p className={`text-[10px] mt-1 font-medium ${gstType === 'igst' ? 'text-blue-600' : 'text-green-600'}`}>
                  {gstType === 'igst'
                    ? `Inter-State → IGST ${gstPct}%`
                    : `Intra-State (Odisha) → CGST ${gstPct / 2}% + SGST ${gstPct / 2}%`}
                </p>
              ) : null;
            })()}
          </div>
        </div>

        {/* e-Invoice IRN — required for B2B once AATO > ₹5 Cr */}
        {isEInvoiceRequired(formData.client_gstin) && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Label>IRN (e-Invoice Reference)</Label>
              <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">e-Invoice required (B2B)</Badge>
            </div>
            <Input
              value={formData.irn || ''}
              onChange={(e) => updateField('irn', e.target.value)}
              placeholder="64-char IRN from the IRP portal"
              maxLength={64}
            />
            <p className="text-[10px] text-muted-foreground">
              Generate the IRN + signed QR on the government IRP (or your GSP) and paste the IRN here. B2B invoices without an IRN are not valid tax invoices.
            </p>
          </div>
        )}

        <div className="space-y-1"><Label>Description</Label><Input value={formData.description || ''} onChange={(e) => updateField('description', e.target.value)} placeholder="Service description" /></div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1"><Label>{treatment === 'forward' ? 'Amount (₹)*' : 'Taxable Value (₹)*'}</Label><Input type="number" min="0" value={formData.amount || ''} onChange={(e) => updateField('amount', e.target.value)} /></div>
          <div className="space-y-1"><Label>GST (%){treatment !== 'forward' ? ' (info)' : ''}</Label><Input type="number" min="0" max="28" value={formData.gst_percent || ''} onChange={(e) => updateField('gst_percent', e.target.value)} placeholder="18" /></div>
          <div className="space-y-1"><Label>{treatment === 'forward' ? 'Total (₹)' : 'Invoice Total (₹)'}</Label><Input readOnly value={total ? total.toFixed(2) : ''} className="bg-muted" /></div>
        </div>
        <div className="space-y-1"><Label>Due Date</Label><Input type="date" value={formData.due_date || ''} onChange={(e) => updateField('due_date', e.target.value)} /></div>
      </div>
    );
  };

  const renderAdjustmentForm = () => {
    const type = formData.adjustment_type === 'credit' ? 'credit' : 'debit';
    return (
      <div className="space-y-4">
        {/* Credit vs Debit toggle */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => updateField('adjustment_type', 'debit')}
            className={`h-11 rounded-lg text-sm font-medium border transition-all ${type === 'debit' ? 'bg-red-500 text-white border-transparent' : 'border-gray-200 dark:border-white/10 text-muted-foreground'}`}
          >
            Debit Note <span className="text-[11px] font-normal">(client owes more +)</span>
          </button>
          <button
            type="button"
            onClick={() => updateField('adjustment_type', 'credit')}
            className={`h-11 rounded-lg text-sm font-medium border transition-all ${type === 'credit' ? 'bg-green-600 text-white border-transparent' : 'border-gray-200 dark:border-white/10 text-muted-foreground'}`}
          >
            Credit Note <span className="text-[11px] font-normal">(client owes less −)</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Client Name*</Label><Input value={formData.client_name || ''} onChange={(e) => updateField('client_name', e.target.value)} /></div>
          <div className="space-y-1"><Label>{type === 'credit' ? 'Credit' : 'Debit'} Note Number*</Label><Input value={formData.adj_number || ''} onChange={(e) => updateField('adj_number', e.target.value)} placeholder={type === 'credit' ? 'CN-001' : 'DN-001'} /></div>
        </div>
        <div className="space-y-1"><Label>Reason*</Label><Input value={formData.reason || ''} onChange={(e) => updateField('reason', e.target.value)} placeholder={type === 'credit' ? 'e.g. Service shortfall, overbilling correction' : 'e.g. Extra guards, overtime'} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Amount (₹)*</Label><Input type="number" min="0" value={formData.amount || ''} onChange={(e) => updateField('amount', e.target.value)} /></div>
          <div className="space-y-1"><Label>GST Amount (₹)</Label><Input type="number" min="0" value={formData.gst_amount || ''} onChange={(e) => updateField('gst_amount', e.target.value)} /></div>
        </div>
        <div className="space-y-1"><Label>Date</Label><Input type="date" value={formData.date || ''} onChange={(e) => updateField('date', e.target.value)} /></div>
        <p className="text-[11px] text-muted-foreground">
          {type === 'credit'
            ? 'A credit note reduces what the client owes (posted as a contra/negative entry).'
            : 'A debit note increases what the client owes.'}
          {' '}The credit/debit type is preserved for GST reporting.
        </p>
      </div>
    );
  };

  const renderEventLetterForm = () => {
    const guards = formData.guards_required ? parseInt(formData.guards_required) : 0;
    const rate = formData.rate_per_guard ? parseFloat(formData.rate_per_guard) : 0;
    const hours = formData.duration_hours ? parseFloat(formData.duration_hours) : 8;
    const total = guards * rate * hours;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Client Name*</Label><Input value={formData.client_name || ''} onChange={(e) => updateField('client_name', e.target.value)} /></div>
          <div className="space-y-1"><Label>Event Name*</Label><Input value={formData.event_name || ''} onChange={(e) => updateField('event_name', e.target.value)} placeholder="Event name" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1"><Label>Event Date*</Label><Input type="date" value={formData.event_date || ''} onChange={(e) => updateField('event_date', e.target.value)} /></div>
          <div className="space-y-1"><Label>Guards Required*</Label><Input type="number" min="1" value={formData.guards_required || ''} onChange={(e) => updateField('guards_required', e.target.value)} /></div>
          <div className="space-y-1"><Label>Duration (hrs)</Label><Input type="number" min="1" value={formData.duration_hours || ''} onChange={(e) => updateField('duration_hours', e.target.value)} placeholder="8" /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Rate per Guard/hr (₹)*</Label><Input type="number" min="0" value={formData.rate_per_guard || ''} onChange={(e) => updateField('rate_per_guard', e.target.value)} /></div>
          <div className="space-y-1"><Label>Estimated Total (₹)</Label><Input readOnly value={total ? total.toFixed(2) : ''} className="bg-muted" /></div>
        </div>
      </div>
    );
  };

  const renderTaxesForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1"><Label>Tax Type*</Label>
          <Select value={formData.tax_type || ''} onValueChange={(v) => updateField('tax_type', v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ITC (Input Tax Credit)">ITC (Input Tax Credit)</SelectItem>
              <SelectItem value="TDS Refund">TDS Refund</SelectItem>
              <SelectItem value="GST Refund">GST Refund</SelectItem>
              <SelectItem value="Income Tax Refund">Income Tax Refund</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label>Assessment Period*</Label><Input value={formData.assessment_period || ''} onChange={(e) => updateField('assessment_period', e.target.value)} placeholder="e.g. Q1 FY 2025-26" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1"><Label>Amount (₹)*</Label><Input type="number" min="0" value={formData.amount || ''} onChange={(e) => updateField('amount', e.target.value)} /></div>
        <div className="space-y-1"><Label>Expected Date</Label><Input type="date" value={formData.expected_date || ''} onChange={(e) => updateField('expected_date', e.target.value)} /></div>
      </div>
      <div className="space-y-1"><Label>Reference/Acknowledgment No.</Label><Input value={formData.reference || ''} onChange={(e) => updateField('reference', e.target.value)} /></div>
    </div>
  );

  const renderOtherIncomeForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1"><Label>Source*</Label><Input value={formData.source || ''} onChange={(e) => updateField('source', e.target.value)} placeholder="Income source" /></div>
        <div className="space-y-1"><Label>Amount (₹)*</Label><Input type="number" min="0" value={formData.amount || ''} onChange={(e) => updateField('amount', e.target.value)} /></div>
      </div>
      <div className="space-y-1"><Label>Description</Label><Input value={formData.description || ''} onChange={(e) => updateField('description', e.target.value)} placeholder="Details" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1"><Label>Date</Label><Input type="date" value={formData.date || ''} onChange={(e) => updateField('date', e.target.value)} /></div>
        <div className="space-y-1"><Label>Reference</Label><Input value={formData.reference || ''} onChange={(e) => updateField('reference', e.target.value)} /></div>
      </div>
    </div>
  );

  const renderGenericForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1"><Label>Category*</Label>
          <Select value={formData.category || ''} onValueChange={(v) => updateField('category', v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {RECEIVABLE_CATEGORIES.map(c => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label>Client/Source</Label><Input value={formData.client_name || ''} onChange={(e) => updateField('client_name', e.target.value)} /></div>
      </div>
      <div className="space-y-1"><Label>Description</Label><Input value={formData.description || ''} onChange={(e) => updateField('description', e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1"><Label>Amount (₹)*</Label><Input type="number" min="0" value={formData.amount || ''} onChange={(e) => updateField('amount', e.target.value)} /></div>
        <div className="space-y-1"><Label>GST Amount (₹)</Label><Input type="number" min="0" value={formData.gst_amount || ''} onChange={(e) => updateField('gst_amount', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1"><Label>Due Date</Label><Input type="date" value={formData.due_date || ''} onChange={(e) => updateField('due_date', e.target.value)} /></div>
        <div className="space-y-1"><Label>Reference</Label><Input value={formData.reference_number || ''} onChange={(e) => updateField('reference_number', e.target.value)} /></div>
      </div>
    </div>
  );

  const renderAddForm = () => {
    switch (filter) {
      case 'Invoices': return renderInvoiceForm();
      case 'Invoice Adjustments': return renderAdjustmentForm();
      case 'Event Letters': return renderEventLetterForm();
      case 'Taxes (ITC/TDS)': return renderTaxesForm();
      case 'Other Income': return renderOtherIncomeForm();
      default: return renderGenericForm();
    }
  };

  // ─── DISPLAY LOGIC ────────────────────────────────────────────────────

  const getAddButtonLabel = () => {
    switch (filter) {
      case 'Invoices': return 'Raise Invoice';
      case 'Invoice Adjustments': return 'New Adjustment';
      case 'Event Letters': return 'Create Event Letter';
      case 'Taxes (ITC/TDS)': return 'Record Tax Receivable';
      case 'Other Income': return 'Record Income';
      default: return 'New Entry';
    }
  };

  const getCategoryDescription = () => {
    switch (filter) {
      case 'Invoices': return 'Client invoices for security services provided';
      case 'Invoice Adjustments': return 'Credit & debit notes against client invoices — credit reduces, debit increases the amount due';
      case 'Event Letters': return 'Event security deployment letters and charges';
      case 'Payroll Receivables': return 'Recoveries from employees: Loans, Uniform, Mess, Penalties, EPF, ESIC, Insurance';
      case 'Taxes (ITC/TDS)': return 'Input Tax Credit claims and TDS refunds expected';
      case 'Other Income': return 'Miscellaneous income (interest, deposits, etc.)';
      default: return 'All receivable entries across categories';
    }
  };

  const showAddButton = !NO_ADD_CATEGORIES.includes(filter);

  // Determine effective status (mark overdue if past due date and still pending)
  const getEffectiveStatus = (entry: ReceivableEntry): ReceivableEntry['status'] => {
    if (entry.status === 'pending' && entry.due_date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(entry.due_date);
      due.setHours(0, 0, 0, 0);
      if (due < today) return 'overdue';
    }
    return entry.status;
  };

  // Check if due today
  const isDueToday = (entry: ReceivableEntry): boolean => {
    if (!entry.due_date) return false;
    const today = new Date().toISOString().split('T')[0];
    return entry.due_date === today;
  };

  // Days overdue
  const getDaysOverdue = (entry: ReceivableEntry): number => {
    if (!entry.due_date) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(entry.due_date);
    due.setHours(0, 0, 0, 0);
    const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  // Filter by search + status + period
  const filteredReceivables = useMemo(() => {
    // Period date boundaries
    const now = new Date();
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;

    if (periodFilter === 'this_month') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (periodFilter === 'this_quarter') {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      periodStart = new Date(now.getFullYear(), qMonth, 1);
      periodEnd = new Date(now.getFullYear(), qMonth + 3, 0, 23, 59, 59);
    } else if (periodFilter === 'this_year') {
      periodStart = new Date(now.getFullYear(), 0, 1);
      periodEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    } else if (periodFilter === 'this_fy') {
      const fyStartYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
      periodStart = new Date(fyStartYear, 3, 1); // April 1
      periodEnd = new Date(fyStartYear + 1, 2, 31, 23, 59, 59); // March 31
    }

    let result = receivables.filter(r => {
      // Search filter
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const matches = r.description.toLowerCase().includes(s) ||
          (r.client_name || '').toLowerCase().includes(s) ||
          r.category.toLowerCase().includes(s) ||
          (r.reference_number || '').toLowerCase().includes(s);
        if (!matches) return false;
      }
      // Status filter
      if (statusFilter !== 'all') {
        const effective = getEffectiveStatus(r);
        if (statusFilter === 'overdue') { if (effective !== 'overdue') return false; }
        else if (statusFilter !== effective) return false;
      }
      // Period filter
      if (periodStart && periodEnd) {
        const entryDate = new Date(r.created_at);
        if (entryDate < periodStart || entryDate > periodEnd) return false;
      }
      return true;
    });

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'total_amount':
          cmp = a.total_amount - b.total_amount;
          break;
        case 'due_date':
          cmp = (a.due_date || '9999').localeCompare(b.due_date || '9999');
          break;
        case 'status':
          cmp = getEffectiveStatus(a).localeCompare(getEffectiveStatus(b));
          break;
        case 'created_at':
        default:
          cmp = a.created_at.localeCompare(b.created_at);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [receivables, searchTerm, statusFilter, sortField, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredReceivables.length / PAGE_SIZE));
  const paginatedReceivables = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredReceivables.slice(start, start + PAGE_SIZE);
  }, [filteredReceivables, currentPage]);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [searchTerm, statusFilter, periodFilter, filter]);

  // Calculate summary totals accounting for partial payments
  const { totalPending, totalOverdue, totalReceived } = useMemo(() => {
    let pending = 0;
    let overdue = 0;
    let received = 0;

    receivables.forEach(r => {
      const effective = getEffectiveStatus(r);
      if (r.status === 'received') {
        received += r.total_amount;
      } else {
        // Check if partial payment was recorded
        const amountMatch = (r.notes || '').match(/Total Paid:\s*₹([\d,]+(?:\.\d+)?)/) || 
                            (r.notes || '').match(/Amount:\s*₹([\d,]+(?:\.\d+)?)/);
        const partialReceived = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) || 0 : 0;
        if (partialReceived > 0) {
          received += partialReceived;
          pending += r.total_amount - partialReceived;
        } else {
          pending += r.total_amount;
        }
        if (effective === 'overdue') {
          overdue += r.total_amount - partialReceived;
        }
      }
    });

    return { totalPending: pending, totalOverdue: overdue, totalReceived: received };
  }, [receivables]);

  // Bulk selection helpers
  const allOnPageSelected = paginatedReceivables.length > 0 && paginatedReceivables.every(r => selectedIds.has(r.id));
  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedReceivables.map(r => r.id)));
    }
  };
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Sort toggle helper
  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const getSortIcon = (field: typeof sortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  // Export CSV
  const handleExportCSV = () => {
    const rows = filteredReceivables.map(r => ({
      Description: r.description,
      Category: r.category,
      Client: r.client_name || '',
      Amount: r.amount,
      GST: r.gst_amount || 0,
      Total: r.total_amount,
      'Due Date': r.due_date || '',
      Status: getEffectiveStatus(r),
      Reference: r.reference_number || '',
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r as any)[h]}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receivables_${filter.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exported', description: `${filteredReceivables.length} entries exported to CSV.` });
  };

  // Duplicate invoice
  const handleDuplicate = (entry: ReceivableEntry) => {
    setFormData({
      client_name: entry.client_name || '',
      amount: String(entry.amount),
      gst_percent: entry.gst_amount && entry.amount > 0 ? String(Math.round((entry.gst_amount / entry.amount) * 100)) : '18',
      description: entry.description || '',
      invoice_number: '',
      due_date: '',
    });
    if (filter === 'Invoices') {
      setRaiseInvoiceOpen(true);
    } else {
      setShowAddForm(true);
    }
  };

  const handleViewInvoice = async (entry: ReceivableEntry) => {
    setSelectedInvoiceEntry(entry);
    const data = await buildInvoiceData(entry);
    setInvoiceViewData(data);
    setInvoiceViewOpen(true);
  };

  const handleEditInvoice = (entry: ReceivableEntry) => {
    setSelectedInvoiceEntry(entry);
    setInvoiceEditOpen(true);
  };

  // Build invoice data from a receivable entry to feed the InvoiceGenerator template
  const buildInvoiceData = async (entry: ReceivableEntry): Promise<InvoiceData> => {
    // Base (pre-GST) amount: prefer the stored base, else derive from total − GST.
    const gst = entry.gst_amount ?? 0;
    const base = entry.amount && entry.amount > 0 ? entry.amount : Math.max((entry.total_amount || 0) - gst, 0);
    const effectiveGst = gst || Math.max((entry.total_amount || 0) - base, 0);
    const gstRate = base > 0 ? Math.round((effectiveGst / base) * 100) : 18;

    // The description holds the POST/site name with an appended "| Inv#: …".
    // Strip the invoice-number suffix so only the post name remains.
    // Guard against the auto-generated "N services" label that appears when
    // there are multiple service lines — it is not a post name.
    const rawPostName = (entry.description || '')
      .replace(/\s*\|\s*Inv#:.*$/i, '')
      .trim();
    const postName = /^\d+\s+services?$/i.test(rawPostName) ? '' : rawPostName;

    // Extract client GSTIN and address from notes
    // Supports both formats: "Client GSTIN: ..." (generated invoices) and "GSTIN: ..." (one-time invoices)
    const notes = entry.notes || '';
    const gstinMatch = notes.match(/(?:Client )?GSTIN:\s*([^\s|]+)/);
    const addressMatch = notes.match(/(?:Client )?(?:Address|Addr):\s*([^|]+)/);
    const workOrderMatch = notes.match(/Work Order No:\s*([^|]+)/);
    const workOrderDateMatch = notes.match(/Work Order Date:\s*([^|]+)/);
    const posMatch = notes.match(/Place of Supply:\s*([^|]+)/);
    const irnMatch = notes.match(/IRN:\s*([^\s|]+)/);
    const tdsMatch = notes.match(/TDS:\s*([\d.]+)%/);
    const prevDueMatch = notes.match(/Previous Due:\s*₹?([\d,]+)/);
    const gstPctMatch = notes.match(/GST:\s*([\d.]+)%/);
    const clientGstin = gstinMatch ? gstinMatch[1].trim().toUpperCase() : '';
    const clientAddress = addressMatch ? addressMatch[1].trim() : '';
    const workOrderNo = workOrderMatch ? workOrderMatch[1].trim() : '';
    const workOrderDate = workOrderDateMatch ? workOrderDateMatch[1].trim() : '';
    const placeOfSupply = posMatch ? posMatch[1].trim() : '';
    const irn = irnMatch ? irnMatch[1].trim() : '';
    const notesGstPct = gstPctMatch ? parseFloat(gstPctMatch[1]) : null;
    const notesTdsRate = tdsMatch ? parseFloat(tdsMatch[1]) : null;
    const notesPrevDue = prevDueMatch ? parseFloat(prevDueMatch[1].replace(/,/g, '')) : 0;
    // Use DB column as primary source for previous balance, fall back to notes
    const effectivePrevDue = entry.previous_balance ?? notesPrevDue;
    // For TDS: try notes first, then try extracting from snapshot
    let effectiveTdsRate = notesTdsRate;
    if (effectiveTdsRate === null && entry.invoice_snapshot) {
      const snap = entry.invoice_snapshot as any;
      if (snap?.advice?.tdsRate) effectiveTdsRate = snap.advice.tdsRate;
      else if (snap?.taxInvoice?.tds !== undefined && snap?.taxInvoice?.taxableValue) {
        const snapTaxable = snap.taxInvoice.taxableValue;
        const snapTds = snap.advice?.tds;
        if (snapTds > 0 && snapTaxable > 0) effectiveTdsRate = Math.round(snapTds / snapTaxable * 10000) / 100;
      }
    }
    const billingMatch = notes.match(/Billing Period:\s*([^|]+)/);
    const billingPeriod = billingMatch ? billingMatch[1].trim() : '';

    // Parse previous entries breakdown from notes
    // Format: "Outstanding: INV-001 (₹50,000), INV-002 (₹30,000)"
    const outstandingMatch = notes.match(/Outstanding:\s*([^|]+)/);
    const previousEntries: Array<{ referenceNumber: string; date?: string; amount: number }> = [];
    if (outstandingMatch) {
      const entriesStr = outstandingMatch[1].trim();
      const entryRegex = /([\w-]+)\s*\(₹([\d,]+(?:\.\d+)?)\)/g;
      let m;
      while ((m = entryRegex.exec(entriesStr)) !== null) {
        previousEntries.push({
          referenceNumber: m[1],
          amount: parseFloat(m[2].replace(/,/g, '')),
        });
      }
    }

    // A consolidated receivable has no day/duty breakdown, so represent it as a
    // single personnel serving every day of the invoice month at the monthly
    // rate: (base ÷ days) × days = base — reproducing the stored amount exactly.
    const invDate = new Date(entry.created_at);
    const daysInMonth = new Date(invDate.getFullYear(), invDate.getMonth() + 1, 0).getDate();

    const result: InvoiceData = {
      invoiceDetails: {
        invoiceNo: entry.reference_number || entry.id.slice(0, 8),
        date: invDate.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        dueDate: entry.due_date ? new Date(entry.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '',
        workOrderNo,
        workOrderDate,
        // Service period — DB columns first, then notes fallback
        servicePeriodStart: entry.service_period_start ||
          (billingPeriod ? billingPeriod.split(/\s+(?:to|–|-)\s+/)[0]?.trim() : null) || null,
        servicePeriodEnd: entry.service_period_end ||
          (billingPeriod ? billingPeriod.split(/\s+(?:to|–|-)\s+/)[1]?.trim() : null) || null,
        ...(placeOfSupply ? { placeOfSupply } : {}),
        ...(irn ? { irn } : {}),
      },
      clientInfo: {
        name: entry.client_name || '',
        address: clientAddress,
        gstin: clientGstin,
        // Derive client state from their GSTIN (first 2 digits = state code).
        // Fall back to the invoice's place_of_supply when no GSTIN is available.
        state: (() => {
          if (clientGstin && clientGstin.length >= 2) {
            const code = clientGstin.slice(0, 2);
            const found = INDIAN_STATES.find(s => s.code === code);
            if (found) return found.label;
          }
          // placeOfSupply is stored as "21-Odisha"; map back via state code prefix
          const pos = entry.place_of_supply || placeOfSupply || DEFAULT_PLACE_OF_SUPPLY;
          const posCode = pos.split('-')[0]?.trim();
          const posState = INDIAN_STATES.find(s => s.code === posCode);
          return posState ? posState.label : pos;
        })(),
      },
      // Prefer the stored structured breakdown (real per-designation service
      // lines from the work order + attendance). Fall back to a single line
      // only for legacy/imported receivables that have no breakdown.
      items: (entry.line_items && entry.line_items.length > 0)
        ? entry.line_items.map((li: any, i) => ({
            id: i + 1,
            // Clean any accumulated duplicate shift suffixes from old data
            service: (li.service || '')
              .replace(/(\s*\(12-Hour\))+/g, ' (12-Hour)')
              .replace(/(\s*\(8-Hour\))+/g, ' (8-Hour)')
              .trim(),
            post: li.post || postName,
            sac: li.sac || '998525',
            personnel: li.personnel || 0,
            // Handle both field names: woPrice (OneTimeInvoiceForm) and monthlyRate (GenerateInvoice)
            woPrice: li.woPrice || li.monthlyRate || 0,
            hideWoPrice: !!li.hideWoPrice,
            days: li.days || daysInMonth,
            duties: li.duties || 0,
            gstRate: li.gstRate ?? (gstRate > 0 ? gstRate : 18),
          }))
        : [{
            id: 1,
            service: '',
            post: postName,
            sac: '998525',
            personnel: 1,
            woPrice: base,
            days: daysInMonth,
            duties: daysInMonth,
            gstRate: gstRate > 0 ? gstRate : 18,
          }],
      paymentDetails: {},
      invoiceStatus: entry.status || 'pending',
      receivableId: entry.id,
      taxConfig: (() => {
        const totalGstPct = (notesGstPct ?? gstRate) > 0 ? (notesGstPct ?? gstRate) : 18;
        // Use the proper DB column first; fall back to resolving from place_of_supply
        const resolvedPos = entry.place_of_supply || placeOfSupply || DEFAULT_PLACE_OF_SUPPLY;
        const dbGstType = entry.gst_type;
        const { sgstRate, cgstRate, igstRate } = resolveGstConfig(resolvedPos, totalGstPct);
        // If DB column exists, it overrides the resolved value (handles back-filled rows correctly)
        const finalIgst = dbGstType === 'igst'     ? totalGstPct : (dbGstType === 'cgst_sgst' ? 0 : igstRate);
        const finalSgst = dbGstType === 'cgst_sgst' ? totalGstPct / 2 : (dbGstType === 'igst' ? 0 : sgstRate);
        const finalCgst = dbGstType === 'cgst_sgst' ? totalGstPct / 2 : (dbGstType === 'igst' ? 0 : cgstRate);
        const isExempt  = dbGstType === 'exempt' || totalGstPct === 0;
        return {
          sgstRate: isExempt ? 0 : finalSgst,
          cgstRate: isExempt ? 0 : finalCgst,
          igstRate: isExempt ? 0 : finalIgst,
          tdsRate: effectiveTdsRate ?? 0,
          received: 0,
          previousBalance: effectivePrevDue,
        };
      })(),
      gstTreatment: entry.gst_treatment || null,
      previousEntries: previousEntries.length > 0 ? previousEntries : undefined,
      snapshot: entry.invoice_snapshot ?? undefined,
    };

    // Fetch payment records and update received amount
    try {
      const { data: payments } = await supabaseClient
        .from('receivable_payments')
        .select('*')
        .eq('receivable_id', entry.id)
        .order('created_at', { ascending: true });
      if (payments && payments.length > 0) {
        result.payments = payments as any;
        // receivable_payments.amount is stored as (cash + TDS) — see the record
        // mutation. The Payment Advice already shows TDS on its own line, so the
        // "Payments received" line must be pure cash; otherwise TDS is subtracted
        // twice. Strip the invoice-level TDS back out of the summed payments.
        const paidWithTds = payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
        const invoiceTds = (effectiveTdsRate ?? 0) > 0
          ? Math.round(base * (effectiveTdsRate ?? 0) / 100 * 100) / 100
          : 0;
        result.taxConfig!.received = Math.max(0, paidWithTds - invoiceTds);
      }
    } catch {}

    return result;
  };

  const handleDownloadInvoice = async (entry: ReceivableEntry) => {
    try {
      toast({ title: 'Generating PDF...', description: 'Please wait' });

      // The route now authenticates the caller and reads the invoice figures from
      // the database itself, so we send an id and an access token rather than a
      // payload of amounts. Previously anyone could POST arbitrary amounts and a
      // forged GSTIN to this endpoint and get them rendered on our letterhead.
      const { data: sessionData } = await supabaseClient.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error('Your session has expired. Sign in again to download the invoice.');
      }

      const response = await fetch('/api/invoice-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ receivableId: entry.id }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'PDF generation failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice_${entry.reference_number || entry.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: 'PDF Downloaded', description: `Invoice_${entry.reference_number || entry.id.slice(0, 8)}.pdf` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to generate PDF', variant: 'destructive' });
    }
  };

  const getStatusBadge = (entry: ReceivableEntry) => {
    const effective = getEffectiveStatus(entry);
    const daysOver = getDaysOverdue(entry);
    const dueToday = isDueToday(entry);

    // Detect partial payment from notes (contains "Mode:" when payment was recorded)
    const hasPartialPayment = effective === 'pending' && entry.notes && /Mode:/.test(entry.notes) && /Balance:/.test(entry.notes);

    switch (effective) {
      case 'received': return <Badge className="bg-green-500 text-white"><CheckCircle2 className="h-3 w-3 mr-1" />Received</Badge>;
      case 'overdue': return (
        <Badge className="bg-red-600 text-white border border-red-700">
          <AlertTriangle className="h-3 w-3 mr-1" />Overdue{daysOver > 0 ? ` (${daysOver}d)` : ''}
        </Badge>
      );
      case 'pending':
        if (hasPartialPayment) {
          return <Badge className="bg-blue-500 text-white">Partial</Badge>;
        }
        return (
          <Badge className={`text-white ${dueToday ? 'bg-orange-500 border border-orange-600' : 'bg-amber-500'}`}>
            {dueToday && <AlertTriangle className="h-3 w-3 mr-1" />}
            {dueToday ? 'Due Today' : 'Pending'}
          </Badge>
        );
      case 'cancelled': return <Badge className="bg-gray-500 text-white"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
      default: return <Badge variant="secondary">{effective}</Badge>;
    }
  };

  return (
    <div className="space-y-5">
      {/* Header with title + actions */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">{filter === 'All Receivables' ? 'All Receivables' : filter}</h2>
          <p className="text-sm text-muted-foreground">{getCategoryDescription()}</p>
        </div>
        <div className="flex items-center gap-2">
          {filter === 'Invoices' && (
            <Button variant="outline" size="sm" onClick={() => setImportInvoiceOpen(true)}>
              <Upload className="h-4 w-4 mr-1.5" /> Import
            </Button>
          )}
          {filteredReceivables.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <FileDown className="h-4 w-4 mr-1.5" /> Export CSV
            </Button>
          )}
          {showAddButton && (
            <Button onClick={() => {
              if (filter === 'Invoices') {
                setRaiseInvoiceOpen(true);
              } else {
                setFormData({});
                setShowAddForm(true);
              }
            }}>
              <Plus className="h-4 w-4 mr-2" />
              {getAddButtonLabel()}
            </Button>
          )}
        </div>
      </div>

      {/* Payroll Receivables — live from HR advances / deductions */}
      {filter === 'Payroll Receivables' && <PayrollReceivablesSection />}

      {/* Standard receivables ledger (all categories except the live Payroll Receivables view) */}
      {filter !== 'Payroll Receivables' && (<>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('pending')}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Pending</p>
            <p className="text-xl font-bold text-amber-600">₹{totalPending.toLocaleString('en-IN')}</p>
            {totalOverdue > 0 && <p className="text-xs text-red-600 mt-1">₹{totalOverdue.toLocaleString('en-IN')} overdue</p>}
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('overdue')}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Overdue</p>
            <p className="text-xl font-bold text-red-600">₹{totalOverdue.toLocaleString('en-IN')}</p>
            <p className="text-xs text-muted-foreground mt-1">{receivables.filter(r => getEffectiveStatus(r) === 'overdue').length} invoices</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('received')}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Received</p>
            <p className="text-xl font-bold text-green-600">₹{totalReceived.toLocaleString('en-IN')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Entries</p>
            <p className="text-xl font-bold">{receivables.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Showing {filteredReceivables.length} filtered</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters Row: Search + Period + Status */}
      <div className="space-y-3">
        {/* Period filter */}
        <div className="flex items-center gap-1.5">
          {([
            { key: 'all', label: 'All Invoices' },
            { key: 'this_month', label: 'This Month' },
            { key: 'this_quarter', label: 'This Quarter' },
            { key: 'this_year', label: 'This Year' },
            { key: 'this_fy', label: 'This Financial Year' },
          ] as const).map(({ key, label }) => (
            <Button
              key={key}
              size="sm"
              variant={periodFilter === key ? 'default' : 'outline-solid'}
              className={`text-xs h-8 ${periodFilter === key ? '' : 'text-muted-foreground'}`}
              onClick={() => setPeriodFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>

        {/* Search + Status + Bulk */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name, invoice no..." className="pl-8" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex items-center gap-1.5">
            {(['all', 'pending', 'overdue', 'received', 'cancelled'] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? 'default' : 'outline-solid'}
                className={`text-xs h-8 ${statusFilter === s ? '' : 'text-muted-foreground'}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? 'All' : s === 'overdue' ? '⚠ Overdue' : s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
                const entries = receivables.filter(r => selectedIds.has(r.id) && r.status !== 'received' && r.status !== 'cancelled');
                if (entries.length === 0) { toast({ title: 'No eligible entries', variant: 'destructive' }); return; }
                openReceiveAmount(entries[0]);
              }}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Paid
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs text-red-600" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filteredReceivables.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <IndianRupee className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No entries found{statusFilter !== 'all' ? ` with status "${statusFilter}"` : filter !== 'All Receivables' ? ` for "${filter}"` : ''}.</p>
              {showAddButton && statusFilter === 'all' && (
                <Button variant="link" className="mt-2" onClick={() => filter === 'Invoices' ? setRaiseInvoiceOpen(true) : setShowAddForm(true)}>
                  <Plus className="h-4 w-4 mr-1" /> {getAddButtonLabel()}
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allOnPageSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                  </TableHead>
                  <TableHead>Invoice No.</TableHead>
                  <TableHead>Invoice Date</TableHead>
                  <TableHead className="min-w-[120px]">Client Name</TableHead>
                  <TableHead>Services</TableHead>
                  {filter === 'All Receivables' && <TableHead>Category</TableHead>}
                  <TableHead className="text-right cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('total_amount')}>
                    <span className="inline-flex items-center">Invoice Amount{getSortIcon('total_amount')}</span>
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">GST</TableHead>
                  <TableHead className="text-right cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('due_date')}>
                    <span className="inline-flex items-center">Due Date{getSortIcon('due_date')}</span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('status')}>
                    <span className="inline-flex items-center">Status{getSortIcon('status')}</span>
                  </TableHead>
                  <TableHead className="text-right w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedReceivables.map((entry) => {
                  const effective = getEffectiveStatus(entry);
                  // Extract service type from description (format: "ServiceType | Inv#: XXX")
                  const descParts = entry.description.split(' | ');
                  const invoiceNum = entry.reference_number || (descParts.find(p => p.startsWith('Inv#:'))?.replace('Inv#: ', '') || entry.id.slice(0, 8));
                  // Derive service names from line_items for a richer, accurate label.
                  // Strip accumulated shift-type duplicates (e.g. "(8-Hour) (8-Hour)") from stored labels.
                  const cleanShift = (s: string) =>
                    s.replace(/(\s*\(12-Hour\))+/g, ' (12-Hour)')
                     .replace(/(\s*\(8-Hour\))+/g, ' (8-Hour)')
                     .trim();
                  const serviceName = (() => {
                    if (entry.line_items && entry.line_items.length > 0) {
                      const names = entry.line_items
                        .map((li: any) => {
                          const svc = cleanShift(li.service || '');
                          // Shorten: strip " (8-Hour)" / " (12-Hour)" for the compact list label
                          return svc.replace(/\s*\((?:8|12)-Hour\)/g, '').trim();
                        })
                        .filter(Boolean);
                      if (names.length === 1) return names[0];
                      if (names.length > 1) {
                        // Show first two unique service types; append count if more
                        const unique = [...new Set(names.map(n => n.split(' \u2014 ')[0].trim()))];
                        return unique.length <= 2
                          ? unique.join(', ')
                          : `${unique[0]}, ${unique[1]} +${unique.length - 2} more`;
                      }
                    }
                    return descParts[0] || '—';
                  })();
                  return (
                    <TableRow
                      key={entry.id}
                      className={`hover:bg-muted/50 transition-colors cursor-pointer ${effective === 'overdue' ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}
                      onClick={(e) => {
                        // Don't open if clicking checkbox, dropdown, or button
                        const target = e.target as HTMLElement;
                        if (target.closest('button') || target.closest('[role="checkbox"]') || target.closest('[data-radix-collection-item]')) return;
                        if (entry.category === 'Invoices') handleViewInvoice(entry);
                      }}
                    >
                      <TableCell>
                        <Checkbox checked={selectedIds.has(entry.id)} onCheckedChange={() => toggleSelect(entry.id)} aria-label={`Select ${entry.description}`} />
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{invoiceNum}</TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">{new Date(entry.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</TableCell>
                      <TableCell>{entry.client_name || '—'}</TableCell>
                      <TableCell>{serviceName}</TableCell>
                      {filter === 'All Receivables' && <TableCell><Badge variant="outline" className="text-xs">{entry.category}</Badge></TableCell>}
                      <TableCell className="text-right font-medium tabular-nums">₹{entry.total_amount.toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {(() => {
                          const gst = entry.gst_amount || (entry.total_amount - entry.amount);
                          if (!gst || gst <= 0) return <span className="text-muted-foreground">—</span>;
                          const gstPct = entry.amount > 0 ? Math.round((gst / entry.amount) * 100) : 0;
                          // Determine GST type from DB column; fall back to notes sniffing for legacy rows
                          const isIGST = entry.gst_type
                            ? entry.gst_type === 'igst'
                            : (entry.notes || '').toLowerCase().includes('igst');
                          return (
                            <div>
                              <span className="font-medium">₹{gst.toLocaleString('en-IN')}</span>
                              <br />
                              <span className="text-muted-foreground">
                                {isIGST
                                  ? `IGST ${gstPct}%`
                                  : `CGST ${gstPct / 2}% + SGST ${gstPct / 2}%`}
                              </span>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry.due_date ? (
                          <span className={effective === 'overdue' ? 'text-red-600 font-medium' : isDueToday(entry) ? 'text-orange-600 font-medium' : ''}>
                            {new Date(entry.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>{getStatusBadge(entry)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {entry.category === 'Invoices' && (
                              <>
                                <DropdownMenuItem onClick={() => handleViewInvoice(entry)}>
                                  <Eye className="h-4 w-4 mr-2 text-blue-600" /> View Invoice
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDownloadInvoice(entry)}>
                                  <Download className="h-4 w-4 mr-2 text-green-600" /> Download PDF
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleEditInvoice(entry)}>
                                  <Pencil className="h-4 w-4 mr-2 text-amber-600" /> Edit
                                </DropdownMenuItem>
                              </>
                            )}
                            {entry.status !== 'received' && entry.status !== 'cancelled' && (
                              <DropdownMenuItem onClick={() => openReceiveAmount(entry)}>
                                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" /> Record Payment
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleDuplicate(entry)}>
                              <Copy className="h-4 w-4 mr-2 text-indigo-600" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownloadInvoice(entry)}>
                              <Printer className="h-4 w-4 mr-2 text-blue-600" /> Print
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleSendByMail(entry)}>
                              <Mail className="h-4 w-4 mr-2 text-purple-600" /> Send Reminder
                            </DropdownMenuItem>
                            {((entry.status === 'received' || entry.status === 'partial') || ((entry.notes || '').match(/Total Paid:\s*₹/) || (entry.notes || '').match(/Amount:\s*₹/))) && (
                              <DropdownMenuItem 
                                className="text-amber-600 focus:text-white focus:bg-amber-600" 
                                onClick={() => {
                                  if (window.confirm("Are you sure you want to undo the last payment for this invoice? This will remove the payment record and revert the invoice balance.")) {
                                    undoLastPayment.mutate(entry);
                                  }
                                }}
                              >
                                <Undo2 className="h-4 w-4 mr-2" /> Undo Last Payment
                              </DropdownMenuItem>
                            )}
                            {entry.status !== 'cancelled' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-600 focus:text-white focus:bg-red-600" onClick={() => cancelInvoice.mutate(entry.id)}>
                                  <XCircle className="h-4 w-4 mr-2" /> Cancel
                                </DropdownMenuItem>
                              </>
                            )}
                            {isAdmin && (
                              <DropdownMenuItem className="text-red-700 focus:text-white focus:bg-red-600 font-medium" onClick={() => { setEntryToDelete(entry); setDeleteConfirmOpen(true); }}>
                                <Trash2 className="h-4 w-4 mr-2" /> Delete Invoice
                              </DropdownMenuItem>
                            )}
                            {!isAdmin && (
                              <DropdownMenuItem className="text-red-600 focus:text-white focus:bg-red-600" onClick={() => { setEntryToDelete(entry); setDeleteConfirmOpen(true); }}>
                                <Trash2 className="h-4 w-4 mr-2" /> Request Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {filteredReceivables.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filteredReceivables.length)} of {filteredReceivables.length}
              </p>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let page: number;
                  if (totalPages <= 5) { page = i + 1; }
                  else if (currentPage <= 3) { page = i + 1; }
                  else if (currentPage >= totalPages - 2) { page = totalPages - 4 + i; }
                  else { page = currentPage - 2 + i; }
                  return (
                    <Button key={page} size="sm" variant={currentPage === page ? 'default' : 'outline-solid'} className="h-8 w-8 p-0" onClick={() => setCurrentPage(page)}>
                      {page}
                    </Button>
                  );
                })}
                <Button size="icon" variant="outline" className="h-8 w-8" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          {filteredReceivables.length > 0 && filteredReceivables.length <= PAGE_SIZE && (
            <div className="px-4 py-2 border-t">
              <p className="text-xs text-muted-foreground">Showing all {filteredReceivables.length} entries</p>
            </div>
          )}
        </CardContent>
      </Card>
      </>)}

      {/* Add Form Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{filter === 'All Receivables' ? 'New Receivable' : getAddButtonLabel()}</DialogTitle>
          </DialogHeader>
          {renderAddForm()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createReceivable.isPending}>
              {createReceivable.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Raise Invoice Dialog (Two Options: One-Time / Generate) */}
      <RaiseInvoiceDialog
        open={raiseInvoiceOpen}
        onOpenChange={setRaiseInvoiceOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['receivables'] });
          setRaiseInvoiceOpen(false);
        }}
      />

      {/* Import Invoices Dialog (from Vyapar export) */}
      <InvoiceImportDialog
        open={importInvoiceOpen}
        onOpenChange={setImportInvoiceOpen}
        onImported={() => queryClient.invalidateQueries({ queryKey: ['receivables'] })}
      />

      {/* Delete Invoice Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={(v) => { setDeleteConfirmOpen(v); if (!v) { setEntryToDelete(null); setDeleteReason(''); } }}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <ShieldAlert className="h-5 w-5" />
              {isAdmin ? 'Delete Invoice (Admin)' : 'Request Invoice Deletion'}
            </DialogTitle>
          </DialogHeader>
          {entryToDelete && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                {isAdmin
                  ? <>This will <span className="font-semibold text-red-600">permanently delete</span> the following invoice. This action cannot be undone.</>
                  : <>Your delete request will be sent to an admin for approval.</>
                }
              </p>
              <div className="p-3 rounded-lg border bg-muted/30 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice No:</span>
                  <span className="font-mono font-medium">{entryToDelete.reference_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Client:</span>
                  <span className="font-medium">{entryToDelete.client_name || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-medium">₹{entryToDelete.total_amount.toLocaleString('en-IN')}</span>
                </div>
              </div>

              {/* Reason field */}
              <div className="space-y-1">
                <Label className="text-sm">{isAdmin ? 'Reason (optional)' : 'Reason for deletion *'}</Label>
                <Textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Why should this invoice be deleted?"
                  rows={2}
                />
              </div>

              {isAdmin && (
                <p className="text-xs text-blue-700 bg-blue-50 dark:bg-blue-950/20 p-2 rounded border border-blue-200 dark:border-blue-800">
                  Invoice number <span className="font-mono font-semibold">{entryToDelete.reference_number}</span> will be recycled for reuse.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteConfirmOpen(false); setEntryToDelete(null); setDeleteReason(''); }}>Cancel</Button>
            {isAdmin ? (
              <Button
                variant="destructive"
                onClick={() => entryToDelete && deleteInvoice.mutate(entryToDelete)}
                disabled={deleteInvoice.isPending}
              >
                {deleteInvoice.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                {deleteInvoice.isPending ? 'Deleting...' : 'Delete Permanently'}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => {
                  if (!deleteReason.trim()) {
                    toast({ title: 'Reason Required', description: 'Please provide a reason for the delete request.', variant: 'destructive' });
                    return;
                  }
                  if (entryToDelete) requestDeleteInvoice.mutate({ entry: entryToDelete, reason: deleteReason });
                }}
                disabled={requestDeleteInvoice.isPending}
              >
                {requestDeleteInvoice.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                {requestDeleteInvoice.isPending ? 'Sending...' : 'Send Request to Admin'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Invoice — Modal */}
      <Dialog open={invoiceViewOpen} onOpenChange={(v) => { if (!v) { setInvoiceViewOpen(false); setInvoiceViewData(null); } }}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto p-0 gap-0" preventOutsideClose={false}>
          <DialogTitle className="sr-only">Invoice Preview</DialogTitle>
          {invoiceViewData && (
            <InvoiceGenerator
              readOnly
              initialData={invoiceViewData}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Invoice — opens the same OneTimeInvoiceForm used to create it */}
      {invoiceEditOpen && selectedInvoiceEntry && (
        <OneTimeInvoiceForm
          open={invoiceEditOpen}
          onOpenChange={(v) => { if (!v) { setInvoiceEditOpen(false); setSelectedInvoiceEntry(null); } }}
          onSuccess={() => {
            setInvoiceEditOpen(false);
            setSelectedInvoiceEntry(null);
            queryClient.invalidateQueries({ queryKey: ['receivables'] });
          }}
          onBack={() => { setInvoiceEditOpen(false); setSelectedInvoiceEntry(null); }}
          editEntry={selectedInvoiceEntry}
        />
      )}

      {/* Receive Amount Dialog */}
      <Dialog open={receiveAmountOpen} onOpenChange={setReceiveAmountOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto p-0 gap-0">
          {selectedInvoiceEntry && (
            <>
              {/* Header band */}
              <div className="bg-safend-red/5 dark:bg-safend-red/10 border-b px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-safend-red/10">
                    <IndianRupee className="h-5 w-5 text-safend-red" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-bold">Receive Payment</DialogTitle>
                    <p className="text-sm text-muted-foreground">{selectedInvoiceEntry.description} · {selectedInvoiceEntry.client_name || '—'}</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-xs text-muted-foreground">Total Due</p>
                    <p className="text-xl font-bold text-safend-red">₹{amountDue.toLocaleString('en-IN')}</p>
                  </div>
                </div>
                {/* Invoice breakdown summary */}
                {(() => {
                  const notes = selectedInvoiceEntry.notes || '';
                  const tdsRateMatch = notes.match(/TDS:\s*([\d.]+)%/);
                  const tdsRate = tdsRateMatch ? parseFloat(tdsRateMatch[1]) : 0;
                  const notesPrevDueMatch = notes.match(/Previous Due:\s*₹?([\d,]+(?:\.\d+)?)/);
                  const prevDue = selectedInvoiceEntry.previous_balance ?? (notesPrevDueMatch ? parseFloat(notesPrevDueMatch[1].replace(/,/g, '')) : 0);
                  const taxableBase = selectedInvoiceEntry.amount && selectedInvoiceEntry.amount > 0 ? selectedInvoiceEntry.amount : selectedInvoiceEntry.total_amount;
                  const tdsAmt = tdsRate > 0 ? Math.round(taxableBase * tdsRate / 100 * 100) / 100 : 0;
                  
                  if (tdsRate > 0 || prevDue > 0) {
                    return (
                      <div className="mt-3 p-2.5 rounded-lg bg-white/60 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-700 text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Invoice Amount</span>
                          <span className="font-medium">₹{selectedInvoiceEntry.total_amount.toLocaleString('en-IN')}</span>
                        </div>
                        {tdsRate > 0 && (
                          <div className="flex justify-between text-amber-700 dark:text-amber-400">
                            <span>Less: TDS @ {tdsRate}% (Sec 194C)</span>
                            <span className="font-medium">− ₹{tdsAmt.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        {prevDue > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Previous Outstanding</span>
                            <span className="font-medium">₹{prevDue.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        <div className="flex justify-between pt-1 border-t border-neutral-200 dark:border-neutral-600 font-semibold">
                          <span>Net Receivable</span>
                          <span className="text-safend-red">₹{Math.max(0, selectedInvoiceEntry.total_amount - tdsAmt + prevDue).toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* Two-column body */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
                {/* LEFT: Collection details */}
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Collection Details</h3>

                  {/* Mode as segmented buttons */}
                  <div>
                    <Label className="text-xs">Mode of Collection</Label>
                    <div className="grid grid-cols-3 gap-2 mt-1.5">
                      {['Cash', 'Cheque', 'Bank Transfer'].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setPaymentForm({ ...paymentForm, mode: m })}
                          className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                            paymentForm.mode === m
                              ? 'bg-safend-red text-white border-safend-red shadow-xs'
                              : 'bg-background border-input hover:border-safend-red/40 hover:bg-muted/50'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cash */}
                  {paymentForm.mode === 'Cash' && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">Received By</Label>
                        <Select value={paymentForm.receivedBy} onValueChange={(v) => setPaymentForm({ ...paymentForm, receivedBy: v })}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select person" /></SelectTrigger>
                          <SelectContent>
                            {staffUsers.filter(u => u.role === 'sales').length > 0 && (
                              <>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Sales</div>
                                {staffUsers.filter(u => u.role === 'sales').map((u) => (
                                  <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                                ))}
                              </>
                            )}
                            {staffUsers.filter(u => u.role === 'operations').length > 0 && (
                              <>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Operations</div>
                                {staffUsers.filter(u => u.role === 'operations').map((u) => (
                                  <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                                ))}
                              </>
                            )}
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Other</div>
                            <SelectItem value="__third_party__">Authorized 3rd Person</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {paymentForm.receivedBy === '__third_party__' && (
                        <div>
                          <Label className="text-xs">Authorized Person Name</Label>
                          <Input className="mt-1.5" placeholder="Enter authorized person's name" value={paymentForm.thirdPartyName} onChange={(e) => setPaymentForm({ ...paymentForm, thirdPartyName: e.target.value })} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cheque */}
                  {paymentForm.mode === 'Cheque' && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">Received By</Label>
                        <Select value={paymentForm.receivedBy} onValueChange={(v) => setPaymentForm({ ...paymentForm, receivedBy: v })}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select person" /></SelectTrigger>
                          <SelectContent>
                            {staffUsers.filter(u => u.role === 'sales').length > 0 && (
                              <>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Sales</div>
                                {staffUsers.filter(u => u.role === 'sales').map((u) => (
                                  <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                                ))}
                              </>
                            )}
                            {staffUsers.filter(u => u.role === 'operations').length > 0 && (
                              <>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Operations</div>
                                {staffUsers.filter(u => u.role === 'operations').map((u) => (
                                  <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>
                                ))}
                              </>
                            )}
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Other</div>
                            <SelectItem value="__third_party__">Authorized 3rd Person</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {paymentForm.receivedBy === '__third_party__' && (
                        <div>
                          <Label className="text-xs">Authorized Person Name</Label>
                          <Input className="mt-1.5" placeholder="Enter authorized person's name" value={paymentForm.thirdPartyName} onChange={(e) => setPaymentForm({ ...paymentForm, thirdPartyName: e.target.value })} />
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Cheque Number</Label>
                          <Input className="mt-1.5" placeholder="e.g. 000456" value={paymentForm.chequeNumber} onChange={(e) => setPaymentForm({ ...paymentForm, chequeNumber: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Cheque Date</Label>
                          <Input type="date" className="mt-1.5" value={paymentForm.chequeDate} onChange={(e) => setPaymentForm({ ...paymentForm, chequeDate: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bank Transfer */}
                  {paymentForm.mode === 'Bank Transfer' && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">Received in Bank Account</Label>
                        <Select value={paymentForm.bankAccountId} onValueChange={(v) => setPaymentForm({ ...paymentForm, bankAccountId: v })}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select bank account" /></SelectTrigger>
                          <SelectContent>
                            {bankAccounts.length === 0 ? (
                              <div className="px-2 py-2 text-xs text-muted-foreground">No bank accounts found. Add one in Banking.</div>
                            ) : bankAccounts.map((b) => (
                              <SelectItem key={b.id} value={b.id}>{b.account_name} — {b.bank_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Transaction Number (UTR / Ref)</Label>
                        <Input className="mt-1.5" placeholder="Transaction reference" value={paymentForm.transactionNumber} onChange={(e) => setPaymentForm({ ...paymentForm, transactionNumber: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">Transaction Date & Time</Label>
                        <Input type="datetime-local" className="mt-1.5" value={paymentForm.transactionDateTime} onChange={(e) => setPaymentForm({ ...paymentForm, transactionDateTime: e.target.value })} />
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT: Amount details */}
                <div className="space-y-4 md:border-l md:pl-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount Details</h3>

                  {/* Payment type toggle */}
                  <div>
                    <Label className="text-xs">Payment Type</Label>
                    {(() => {
                      const notesPrevDueMatch = (selectedInvoiceEntry?.notes || '').match(/Previous Due:\s*₹?([\d,]+(?:\.\d+)?)/);
                      const previousDue = selectedInvoiceEntry?.previous_balance ?? (notesPrevDueMatch ? parseFloat(notesPrevDueMatch[1].replace(/,/g, '')) : 0);
                      const invoiceNo = selectedInvoiceEntry?.reference_number || selectedInvoiceEntry?.id.slice(0, 8) || '';
                      const options: {v: string, l: string, sub?: string}[] = previousDue > 0 
                        ? [{ v: 'full', l: 'Full Amount' }, { v: 'invoice_only', l: 'Invoice Only', sub: `#${invoiceNo}` }, { v: 'partial', l: 'Partial Amount' }]
                        : [{ v: 'full', l: 'Full Amount' }, { v: 'partial', l: 'Partial Amount' }];
                      
                      return (
                        <div className={`grid gap-2 mt-1.5 ${previousDue > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                          {options.map((opt) => (
                            <button
                              key={opt.v}
                              type="button"
                              onClick={() => {
                                const tds = parseFloat(paymentForm.tdsDeducted) || 0;
                                // amountDue is already net of TDS, so "Full Amount" is
                                // exactly amountDue. "Invoice Only" is this invoice's own
                                // net (total − TDS), excluding previous outstanding.
                                setPaymentForm({ 
                                  ...paymentForm, 
                                  paymentType: opt.v, 
                                  amountReceived: opt.v === 'full' ? String(amountDue) 
                                                : opt.v === 'invoice_only' ? String(Math.max(0, (selectedInvoiceEntry?.total_amount || 0) - tds))
                                                : '' 
                                });
                              }}
                              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all flex flex-col items-center justify-center ${
                                paymentForm.paymentType === opt.v
                                  ? 'bg-safend-red text-white border-safend-red shadow-xs'
                                  : 'bg-background border-input hover:border-safend-red/40 hover:bg-muted/50'
                              }`}
                            >
                              <span>{opt.l}</span>
                              {opt.sub && <span className="text-[10px] opacity-80 mt-0.5 font-normal tracking-wide">{opt.sub}</span>}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Amount input */}
                  <div>
                    <Label className="text-xs">Amount Received (₹)</Label>
                    <div className="relative mt-1.5">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                      <Input
                        type="number"
                        className="pl-7 text-lg font-semibold h-11"
                        value={paymentForm.amountReceived}
                        onChange={(e) => setPaymentForm({ ...paymentForm, amountReceived: e.target.value })}
                        disabled={paymentForm.paymentType === 'full' || paymentForm.paymentType === 'invoice_only'}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* TDS input */}
                  <div>
                    <Label className="text-xs">
                      {(() => {
                        const tdsRateMatch = (selectedInvoiceEntry?.notes || '').match(/TDS:\s*([\d.]+)%/);
                        return tdsRateMatch ? `TDS Deducted @ ${tdsRateMatch[1]}% (₹)` : 'TDS Deducted (₹)';
                      })()}
                    </Label>
                    <div className="relative mt-1.5">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                      <Input
                        type="number"
                        className="pl-7 h-10"
                        value={paymentForm.tdsDeducted}
                        onChange={(e) => {
                          const newTds = e.target.value;
                          const tds = parseFloat(newTds) || 0;
                          setPaymentForm(prev => {
                            // amountDue was computed net of the TDS currently in the form.
                            // Re-apply the delta so "Full Amount" stays net of the new TDS
                            // without double-counting. "Invoice Only" is total − new TDS.
                            const prevTds = parseFloat(prev.tdsDeducted) || 0;
                            const fullNet = Math.max(0, amountDue + prevTds - tds);
                            return {
                              ...prev,
                              tdsDeducted: newTds,
                              ...(prev.paymentType === 'full' ? { amountReceived: String(fullNet) } :
                                  prev.paymentType === 'invoice_only' ? { amountReceived: String(Math.max(0, (selectedInvoiceEntry?.total_amount || 0) - tds)) } : {})
                            };
                          });
                        }}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* Partial balance handling */}
                  {paymentForm.paymentType !== 'full' && (
                    <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-amber-700 dark:text-amber-300">Balance Remaining</span>
                        <span className="text-lg font-bold text-amber-800 dark:text-amber-200">
                          ₹{Math.max(0, amountDue - (parseFloat(paymentForm.amountReceived) || 0)).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div>
                        <Label className="text-xs">How to handle the balance?</Label>
                        <div className="grid grid-cols-2 gap-2 mt-1.5">
                          {[{ v: 'due_date', l: 'Set Due Date' }, { v: 'credit_note', l: 'Credit Note' }].map((opt) => (
                            <button
                              key={opt.v}
                              type="button"
                              onClick={() => setPaymentForm({ ...paymentForm, balanceHandling: opt.v })}
                              className={`px-2 py-1.5 rounded-md text-xs font-medium border transition-all ${
                                paymentForm.balanceHandling === opt.v
                                  ? 'bg-amber-600 text-white border-amber-600'
                                  : 'bg-white dark:bg-gray-900 border-amber-300 dark:border-amber-700 hover:bg-amber-100'
                              }`}
                            >
                              {opt.l}
                            </button>
                          ))}
                        </div>
                      </div>
                      {paymentForm.balanceHandling === 'due_date' && (
                        <div>
                          <Label className="text-xs">Balance Due Date</Label>
                          <Input type="date" className="mt-1.5 bg-white dark:bg-gray-900" value={paymentForm.balanceDueDate} onChange={(e) => setPaymentForm({ ...paymentForm, balanceDueDate: e.target.value })} />
                        </div>
                      )}
                      {paymentForm.balanceHandling === 'credit_note' && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">A credit note for the balance will be auto-created under Credit Notes.</p>
                      )}
                    </div>
                  )}

                  {/* Quick summary */}
                  <div className="rounded-lg border bg-muted/30 divide-y text-sm">
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-muted-foreground">Receiving Now</span>
                      <span className="font-semibold text-green-700">₹{(parseFloat(paymentForm.amountReceived) || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-muted-foreground">Via</span>
                      <span className="font-medium">{paymentForm.mode}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 border-t px-6 py-4 bg-muted/20">
                <Button variant="outline" onClick={() => setReceiveAmountOpen(false)}>Cancel</Button>
                <Button
                  className="bg-safend-red hover:bg-safend-red/90 text-white"
                  onClick={() => {
                    if (!selectedInvoiceEntry) return;
                    const amt = parseFloat(paymentForm.amountReceived);
                    if (isNaN(amt) || amt <= 0) {
                      toast({ title: "Invalid Amount", description: "Enter a valid amount", variant: "destructive" });
                      return;
                    }
                    if (paymentForm.mode === 'Cash' && !paymentForm.receivedBy) {
                      toast({ title: "Missing", description: "Select who received the cash", variant: "destructive" }); return;
                    }
                    if (paymentForm.mode === 'Cash' && paymentForm.receivedBy === '__third_party__' && !paymentForm.thirdPartyName) {
                      toast({ title: "Missing", description: "Enter the authorized person's name", variant: "destructive" }); return;
                    }
                    if (paymentForm.mode === 'Cheque' && (!paymentForm.receivedBy || !paymentForm.chequeNumber || !paymentForm.chequeDate)) {
                      toast({ title: "Missing", description: "Fill received by, cheque number and date", variant: "destructive" }); return;
                    }
                    if (paymentForm.mode === 'Cheque' && paymentForm.receivedBy === '__third_party__' && !paymentForm.thirdPartyName) {
                      toast({ title: "Missing", description: "Enter the authorized person's name", variant: "destructive" }); return;
                    }
                    if (paymentForm.mode === 'Bank Transfer' && (!paymentForm.bankAccountId || !paymentForm.transactionNumber)) {
                      toast({ title: "Missing", description: "Select bank account and enter transaction number", variant: "destructive" }); return;
                    }
                    if (paymentForm.paymentType !== 'full' && paymentForm.balanceHandling === 'due_date' && !paymentForm.balanceDueDate) {
                      toast({ title: "Missing", description: "Set the balance due date", variant: "destructive" }); return;
                    }
                    recordReceivedAmount.mutate({ entry: selectedInvoiceEntry, payment: paymentForm });
                  }}
                  disabled={recordReceivedAmount.isPending}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" /> {recordReceivedAmount.isPending ? 'Recording...' : 'Record Payment'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
