'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Search, Download, IndianRupee, Loader2, Info, ShoppingCart, CheckCircle, XCircle, Clock, Banknote, FileText, ArrowRight, Upload, ChevronDown, ChevronRight, Undo2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';
import { applyBranchScope, getBranchScopeFilter, onBranchScopeChange } from '@/utils/branchScope';
import { useToast } from '@/hooks/use-toast';
import { MessFundRequestsSection } from './MessFundRequestsSection';
import { SalaryApprovalsSection } from './SalaryApprovalsSection';
import { useVendorStore } from '@/modules/office-admin/components/vendors/vendorStore';
import { PO_STATUS_LABELS, PurchaseOrder } from '@/modules/office-admin/components/vendors/types';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { PAYABLE_CATEGORIES, NO_ADD_CATEGORIES } from '@/modules/accounts/constants/payableCategories';

interface PayablesProps {
  filter: string;
}

interface PayableEntry {
  id: string;
  category: string;
  description: string;
  vendor_name: string | null;
  amount: number;
  gst_amount: number | null;
  total_amount: number;
  due_date: string | null;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  payment_mode: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
}

// PAYABLE_CATEGORIES / NO_ADD_CATEGORIES live in the shared constants module and
// are mirrored by the payables_category_check DB constraint — keep them in sync.

export function ManagePayables({ filter }: PayablesProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});

  // PO Approvals + invoices (Vendor & Supplies only)
  const { purchaseOrders, isLoadingPOs, fetchPurchaseOrders, updatePOStatus, revokePOApproval } = useVendorStore();
  const [processingPO, setProcessingPO] = useState<string | null>(null);
  const [expandedPO, setExpandedPO] = useState<string | null>(null);
  // PO whose approval the user is about to undo (drives the confirm dialog).
  const [undoApprovalPO, setUndoApprovalPO] = useState<PurchaseOrder | null>(null);

  // The vendor store is plain in-memory zustand with no fetch-on-read, and this
  // screen previously never populated it. That made the approvals table appear
  // empty on any direct load of Accounts — it only had rows if the user happened
  // to open Office Admin (which does fetch) earlier in the same page session.
  useEffect(() => {
    if (filter !== 'Vendor & Supplies') return;
    fetchPurchaseOrders();
    return onBranchScopeChange(() => fetchPurchaseOrders());
  }, [filter, fetchPurchaseOrders]);

  const pendingPOs = purchaseOrders.filter(po =>
    ['submitted', 'pending_approval', 'approved', 'slip_generated'].includes(po.status)
  );
  const poWithInvoice = purchaseOrders.filter(po =>
    po.invoice_number && ['ordered', 'partially_received', 'received', 'completed'].includes(po.status)
  );

  const handleApprovePO = async (id: string) => {
    setProcessingPO(id);
    const r = await updatePOStatus(id, 'approved', { approved_by: 'accounts' });
    setProcessingPO(null);
    if (r.success) toast({ title: 'PO Approved' });
    else toast({ title: 'Error', description: r.error, variant: 'destructive' });
  };
  const handleRejectPO = async (id: string) => {
    setProcessingPO(id);
    const r = await updatePOStatus(id, 'rejected', { rejection_reason: 'Rejected by Accounts', approved_by: 'accounts' });
    setProcessingPO(null);
    if (r.success) toast({ title: 'PO Rejected' });
    else toast({ title: 'Error', description: r.error, variant: 'destructive' });
  };
  const handleMarkFunded = async (id: string) => {
    setProcessingPO(id);
    const r = await updatePOStatus(id, 'funded');
    setProcessingPO(null);
    if (r.success) toast({ title: 'Marked as Funded', description: 'Payment confirmed.' });
    else toast({ title: 'Error', description: r.error, variant: 'destructive' });
  };
  const handleUndoApproval = async () => {
    const po = undoApprovalPO;
    if (!po) return;
    const hadSlip = !!po.slip_number;
    setProcessingPO(po.id);
    const r = await revokePOApproval(po.id);
    setProcessingPO(null);
    setUndoApprovalPO(null);
    if (r.success) {
      toast({
        title: 'Approval Undone',
        description: hadSlip
          ? `${po.po_number} is back to Submitted and its fund slip has been voided.`
          : `${po.po_number} is back to Submitted, awaiting approval.`,
      });
    } else {
      toast({ title: 'Error', description: r.error, variant: 'destructive' });
    }
  };

  // Fetch payables from Supabase
  const { data: payables = [], isLoading } = useQuery<PayableEntry[]>({
    queryKey: ['payables', filter, getBranchScopeFilter()],
    queryFn: async () => {
      let query = supabaseClient
        .from('payables')
        .select('*')
        .order('created_at', { ascending: false });

      if (filter && filter !== 'All') {
        query = query.eq('category', filter);
      }
      query = applyBranchScope(query);

      const { data, error } = await query;
      if (error) {
        console.warn('Payables table not found, showing empty state');
        return [];
      }
      return (data ?? []) as PayableEntry[];
    },
  });

  // Create payable mutation
  const createPayable = useMutation({
    mutationFn: async (entry: Omit<PayableEntry, 'id' | 'created_at' | 'status'>) => {
      const { data, error } = await supabaseClient
        .from('payables')
        .insert({ ...entry, status: 'pending' })
        .select()
        .single();
      if (error) throw new Error(error.message);

      // If payment mode is Cheque, auto-create entry in cheque_register for tracking
      if (entry.payment_mode === 'Cheque' && entry.reference_number) {
        try {
          const { getBranchScope } = await import('@/utils/branchScope');
          const scope = getBranchScope();
          await supabaseClient.from('cheque_register').insert({
            cheque_number: entry.reference_number,
            type: 'issued',
            amount: entry.total_amount,
            issue_date: entry.due_date || new Date().toISOString().split('T')[0],
            party_name: entry.description?.split('|')[0]?.trim() || 'Vendor',
            purpose: entry.description || entry.category,
            status: 'pending',
            branch_id: scope.id || null,
          });
        } catch (e) { /* cheque_register table may not exist — continue */ }
      }

      // If payment mode is Cash, auto-create entry in cash_register for petty cash tracking
      if (entry.payment_mode === 'Cash') {
        try {
          const { getBranchScope } = await import('@/utils/branchScope');
          const scope = getBranchScope();
          await supabaseClient.from('cash_register').insert({
            transaction_date: entry.due_date || new Date().toISOString().split('T')[0],
            type: 'cash_out',
            amount: entry.total_amount,
            category: entry.category || 'other',
            description: entry.description || 'Payment',
            paid_to: entry.description?.split('|')[0]?.trim() || 'Vendor',
            voucher_number: entry.reference_number || null,
            branch_id: scope.id || null,
          });
        } catch (e) { /* cash_register table may not exist — continue */ }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      setShowAddForm(false);
      setFormData({});
      toast({ title: "Entry Added", description: "Payable entry recorded successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Mark as paid
  const markAsPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseClient
        .from('payables')
        .update({ status: 'paid' })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      toast({ title: "Marked as Paid" });
    },
  });

  const updateField = (key: string, value: string) => {
    setFormData(p => ({ ...p, [key]: value }));
  };

  // ─── FORM SUBMISSION HANDLERS PER CATEGORY ───────────────────────────

  const handleVendorSuppliesSubmit = () => {
    const { vendor_name, description, invoice_number, amount, gst_percent, due_date, payment_mode, utr_ref } = formData;
    if (!vendor_name || !description || !amount) {
      toast({ title: "Validation Error", description: "Vendor Name, Description and Amount are required.", variant: "destructive" });
      return;
    }
    const amt = parseFloat(amount);
    const gstPct = gst_percent ? parseFloat(gst_percent) : 0;
    const gstAmt = amt * (gstPct / 100);
    const total = amt + gstAmt;
    createPayable.mutate({
      category: 'Vendor & Supplies',
      description: `${description}${invoice_number ? ` | Inv#: ${invoice_number}` : ''}`,
      vendor_name,
      amount: amt,
      gst_amount: gstAmt || null,
      total_amount: total,
      due_date: due_date || null,
      payment_mode: payment_mode || null,
      reference_number: utr_ref || null,
      notes: gst_percent ? `GST: ${gst_percent}%` : null,
    });
  };

  const handleRentUtilitiesSubmit = () => {
    const { expense_type, property_branch, vendor_name, amount, rent_period, due_date, payment_mode } = formData;
    if (!expense_type || !property_branch || !vendor_name || !amount || !rent_period) {
      toast({ title: "Validation Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }
    const gross = parseFloat(amount);
    // TDS @10% u/s 194-I applies only to rent, not utilities.
    const isRent = expense_type === 'Rent';
    const tds = isRent ? gross * 0.10 : 0;
    const netPayable = gross - tds;
    createPayable.mutate({
      category: 'Rent & Utilities',
      description: `${expense_type} - ${property_branch} | Period: ${rent_period}`,
      vendor_name,
      amount: gross,
      gst_amount: null,
      total_amount: netPayable,
      due_date: due_date || null,
      payment_mode: payment_mode || null,
      reference_number: null,
      notes: isRent
        ? `TDS Deducted (10%): ₹${tds.toFixed(2)} | Net Payable: ₹${netPayable.toFixed(2)} | Property: ${property_branch}`
        : `${expense_type} | Property: ${property_branch}`,
    });
  };

  const handleReimbursementSubmit = () => {
    const { employee_name, expense_type, description, amount, bill_ref, date_of_expense, approval_status } = formData;
    if (!employee_name || !expense_type || !description || !amount || !date_of_expense) {
      toast({ title: "Validation Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }
    const amt = parseFloat(amount);
    createPayable.mutate({
      category: 'Reimbursements',
      description: `${expense_type}: ${description}`,
      vendor_name: employee_name,
      amount: amt,
      gst_amount: null,
      total_amount: amt,
      due_date: date_of_expense,
      payment_mode: null,
      reference_number: bill_ref || null,
      notes: `Employee: ${employee_name} | Type: ${expense_type} | Approval: ${approval_status || 'Pending'}`,
    });
  };

  const handleComplianceSubmit = () => {
    const { license_type, authority, period, amount, due_date, reference_number, payment_mode } = formData;
    if (!license_type || !authority || !amount || !due_date) {
      toast({ title: "Validation Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }
    const amt = parseFloat(amount);
    createPayable.mutate({
      category: 'Compliance & Licenses',
      description: `${license_type}${period ? ` - ${period}` : ''}`,
      vendor_name: authority,
      amount: amt,
      gst_amount: null,
      total_amount: amt,
      due_date,
      payment_mode: payment_mode || null,
      reference_number: reference_number || null,
      notes: `License/Fee: ${license_type} | Authority: ${authority}${period ? ` | Period: ${period}` : ''}`,
    });
  };

  const handleTaxesSubmit = () => {
    const { tax_type, assessment_period, amount, due_date, challan_number, payment_status } = formData;
    if (!tax_type || !assessment_period || !amount || !due_date) {
      toast({ title: "Validation Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }
    const amt = parseFloat(amount);
    createPayable.mutate({
      category: 'Statutory & Taxes',
      description: `${tax_type} - ${assessment_period}`,
      vendor_name: null,
      amount: amt,
      gst_amount: null,
      total_amount: amt,
      due_date,
      payment_mode: null,
      reference_number: challan_number || null,
      notes: `Tax Type: ${tax_type} | Period: ${assessment_period}${payment_status ? ` | Status: ${payment_status}` : ''}`,
    });
  };

  const handleEpfEsicSubmit = () => {
    const { contribution_month, num_employees, employer_epf, employee_epf, esic_employer, esic_employee, total_deposit, ecr_ref, due_date } = formData;
    if (!contribution_month || !employer_epf || !employee_epf || !esic_employer || !esic_employee || !total_deposit) {
      toast({ title: "Validation Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }
    const total = parseFloat(total_deposit);
    createPayable.mutate({
      category: 'EPF & ESIC',
      description: `EPF/ESIC Contribution - ${contribution_month}`,
      vendor_name: null,
      amount: total,
      gst_amount: null,
      total_amount: total,
      due_date: due_date || null,
      payment_mode: null,
      reference_number: ecr_ref || null,
      notes: `Month: ${contribution_month} | Employees: ${num_employees || 'N/A'} | Employer EPF: ₹${employer_epf} | Employee EPF: ₹${employee_epf} | ESIC Employer: ₹${esic_employer} | ESIC Employee: ₹${esic_employee}`,
    });
  };

  const handleOtherExpenseSubmit = () => {
    const { description, aux_category, amount, gst_amount, vendor_name, date, notes } = formData;
    if (!description || !aux_category || !amount || !date) {
      toast({ title: "Validation Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }
    const amt = parseFloat(amount);
    const gst = gst_amount ? parseFloat(gst_amount) : null;
    createPayable.mutate({
      category: 'Other Expenses',
      description: `[${aux_category}] ${description}`,
      vendor_name: vendor_name || null,
      amount: amt,
      gst_amount: gst,
      total_amount: amt + (gst || 0),
      due_date: date,
      payment_mode: null,
      reference_number: null,
      notes: notes || null,
    });
  };

  const handleGenericSubmit = () => {
    const { category, description, vendor_name, amount, gst_amount, due_date, payment_mode, reference_number, notes } = formData;
    if (!category || !description || !amount) {
      toast({ title: "Validation Error", description: "Category, description and amount are required.", variant: "destructive" });
      return;
    }
    const amt = parseFloat(amount);
    const gst = gst_amount ? parseFloat(gst_amount) : null;
    createPayable.mutate({
      category,
      description,
      vendor_name: vendor_name || null,
      amount: amt,
      gst_amount: gst,
      total_amount: amt + (gst || 0),
      due_date: due_date || null,
      payment_mode: payment_mode || null,
      reference_number: reference_number || null,
      notes: notes || null,
    });
  };

  const handleSubmit = () => {
    switch (filter) {
      case 'Vendor & Supplies': return handleVendorSuppliesSubmit();
      case 'Rent & Utilities': return handleRentUtilitiesSubmit();
      case 'Reimbursements': return handleReimbursementSubmit();
      case 'Statutory & Taxes': return handleTaxesSubmit();
      case 'EPF & ESIC': return handleEpfEsicSubmit();
      case 'Compliance & Licenses': return handleComplianceSubmit();
      case 'Other Expenses': return handleOtherExpenseSubmit();
      default: return handleGenericSubmit();
    }
  };

  // ─── FORM RENDERERS ──────────────────────────────────────────────────

  const renderVendorSuppliesForm = () => {
    const amt = formData.amount ? parseFloat(formData.amount) : 0;
    const gstPct = formData.gst_percent ? parseFloat(formData.gst_percent) : 0;
    const gstAmt = amt * (gstPct / 100);
    const total = amt + gstAmt;

    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Vendor Name*</Label>
          <Input value={formData.vendor_name || ''} onChange={(e) => updateField('vendor_name', e.target.value)} placeholder="Vendor name" />
        </div>
        <div className="space-y-1">
          <Label>Description*</Label>
          <Input value={formData.description || ''} onChange={(e) => updateField('description', e.target.value)} placeholder="Payment description" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Invoice Number</Label>
            <Input value={formData.invoice_number || ''} onChange={(e) => updateField('invoice_number', e.target.value)} placeholder="INV-XXX" />
          </div>
          <div className="space-y-1">
            <Label>Amount (₹)*</Label>
            <Input type="number" min="0" value={formData.amount || ''} onChange={(e) => updateField('amount', e.target.value)} placeholder="Base amount" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>GST (%)</Label>
            <Input type="number" min="0" max="28" value={formData.gst_percent || ''} onChange={(e) => updateField('gst_percent', e.target.value)} placeholder="e.g. 18" />
          </div>
          <div className="space-y-1">
            <Label>GST Amount (₹)</Label>
            <Input type="number" readOnly value={gstAmt ? gstAmt.toFixed(2) : ''} className="bg-muted" />
          </div>
          <div className="space-y-1">
            <Label>Total (₹)</Label>
            <Input type="number" readOnly value={total ? total.toFixed(2) : ''} className="bg-muted" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Due Date</Label>
            <Input type="date" value={formData.due_date || ''} onChange={(e) => updateField('due_date', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Payment Mode</Label>
            <Select value={formData.payment_mode || ''} onValueChange={(v) => updateField('payment_mode', v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Bank Transfer">Bank Transfer (NEFT/RTGS)</SelectItem>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="Cheque">Cheque</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="DD">Demand Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>UTR/Reference No.</Label>
          <Input value={formData.utr_ref || ''} onChange={(e) => updateField('utr_ref', e.target.value)} placeholder="UTR or transaction reference" />
        </div>
      </div>
    );
  };

  const renderRentUtilitiesForm = () => {
    const expenseType = formData.expense_type || '';
    const isRent = expenseType === 'Rent';
    const gross = formData.amount ? parseFloat(formData.amount) : 0;
    const tds = isRent ? gross * 0.10 : 0;
    const netPayable = gross - tds;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Expense Type*</Label>
            <Select value={formData.expense_type || ''} onValueChange={(v) => updateField('expense_type', v)}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Rent">Rent</SelectItem>
                <SelectItem value="Electricity">Electricity</SelectItem>
                <SelectItem value="Water">Water</SelectItem>
                <SelectItem value="Internet/Phone">Internet / Phone</SelectItem>
                <SelectItem value="Gas/Fuel">Gas / Fuel</SelectItem>
                <SelectItem value="Other Utility">Other Utility</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Property/Branch*</Label>
            <Input value={formData.property_branch || ''} onChange={(e) => updateField('property_branch', e.target.value)} placeholder="e.g. Noida Branch Office" />
          </div>
        </div>
        <div className="space-y-1">
          <Label>{isRent ? 'Landlord Name*' : 'Provider / Payee*'}</Label>
          <Input value={formData.vendor_name || ''} onChange={(e) => updateField('vendor_name', e.target.value)} placeholder={isRent ? 'Property owner name' : 'e.g. State Electricity Board'} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>Amount (₹)*</Label>
            <Input type="number" min="0" value={formData.amount || ''} onChange={(e) => updateField('amount', e.target.value)} placeholder="Gross amount" />
          </div>
          <div className="space-y-1">
            <Label>TDS {isRent ? '(10%)' : '(N/A)'}</Label>
            <Input type="number" readOnly value={isRent && tds ? tds.toFixed(2) : ''} className="bg-muted" placeholder={isRent ? '' : 'No TDS on utilities'} />
          </div>
          <div className="space-y-1">
            <Label>Net Payable (₹)</Label>
            <Input type="number" readOnly value={netPayable ? netPayable.toFixed(2) : ''} className="bg-muted" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Period (Month/Year)*</Label>
            <Input type="month" value={formData.rent_period || ''} onChange={(e) => updateField('rent_period', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Due Date</Label>
            <Input type="date" value={formData.due_date || ''} onChange={(e) => updateField('due_date', e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Payment Mode</Label>
          <Select value={formData.payment_mode || ''} onValueChange={(v) => updateField('payment_mode', v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Bank Transfer">Bank Transfer (NEFT/RTGS)</SelectItem>
              <SelectItem value="UPI">UPI</SelectItem>
              <SelectItem value="Cheque">Cheque</SelectItem>
              <SelectItem value="Cash">Cash</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  };

  const renderReimbursementForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Employee Name*</Label>
          <Input value={formData.employee_name || ''} onChange={(e) => updateField('employee_name', e.target.value)} placeholder="Employee full name" />
        </div>
        <div className="space-y-1">
          <Label>Expense Type*</Label>
          <Select value={formData.expense_type || ''} onValueChange={(v) => updateField('expense_type', v)}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Travel">Travel</SelectItem>
              <SelectItem value="Medical">Medical</SelectItem>
              <SelectItem value="Food">Food</SelectItem>
              <SelectItem value="Communication">Communication</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Description*</Label>
        <Input value={formData.description || ''} onChange={(e) => updateField('description', e.target.value)} placeholder="Expense details" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Amount (₹)*</Label>
          <Input type="number" min="0" value={formData.amount || ''} onChange={(e) => updateField('amount', e.target.value)} placeholder="Claim amount" />
        </div>
        <div className="space-y-1">
          <Label>Bill/Receipt Reference</Label>
          <Input value={formData.bill_ref || ''} onChange={(e) => updateField('bill_ref', e.target.value)} placeholder="Bill or receipt number" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Date of Expense*</Label>
          <Input type="date" value={formData.date_of_expense || ''} onChange={(e) => updateField('date_of_expense', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Approval Status</Label>
          <Select value={formData.approval_status || ''} onValueChange={(v) => updateField('approval_status', v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Approved">Approved</SelectItem>
              <SelectItem value="Rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  const renderComplianceForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>License / Fee Type*</Label>
          <Select value={formData.license_type || ''} onValueChange={(v) => updateField('license_type', v)}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PSARA License Renewal">PSARA License Renewal</SelectItem>
              <SelectItem value="Arms License">Arms License</SelectItem>
              <SelectItem value="Training Board Fee">Training Board Fee</SelectItem>
              <SelectItem value="Labour License">Labour License</SelectItem>
              <SelectItem value="Trade License">Trade License</SelectItem>
              <SelectItem value="Shops & Establishment">Shops & Establishment</SelectItem>
              <SelectItem value="Other Statutory Fee">Other Statutory Fee</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Authority / Payee*</Label>
          <Input value={formData.authority || ''} onChange={(e) => updateField('authority', e.target.value)} placeholder="e.g. Controlling Authority PSARA" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Amount (₹)*</Label>
          <Input type="number" min="0" value={formData.amount || ''} onChange={(e) => updateField('amount', e.target.value)} placeholder="Fee amount" />
        </div>
        <div className="space-y-1">
          <Label>Due Date*</Label>
          <Input type="date" value={formData.due_date || ''} onChange={(e) => updateField('due_date', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Validity / Period</Label>
          <Input value={formData.period || ''} onChange={(e) => updateField('period', e.target.value)} placeholder="e.g. FY 2025-26 / 5 years" />
        </div>
        <div className="space-y-1">
          <Label>Reference / Challan No.</Label>
          <Input value={formData.reference_number || ''} onChange={(e) => updateField('reference_number', e.target.value)} placeholder="Receipt / challan number" />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Payment Mode</Label>
        <Select value={formData.payment_mode || ''} onValueChange={(v) => updateField('payment_mode', v)}>
          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Bank Transfer">Bank Transfer (NEFT/RTGS)</SelectItem>
            <SelectItem value="UPI">UPI</SelectItem>
            <SelectItem value="Cheque">Cheque</SelectItem>
            <SelectItem value="Cash">Cash</SelectItem>
            <SelectItem value="DD">Demand Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const renderTaxesForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Tax Type*</Label>
          <Select value={formData.tax_type || ''} onValueChange={(v) => updateField('tax_type', v)}>
            <SelectTrigger><SelectValue placeholder="Select tax type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="GST">GST</SelectItem>
              <SelectItem value="TDS">TDS</SelectItem>
              <SelectItem value="Professional Tax">Professional Tax</SelectItem>
              <SelectItem value="Income Tax">Income Tax</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Assessment Period*</Label>
          <Input value={formData.assessment_period || ''} onChange={(e) => updateField('assessment_period', e.target.value)} placeholder="e.g. Q1 FY 2025-26" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Amount (₹)*</Label>
          <Input type="number" min="0" value={formData.amount || ''} onChange={(e) => updateField('amount', e.target.value)} placeholder="Tax amount" />
        </div>
        <div className="space-y-1">
          <Label>Due Date*</Label>
          <Input type="date" value={formData.due_date || ''} onChange={(e) => updateField('due_date', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Challan Number</Label>
          <Input value={formData.challan_number || ''} onChange={(e) => updateField('challan_number', e.target.value)} placeholder="Challan/receipt number" />
        </div>
        <div className="space-y-1">
          <Label>Payment Status</Label>
          <Select value={formData.payment_status || ''} onValueChange={(v) => updateField('payment_status', v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Paid">Paid</SelectItem>
              <SelectItem value="Overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  const renderEpfEsicForm = () => {
    // Auto-set due date to 15th of next month from contribution month
    const getAutoDate = () => {
      if (formData.contribution_month) {
        const [year, month] = formData.contribution_month.split('-').map(Number);
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        return `${nextYear}-${String(nextMonth).padStart(2, '0')}-15`;
      }
      return '';
    };

    const autoDate = getAutoDate();

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Contribution Month*</Label>
            <Input type="month" value={formData.contribution_month || ''} onChange={(e) => updateField('contribution_month', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Number of Employees</Label>
            <Input type="number" min="0" value={formData.num_employees || ''} onChange={(e) => updateField('num_employees', e.target.value)} placeholder="Total employees" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Employer EPF Amount (₹)*</Label>
            <Input type="number" min="0" value={formData.employer_epf || ''} onChange={(e) => updateField('employer_epf', e.target.value)} placeholder="Employer's EPF share" />
          </div>
          <div className="space-y-1">
            <Label>Employee EPF Amount (₹)*</Label>
            <Input type="number" min="0" value={formData.employee_epf || ''} onChange={(e) => updateField('employee_epf', e.target.value)} placeholder="Employee's EPF share" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>ESIC Employer (₹)*</Label>
            <Input type="number" min="0" value={formData.esic_employer || ''} onChange={(e) => updateField('esic_employer', e.target.value)} placeholder="Employer ESIC" />
          </div>
          <div className="space-y-1">
            <Label>ESIC Employee (₹)*</Label>
            <Input type="number" min="0" value={formData.esic_employee || ''} onChange={(e) => updateField('esic_employee', e.target.value)} placeholder="Employee ESIC" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Total Deposit (₹)*</Label>
            <Input type="number" min="0" value={formData.total_deposit || ''} onChange={(e) => updateField('total_deposit', e.target.value)} placeholder="Total amount deposited" />
          </div>
          <div className="space-y-1">
            <Label>ECR Reference No.</Label>
            <Input value={formData.ecr_ref || ''} onChange={(e) => updateField('ecr_ref', e.target.value)} placeholder="ECR challan reference" />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Due Date (auto: 15th of next month)</Label>
          <Input type="date" value={formData.due_date || autoDate} onChange={(e) => updateField('due_date', e.target.value)} className="bg-muted" />
        </div>
      </div>
    );
  };

  const renderOtherExpenseForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Description*</Label>
          <Input value={formData.description || ''} onChange={(e) => updateField('description', e.target.value)} placeholder="Expense description" />
        </div>
        <div className="space-y-1">
          <Label>Category*</Label>
          <Select value={formData.aux_category || ''} onValueChange={(v) => updateField('aux_category', v)}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Stationery">Stationery</SelectItem>
              <SelectItem value="Maintenance">Maintenance</SelectItem>
              <SelectItem value="Security Equipment">Security Equipment</SelectItem>
              <SelectItem value="Training">Training</SelectItem>
              <SelectItem value="Fuel">Fuel</SelectItem>
              <SelectItem value="Courier">Courier</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Amount (₹)*</Label>
          <Input type="number" min="0" value={formData.amount || ''} onChange={(e) => updateField('amount', e.target.value)} placeholder="Expense amount" />
        </div>
        <div className="space-y-1">
          <Label>GST Amount (₹)</Label>
          <Input type="number" min="0" value={formData.gst_amount || ''} onChange={(e) => updateField('gst_amount', e.target.value)} placeholder="If applicable" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Vendor</Label>
          <Input value={formData.vendor_name || ''} onChange={(e) => updateField('vendor_name', e.target.value)} placeholder="Vendor name (if any)" />
        </div>
        <div className="space-y-1">
          <Label>Date*</Label>
          <Input type="date" value={formData.date || ''} onChange={(e) => updateField('date', e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Notes</Label>
        <Textarea value={formData.notes || ''} onChange={(e) => updateField('notes', e.target.value)} placeholder="Additional details..." rows={2} />
      </div>
    </div>
  );

  const renderGenericForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Category*</Label>
          <Select value={formData.category || ''} onValueChange={(v) => updateField('category', v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {PAYABLE_CATEGORIES.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Due Date</Label>
          <Input type="date" value={formData.due_date || ''} onChange={(e) => updateField('due_date', e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Description*</Label>
        <Input value={formData.description || ''} onChange={(e) => updateField('description', e.target.value)} placeholder="e.g. Monthly office rent - May 2026" />
      </div>
      <div className="space-y-1">
        <Label>Vendor / Payee</Label>
        <Input value={formData.vendor_name || ''} onChange={(e) => updateField('vendor_name', e.target.value)} placeholder="e.g. ABC Security Supplies" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Amount (₹)*</Label>
          <Input type="number" min="0" value={formData.amount || ''} onChange={(e) => updateField('amount', e.target.value)} placeholder="Base amount" />
        </div>
        <div className="space-y-1">
          <Label>GST Amount (₹)</Label>
          <Input type="number" min="0" value={formData.gst_amount || ''} onChange={(e) => updateField('gst_amount', e.target.value)} placeholder="If applicable" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Payment Mode</Label>
          <Select value={formData.payment_mode || ''} onValueChange={(v) => updateField('payment_mode', v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Bank Transfer">Bank Transfer (NEFT/RTGS)</SelectItem>
              <SelectItem value="UPI">UPI</SelectItem>
              <SelectItem value="Cheque">Cheque</SelectItem>
              <SelectItem value="Cash">Cash</SelectItem>
              <SelectItem value="DD">Demand Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Reference No.</Label>
          <Input value={formData.reference_number || ''} onChange={(e) => updateField('reference_number', e.target.value)} placeholder="UTR / Cheque No." />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Notes</Label>
        <Textarea value={formData.notes || ''} onChange={(e) => updateField('notes', e.target.value)} placeholder="Additional details..." rows={2} />
      </div>
    </div>
  );

  const renderAddForm = () => {
    switch (filter) {
      case 'Vendor & Supplies': return renderVendorSuppliesForm();
      case 'Rent & Utilities': return renderRentUtilitiesForm();
      case 'Reimbursements': return renderReimbursementForm();
      case 'Statutory & Taxes': return renderTaxesForm();
      case 'EPF & ESIC': return renderEpfEsicForm();
      case 'Compliance & Licenses': return renderComplianceForm();
      case 'Other Expenses': return renderOtherExpenseForm();
      default: return renderGenericForm();
    }
  };

  const getDialogTitle = () => {
    if (filter === 'All') return 'Add Payable Entry';
    return `Add ${filter} Entry`;
  };

  // Filter by search
  const filteredPayables = payables.filter(p => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      p.description.toLowerCase().includes(s) ||
      (p.vendor_name || '').toLowerCase().includes(s) ||
      p.category.toLowerCase().includes(s)
    );
  });

  // Summary stats
  const totalPending = payables.filter(p => p.status === 'pending').reduce((s, p) => s + p.total_amount, 0);
  const totalPaid = payables.filter(p => p.status === 'paid').reduce((s, p) => s + p.total_amount, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge className="bg-green-500">Paid</Badge>;
      case 'pending': return <Badge className="bg-amber-500">Pending</Badge>;
      case 'approved': return <Badge className="bg-blue-500">Approved</Badge>;
      case 'rejected': return <Badge className="bg-red-500">Rejected</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getCategoryDescription = () => {
    switch (filter) {
      case 'Salary & Wages': return 'Employee salary disbursements — auto-generated from HR payroll';
      case 'EPF & ESIC': return 'Provident Fund and Employee State Insurance contributions';
      case 'Statutory & Taxes': return 'GST, TDS, Professional Tax, and other statutory payments';
      case 'Vendor & Supplies': return 'Payments to suppliers — uniforms, equipment, arms, consumables, stationery';
      case 'Rent & Utilities': return 'Office/branch rent, electricity, water, internet and other utilities';
      case 'Reimbursements': return 'Employee expense reimbursements (travel, medical, etc.)';
      case 'Mess Expense': return 'Weekly mess fund disbursements to operational posts';
      case 'Compliance & Licenses': return 'PSARA, arms license, training board and other statutory license fees';
      case 'Other Expenses': return 'Miscellaneous operational expenses not covered above';
      default: return 'All payable entries across categories';
    }
  };

  const getAddButtonLabel = () => {
    switch (filter) {
      case 'Vendor & Supplies': return 'Record Payment';
      case 'Rent & Utilities': return 'Record Rent/Utility';
      case 'Reimbursements': return 'Submit Claim';
      case 'Statutory & Taxes': return 'Record Tax Payment';
      case 'EPF & ESIC': return 'Record Contribution';
      case 'Compliance & Licenses': return 'Record Fee';
      case 'Other Expenses': return 'Record Expense';
      default: return 'New Entry';
    }
  };

  // Should show "Add Entry" button?
  const showAddButton = !NO_ADD_CATEGORIES.includes(filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">
            {filter === 'All' ? 'All Payables' : filter}
          </h2>
          <p className="text-sm text-muted-foreground">{getCategoryDescription()}</p>
        </div>
        {showAddButton && (
          <Button onClick={() => { setFormData({}); setShowAddForm(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            {getAddButtonLabel()}
          </Button>
        )}
      </div>

      {/* Salary approvals — approve payroll runs sent from HR; applies advance recoveries */}
      {filter === 'Salary & Wages' && (
        <>
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
            <CardContent className="p-4 flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-blue-900 dark:text-blue-100">Salary payments come from HR payroll runs.</p>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">Approving a run posts the net salary as paid and automatically applies loan, deposit and mess recoveries against each employee&apos;s outstanding balance.</p>
              </div>
            </CardContent>
          </Card>
          <SalaryApprovalsSection />
        </>
      )}

      {/* Mess Expense info message */}
      {filter === 'Mess Expense' && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-100">Mess expenses are managed through fund requests from Operations.</p>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">Fund requests from operational posts are shown below. Approve them to create payable entries.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Pending</p>
            <p className="text-xl font-bold text-amber-600">₹{totalPending.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Paid</p>
            <p className="text-xl font-bold text-green-600">₹{totalPaid.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Entries</p>
            <p className="text-xl font-bold">{payables.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search entries..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* ── PO Approvals (Vendor & Supplies only) ── */}
      {filter === 'Vendor & Supplies' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Purchase Order Approvals</h3>
            {pendingPOs.filter(p => ['submitted','pending_approval'].includes(p.status)).length > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500 text-white rounded-full">
                {pendingPOs.filter(p => ['submitted','pending_approval'].includes(p.status)).length} pending
              </span>
            )}
          </div>

          {isLoadingPOs ? (
            <Card>
              <CardContent className="py-8 flex items-center justify-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading purchase orders…
              </CardContent>
            </Card>
          ) : pendingPOs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No POs awaiting approval or payment confirmation.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>PO Number</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Grand Total</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingPOs.map(po => (
                      <TableRow key={po.id}>
                        <TableCell className="font-mono text-xs font-medium">{po.po_number}</TableCell>
                        <TableCell className="text-sm">{po.vendor_name}</TableCell>
                        <TableCell className="text-right font-semibold">₹{po.grand_total.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{po.priority}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
                            <Clock className="h-3 w-3" />{PO_STATUS_LABELS[po.status]}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {po.submitted_at ? format(new Date(po.submitted_at), 'dd MMM yyyy') : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {['submitted','pending_approval'].includes(po.status) && (
                              <>
                                <Button size="sm" variant="outline" disabled={processingPO === po.id} onClick={() => handleApprovePO(po.id)}>
                                  <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
                                </Button>
                                <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" disabled={processingPO === po.id} onClick={() => handleRejectPO(po.id)}>
                                  <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                                </Button>
                              </>
                            )}
                            {['approved','slip_generated'].includes(po.status) && (
                              <>
                                <Button size="sm" variant="outline" className="text-amber-700 border-amber-200 hover:bg-amber-50" disabled={processingPO === po.id} onClick={() => setUndoApprovalPO(po)}>
                                  <Undo2 className="h-3.5 w-3.5 mr-1" /> Undo Approval
                                </Button>
                                <Button size="sm" variant="outline" disabled={processingPO === po.id} onClick={() => handleMarkFunded(po.id)}>
                                  <Banknote className="h-3.5 w-3.5 mr-1" /> Confirm Payment
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Undo-approval confirmation. Unlike Approve/Reject, this one clears
              audit fields (approved_by / approved_at) that cannot be restored,
              so it asks first. */}
          <AlertDialog open={!!undoApprovalPO} onOpenChange={(open) => { if (!open) setUndoApprovalPO(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Undo approval for {undoApprovalPO?.po_number}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This sends the PO back to <strong>Submitted</strong> so it can be
                  reviewed again, and clears who approved it and when — that record
                  cannot be restored.
                  {undoApprovalPO?.slip_number
                    ? ` Fund slip ${undoApprovalPO.slip_number} will also be voided and must be regenerated after re-approval.`
                    : ''}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={processingPO === undoApprovalPO?.id}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleUndoApproval}
                  disabled={processingPO === undoApprovalPO?.id}
                >
                  {processingPO === undoApprovalPO?.id ? 'Undoing…' : 'Undo Approval'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Uploaded Invoices */}
          <div className="flex items-center gap-2 pt-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Uploaded Invoices</h3>
            {poWithInvoice.length > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground rounded-full">
                {poWithInvoice.length} invoice{poWithInvoice.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {poWithInvoice.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No invoices uploaded yet. Invoices are attached when goods are received against a PO.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>PO Number</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Invoice Date</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Grand Total</TableHead>
                      <TableHead>PO Status</TableHead>
                      <TableHead>Delivery Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {poWithInvoice.map(po => (
                      <TableRow key={po.id}>
                        <TableCell className="font-mono text-xs font-medium">{po.po_number}</TableCell>
                        <TableCell className="font-mono text-xs">{po.invoice_number}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {po.invoice_date ? format(new Date(po.invoice_date), 'dd MMM yyyy') : '—'}
                        </TableCell>
                        <TableCell className="text-sm">{po.vendor_name}</TableCell>
                        <TableCell className="text-right font-semibold">₹{po.grand_total.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{PO_STATUS_LABELS[po.status]}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {po.actual_delivery ? format(new Date(po.actual_delivery), 'dd MMM yyyy') : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          <Separator />
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPayables.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <IndianRupee className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No entries found{filter !== 'All' ? ` for "${filter}"` : ''}.</p>
              {showAddButton && <p className="text-xs mt-1">Click &quot;{getAddButtonLabel()}&quot; to create one.</p>}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor/Payee</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayables.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">{entry.description}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{entry.category}</Badge></TableCell>
                    <TableCell>{entry.vendor_name || '—'}</TableCell>
                    <TableCell className="text-right">₹{entry.amount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{entry.gst_amount ? `₹${entry.gst_amount.toLocaleString()}` : '—'}</TableCell>
                    <TableCell className="text-right font-medium">₹{entry.total_amount.toLocaleString()}</TableCell>
                    <TableCell>{entry.due_date ? new Date(entry.due_date).toLocaleDateString() : '—'}</TableCell>
                    <TableCell>{getStatusBadge(entry.status)}</TableCell>
                    <TableCell className="text-right">
                      {entry.status === 'pending' && (
                        <Button size="sm" variant="outline" onClick={() => markAsPaid.mutate(entry.id)}>
                          Mark Paid
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Mess Fund Requests */}
      {(filter === 'All' || filter === 'Mess Expense') && (
        <MessFundRequestsSection />
      )}

      {/* Add Entry Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{getDialogTitle()}</DialogTitle>
          </DialogHeader>

          {renderAddForm()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createPayable.isPending}>
              {createPayable.isPending ? 'Saving...' : 'Save Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
