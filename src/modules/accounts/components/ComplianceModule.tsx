'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Search, Download, IndianRupee, Loader2, FileText, AlertTriangle, CalendarClock } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { exportToCSV, exportToJSON, exportToExcel, exportToPDF } from '../utils/complianceExport';
import { CountUp } from '@/components/dashboard/CountUp';
import { formatINRShort } from '@/lib/format';
import { useGstLiability } from '@/modules/accounts/hooks/useGstLiability';

/**
 * Format a rupee amount with Indian digit grouping and exactly 2 decimals
 * (paise). Unlike the shared formatINR/formatCurrency helpers, this keeps paise
 * because GST figures are money-precise and must not show floating-point tails
 * such as "454677.0096774192" nor be rounded away to whole rupees.
 */
const inr2 = (value: number): string =>
  `₹${(Number(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Compose a GST ledger description as "Post Name | Invoice Number" from a
 * receivables row. Post name lives in the line_items[].post JSON (there is no
 * post-name column); invoice number is the reference_number column. Both can be
 * absent on legacy rows, so fall back to the stored description / any available
 * part rather than rendering an empty cell.
 */
const ledgerDescriptionOf = (row: any): string => {
  const items = Array.isArray(row?.line_items) ? row.line_items : [];
  const postNames = [...new Set(items.map((li: any) => li?.post).filter(Boolean))].join(', ');
  // Invoice number: prefer the dedicated column, else parse the "| Inv#: NNNN"
  // suffix that the invoice writers embed into description.
  const invNo =
    row?.reference_number ||
    (typeof row?.description === 'string' ? (row.description.match(/Inv#:\s*([^\s|]+)/i)?.[1] ?? '') : '');

  if (postNames && invNo) return `${postNames} | ${invNo}`;
  if (postNames) return postNames;
  if (invNo) return invNo;
  return row?.description || '—';
};

export interface ComplianceModuleProps {
  filter: string;
}

interface ComplianceEntry {
  id: string;
  category: string;
  sub_type: string;
  period: string;
  amount: number;
  due_date: string | null;
  filing_date: string | null;
  status: 'pending' | 'filed' | 'paid' | 'overdue';
  reference_number: string | null;
  notes: string | null;
  created_at: string;
}

const STATUS_OPTIONS = ['pending', 'filed', 'paid', 'overdue'];

/**
 * GST Filing Due Date Alerts — shows upcoming GSTR-1 (11th) and GSTR-3B (20th) deadlines
 * with color-coded urgency. Per Indian GST law, monthly filers must file:
 * - GSTR-1 by the 11th of the following month
 * - GSTR-3B by the 20th of the following month
 * Late fee: ₹50/day (₹25 CGST + ₹25 SGST) + interest @18% p.a. on tax payable.
 */
function GSTFilingAlerts() {
  const today = new Date();
  const currentDay = today.getDate();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Filing period is previous month
  const filingPeriod = new Date(currentYear, currentMonth - 1, 1);
  const periodLabel = filingPeriod.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  // Due dates for current month
  const gstr1Due = new Date(currentYear, currentMonth, 11);
  const gstr3bDue = new Date(currentYear, currentMonth, 20);

  const daysToGstr1 = Math.ceil((gstr1Due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const daysToGstr3b = Math.ceil((gstr3bDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Determine alert states
  const getAlertState = (daysRemaining: number) => {
    if (daysRemaining < 0) return { color: 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800', textColor: 'text-red-700 dark:text-red-400', label: 'OVERDUE', icon: AlertTriangle };
    if (daysRemaining <= 2) return { color: 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800', textColor: 'text-amber-700 dark:text-amber-400', label: 'DUE SOON', icon: AlertTriangle };
    if (daysRemaining <= 5) return { color: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800', textColor: 'text-yellow-700 dark:text-yellow-400', label: 'UPCOMING', icon: CalendarClock };
    return { color: 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800', textColor: 'text-green-700 dark:text-green-400', label: 'ON TRACK', icon: CalendarClock };
  };

  const gstr1State = getAlertState(daysToGstr1);
  const gstr3bState = getAlertState(daysToGstr3b);

  // Only show alerts if within the filing window (1st to 20th of the month)
  if (currentDay > 20) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* GSTR-1 Alert */}
      {currentDay <= 11 && (
        <div className={`flex items-center gap-3 p-3 rounded-lg border ${gstr1State.color}`}>
          <gstr1State.icon className={`h-4 w-4 shrink-0 ${gstr1State.textColor}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold ${gstr1State.textColor}`}>{gstr1State.label}</span>
              <span className="text-xs text-muted-foreground">GSTR-1 for {periodLabel}</span>
            </div>
            <p className={`text-sm font-medium ${gstr1State.textColor}`}>
              {daysToGstr1 < 0
                ? `Overdue by ${Math.abs(daysToGstr1)} day${Math.abs(daysToGstr1) > 1 ? 's' : ''} — late fee ₹50/day`
                : daysToGstr1 === 0
                ? 'Due today (11th)'
                : `Due on 11th (${daysToGstr1} day${daysToGstr1 > 1 ? 's' : ''} left)`}
            </p>
          </div>
        </div>
      )}

      {/* GSTR-3B Alert */}
      <div className={`flex items-center gap-3 p-3 rounded-lg border ${gstr3bState.color}`}>
        <gstr3bState.icon className={`h-4 w-4 shrink-0 ${gstr3bState.textColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${gstr3bState.textColor}`}>{gstr3bState.label}</span>
            <span className="text-xs text-muted-foreground">GSTR-3B for {periodLabel}</span>
          </div>
          <p className={`text-sm font-medium ${gstr3bState.textColor}`}>
            {daysToGstr3b < 0
              ? `Overdue by ${Math.abs(daysToGstr3b)} day${Math.abs(daysToGstr3b) > 1 ? 's' : ''} — late fee ₹50/day + 18% interest`
              : daysToGstr3b === 0
              ? 'Due today (20th)'
              : `Due on 20th (${daysToGstr3b} day${daysToGstr3b > 1 ? 's' : ''} left)`}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ComplianceModule({ filter }: ComplianceModuleProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});

  // Map filter to active section
  const activeSection = filter === 'TDS' ? 'tds'
    : filter === 'EPF / ESIC / PT' ? 'epf'
    : filter === 'Ledger Book' ? 'ledger'
    : 'gst';

  // Internal sub-tab for GST section
  const [gstSubTab, setGstSubTab] = useState('gstr1');

  // GST return period. 'all' = lifetime; otherwise a 'YYYY-MM' key that scopes
  // every GST view (GSTR-1/3B/ITC/ledger) to a single filing month.
  const [gstPeriod, setGstPeriod] = useState<string>('all');

  // ─── GST AUTO-PULL: Receivables (Outward / GSTR-1) ────────────────────────
  const { data: gstOutward = [], isLoading: loadingOutward } = useQuery({
    queryKey: ['compliance', 'gst-outward'],
    queryFn: async () => {
      // Include forward-charge GST invoices AND RCM supplies (which have no agency GST but
      // must still be reported in GSTR-1). Credit notes carry a negative gst_amount and debit
      // notes a positive one — both must be pulled in so the summed output tax nets correctly.
      const { data, error } = await supabaseClient
        .from('receivables')
        .select('id, description, client_name, amount, gst_amount, total_amount, status, created_at, gst_treatment, reference_number, line_items')
        .or('gst_amount.gt.0,gst_amount.lt.0,gst_treatment.eq.rcm')
        // Cancelled invoices create no GST liability, so keep them out of every
        // GST computation (GSTR-1, GSTR-3B, ITC, ledger).
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });
      if (error) { console.warn('Failed to fetch GST outward:', error.message); return []; }
      return data ?? [];
    },
    enabled: activeSection === 'gst',
  });

  // Split outward supplies by GST treatment (full, unfiltered by period).
  const forwardOutwardAll = useMemo(() => gstOutward.filter((e: any) => (e.gst_treatment || 'forward') !== 'rcm'), [gstOutward]);
  const rcmOutwardAll = useMemo(() => gstOutward.filter((e: any) => e.gst_treatment === 'rcm'), [gstOutward]);

  // ─── GST AUTO-PULL: Payables (Inward / ITC) ──────────────────────────────
  const { data: gstInwardAll = [], isLoading: loadingInward } = useQuery({
    queryKey: ['compliance', 'gst-inward'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('payables')
        .select('id, description, vendor_name, amount, gst_amount, total_amount, status, created_at')
        .not('gst_amount', 'is', null)
        .gt('gst_amount', 0)
        // Rejected payables are not valid purchases, so no ITC may be claimed.
        .neq('status', 'rejected')
        .order('created_at', { ascending: false });
      if (error) { console.warn('Failed to fetch GST inward:', error.message); return []; }
      return data ?? [];
    },
    enabled: activeSection === 'gst',
  });

  // ─── GST PAYMENTS (challans paid to government) ──────────────────────────
  // These are recorded as payables under 'Statutory & Taxes' with a GST tax
  // type. Payments recorded from this screen carry a structured
  // "GST Period: YYYY-MM" tag in notes so they can be matched to a return
  // period; older/ManagePayables entries without the tag are treated as
  // unallocated (period 'all') so they still reduce the lifetime balance.
  const { data: gstPayments = [] } = useQuery({
    queryKey: ['compliance', 'gst-payments'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('payables')
        .select('id, description, amount, total_amount, reference_number, notes, status, created_at')
        .eq('category', 'Statutory & Taxes')
        .ilike('notes', '%Tax Type: GST%')
        .neq('status', 'rejected')
        .order('created_at', { ascending: false });
      if (error) { console.warn('Failed to fetch GST payments:', error.message); return []; }
      return data ?? [];
    },
    enabled: activeSection === 'gst',
  });

  // Extract the machine-readable "GST Period: YYYY-MM" tag from a payment's
  // notes; returns null when untagged (legacy / free-text period entries).
  const paymentPeriodOf = (p: any): string | null => {
    const m = typeof p?.notes === 'string' ? p.notes.match(/GST Period:\s*(\d{4}-\d{2})/) : null;
    return m ? m[1] : null;
  };

  // ─── GST RETURN PERIOD (month) SCOPING ───────────────────────────────────
  // Key a row into a 'YYYY-MM' bucket, and a human label for the dropdown.
  const periodKeyOf = (createdAt: string) => {
    const d = new Date(createdAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const periodLabelOf = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { year: 'numeric', month: 'long' });
  };

  // Distinct months present across outward + inward, newest first.
  const periodOptions = useMemo(() => {
    const keys = new Set<string>();
    [...gstOutward, ...gstInwardAll].forEach((e: any) => { if (e.created_at) keys.add(periodKeyOf(e.created_at)); });
    return Array.from(keys).sort((a, b) => (a < b ? 1 : -1));
  }, [gstOutward, gstInwardAll]);

  const inPeriod = (e: any) => gstPeriod === 'all' || periodKeyOf(e.created_at) === gstPeriod;

  // Period-scoped lists. All downstream views (GSTR-1/3B/ITC/ledger) consume
  // these, so the selector flows everywhere from one place.
  const forwardOutward = useMemo(() => forwardOutwardAll.filter(inPeriod), [forwardOutwardAll, gstPeriod]);
  const rcmOutward = useMemo(() => rcmOutwardAll.filter(inPeriod), [rcmOutwardAll, gstPeriod]);
  const gstInward = useMemo(() => gstInwardAll.filter(inPeriod), [gstInwardAll, gstPeriod]);
  // GSTR-1 lists every outward supply (forward + RCM), period-scoped.
  const gstOutwardScoped = useMemo(() => gstOutward.filter(inPeriod), [gstOutward, gstPeriod]);

  // ─── GSTR-3B CALCULATIONS ────────────────────────────────────────────────
  const gstr3bSummary = useMemo(() => {
    // Round to paise (2 dp) after summation. Per-invoice GST can be a
    // non-terminating decimal (e.g. monthly price ÷ 31 days), and summing many
    // such values in binary floating point accumulates error that surfaces as
    // long tails like 454677.0096774192. Rounding here keeps money at 2 dp.
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

    // Only forward-charge supplies create output GST liability for the agency.
    // RCM supplies are reported but the tax is paid by the recipient, so they're excluded here.
    const totalOutputGST = round2(forwardOutward.reduce((s: number, e: any) => s + (e.gst_amount || 0), 0));
    const totalITC = round2(gstInward.reduce((s: number, e: any) => s + (e.gst_amount || 0), 0));
    const netPayable = round2(totalOutputGST - totalITC);
    const rcmTurnover = round2(rcmOutward.reduce((s: number, e: any) => s + (e.amount || 0), 0));

    // Month-wise breakdown (forward-charge output only)
    const monthMap: Record<string, { output: number; itc: number }> = {};
    forwardOutward.forEach((e: any) => {
      const month = new Date(e.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
      if (!monthMap[month]) monthMap[month] = { output: 0, itc: 0 };
      monthMap[month].output += e.gst_amount || 0;
    });
    gstInward.forEach((e: any) => {
      const month = new Date(e.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
      if (!monthMap[month]) monthMap[month] = { output: 0, itc: 0 };
      monthMap[month].itc += e.gst_amount || 0;
    });
    const monthWise = Object.entries(monthMap)
      .map(([month, vals]) => {
        const output = round2(vals.output);
        const itc = round2(vals.itc);
        return { month, output, itc, net: round2(output - itc) };
      })
      .sort((a, b) => new Date(b.month).getTime() - new Date(a.month).getTime());

    return { totalOutputGST, totalITC, netPayable, rcmTurnover, monthWise };
  }, [forwardOutward, rcmOutward, gstInward]);

  // ─── GST PAID / REMAINING (settlement against net payable) ───────────────
  // Sum GST payments applicable to the selected period. A period-tagged payment
  // counts only in its own month; an untagged payment counts toward the
  // lifetime ('all') view so nothing is silently dropped.
  const gstSettlement = useMemo(() => {
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const paid = round2(
      gstPayments.reduce((s: number, p: any) => {
        const tag = paymentPeriodOf(p);
        const applies = gstPeriod === 'all' ? true : tag === gstPeriod;
        return applies ? s + (p.amount || p.total_amount || 0) : s;
      }, 0)
    );
    const netPayable = gstr3bSummary.netPayable;
    // Remaining liability can't be negative for display purposes; an overpayment
    // is surfaced separately.
    const remaining = round2(netPayable - paid);
    return { paid, remaining, overpaid: remaining < 0 ? Math.abs(remaining) : 0 };
  }, [gstPayments, gstPeriod, gstr3bSummary.netPayable]);

  // Full GST liability + settlement for ANY month key (YYYY-MM), used by the
  // Record GST Payment dialog to AUTO-FILL every value. Delegates to the shared
  // hook so the CGST/SGST/IGST split is derived EXACTLY from each invoice's
  // persisted place of supply (gst_type) — never a blanket 50/50 assumption —
  // and stays identical to the ManagePayables tax form.
  const { computePeriodLiability } = useGstLiability(activeSection === 'gst');

  // ─── GST LEDGER (Combined chronological view) ────────────────────────────
  const gstLedger = useMemo(() => {
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const entries: any[] = [];
    // Only forward-charge output GST is the agency's liability. RCM supplies are
    // reported in GSTR-1 but the tax is discharged by the recipient, so they must
    // NOT post to the agency's GST ledger — otherwise the running balance won't
    // reconcile with the Net GST Payable shown in the GSTR-3B summary.
    forwardOutward.forEach((e: any) => {
      // Output GST is normally a credit. A credit note carries a NEGATIVE
      // gst_amount — that reduces output liability, so post its absolute value
      // to the debit side instead of showing a negative credit.
      const gst = e.gst_amount || 0;
      const isCreditNote = gst < 0;
      entries.push({
        id: e.id,
        date: e.created_at,
        description: ledgerDescriptionOf(e),
        party: e.client_name || '—',
        type: isCreditNote ? 'Output (Credit Note)' : 'Output',
        debit: isCreditNote ? Math.abs(gst) : 0,
        credit: isCreditNote ? 0 : gst,
      });
    });
    gstInward.forEach((e: any) => {
      // ITC is normally a debit. A negative inward adjustment reverses ITC, so
      // post its absolute value to the credit side.
      const gst = e.gst_amount || 0;
      const isReversal = gst < 0;
      entries.push({
        id: e.id,
        date: e.created_at,
        description: e.description,
        party: e.vendor_name || '—',
        type: isReversal ? 'Input (ITC Reversal)' : 'Input (ITC)',
        debit: isReversal ? 0 : gst,
        credit: isReversal ? Math.abs(gst) : 0,
      });
    });
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Opening balance: when scoped to a single month, seed the running balance
    // with the net GST position (output − ITC) accrued in ALL prior periods, so
    // the closing balance still reflects the true cumulative liability rather
    // than resetting to zero at the start of the month.
    let opening = 0;
    if (gstPeriod !== 'all') {
      const priorNet = (list: any[], sign: 1 | -1) =>
        list.reduce((s, e) => (periodKeyOf(e.created_at) < gstPeriod ? s + sign * (e.gst_amount || 0) : s), 0);
      opening = round2(priorNet(forwardOutwardAll, 1) - priorNet(gstInwardAll, 1));
    }

    // Calculate running balance (rounded to paise so it reconciles exactly with
    // the Net GST Payable card and avoids floating-point drift).
    let balance = opening;
    entries.forEach(e => {
      balance = round2(balance + (e.credit || 0) - (e.debit || 0));
      e.balance = balance;
    });

    // Surface the opening balance as a synthetic first row when non-zero, so the
    // ledger clearly shows the carried-forward position for the selected month.
    if (gstPeriod !== 'all' && opening !== 0) {
      entries.unshift({
        id: `opening-${gstPeriod}`,
        date: `${gstPeriod}-01T00:00:00`,
        description: `Opening balance (carried forward)`,
        party: '—',
        type: 'Opening',
        debit: 0,
        credit: 0,
        balance: opening,
        isOpening: true,
      });
    }
    return entries;
  }, [forwardOutward, gstInward, forwardOutwardAll, gstInwardAll, gstPeriod]);

  // ─── RECORD GST PAYMENT (challan) ────────────────────────────────────────
  // Persists the payment as a 'Statutory & Taxes' payable (same pipeline as
  // ManagePayables) with a machine-readable "GST Period: YYYY-MM" tag, so it
  // both appears in the general Ledger Book and settles the GST net payable
  // for the correct return period. No separate table is used.
  const [gstPayOpen, setGstPayOpen] = useState(false);
  // Only the fields a human genuinely decides are editable (period, actual date
  // paid, challan no., mode). Amount and tax split are AUTO-DERIVED from the
  // computed liability to eliminate manual-entry errors, with an explicit
  // override switch for exceptional cases (e.g. part-payment / inter-state).
  const [gstPayForm, setGstPayForm] = useState<{
    period: string; date: string; challan: string; mode: string;
    override: boolean; interState: boolean;
    itcOverride: boolean; itcAmount: string;
    amount: string; cgst: string; sgst: string; igst: string;
  }>({ period: '', date: '', challan: '', mode: '', override: false, interState: false, itcOverride: false, itcAmount: '', amount: '', cgst: '', sgst: '', igst: '' });

  // Auto-derive amount + tax split from the selected month unless the user has
  // switched on manual override. Runs whenever the period, override, or
  // inter-state toggle changes, and when the dialog opens.
  useEffect(() => {
    if (!gstPayOpen || !gstPayForm.period || gstPayForm.override) return;
    const itcOv = gstPayForm.itcOverride && gstPayForm.itcAmount !== '' ? parseFloat(gstPayForm.itcAmount) : undefined;
    const c = computePeriodLiability(gstPayForm.period, itcOv);
    setGstPayForm(f => ({
      ...f,
      amount: String(c.remaining),
      date: f.date || new Date().toISOString().split('T')[0],
      itcAmount: f.itcAmount === '' ? String(c.computedItc) : f.itcAmount,
      // Exact split from each invoice's place of supply (gst_type).
      cgst: String(c.cgst),
      sgst: String(c.sgst),
      igst: String(c.igst),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gstPayOpen, gstPayForm.period, gstPayForm.override, gstPayForm.itcOverride, gstPayForm.itcAmount]);

  const recordGstPayment = useMutation({
    mutationFn: async (input: {
      period: string; amount: number; date: string; challan: string; mode: string;
      cgst: number; sgst: number; igst: number; itcUsed?: number | null;
    }) => {
      const periodLabel = periodLabelOf(input.period);
      const breakdown = [
        input.cgst ? `CGST ₹${input.cgst}` : '',
        input.sgst ? `SGST ₹${input.sgst}` : '',
        input.igst ? `IGST ₹${input.igst}` : '',
      ].filter(Boolean).join(', ');
      const itcNote = input.itcUsed != null ? ` | ITC Used: ₹${input.itcUsed} (overridden)` : '';
      const { error } = await supabaseClient.from('payables').insert({
        category: 'Statutory & Taxes',
        description: `GST - ${periodLabel}`,
        vendor_name: 'GST Department',
        amount: input.amount,
        gst_amount: null, // A tax remittance is not itself an ITC-bearing purchase.
        total_amount: input.amount,
        due_date: input.date,
        payment_mode: input.mode || null,
        reference_number: input.challan || null,
        status: 'paid',
        // "GST Period: YYYY-MM" links this payment to the return period in the
        // GSTR-3B settlement. Same structured note format as ManagePayables.
        notes: `Tax Type: GST | Period: ${periodLabel} | GST Period: ${input.period}${breakdown ? ` | Breakup: ${breakdown}` : ''}${itcNote} | Paid On: ${input.date} | Status: Paid`,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance', 'gst-payments'] });
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      setGstPayOpen(false);
      toast({ title: 'GST Payment Recorded', description: 'The challan has been saved and applied to the period.' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // ─── COMPLIANCE FILINGS (for TDS, EPF/ESIC/PT) ───────────────────────────
  const { data: entries = [], isLoading } = useQuery<ComplianceEntry[]>({
    queryKey: ['compliance', filter],
    queryFn: async () => {
      let query = supabaseClient
        .from('compliance_filings')
        .select('*')
        .order('created_at', { ascending: false });

      if (filter === 'GST') query = query.eq('category', 'GST');
      else if (filter === 'TDS') query = query.eq('category', 'TDS');
      else if (filter === 'EPF / ESIC / PT') query = query.in('category', ['EPF', 'ESIC', 'Professional Tax']);
      else if (filter === 'Ledger Book') query = query.eq('category', 'Ledger');

      const { data, error } = await query;
      if (error) { console.warn('Compliance table not found'); return []; }
      return (data ?? []) as ComplianceEntry[];
    },
    enabled: activeSection !== 'gst', // GST now uses live data
  });

  const createEntry = useMutation({
    mutationFn: async (entry: Omit<ComplianceEntry, 'id' | 'created_at'>) => {
      const { data, error } = await supabaseClient
        .from('compliance_filings')
        .insert(entry)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance'] });
      setShowAddForm(false);
      setFormData({});
      toast({ title: "Entry Added", description: "Compliance entry recorded." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateField = (k: string, v: string) => setFormData(p => ({ ...p, [k]: v }));

  // For Ledger Book: auto-pull from payables + receivables
  const { data: ledgerPayables = [] } = useQuery({
    queryKey: ['compliance', 'ledger-payables'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('payables')
        .select('id, category, description, vendor_name, total_amount, status, created_at, due_date')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return [];
      return (data ?? []).map((p: any) => ({ ...p, direction: 'outward' as const, source: 'Payables' }));
    },
    enabled: activeSection === 'ledger',
  });

  const { data: ledgerReceivables = [] } = useQuery({
    queryKey: ['compliance', 'ledger-receivables'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('receivables')
        .select('id, category, description, client_name, total_amount, status, created_at, due_date')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return [];
      return (data ?? []).map((r: any) => ({ ...r, direction: 'inward' as const, source: 'Receivables' }));
    },
    enabled: activeSection === 'ledger',
  });

  const ledgerEntries = [...ledgerPayables, ...ledgerReceivables]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Filtered entries by search (for TDS, EPF tabs)
  const filtered = entries.filter(e => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return e.sub_type.toLowerCase().includes(s) || e.period.toLowerCase().includes(s) || (e.reference_number || '').toLowerCase().includes(s);
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'filed': return <Badge className="bg-green-500">Filed</Badge>;
      case 'paid': case 'received': return <Badge className="bg-blue-500">Paid</Badge>;
      case 'pending': return <Badge className="bg-amber-500">Pending</Badge>;
      case 'overdue': return <Badge className="bg-red-500">Overdue</Badge>;
      case 'approved': return <Badge className="bg-green-500">Approved</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // ─── MULTI-FORMAT EXPORT ──────────────────────────────────────────────────
  const getExportData = (): any[] => {
    if (activeSection === 'gst') {
      if (gstSubTab === 'gstr1') {
        return gstOutwardScoped.map((e: any) => ({
          Description: ledgerDescriptionOf(e),
          Client: e.client_name || '—',
          'Taxable Amount': e.amount,
          'GST Amount': e.gst_amount,
          'Total Amount': e.total_amount,
          Date: new Date(e.created_at).toLocaleDateString('en-IN'),
          Status: e.status,
        }));
      }
      if (gstSubTab === 'itc') {
        return gstInward.map((e: any) => ({
          Description: e.description,
          Vendor: e.vendor_name || '—',
          'Taxable Amount': e.amount,
          'GST Amount (ITC)': e.gst_amount,
          'Total Amount': e.total_amount,
          Date: new Date(e.created_at).toLocaleDateString('en-IN'),
          Status: e.status,
        }));
      }
      if (gstSubTab === 'gstr3b') {
        return gstr3bSummary.monthWise.map(m => ({
          Month: m.month,
          'Output GST': m.output,
          'Input Tax Credit': m.itc,
          'Net GST Payable': m.net,
        }));
      }
      if (gstSubTab === 'gst_ledger') {
        return gstLedger.map(e => ({
          Date: new Date(e.date).toLocaleDateString('en-IN'),
          'Client Name': e.party,
          Description: e.description,
          Type: e.type,
          'Debit (ITC)': e.debit || '',
          'Credit (Output)': e.credit || '',
          'Running Balance': e.balance,
        }));
      }
    }
    if (activeSection === 'ledger') {
      return ledgerEntries.map((e: any) => ({
        Date: new Date(e.created_at).toLocaleDateString('en-IN'),
        Description: e.description,
        Category: e.category,
        Party: e.vendor_name || e.client_name || '—',
        Direction: e.direction,
        'Debit (Outward)': e.direction === 'outward' ? e.total_amount : '',
        'Credit (Inward)': e.direction === 'inward' ? e.total_amount : '',
        Status: e.status,
      }));
    }
    // TDS / EPF
    return filtered.map(e => ({
      Type: e.sub_type,
      Period: e.period,
      Amount: e.amount,
      'Due Date': e.due_date || '—',
      'Filing Date': e.filing_date || '—',
      Status: e.status,
      Reference: e.reference_number || '—',
    }));
  };

  const handleExport = (format: 'csv' | 'xlsx' | 'json' | 'pdf') => {
    const data = getExportData();
    if (!data.length) {
      toast({ title: "No Data", description: "Nothing to export.", variant: "destructive" });
      return;
    }

    const dateSuffix = new Date().toISOString().slice(0, 10);
    const tabLabel = activeSection === 'gst' ? `GST_${gstSubTab}` : filter.replace(/[\/\s]/g, '_');
    const baseFilename = `compliance_${tabLabel}_${dateSuffix}`;
    const title = `${filter} - ${activeSection === 'gst' ? gstSubTab.toUpperCase() : 'Report'}`;

    switch (format) {
      case 'csv':
        exportToCSV(data, `${baseFilename}.csv`);
        break;
      case 'xlsx':
        exportToExcel(data, `${baseFilename}.xlsx`, tabLabel);
        break;
      case 'json':
        exportToJSON(data, `${baseFilename}.json`);
        break;
      case 'pdf':
        exportToPDF(data, `${baseFilename}.pdf`, title);
        break;
    }
    toast({ title: "Exported", description: `${format.toUpperCase()} file generated.` });
  };

  // ─── FORM SUBMISSION ──────────────────────────────────────────────────────
  const handleSubmit = () => {
    const { sub_type, period, amount, due_date, filing_date, status, reference_number, notes } = formData;
    if (!sub_type || !period || !amount) {
      toast({ title: "Validation Error", description: "Type, Period and Amount are required.", variant: "destructive" });
      return;
    }

    const category = filter === 'TDS' ? 'TDS'
      : filter === 'EPF / ESIC / PT' ? (sub_type.includes('EPF') ? 'EPF' : sub_type.includes('ESIC') ? 'ESIC' : 'Professional Tax')
      : filter === 'Ledger Book' ? 'Ledger'
      : 'GST';

    createEntry.mutate({
      category,
      sub_type,
      period,
      amount: parseFloat(amount),
      due_date: due_date || null,
      filing_date: filing_date || null,
      status: (status || 'pending') as any,
      reference_number: reference_number || null,
      notes: notes || null,
    });
  };

  // ─── FORM HELPERS ─────────────────────────────────────────────────────────
  const getSubTypeOptions = () => {
    switch (filter) {
      case 'TDS': return ['Form 24Q', 'Form 26Q', 'Form 27Q', 'TDS Challan'];
      case 'EPF / ESIC / PT': return ['EPF (ECR Filing)', 'ESIC (Monthly)', 'Professional Tax'];
      case 'Ledger Book': return ['Journal Entry', 'Adjustment', 'Opening Balance', 'Closing Balance'];
      default: return ['GSTR-1', 'GSTR-3B', 'ITC', 'GST Ledger'];
    }
  };

  const getAddButtonLabel = () => {
    switch (filter) {
      case 'TDS': return 'Add TDS Filing';
      case 'EPF / ESIC / PT': return 'Add Filing';
      case 'Ledger Book': return 'Add Manual Entry';
      default: return 'Add Entry';
    }
  };

  const getDescription = () => {
    switch (filter) {
      case 'GST': return 'Auto-registered from payables & receivables. GSTR-1, GSTR-3B, ITC register, and GST ledger.';
      case 'TDS': return 'Quarterly TDS returns (24Q/26Q/27Q) and challan tracking';
      case 'EPF / ESIC / PT': return 'Monthly EPF (ECR), ESIC contributions, and Professional Tax deposits';
      case 'Ledger Book': return 'Auto-registered from all inward (receivables) and outward (payables) transactions';
      default: return 'Compliance filings and statutory obligations';
    }
  };

  // Show Add button only for TDS, EPF/ESIC/PT, and Ledger
  const showAddButton = activeSection !== 'gst';

  const gstIsLoading = loadingOutward || loadingInward;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">{filter || 'Compliance'}</h2>
          <p className="text-sm text-muted-foreground">{getDescription()}</p>
        </div>
        {showAddButton && (
          <Button onClick={() => { setFormData({}); setShowAddForm(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            {getAddButtonLabel()}
          </Button>
        )}
      </div>

      {/* ─── GST SECTION (Auto-pulled) ─────────────────────────────────────── */}
      {activeSection === 'gst' && (
        <>
          {/* GST Sub-tabs + return-period selector */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Tabs value={gstSubTab} onValueChange={setGstSubTab}>
              <TabsList className="h-9">
                <TabsTrigger value="gstr1" className="text-xs px-3">GSTR-1</TabsTrigger>
                <TabsTrigger value="gstr3b" className="text-xs px-3">GSTR-3B</TabsTrigger>
                <TabsTrigger value="itc" className="text-xs px-3">ITC Register</TabsTrigger>
                <TabsTrigger value="gst_ledger" className="text-xs px-3">GST Ledger</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <Select value={gstPeriod} onValueChange={setGstPeriod}>
                <SelectTrigger className="h-9 w-[190px] text-sm">
                  <SelectValue placeholder="Return period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All periods (lifetime)</SelectItem>
                  {periodOptions.map((key) => (
                    <SelectItem key={key} value={key}>{periodLabelOf(key)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* GST Filing Due Date Alerts */}
          <GSTFilingAlerts />

          {/* Search + Export */}
          <div className="flex gap-3 items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search GST entries..." className="pl-8" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExport('csv')}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('xlsx')}>Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('json')}>JSON</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('pdf')}>PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {gstIsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* GSTR-1: Outward Supplies */}
              {gstSubTab === 'gstr1' && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">GSTR-1 — Outward Supplies (Sales with GST)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {gstOutwardScoped.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p>No outward supplies with GST found.</p>
                        <p className="text-xs mt-1">GST entries auto-register from Receivables.</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">GST Amount</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {gstOutwardScoped
                            .filter((e: any) => {
                              if (!searchTerm) return true;
                              const s = searchTerm.toLowerCase();
                              return ledgerDescriptionOf(e).toLowerCase().includes(s)
                                || e.description?.toLowerCase().includes(s)
                                || (e.client_name || '').toLowerCase().includes(s);
                            })
                            .map((entry: any) => (
                            <TableRow key={entry.id}>
                              <TableCell className="font-medium">{ledgerDescriptionOf(entry)}</TableCell>
                              <TableCell>
                                {entry.client_name || '—'}
                                {entry.gst_treatment === 'rcm' && <Badge variant="outline" className="ml-2 text-[10px] border-amber-400 text-amber-600">RCM</Badge>}
                                {entry.gst_treatment === 'exempt' && <Badge variant="outline" className="ml-2 text-[10px]">Exempt</Badge>}
                              </TableCell>
                              <TableCell className="text-right">{inr2(entry.amount || 0)}</TableCell>
                              <TableCell className="text-right text-green-600">
                                {entry.gst_treatment === 'rcm' ? <span className="text-amber-600 text-xs">by recipient</span> : inr2(entry.gst_amount || 0)}
                              </TableCell>
                              <TableCell className="text-right font-semibold">{inr2(entry.total_amount || 0)}</TableCell>
                              <TableCell>{new Date(entry.created_at).toLocaleDateString('en-IN')}</TableCell>
                              <TableCell>{getStatusBadge(entry.status)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="font-bold bg-gray-50 dark:bg-gray-900">
                            <TableCell colSpan={2}>Total (Forward-charge GST)</TableCell>
                            <TableCell className="text-right">{inr2(gstOutwardScoped.reduce((s: number, e: any) => s + (e.amount || 0), 0))}</TableCell>
                            <TableCell className="text-right text-green-600">{inr2(forwardOutward.reduce((s: number, e: any) => s + (e.gst_amount || 0), 0))}</TableCell>
                            <TableCell className="text-right">{inr2(gstOutwardScoped.reduce((s: number, e: any) => s + (e.total_amount || 0), 0))}</TableCell>
                            <TableCell colSpan={2} />
                          </TableRow>
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ITC Register: Inward Supplies */}
              {gstSubTab === 'itc' && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">ITC Register — Input Tax Credit (Purchases with GST)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {gstInward.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p>No inward supplies with GST found.</p>
                        <p className="text-xs mt-1">ITC entries auto-register from Payables.</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead>Vendor</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">GST Amount (ITC)</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {gstInward
                            .filter((e: any) => {
                              if (!searchTerm) return true;
                              const s = searchTerm.toLowerCase();
                              return e.description?.toLowerCase().includes(s) || (e.vendor_name || '').toLowerCase().includes(s);
                            })
                            .map((entry: any) => (
                            <TableRow key={entry.id}>
                              <TableCell className="font-medium">{entry.description}</TableCell>
                              <TableCell>{entry.vendor_name || '—'}</TableCell>
                              <TableCell className="text-right">{inr2(entry.amount)}</TableCell>
                              <TableCell className="text-right text-blue-600">{inr2(entry.gst_amount)}</TableCell>
                              <TableCell className="text-right font-semibold">{inr2(entry.total_amount)}</TableCell>
                              <TableCell>{new Date(entry.created_at).toLocaleDateString('en-IN')}</TableCell>
                              <TableCell>{getStatusBadge(entry.status)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="font-bold bg-gray-50 dark:bg-gray-900">
                            <TableCell colSpan={2}>Total</TableCell>
                            <TableCell className="text-right">{inr2(gstInward.reduce((s: number, e: any) => s + e.amount, 0))}</TableCell>
                            <TableCell className="text-right text-blue-600">{inr2(gstInward.reduce((s: number, e: any) => s + e.gst_amount, 0))}</TableCell>
                            <TableCell className="text-right">{inr2(gstInward.reduce((s: number, e: any) => s + e.total_amount, 0))}</TableCell>
                            <TableCell colSpan={2} />
                          </TableRow>
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* GSTR-3B: Monthly Summary */}
              {gstSubTab === 'gstr3b' && (
                <div className="space-y-4">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="border-green-200 dark:border-green-800">
                      <CardContent className="p-5">
                        <p className="text-xs text-muted-foreground font-medium">Total Output GST</p>
                        <p className="text-2xl font-bold text-green-600 mt-1" title={inr2(gstr3bSummary.totalOutputGST)}>
                          <CountUp to={gstr3bSummary.totalOutputGST} duration={2} separator="," formatter={formatINRShort} />
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">GST collected on sales</p>
                      </CardContent>
                    </Card>
                    <Card className="border-blue-200 dark:border-blue-800">
                      <CardContent className="p-5">
                        <p className="text-xs text-muted-foreground font-medium">Total ITC (Input Tax Credit)</p>
                        <p className="text-2xl font-bold text-blue-600 mt-1" title={inr2(gstr3bSummary.totalITC)}>
                          <CountUp to={gstr3bSummary.totalITC} duration={2} separator="," formatter={formatINRShort} />
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">GST paid on purchases</p>
                      </CardContent>
                    </Card>
                    <Card className={`border-2 ${gstr3bSummary.netPayable > 0 ? 'border-red-300 dark:border-red-700' : 'border-green-300 dark:border-green-700'}`}>
                      <CardContent className="p-5">
                        <p className="text-xs text-muted-foreground font-medium">Net GST Payable</p>
                        <p className={`text-2xl font-bold mt-1 ${gstr3bSummary.netPayable > 0 ? 'text-red-600' : 'text-green-600'}`} title={inr2(Math.abs(gstr3bSummary.netPayable))}>
                          <CountUp to={Math.abs(gstr3bSummary.netPayable)} duration={2} separator="," formatter={formatINRShort} />
                          {gstr3bSummary.netPayable < 0 && ' (Credit)'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Forward Output GST − ITC</p>

                        {/* Settlement: paid vs remaining for the selected period */}
                        <div className="mt-3 border-t pt-2 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">GST Paid{gstPeriod !== 'all' ? ` (${periodLabelOf(gstPeriod)})` : ''}</span>
                            <span className="font-semibold text-green-600" title={inr2(gstSettlement.paid)}>{inr2(gstSettlement.paid)}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{gstSettlement.overpaid > 0 ? 'Overpaid' : 'Remaining'}</span>
                            <span className={`font-bold ${gstSettlement.overpaid > 0 ? 'text-blue-600' : gstSettlement.remaining > 0 ? 'text-red-600' : 'text-green-600'}`} title={inr2(gstSettlement.overpaid > 0 ? gstSettlement.overpaid : gstSettlement.remaining)}>
                              {inr2(gstSettlement.overpaid > 0 ? gstSettlement.overpaid : gstSettlement.remaining)}
                            </span>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          className="w-full mt-3"
                          onClick={() => {
                            const period = gstPeriod !== 'all' ? gstPeriod : (periodOptions[0] || periodKeyOf(new Date().toISOString()));
                            // Amount/split/date are auto-filled by the effect from
                            // computePeriodLiability once the dialog opens.
                            setGstPayForm({
                              period, date: '', challan: '', mode: '',
                              override: false, interState: false,
                              itcOverride: false, itcAmount: '',
                              amount: '', cgst: '', sgst: '', igst: '',
                            });
                            setGstPayOpen(true);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" /> Record GST Payment
                        </Button>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Record GST Payment dialog */}
                  <Dialog open={gstPayOpen} onOpenChange={setGstPayOpen}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Record GST Payment</DialogTitle>
                      </DialogHeader>
                      {(() => {
                        const itcOv = gstPayForm.itcOverride && gstPayForm.itcAmount !== '' ? parseFloat(gstPayForm.itcAmount) : undefined;
                        const liab = gstPayForm.period ? computePeriodLiability(gstPayForm.period, itcOv) : null;
                        const amtNum = parseFloat(gstPayForm.amount) || 0;
                        const splitSum = (parseFloat(gstPayForm.cgst) || 0) + (parseFloat(gstPayForm.sgst) || 0) + (parseFloat(gstPayForm.igst) || 0);
                        const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
                        const alreadyClear = !!liab && liab.remaining <= 0;
                        const splitMismatch = round2(splitSum) !== round2(amtNum);
                        const overRemaining = !!liab && amtNum > liab.remaining + 0.01;
                        const canSave = !recordGstPayment.isPending && !!gstPayForm.period && amtNum > 0 && !!gstPayForm.date && !splitMismatch;
                        return (
                      <>
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <Label>Return Period *</Label>
                          <Select value={gstPayForm.period} onValueChange={(v) => setGstPayForm(f => ({ ...f, period: v }))}>
                            <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
                            <SelectContent>
                              {periodOptions.map((key) => (
                                <SelectItem key={key} value={key}>{periodLabelOf(key)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Auto-computed liability summary for the chosen month */}
                        {liab && (
                          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                            <div className="flex justify-between"><span className="text-muted-foreground">Output GST</span><span className="font-medium">{inr2(liab.output)}</span></div>
                            <div className="flex items-center justify-between">
                              <label className="flex items-center gap-2 cursor-pointer text-muted-foreground">
                                <input type="checkbox" checked={gstPayForm.itcOverride} onChange={(e) => setGstPayForm(f => ({ ...f, itcOverride: e.target.checked }))} />
                                <span>Less: ITC {gstPayForm.itcOverride ? '(overridden)' : '(auto)'}</span>
                              </label>
                              {gstPayForm.itcOverride ? (
                                <Input type="number" min="0" value={gstPayForm.itcAmount} onChange={(e) => setGstPayForm(f => ({ ...f, itcAmount: e.target.value }))} className="h-7 w-32 text-right text-xs" placeholder="ITC used" />
                              ) : (
                                <span className="font-medium">− {inr2(liab.itc)}</span>
                              )}
                            </div>
                            {gstPayForm.itcOverride && liab.computedItc !== liab.itc && (
                              <div className="flex justify-between text-[11px] text-muted-foreground"><span>Computed ITC (from purchases)</span><span>{inr2(liab.computedItc)}</span></div>
                            )}
                            <div className="flex justify-between border-t pt-1"><span className="text-muted-foreground">Net Payable</span><span className="font-semibold">{inr2(liab.net)}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Already Paid</span><span className="font-medium text-green-600">− {inr2(liab.paid)}</span></div>
                            <div className="flex justify-between border-t pt-1"><span className="text-muted-foreground">Remaining (auto-filled)</span><span className={`font-bold ${liab.remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>{inr2(liab.remaining)}</span></div>
                            <div className="flex justify-between text-[11px] text-muted-foreground pt-1"><span>Due date (auto)</span><span>{new Date(liab.dueDate).toLocaleDateString('en-IN')}</span></div>
                          </div>
                        )}

                        {alreadyClear && (
                          <div className="rounded-md border border-green-300 bg-green-50 dark:bg-green-950/20 px-3 py-2 text-xs text-green-700 dark:text-green-400">
                            This period is already fully settled. Recording another payment will overpay it.
                          </div>
                        )}

                        {/* Manual-override toggle. The tax split is derived
                            exactly from each invoice's place of supply, so no
                            inter-state guess is needed here. */}
                        <div className="flex items-center gap-2 text-xs">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={gstPayForm.override} onChange={(e) => setGstPayForm(f => ({ ...f, override: e.target.checked }))} />
                            <span>Manual override (part-payment / adjust amount)</span>
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label>Amount Paid (₹) *</Label>
                            <Input type="number" min="0" value={gstPayForm.amount} readOnly={!gstPayForm.override}
                              className={!gstPayForm.override ? 'bg-muted' : ''}
                              onChange={(e) => setGstPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="Auto from liability" />
                          </div>
                          <div className="space-y-1">
                            <Label>Payment Date *</Label>
                            <Input type="date" value={gstPayForm.date} onChange={(e) => setGstPayForm(f => ({ ...f, date: e.target.value }))} />
                          </div>
                        </div>

                        {/* Tax split — auto (read-only) unless override */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">CGST (₹)</Label>
                            <Input type="number" min="0" value={gstPayForm.cgst} readOnly={!gstPayForm.override} className={!gstPayForm.override ? 'bg-muted' : ''} onChange={(e) => setGstPayForm(f => ({ ...f, cgst: e.target.value }))} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">SGST (₹)</Label>
                            <Input type="number" min="0" value={gstPayForm.sgst} readOnly={!gstPayForm.override} className={!gstPayForm.override ? 'bg-muted' : ''} onChange={(e) => setGstPayForm(f => ({ ...f, sgst: e.target.value }))} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">IGST (₹)</Label>
                            <Input type="number" min="0" value={gstPayForm.igst} readOnly={!gstPayForm.override} className={!gstPayForm.override ? 'bg-muted' : ''} onChange={(e) => setGstPayForm(f => ({ ...f, igst: e.target.value }))} />
                          </div>
                        </div>
                        {gstPayForm.override && splitMismatch && (
                          <p className="text-[11px] text-amber-600">CGST + SGST + IGST ({inr2(splitSum)}) must equal Amount Paid ({inr2(amtNum)}).</p>
                        )}
                        {overRemaining && !gstPayForm.override && (
                          <p className="text-[11px] text-amber-600">Amount exceeds the remaining liability — switch on Manual override to proceed intentionally.</p>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label>Challan / CIN Number</Label>
                            <Input value={gstPayForm.challan} onChange={(e) => setGstPayForm(f => ({ ...f, challan: e.target.value }))} placeholder="CIN / challan no." />
                          </div>
                          <div className="space-y-1">
                            <Label>Payment Mode</Label>
                            <Select value={gstPayForm.mode} onValueChange={(v) => setGstPayForm(f => ({ ...f, mode: v }))}>
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
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setGstPayOpen(false)}>Cancel</Button>
                        <Button
                          disabled={!canSave}
                          onClick={() => recordGstPayment.mutate({
                            period: gstPayForm.period,
                            amount: amtNum,
                            date: gstPayForm.date,
                            challan: gstPayForm.challan,
                            mode: gstPayForm.mode,
                            cgst: parseFloat(gstPayForm.cgst) || 0,
                            sgst: parseFloat(gstPayForm.sgst) || 0,
                            igst: parseFloat(gstPayForm.igst) || 0,
                            itcUsed: gstPayForm.itcOverride && gstPayForm.itcAmount !== '' ? (parseFloat(gstPayForm.itcAmount) || 0) : null,
                          })}
                        >
                          {recordGstPayment.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                          Save Payment
                        </Button>
                      </DialogFooter>
                      </>
                        );
                      })()}
                    </DialogContent>
                  </Dialog>

                  {/* RCM supplies — reported, but tax paid by recipient (excluded from payable above) */}
                  {gstr3bSummary.rcmTurnover > 0 && (
                    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">RCM Outward Supplies (Security Services)</p>
                          <p className="text-lg font-bold text-amber-700 dark:text-amber-400 mt-0.5" title={inr2(gstr3bSummary.rcmTurnover)}>{formatINRShort(gstr3bSummary.rcmTurnover)}</p>
                        </div>
                        <p className="text-[11px] text-amber-700 dark:text-amber-400 max-w-xs text-right">
                          Reported in GSTR-1 as reverse-charge supplies. GST is paid by the registered recipient — <b>not</b> included in the agency&apos;s net payable.
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Month-wise Breakdown */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Month-wise Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {gstr3bSummary.monthWise.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <p className="text-sm">No GST data available for monthly breakdown.</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Month</TableHead>
                              <TableHead className="text-right">Output GST</TableHead>
                              <TableHead className="text-right">ITC</TableHead>
                              <TableHead className="text-right">Net Payable</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {gstr3bSummary.monthWise.map(m => (
                              <TableRow key={m.month}>
                                <TableCell className="font-medium">{m.month}</TableCell>
                                <TableCell className="text-right text-green-600">₹{m.output.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-right text-blue-600">₹{m.itc.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                <TableCell className={`text-right font-semibold ${m.net > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  ₹{Math.abs(m.net).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{m.net < 0 ? ' (Cr)' : ''}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* GST Ledger: Combined chronological view */}
              {gstSubTab === 'gst_ledger' && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">GST Ledger — All Transactions (Chronological)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {gstLedger.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <IndianRupee className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p>No GST transactions found.</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Client Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Debit (ITC)</TableHead>
                            <TableHead className="text-right">Credit (Output)</TableHead>
                            <TableHead className="text-right">Running Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {gstLedger
                            .filter(e => {
                              if (!searchTerm) return true;
                              const s = searchTerm.toLowerCase();
                              return e.description?.toLowerCase().includes(s) || e.party?.toLowerCase().includes(s);
                            })
                            .map((entry, idx) => (
                            <TableRow key={`${entry.id}-${idx}`} className={entry.isOpening ? 'bg-muted/40 italic' : ''}>
                              <TableCell className="text-sm">{new Date(entry.date).toLocaleDateString('en-IN')}</TableCell>
                              <TableCell className="font-medium">{entry.party}</TableCell>
                              <TableCell>{entry.description}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{entry.type}</Badge>
                              </TableCell>
                              <TableCell className="text-right text-red-600">{entry.debit ? inr2(entry.debit) : ''}</TableCell>
                              <TableCell className="text-right text-green-600">{entry.credit ? inr2(entry.credit) : ''}</TableCell>
                              <TableCell className={`text-right font-semibold ${entry.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {inr2(Math.abs(entry.balance))}
                                {entry.balance > 0 ? ' Payable' : entry.balance < 0 ? ' Credit' : ''}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* ─── LEDGER BOOK SECTION ───────────────────────────────────────────── */}
      {activeSection === 'ledger' && (
        <>
          <div className="flex gap-3 items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search ledger..." className="pl-8" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExport('csv')}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('xlsx')}>Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('json')}>JSON</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('pdf')}>PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Card>
            <CardContent className="p-0">
              {ledgerEntries.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <IndianRupee className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>No ledger entries yet.</p>
                  <p className="text-xs mt-1">Entries auto-register from Payables and Receivables.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Party</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead className="text-right">Debit (Outward)</TableHead>
                      <TableHead className="text-right">Credit (Inward)</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerEntries.filter(e => {
                      if (!searchTerm) return true;
                      const s = searchTerm.toLowerCase();
                      return e.description?.toLowerCase().includes(s) || e.category?.toLowerCase().includes(s) || (e.vendor_name || e.client_name || '').toLowerCase().includes(s);
                    }).map((entry: any) => (
                      <TableRow key={`${entry.source}-${entry.id}`}>
                        <TableCell className="text-sm">{new Date(entry.created_at).toLocaleDateString('en-IN')}</TableCell>
                        <TableCell className="font-medium">{entry.description}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{entry.category}</Badge></TableCell>
                        <TableCell>{entry.vendor_name || entry.client_name || '—'}</TableCell>
                        <TableCell>
                          {entry.direction === 'outward'
                            ? <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30">Outward</Badge>
                            : <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30">Inward</Badge>}
                        </TableCell>
                        <TableCell className="text-right text-red-600">{entry.direction === 'outward' ? inr2(entry.total_amount) : ''}</TableCell>
                        <TableCell className="text-right text-green-600">{entry.direction === 'inward' ? inr2(entry.total_amount) : ''}</TableCell>
                        <TableCell>{getStatusBadge(entry.status)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-gray-50 dark:bg-gray-900">
                      <TableCell colSpan={5}>Totals</TableCell>
                      <TableCell className="text-right text-red-600">{inr2(ledgerPayables.reduce((s, e) => s + (e.total_amount || 0), 0))}</TableCell>
                      <TableCell className="text-right text-green-600">{inr2(ledgerReceivables.reduce((s, e) => s + (e.total_amount || 0), 0))}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ─── TDS / EPF SECTION (Manual entries from compliance_filings) ────── */}
      {(activeSection === 'tds' || activeSection === 'epf') && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Pending/Overdue Amount</p><p className="text-xl font-bold text-amber-600">₹<CountUp to={entries.filter(e => e.status === 'pending' || e.status === 'overdue').reduce((s, e) => s + e.amount, 0)} duration={2} separator="," /></p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Filed/Paid Amount</p><p className="text-xl font-bold text-green-600">₹<CountUp to={entries.filter(e => e.status === 'filed' || e.status === 'paid').reduce((s, e) => s + e.amount, 0)} duration={2} separator="," /></p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Entries</p><p className="text-xl font-bold"><CountUp to={entries.length} duration={2} separator="," /></p></CardContent></Card>
          </div>

          {/* Search + Export */}
          <div className="flex gap-3 items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search filings..." className="pl-8" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExport('csv')}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('xlsx')}>Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('json')}>JSON</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('pdf')}>PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>No compliance entries found.</p>
                  <p className="text-xs mt-1">Click &quot;{getAddButtonLabel()}&quot; to record a filing.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Filing Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">{entry.sub_type}</TableCell>
                        <TableCell>{entry.period}</TableCell>
                        <TableCell className="text-right">{inr2(entry.amount)}</TableCell>
                        <TableCell>{entry.due_date ? new Date(entry.due_date).toLocaleDateString('en-IN') : '—'}</TableCell>
                        <TableCell>{entry.filing_date ? new Date(entry.filing_date).toLocaleDateString('en-IN') : '—'}</TableCell>
                        <TableCell>{getStatusBadge(entry.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.reference_number || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ─── ADD FORM DIALOG (TDS / EPF / Ledger only) ──────────────────────── */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader><DialogTitle>{getAddButtonLabel()}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Type*</Label>
                <Select value={formData.sub_type || ''} onValueChange={(v) => updateField('sub_type', v)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {getSubTypeOptions().map(t => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Period*</Label>
                <Input value={formData.period || ''} onChange={(e) => updateField('period', e.target.value)} placeholder="e.g. May 2026 or Q1 FY26" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Amount (₹)*</Label>
                <Input type="number" min="0" value={formData.amount || ''} onChange={(e) => updateField('amount', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={formData.status || 'pending'} onValueChange={(v) => updateField('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => (<SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Due Date</Label><Input type="date" value={formData.due_date || ''} onChange={(e) => updateField('due_date', e.target.value)} /></div>
              <div className="space-y-1"><Label>Filing Date</Label><Input type="date" value={formData.filing_date || ''} onChange={(e) => updateField('filing_date', e.target.value)} /></div>
            </div>
            <div className="space-y-1"><Label>Reference / Challan No.</Label><Input value={formData.reference_number || ''} onChange={(e) => updateField('reference_number', e.target.value)} placeholder="ARN / Challan / Acknowledgment No." /></div>
            <div className="space-y-1"><Label>Notes</Label><Textarea value={formData.notes || ''} onChange={(e) => updateField('notes', e.target.value)} rows={2} placeholder="Additional details..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createEntry.isPending}>{createEntry.isPending ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
