'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAccountsContext } from '@/contexts/AccountsContext';
import { supabaseClient } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { formatIndianCurrency, formatIndianDate } from '@/utils/errorHandler';
import { applyBranchScope } from '@/utils/branchScope';
import { CountUp } from '@/components/dashboard/CountUp';
import {
  Landmark, CreditCard, Wallet, Plus, Search, FileText, Building2,
  Ban, CheckCircle2, Clock, AlertTriangle, ChevronLeft, ChevronRight,
  Download, Filter
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

export interface BankingModuleProps {
  filter: string;
}

interface BankAccountRow {
  id: string;
  account_name: string;
  account_number: string;
  bank_name: string;
  branch_name: string;
  ifsc_code: string;
  account_type: string;
  opening_balance: number;
  current_balance: number;
  status: string;
  branch_id: string;
  notes: string;
  created_at: string;
  created_by: string | null;
}

interface TransactionRow {
  id: string;
  account_id: string;
  transaction_date: string;
  type: string;
  amount: number;
  running_balance: number;
  category: string;
  description: string;
  reference_number: string;
  payment_mode: string;
  party_name: string;
  is_reconciled: boolean;
  is_void: boolean;
  approval_status: string;
  created_by: string | null;
  created_at: string;
  total_count?: number;
}

interface CashEntry {
  id: string;
  transaction_date: string;
  type: string;
  amount: number;
  running_balance: number;
  category: string;
  description: string;
  received_from: string;
  paid_to: string;
  voucher_number: string;
  approval_status: string;
  is_void: boolean;
  created_at: string;
}

interface ChequeEntry {
  id: string;
  account_id: string;
  cheque_number: string;
  type: string;
  amount: number;
  issue_date: string;
  party_name: string;
  purpose: string;
  status: string;
  clearance_date: string;
  bounce_reason: string;
  linked_transaction_id: string | null;
  created_at: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const ACCOUNT_TYPES = [
  { value: 'current', label: 'Current Account' },
  { value: 'savings', label: 'Savings Account' },
  { value: 'overdraft', label: 'Overdraft' },
  { value: 'fixed_deposit', label: 'Fixed Deposit' },
  { value: 'cash_credit', label: 'Cash Credit' },
];

const PAYMENT_MODES = [
  { value: 'neft', label: 'NEFT' },
  { value: 'rtgs', label: 'RTGS' },
  { value: 'imps', label: 'IMPS' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'dd', label: 'Demand Draft' },
  { value: 'auto_debit', label: 'Auto Debit' },
];

const TRANSACTION_CATEGORIES = [
  { value: 'client_receipt', label: 'Client Receipt' },
  { value: 'salary', label: 'Salary Payment' },
  { value: 'vendor_payment', label: 'Vendor Payment' },
  { value: 'loan_emi', label: 'Loan EMI' },
  { value: 'rent', label: 'Rent' },
  { value: 'utility', label: 'Utility Bill' },
  { value: 'petty_cash', label: 'Petty Cash' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'interest', label: 'Interest' },
  { value: 'tax', label: 'Tax Payment' },
  { value: 'refund', label: 'Refund' },
  { value: 'other', label: 'Other' },
];

const PAGE_SIZE = 50;

// IFSC validation: 4 uppercase letters + 0 + 6 alphanumeric
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// ============================================================
// COMPONENT
// ============================================================

export function BankingModule({ filter }: BankingModuleProps) {
  const { selectedBranch } = useAccountsContext();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('accounts');

  // Data states
  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [cashEntries, setCashEntries] = useState<CashEntry[]>([]);
  const [cheques, setCheques] = useState<ChequeEntry[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [loadingCash, setLoadingCash] = useState(true);
  const [loadingCheques, setLoadingCheques] = useState(true);

  // Pagination
  const [txPage, setTxPage] = useState(1);
  const [txTotalCount, setTxTotalCount] = useState(0);
  const [cashPage, setCashPage] = useState(1);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Dialog states
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [addTransactionOpen, setAddTransactionOpen] = useState(false);
  const [addCashOpen, setAddCashOpen] = useState(false);
  const [addChequeOpen, setAddChequeOpen] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<{ id: string; description: string } | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Form states
  const [newAccount, setNewAccount] = useState({
    account_name: '', account_number: '', bank_name: '', branch_name: '',
    ifsc_code: '', account_type: 'current', opening_balance: '', notes: ''
  });
  const [newTransaction, setNewTransaction] = useState({
    account_id: '', type: 'debit', amount: '', transaction_date: '',
    category: 'other', description: '', reference_number: '', payment_mode: 'neft', party_name: ''
  });
  const [newCash, setNewCash] = useState({
    type: 'cash_in', amount: '', transaction_date: '', description: '',
    category: '', received_from: '', paid_to: '', voucher_number: ''
  });
  const [newCheque, setNewCheque] = useState({
    account_id: '', cheque_number: '', type: 'issued', amount: '',
    issue_date: '', party_name: '', purpose: ''
  });

  // Current user ID for audit
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabaseClient.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUserId(data.user.id);
    });
  }, []);

  // ============================================================
  // DATA FETCHING
  // ============================================================

  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      let query = supabaseClient.from('bank_accounts').select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });
      query = applyBranchScope(query);
      const { data, error } = await query;
      if (error) {
        console.warn('Bank accounts table not available:', error.message);
        setAccounts([]);
        return;
      }
      setAccounts(data || []);
    } catch { setAccounts([]); }
    finally { setLoadingAccounts(false); }
  }, []);

  const fetchTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    try {
      // Use RPC for paginated, filtered queries
      const { data, error } = await supabaseClient.rpc('get_bank_transactions_paginated', {
        p_branch_id: selectedBranch || null,
        p_start_date: dateFilter.start || null,
        p_end_date: dateFilter.end || null,
        p_type: typeFilter !== 'all' ? typeFilter : null,
        p_category: categoryFilter !== 'all' ? categoryFilter : null,
        p_search: searchQuery || null,
        p_page: txPage,
        p_page_size: PAGE_SIZE,
      });

      if (error) {
        // Fallback to direct query if RPC not available yet
        console.warn('RPC not available, falling back:', error.message);
        let query = supabaseClient.from('bank_transactions').select('*')
          .order('transaction_date', { ascending: false })
          .range((txPage - 1) * PAGE_SIZE, txPage * PAGE_SIZE - 1);
        query = applyBranchScope(query);
        const { data: fallbackData } = await query;
        setTransactions(fallbackData || []);
        setTxTotalCount(fallbackData?.length || 0);
        return;
      }

      setTransactions(data || []);
      setTxTotalCount(data?.[0]?.total_count || 0);
    } catch { setTransactions([]); }
    finally { setLoadingTransactions(false); }
  }, [txPage, searchQuery, dateFilter, typeFilter, categoryFilter, selectedBranch]);

  const fetchCash = useCallback(async () => {
    setLoadingCash(true);
    try {
      let query = supabaseClient.from('cash_register').select('*')
        .order('transaction_date', { ascending: false })
        .range((cashPage - 1) * PAGE_SIZE, cashPage * PAGE_SIZE - 1);
      query = applyBranchScope(query);
      const { data, error } = await query;
      if (error) { setCashEntries([]); return; }
      setCashEntries(data || []);
    } catch { setCashEntries([]); }
    finally { setLoadingCash(false); }
  }, [cashPage]);

  const fetchCheques = useCallback(async () => {
    setLoadingCheques(true);
    try {
      let query = supabaseClient.from('cheque_register').select('*')
        .order('issue_date', { ascending: false });
      query = applyBranchScope(query);
      const { data, error } = await query;
      if (error) { setCheques([]); return; }
      setCheques(data || []);
    } catch { setCheques([]); }
    finally { setLoadingCheques(false); }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);
  useEffect(() => { if (activeTab === 'transactions') fetchTransactions(); }, [activeTab, fetchTransactions]);
  useEffect(() => { if (activeTab === 'cash') fetchCash(); }, [activeTab, fetchCash]);
  useEffect(() => { if (activeTab === 'cheques') fetchCheques(); }, [activeTab, fetchCheques]);

  // ============================================================
  // METRICS (computed from DB data, not client-side sum of all records)
  // ============================================================

  const totalBalance = useMemo(() => accounts.reduce((s, a) => s + Number(a.current_balance), 0), [accounts]);
  const activeAccountsCount = useMemo(() => accounts.filter(a => a.status === 'active').length, [accounts]);

  const recentCredits = useMemo(() => {
    return transactions
      .filter(t => t.type === 'credit' && !t.is_void)
      .reduce((s, t) => s + Number(t.amount), 0);
  }, [transactions]);

  const recentDebits = useMemo(() => {
    return transactions
      .filter(t => t.type === 'debit' && !t.is_void)
      .reduce((s, t) => s + Number(t.amount), 0);
  }, [transactions]);

  const cashBalance = useMemo(() => {
    // Use running_balance from the most recent entry if available
    const validEntries = cashEntries.filter(e => !e.is_void);
    if (validEntries.length > 0 && validEntries[0].running_balance != null) {
      return Number(validEntries[0].running_balance);
    }
    return validEntries.reduce((s, e) => e.type === 'cash_in' ? s + Number(e.amount) : s - Number(e.amount), 0);
  }, [cashEntries]);

  const pendingApprovals = useMemo(() => {
    return transactions.filter(t => t.approval_status === 'pending').length;
  }, [transactions]);

  // ============================================================
  // HANDLERS
  // ============================================================

  const handleAddAccount = async () => {
    if (!newAccount.account_name || !newAccount.account_number || !newAccount.bank_name || !newAccount.ifsc_code) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }

    // Client-side IFSC validation (DB also validates)
    if (!IFSC_REGEX.test(newAccount.ifsc_code)) {
      toast({ title: "Invalid IFSC", description: "Format must be XXXX0XXXXXX (e.g., SBIN0001234)", variant: "destructive" });
      return;
    }

    try {
      const balance = Number(newAccount.opening_balance) || 0;
      const { error } = await supabaseClient.from('bank_accounts').insert({
        account_name: newAccount.account_name,
        account_number: newAccount.account_number,
        bank_name: newAccount.bank_name,
        branch_name: newAccount.branch_name || null,
        ifsc_code: newAccount.ifsc_code,
        account_type: newAccount.account_type,
        opening_balance: balance,
        current_balance: balance,
        status: 'active',
        branch_id: selectedBranch || null,
        notes: newAccount.notes || null,
        created_by: currentUserId,
      });
      if (error) throw error;
      toast({ title: "Account Added", description: `${newAccount.account_name} at ${newAccount.bank_name} added successfully` });
      setAddAccountOpen(false);
      setNewAccount({ account_name: '', account_number: '', bank_name: '', branch_name: '', ifsc_code: '', account_type: 'current', opening_balance: '', notes: '' });
      fetchAccounts();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to add account", variant: "destructive" });
    }
  };

  const handleAddTransaction = async () => {
    if (!newTransaction.account_id || !newTransaction.amount || !newTransaction.transaction_date || !newTransaction.description) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }

    try {
      const amount = Number(newTransaction.amount);
      if (amount <= 0) {
        toast({ title: "Error", description: "Amount must be greater than zero", variant: "destructive" });
        return;
      }

      // DB trigger handles: running_balance calculation, balance update, approval check, period lock
      const { error: txError } = await supabaseClient.from('bank_transactions').insert({
        account_id: newTransaction.account_id,
        transaction_date: newTransaction.transaction_date,
        type: newTransaction.type,
        amount,
        category: newTransaction.category,
        description: newTransaction.description,
        reference_number: newTransaction.reference_number || null,
        payment_mode: newTransaction.payment_mode,
        party_name: newTransaction.party_name || null,
        branch_id: selectedBranch || null,
        created_by: currentUserId,
      });

      if (txError) throw txError;

      toast({ title: "Transaction Recorded", description: `₹${amount.toLocaleString('en-IN')} ${newTransaction.type} recorded` });
      setAddTransactionOpen(false);
      setNewTransaction({ account_id: '', type: 'debit', amount: '', transaction_date: '', category: 'other', description: '', reference_number: '', payment_mode: 'neft', party_name: '' });
      fetchTransactions();
      fetchAccounts(); // Refresh balance
    } catch (err: any) {
      // Handle period-locked errors gracefully
      if (err?.message?.includes('closed accounting period')) {
        toast({ title: "Period Locked", description: "This date falls in a closed accounting period. Choose a different date.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: err?.message || "Failed to record transaction", variant: "destructive" });
      }
    }
  };

  const handleAddCash = async () => {
    if (!newCash.amount || !newCash.transaction_date || !newCash.description) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }
    try {
      const { error } = await supabaseClient.from('cash_register').insert({
        transaction_date: newCash.transaction_date,
        type: newCash.type,
        amount: Number(newCash.amount),
        category: newCash.category || null,
        description: newCash.description,
        received_from: newCash.received_from || null,
        paid_to: newCash.paid_to || null,
        voucher_number: newCash.voucher_number || null,
        branch_id: selectedBranch || null,
        created_by: currentUserId,
      });
      if (error) throw error;
      toast({ title: "Cash Entry Recorded", description: `₹${Number(newCash.amount).toLocaleString('en-IN')} ${newCash.type === 'cash_in' ? 'received' : 'paid'}` });
      setAddCashOpen(false);
      setNewCash({ type: 'cash_in', amount: '', transaction_date: '', description: '', category: '', received_from: '', paid_to: '', voucher_number: '' });
      fetchCash();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to record cash entry", variant: "destructive" });
    }
  };

  const handleAddCheque = async () => {
    if (!newCheque.cheque_number || !newCheque.amount || !newCheque.issue_date || !newCheque.party_name) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }
    try {
      const { error } = await supabaseClient.from('cheque_register').insert({
        account_id: newCheque.account_id || null,
        cheque_number: newCheque.cheque_number,
        type: newCheque.type,
        amount: Number(newCheque.amount),
        issue_date: newCheque.issue_date,
        party_name: newCheque.party_name,
        purpose: newCheque.purpose || null,
        status: 'pending',
        branch_id: selectedBranch || null,
        created_by: currentUserId,
      });
      if (error) throw error;
      toast({ title: "Cheque Recorded", description: `Cheque #${newCheque.cheque_number} for ₹${Number(newCheque.amount).toLocaleString('en-IN')}` });
      setAddChequeOpen(false);
      setNewCheque({ account_id: '', cheque_number: '', type: 'issued', amount: '', issue_date: '', party_name: '', purpose: '' });
      fetchCheques();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to record cheque", variant: "destructive" });
    }
  };

  const handleVoidTransaction = async () => {
    if (!voidTarget || !voidReason.trim()) {
      toast({ title: "Error", description: "Please provide a reason for voiding", variant: "destructive" });
      return;
    }
    try {
      const { error } = await supabaseClient.rpc('fn_void_transaction', {
        p_transaction_id: voidTarget.id,
        p_reason: voidReason,
        p_user_id: currentUserId,
      });
      if (error) throw error;
      toast({ title: "Transaction Voided", description: `Transaction voided: ${voidTarget.description}` });
      setVoidDialogOpen(false);
      setVoidTarget(null);
      setVoidReason('');
      fetchTransactions();
      fetchAccounts();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to void transaction", variant: "destructive" });
    }
  };

  const handleApproveTransaction = async (txId: string) => {
    try {
      const { error } = await supabaseClient.from('bank_transactions')
        .update({ approval_status: 'approved', approved_by: currentUserId, approved_at: new Date().toISOString() })
        .eq('id', txId);
      if (error) throw error;
      toast({ title: "Approved", description: "Transaction approved" });
      fetchTransactions();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to approve", variant: "destructive" });
    }
  };

  const handleChequeStatusChange = async (chequeId: string, newStatus: string, clearanceDate?: string) => {
    try {
      const updateData: Record<string, any> = {
        status: newStatus,
        updated_by: currentUserId,
        updated_at: new Date().toISOString(),
      };
      if (clearanceDate) updateData.clearance_date = clearanceDate;

      const { error } = await supabaseClient.from('cheque_register')
        .update(updateData)
        .eq('id', chequeId);
      if (error) throw error;

      // Auto-post bank transaction when cheque is cleared
      if (newStatus === 'cleared') {
        const cheque = cheques.find(c => c.id === chequeId);
        if (cheque && cheque.account_id) {
          try {
            const txType = cheque.type === 'received' ? 'credit' : 'debit';
            const { data: txData } = await supabaseClient.from('bank_transactions').insert({
              account_id: cheque.account_id,
              transaction_date: clearanceDate || new Date().toISOString().split('T')[0],
              type: txType,
              amount: cheque.amount,
              category: cheque.type === 'received' ? 'client_receipt' : 'payment',
              description: `Cheque #${cheque.cheque_number} cleared — ${cheque.purpose || cheque.party_name}`,
              reference_number: cheque.cheque_number,
              payment_mode: 'cheque',
              party_name: cheque.party_name,
            }).select('id').single();

            // Link the transaction back to the cheque
            if (txData?.id) {
              await supabaseClient.from('cheque_register')
                .update({ linked_transaction_id: txData.id })
                .eq('id', chequeId);
            }
          } catch (e) { /* bank_transactions post failed — non-blocking */ }
        }
      }

      toast({ title: "Status Updated", description: `Cheque marked as ${newStatus}` });
      fetchCheques();
      if (newStatus === 'cleared') fetchAccounts(); // Balance may have changed
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to update cheque", variant: "destructive" });
    }
  };

  // Pagination helpers
  const txTotalPages = Math.ceil(txTotalCount / PAGE_SIZE);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Banking & Cash</h2>
        <p className="text-muted-foreground mt-1">Bank accounts, transactions, and cash management</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Bank Balance</p>
            <p className="text-2xl font-bold mt-1">₹<CountUp to={totalBalance} duration={2} separator="," /></p>
            <p className="text-xs text-muted-foreground mt-1">{activeAccountsCount} active account{activeAccountsCount !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Credits (page)</p>
            <p className="text-2xl font-bold mt-1 text-green-700">+₹<CountUp to={recentCredits} duration={2} separator="," /></p>
            <p className="text-xs text-muted-foreground mt-1">money received</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Debits (page)</p>
            <p className="text-2xl font-bold mt-1 text-red-600">-₹<CountUp to={recentDebits} duration={2} separator="," /></p>
            <p className="text-xs text-muted-foreground mt-1">money paid out</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cash in Hand</p>
            <p className="text-2xl font-bold mt-1">₹<CountUp to={cashBalance} duration={2} separator="," /></p>
            <p className="text-xs text-muted-foreground mt-1">petty cash balance</p>
          </CardContent>
        </Card>
        {pendingApprovals > 0 && (
          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pending Approvals</p>
              <p className="text-2xl font-bold mt-1 text-orange-600">{pendingApprovals}</p>
              <p className="text-xs text-muted-foreground mt-1">need review</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          <TabsTrigger value="accounts" className={activeTab === 'accounts' ? 'bg-safend-red text-white' : ''}>
            <Landmark className="h-4 w-4 mr-2" /> Accounts
          </TabsTrigger>
          <TabsTrigger value="transactions" className={activeTab === 'transactions' ? 'bg-safend-red text-white' : ''}>
            <CreditCard className="h-4 w-4 mr-2" /> Transactions
          </TabsTrigger>
          <TabsTrigger value="cash" className={activeTab === 'cash' ? 'bg-safend-red text-white' : ''}>
            <Wallet className="h-4 w-4 mr-2" /> Cash Register
          </TabsTrigger>
          <TabsTrigger value="cheques" className={activeTab === 'cheques' ? 'bg-safend-red text-white' : ''}>
            <FileText className="h-4 w-4 mr-2" /> Cheques
          </TabsTrigger>
        </TabsList>

        {/* ============ ACCOUNTS TAB ============ */}
        <TabsContent value="accounts" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{accounts.length} bank account{accounts.length !== 1 ? 's' : ''} registered</p>
            <Button size="sm" onClick={() => setAddAccountOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Account</Button>
          </div>

          {loadingAccounts ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
          ) : accounts.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Landmark className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-medium">No bank accounts added</p>
              <p className="text-sm mt-1">Add your company bank accounts to track balances and transactions</p>
              <Button className="mt-4" onClick={() => setAddAccountOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Bank Account</Button>
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accounts.map((acc) => (
                <Card key={acc.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-blue-600" />
                          <h4 className="font-semibold">{acc.account_name}</h4>
                        </div>
                        <p className="text-sm text-muted-foreground">{acc.bank_name}{acc.branch_name ? ` — ${acc.branch_name}` : ''}</p>
                        <p className="text-xs text-muted-foreground font-mono">{acc.account_number} • IFSC: {acc.ifsc_code}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold">{formatIndianCurrency(Number(acc.current_balance))}</p>
                        <Badge variant="outline" className="text-[10px] capitalize mt-1">{acc.account_type.replace('_', ' ')}</Badge>
                      </div>
                    </div>
                    {acc.status !== 'active' && (
                      <Badge variant="outline" className="mt-2 bg-yellow-50 text-yellow-700 border-yellow-200 text-xs capitalize">{acc.status}</Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============ TRANSACTIONS TAB ============ */}
        <TabsContent value="transactions" className="space-y-4 mt-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search transactions..." className="pl-9 h-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <Input type="date" className="h-9 w-[140px]" placeholder="From" value={dateFilter.start} onChange={(e) => setDateFilter(f => ({ ...f, start: e.target.value }))} />
            <Input type="date" className="h-9 w-[140px]" placeholder="To" value={dateFilter.end} onChange={(e) => setDateFilter(f => ({ ...f, end: e.target.value }))} />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-[120px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
                <SelectItem value="debit">Debit</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {TRANSACTION_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="ml-auto">
              <Button size="sm" onClick={() => setAddTransactionOpen(true)}><Plus className="h-4 w-4 mr-1" /> Record Transaction</Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {loadingTransactions ? (
                <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CreditCard className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="font-medium">No transactions found</p>
                  <p className="text-sm mt-1">Adjust filters or record your first transaction</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Party</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount (₹)</TableHead>
                      <TableHead className="text-right">Balance (₹)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id} className={tx.is_void ? 'opacity-50 line-through' : ''}>
                        <TableCell className="text-sm">{formatIndianDate(tx.transaction_date)}</TableCell>
                        <TableCell>
                          <p className="text-sm font-medium">{tx.description}</p>
                          {tx.reference_number && <p className="text-xs text-muted-foreground">Ref: {tx.reference_number}</p>}
                        </TableCell>
                        <TableCell className="text-sm">{tx.party_name || '—'}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px] uppercase">{tx.payment_mode || '—'}</Badge></TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px] capitalize">{(tx.category || 'other').replace('_', ' ')}</Badge></TableCell>
                        <TableCell className="text-right">
                          <span className={`font-semibold ${tx.type === 'credit' ? 'text-green-700' : 'text-red-600'}`}>
                            {tx.type === 'credit' ? '+' : '-'}₹{Number(tx.amount).toLocaleString('en-IN')}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {tx.running_balance != null ? `₹${Number(tx.running_balance).toLocaleString('en-IN')}` : '—'}
                        </TableCell>
                        <TableCell>
                          {tx.is_void ? (
                            <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 text-[10px]">Void</Badge>
                          ) : tx.approval_status === 'pending' ? (
                            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-[10px]">
                              <Clock className="h-3 w-3 mr-1" />Pending
                            </Badge>
                          ) : tx.is_reconciled ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">
                              <CheckCircle2 className="h-3 w-3 mr-1" />Reconciled
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">Posted</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {tx.approval_status === 'pending' && !tx.is_void && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Approve"
                                onClick={() => handleApproveTransaction(tx.id)}>
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                              </Button>
                            )}
                            {!tx.is_void && tx.approval_status !== 'pending' && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Void"
                                onClick={() => { setVoidTarget({ id: tx.id, description: tx.description }); setVoidDialogOpen(true); }}>
                                <Ban className="h-3.5 w-3.5 text-red-500" />
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
            {/* Pagination */}
            {txTotalCount > PAGE_SIZE && (
              <CardFooter className="border-t px-6 py-3 flex justify-between items-center">
                <span className="text-xs text-muted-foreground">
                  Showing {(txPage - 1) * PAGE_SIZE + 1}–{Math.min(txPage * PAGE_SIZE, txTotalCount)} of {txTotalCount}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={txPage <= 1} onClick={() => setTxPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">Page {txPage} of {txTotalPages}</span>
                  <Button variant="outline" size="sm" disabled={txPage >= txTotalPages} onClick={() => setTxPage(p => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardFooter>
            )}
          </Card>
        </TabsContent>

        {/* ============ CASH REGISTER TAB ============ */}
        <TabsContent value="cash" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Cash in Hand: <strong className="text-foreground">{formatIndianCurrency(cashBalance)}</strong></p>
            <Button size="sm" onClick={() => setAddCashOpen(true)}><Plus className="h-4 w-4 mr-1" /> Cash Entry</Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {loadingCash ? (
                <div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : cashEntries.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Wallet className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="font-medium">No cash entries</p>
                  <p className="text-sm mt-1">Record cash-in or cash-out to track petty cash</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Party</TableHead>
                      <TableHead>Voucher</TableHead>
                      <TableHead className="text-right">Amount (₹)</TableHead>
                      <TableHead className="text-right">Balance (₹)</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashEntries.map((entry) => (
                      <TableRow key={entry.id} className={entry.is_void ? 'opacity-50 line-through' : ''}>
                        <TableCell className="text-sm">{formatIndianDate(entry.transaction_date)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={entry.type === 'cash_in' ? 'bg-green-50 text-green-700 border-green-200 text-xs' : 'bg-red-50 text-red-700 border-red-200 text-xs'}>
                            {entry.type === 'cash_in' ? 'Cash In' : 'Cash Out'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{entry.description}</TableCell>
                        <TableCell className="text-sm">{entry.type === 'cash_in' ? entry.received_from : entry.paid_to || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{entry.voucher_number || '—'}</TableCell>
                        <TableCell className="text-right">
                          <span className={`font-semibold ${entry.type === 'cash_in' ? 'text-green-700' : 'text-red-600'}`}>
                            {entry.type === 'cash_in' ? '+' : '-'}₹{Number(entry.amount).toLocaleString('en-IN')}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {entry.running_balance != null ? `₹${Number(entry.running_balance).toLocaleString('en-IN')}` : '—'}
                        </TableCell>
                        <TableCell>
                          {entry.is_void ? (
                            <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-600">Void</Badge>
                          ) : entry.approval_status === 'pending' ? (
                            <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">Pending</Badge>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ CHEQUES TAB ============ */}
        <TabsContent value="cheques" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Track issued and received cheques</p>
            <Button size="sm" onClick={() => setAddChequeOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Cheque</Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {loadingCheques ? (
                <div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : cheques.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="font-medium">No cheques recorded</p>
                  <p className="text-sm mt-1">Track issued and received cheques with clearance status</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Cheque No.</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Party</TableHead>
                      <TableHead>Issue Date</TableHead>
                      <TableHead className="text-right">Amount (₹)</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cheques.map((cheque) => (
                      <TableRow key={cheque.id}>
                        <TableCell className="font-mono text-sm">{cheque.cheque_number}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cheque.type === 'issued' ? 'bg-orange-50 text-orange-700 border-orange-200 text-xs' : 'bg-blue-50 text-blue-700 border-blue-200 text-xs'}>
                            {cheque.type === 'issued' ? 'Issued' : 'Received'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{cheque.party_name}</TableCell>
                        <TableCell className="text-sm">{formatIndianDate(cheque.issue_date)}</TableCell>
                        <TableCell className="text-right font-semibold">₹{Number(cheque.amount).toLocaleString('en-IN')}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{cheque.purpose || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs capitalize ${
                            cheque.status === 'cleared' ? 'bg-green-50 text-green-700 border-green-200' :
                            cheque.status === 'bounced' ? 'bg-red-50 text-red-700 border-red-200' :
                            cheque.status === 'cancelled' ? 'bg-gray-50 text-gray-700 border-gray-200' :
                            cheque.status === 'deposited' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>{cheque.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {cheque.status === 'pending' && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="h-7 text-xs"
                                onClick={() => handleChequeStatusChange(cheque.id, 'deposited')}>
                                Deposit
                              </Button>
                            </div>
                          )}
                          {cheque.status === 'deposited' && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-green-700"
                                onClick={() => handleChequeStatusChange(cheque.id, 'cleared', new Date().toISOString().split('T')[0])}>
                                Clear
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600"
                                onClick={() => handleChequeStatusChange(cheque.id, 'bounced')}>
                                Bounce
                              </Button>
                            </div>
                          )}
                          {cheque.linked_transaction_id && (
                            <span className="text-[10px] text-green-600">✓ Linked</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============ ADD ACCOUNT DIALOG ============ */}
      <Dialog open={addAccountOpen} onOpenChange={setAddAccountOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add Bank Account</DialogTitle>
            <DialogDescription>Register a new company bank account</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Account Name *</label><Input className="mt-1" placeholder="e.g. Main Operating A/c" value={newAccount.account_name} onChange={(e) => setNewAccount({ ...newAccount, account_name: e.target.value })} /></div>
              <div><label className="text-sm font-medium">Account Type *</label>
                <Select value={newAccount.account_type} onValueChange={(v) => setNewAccount({ ...newAccount, account_type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{ACCOUNT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Bank Name *</label><Input className="mt-1" placeholder="e.g. State Bank of India" value={newAccount.bank_name} onChange={(e) => setNewAccount({ ...newAccount, bank_name: e.target.value })} /></div>
              <div><label className="text-sm font-medium">Branch</label><Input className="mt-1" placeholder="e.g. Cuttack Main" value={newAccount.branch_name} onChange={(e) => setNewAccount({ ...newAccount, branch_name: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Account Number *</label><Input className="mt-1" placeholder="Account number" value={newAccount.account_number} onChange={(e) => setNewAccount({ ...newAccount, account_number: e.target.value })} /></div>
              <div>
                <label className="text-sm font-medium">IFSC Code *</label>
                <Input className="mt-1" placeholder="e.g. SBIN0001234" value={newAccount.ifsc_code}
                  onChange={(e) => setNewAccount({ ...newAccount, ifsc_code: e.target.value.toUpperCase() })} />
                {newAccount.ifsc_code && !IFSC_REGEX.test(newAccount.ifsc_code) && (
                  <p className="text-xs text-red-500 mt-1">Format: XXXX0XXXXXX</p>
                )}
              </div>
            </div>
            <div><label className="text-sm font-medium">Opening Balance (₹)</label><Input type="number" className="mt-1" placeholder="0" value={newAccount.opening_balance} onChange={(e) => setNewAccount({ ...newAccount, opening_balance: e.target.value })} /></div>
            <div><label className="text-sm font-medium">Notes</label><Textarea className="mt-1" placeholder="Optional notes..." rows={2} value={newAccount.notes} onChange={(e) => setNewAccount({ ...newAccount, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddAccountOpen(false)}>Cancel</Button>
            <Button onClick={handleAddAccount} disabled={!!(newAccount.ifsc_code && !IFSC_REGEX.test(newAccount.ifsc_code))}>
              <Plus className="h-4 w-4 mr-1" /> Add Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ ADD TRANSACTION DIALOG ============ */}
      <Dialog open={addTransactionOpen} onOpenChange={setAddTransactionOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Record Bank Transaction</DialogTitle>
            <DialogDescription>
              Record a credit or debit. Transactions above ₹50,000 require approval.
              <br />
              <span className="text-xs text-amber-600">⚠️ Transactions are immutable once recorded. Use void to correct errors.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div><label className="text-sm font-medium">Bank Account *</label>
              <Select value={newTransaction.account_id} onValueChange={(v) => setNewTransaction({ ...newTransaction, account_id: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{accounts.filter(a => a.status === 'active').map(a => <SelectItem key={a.id} value={a.id}>{a.account_name} — {formatIndianCurrency(Number(a.current_balance))}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="text-sm font-medium">Type *</label>
                <Select value={newTransaction.type} onValueChange={(v) => setNewTransaction({ ...newTransaction, type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Credit (Money In)</SelectItem>
                    <SelectItem value="debit">Debit (Money Out)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><label className="text-sm font-medium">Amount (₹) *</label><Input type="number" min="1" className="mt-1" placeholder="0" value={newTransaction.amount} onChange={(e) => setNewTransaction({ ...newTransaction, amount: e.target.value })} /></div>
              <div><label className="text-sm font-medium">Date *</label><Input type="date" className="mt-1" value={newTransaction.transaction_date} onChange={(e) => setNewTransaction({ ...newTransaction, transaction_date: e.target.value })} /></div>
            </div>
            {Number(newTransaction.amount) >= 50000 && (
              <div className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-700">
                <AlertTriangle className="h-4 w-4" />
                This transaction exceeds ₹50,000 and will require admin approval before posting.
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Payment Mode</label>
                <Select value={newTransaction.payment_mode} onValueChange={(v) => setNewTransaction({ ...newTransaction, payment_mode: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{PAYMENT_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><label className="text-sm font-medium">Category</label>
                <Select value={newTransaction.category} onValueChange={(v) => setNewTransaction({ ...newTransaction, category: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{TRANSACTION_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><label className="text-sm font-medium">Description *</label><Input className="mt-1" placeholder="e.g. Salary payment for May 2025" value={newTransaction.description} onChange={(e) => setNewTransaction({ ...newTransaction, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Party Name</label><Input className="mt-1" placeholder="e.g. ABC Corp" value={newTransaction.party_name} onChange={(e) => setNewTransaction({ ...newTransaction, party_name: e.target.value })} /></div>
              <div><label className="text-sm font-medium">Reference / UTR No.</label><Input className="mt-1" placeholder="e.g. NEFT ref" value={newTransaction.reference_number} onChange={(e) => setNewTransaction({ ...newTransaction, reference_number: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTransactionOpen(false)}>Cancel</Button>
            <Button onClick={handleAddTransaction}><Plus className="h-4 w-4 mr-1" /> Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ ADD CASH ENTRY DIALOG ============ */}
      <Dialog open={addCashOpen} onOpenChange={setAddCashOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Cash Entry</DialogTitle>
            <DialogDescription>Record cash received or paid out. Entries above ₹10,000 need approval.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Type *</label>
                <Select value={newCash.type} onValueChange={(v) => setNewCash({ ...newCash, type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash_in">Cash In (Received)</SelectItem>
                    <SelectItem value="cash_out">Cash Out (Paid)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><label className="text-sm font-medium">Amount (₹) *</label><Input type="number" min="1" className="mt-1" placeholder="0" value={newCash.amount} onChange={(e) => setNewCash({ ...newCash, amount: e.target.value })} /></div>
            </div>
            <div><label className="text-sm font-medium">Date *</label><Input type="date" className="mt-1" value={newCash.transaction_date} onChange={(e) => setNewCash({ ...newCash, transaction_date: e.target.value })} /></div>
            <div><label className="text-sm font-medium">Description *</label><Input className="mt-1" placeholder="e.g. Petrol for patrol vehicle" value={newCash.description} onChange={(e) => setNewCash({ ...newCash, description: e.target.value })} /></div>
            <div><label className="text-sm font-medium">{newCash.type === 'cash_in' ? 'Received From' : 'Paid To'}</label><Input className="mt-1" placeholder="Name" value={newCash.type === 'cash_in' ? newCash.received_from : newCash.paid_to} onChange={(e) => setNewCash({ ...newCash, [newCash.type === 'cash_in' ? 'received_from' : 'paid_to']: e.target.value })} /></div>
            <div><label className="text-sm font-medium">Voucher Number</label><Input className="mt-1" placeholder="Optional" value={newCash.voucher_number} onChange={(e) => setNewCash({ ...newCash, voucher_number: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCashOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCash}><Plus className="h-4 w-4 mr-1" /> Save Entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ ADD CHEQUE DIALOG ============ */}
      <Dialog open={addChequeOpen} onOpenChange={setAddChequeOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Add Cheque</DialogTitle>
            <DialogDescription>Record a cheque. When marked as cleared, a bank transaction will auto-post.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Type *</label>
                <Select value={newCheque.type} onValueChange={(v) => setNewCheque({ ...newCheque, type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="issued">Issued (Given)</SelectItem>
                    <SelectItem value="received">Received</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><label className="text-sm font-medium">Cheque Number *</label><Input className="mt-1" placeholder="e.g. 000456" value={newCheque.cheque_number} onChange={(e) => setNewCheque({ ...newCheque, cheque_number: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Amount (₹) *</label><Input type="number" min="1" className="mt-1" placeholder="0" value={newCheque.amount} onChange={(e) => setNewCheque({ ...newCheque, amount: e.target.value })} /></div>
              <div><label className="text-sm font-medium">Issue Date *</label><Input type="date" className="mt-1" value={newCheque.issue_date} onChange={(e) => setNewCheque({ ...newCheque, issue_date: e.target.value })} /></div>
            </div>
            <div><label className="text-sm font-medium">{newCheque.type === 'issued' ? 'Issued To *' : 'Received From *'}</label><Input className="mt-1" placeholder="Party name" value={newCheque.party_name} onChange={(e) => setNewCheque({ ...newCheque, party_name: e.target.value })} /></div>
            <div><label className="text-sm font-medium">Bank Account (required for auto-posting on clearance)</label>
              <Select value={newCheque.account_id} onValueChange={(v) => setNewCheque({ ...newCheque, account_id: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{accounts.filter(a => a.status === 'active').map(a => <SelectItem key={a.id} value={a.id}>{a.account_name} — {a.bank_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><label className="text-sm font-medium">Purpose</label><Input className="mt-1" placeholder="e.g. Security deposit for XYZ contract" value={newCheque.purpose} onChange={(e) => setNewCheque({ ...newCheque, purpose: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddChequeOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCheque}><Plus className="h-4 w-4 mr-1" /> Add Cheque</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ VOID TRANSACTION DIALOG ============ */}
      <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-red-600">Void Transaction</DialogTitle>
            <DialogDescription>
              This will reverse the balance effect. The transaction remains visible but marked as void.
              {voidTarget && <span className="block mt-2 font-medium text-foreground">{voidTarget.description}</span>}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">Reason for voiding *</label>
            <Textarea className="mt-1" placeholder="e.g. Duplicate entry, wrong amount" rows={3}
              value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setVoidDialogOpen(false); setVoidTarget(null); setVoidReason(''); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleVoidTransaction} disabled={!voidReason.trim()}>
              <Ban className="h-4 w-4 mr-1" /> Void Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
