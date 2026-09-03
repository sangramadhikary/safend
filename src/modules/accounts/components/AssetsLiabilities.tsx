'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAccountsContext } from '@/contexts/AccountsContext';
import { Asset, Liability } from '@/services/accounts/AccountsService';
import {
  Table, TableHeader, TableBody, TableHead,
  TableRow, TableCell
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Plus, Briefcase, IndianRupee,
  TrendingDown, TrendingUp, MoreHorizontal,
  ArrowDownCircle, Building2, Monitor, Car,
  Armchair, Package, ClipboardEdit, Calendar,
  AlertTriangle, CheckCircle2, PauseCircle, XCircle,
  Eye, Download, Trees
} from 'lucide-react';
import { formatIndianCurrency, formatIndianDate } from '@/utils/errorHandler';
import { supabaseClient } from '@/integrations/supabase/client';
import { applyBranchScope, onBranchScopeChange } from '@/utils/branchScope';
import { accountsApi } from '@/services/accounts/accountsApi';
import { CountUp } from '@/components/dashboard/CountUp';

export interface AssetsLiabilitiesProps {
  filter: string;
}

/**
 * Default depreciation rates (Income Tax Act, 1961 — WDV block rates).
 * Auto-filled when a category is chosen; the user can override per asset.
 */
const DEPRECIATION_RATE_DEFAULTS: Record<string, number> = {
  building: 10,     // Buildings (non-residential)
  furniture: 10,    // Furniture & fittings
  equipment: 15,    // Plant & machinery
  vehicle: 15,      // Motor vehicles (commercial: 30% — override if applicable)
  it_asset: 40,     // Computers & software
  land: 0,          // Land is non-depreciable
  other: 15,        // Default block rate
};

// Category config
const ASSET_CATEGORIES = [
  { value: 'building', label: 'Building', icon: Building2, color: 'text-blue-600', bg: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'land', label: 'Land', icon: Trees, color: 'text-lime-600', bg: 'bg-lime-100 text-lime-700 border-lime-200' },
  { value: 'equipment', label: 'Equipment', icon: Package, color: 'text-orange-600', bg: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'vehicle', label: 'Vehicle', icon: Car, color: 'text-green-600', bg: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'it_asset', label: 'IT Asset', icon: Monitor, color: 'text-purple-600', bg: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'furniture', label: 'Furniture', icon: Armchair, color: 'text-amber-600', bg: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'other', label: 'Other', icon: Briefcase, color: 'text-gray-600', bg: 'bg-gray-100 text-gray-700 border-gray-200' },
];

interface AmortRow { n: number; opening: number; emi: number; interest: number; principal: number; closing: number; }

/**
 * Builds a reducing-balance EMI amortization schedule (Phase 5.3).
 * interest[n] = opening × annualRate/12, principal[n] = emi − interest.
 * Returns [] when terms are insufficient or the EMI can't amortize the loan.
 */
function buildAmortizationSchedule(principal: number, annualRatePct: number, emi: number, maxInstallments?: number | null): AmortRow[] {
  if (!(principal > 0) || !(emi > 0)) return [];
  const monthlyRate = (annualRatePct || 0) / 100 / 12;
  const rows: AmortRow[] = [];
  let balance = principal;
  const hardCap = maxInstallments && maxInstallments > 0 ? Math.min(maxInstallments, 600) : 600;
  for (let n = 1; n <= hardCap && balance > 0.5; n++) {
    const interest = Math.round(balance * monthlyRate);
    let principalPaid = emi - interest;
    if (principalPaid <= 0) return []; // EMI too low to ever amortize — invalid terms
    if (principalPaid > balance) principalPaid = balance;
    const closing = Math.max(0, balance - principalPaid);
    rows.push({ n, opening: Math.round(balance), emi: Math.round(interest + principalPaid), interest, principal: Math.round(principalPaid), closing: Math.round(closing) });
    balance = closing;
  }
  return rows;
}

const LIABILITY_TYPES = [
  { value: 'loan', label: 'Loan', bg: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'security_deposit', label: 'Security Deposit', bg: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'inter_branch', label: 'Inter Branch', bg: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { value: 'advance', label: 'Advance Received', bg: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'other', label: 'Other', bg: 'bg-gray-100 text-gray-700 border-gray-200' },
];

const DEPRECIATION_METHODS = [
  { value: 'WDV', label: 'Written Down Value (WDV)' },
  { value: 'SLM', label: 'Straight Line Method (SLM)' },
];

// Status badge
const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<string, { icon: React.ReactNode; className: string; label: string }> = {
    active: { icon: <CheckCircle2 className="h-3 w-3" />, className: "bg-green-50 text-green-700 border-green-200", label: "Active" },
    under_maintenance: { icon: <PauseCircle className="h-3 w-3" />, className: "bg-yellow-50 text-yellow-700 border-yellow-200", label: "Maintenance" },
    sold: { icon: <TrendingUp className="h-3 w-3" />, className: "bg-blue-50 text-blue-700 border-blue-200", label: "Sold" },
    scrapped: { icon: <XCircle className="h-3 w-3" />, className: "bg-red-50 text-red-700 border-red-200", label: "Scrapped" },
    defaulted: { icon: <AlertTriangle className="h-3 w-3" />, className: "bg-red-50 text-red-700 border-red-200", label: "Defaulted" },
    closed: { icon: <CheckCircle2 className="h-3 w-3" />, className: "bg-gray-50 text-gray-700 border-gray-200", label: "Closed" },
  };
  const c = config[status] || { icon: null, className: "bg-gray-50 text-gray-700 border-gray-200", label: status };
  return (
    <Badge variant="outline" className={`${c.className} flex items-center gap-1 text-xs`}>
      {c.icon}{c.label}
    </Badge>
  );
};

export function AssetsLiabilities({ filter }: AssetsLiabilitiesProps) {
  const { selectedBranch } = useAccountsContext();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState(filter.toLowerCase().includes('liabilit') ? 'liabilities' : 'assets');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Dialogs
  const [addAssetOpen, setAddAssetOpen] = useState(false);
  const [addLiabilityOpen, setAddLiabilityOpen] = useState(false);
  const [viewAssetOpen, setViewAssetOpen] = useState(false);
  const [viewLiabilityOpen, setViewLiabilityOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedLiability, setSelectedLiability] = useState<Liability | null>(null);
  const [depreciationDialogOpen, setDepreciationDialogOpen] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [disposeAssetOpen, setDisposeAssetOpen] = useState(false);
  const [disposeData, setDisposeData] = useState({ salePrice: '', saleDate: '', buyer: '', notes: '' });
  const [depSchedule, setDepSchedule] = useState<any[]>([]);

  // Add Asset form state
  const [newAsset, setNewAsset] = useState({
    name: '', category: 'equipment', purchaseDate: '', purchasePrice: '',
    depreciationRate: String(DEPRECIATION_RATE_DEFAULTS['equipment']), depreciationMethod: 'WDV', description: '', status: 'active'
  });

  // Add Liability form state
  const [newLiability, setNewLiability] = useState({
    name: '', type: 'loan', amount: '', startDate: '', dueDate: '',
    creditorName: '', description: '', status: 'active',
    interestRate: '', emiAmount: '', emiDay: '', totalInstallments: ''
  });

  // Record payment form
  const [paymentData, setPaymentData] = useState({
    liabilityId: '', amount: '', paymentDate: '', reference: '', remarks: ''
  });

  // Fetch data directly from Supabase
  const [assets, setAssets] = useState<Asset[]>([]);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [isLoadingLiabilities, setIsLoadingLiabilities] = useState(true);

  const fetchAssets = async () => {
    setIsLoadingAssets(true);
    try {
      let assetsQuery = supabaseClient
        .from('fixed_assets')
        .select('*')
        .order('created_at', { ascending: false });
      assetsQuery = applyBranchScope(assetsQuery);
      const { data, error } = await assetsQuery;
      if (error) {
        // Table may not exist yet — treat as empty
        console.warn('Assets table not available:', error.message);
        setAssets([]);
        return;
      }
      setAssets((data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        value: Number(row.current_value) || 0,
        purchaseDate: row.purchase_date,
        description: row.description || '',
        status: row.status,
        branchId: row.branch_id || '',
        purchasePrice: Number(row.purchase_price) || 0,
        currentValue: Number(row.current_value) || 0,
        depreciationRate: Number(row.depreciation_rate) || 0,
        depreciationMethod: (row.depreciation_method || 'wdv').toUpperCase(),
        salvageValue: Number(row.salvage_value) || 0,
        accumulatedDepreciation: Number(row.accumulated_depreciation) || 0,
        lastDepreciationDate: row.last_depreciation_date || null,
      })));
    } catch (err) {
      console.warn('Error fetching assets:', err);
      setAssets([]);
    } finally {
      setIsLoadingAssets(false);
    }
  };

  const fetchLiabilities = async () => {
    setIsLoadingLiabilities(true);
    try {
      let liabilitiesQuery = supabaseClient
        .from('liabilities')
        .select('*')
        .order('created_at', { ascending: false });
      liabilitiesQuery = applyBranchScope(liabilitiesQuery);
      const { data, error } = await liabilitiesQuery;
      if (error) {
        // Table may not exist yet — treat as empty
        console.warn('Liabilities table not available:', error.message);
        setLiabilities([]);
        return;
      }
      setLiabilities((data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        amount: Number(row.original_amount) || 0,
        dueDate: row.due_date || '',
        description: row.description || '',
        status: row.status,
        branchId: row.branch_id || '',
        creditorName: row.creditor_name || '',
        startDate: row.start_date,
        remainingAmount: Number(row.remaining_amount) || 0,
        interestRate: Number(row.interest_rate) || 0,
        emiAmount: row.emi_amount != null ? Number(row.emi_amount) : null,
        emiDay: row.emi_day != null ? Number(row.emi_day) : null,
        totalInstallments: row.total_installments != null ? Number(row.total_installments) : null,
        paidInstallments: Number(row.paid_installments) || 0,
        nextPaymentDate: row.next_payment_date || null,
      })));
    } catch (err) {
      console.warn('Error fetching liabilities:', err);
      setLiabilities([]);
    } finally {
      setIsLoadingLiabilities(false);
    }
  };

  useEffect(() => { fetchAssets(); fetchLiabilities(); }, []);

  // Re-fetch whenever the header branch selection changes so a MAIN/HQ user
  // sees only the assets & liabilities of the branch they've switched to.
  useEffect(() => {
    const unsubscribe = onBranchScopeChange(() => { fetchAssets(); fetchLiabilities(); });
    return unsubscribe;
  }, []);

  // Re-fetch when tab changes
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setCategoryFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
    if (value === 'assets') fetchAssets();
    if (value === 'liabilities') fetchLiabilities();
  };

  const handleAddAsset = async () => {
    if (!newAsset.name || !newAsset.purchasePrice || !newAsset.purchaseDate) {
      toast({ title: "Error", description: "Please fill Name, Purchase Price and Purchase Date", variant: "destructive" });
      return;
    }
    try {
      await accountsApi.createAsset({
        name: newAsset.name,
        category: newAsset.category,
        purchaseDate: newAsset.purchaseDate,
        purchasePrice: Number(newAsset.purchasePrice),
        depreciationRate: Number(newAsset.depreciationRate) || 0,
        depreciationMethod: newAsset.depreciationMethod,
        description: newAsset.description || undefined,
        branchId: selectedBranch || null,
      });
      toast({ title: "Asset Added", description: `${newAsset.name} has been added to the asset register` });
      setAddAssetOpen(false);
      setNewAsset({ name: '', category: 'equipment', purchaseDate: '', purchasePrice: '', depreciationRate: String(DEPRECIATION_RATE_DEFAULTS['equipment']), depreciationMethod: 'WDV', description: '', status: 'active' });
      fetchAssets();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to add asset", variant: "destructive" });
    }
  };

  const handleAddLiability = async () => {
    if (!newLiability.name || !newLiability.amount || !newLiability.startDate) {
      toast({ title: "Error", description: "Please fill Name, Amount and Start Date", variant: "destructive" });
      return;
    }
    try {
      await accountsApi.createLiability({
        name: newLiability.name,
        type: newLiability.type,
        amount: Number(newLiability.amount),
        startDate: newLiability.startDate,
        dueDate: newLiability.dueDate || null,
        creditorName: newLiability.creditorName || null,
        description: newLiability.description || null,
        interestRate: Number(newLiability.interestRate) || 0,
        emiAmount: newLiability.emiAmount ? Number(newLiability.emiAmount) : null,
        emiDay: newLiability.emiDay ? Number(newLiability.emiDay) : null,
        totalInstallments: newLiability.totalInstallments ? Number(newLiability.totalInstallments) : null,
        branchId: selectedBranch || null,
      });
      toast({ title: "Liability Added", description: `${newLiability.name} has been recorded` });
      setAddLiabilityOpen(false);
      setNewLiability({ name: '', type: 'loan', amount: '', startDate: '', dueDate: '', creditorName: '', description: '', status: 'active', interestRate: '', emiAmount: '', emiDay: '', totalInstallments: '' });
      fetchLiabilities();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to add liability", variant: "destructive" });
    }
  };

  const handleRunDepreciation = async () => {
    // Eligible = active, has a depreciation rate, and is NOT a non-depreciable asset.
    // Land is never depreciated (Companies Act Sch. II / Income Tax Act).
    const NON_DEPRECIABLE = ['land'];
    const eligibleAssets = assets.filter(a =>
      a.status === 'active' &&
      a.depreciationRate > 0 &&
      !NON_DEPRECIABLE.includes(a.category)
    );
    if (eligibleAssets.length === 0) {
      toast({ title: "No Assets", description: "No active, depreciable assets with a depreciation rate found.", variant: "destructive" });
      return;
    }
    try {
      // Server-side run: enforces duplicate guard, salvage floor, additive
      // accumulation, land exclusion, and the 180-day rule authoritatively,
      // with an audit entry. See /api/accounts/depreciation.
      const result = await accountsApi.runDepreciation();
      const skipMsg = result.skipped > 0 ? ` (${result.skipped} already done this FY)` : '';
      if (result.processed === 0 && result.skipped > 0) {
        toast({ title: "Already Depreciated", description: `All eligible assets have already been depreciated for FY ${result.fy}.` });
      } else {
        toast({ title: "Depreciation Calculated", description: `Depreciation run for ${result.processed} asset${result.processed !== 1 ? 's' : ''} (FY ${result.fy})${skipMsg}.` });
      }
      setDepreciationDialogOpen(false);
      fetchAssets();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to run depreciation", variant: "destructive" });
    }
  };

  const handleRecordPayment = async () => {
    if (!paymentData.liabilityId || !paymentData.amount || !paymentData.paymentDate) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }
    try {
      // Server-side: validates amount, blocks overpayment, splits the payment
      // into interest (finance expense) and principal, and reduces the balance
      // by principal only — proper loan amortization with an audit entry.
      const result = await accountsApi.recordPayment({
        liabilityId: paymentData.liabilityId,
        amount: Number(paymentData.amount),
        paymentDate: paymentData.paymentDate,
        reference: paymentData.reference || null,
        remarks: paymentData.remarks || null,
      });
      const liability = liabilities.find(l => l.id === paymentData.liabilityId);
      const interestMsg = result.interestComponent > 0
        ? ` (Principal ₹${result.principalComponent.toLocaleString('en-IN')} + Interest ₹${result.interestComponent.toLocaleString('en-IN')})`
        : '';
      toast({
        title: result.closed ? "Liability Closed" : "Payment Recorded",
        description: `Payment recorded against ${liability?.name || 'liability'}${interestMsg}.`,
      });
      setRecordPaymentOpen(false);
      setPaymentData({ liabilityId: '', amount: '', paymentDate: '', reference: '', remarks: '' });
      fetchLiabilities();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to record payment", variant: "destructive" });
    }
  };

  // ── 5.2 Depreciation schedule: fetch the per-asset log when viewing an asset ──
  useEffect(() => {
    if (!viewAssetOpen || !selectedAsset) { setDepSchedule([]); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabaseClient
        .from('depreciation_log')
        .select('*')
        .eq('asset_id', selectedAsset.id)
        .order('depreciation_date', { ascending: true });
      if (!cancelled) setDepSchedule(error ? [] : (data || []));
    })();
    return () => { cancelled = true; };
  }, [viewAssetOpen, selectedAsset]);

  // ── 5.1 Asset disposal: record sale/scrap and compute profit/loss on disposal ──
  const handleDisposeAsset = async () => {
    if (!selectedAsset) return;
    const salePrice = Number(disposeData.salePrice) || 0;
    if (!disposeData.saleDate) {
      toast({ title: "Date Required", description: "Enter the disposal/sale date.", variant: "destructive" });
      return;
    }
    if (salePrice < 0) {
      toast({ title: "Invalid Price", description: "Sale price cannot be negative.", variant: "destructive" });
      return;
    }
    try {
      const bookValue = selectedAsset.currentValue;
      const profitLoss = salePrice - bookValue; // >0 profit, <0 loss on disposal
      // Holding period → short-term (<3 yrs) vs long-term for capital-gain classification.
      const held = selectedAsset.purchaseDate
        ? (new Date(disposeData.saleDate).getTime() - new Date(selectedAsset.purchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 365)
        : 0;
      const gainType = held >= 3 ? 'Long-term' : 'Short-term';

      await accountsApi.updateAsset(selectedAsset.id, {
        status: salePrice > 0 ? 'sold' : 'scrapped',
        sold_date: disposeData.saleDate,
        sold_price: salePrice,
        notes: `Disposed on ${disposeData.saleDate}${disposeData.buyer ? ` to ${disposeData.buyer}` : ''}. Book value ₹${bookValue.toLocaleString('en-IN')}, sale ₹${salePrice.toLocaleString('en-IN')}, ${profitLoss >= 0 ? 'profit' : 'loss'} ₹${Math.abs(profitLoss).toLocaleString('en-IN')} (${gainType}).${disposeData.notes ? ' ' + disposeData.notes : ''}`,
      });

      toast({
        title: "Asset Disposed",
        description: `${selectedAsset.name}: ${profitLoss >= 0 ? 'Profit' : 'Loss'} on disposal ₹${Math.abs(profitLoss).toLocaleString('en-IN')} (${gainType}).`,
      });
      setDisposeAssetOpen(false);
      setViewAssetOpen(false);
      setDisposeData({ salePrice: '', saleDate: '', buyer: '', notes: '' });
      fetchAssets();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to dispose asset", variant: "destructive" });
    }
  };

  // ── 5.5 Fixed Asset Register export (CSV) ──
  const handleExportRegister = () => {
    if (!filteredAssets.length) {
      toast({ title: "No Data", description: "No assets to export.", variant: "destructive" });
      return;
    }
    const headers = ['Asset Name', 'Category', 'Purchase Date', 'Purchase Price', 'Accumulated Depreciation', 'Net Book Value', 'Dep Rate %', 'Method', 'Status'];
    const rows = filteredAssets.map(a => [
      `"${(a.name || '').replace(/"/g, '""')}"`,
      a.category,
      a.purchaseDate || '',
      a.purchasePrice,
      (a.accumulatedDepreciation || (a.purchasePrice - a.currentValue)),
      a.currentValue,
      a.depreciationRate,
      a.depreciationMethod,
      a.status,
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fixed_asset_register_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${filteredAssets.length} assets exported to CSV.` });
  };

  // Metrics
  const assetMetrics = useMemo(() => {
    if (!assets || assets.length === 0) return { totalPurchase: 0, totalCurrent: 0, totalDepreciation: 0, count: 0 };
    const totalPurchase = assets.reduce((sum, a) => sum + a.purchasePrice, 0);
    const totalCurrent = assets.reduce((sum, a) => sum + a.currentValue, 0);
    return { totalPurchase, totalCurrent, totalDepreciation: totalPurchase - totalCurrent, count: assets.length };
  }, [assets]);

  const liabilityMetrics = useMemo(() => {
    if (!liabilities || liabilities.length === 0) return { totalOriginal: 0, totalRemaining: 0, totalPaid: 0, count: 0 };
    const totalOriginal = liabilities.reduce((sum, l) => sum + l.amount, 0);
    const totalRemaining = liabilities.reduce((sum, l) => sum + l.remainingAmount, 0);
    return { totalOriginal, totalRemaining, totalPaid: totalOriginal - totalRemaining, count: liabilities.length };
  }, [liabilities]);

  // Filtered data
  const filteredAssets = useMemo(() => {
    if (!assets) return [];
    return assets.filter(a => {
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q) || a.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [assets, categoryFilter, statusFilter, searchQuery]);

  const filteredLiabilities = useMemo(() => {
    if (!liabilities) return [];
    return liabilities.filter(l => {
      if (categoryFilter !== 'all' && l.type !== categoryFilter) return false;
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return l.name.toLowerCase().includes(q) || l.type.toLowerCase().includes(q) || (l.creditorName || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [liabilities, categoryFilter, statusFilter, searchQuery]);

  const depreciationPercent = assetMetrics.totalPurchase > 0 ? Math.round((assetMetrics.totalDepreciation / assetMetrics.totalPurchase) * 100) : 0;
  const repaymentPercent = liabilityMetrics.totalOriginal > 0 ? Math.round((liabilityMetrics.totalPaid / liabilityMetrics.totalOriginal) * 100) : 0;

  const getCategoryIcon = (category: string) => {
    const cat = ASSET_CATEGORIES.find(c => c.value === category);
    if (!cat) return <Briefcase className="h-4 w-4 text-gray-500" />;
    const Icon = cat.icon;
    return <Icon className={`h-4 w-4 ${cat.color}`} />;
  };

  const getCategoryBadgeClass = (category: string) => {
    return ASSET_CATEGORIES.find(c => c.value === category)?.bg || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const getLiabilityTypeBadgeClass = (type: string) => {
    return LIABILITY_TYPES.find(t => t.value === type)?.bg || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Assets & Liabilities</h2>
        <p className="text-muted-foreground mt-1">Fixed asset register, depreciation tracking, loans & obligations</p>
      </div>

      {/* Net Worth summary — Balance-sheet snapshot (Net Assets − Liabilities) */}
      <Card className="border-l-4 border-l-safend-red bg-linear-to-r from-red-50/40 to-transparent dark:from-red-950/10">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Net Book Value (Assets)</p>
            <p className="text-xl font-bold text-emerald-700">₹<CountUp to={assetMetrics.totalCurrent} duration={2} separator="," /></p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Outstanding Liabilities</p>
            <p className="text-xl font-bold text-red-600">- ₹<CountUp to={liabilityMetrics.totalRemaining} duration={2} separator="," /></p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Net Worth</p>
            <p className={`text-2xl font-bold ${(assetMetrics.totalCurrent - liabilityMetrics.totalRemaining) >= 0 ? 'text-safend-red' : 'text-red-700'}`}>
              ₹<CountUp to={assetMetrics.totalCurrent - liabilityMetrics.totalRemaining} duration={2} separator="," />
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          <TabsTrigger value="assets" className={activeTab === 'assets' ? 'bg-safend-red text-white' : ''}>
            <Briefcase className="h-4 w-4 mr-2" /> Assets ({assetMetrics.count})
          </TabsTrigger>
          <TabsTrigger value="liabilities" className={activeTab === 'liabilities' ? 'bg-safend-red text-white' : ''}>
            <ArrowDownCircle className="h-4 w-4 mr-2" /> Liabilities ({liabilityMetrics.count})
          </TabsTrigger>
        </TabsList>

        {/* ===================== ASSETS TAB ===================== */}
        <TabsContent value="assets" className="space-y-6 mt-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Assets</p>
                <p className="text-2xl font-bold mt-1"><CountUp to={assetMetrics.count} duration={2} separator="," /></p>
                <p className="text-xs text-muted-foreground mt-1">across {new Set(assets?.map(a => a.category) || []).size} categories</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Purchase Value</p>
                <p className="text-2xl font-bold mt-1">₹<CountUp to={assetMetrics.totalPurchase} duration={2} separator="," /></p>
                <p className="text-xs text-muted-foreground mt-1">original investment</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Acc. Depreciation</p>
                <p className="text-2xl font-bold mt-1 text-red-600">₹<CountUp to={assetMetrics.totalDepreciation} duration={2} separator="," /></p>
                <p className="text-xs text-muted-foreground mt-1">{depreciationPercent}% of purchase value</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Net Book Value</p>
                <p className="text-2xl font-bold mt-1 text-emerald-700">₹<CountUp to={assetMetrics.totalCurrent} duration={2} separator="," /></p>
                <p className="text-xs text-muted-foreground mt-1">current worth (WDV)</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Category Distribution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                {ASSET_CATEGORIES.map((cat) => {
                  const catAssets = assets?.filter(a => a.category === cat.value) || [];
                  if (catAssets.length === 0) return null;
                  const catValue = catAssets.reduce((s, a) => s + a.currentValue, 0);
                  const catPct = assetMetrics.totalCurrent > 0 ? Math.round((catValue / assetMetrics.totalCurrent) * 100) : 0;
                  const Icon = cat.icon;
                  return (
                    <div key={cat.value} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-3.5 w-3.5 ${cat.color}`} />
                          <span className="text-muted-foreground">{cat.label}</span>
                          <span className="text-xs text-muted-foreground">({catAssets.length})</span>
                        </div>
                        <span className="font-medium">{formatIndianCurrency(catValue)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={catPct} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground w-8">{catPct}%</span>
                      </div>
                    </div>
                  );
                })}
                {assets && assets.length > 0 && (
                  <div className="pt-2 border-t mt-3">
                    <div className="flex justify-between text-sm font-medium">
                      <span>Total Book Value</span>
                      <span>{formatIndianCurrency(assetMetrics.totalCurrent)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Depreciation Summary</CardTitle>
                  <Button size="sm" onClick={() => setDepreciationDialogOpen(true)}>
                    <ClipboardEdit className="h-3.5 w-3.5 mr-1" /> Run Depreciation
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-muted/40 border text-center">
                    <p className="text-[10px] text-muted-foreground uppercase">Purchase Value</p>
                    <p className="text-base font-bold">{formatIndianCurrency(assetMetrics.totalPurchase)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900 text-center">
                    <p className="text-[10px] text-red-600 uppercase">Depreciation</p>
                    <p className="text-base font-bold text-red-700">- {formatIndianCurrency(assetMetrics.totalDepreciation)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900 text-center">
                    <p className="text-[10px] text-green-600 uppercase">Book Value</p>
                    <p className="text-base font-bold text-green-700">= {formatIndianCurrency(assetMetrics.totalCurrent)}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Depreciation Progress</span>
                    <span className="font-medium">{depreciationPercent}%</span>
                  </div>
                  <Progress value={depreciationPercent} className="h-2" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search assets..." className="pl-9 h-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {ASSET_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="under_maintenance">Maintenance</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
                <SelectItem value="scrapped">Scrapped</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-2">
              <Button onClick={handleExportRegister} size="sm" variant="outline">
                <Download className="h-4 w-4 mr-1" /> Export Register
              </Button>
              <Button onClick={() => setAddAssetOpen(true)} size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add Asset
              </Button>
            </div>
          </div>

          {/* Assets Table */}
          <Card>
            <CardContent className="p-0">
              {isLoadingAssets ? (
                <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : filteredAssets.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Briefcase className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="font-medium">No assets found</p>
                  <p className="text-sm mt-1">{searchQuery || categoryFilter !== 'all' ? 'Try adjusting your filters' : 'Add your first asset to get started'}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Asset Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Purchase Date</TableHead>
                      <TableHead className="text-right">Purchase (₹)</TableHead>
                      <TableHead className="text-right">Book Value (₹)</TableHead>
                      <TableHead className="text-right">Dep. Rate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAssets.map((asset) => (
                      <TableRow key={asset.id} className="hover:bg-muted/40">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getCategoryIcon(asset.category)}
                            <div>
                              <p className="font-medium text-sm">{asset.name}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{asset.description}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] capitalize ${getCategoryBadgeClass(asset.category)}`}>
                            {asset.category.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{formatIndianDate(asset.purchaseDate)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatIndianCurrency(asset.purchasePrice)}</TableCell>
                        <TableCell className="text-right">
                          <p className="text-sm font-semibold text-emerald-700">{formatIndianCurrency(asset.currentValue)}</p>
                          <p className="text-[10px] text-red-500">-{formatIndianCurrency(asset.purchasePrice - asset.currentValue)}</p>
                        </TableCell>
                        <TableCell className="text-right text-sm">{asset.depreciationRate}% <span className="text-[10px] text-muted-foreground">{asset.depreciationMethod}</span></TableCell>
                        <TableCell><StatusBadge status={asset.status} /></TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelectedAsset(asset); setViewAssetOpen(true); }}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            {filteredAssets.length > 0 && (
              <CardFooter className="border-t px-6 py-3">
                <div className="flex justify-between w-full text-xs text-muted-foreground">
                  <span>{filteredAssets.length} of {assets?.length || 0} assets</span>
                  <span>Book Value: <strong className="text-foreground">{formatIndianCurrency(filteredAssets.reduce((s, a) => s + a.currentValue, 0))}</strong></span>
                </div>
              </CardFooter>
            )}
          </Card>
        </TabsContent>

        {/* ===================== LIABILITIES TAB ===================== */}
        <TabsContent value="liabilities" className="space-y-6 mt-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Liabilities</p>
                <p className="text-2xl font-bold mt-1">{liabilityMetrics.count}</p>
                <p className="text-xs text-muted-foreground mt-1">active obligations</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-orange-500">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Borrowed</p>
                <p className="text-2xl font-bold mt-1">{formatIndianCurrency(liabilityMetrics.totalOriginal)}</p>
                <p className="text-xs text-muted-foreground mt-1">original amount</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount Repaid</p>
                <p className="text-2xl font-bold mt-1 text-green-700">{formatIndianCurrency(liabilityMetrics.totalPaid)}</p>
                <p className="text-xs text-muted-foreground mt-1">{repaymentPercent}% settled</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Outstanding</p>
                <p className="text-2xl font-bold mt-1 text-red-600">{formatIndianCurrency(liabilityMetrics.totalRemaining)}</p>
                <p className="text-xs text-muted-foreground mt-1">yet to be paid</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Liability Composition</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                {LIABILITY_TYPES.map((t) => {
                  const typeItems = liabilities?.filter(l => l.type === t.value) || [];
                  if (typeItems.length === 0) return null;
                  const typeValue = typeItems.reduce((s, l) => s + l.remainingAmount, 0);
                  const typePct = liabilityMetrics.totalRemaining > 0 ? Math.round((typeValue / liabilityMetrics.totalRemaining) * 100) : 0;
                  return (
                    <div key={t.value} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className={`h-2.5 w-2.5 rounded-full ${t.value === 'loan' ? 'bg-red-500' : t.value === 'security_deposit' ? 'bg-blue-500' : t.value === 'inter_branch' ? 'bg-indigo-500' : t.value === 'advance' ? 'bg-amber-500' : 'bg-gray-500'}`} />
                          <span className="text-muted-foreground">{t.label}</span>
                          <span className="text-xs text-muted-foreground">({typeItems.length})</span>
                        </div>
                        <span className="font-medium">{formatIndianCurrency(typeValue)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={typePct} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground w-8">{typePct}%</span>
                      </div>
                    </div>
                  );
                })}
                {liabilities && liabilities.length > 0 && (
                  <div className="pt-2 border-t mt-3">
                    <div className="flex justify-between text-sm font-medium">
                      <span>Total Outstanding</span>
                      <span className="text-red-600">{formatIndianCurrency(liabilityMetrics.totalRemaining)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Repayment Progress</CardTitle>
                  <Button size="sm" onClick={() => setRecordPaymentOpen(true)}>
                    <IndianRupee className="h-3.5 w-3.5 mr-1" /> Record Payment
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-muted/40 border text-center">
                    <p className="text-[10px] text-muted-foreground uppercase">Total Borrowed</p>
                    <p className="text-base font-bold">{formatIndianCurrency(liabilityMetrics.totalOriginal)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900 text-center">
                    <p className="text-[10px] text-green-600 uppercase">Repaid</p>
                    <p className="text-base font-bold text-green-700">{formatIndianCurrency(liabilityMetrics.totalPaid)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900 text-center">
                    <p className="text-[10px] text-red-600 uppercase">Outstanding</p>
                    <p className="text-base font-bold text-red-700">{formatIndianCurrency(liabilityMetrics.totalRemaining)}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Repayment</span>
                    <span className="font-medium">{repaymentPercent}% complete</span>
                  </div>
                  <Progress value={repaymentPercent} className="h-2" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search liabilities..." className="pl-9 h-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {LIABILITY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="defaulted">Defaulted</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto">
              <Button onClick={() => setAddLiabilityOpen(true)} size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add Liability
              </Button>
            </div>
          </div>

          {/* Liabilities Table */}
          <Card>
            <CardContent className="p-0">
              {isLoadingLiabilities ? (
                <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : filteredLiabilities.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <ArrowDownCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="font-medium">No liabilities found</p>
                  <p className="text-sm mt-1">{searchQuery || categoryFilter !== 'all' ? 'Try adjusting your filters' : 'Add your first liability to get started'}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Creditor</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead className="text-right">Original (₹)</TableHead>
                      <TableHead className="text-right">Outstanding (₹)</TableHead>
                      <TableHead>Repaid</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLiabilities.map((liability) => {
                      const paidPct = liability.amount > 0 ? Math.round(((liability.amount - liability.remainingAmount) / liability.amount) * 100) : 0;
                      return (
                        <TableRow key={liability.id} className="hover:bg-muted/40">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <ArrowDownCircle className="h-4 w-4 text-red-500 shrink-0" />
                              <div>
                                <p className="font-medium text-sm">{liability.name}</p>
                                <p className="text-xs text-muted-foreground truncate max-w-[180px]">{liability.description}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] capitalize ${getLiabilityTypeBadgeClass(liability.type)}`}>
                              {liability.type.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{liability.creditorName || '—'}</TableCell>
                          <TableCell className="text-sm">{formatIndianDate(liability.startDate)}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{formatIndianCurrency(liability.amount)}</TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm font-semibold text-red-600">{formatIndianCurrency(liability.remainingAmount)}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 min-w-[70px]">
                              <Progress value={paidPct} className="h-1.5 flex-1" />
                              <span className="text-[10px] text-muted-foreground w-7">{paidPct}%</span>
                            </div>
                          </TableCell>
                          <TableCell><StatusBadge status={liability.status} /></TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelectedLiability(liability); setViewLiabilityOpen(true); }}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            {filteredLiabilities.length > 0 && (
              <CardFooter className="border-t px-6 py-3">
                <div className="flex justify-between w-full text-xs text-muted-foreground">
                  <span>{filteredLiabilities.length} of {liabilities?.length || 0} liabilities</span>
                  <span>Outstanding: <strong className="text-red-600">{formatIndianCurrency(filteredLiabilities.reduce((s, l) => s + l.remainingAmount, 0))}</strong></span>
                </div>
              </CardFooter>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============ DIALOGS ============ */}

      {/* Add Asset Dialog */}
      <Dialog open={addAssetOpen} onOpenChange={setAddAssetOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add New Asset</DialogTitle>
            <DialogDescription>Record a new fixed asset in the register</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <label className="text-sm font-medium">Asset Name *</label>
              <Input className="mt-1" placeholder="e.g. Office Laptop - Dell Latitude" value={newAsset.name} onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Category *</label>
                <Select
                  value={newAsset.category}
                  onValueChange={(v) => setNewAsset({
                    ...newAsset,
                    category: v,
                    // Auto-fill the IT Act default rate for the chosen category.
                    depreciationRate: String(DEPRECIATION_RATE_DEFAULTS[v] ?? ''),
                  })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSET_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Purchase Date *</label>
                <Input type="date" className="mt-1" value={newAsset.purchaseDate} onChange={(e) => setNewAsset({ ...newAsset, purchaseDate: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Purchase Price (₹) *</label>
                <Input type="number" className="mt-1" placeholder="0" value={newAsset.purchasePrice} onChange={(e) => setNewAsset({ ...newAsset, purchasePrice: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Depreciation Rate (%)</label>
                <Input type="number" className="mt-1" placeholder="e.g. 15" value={newAsset.depreciationRate} onChange={(e) => setNewAsset({ ...newAsset, depreciationRate: e.target.value })} />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {newAsset.category === 'land'
                    ? 'Land is non-depreciable — it is excluded from depreciation runs.'
                    : `IT Act default for ${ASSET_CATEGORIES.find(c => c.value === newAsset.category)?.label || 'this category'}: ${DEPRECIATION_RATE_DEFAULTS[newAsset.category] ?? 15}% — override if needed.`}
                </p>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Depreciation Method</label>
              <Select value={newAsset.depreciationMethod} onValueChange={(v) => setNewAsset({ ...newAsset, depreciationMethod: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEPRECIATION_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea className="mt-1" placeholder="Additional details about the asset..." value={newAsset.description} onChange={(e) => setNewAsset({ ...newAsset, description: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddAssetOpen(false)}>Cancel</Button>
            <Button onClick={handleAddAsset}><Plus className="h-4 w-4 mr-1" /> Add Asset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Liability Dialog */}
      <Dialog open={addLiabilityOpen} onOpenChange={setAddLiabilityOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add New Liability</DialogTitle>
            <DialogDescription>Record a new loan, deposit, or obligation</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <label className="text-sm font-medium">Liability Name *</label>
              <Input className="mt-1" placeholder="e.g. Business Loan - SBI" value={newLiability.name} onChange={(e) => setNewLiability({ ...newLiability, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Type *</label>
                <Select value={newLiability.type} onValueChange={(v) => setNewLiability({ ...newLiability, type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LIABILITY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Amount (₹) *</label>
                <Input type="number" className="mt-1" placeholder="0" value={newLiability.amount} onChange={(e) => setNewLiability({ ...newLiability, amount: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Start Date *</label>
                <Input type="date" className="mt-1" value={newLiability.startDate} onChange={(e) => setNewLiability({ ...newLiability, startDate: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Due Date</label>
                <Input type="date" className="mt-1" value={newLiability.dueDate} onChange={(e) => setNewLiability({ ...newLiability, dueDate: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Creditor Name</label>
              <Input className="mt-1" placeholder="e.g. State Bank of India" value={newLiability.creditorName} onChange={(e) => setNewLiability({ ...newLiability, creditorName: e.target.value })} />
            </div>

            {/* Loan terms — interest & EMI (for amortization and interest accrual) */}
            {newLiability.type === 'loan' && (
              <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Loan Terms (for EMI schedule & interest accrual)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Interest Rate (% p.a.)</label>
                    <Input type="number" min="0" step="0.01" className="mt-1" placeholder="e.g. 9.5" value={newLiability.interestRate} onChange={(e) => setNewLiability({ ...newLiability, interestRate: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">EMI Amount (₹)</label>
                    <Input type="number" min="0" className="mt-1" placeholder="Monthly instalment" value={newLiability.emiAmount} onChange={(e) => setNewLiability({ ...newLiability, emiAmount: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Total Installments</label>
                    <Input type="number" min="0" className="mt-1" placeholder="e.g. 36" value={newLiability.totalInstallments} onChange={(e) => setNewLiability({ ...newLiability, totalInstallments: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">EMI Day (1–31)</label>
                    <Input type="number" min="1" max="31" className="mt-1" placeholder="e.g. 5" value={newLiability.emiDay} onChange={(e) => setNewLiability({ ...newLiability, emiDay: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea className="mt-1" placeholder="Additional details..." value={newLiability.description} onChange={(e) => setNewLiability({ ...newLiability, description: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddLiabilityOpen(false)}>Cancel</Button>
            <Button onClick={handleAddLiability}><Plus className="h-4 w-4 mr-1" /> Add Liability</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Asset Dialog */}
      <Dialog open={viewAssetOpen} onOpenChange={setViewAssetOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Asset Details</DialogTitle>
          </DialogHeader>
          {selectedAsset && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3">
                {getCategoryIcon(selectedAsset.category)}
                <div>
                  <h3 className="font-semibold">{selectedAsset.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedAsset.description}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded border bg-muted/30">
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="font-medium capitalize">{selectedAsset.category.replace('_', ' ')}</p>
                </div>
                <div className="p-3 rounded border bg-muted/30">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <StatusBadge status={selectedAsset.status} />
                </div>
                <div className="p-3 rounded border bg-muted/30">
                  <p className="text-xs text-muted-foreground">Purchase Date</p>
                  <p className="font-medium">{formatIndianDate(selectedAsset.purchaseDate)}</p>
                </div>
                <div className="p-3 rounded border bg-muted/30">
                  <p className="text-xs text-muted-foreground">Dep. Method</p>
                  <p className="font-medium">{selectedAsset.depreciationMethod} @ {selectedAsset.depreciationRate}%</p>
                </div>
                <div className="p-3 rounded border bg-green-50 dark:bg-green-950/20">
                  <p className="text-xs text-green-600">Purchase Price</p>
                  <p className="font-bold">{formatIndianCurrency(selectedAsset.purchasePrice)}</p>
                </div>
                <div className="p-3 rounded border bg-blue-50 dark:bg-blue-950/20">
                  <p className="text-xs text-blue-600">Current Book Value</p>
                  <p className="font-bold">{formatIndianCurrency(selectedAsset.currentValue)}</p>
                </div>
              </div>
              <div className="p-3 rounded border bg-red-50 dark:bg-red-950/20">
                <div className="flex justify-between text-sm">
                  <span className="text-red-600">Accumulated Depreciation</span>
                  <span className="font-bold text-red-700">{formatIndianCurrency(selectedAsset.purchasePrice - selectedAsset.currentValue)}</span>
                </div>
                <Progress value={Math.round(((selectedAsset.purchasePrice - selectedAsset.currentValue) / selectedAsset.purchasePrice) * 100)} className="h-1.5 mt-2" />
              </div>

              {/* 5.2 Depreciation schedule (FY-wise from the log) */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">Depreciation Schedule</p>
                {depSchedule.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No depreciation recorded yet. Run depreciation to build the schedule.</p>
                ) : (
                  <div className="rounded border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-2 py-1.5">FY</th>
                          <th className="text-right px-2 py-1.5">Opening</th>
                          <th className="text-right px-2 py-1.5">Depreciation</th>
                          <th className="text-right px-2 py-1.5">Closing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {depSchedule.map((d: any) => (
                          <tr key={d.id} className="border-t">
                            <td className="px-2 py-1.5">{d.financial_year}</td>
                            <td className="text-right px-2 py-1.5">{formatIndianCurrency(Number(d.opening_value))}</td>
                            <td className="text-right px-2 py-1.5 text-red-600">-{formatIndianCurrency(Number(d.depreciation_amount))}</td>
                            <td className="text-right px-2 py-1.5 font-medium">{formatIndianCurrency(Number(d.closing_value))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewAssetOpen(false)}>Close</Button>
            {selectedAsset && selectedAsset.status !== 'sold' && selectedAsset.status !== 'scrapped' && (
              <Button
                variant="destructive"
                onClick={() => {
                  setDisposeData({ salePrice: '', saleDate: new Date().toISOString().split('T')[0], buyer: '', notes: '' });
                  setDisposeAssetOpen(true);
                }}
              >
                <ArrowDownCircle className="h-4 w-4 mr-1" /> Dispose / Sell
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5.1 Dispose Asset Dialog */}
      <Dialog open={disposeAssetOpen} onOpenChange={setDisposeAssetOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Dispose / Sell Asset</DialogTitle>
            <DialogDescription>
              Record the sale or scrapping of {selectedAsset?.name}. Profit/loss on disposal is computed against the current book value.
            </DialogDescription>
          </DialogHeader>
          {selectedAsset && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded bg-muted/40 border text-sm flex justify-between">
                <span className="text-muted-foreground">Current Book Value</span>
                <span className="font-semibold">{formatIndianCurrency(selectedAsset.currentValue)}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Sale Price (₹)</label>
                  <Input type="number" min="0" className="mt-1" placeholder="0 for scrap" value={disposeData.salePrice} onChange={(e) => setDisposeData({ ...disposeData, salePrice: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium">Disposal Date *</label>
                  <Input type="date" className="mt-1" value={disposeData.saleDate} onChange={(e) => setDisposeData({ ...disposeData, saleDate: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Buyer / Recipient</label>
                <Input className="mt-1" placeholder="Optional" value={disposeData.buyer} onChange={(e) => setDisposeData({ ...disposeData, buyer: e.target.value })} />
              </div>
              {/* Live P&L preview */}
              {disposeData.salePrice !== '' && (() => {
                const pl = (Number(disposeData.salePrice) || 0) - selectedAsset.currentValue;
                return (
                  <div className={`p-3 rounded border text-sm flex justify-between ${pl >= 0 ? 'bg-green-50 dark:bg-green-950/20 border-green-200' : 'bg-red-50 dark:bg-red-950/20 border-red-200'}`}>
                    <span className={pl >= 0 ? 'text-green-700' : 'text-red-700'}>{pl >= 0 ? 'Profit on Disposal' : 'Loss on Disposal'}</span>
                    <span className={`font-bold ${pl >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatIndianCurrency(Math.abs(pl))}</span>
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisposeAssetOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDisposeAsset}>Confirm Disposal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Liability Dialog */}
      <Dialog open={viewLiabilityOpen} onOpenChange={setViewLiabilityOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Liability Details</DialogTitle>
          </DialogHeader>
          {selectedLiability && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3">
                <ArrowDownCircle className="h-5 w-5 text-red-500" />
                <div>
                  <h3 className="font-semibold">{selectedLiability.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedLiability.description}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded border bg-muted/30">
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="font-medium capitalize">{selectedLiability.type.replace('_', ' ')}</p>
                </div>
                <div className="p-3 rounded border bg-muted/30">
                  <p className="text-xs text-muted-foreground">Creditor</p>
                  <p className="font-medium">{selectedLiability.creditorName || '—'}</p>
                </div>
                <div className="p-3 rounded border bg-muted/30">
                  <p className="text-xs text-muted-foreground">Start Date</p>
                  <p className="font-medium">{formatIndianDate(selectedLiability.startDate)}</p>
                </div>
                <div className="p-3 rounded border bg-muted/30">
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <p className="font-medium">{formatIndianDate(selectedLiability.dueDate)}</p>
                </div>
                <div className="p-3 rounded border bg-muted/30">
                  <p className="text-xs text-muted-foreground">Original Amount</p>
                  <p className="font-bold">{formatIndianCurrency(selectedLiability.amount)}</p>
                </div>
                <div className="p-3 rounded border bg-red-50 dark:bg-red-950/20">
                  <p className="text-xs text-red-600">Outstanding</p>
                  <p className="font-bold text-red-700">{formatIndianCurrency(selectedLiability.remainingAmount)}</p>
                </div>
              </div>
              <div className="p-3 rounded border bg-green-50 dark:bg-green-950/20">
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Repaid</span>
                  <span className="font-bold text-green-700">{formatIndianCurrency(selectedLiability.amount - selectedLiability.remainingAmount)}</span>
                </div>
                <Progress value={Math.round(((selectedLiability.amount - selectedLiability.remainingAmount) / selectedLiability.amount) * 100)} className="h-1.5 mt-2" />
                <p className="text-xs text-muted-foreground mt-1">{Math.round(((selectedLiability.amount - selectedLiability.remainingAmount) / selectedLiability.amount) * 100)}% complete</p>
              </div>

              {/* Loan terms + accrued interest (3.5) */}
              {selectedLiability.interestRate > 0 && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 rounded border bg-muted/30">
                    <p className="text-xs text-muted-foreground">Interest Rate</p>
                    <p className="font-medium">{selectedLiability.interestRate}% p.a.</p>
                  </div>
                  <div className="p-3 rounded border bg-amber-50 dark:bg-amber-950/20">
                    <p className="text-xs text-amber-600">Accrued Interest (this month)</p>
                    <p className="font-bold text-amber-700">{formatIndianCurrency(Math.round(selectedLiability.remainingAmount * (selectedLiability.interestRate / 100) / 12))}</p>
                  </div>
                  {selectedLiability.emiAmount ? (
                    <div className="p-3 rounded border bg-muted/30">
                      <p className="text-xs text-muted-foreground">EMI</p>
                      <p className="font-medium">{formatIndianCurrency(selectedLiability.emiAmount)}{selectedLiability.emiDay ? ` · day ${selectedLiability.emiDay}` : ''}</p>
                    </div>
                  ) : null}
                  {selectedLiability.totalInstallments ? (
                    <div className="p-3 rounded border bg-muted/30">
                      <p className="text-xs text-muted-foreground">Installments</p>
                      <p className="font-medium">{selectedLiability.paidInstallments} / {selectedLiability.totalInstallments} paid</p>
                    </div>
                  ) : null}
                </div>
              )}

              {/* 5.3 Amortization schedule */}
              {(() => {
                const schedule = buildAmortizationSchedule(
                  selectedLiability.amount,
                  selectedLiability.interestRate,
                  selectedLiability.emiAmount || 0,
                  selectedLiability.totalInstallments,
                );
                if (schedule.length === 0) return null;
                const totalInterest = schedule.reduce((s, r) => s + r.interest, 0);
                return (
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase">Amortization Schedule</p>
                      <p className="text-[11px] text-muted-foreground">Total interest: <span className="font-medium text-amber-700">{formatIndianCurrency(totalInterest)}</span></p>
                    </div>
                    <div className="rounded border overflow-hidden max-h-52 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="text-left px-2 py-1.5">#</th>
                            <th className="text-right px-2 py-1.5">Opening</th>
                            <th className="text-right px-2 py-1.5">Interest</th>
                            <th className="text-right px-2 py-1.5">Principal</th>
                            <th className="text-right px-2 py-1.5">Closing</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schedule.map(r => (
                            <tr key={r.n} className="border-t">
                              <td className="px-2 py-1.5">{r.n}</td>
                              <td className="text-right px-2 py-1.5">{formatIndianCurrency(r.opening)}</td>
                              <td className="text-right px-2 py-1.5 text-amber-600">{formatIndianCurrency(r.interest)}</td>
                              <td className="text-right px-2 py-1.5 text-blue-600">{formatIndianCurrency(r.principal)}</td>
                              <td className="text-right px-2 py-1.5 font-medium">{formatIndianCurrency(r.closing)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewLiabilityOpen(false)}>Close</Button>
            <Button onClick={() => { setViewLiabilityOpen(false); setPaymentData({ ...paymentData, liabilityId: selectedLiability?.id || '' }); setRecordPaymentOpen(true); }}>
              <IndianRupee className="h-4 w-4 mr-1" /> Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run Depreciation Dialog */}
      <Dialog open={depreciationDialogOpen} onOpenChange={setDepreciationDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Run Depreciation</DialogTitle>
            <DialogDescription>
              Calculate depreciation for all active assets as per Income Tax Act, 1961 rates
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-4 rounded-lg bg-muted/50 border space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Active Assets</span>
                <span className="font-medium">{assets?.filter(a => a.status === 'active').length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Book Value</span>
                <span className="font-medium">{formatIndianCurrency(assetMetrics.totalCurrent)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method</span>
                <span className="font-medium">As per asset config (WDV/SLM)</span>
              </div>
            </div>
            <div className="p-3 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 text-sm text-amber-800 dark:text-amber-200 space-y-1">
              <p><strong>Note:</strong> Calculates annual depreciation for the current financial year (1 Apr – 31 Mar) and updates book values. Each run is logged as an audit entry.</p>
              <ul className="list-disc pl-4 text-xs space-y-0.5">
                <li>Safe to click more than once — assets already depreciated this year are skipped (no double-charging).</li>
                <li>Assets acquired on/after 1 Oct get 50% depreciation in their first year (180-day rule).</li>
                <li>Depreciation stops at each asset&apos;s salvage value; Land is never depreciated.</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepreciationDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRunDepreciation}><ClipboardEdit className="h-4 w-4 mr-1" /> Run Depreciation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={recordPaymentOpen} onOpenChange={setRecordPaymentOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>Record a payment against an active liability</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <label className="text-sm font-medium">Liability *</label>
              <Select value={paymentData.liabilityId} onValueChange={(v) => setPaymentData({ ...paymentData, liabilityId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select liability" /></SelectTrigger>
                <SelectContent>
                  {(liabilities || []).filter(l => l.status === 'active').map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name} — Outstanding: {formatIndianCurrency(l.remainingAmount)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Amount (₹) *</label>
                <Input type="number" className="mt-1" placeholder="0" value={paymentData.amount} onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Payment Date *</label>
                <Input type="date" className="mt-1" value={paymentData.paymentDate} onChange={(e) => setPaymentData({ ...paymentData, paymentDate: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Reference / Txn No.</label>
              <Input className="mt-1" placeholder="e.g. NEFT/UTR number" value={paymentData.reference} onChange={(e) => setPaymentData({ ...paymentData, reference: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Remarks</label>
              <Input className="mt-1" placeholder="Optional notes" value={paymentData.remarks} onChange={(e) => setPaymentData({ ...paymentData, remarks: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordPaymentOpen(false)}>Cancel</Button>
            <Button onClick={handleRecordPayment}><IndianRupee className="h-4 w-4 mr-1" /> Record Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
