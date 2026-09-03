'use client';

import { useState, useMemo } from 'react';
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

  // ─── GST AUTO-PULL: Receivables (Outward / GSTR-1) ────────────────────────
  const { data: gstOutward = [], isLoading: loadingOutward } = useQuery({
    queryKey: ['compliance', 'gst-outward'],
    queryFn: async () => {
      // Include forward-charge GST invoices AND RCM supplies (which have no agency GST but
      // must still be reported in GSTR-1). Credit notes carry a negative gst_amount and debit
      // notes a positive one — both must be pulled in so the summed output tax nets correctly.
      const { data, error } = await supabaseClient
        .from('receivables')
        .select('id, description, client_name, amount, gst_amount, total_amount, status, created_at, gst_treatment')
        .or('gst_amount.gt.0,gst_amount.lt.0,gst_treatment.eq.rcm')
        .order('created_at', { ascending: false });
      if (error) { console.warn('Failed to fetch GST outward:', error.message); return []; }
      return data ?? [];
    },
    enabled: activeSection === 'gst',
  });

  // Split outward supplies by GST treatment
  const forwardOutward = useMemo(() => gstOutward.filter((e: any) => (e.gst_treatment || 'forward') !== 'rcm'), [gstOutward]);
  const rcmOutward = useMemo(() => gstOutward.filter((e: any) => e.gst_treatment === 'rcm'), [gstOutward]);

  // ─── GST AUTO-PULL: Payables (Inward / ITC) ──────────────────────────────
  const { data: gstInward = [], isLoading: loadingInward } = useQuery({
    queryKey: ['compliance', 'gst-inward'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('payables')
        .select('id, description, vendor_name, amount, gst_amount, total_amount, status, created_at')
        .not('gst_amount', 'is', null)
        .gt('gst_amount', 0)
        .order('created_at', { ascending: false });
      if (error) { console.warn('Failed to fetch GST inward:', error.message); return []; }
      return data ?? [];
    },
    enabled: activeSection === 'gst',
  });

  // ─── GSTR-3B CALCULATIONS ────────────────────────────────────────────────
  const gstr3bSummary = useMemo(() => {
    // Only forward-charge supplies create output GST liability for the agency.
    // RCM supplies are reported but the tax is paid by the recipient, so they're excluded here.
    const totalOutputGST = forwardOutward.reduce((s: number, e: any) => s + (e.gst_amount || 0), 0);
    const totalITC = gstInward.reduce((s: number, e: any) => s + (e.gst_amount || 0), 0);
    const netPayable = totalOutputGST - totalITC;
    const rcmTurnover = rcmOutward.reduce((s: number, e: any) => s + (e.amount || 0), 0);

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
      .map(([month, vals]) => ({ month, output: vals.output, itc: vals.itc, net: vals.output - vals.itc }))
      .sort((a, b) => new Date(b.month).getTime() - new Date(a.month).getTime());

    return { totalOutputGST, totalITC, netPayable, rcmTurnover, monthWise };
  }, [forwardOutward, rcmOutward, gstInward]);

  // ─── GST LEDGER (Combined chronological view) ────────────────────────────
  const gstLedger = useMemo(() => {
    const entries: any[] = [];
    gstOutward.forEach((e: any) => entries.push({
      id: e.id,
      date: e.created_at,
      description: e.description,
      party: e.client_name || '—',
      type: 'Output',
      debit: 0,
      credit: e.gst_amount || 0,
    }));
    gstInward.forEach((e: any) => entries.push({
      id: e.id,
      date: e.created_at,
      description: e.description,
      party: e.vendor_name || '—',
      type: 'Input (ITC)',
      debit: e.gst_amount || 0,
      credit: 0,
    }));
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running balance
    let balance = 0;
    entries.forEach(e => {
      balance += e.credit - e.debit;
      e.balance = balance;
    });
    return entries;
  }, [gstOutward, gstInward]);

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
        return gstOutward.map((e: any) => ({
          Description: e.description,
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
          Description: e.description,
          Party: e.party,
          Type: e.type,
          'Debit (ITC)': e.debit || '',
          'Credit (Output)': e.credit || '',
          Balance: e.balance,
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
          {/* GST Sub-tabs */}
          <Tabs value={gstSubTab} onValueChange={setGstSubTab}>
            <TabsList className="h-9">
              <TabsTrigger value="gstr1" className="text-xs px-3">GSTR-1</TabsTrigger>
              <TabsTrigger value="gstr3b" className="text-xs px-3">GSTR-3B</TabsTrigger>
              <TabsTrigger value="itc" className="text-xs px-3">ITC Register</TabsTrigger>
              <TabsTrigger value="gst_ledger" className="text-xs px-3">GST Ledger</TabsTrigger>
            </TabsList>
          </Tabs>

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
                    {gstOutward.length === 0 ? (
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
                          {gstOutward
                            .filter((e: any) => {
                              if (!searchTerm) return true;
                              const s = searchTerm.toLowerCase();
                              return e.description?.toLowerCase().includes(s) || (e.client_name || '').toLowerCase().includes(s);
                            })
                            .map((entry: any) => (
                            <TableRow key={entry.id}>
                              <TableCell className="font-medium">{entry.description}</TableCell>
                              <TableCell>
                                {entry.client_name || '—'}
                                {entry.gst_treatment === 'rcm' && <Badge variant="outline" className="ml-2 text-[10px] border-amber-400 text-amber-600">RCM</Badge>}
                                {entry.gst_treatment === 'exempt' && <Badge variant="outline" className="ml-2 text-[10px]">Exempt</Badge>}
                              </TableCell>
                              <TableCell className="text-right">₹{(entry.amount || 0).toLocaleString()}</TableCell>
                              <TableCell className="text-right text-green-600">
                                {entry.gst_treatment === 'rcm' ? <span className="text-amber-600 text-xs">by recipient</span> : `₹${(entry.gst_amount || 0).toLocaleString()}`}
                              </TableCell>
                              <TableCell className="text-right font-semibold">₹{(entry.total_amount || 0).toLocaleString()}</TableCell>
                              <TableCell>{new Date(entry.created_at).toLocaleDateString('en-IN')}</TableCell>
                              <TableCell>{getStatusBadge(entry.status)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="font-bold bg-gray-50 dark:bg-gray-900">
                            <TableCell colSpan={2}>Total (Forward-charge GST)</TableCell>
                            <TableCell className="text-right">₹{gstOutward.reduce((s: number, e: any) => s + (e.amount || 0), 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right text-green-600">₹{forwardOutward.reduce((s: number, e: any) => s + (e.gst_amount || 0), 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right">₹{gstOutward.reduce((s: number, e: any) => s + (e.total_amount || 0), 0).toLocaleString()}</TableCell>
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
                              <TableCell className="text-right">₹{entry.amount.toLocaleString()}</TableCell>
                              <TableCell className="text-right text-blue-600">₹{entry.gst_amount.toLocaleString()}</TableCell>
                              <TableCell className="text-right font-semibold">₹{entry.total_amount.toLocaleString()}</TableCell>
                              <TableCell>{new Date(entry.created_at).toLocaleDateString('en-IN')}</TableCell>
                              <TableCell>{getStatusBadge(entry.status)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="font-bold bg-gray-50 dark:bg-gray-900">
                            <TableCell colSpan={2}>Total</TableCell>
                            <TableCell className="text-right">₹{gstInward.reduce((s: number, e: any) => s + e.amount, 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right text-blue-600">₹{gstInward.reduce((s: number, e: any) => s + e.gst_amount, 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right">₹{gstInward.reduce((s: number, e: any) => s + e.total_amount, 0).toLocaleString()}</TableCell>
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
                        <p className="text-2xl font-bold text-green-600 mt-1">₹<CountUp to={gstr3bSummary.totalOutputGST} duration={2} separator="," /></p>
                        <p className="text-xs text-muted-foreground mt-1">GST collected on sales</p>
                      </CardContent>
                    </Card>
                    <Card className="border-blue-200 dark:border-blue-800">
                      <CardContent className="p-5">
                        <p className="text-xs text-muted-foreground font-medium">Total ITC (Input Tax Credit)</p>
                        <p className="text-2xl font-bold text-blue-600 mt-1">₹<CountUp to={gstr3bSummary.totalITC} duration={2} separator="," /></p>
                        <p className="text-xs text-muted-foreground mt-1">GST paid on purchases</p>
                      </CardContent>
                    </Card>
                    <Card className={`border-2 ${gstr3bSummary.netPayable > 0 ? 'border-red-300 dark:border-red-700' : 'border-green-300 dark:border-green-700'}`}>
                      <CardContent className="p-5">
                        <p className="text-xs text-muted-foreground font-medium">Net GST Payable</p>
                        <p className={`text-2xl font-bold mt-1 ${gstr3bSummary.netPayable > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          ₹<CountUp to={Math.abs(gstr3bSummary.netPayable)} duration={2} separator="," />
                          {gstr3bSummary.netPayable < 0 && ' (Credit)'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Forward Output GST − ITC</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* RCM supplies — reported, but tax paid by recipient (excluded from payable above) */}
                  {gstr3bSummary.rcmTurnover > 0 && (
                    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground font-medium">RCM Outward Supplies (Security Services)</p>
                          <p className="text-lg font-bold text-amber-700 dark:text-amber-400 mt-0.5">₹{gstr3bSummary.rcmTurnover.toLocaleString()}</p>
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
                                <TableCell className="text-right text-green-600">₹{m.output.toLocaleString()}</TableCell>
                                <TableCell className="text-right text-blue-600">₹{m.itc.toLocaleString()}</TableCell>
                                <TableCell className={`text-right font-semibold ${m.net > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  ₹{Math.abs(m.net).toLocaleString()}{m.net < 0 ? ' (Cr)' : ''}
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
                            <TableHead>Description</TableHead>
                            <TableHead>Party</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Debit (ITC)</TableHead>
                            <TableHead className="text-right">Credit (Output)</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
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
                            <TableRow key={`${entry.id}-${idx}`}>
                              <TableCell className="text-sm">{new Date(entry.date).toLocaleDateString('en-IN')}</TableCell>
                              <TableCell className="font-medium">{entry.description}</TableCell>
                              <TableCell>{entry.party}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{entry.type}</Badge>
                              </TableCell>
                              <TableCell className="text-right text-red-600">{entry.debit ? `₹${entry.debit.toLocaleString()}` : ''}</TableCell>
                              <TableCell className="text-right text-green-600">{entry.credit ? `₹${entry.credit.toLocaleString()}` : ''}</TableCell>
                              <TableCell className={`text-right font-semibold ${entry.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ₹{Math.abs(entry.balance).toLocaleString()}{entry.balance < 0 ? ' Dr' : ' Cr'}
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
                        <TableCell className="text-right text-red-600">{entry.direction === 'outward' ? `₹${entry.total_amount.toLocaleString()}` : ''}</TableCell>
                        <TableCell className="text-right text-green-600">{entry.direction === 'inward' ? `₹${entry.total_amount.toLocaleString()}` : ''}</TableCell>
                        <TableCell>{getStatusBadge(entry.status)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-gray-50 dark:bg-gray-900">
                      <TableCell colSpan={5}>Totals</TableCell>
                      <TableCell className="text-right text-red-600">₹{ledgerPayables.reduce((s, e) => s + (e.total_amount || 0), 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-green-600">₹{ledgerReceivables.reduce((s, e) => s + (e.total_amount || 0), 0).toLocaleString()}</TableCell>
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
                        <TableCell className="text-right">₹{entry.amount.toLocaleString()}</TableCell>
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
