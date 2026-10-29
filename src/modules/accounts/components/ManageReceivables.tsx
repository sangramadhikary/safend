'use client';

import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
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
import { Plus, Search, IndianRupee, Loader2, Info, Eye, Download, Pencil, MoreVertical, Printer, XCircle, Mail, CheckCircle2, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, FileDown, ChevronLeft, ChevronRight, Copy, Trash2, ShieldAlert, Upload, Undo2, FileText, Send, Clock } from 'lucide-react';
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
import { ReceivePaymentDialog } from './ReceivePaymentDialog';
import { addNotification } from '@/services/supabase/NotificationService';
import { checkAndAssignOverdueCollections } from '@/services/collections/OverdueCollectionService';
import { type GstType } from '@/lib/tax/gst';
import { amountDue, amountReceived, invoiceBalance, isOverpaid, isPartlyPaid, outstandingAmount, sumMoney } from '@/lib/invoice/ledger';
import { buildInvoiceViewData, carriedReferenceNumbers, originalInvoiceLookup } from '@/lib/invoice/document-input';
import {
  cancelInvoice as cancelInvoiceRpc, deleteDraftInvoice, isDraftInvoice, undoLastReceipt,
} from '@/services/invoiceLedgerService';
import { auditActions, logAuditEvent, logChange } from '@/utils/auditLog';
import { formatINRShort, formatINR } from '@/lib/format';
import { getClientByName } from '@/services/supabase/ClientService';


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
  // Lifecycle: 'created' (just made) -> 'issued' (PDF downloaded) -> 'open'
  // (derived, one day on) -> 'overdue' (derived, past due date). 'received' and
  // 'cancelled' are terminal. 'pending' is kept for legacy rows and treated as
  // an unpaid/open state. 'open' and 'overdue' are runtime-derived only.
  status: 'created' | 'issued' | 'open' | 'pending' | 'received' | 'overdue' | 'cancelled';
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  /** Timestamp the invoice PDF was first downloaded (marks it "Issued"). */
  issued_at?: string | null;
  line_items?: InvoiceLineItem[] | null;
  adjustment_type?: 'credit' | 'debit' | null;
  gst_treatment?: 'forward' | 'rcm' | 'exempt' | null;
  /** Proper DB column — replaces notes string-sniffing for GST type */
  gst_type?: GstType | null;
  /** Proper DB column — the Place of Supply selected at invoice creation */
  place_of_supply?: string | null;
  /** Proper DB column — buyer GSTIN (null for unregistered buyers) */
  client_gstin?: string | null;
  service_period_start?: string | null;
  service_period_end?: string | null;
  invoice_snapshot?: unknown | null;
  /** DB column for previous outstanding balance */
  previous_balance?: number | null;
  /** Structured itemisation of the carried-forward previous balance (JSONB). */
  previous_balance_breakdown?: Array<{
    id?: string;
    referenceNumber?: string;
    reference_number?: string;
    date?: string | null;
    amount?: number;
  }> | null;
  // Ledger columns, maintained by the database from the payment allocations
  // (balance = total_amount + opening_balance − paid_amount).
  paid_amount?: number | null;
  tds_credited?: number | null;
  credit_applied?: number | null;
  opening_balance?: number | null;
  tds_rate?: number | null;
  work_order_id?: string | null;
  source?: string | null;
  cancel_reason?: string | null;
  promised_payment_date?: string | null;
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

// Categories without an Add button.
// - Payroll Receivables: auto-generated / live view.
// - All Receivables: an aggregate view across every category; there is no single
//   "entry" type to create here, so entries are added from their specific tab.
const NO_ADD_CATEGORIES = ['Payroll Receivables', 'All Receivables'];

/**
 * Resolves a human-readable invoice label for a receivable row.
 *
 * `reference_number` is nullable and legitimately null for several categories —
 * Event Letters always store null, while Taxes / Other Income / generic entries
 * only carry a reference when the user typed one. It must therefore never be
 * interpolated into a string directly: doing so is what produced the
 * "Invoice #null" text in admin delete-request notifications.
 *
 * Falls back to the legacy "Inv#: XXX" marker that imported records keep inside
 * `description`, then to a short form of the row id.
 */
const getInvoiceLabel = (
  entry: Pick<ReceivableEntry, 'id' | 'description' | 'reference_number'>
): string => {
  if (entry.reference_number) return entry.reference_number;
  const legacy = (entry.description || '')
    .split(' | ')
    .find((part) => part.startsWith('Inv#:'))
    ?.replace('Inv#: ', '')
    .trim();
  return legacy || entry.id.slice(0, 8);
};

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
  const [invoiceViewData, setInvoiceViewData] = useState<InvoiceData | null>(null);
  /** Invoice the Record Payment dialog is open for (null = closed). */
  const [receiveEntry, setReceiveEntry] = useState<ReceivableEntry | null>(null);
  /** Older invoices to tick in that dialog (bulk selection). */
  const [receivePreselect, setReceivePreselect] = useState<string[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<ReceivableEntry | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  /** Invoice the Cancel dialog is open for, and the reason being typed. */
  const [cancelEntry, setCancelEntry] = useState<ReceivableEntry | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // New: Status filter, sorting, pagination, bulk selection
  const [statusFilter, setStatusFilter] = useState<'all' | 'created' | 'issued' | 'open' | 'overdue' | 'received' | 'cancelled'>('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'this_fy'>('all');
  const [sortField, setSortField] = useState<'due_date' | 'total_amount' | 'status' | 'created_at'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const PAGE_SIZE = 100;

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
        .insert({ ...entry, status: 'created' })
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

  // cancel_invoice refuses an invoice with payments (undo them, or raise a
  // credit note) and logs the retired number; the row and number stay on file.
  const cancelInvoice = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const entry = receivables.find(r => r.id === id);
      await cancelInvoiceRpc(id, reason);

      // Cancelling voids an issued tax invoice, so the amount and client are
      // recorded explicitly — the row itself survives but its commercial meaning
      // is reversed.
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
          reason,
          invoiceNumberRetired: entry?.reference_number ?? null,
        },
        logUnchanged: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      setCancelEntry(null);
      setCancelReason('');
      toast({ title: "Invoice Cancelled", description: "The invoice stays on record as cancelled. Its number is retired, not reissued." });
    },
    onError: (error: any) => {
      toast({ title: "Not cancelled", description: error.message, variant: "destructive" });
    },
  });

  // undo_last_receipt reverses the whole latest receipt on this invoice: every
  // invoice it paid, the exact bank / cash / cheque entry it posted, and any
  // credit note it raised. Balances and statuses follow from the ledger.
  const undoLastPayment = useMutation({
    mutationFn: async (entry: ReceivableEntry) => {
      const result = await undoLastReceipt(entry.id);
      void logChange({
        action: 'accounts.payment.undo',
        target: entry.reference_number || entry.id,
        entityType: 'receivables',
        entityId: entry.id,
        entityLabel: `${entry.reference_number ?? entry.id} — ${entry.client_name ?? 'Unknown client'}`,
        severity: 'critical',
        before: { status: entry.status, amountOutstanding: amountDue(entry) },
        after: {},
        details: { clientName: entry.client_name, allocationRowsRemoved: result.removed, warnings: result.warnings },
        logUnchanged: true,
      });
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      toast({
        title: "Payment Undone",
        description: [
          result.removed > 1 ? `The receipt is reversed on all ${result.removed} invoice allocations it made.` : 'The last receipt is reversed.',
          ...(result.warnings ?? []),
        ].join(' '),
        variant: result.warnings?.length ? 'destructive' : 'default',
      });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to undo payment", variant: "destructive" });
    }
  });

  // Delete a never-issued, unpaid draft (admin only). Anything issued or paid is
  // cancelled instead; delete_draft_invoice enforces both and retires the number.
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

      // The database refuses anything issued or paid, logs the retired number
      // (never reissued) and closes pending delete requests for the row.
      await deleteDraftInvoice(entry.id, deleteReason.trim() || 'No reason given');

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
      toast({ title: "Draft Deleted", description: "The draft invoice is deleted. Its number is retired, not reissued; the gap in the sequence is intentional." });
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
            message: `${userName} requested to delete Invoice #${getInvoiceLabel(entry)} (${entry.client_name || 'Unknown'}, ₹${entry.total_amount.toLocaleString('en-IN')}). Reason: ${reason || 'Not specified'}`,
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

  const handleSendByMail = (entry: ReceivableEntry) => {
    const subject = encodeURIComponent(`Invoice ${entry.reference_number || entry.id.slice(0, 8)} - Safend Secure Solutions`);
    const body = encodeURIComponent(
      `Dear ${entry.client_name || 'Sir/Madam'},\n\n` +
      `Please find the invoice details below:\n\n` +
      `Invoice: ${entry.description}\n` +
      `Amount: ₹${entry.amount.toLocaleString('en-IN')}\n` +
      `GST: ₹${(entry.gst_amount || (entry.total_amount - entry.amount)).toLocaleString('en-IN')}\n` +
      `Total Amount: ₹${entry.total_amount.toLocaleString('en-IN')}\n` +
      (amountReceived(entry) > 0 ? `Received so far: ₹${amountReceived(entry).toLocaleString('en-IN')}\n` : '') +
      `Balance Due: ₹${amountDue(entry).toLocaleString('en-IN')}\n` +
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

  const openReceiveAmount = (entry: ReceivableEntry) => {
    setReceivePreselect([]);
    setReceiveEntry(entry);
  };

  const updateField = (key: string, value: string) => {
    setFormData(p => ({ ...p, [key]: value }));
  };

  // ─── FORM SUBMISSIONS ─────────────────────────────────────────────

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
      // Tax invoices are raised only through the invoice forms, which let the
      // database allocate the number (create_invoice).
      case 'Invoices': setShowAddForm(false); setRaiseInvoiceOpen(true); return;
      case 'Invoice Adjustments': return handleAdjustmentSubmit();
      case 'Event Letters': return handleEventLetterSubmit();
      case 'Taxes (ITC/TDS)': return handleTaxesSubmit();
      case 'Other Income': return handleOtherIncomeSubmit();
      default: return handleGenericSubmit();
    }
  };

  // ─── FORM RENDERERS ──────────────────────────────────────────────────

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
              {RECEIVABLE_CATEGORIES.filter(c => c !== 'Invoices').map(c => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
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
      case 'Invoices': return (
        <p className="text-sm text-muted-foreground">
          Tax invoices are raised with New Invoice, so each one gets the next number in sequence.
        </p>
      );
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
      case 'Invoices': return 'New Invoice';
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

  // Statuses that represent an unpaid invoice still moving through its lifecycle.
  // 'pending' is a legacy value kept for older rows; it behaves like 'created'.
  const UNPAID_STATUSES = ['created', 'issued', 'open', 'pending'] as const;

  // Determine effective status for display. Terminal states ('received',
  // 'cancelled') pass through unchanged. For unpaid invoices we derive the
  // lifecycle stage: Created -> Issued (PDF downloaded) -> Open (a day later)
  // -> Overdue (past the due date).
  const getEffectiveStatus = (entry: ReceivableEntry): ReceivableEntry['status'] => {
    if (entry.status === 'received' || entry.status === 'cancelled') return entry.status;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Past the due date and still unpaid -> Overdue.
    if (entry.due_date) {
      const due = new Date(entry.due_date);
      due.setHours(0, 0, 0, 0);
      if (due < today) return 'overdue';
    }

    // Age the invoice one day past its issue/creation point -> Open.
    const startRef = entry.issued_at || entry.created_at;
    if (startRef) {
      const start = new Date(startRef);
      start.setHours(0, 0, 0, 0);
      const ageDays = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (ageDays >= 1) return 'open';
    }

    // Within the first day: Issued if the PDF was downloaded, otherwise Created.
    if (entry.status === 'issued' || entry.issued_at) return 'issued';
    return 'created';
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
    } else if (periodFilter === 'last_month') {
      periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
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
      // Status filter — compares against the derived lifecycle status.
      if (statusFilter !== 'all') {
        if (getEffectiveStatus(r) !== statusFilter) return false;
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
  }, [receivables, searchTerm, statusFilter, periodFilter, sortField, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredReceivables.length / PAGE_SIZE));
  const paginatedReceivables = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredReceivables.slice(start, start + PAGE_SIZE);
  }, [filteredReceivables, currentPage]);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [searchTerm, statusFilter, periodFilter, filter]);

  // Summary totals from the ledger columns (paid_amount etc.), never from notes.
  // Outstanding nets open credit notes off; received counts cash + TDS.
  const {
    totalPending, totalOverdue, totalReceived,
    overdueCount, unpaidCount, receivedCount, collectionRate,
  } = useMemo(() => {
    const outstanding: number[] = [];
    const overdueDue: number[] = [];
    const receivedAmounts: number[] = [];
    let oCount = 0;   // overdue items still owing
    let uCount = 0;   // items still owing
    let rCount = 0;   // settled items

    receivables.forEach(r => {
      if (r.status === 'cancelled') return;
      receivedAmounts.push(amountReceived(r));
      if (r.status === 'received') { rCount += 1; return; }
      outstanding.push(outstandingAmount(r));
      if (amountDue(r) > 0.01) {
        uCount += 1;
        if (getEffectiveStatus(r) === 'overdue') {
          overdueDue.push(amountDue(r));
          oCount += 1;
        }
      }
    });
    const pending = sumMoney(outstanding);
    const overdue = sumMoney(overdueDue);
    const received = sumMoney(receivedAmounts);

    // Collected as a share of everything billed (received + still owed).
    const billed = received + pending;
    const rate = billed > 0 ? Math.round((received / billed) * 100) : 0;

    return {
      totalPending: pending, totalOverdue: overdue, totalReceived: received,
      overdueCount: oCount, unpaidCount: uCount, receivedCount: rCount, collectionRate: rate,
    };
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
    try {
      const data = await buildInvoiceData(entry);
      setInvoiceViewData(data);
      setInvoiceViewOpen(true);
    } catch (err: any) {
      toast({ title: 'Could not open the invoice', description: err?.message, variant: 'destructive' });
    }
  };

  const handleEditInvoice = (entry: ReceivableEntry) => {
    setSelectedInvoiceEntry(entry);
    setInvoiceEditOpen(true);
  };

  // The View renders through the same builder as the PDF route, so both show
  // the stored figures and the same live statement of account.
  const buildInvoiceData = async (entry: ReceivableEntry): Promise<InvoiceData> => {
    const { data: payments, error: payErr } = await supabaseClient
      .from('receivable_payments')
      .select('*')
      .eq('receivable_id', entry.id)
      .order('created_at', { ascending: true });
    if (payErr) throw new Error(`Could not load the payments of this invoice: ${payErr.message}`);
    // Older invoices this one lists as previous dues, at their live balances.
    const refs = carriedReferenceNumbers(entry);
    let carried: Record<string, any>[] = [];
    if (refs.length > 0 && entry.work_order_id) {
      const { data, error } = await supabaseClient
        .from('receivables')
        .select('*')
        .eq('category', 'Invoices')
        .eq('work_order_id', entry.work_order_id)
        .in('reference_number', refs);
      if (error) throw new Error(`Could not load the earlier invoices: ${error.message}`);
      carried = data ?? [];
    }
    // A credit/debit note prints the number and date of its original invoice.
    const lookup = originalInvoiceLookup(entry);
    let original: Record<string, any> | null = null;
    if (lookup) {
      let q = supabaseClient.from('receivables').select('*').eq('category', 'Invoices');
      q = 'id' in lookup
        ? q.eq('id', lookup.id)
        : q.eq('reference_number', lookup.referenceNumber).eq('client_name', lookup.clientName);
      const { data, error } = await q.limit(1).maybeSingle();
      if (error) throw new Error(`Could not load the original invoice: ${error.message}`);
      original = data ?? null;
    }
    return buildInvoiceViewData(entry, payments ?? [], carried, { original });
  };

  /**
   * Open Outlook (or the system default mail client) with the invoice details
   * pre-filled: To (client contact email), Subject, and a detailed plain-text body.
   * The invoice PDF must be downloaded separately via "Download" and attached
   * manually — browsers cannot attach files to mailto: links.
   */
  const handleEmailInvoice = async (entry: ReceivableEntry) => {
    const invoiceNo = entry.reference_number || entry.id.slice(0, 8);

    // ── Amounts ────────────────────────────────────────────────────────────
    const fmt = (n: number | null | undefined) =>
      n != null ? `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;

    const taxableAmt  = fmt(entry.amount);
    const gstAmt      = fmt(entry.gst_amount);
    const totalAmt    = fmt(entry.total_amount);

    // ── Dates ──────────────────────────────────────────────────────────────
    const fmtDate = (d: string | null | undefined) =>
      d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : null;

    const invoiceDate = fmtDate(entry.created_at);
    const dueDate     = fmtDate(entry.due_date);

    // ── Service period ─────────────────────────────────────────────────────
    let servicePeriod: string | null = null;
    if (entry.service_period_start) {
      servicePeriod = fmtDate(entry.service_period_start) ?? '';
      if (entry.service_period_end) servicePeriod += ` to ${fmtDate(entry.service_period_end) ?? ''}`;
    }

    // ── Look up contact email (non-blocking) ───────────────────────────────
    let toEmail = '';
    try {
      const client = entry.client_name ? await getClientByName(entry.client_name) : null;
      toEmail = (client?.contactEmail || '').trim();
    } catch { /* leave blank */ }

    // ── Subject ────────────────────────────────────────────────────────────
    const subject = `Invoice No. ${invoiceNo} | ${entry.client_name || 'Client'} | ${totalAmt ?? ''} | Safend Secure Solutions Pvt. Ltd.`;

    // ── Body ───────────────────────────────────────────────────────────────
    const lines = [
      `Dear Sir / Madam,`,
      ``,
      `Please find attached Invoice No. ${invoiceNo}${servicePeriod ? ` for the service period ${servicePeriod}` : ''}.`,
      ``,
      `  Invoice No.   : ${invoiceNo}`,
      invoiceDate   ? `  Invoice Date  : ${invoiceDate}` : null,
      dueDate       ? `  Due Date      : ${dueDate}` : null,
      servicePeriod ? `  Period        : ${servicePeriod}` : null,
      taxableAmt    ? `  Taxable Value : ${taxableAmt}` : null,
      gstAmt        ? `  GST           : ${gstAmt}` : null,
      totalAmt      ? `  Total Amount  : ${totalAmt}` : null,
      amountReceived(entry) > 0 ? `  Received      : ${fmt(amountReceived(entry))}` : null,
      amountReceived(entry) > 0 ? `  Balance Due   : ${fmt(amountDue(entry))}` : null,
      ``,
      dueDate
        ? `Kindly arrange payment of ${fmt(amountDue(entry)) ?? 'the invoice amount'} on or before ${dueDate}.`
        : `Kindly arrange payment at the earliest.`,
      `Please share the UTR / transaction reference to accounts@safends.com after payment.`,
      `TDS deducted (if any) under Section 194C should be deposited against PAN ABDCS8727K.`,
      ``,
      `PAYMENT DETAILS`,
      `  Bank: Axis Bank  |  A/C: 921020000544081  |  IFSC: UTIB0000091`,
      `  Beneficiary: Safend Secure Solutions Private Limited`,
      ``,
      `MSME NOTICE — Udyam Reg. No. UDYAM-OD-07-0000118 (MSMED Act, 2006)`,
      `Payment must be made within 45 days of acceptance (Section 15). Delayed payment`,
      `attracts compound interest at 3× RBI Bank Rate (Section 16) and may result in a`,
      `complaint on the MSME Samadhaan portal (samadhaan.msme.gov.in).`,
      ``,
      `Regards,`,
      `Accounts Department — Safend Secure Solutions Private Limited`,
      `accounts@safends.com  |  GSTIN: 21ABDCS8727K1Z4  |  PAN: ABDCS8727K`,
    ].filter((l): l is string => l !== null);

    const mailto = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
    window.open(mailto, '_blank');
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
      const docLabel = entry.category === 'Invoice Adjustments'
        ? (entry.adjustment_type === 'debit' || (entry.adjustment_type == null && entry.total_amount > 0) ? 'DebitNote' : 'CreditNote')
        : 'Invoice';
      const fileName = `${docLabel}_${(entry.reference_number || entry.id.slice(0, 8)).replace(/[\\/:*?"<>|]+/g, '-')}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: 'PDF Downloaded', description: fileName });
      // Downloading marks the invoice "Issued" server-side; refresh so the
      // status badge reflects the new lifecycle stage.
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to generate PDF', variant: 'destructive' });
    }
  };

  const getStatusBadge = (entry: ReceivableEntry) => {
    const effective = getEffectiveStatus(entry);
    const daysOver = getDaysOverdue(entry);
    const dueToday = isDueToday(entry);

    // Detect partial payment from notes (contains "Mode:" when payment was recorded)
    // Shared badge styling: pill-shaped, no text wrap, consistent padding and
    // icon spacing so every status reads clean and roomy (no cramped two-line wrap).
    const base = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium border';

    // A legacy receipt that paid older invoices through this one shows as an
    // overpayment until supabase/scripts/20261029_reallocate_legacy_carry_forward.sql re-attributes it.
    if (isOverpaid(entry)) {
      return (
        <Badge className={`${base} bg-amber-100 hover:bg-amber-100 text-amber-800 border-amber-300`}
          title="More was recorded on this invoice than it owes. Accounts should re-attribute the receipt to the older invoices it paid.">
          <AlertTriangle className="h-3 w-3 shrink-0" />Overpaid ₹{Math.abs(invoiceBalance(entry)).toLocaleString('en-IN')}
        </Badge>
      );
    }
    // Part payment (from the ledger) overrides the lifecycle label of an unpaid invoice.
    if (isPartlyPaid(entry) && entry.status !== 'cancelled') {
      return (
        <Badge className={`${base} bg-blue-500 hover:bg-blue-500 text-white border-transparent`} title={`₹${amountDue(entry).toLocaleString('en-IN')} still due`}>
          Part paid{effective === 'overdue' && daysOver > 0 ? ` · ${daysOver}d overdue` : ''}
        </Badge>
      );
    }

    switch (effective) {
      case 'received': return (
        <Badge className={`${base} bg-green-500 hover:bg-green-500 text-white border-transparent`}>
          <CheckCircle2 className="h-3 w-3 shrink-0" />Received
        </Badge>
      );
      case 'overdue': return (
        <Badge className={`${base} bg-red-600 hover:bg-red-600 text-white border-red-700`}>
          <AlertTriangle className="h-3 w-3 shrink-0" />Overdue{daysOver > 0 ? ` · ${daysOver}d` : ''}
        </Badge>
      );
      case 'open':
        return (
          <Badge className={`${base} text-white ${dueToday ? 'bg-orange-500 hover:bg-orange-500 border-orange-600' : 'bg-amber-500 hover:bg-amber-500 border-transparent'}`}>
            {dueToday ? <AlertTriangle className="h-3 w-3 shrink-0" /> : <Clock className="h-3 w-3 shrink-0" />}
            {dueToday ? 'Due Today' : 'Open'}
          </Badge>
        );
      case 'issued': return (
        <Badge className={`${base} bg-sky-500 hover:bg-sky-500 text-white border-transparent`}>
          <Send className="h-3 w-3 shrink-0" />Issued
        </Badge>
      );
      case 'created':
      case 'pending': return (
        <Badge className={`${base} bg-slate-500 hover:bg-slate-500 text-white border-transparent`}>
          <FileText className="h-3 w-3 shrink-0" />Created
        </Badge>
      );
      case 'cancelled': return (
        <Badge className={`${base} bg-gray-500 hover:bg-gray-500 text-white border-transparent`}>
          <XCircle className="h-3 w-3 shrink-0" />Cancelled
        </Badge>
      );
      default: return <Badge variant="secondary" className={base}>{effective}</Badge>;
    }
  };

  return (
    // Fill the module's scroll region (h-[calc(100vh-200px)]) minus this panel's
    // p-6 padding (~3rem), so the header/cards/filters stay fixed and only the
    // table rows scroll — the page itself does not scroll.
    <div className="flex flex-col h-[calc(100vh-248px)] min-h-0 gap-3">
      {/* Header with title + actions */}
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-xl font-bold leading-tight">{filter === 'All Receivables' ? 'All Receivables' : filter}</h2>
          <p className="text-xs text-muted-foreground">{getCategoryDescription()}</p>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 shrink-0">
        {/* Outstanding receivable — money still owed by clients */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('all')}>
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground">Outstanding Receivable</p>
            <p className="text-lg font-bold text-amber-600 leading-tight" title={`₹${totalPending.toLocaleString('en-IN')}`}>{formatINRShort(totalPending)}</p>
            <p className="text-[11px] text-muted-foreground">
              {unpaidCount} unpaid invoice{unpaidCount !== 1 ? 's' : ''}
              {totalOverdue > 0 && <span className="text-red-600"> · {formatINRShort(totalOverdue)} overdue</span>}
            </p>
          </CardContent>
        </Card>
        {/* Overdue — past due date and unpaid */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('overdue')}>
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground">Overdue (Past Due)</p>
            <p className="text-lg font-bold text-red-600 leading-tight" title={`₹${totalOverdue.toLocaleString('en-IN')}`}>{formatINRShort(totalOverdue)}</p>
            <p className="text-[11px] text-muted-foreground">
              {overdueCount} of {unpaidCount} unpaid
              {/* Share of the outstanding amount (₹) that is overdue, not of the invoice count. */}
              {totalPending > 0 && <span> · {Math.round((totalOverdue / totalPending) * 100)}% of outstanding</span>}
            </p>
          </CardContent>
        </Card>
        {/* Collected — payments received against invoices */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter('received')}>
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground">Collected (Received)</p>
            <p className="text-lg font-bold text-green-600 leading-tight" title={`₹${totalReceived.toLocaleString('en-IN')}`}>{formatINRShort(totalReceived)}</p>
            <p className="text-[11px] text-muted-foreground">{collectionRate}% collection rate</p>
          </CardContent>
        </Card>
        {/* Total billed value + invoice counts */}
        <Card>
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground">Total Invoiced</p>
            <p className="text-lg font-bold leading-tight" title={`₹${(totalReceived + totalPending).toLocaleString('en-IN')}`}>{formatINRShort(totalReceived + totalPending)}</p>
            <p className="text-[11px] text-muted-foreground">{receivables.length} invoices · {filteredReceivables.length} shown</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters Row: Search + Period + Status */}
      <div className="space-y-2 shrink-0">
        {/* Period filter */}
        <div className="flex items-center gap-1.5">
          {([
            { key: 'all', label: 'All Invoices' },
            { key: 'this_month', label: 'This Month' },
            { key: 'last_month', label: 'Last Month' },
            { key: 'this_quarter', label: 'This Quarter' },
            { key: 'this_year', label: 'This Year' },
            { key: 'this_fy', label: 'This Financial Year' },
          ] as const).map(({ key, label }) => (
            <Button
              key={key}
              size="sm"
              variant={periodFilter === key ? 'default' : 'outline'}
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
            {(['all', 'created', 'issued', 'open', 'overdue', 'received', 'cancelled'] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? 'default' : 'outline'}
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
                // One receipt for several invoices of ONE work order: recorded against
                // the newest, with the others ticked so they are paid first.
                const entries = receivables
                  .filter(r => selectedIds.has(r.id) && r.category === 'Invoices' && amountDue(r) > 0.01)
                  .sort((a, b) => a.created_at.localeCompare(b.created_at));
                if (entries.length === 0) { toast({ title: 'No selected invoice still owes money', variant: 'destructive' }); return; }
                // An invoice without a work order is its own group, so it can only be paid alone.
                const workOrders = new Set(entries.map(r => r.work_order_id ?? null));
                if (workOrders.size > 1 || (workOrders.has(null) && entries.length > 1)) {
                  toast({ title: 'Select invoices of one work order', description: 'A receipt is applied within one work order.', variant: 'destructive' });
                  return;
                }
                const target = entries[entries.length - 1];
                setReceivePreselect(entries.slice(0, -1).map(r => r.id));
                setReceiveEntry(target);
              }}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Record Payment
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs text-red-600" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Table — fills remaining height; only the rows scroll, the column header
          stays pinned. Everything above stays fixed (no whole-page scroll). */}
      <Card className="flex-1 min-h-0 flex flex-col">
        <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
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
            <Table containerClassName="flex-1 min-h-0" className="[&_th]:h-9 [&_td]:py-2 [&_th]:py-2">
              <TableHeader className="sticky top-0 z-20 bg-background [&_tr]:border-b [&_th]:bg-background">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allOnPageSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                  </TableHead>
                  <TableHead>Invoice No.</TableHead>
                  <TableHead>Invoice Date</TableHead>
                  <TableHead className="min-w-[120px]">Client Name</TableHead>
                  <TableHead>Post Name</TableHead>
                  {filter === 'All Receivables' && <TableHead>Category</TableHead>}
                  <TableHead className="text-right cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('total_amount')}>
                    <span className="inline-flex items-center">Invoice Amount{getSortIcon('total_amount')}</span>
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">Balance Due</TableHead>
                  <TableHead className="text-right whitespace-nowrap">GST</TableHead>
                  <TableHead className="text-right cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort('due_date')}>
                    <span className="inline-flex items-center">Due Date{getSortIcon('due_date')}</span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none whitespace-nowrap min-w-[120px]" onClick={() => handleSort('status')}>
                    <span className="inline-flex items-center">Status{getSortIcon('status')}</span>
                  </TableHead>
                  <TableHead className="text-right w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedReceivables.map((entry) => {
                  const effective = getEffectiveStatus(entry);
                  const invoiceNum = getInvoiceLabel(entry);
                  // Derive the post name (deployment post) for the row.
                  // Prefer explicit `post` values on line items; fall back to the
                  // description with the "| Inv#: XXX" suffix stripped. Ignore the
                  // auto-generated "N services" label since it is not a post name.
                  const postName = (() => {
                    if (entry.line_items && entry.line_items.length > 0) {
                      const posts = [...new Set(
                        entry.line_items
                          .map((li: any) => (li.post || '').trim())
                          .filter(Boolean)
                      )];
                      if (posts.length === 1) return posts[0];
                      if (posts.length > 1) {
                        return posts.length <= 2
                          ? posts.join(', ')
                          : `${posts[0]}, ${posts[1]} +${posts.length - 2} more`;
                      }
                    }
                    const rawPostName = (entry.description || '')
                      .replace(/\s*\|\s*Inv#:.*$/i, '')
                      .trim();
                    if (/^\d+\s+services?$/i.test(rawPostName)) return '—';
                    return rawPostName || '—';
                  })();
                  return (
                    <TableRow
                      key={entry.id}
                      className={`hover:bg-muted/50 transition-colors cursor-pointer ${effective === 'overdue' ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}
                      onClick={(e) => {
                        // Don't open if clicking checkbox, dropdown, or button
                        const target = e.target as HTMLElement;
                        if (target.closest('button') || target.closest('[role="checkbox"]') || target.closest('[data-radix-collection-item]')) return;
                        if (entry.category === 'Invoices' || entry.category === 'Invoice Adjustments') handleViewInvoice(entry);
                      }}
                    >
                      <TableCell>
                        <Checkbox checked={selectedIds.has(entry.id)} onCheckedChange={() => toggleSelect(entry.id)} aria-label={`Select ${entry.description}`} />
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{invoiceNum}</TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">{new Date(entry.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</TableCell>
                      <TableCell>{entry.client_name || '—'}</TableCell>
                      <TableCell>{postName}</TableCell>
                      {filter === 'All Receivables' && <TableCell><Badge variant="outline" className="text-xs">{entry.category}</Badge></TableCell>}
                      <TableCell className="text-right font-medium tabular-nums">₹{entry.total_amount.toLocaleString('en-IN')}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(() => {
                          // Live balance from the ledger: total + opening balance − paid.
                          const due = amountDue(entry);
                          if (entry.status === 'cancelled') return <span className="text-muted-foreground">—</span>;
                          if (due <= 0.01) return <span className="text-muted-foreground">₹0</span>;
                          return (
                            <span className={amountReceived(entry) > 0 ? 'font-medium text-blue-700' : ''}
                              title={amountReceived(entry) > 0 ? `₹${amountReceived(entry).toLocaleString('en-IN')} received so far` : undefined}>
                              ₹{due.toLocaleString('en-IN')}
                            </span>
                          );
                        })()}
                      </TableCell>
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
                      <TableCell className="whitespace-nowrap">{getStatusBadge(entry)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[264px] p-2">
                            {/* Primary actions as a 3-wide icon grid (icon on top,
                                label below). Rows flow naturally 3 per line, so
                                6 actions read as a 2-row × 3-col grid. */}
                            {(() => {
                              const tiles: Array<{ key: string; icon: ReactNode; label: string; onClick: () => void }> = [];
                              // Credit and debit notes have their own document (CREDIT NOTE / DEBIT NOTE).
                              if (entry.category === 'Invoices' || entry.category === 'Invoice Adjustments') {
                                tiles.push({ key: 'view', icon: <Eye className="h-5 w-5 text-blue-600" />, label: 'View', onClick: () => handleViewInvoice(entry) });
                                tiles.push({ key: 'download', icon: <Download className="h-5 w-5 text-green-600" />, label: 'Download', onClick: () => handleDownloadInvoice(entry) });
                              }
                              if (entry.category === 'Invoices') {
                                // Issued or paid invoices are frozen; corrections go by cancellation or credit/debit note.
                                if (isDraftInvoice(entry)) {
                                  tiles.push({ key: 'edit', icon: <Pencil className="h-5 w-5 text-amber-600" />, label: 'Edit Draft', onClick: () => handleEditInvoice(entry) });
                                }
                              }
                              if (entry.status !== 'received' && entry.status !== 'cancelled' && amountDue(entry) > 0.01) {
                                tiles.push({ key: 'pay', icon: <CheckCircle2 className="h-5 w-5 text-green-600" />, label: 'Record Payment', onClick: () => openReceiveAmount(entry) });
                              }
                              tiles.push({ key: 'duplicate', icon: <Copy className="h-5 w-5 text-indigo-600" />, label: 'Duplicate', onClick: () => handleDuplicate(entry) });
                              if (entry.category === 'Invoices' || entry.category === 'Invoice Adjustments') {
                                tiles.push({ key: 'print', icon: <Printer className="h-5 w-5 text-blue-600" />, label: 'Print', onClick: () => handleDownloadInvoice(entry) });
                              }
                              if (entry.category === 'Invoices') {
                                tiles.push({ key: 'email', icon: <Send className="h-5 w-5 text-teal-600" />, label: 'Send Email', onClick: () => handleEmailInvoice(entry) });
                              }
                              tiles.push({ key: 'reminder', icon: <Mail className="h-5 w-5 text-purple-600" />, label: 'Reminder', onClick: () => handleSendByMail(entry) });
                              return (
                                <div className="grid grid-cols-3 gap-1">
                                  {tiles.map((t) => (
                                    <DropdownMenuItem
                                      key={t.key}
                                      onClick={t.onClick}
                                      className="flex flex-col items-center justify-center gap-1.5 h-16 rounded-md p-1 text-center cursor-pointer focus:bg-muted"
                                    >
                                      {t.icon}
                                      <span className="text-[11px] leading-tight text-foreground">{t.label}</span>
                                    </DropdownMenuItem>
                                  ))}
                                </div>
                              );
                            })()}

                            {/* Destructive / state actions stay as clearly-labelled full-width rows. */}
                            {Number(entry.paid_amount) > 0 && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-amber-600 focus:text-white focus:bg-amber-600"
                                  onClick={() => {
                                    if (window.confirm("Undo the last receipt on this invoice? The whole receipt is reversed: every invoice it paid, its bank, cheque or cash entry, and any credit note it raised.")) {
                                      undoLastPayment.mutate(entry);
                                    }
                                  }}
                                >
                                  <Undo2 className="h-4 w-4 mr-2" /> Undo Last Payment
                                </DropdownMenuItem>
                              </>
                            )}
                            {/* Cancel needs no payments on record (undo them, or write the balance off by credit note). */}
                            {entry.status !== 'cancelled' && !(Number(entry.paid_amount) > 0) && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-600 focus:text-white focus:bg-red-600" onClick={() => { setCancelReason(''); setCancelEntry(entry); }}>
                                  <XCircle className="h-4 w-4 mr-2" /> Cancel
                                </DropdownMenuItem>
                              </>
                            )}
                            {/* Only a never-issued, unpaid draft can be deleted; everything else is cancelled. */}
                            {(isDraftInvoice(entry) || !['Invoices', 'Invoice Adjustments'].includes(entry.category))
                              && !(Number(entry.paid_amount) > 0) && entry.status !== 'cancelled' && (isAdmin ? (
                              <DropdownMenuItem className="text-red-700 focus:text-white focus:bg-red-600 font-medium" onClick={() => { setEntryToDelete(entry); setDeleteConfirmOpen(true); }}>
                                <Trash2 className="h-4 w-4 mr-2" /> {entry.category === 'Invoices' ? 'Delete Draft' : 'Delete Entry'}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem className="text-red-600 focus:text-white focus:bg-red-600" onClick={() => { setEntryToDelete(entry); setDeleteConfirmOpen(true); }}>
                                <Trash2 className="h-4 w-4 mr-2" /> Request Delete
                              </DropdownMenuItem>
                            ))}
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
                    <Button key={page} size="sm" variant={currentPage === page ? 'default' : 'outline'} className="h-8 w-8 p-0" onClick={() => setCurrentPage(page)}>
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
                  ? <>This will <span className="font-semibold text-red-600">permanently delete</span> this draft. Only drafts that were never issued or paid can be deleted; anything else must be cancelled.</>
                  : <>Your delete request will be sent to an admin. A draft is deleted on approval; an issued invoice is cancelled instead and keeps its number.</>
                }
              </p>
              <div className="p-3 rounded-lg border bg-muted/30 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice No:</span>
                  <span className="font-mono font-medium">{getInvoiceLabel(entryToDelete)}</span>
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

              {isAdmin && entryToDelete.reference_number && (
                <p className="text-xs text-blue-700 bg-blue-50 dark:bg-blue-950/20 p-2 rounded border border-blue-200 dark:border-blue-800">
                  Invoice number <span className="font-mono font-semibold">{entryToDelete.reference_number}</span> will be retired, not reissued — it will leave an intentional gap in the sequence.
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


      {/* Record Payment: one receipt, allocated oldest invoice first (record_receipt) */}
      <ReceivePaymentDialog
        key={receiveEntry?.id ?? 'closed'}
        entry={receiveEntry}
        preselectIds={receivePreselect}
        bankAccounts={bankAccounts}
        staffUsers={staffUsers}
        onClose={() => setReceiveEntry(null)}
        onRecorded={() => {
          setReceiveEntry(null);
          setSelectedIds(new Set());
          queryClient.invalidateQueries({ queryKey: ['receivables'] });
        }}
      />

      {/* Cancel Invoice: reason required; the row and its number stay on file */}
      <Dialog open={!!cancelEntry} onOpenChange={(v) => { if (!v) { setCancelEntry(null); setCancelReason(''); } }}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="h-5 w-5" /> Cancel {cancelEntry ? getInvoiceLabel(cancelEntry) : ''}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The invoice stays on record as cancelled and its number is not reused. To correct an invoice that was
            sent to the client, cancel it and raise a new one, or raise a credit or debit note.
          </p>
          <div className="space-y-1">
            <Label className="text-sm">Reason for cancelling *</Label>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} placeholder="e.g. Raised twice by mistake" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelEntry(null); setCancelReason(''); }}>Keep Invoice</Button>
            <Button variant="destructive" disabled={!cancelReason.trim() || cancelInvoice.isPending}
              onClick={() => cancelEntry && cancelInvoice.mutate({ id: cancelEntry.id, reason: cancelReason.trim() })}>
              {cancelInvoice.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
              Cancel Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
