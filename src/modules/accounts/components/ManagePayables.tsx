'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
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
import { applyBranchScope, getBranchScopeFilter, onBranchScopeChange, getBranchScope } from '@/utils/branchScope';
import { useToast } from '@/hooks/use-toast';
import { MessFundRequestsSection } from './MessFundRequestsSection';
import { SalaryApprovalsSection } from './SalaryApprovalsSection';
import { useVendorStore } from '@/modules/office-admin/components/vendors/vendorStore';
import { PO_STATUS_LABELS, PurchaseOrder } from '@/modules/office-admin/components/vendors/types';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { PAYABLE_CATEGORIES, NO_ADD_CATEGORIES } from '@/modules/accounts/constants/payableCategories';
import { useGstLiability } from '@/modules/accounts/hooks/useGstLiability';
import { uploadDocument } from '@/lib/r2-storage';
import { useStaffMembers } from '@/modules/operations/hooks/useStaffMembers';
import { useVehicles, useTripLogs } from '@/modules/office-admin/hooks/useFleet';
import { createFuelLog } from '@/services/fleet/FleetService';

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
  /** Proof-of-payment document URL (Supabase Storage), e.g. reimbursement voucher. */
  voucher_url: string | null;
  /** Proof-of-expense document URL (the claimed bill/receipt). */
  expense_proof_url: string | null;
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
  // Reimbursement attachments (Supabase Storage):
  //  - voucherFile: proof of PAYMENT (bank/UPI receipt, signed voucher) — needed to mark Paid.
  //  - proofFile:   proof of EXPENSE (the bill/receipt being claimed) — the fuel bill for Fuel.
  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [voucherUploading, setVoucherUploading] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  // Searchable employee picker for the reimbursement form.
  const { staffMembers } = useStaffMembers();
  const [empPickerOpen, setEmpPickerOpen] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const empPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (empPickerRef.current && !empPickerRef.current.contains(e.target as Node)) setEmpPickerOpen(false);
    }
    if (empPickerOpen) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [empPickerOpen]);
  const visibleStaff = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    if (!q) return staffMembers;
    return staffMembers.filter(s => s.name.toLowerCase().includes(q));
  }, [staffMembers, empSearch]);

  // Active bank accounts — for the "Paid From → Bank Account" source selector.
  const { data: bankAccounts = [] } = useQuery<any[]>({
    queryKey: ['bank_accounts_active'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('bank_accounts')
        .select('id, account_name, bank_name, account_number')
        .eq('status', 'active');
      if (error) return [];
      return data ?? [];
    },
    enabled: showAddForm && (filter === 'Reimbursements' || filter === 'Other Expenses'),
  });

  // Fleet data for Fuel-type reimbursements. Only fetched on the Reimbursements
  // tab; trips are fetched once a vehicle is chosen.
  const isReimbursementTab = filter === 'Reimbursements' && showAddForm;
  const { vehicles } = useVehicles(isReimbursementTab);
  const { tripLogs } = useTripLogs(formData.vehicle_id, isReimbursementTab);
  const [vehPickerOpen, setVehPickerOpen] = useState(false);
  const [vehSearch, setVehSearch] = useState('');
  const vehPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (vehPickerRef.current && !vehPickerRef.current.contains(e.target as Node)) setVehPickerOpen(false);
    }
    if (vehPickerOpen) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [vehPickerOpen]);
  const visibleVehicles = useMemo(() => {
    const q = vehSearch.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter(v => `${v.model} ${v.registrationNumber}`.toLowerCase().includes(q));
  }, [vehicles, vehSearch]);

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
    mutationFn: async (
      entry: Omit<PayableEntry, 'id' | 'created_at' | 'status' | 'voucher_url' | 'expense_proof_url'>
        & {
          voucher_url?: string | null;
          expense_proof_url?: string | null;
          // Source of funds (not persisted as payable columns; drives ledger posting).
          paidFrom?: string;            // 'Cash' | 'Bank Account' | 'Cheque' | 'Card'
          paidFromAccountId?: string;   // bank_accounts.id when Bank Account / Card
          paidFromAccountLabel?: string;
        }
    ) => {
      // Strip the non-column fund-source fields before insert.
      const { paidFrom, paidFromAccountId, paidFromAccountLabel, ...insertable } = entry;
      const row = { ...insertable, status: 'pending' as const };

      let { data, error } = await supabaseClient
        .from('payables')
        .insert(row)
        .select()
        .single();

      // Graceful fallback: if the newer proof columns haven't been migrated yet,
      // retry without them (preserving the URLs in notes so nothing is lost)
      // instead of failing the whole save.
      if (error && /voucher_url|expense_proof_url/i.test(error.message)) {
        const { voucher_url, expense_proof_url, ...rest } = row;
        const extraNotes = [
          voucher_url ? `Payment Voucher: ${voucher_url}` : '',
          expense_proof_url ? `Expense Proof: ${expense_proof_url}` : '',
        ].filter(Boolean).join(' | ');
        const withNote = extraNotes
          ? { ...rest, notes: [rest.notes, extraNotes].filter(Boolean).join(' | ') }
          : rest;
        ({ data, error } = await supabaseClient
          .from('payables')
          .insert(withNote)
          .select()
          .single());
      }
      if (error) throw new Error(error.message);

      // ── Ledger posting: money movement follows the "Paid From" source when
      // provided (Cash / Cheque / Bank Account / Card); otherwise it falls back
      // to the legacy payment_mode so existing flows keep working. This ensures
      // every payout lands in the correct ledger automatically.
      const source = paidFrom || (entry.payment_mode === 'Cash' ? 'Cash' : entry.payment_mode === 'Cheque' ? 'Cheque' : '');
      const scope = getBranchScope();
      const partyName = entry.vendor_name || entry.description?.split('|')[0]?.trim() || 'Payee';
      const txnDate = entry.due_date || new Date().toISOString().split('T')[0];

      if (source === 'Cheque') {
        try {
          await supabaseClient.from('cheque_register').insert({
            cheque_number: entry.reference_number || `AUTO-${Date.now()}`,
            type: 'issued',
            amount: entry.total_amount,
            issue_date: txnDate,
            party_name: partyName,
            purpose: entry.description || entry.category,
            status: 'pending',
            branch_id: scope.id || null,
          });
        } catch (e) { /* cheque_register table may not exist — continue */ }
      } else if (source === 'Cash') {
        try {
          await supabaseClient.from('cash_register').insert({
            transaction_date: txnDate,
            type: 'cash_out',
            amount: entry.total_amount,
            category: entry.category || 'other',
            description: entry.description || 'Payment',
            paid_to: partyName,
            voucher_number: entry.reference_number || null,
            branch_id: scope.id || null,
          });
        } catch (e) { /* cash_register table may not exist — continue */ }
      } else if ((source === 'Bank Account' || source === 'Card') && paidFromAccountId) {
        try {
          await supabaseClient.from('bank_transactions').insert({
            account_id: paidFromAccountId,
            transaction_date: txnDate,
            type: 'debit',
            amount: entry.total_amount,
            category: entry.category || 'expense',
            description: `${entry.description || 'Payment'}${source === 'Card' ? ' (Card)' : ''}`,
            reference_number: entry.reference_number || null,
            payment_mode: (entry.payment_mode || (source === 'Card' ? 'card' : 'neft')).toLowerCase(),
            party_name: partyName,
          });
        } catch (e) { /* bank_transactions table may not exist — continue */ }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      // Keep the GST → GSTR-3B settlement in sync when a GST tax payment is added.
      queryClient.invalidateQueries({ queryKey: ['compliance', 'gst-payments'] });
      setShowAddForm(false);
      setFormData({});
      setVoucherFile(null);
      setProofFile(null);
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

  // Shared GST liability — lets the Statutory & Taxes form auto-fill GST payments
  // from the SAME figures the GSTR-3B view uses, so nothing is keyed by hand.
  const gstLiability = useGstLiability(filter === 'Statutory & Taxes' && showAddForm);

  // When recording a GST tax payment: pick a month and the amount, CGST/SGST and
  // due date are derived from the computed net payable (unless manual override).
  useEffect(() => {
    if (!(showAddForm && filter === 'Statutory & Taxes')) return;
    if (formData.tax_type !== 'GST' || !formData.gst_month || formData.tax_override === '1') return;
    // Optional ITC override: when enabled, the entered ITC replaces the computed
    // ITC in the net-payable calculation (blocked/ineligible credits, reversals,
    // deferred credit, etc.).
    const itcOverride = formData.itc_override === '1' && formData.itc_amount !== undefined && formData.itc_amount !== ''
      ? parseFloat(formData.itc_amount)
      : undefined;
    const c = gstLiability.computePeriodLiability(formData.gst_month, itcOverride);
    setFormData(p => ({
      ...p,
      amount: String(c.remaining),
      due_date: p.due_date || c.dueDate,
      payment_date: p.payment_date || new Date().toISOString().split('T')[0],
      // Prefill the ITC field with the computed value the first time so the user
      // can see and adjust it.
      itc_amount: p.itc_amount ?? String(c.computedItc),
      // Split is derived EXACTLY from each invoice's persisted place-of-supply
      // (gst_type), so a mixed intra/inter-state month is apportioned correctly.
      cgst: String(c.cgst),
      sgst: String(c.sgst),
      igst: String(c.igst),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddForm, filter, formData.tax_type, formData.gst_month, formData.tax_override, formData.itc_override, formData.itc_amount]);

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

  const handleReimbursementSubmit = async () => {
    const {
      employee_name, expense_type, description, amount, gst_amount, bill_ref,
      date_of_expense, approval_status, payment_mode, payment_date,
      vehicle_id, trip_id, fuel_litres, fuel_rate, fuel_odometer, fuel_type,
      travel_from, travel_to, travel_mode,
      medical_nature, medical_provider, comm_provider, comm_period,
      lodging_place, lodging_checkin, lodging_checkout,
    } = formData;
    if (!employee_name || !expense_type || !description || !amount || !date_of_expense) {
      toast({ title: "Validation Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }
    // Fuel reimbursements must reference a real fleet vehicle.
    if (expense_type === 'Fuel' && !vehicle_id) {
      toast({ title: "Vehicle required", description: "Select the vehicle this fuel was purchased for.", variant: "destructive" });
      return;
    }

    const amt = parseFloat(amount) || 0;
    const gst = gst_amount ? parseFloat(gst_amount) || 0 : 0;
    const total = Math.round((amt + gst + Number.EPSILON) * 100) / 100;
    const status = approval_status || 'Pending';

    // Type-specific detail captured into notes for audit/reporting.
    const selectedVeh = vehicles.find(v => v.id === vehicle_id);
    const selectedTrip = tripLogs.find(t => t.id === trip_id);
    let typeDetail = '';
    if (expense_type === 'Fuel') {
      typeDetail = [
        selectedVeh ? `Vehicle: ${selectedVeh.model} (${selectedVeh.registrationNumber})` : '',
        selectedTrip ? `Trip: ${selectedTrip.startLocation || '—'}→${selectedTrip.destination || '—'}` : '',
        fuel_litres ? `Litres: ${fuel_litres}` : '',
        fuel_rate ? `Rate/L: ₹${fuel_rate}` : '',
        fuel_odometer ? `Odometer: ${fuel_odometer} km` : '',
        fuel_type ? `Fuel: ${fuel_type}` : '',
      ].filter(Boolean).join(', ');
    } else if (expense_type === 'Travel') {
      typeDetail = [travel_from || travel_to ? `Route: ${travel_from || '?'}→${travel_to || '?'}` : '', travel_mode ? `Mode: ${travel_mode}` : ''].filter(Boolean).join(', ');
    } else if (expense_type === 'Medical') {
      typeDetail = [medical_nature ? `Treatment: ${medical_nature}` : '', medical_provider ? `Provider: ${medical_provider}` : ''].filter(Boolean).join(', ');
    } else if (expense_type === 'Communication') {
      typeDetail = [comm_provider ? `Provider: ${comm_provider}` : '', comm_period ? `Plan: ${comm_period}` : ''].filter(Boolean).join(', ');
    } else if (expense_type === 'Lodging') {
      typeDetail = [lodging_place ? `Place: ${lodging_place}` : '', lodging_checkin ? `In: ${lodging_checkin}` : '', lodging_checkout ? `Out: ${lodging_checkout}` : ''].filter(Boolean).join(', ');
    }

    // Proof of payment is mandatory once a reimbursement is marked Paid — this
    // is the main guard against unverified payouts.
    if (status === 'Paid' && !voucherFile) {
      toast({ title: "Payment proof required", description: "Attach the payment voucher before marking this reimbursement as Paid.", variant: "destructive" });
      return;
    }
    // Source of funds is required when Paid, for cash-book / bank reconciliation.
    if (status === 'Paid' && !formData.paid_from) {
      toast({ title: "Source required", description: "Select where the money was paid from (Cash / Bank / Cheque / Card).", variant: "destructive" });
      return;
    }
    // Fuel claims must carry the fuel bill as expense proof.
    if (expense_type === 'Fuel' && !proofFile) {
      toast({ title: "Bill required", description: "Attach the fuel bill/receipt as expense proof.", variant: "destructive" });
      return;
    }

    setVoucherUploading(true);
    let voucherUrl = '';
    let proofUrl = '';
    try {
      if (proofFile) {
        const res = await uploadDocument(proofFile, 'reimbursements');
        if (!res.success || !res.url) {
          toast({ title: "Upload failed", description: res.error || "Could not upload the expense proof.", variant: "destructive" });
          setVoucherUploading(false);
          return;
        }
        proofUrl = res.url;
      }
      if (voucherFile) {
        const res = await uploadDocument(voucherFile, 'reimbursements');
        if (!res.success || !res.url) {
          toast({ title: "Upload failed", description: res.error || "Could not upload the payment voucher.", variant: "destructive" });
          setVoucherUploading(false);
          return;
        }
        voucherUrl = res.url;
      }
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message || "Could not upload the attachment.", variant: "destructive" });
      setVoucherUploading(false);
      return;
    }
    setVoucherUploading(false);

    // For Fuel, optionally record a matching Fleet fuel log so the vehicle's
    // fuel history and odometer stay in sync (toggle defaults on). Non-fatal:
    // a failure here must not block the reimbursement itself.
    if (expense_type === 'Fuel' && vehicle_id && formData.fuel_log_to_fleet !== '0') {
      try {
        // Vehicle fuelType may be 'hybrid', which the fuel log doesn't model —
        // map it (and any unknown) to 'petrol'.
        const rawFuelType = fuel_type || selectedVeh?.fuelType || 'petrol';
        const fuelTypeVal: 'petrol' | 'diesel' | 'cng' | 'electric' =
          rawFuelType === 'diesel' || rawFuelType === 'cng' || rawFuelType === 'electric' ? rawFuelType : 'petrol';
        const payModeMap: Record<string, 'cash' | 'card' | 'account'> = { Cash: 'cash', UPI: 'account', 'Bank Transfer': 'account', 'NEFT/RTGS': 'account', Cheque: 'account' };
        await createFuelLog({
          vehicleId: vehicle_id,
          branchId: getBranchScope().id || selectedVeh?.branchId || '',
          date: date_of_expense,
          odometerReading: fuel_odometer ? parseFloat(fuel_odometer) || 0 : (selectedVeh?.currentOdometer ?? 0),
          fuelAmount: fuel_litres ? parseFloat(fuel_litres) || 0 : 0,
          fuelCost: amt,
          fuelType: fuelTypeVal,
          filledBy: employee_name,
          paymentMode: payModeMap[payment_mode || ''] || 'cash',
          receiptNumber: bill_ref || undefined,
          billImageUrl: proofUrl || undefined,
          notes: `Auto-logged from reimbursement${selectedTrip ? ` | Trip: ${selectedTrip.id}` : ''}`,
        });
      } catch (e: any) {
        // Surface as a soft warning; the reimbursement still saves below.
        toast({ title: "Fuel log skipped", description: "Reimbursement saved, but the Fleet fuel log couldn't be created.", variant: "destructive" });
      }
    }

    createPayable.mutate({
      category: 'Reimbursements',
      description: `${expense_type}: ${description}`,
      vendor_name: employee_name,
      amount: amt,
      gst_amount: gst || null,
      total_amount: total,
      due_date: date_of_expense,
      payment_mode: payment_mode || null,
      reference_number: bill_ref || null,
      voucher_url: voucherUrl || null,
      expense_proof_url: proofUrl || null,
      paidFrom: formData.paid_from || undefined,
      paidFromAccountId: formData.paid_from_account_id || undefined,
      paidFromAccountLabel: formData.paid_from_account || undefined,
      notes: [
        `Employee: ${employee_name}`,
        `Type: ${expense_type}`,
        typeDetail,
        `Approval: ${status}`,
        formData.paid_from ? `Paid From: ${formData.paid_from}${formData.paid_from_account ? ` (${formData.paid_from_account})` : ''}` : '',
        payment_date ? `Paid On: ${payment_date}` : '',
      ].filter(Boolean).join(' | '),
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
    const {
      tax_type, assessment_period, gst_month, amount, due_date, payment_date,
      challan_number, payment_status, payment_mode, authority,
      cgst, sgst, igst,
    } = formData;

    const isGst = tax_type === 'GST';
    // For GST use a machine-readable YYYY-MM month; for other taxes keep the
    // flexible free-text assessment period (quarter/FY).
    const period = isGst ? gst_month : assessment_period;
    if (!tax_type || !period || !amount || !due_date) {
      toast({ title: "Validation Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }

    const amt = parseFloat(amount) || 0;
    const num = (v: any) => (v ? parseFloat(v) || 0 : 0);
    const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

    // Guardrail: for GST the tax split must reconcile with the total amount so a
    // mistyped override can't be saved.
    if (isGst) {
      const splitSum = num(cgst) + num(sgst) + num(igst);
      if (round2(splitSum) !== round2(amt)) {
        toast({ title: "Split mismatch", description: "CGST + SGST + IGST must equal the total amount.", variant: "destructive" });
        return;
      }
    }

    // Human-readable period label.
    const periodLabel = isGst
      ? (() => { const [y, m] = String(period).split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { year: 'numeric', month: 'long' }); })()
      : period;

    // Build a component breakdown string only for the parts that were entered.
    const breakdown = [
      num(cgst) ? `CGST ₹${num(cgst)}` : '',
      num(sgst) ? `SGST ₹${num(sgst)}` : '',
      num(igst) ? `IGST ₹${num(igst)}` : '',
    ].filter(Boolean).join(', ');

    // Record the ITC actually applied (esp. when overridden) for audit trail.
    const itcNote = isGst && formData.itc_override === '1' && formData.itc_amount
      ? `ITC Used: ₹${num(formData.itc_amount)} (overridden)`
      : '';

    // Structured notes. The "GST Period: YYYY-MM" tag is what lets the GSTR-3B
    // settlement match this payment to a return period.
    const noteParts = [
      `Tax Type: ${tax_type}`,
      `Period: ${periodLabel}`,
      isGst ? `GST Period: ${period}` : '',
      breakdown ? `Breakup: ${breakdown}` : '',
      itcNote,
      payment_date ? `Paid On: ${payment_date}` : '',
      `Status: ${payment_status || 'Pending'}`,
    ].filter(Boolean);

    createPayable.mutate({
      category: 'Statutory & Taxes',
      description: `${tax_type} - ${periodLabel}`,
      vendor_name: authority || (isGst ? 'GST Department' : null),
      amount: amt,
      gst_amount: null, // A tax remittance is not itself an ITC-bearing purchase.
      total_amount: amt,
      due_date,
      payment_mode: payment_mode || null,
      reference_number: challan_number || null,
      notes: noteParts.join(' | '),
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

  const handleOtherExpenseSubmit = async () => {
    const {
      description, aux_category, amount, gst_amount, vendor_name, date, notes, reference_number, payment_status, payment_mode,
      oe_billing_cycle, oe_renewal_date, oe_candidate, oe_purpose,
      oe_policy_no, oe_cover_from, oe_cover_to, oe_asset, oe_warranty_till, oe_bank, oe_charge_type,
    } = formData;
    if (!description || !aux_category || !amount || !date) {
      toast({ title: "Validation Error", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }

    // Category-specific detail captured into notes for audit/reporting.
    let catDetail = '';
    if (aux_category === 'Software & Subscriptions' || aux_category === 'Membership & Subscriptions') {
      catDetail = [oe_billing_cycle ? `Cycle: ${oe_billing_cycle}` : '', oe_renewal_date ? `Renews/Valid: ${oe_renewal_date}` : ''].filter(Boolean).join(', ');
    } else if (aux_category === 'Recruitment & Verification') {
      catDetail = [oe_candidate ? `Candidate: ${oe_candidate}` : '', oe_purpose ? `Purpose: ${oe_purpose}` : ''].filter(Boolean).join(', ');
    } else if (aux_category === 'Insurance (non-statutory)') {
      catDetail = [oe_policy_no ? `Policy: ${oe_policy_no}` : '', (oe_cover_from || oe_cover_to) ? `Cover: ${oe_cover_from || '?'}→${oe_cover_to || '?'}` : ''].filter(Boolean).join(', ');
    } else if (aux_category === 'Office Repairs & Maintenance') {
      catDetail = [oe_asset ? `Asset: ${oe_asset}` : '', oe_warranty_till ? `Warranty: ${oe_warranty_till}` : ''].filter(Boolean).join(', ');
    } else if (aux_category === 'Bank Charges') {
      catDetail = [oe_bank ? `Bank: ${oe_bank}` : '', oe_charge_type ? `Charge: ${oe_charge_type}` : ''].filter(Boolean).join(', ');
    }
    const status = payment_status || 'Pending';
    // Require the bill/receipt when the expense is already marked Paid.
    if (status === 'Paid' && !proofFile) {
      toast({ title: "Bill required", description: "Attach the bill/receipt before marking this expense as Paid.", variant: "destructive" });
      return;
    }
    if (status === 'Paid' && !formData.paid_from) {
      toast({ title: "Source required", description: "Select where the money was paid from (Cash / Bank / Cheque / Card).", variant: "destructive" });
      return;
    }

    const amt = parseFloat(amount) || 0;
    const gst = gst_amount ? parseFloat(gst_amount) || 0 : 0;
    const total = Math.round((amt + gst + Number.EPSILON) * 100) / 100;

    setVoucherUploading(true);
    let proofUrl = '';
    try {
      if (proofFile) {
        const res = await uploadDocument(proofFile, 'other-expenses');
        if (!res.success || !res.url) {
          toast({ title: "Upload failed", description: res.error || "Could not upload the expense proof.", variant: "destructive" });
          setVoucherUploading(false);
          return;
        }
        proofUrl = res.url;
      }
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message || "Could not upload the expense proof.", variant: "destructive" });
      setVoucherUploading(false);
      return;
    }
    setVoucherUploading(false);

    createPayable.mutate({
      category: 'Other Expenses',
      description: `[${aux_category}] ${description}`,
      vendor_name: vendor_name || null,
      amount: amt,
      gst_amount: gst || null,
      total_amount: total,
      due_date: date,
      payment_mode: payment_mode || null,
      reference_number: reference_number || null,
      expense_proof_url: proofUrl || null,
      paidFrom: formData.paid_from || undefined,
      paidFromAccountId: formData.paid_from_account_id || undefined,
      paidFromAccountLabel: formData.paid_from_account || undefined,
      notes: [
        `Category: ${aux_category}`,
        catDetail,
        `Status: ${status}`,
        formData.paid_from ? `Paid From: ${formData.paid_from}${formData.paid_from_account ? ` (${formData.paid_from_account})` : ''}` : '',
        notes || '',
      ].filter(Boolean).join(' | '),
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

  // Shared "Paid From" (source of funds) block — Cash / Bank Account / Cheque /
  // Card. Distinct from Payment Mode (the method). Shown once an entry is Paid.
  const renderPaidFrom = () => {
    const source = formData.paid_from || '';
    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Paid From (Source)*</Label>
          <Select value={source} onValueChange={(v) => { updateField('paid_from', v); if (v !== 'Bank Account') updateField('paid_from_account', ''); }}>
            <SelectTrigger><SelectValue placeholder="Where did the money come from?" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Cash">Cash</SelectItem>
              <SelectItem value="Bank Account">Bank Account</SelectItem>
              <SelectItem value="Cheque">Cheque</SelectItem>
              <SelectItem value="Card">Card</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(source === 'Bank Account' || source === 'Card') && (
          <div className="space-y-1">
            <Label>Bank Account{source === 'Card' ? ' (card linked)' : ''}</Label>
            <Select
              value={formData.paid_from_account_id || ''}
              onValueChange={(v) => {
                updateField('paid_from_account_id', v);
                const b = bankAccounts.find((x) => x.id === v);
                updateField('paid_from_account', b ? `${b.account_name}${b.bank_name ? ` — ${b.bank_name}` : ''}` : '');
              }}
            >
              <SelectTrigger><SelectValue placeholder={bankAccounts.length ? 'Select account' : 'No accounts found'} /></SelectTrigger>
              <SelectContent>
                {bankAccounts.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.account_name}{b.bank_name ? ` — ${b.bank_name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    );
  };

  const renderReimbursementForm = () => (
    (() => {
      const amt = formData.amount ? parseFloat(formData.amount) || 0 : 0;
      const gst = formData.gst_amount ? parseFloat(formData.gst_amount) || 0 : 0;
      const total = Math.round((amt + gst + Number.EPSILON) * 100) / 100;
      const status = formData.approval_status || 'Pending';
      const isPaid = status === 'Paid';
      const showPaymentFields = status === 'Approved' || status === 'Paid';
      const expType = formData.expense_type || '';
      const selectedVehicle = vehicles.find(v => v.id === formData.vehicle_id);
      const fuelLitres = formData.fuel_litres ? parseFloat(formData.fuel_litres) || 0 : 0;
      const fuelRate = formData.fuel_rate ? parseFloat(formData.fuel_rate) || 0 : 0;
      const fuelComputed = Math.round((fuelLitres * fuelRate + Number.EPSILON) * 100) / 100;
      return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Employee Name*</Label>
          <div ref={empPickerRef} className="relative">
            <button
              type="button"
              onClick={() => { setEmpSearch(''); setEmpPickerOpen(o => !o); }}
              className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
            >
              <span className={formData.employee_name ? '' : 'text-muted-foreground'}>
                {formData.employee_name || 'Select employee'}
              </span>
              <ChevronDown className={`h-4 w-4 opacity-50 transition-transform ${empPickerOpen ? 'rotate-180' : ''}`} />
            </button>
            {empPickerOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border bg-white dark:bg-gray-900 shadow-xl">
                <div className="flex items-center gap-2 border-b px-3 py-2">
                  <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input
                    autoFocus
                    type="text"
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    placeholder="Search employee…"
                    className="flex-1 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto py-1">
                  {visibleStaff.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {staffMembers.length === 0 ? 'No active employees found' : 'No match found'}
                    </p>
                  ) : (
                    visibleStaff.map((emp) => (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => { updateField('employee_name', emp.name); setEmpPickerOpen(false); }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <span className="truncate">{emp.name}</span>
                        {formData.employee_name === emp.name && <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-600" />}
                      </button>
                    ))
                  )}
                </div>
                {staffMembers.length > 0 && (
                  <p className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
                    {staffMembers.length} active employee{staffMembers.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}
          </div>
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
              <SelectItem value="Fuel">Fuel</SelectItem>
              <SelectItem value="Lodging">Lodging</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Description*</Label>
        <Input value={formData.description || ''} onChange={(e) => updateField('description', e.target.value)} placeholder="Expense details" />
      </div>

      {/* ── Expense-type-specific fields ─────────────────────────────────── */}
      {expType === 'Fuel' && (
        <div className="rounded-md border bg-muted/30 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fleet & Fuel Details</p>
            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={formData.fuel_log_to_fleet !== '0'}
                onChange={(e) => updateField('fuel_log_to_fleet', e.target.checked ? '1' : '0')}
              />
              <span>Also log to Fleet fuel history</span>
            </label>
          </div>
          {/* Vehicle picker (searchable, from Fleet) */}
          <div className="space-y-1">
            <Label>Vehicle*</Label>
            <div ref={vehPickerRef} className="relative">
              <button
                type="button"
                onClick={() => { setVehSearch(''); setVehPickerOpen(o => !o); }}
                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
              >
                <span className={selectedVehicle ? '' : 'text-muted-foreground'}>
                  {selectedVehicle ? `${selectedVehicle.model} — ${selectedVehicle.registrationNumber}` : 'Select vehicle'}
                </span>
                <ChevronDown className={`h-4 w-4 opacity-50 transition-transform ${vehPickerOpen ? 'rotate-180' : ''}`} />
              </button>
              {vehPickerOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border bg-white dark:bg-gray-900 shadow-xl">
                  <div className="flex items-center gap-2 border-b px-3 py-2">
                    <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <input autoFocus type="text" value={vehSearch} onChange={(e) => setVehSearch(e.target.value)} placeholder="Search vehicle…" className="flex-1 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground" />
                  </div>
                  <div className="max-h-52 overflow-y-auto py-1">
                    {visibleVehicles.length === 0 ? (
                      <p className="px-3 py-6 text-center text-sm text-muted-foreground">{vehicles.length === 0 ? 'No vehicles found' : 'No match found'}</p>
                    ) : (
                      visibleVehicles.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            // Reset trip when the vehicle changes; prefill fuel
                            // fields from the vehicle so nothing is retyped.
                            updateField('vehicle_id', v.id);
                            updateField('trip_id', '');
                            updateField('fuel_type', v.fuelType);
                            if (!formData.fuel_odometer) updateField('fuel_odometer', String(v.currentOdometer ?? ''));
                            setVehPickerOpen(false);
                          }}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <span className="truncate">{v.model} — {v.registrationNumber}</span>
                          <span className="text-[11px] text-muted-foreground uppercase">{v.fuelType}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Optional Trip link (scoped to the chosen vehicle) */}
          {selectedVehicle && (
            <div className="space-y-1">
              <Label>Trip (optional)</Label>
              <Select value={formData.trip_id || ''} onValueChange={(v) => updateField('trip_id', v)}>
                <SelectTrigger><SelectValue placeholder={tripLogs.length ? 'Link to a trip' : 'No trips for this vehicle'} /></SelectTrigger>
                <SelectContent>
                  {tripLogs.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.startDate ? new Date(t.startDate).toLocaleDateString('en-IN') : '—'} · {t.startLocation || '—'} → {t.destination || '—'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Litres*</Label>
              <Input type="number" min="0" step="0.01" value={formData.fuel_litres || ''} onChange={(e) => updateField('fuel_litres', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rate/Litre (₹)*</Label>
              <Input type="number" min="0" step="0.01" value={formData.fuel_rate || ''} onChange={(e) => updateField('fuel_rate', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fuel Cost (₹)</Label>
              <Input type="number" readOnly value={fuelComputed ? fuelComputed.toFixed(2) : ''} className="bg-muted" />
            </div>
            <div className="space-y-1 flex items-end">
              <Button type="button" variant="outline" size="sm" className="w-full" disabled={!fuelComputed} onClick={() => updateField('amount', String(fuelComputed))}>
                Use as Amount
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Odometer (km)</Label>
              <Input type="number" min="0" value={formData.fuel_odometer || ''} onChange={(e) => updateField('fuel_odometer', e.target.value)} placeholder="Current reading" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fuel Type</Label>
              <Input readOnly value={formData.fuel_type || selectedVehicle?.fuelType || ''} className="bg-muted capitalize" />
            </div>
          </div>
        </div>
      )}

      {expType === 'Travel' && (
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1"><Label>From</Label><Input value={formData.travel_from || ''} onChange={(e) => updateField('travel_from', e.target.value)} placeholder="Origin" /></div>
          <div className="space-y-1"><Label>To</Label><Input value={formData.travel_to || ''} onChange={(e) => updateField('travel_to', e.target.value)} placeholder="Destination" /></div>
          <div className="space-y-1"><Label>Mode</Label>
            <Select value={formData.travel_mode || ''} onValueChange={(v) => updateField('travel_mode', v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Bus">Bus</SelectItem>
                <SelectItem value="Train">Train</SelectItem>
                <SelectItem value="Flight">Flight</SelectItem>
                <SelectItem value="Taxi/Auto">Taxi/Auto</SelectItem>
                <SelectItem value="Own Vehicle">Own Vehicle</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {expType === 'Medical' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Nature of Treatment</Label><Input value={formData.medical_nature || ''} onChange={(e) => updateField('medical_nature', e.target.value)} placeholder="e.g. Consultation, Injury" /></div>
          <div className="space-y-1"><Label>Hospital / Clinic</Label><Input value={formData.medical_provider || ''} onChange={(e) => updateField('medical_provider', e.target.value)} placeholder="Provider name" /></div>
        </div>
      )}

      {expType === 'Communication' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Provider</Label><Input value={formData.comm_provider || ''} onChange={(e) => updateField('comm_provider', e.target.value)} placeholder="e.g. Jio, Airtel" /></div>
          <div className="space-y-1"><Label>Plan / Period</Label><Input value={formData.comm_period || ''} onChange={(e) => updateField('comm_period', e.target.value)} placeholder="e.g. Monthly recharge" /></div>
        </div>
      )}

      {expType === 'Lodging' && (
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1"><Label>Place / Hotel</Label><Input value={formData.lodging_place || ''} onChange={(e) => updateField('lodging_place', e.target.value)} placeholder="Hotel / city" /></div>
          <div className="space-y-1"><Label>Check-in</Label><Input type="date" value={formData.lodging_checkin || ''} onChange={(e) => updateField('lodging_checkin', e.target.value)} /></div>
          <div className="space-y-1"><Label>Check-out</Label><Input type="date" value={formData.lodging_checkout || ''} onChange={(e) => updateField('lodging_checkout', e.target.value)} /></div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>Amount (₹)*</Label>
          <Input type="number" min="0" value={formData.amount || ''} onChange={(e) => updateField('amount', e.target.value)} placeholder="Base amount" />
        </div>
        <div className="space-y-1">
          <Label>GST (₹)</Label>
          <Input type="number" min="0" value={formData.gst_amount || ''} onChange={(e) => updateField('gst_amount', e.target.value)} placeholder="If applicable" />
        </div>
        <div className="space-y-1">
          <Label>Total (₹)</Label>
          <Input type="number" readOnly value={total ? total.toFixed(2) : ''} className="bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Date of Expense*</Label>
          <Input type="date" value={formData.date_of_expense || ''} onChange={(e) => updateField('date_of_expense', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Bill/Receipt Reference</Label>
          <Input value={formData.bill_ref || ''} onChange={(e) => updateField('bill_ref', e.target.value)} placeholder="Bill or receipt number" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Approval Status</Label>
          <Select value={status} onValueChange={(v) => updateField('approval_status', v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Approved">Approved</SelectItem>
              <SelectItem value="Paid">Paid</SelectItem>
              <SelectItem value="Rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {showPaymentFields && (
          <div className="space-y-1">
            <Label>Payment Mode</Label>
            <Select value={formData.payment_mode || ''} onValueChange={(v) => updateField('payment_mode', v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="NEFT/RTGS">NEFT/RTGS</SelectItem>
                <SelectItem value="Cheque">Cheque</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {showPaymentFields && (
        <div className="space-y-1">
          <Label>Payment Date</Label>
          <Input type="date" value={formData.payment_date || ''} onChange={(e) => updateField('payment_date', e.target.value)} />
        </div>
      )}

      {isPaid && renderPaidFrom()}

      {/* Attachments: expense proof (the bill) + payment voucher (the payout) */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>
            Expense Proof (Bill/Receipt){expType === 'Fuel' ? ' *' : ''}
          </Label>
          <Input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            className="cursor-pointer"
            onChange={(e) => setProofFile(e.target.files?.[0] || null)}
          />
          {proofFile ? (
            <p className="text-xs text-green-600">Selected: {proofFile.name}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {expType === 'Fuel'
                ? 'Required — the fuel bill. Also attached to the Fleet fuel log.'
                : 'The claimed bill / receipt being reimbursed.'}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label>
            Payment Voucher (Proof of Payment){isPaid ? ' *' : ''}
          </Label>
          <Input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            className="cursor-pointer"
            onChange={(e) => setVoucherFile(e.target.files?.[0] || null)}
          />
          {voucherFile ? (
            <p className="text-xs text-green-600">Selected: {voucherFile.name}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {isPaid
                ? 'Required to mark Paid. Bank/UPI receipt or signed voucher.'
                : 'Optional now; required once you mark it Paid.'}
            </p>
          )}
        </div>
      </div>
    </div>
      );
    })()
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

  const renderTaxesForm = () => {
    const isGst = formData.tax_type === 'GST';
    const n = (v: any) => (v ? parseFloat(v) || 0 : 0);
    const inr2s = (v: number) => `₹${(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const isOverride = formData.tax_override === '1';
    const isItcOverride = formData.itc_override === '1';

    // GST auto-fill state (only meaningful once a month is chosen). The optional
    // ITC override feeds directly into the net-payable computation.
    const itcOverrideVal = isItcOverride && formData.itc_amount !== undefined && formData.itc_amount !== ''
      ? parseFloat(formData.itc_amount)
      : undefined;
    const liab = isGst && formData.gst_month ? gstLiability.computePeriodLiability(formData.gst_month, itcOverrideVal) : null;
    const amtNum = n(formData.amount);
    const splitSum = n(formData.cgst) + n(formData.sgst) + n(formData.igst);
    const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
    const splitMismatch = isGst && round2(splitSum) !== round2(amtNum);
    const alreadyClear = !!liab && liab.remaining <= 0;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Tax Type*</Label>
            <Select
              value={formData.tax_type || ''}
              onValueChange={(v) => {
                updateField('tax_type', v);
                if (v !== 'GST') {
                  ['cgst', 'sgst', 'igst', 'cess', 'interest', 'late_fee', 'gst_month', 'tax_override', 'tax_interstate', 'itc_override', 'itc_amount'].forEach(k => updateField(k, ''));
                }
              }}
            >
              <SelectTrigger><SelectValue placeholder="Select tax type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="GST">GST (GSTR-3B)</SelectItem>
                <SelectItem value="TDS">TDS</SelectItem>
                <SelectItem value="Professional Tax">Professional Tax</SelectItem>
                <SelectItem value="Income Tax">Income Tax</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{isGst ? 'Return Period (Month)*' : 'Assessment Period*'}</Label>
            {isGst ? (
              <Select value={formData.gst_month || ''} onValueChange={(v) => updateField('gst_month', v)}>
                <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
                <SelectContent>
                  {gstLiability.periodOptions.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No GST months found yet</div>
                  )}
                  {gstLiability.periodOptions.map((key) => (
                    <SelectItem key={key} value={key}>{gstLiability.periodLabelOf(key)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={formData.assessment_period || ''} onChange={(e) => updateField('assessment_period', e.target.value)} placeholder="e.g. Q1 FY 2025-26" />
            )}
          </div>
        </div>

        {/* Authority / department the payment is made to */}
        <div className="space-y-1">
          <Label>Paid To (Authority)</Label>
          <Input
            value={formData.authority ?? (isGst ? 'GST Department' : '')}
            onChange={(e) => updateField('authority', e.target.value)}
            placeholder={isGst ? 'GST Department' : 'e.g. Income Tax Dept, State PT Authority'}
          />
        </div>

        {/* Auto-computed GST liability summary for the chosen month */}
        {isGst && liab && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Output GST</span><span className="font-medium">{inr2s(liab.output)}</span></div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-muted-foreground">
                <input type="checkbox" checked={isItcOverride} onChange={(e) => updateField('itc_override', e.target.checked ? '1' : '')} />
                <span>Less: ITC {isItcOverride ? '(overridden)' : '(auto)'}</span>
              </label>
              {isItcOverride ? (
                <Input type="number" min="0" value={formData.itc_amount || ''} onChange={(e) => updateField('itc_amount', e.target.value)} className="h-7 w-32 text-right text-xs" placeholder="ITC used" />
              ) : (
                <span className="font-medium">− {inr2s(liab.itc)}</span>
              )}
            </div>
            {isItcOverride && liab.computedItc !== liab.itc && (
              <div className="flex justify-between text-[11px] text-muted-foreground"><span>Computed ITC (from purchases)</span><span>{inr2s(liab.computedItc)}</span></div>
            )}
            <div className="flex justify-between border-t pt-1"><span className="text-muted-foreground">Net Payable</span><span className="font-semibold">{inr2s(liab.net)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Already Paid</span><span className="font-medium text-green-600">− {inr2s(liab.paid)}</span></div>
            <div className="flex justify-between border-t pt-1"><span className="text-muted-foreground">Remaining (auto-filled)</span><span className={`font-bold ${liab.remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>{inr2s(liab.remaining)}</span></div>
            <div className="flex justify-between text-[11px] text-muted-foreground pt-1"><span>Due date (auto)</span><span>{new Date(liab.dueDate).toLocaleDateString('en-IN')}</span></div>
          </div>
        )}

        {isGst && alreadyClear && (
          <div className="rounded-md border border-green-300 bg-green-50 dark:bg-green-950/20 px-3 py-2 text-xs text-green-700 dark:text-green-400">
            This period is already fully settled. Recording another payment will overpay it.
          </div>
        )}

        {/* GST manual-override toggle. The CGST/SGST/IGST split is derived
            exactly from each invoice's place of supply, so no inter-state guess
            is needed — override is only for part-payments / exceptions. */}
        {isGst && (
          <div className="flex items-center gap-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isOverride} onChange={(e) => updateField('tax_override', e.target.checked ? '1' : '')} />
              <span>Manual override (part-payment / adjust)</span>
            </label>
          </div>
        )}

        {/* GST tax breakdown — auto for GST (read-only) unless override. */}
        {isGst && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">GST Breakup (challan components)</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">CGST (₹)</Label>
                <Input type="number" min="0" value={formData.cgst || ''} readOnly={!isOverride} className={!isOverride ? 'bg-muted' : ''} onChange={(e) => updateField('cgst', e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">SGST (₹)</Label>
                <Input type="number" min="0" value={formData.sgst || ''} readOnly={!isOverride} className={!isOverride ? 'bg-muted' : ''} onChange={(e) => updateField('sgst', e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">IGST (₹)</Label>
                <Input type="number" min="0" value={formData.igst || ''} readOnly={!isOverride} className={!isOverride ? 'bg-muted' : ''} onChange={(e) => updateField('igst', e.target.value)} placeholder="0" />
              </div>
            </div>
            {splitMismatch && (
              <p className="text-[11px] text-amber-600">CGST + SGST + IGST ({inr2s(splitSum)}) must equal Total Amount ({inr2s(amtNum)}).</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Total Amount (₹)*</Label>
            <Input type="number" min="0" value={formData.amount || ''} readOnly={isGst && !isOverride} className={isGst && !isOverride ? 'bg-muted' : ''} onChange={(e) => updateField('amount', e.target.value)} placeholder={isGst ? 'Auto from liability' : 'Tax amount'} />
          </div>
          <div className="space-y-1">
            <Label>Due Date*</Label>
            <Input type="date" value={formData.due_date || ''} onChange={(e) => updateField('due_date', e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Payment Date</Label>
            <Input type="date" value={formData.payment_date || ''} onChange={(e) => updateField('payment_date', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Payment Mode</Label>
            <Select value={formData.payment_mode || ''} onValueChange={(v) => updateField('payment_mode', v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="NEFT/RTGS">NEFT/RTGS</SelectItem>
                <SelectItem value="Cheque">Cheque</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>{isGst ? 'Challan / CIN Number' : 'Challan Number'}</Label>
            <Input value={formData.challan_number || ''} onChange={(e) => updateField('challan_number', e.target.value)} placeholder={isGst ? 'CIN / challan no.' : 'Challan/receipt number'} />
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

        {isGst && (
          <p className="text-[11px] text-muted-foreground">
            Amount, tax split and due date are auto-derived from the selected month&apos;s computed liability. Turn on Manual override only for part-payments or exceptions.
          </p>
        )}
      </div>
    );
  };

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
    (() => {
      const amt = formData.amount ? parseFloat(formData.amount) || 0 : 0;
      const gst = formData.gst_amount ? parseFloat(formData.gst_amount) || 0 : 0;
      const total = Math.round((amt + gst + Number.EPSILON) * 100) / 100;
      const cat = formData.aux_category || '';
      const status = formData.payment_status || 'Pending';
      const showPaymentFields = status === 'Paid';
      // Categories that have a better dedicated home — steer the user there.
      const redirectHint: Record<string, string> = {
        'Security Equipment': 'Use the “Vendor & Supplies” tab for uniforms, arms and equipment.',
        Fuel: 'Use “Reimbursements → Fuel” (linked to a fleet vehicle) or “Vendor & Supplies” for bulk fuel.',
        Training: 'PSARA/statutory training belongs under “Compliance & Licenses”.',
      };
      return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Category*</Label>
          <Select value={cat} onValueChange={(v) => updateField('aux_category', v)}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Bank Charges">Bank Charges</SelectItem>
              <SelectItem value="Printing & Stationery">Printing &amp; Stationery</SelectItem>
              <SelectItem value="Postage & Courier">Postage &amp; Courier</SelectItem>
              <SelectItem value="Software & Subscriptions">Software &amp; Subscriptions</SelectItem>
              <SelectItem value="Office Repairs & Maintenance">Office Repairs &amp; Maintenance</SelectItem>
              <SelectItem value="Recruitment & Verification">Recruitment &amp; Verification</SelectItem>
              <SelectItem value="Legal & Professional">Legal &amp; Professional (one-off)</SelectItem>
              <SelectItem value="Marketing & Advertising">Marketing &amp; Advertising</SelectItem>
              <SelectItem value="Membership & Subscriptions">Membership &amp; Subscriptions</SelectItem>
              <SelectItem value="Office Refreshments">Office Refreshments / Pantry</SelectItem>
              <SelectItem value="Insurance (non-statutory)">Insurance (non-statutory)</SelectItem>
              <SelectItem value="Donations / CSR">Donations / CSR</SelectItem>
              <SelectItem value="Miscellaneous">Miscellaneous</SelectItem>
            </SelectContent>
          </Select>
          {redirectHint[cat] && (
            <p className="text-[11px] text-amber-600">{redirectHint[cat]}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label>Date*</Label>
          <Input type="date" value={formData.date || ''} onChange={(e) => updateField('date', e.target.value)} />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Description*</Label>
        <Input value={formData.description || ''} onChange={(e) => updateField('description', e.target.value)} placeholder="What was this expense for?" />
      </div>

      {/* ── Category-specific fields ─────────────────────────────────────── */}
      {(cat === 'Software & Subscriptions' || cat === 'Membership & Subscriptions') && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Billing Cycle</Label>
            <Select value={formData.oe_billing_cycle || ''} onValueChange={(v) => updateField('oe_billing_cycle', v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Monthly">Monthly</SelectItem>
                <SelectItem value="Quarterly">Quarterly</SelectItem>
                <SelectItem value="Half-Yearly">Half-Yearly</SelectItem>
                <SelectItem value="Yearly">Yearly</SelectItem>
                <SelectItem value="One-time">One-time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{cat === 'Membership & Subscriptions' ? 'Valid Till' : 'Renewal Date'}</Label>
            <Input type="date" value={formData.oe_renewal_date || ''} onChange={(e) => updateField('oe_renewal_date', e.target.value)} />
          </div>
        </div>
      )}

      {cat === 'Recruitment & Verification' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Candidate / Employee</Label>
            <Input value={formData.oe_candidate || ''} onChange={(e) => updateField('oe_candidate', e.target.value)} placeholder="Name" />
          </div>
          <div className="space-y-1">
            <Label>Purpose</Label>
            <Select value={formData.oe_purpose || ''} onValueChange={(v) => updateField('oe_purpose', v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Job Posting">Job Posting</SelectItem>
                <SelectItem value="Background Check">Background Check</SelectItem>
                <SelectItem value="Police Verification">Police Verification</SelectItem>
                <SelectItem value="PSARA Verification">PSARA Verification</SelectItem>
                <SelectItem value="Medical Test">Medical Test</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {cat === 'Insurance (non-statutory)' && (
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label>Policy No.</Label>
            <Input value={formData.oe_policy_no || ''} onChange={(e) => updateField('oe_policy_no', e.target.value)} placeholder="Policy number" />
          </div>
          <div className="space-y-1">
            <Label>Cover From</Label>
            <Input type="date" value={formData.oe_cover_from || ''} onChange={(e) => updateField('oe_cover_from', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Cover To</Label>
            <Input type="date" value={formData.oe_cover_to || ''} onChange={(e) => updateField('oe_cover_to', e.target.value)} />
          </div>
        </div>
      )}

      {cat === 'Office Repairs & Maintenance' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Asset / Equipment</Label>
            <Input value={formData.oe_asset || ''} onChange={(e) => updateField('oe_asset', e.target.value)} placeholder="e.g. AC, Generator, CCTV DVR" />
          </div>
          <div className="space-y-1">
            <Label>Warranty Till (optional)</Label>
            <Input type="date" value={formData.oe_warranty_till || ''} onChange={(e) => updateField('oe_warranty_till', e.target.value)} />
          </div>
        </div>
      )}

      {cat === 'Bank Charges' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Bank / Account</Label>
            <Input value={formData.oe_bank || ''} onChange={(e) => updateField('oe_bank', e.target.value)} placeholder="Bank & last 4 of A/C" />
          </div>
          <div className="space-y-1">
            <Label>Nature of Charge</Label>
            <Select value={formData.oe_charge_type || ''} onValueChange={(v) => updateField('oe_charge_type', v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Transaction Charges">Transaction Charges</SelectItem>
                <SelectItem value="Cheque Bounce">Cheque Bounce</SelectItem>
                <SelectItem value="Account Maintenance">Account Maintenance</SelectItem>
                <SelectItem value="Card / POS">Card / POS</SelectItem>
                <SelectItem value="Loan / Interest">Loan / Interest</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>Amount (₹)*</Label>
          <Input type="number" min="0" value={formData.amount || ''} onChange={(e) => updateField('amount', e.target.value)} placeholder="Base amount" />
        </div>
        <div className="space-y-1">
          <Label>GST (₹)</Label>
          <Input type="number" min="0" value={formData.gst_amount || ''} onChange={(e) => updateField('gst_amount', e.target.value)} placeholder="If applicable" />
        </div>
        <div className="space-y-1">
          <Label>Total (₹)</Label>
          <Input type="number" readOnly value={total ? total.toFixed(2) : ''} className="bg-muted" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Vendor / Payee</Label>
          <Input value={formData.vendor_name || ''} onChange={(e) => updateField('vendor_name', e.target.value)} placeholder="Vendor name (if any)" />
        </div>
        <div className="space-y-1">
          <Label>Bill / Reference No.</Label>
          <Input value={formData.reference_number || ''} onChange={(e) => updateField('reference_number', e.target.value)} placeholder="Invoice / receipt number" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Payment Status</Label>
          <Select value={status} onValueChange={(v) => updateField('payment_status', v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {showPaymentFields && (
          <div className="space-y-1">
            <Label>Payment Mode</Label>
            <Select value={formData.payment_mode || ''} onValueChange={(v) => updateField('payment_mode', v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="NEFT/RTGS">NEFT/RTGS</SelectItem>
                <SelectItem value="Cheque">Cheque</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {showPaymentFields && renderPaidFrom()}

      {/* Expense proof (the bill/receipt) */}
      <div className="space-y-1">
        <Label>Expense Proof (Bill/Receipt){showPaymentFields ? ' *' : ''}</Label>
        <Input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          className="cursor-pointer"
          onChange={(e) => setProofFile(e.target.files?.[0] || null)}
        />
        {proofFile ? (
          <p className="text-xs text-green-600">Selected: {proofFile.name}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {showPaymentFields ? 'Required when marking Paid — the bill/receipt.' : 'Attach the bill/receipt for this expense.'}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label>Notes</Label>
        <Textarea value={formData.notes || ''} onChange={(e) => updateField('notes', e.target.value)} placeholder="Additional details..." rows={2} />
      </div>
    </div>
      );
    })()
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
      case 'Reimbursements': return 'Record Reimbursement';
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
          <Button onClick={() => { setFormData({}); setVoucherFile(null); setProofFile(null); setShowAddForm(true); }}>
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
                      <div className="flex items-center justify-end gap-2">
                        {(() => {
                          const proof = entry.expense_proof_url || entry.notes?.match(/Expense Proof:\s*(\S+)/)?.[1];
                          return proof ? (
                            <a href={proof} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" title="View expense proof (bill/receipt)">
                              <FileText className="h-3.5 w-3.5" /> Bill
                            </a>
                          ) : null;
                        })()}
                        {entry.voucher_url && (
                          <a
                            href={entry.voucher_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            title="View proof of payment"
                          >
                            <FileText className="h-3.5 w-3.5" /> Voucher
                          </a>
                        )}
                        {entry.status === 'pending' && (
                          <Button size="sm" variant="outline" onClick={() => markAsPaid.mutate(entry.id)}>
                            Mark Paid
                          </Button>
                        )}
                      </div>
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
        <DialogContent className="sm:max-w-[1100px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{getDialogTitle()}</DialogTitle>
          </DialogHeader>

          {renderAddForm()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createPayable.isPending || voucherUploading}>
              {voucherUploading ? 'Uploading voucher…' : createPayable.isPending ? 'Saving...' : 'Save Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
