'use client';

import { useState, useMemo } from 'react';
import { LoanCentreProps } from '../index';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Plus, HandCoins, Wallet, AlertTriangle, CheckCircle2, XCircle, Loader2, Search, Flag,
  ShieldAlert, Banknote,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';
import { getBranchScopeFilter } from '@/utils/branchScope';
import { HR_CONFIG } from '@/config';
import {
  listAdvances, createAdvance, approveAdvance, rejectAdvance, deriveSchedule,
  recordRecovery, writeOffAdvance, reevaluateAllFlags,
  validateAdvance, summariseExposure, effectiveMonthlySalary,
  interestAppliesTo, upfrontAppliesTo,
  EMPLOYEE_SALARY_COLUMNS, MAX_EMI_MONTHS,
  type EmployeeAdvance, type AdvanceType, type RecoveryMode,
} from '@/services/supabase/EmployeeAdvancesService';

const STATUS_STYLES: Record<string, string> = {
  pending_approval: 'bg-amber-500',
  active: 'bg-green-600',
  cleared: 'bg-gray-400',
  written_off: 'bg-red-600',
  on_hold: 'bg-orange-500',
  rejected: 'bg-red-500',
};

const STATUS_LABELS: Record<string, string> = {
  pending_approval: 'Pending Approval',
  active: 'Active',
  cleared: 'Cleared',
  written_off: 'Written Off',
  on_hold: 'On Hold',
  rejected: 'Rejected',
};

const TYPE_LABELS: Record<AdvanceType, string> = {
  LOAN: 'Loan',
  JOINING_DEPOSIT: 'Joining Deposit',
  SALARY_ADVANCE: 'Salary Advance',
};

/** Advance types HR can raise from this screen. */
const CREATABLE_TYPES: AdvanceType[] = ['LOAN', 'SALARY_ADVANCE', 'JOINING_DEPOSIT'];

function typeLabel(type: AdvanceType): string {
  return TYPE_LABELS[type] ?? type;
}

// Map the HR filter pill to the statuses shown.
function filterToStatuses(filter: string): string[] | null {
  switch (filter) {
    case 'Active': return ['active'];
    case 'Pending Approval': case 'Requested': return ['pending_approval'];
    case 'Cleared': case 'Closed': return ['cleared', 'written_off', 'rejected'];
    case 'Salary Advances': return null; // handled separately by type filter
    default: return null; // All
  }
}

export function LoanCentre({ filter = 'All' }: LoanCentreProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const branchKey = getBranchScopeFilter();

  const [showForm, setShowForm] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<EmployeeAdvance | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [empSearch, setEmpSearch] = useState('');
  const [settleTarget, setSettleTarget] = useState<EmployeeAdvance | null>(null);
  const [fnfAmount, setFnfAmount] = useState('');

  // Form state
  const [advanceType, setAdvanceType] = useState<AdvanceType>('LOAN');
  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [principal, setPrincipal] = useState('');
  const [interestPct, setInterestPct] = useState('0');
  const [recoveryMode, setRecoveryMode] = useState<RecoveryMode>('EMI');
  const [emiMonths, setEmiMonths] = useState('6');
  const [upfrontPaid, setUpfrontPaid] = useState('');
  const [reason, setReason] = useState('');
  // Errors stay hidden until the first submit attempt so the form doesn't scold on open.
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // ── Queries ──
  const { data: advances = [], isLoading } = useQuery({
    queryKey: ['employee-advances', branchKey],
    queryFn: () => listAdvances(),
  });

  // NOTE: `base_salary` does not exist on `employees`. Selecting it made PostgREST
  // reject the request, and the old `if (error) return []` swallowed it — so the
  // employee picker was always empty and the form could never be submitted.
  const {
    data: employees = [],
    isError: employeesFailed,
    error: employeesError,
  } = useQuery({
    queryKey: ['advances-employees'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('employees')
        .select(`id, employee_id, name, designation, ${EMPLOYEE_SALARY_COLUMNS}`)
        .ilike('status', 'active')
        .order('name');
      if (error) throw new Error(error.message);
      return data || [];
    },
  });

  const { data: depositConfig = [] } = useQuery({
    queryKey: ['joining-deposit-config'],
    queryFn: async () => {
      const { data, error } = await supabaseClient.from('joining_deposit_config').select('*');
      if (error) return [];
      return data || [];
    },
  });

  // ── Mutations ──
  const createMut = useMutation({
    mutationFn: createAdvance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-advances'] });
      resetForm();
      toast({ title: 'Advance created', description: 'Sent for approval.' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => approveAdvance(id, localStorage.getItem('userName') || 'HR'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-advances'] });
      toast({ title: 'Approved', description: 'Recovery schedule activated.' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectAdvance(rejectTarget!.id, rejectReason, localStorage.getItem('userName') || 'HR'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-advances'] });
      setRejectTarget(null); setRejectReason('');
      toast({ title: 'Rejected' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const flagMut = useMutation({
    mutationFn: reevaluateAllFlags,
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['employee-advances'] });
      toast({ title: 'Risk flags updated', description: `${count} advance${count !== 1 ? 's' : ''} flagged.` });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // F&F settlement: recover up to the F&F amount (net never negative), write off any shortfall.
  const settleMut = useMutation({
    mutationFn: async () => {
      if (!settleTarget) return;
      const available = parseFloat(fnfAmount) || 0;
      const balance = settleTarget.balance_outstanding;
      const recover = Math.min(available, balance);
      if (recover > 0) await recordRecovery(settleTarget.id, recover);
      const shortfall = balance - recover;
      if (shortfall > 0) {
        await writeOffAdvance(settleTarget.id, shortfall, localStorage.getItem('userName') || 'HR');
      }
      return { recover, shortfall };
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['employee-advances'] });
      setSettleTarget(null); setFnfAmount('');
      const recovered = Number(res?.recover) || 0;
      const shortfall = Number(res?.shortfall) || 0;
      toast({
        title: 'Settlement recorded',
        description: shortfall > 0
          ? `Recovered ₹${recovered.toLocaleString('en-IN')}, wrote off ₹${shortfall.toLocaleString('en-IN')}.`
          : `Recovered ₹${recovered.toLocaleString('en-IN')} in full.`,
      });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // ── Derived ──
  const isExitView = filter === 'Exits (F&F)';
  const isSalaryAdvancesView = filter === 'Salary Advances';
  const statuses = filterToStatuses(filter);
  const visible = useMemo(() => {
    if (isExitView) return advances.filter((a) => a.status === 'active' && a.is_flagged);
    if (isSalaryAdvancesView) return advances.filter((a) => a.advance_type === 'SALARY_ADVANCE');
    return statuses ? advances.filter((a) => statuses.includes(a.status)) : advances;
  }, [advances, statuses, isExitView, isSalaryAdvancesView]);

  const stats = useMemo(() => {
    const active = advances.filter((a) => a.status === 'active');
    return {
      activeCount: active.length,
      outstanding: active.reduce((s, a) => s + (a.balance_outstanding || 0), 0),
      pending: advances.filter((a) => a.status === 'pending_approval').length,
      flagged: advances.filter((a) => a.is_flagged && a.status === 'active').length,
    };
  }, [advances]);

  // Deposit amount auto-fills from role config
  const roleDeposit = useMemo(() => {
    if (advanceType !== 'JOINING_DEPOSIT' || !selectedEmp) return null;
    return depositConfig.find((c: any) => c.role === selectedEmp.designation) || null;
  }, [advanceType, selectedEmp, depositConfig]);

  // Parsed once so validation, preview and submit all agree on the same numbers.
  const parsed = useMemo(() => ({
    principal: principal.trim() === '' ? NaN : Number(principal),
    interestPct: interestPct.trim() === '' ? 0 : Number(interestPct),
    emiMonths: emiMonths.trim() === '' ? NaN : Number(emiMonths),
    upfrontPaid: upfrontPaid.trim() === '' ? 0 : Number(upfrontPaid),
  }), [principal, interestPct, emiMonths, upfrontPaid]);

  const empSalary = useMemo(() => effectiveMonthlySalary(selectedEmp), [selectedEmp]);

  const errors = useMemo(() => validateAdvance({
    hasEmployee: !!selectedEmp,
    advanceType,
    principal: parsed.principal,
    interestPct: parsed.interestPct,
    recoveryMode,
    emiMonths: parsed.emiMonths,
    upfrontPaid: parsed.upfrontPaid,
    monthlySalary: empSalary,
  }), [selectedEmp, advanceType, parsed, recoveryMode, empSalary]);

  const hasErrors = Object.keys(errors).length > 0;

  const preview = useMemo(() => {
    if (!Number.isFinite(parsed.principal) || parsed.principal <= 0) return null;
    return deriveSchedule({
      employeeId: selectedEmp?.id || '',
      advanceType,
      principal: parsed.principal,
      interestPct: parsed.interestPct,
      recoveryMode,
      emiMonths: Number.isFinite(parsed.emiMonths) ? parsed.emiMonths : 1,
      upfrontPaid: parsed.upfrontPaid,
    });
  }, [parsed, recoveryMode, advanceType, selectedEmp]);

  // Payment of Wages Act advisory: installment shouldn't exceed the statutory share of salary.
  const exceedsWageCap = useMemo(() => {
    if (!preview || empSalary <= 0) return false;
    return preview.installmentAmount > empSalary * (HR_CONFIG.LOANS.MAX_DEDUCTION_PCT / 100);
  }, [preview, empSalary]);

  // Existing exposure for the selected employee — prevents blind stacking of advances.
  const exposure = useMemo(() => summariseExposure(advances), [advances]);
  const empExposure = selectedEmp ? exposure.get(selectedEmp.id) : undefined;

  const filteredEmployees = employees.filter((e: any) =>
    !empSearch || e.name.toLowerCase().includes(empSearch.toLowerCase()) ||
    (e.employee_id || '').toLowerCase().includes(empSearch.toLowerCase())
  );

  function resetForm() {
    setShowForm(false);
    setAdvanceType('LOAN'); setSelectedEmp(null); setPrincipal(''); setInterestPct('0');
    setRecoveryMode('EMI'); setEmiMonths('6'); setUpfrontPaid(''); setReason(''); setEmpSearch('');
    setSubmitAttempted(false);
  }

  /** Switching type clears the fields that no longer apply, so stale values can't leak through. */
  function handleTypeChange(next: AdvanceType) {
    setAdvanceType(next);
    if (!interestAppliesTo(next)) setInterestPct('0');
    if (!upfrontAppliesTo(next)) setUpfrontPaid('');
    // A salary advance is recovered from the next payout by default.
    if (next === 'SALARY_ADVANCE') {
      setRecoveryMode('ONE_TIME');
    } else if (next === 'JOINING_DEPOSIT') {
      setRecoveryMode('EMI');
      setEmiMonths(String(HR_CONFIG.LOANS.UNIFORM_TRAINING_FEE.DEFAULT_EMI_MONTHS));
    }
  }

  function handleCreate() {
    setSubmitAttempted(true);
    if (hasErrors || !selectedEmp) {
      toast({
        title: 'Check the form',
        description: Object.values(errors)[0] ?? 'Some fields need attention.',
        variant: 'destructive',
      });
      return;
    }
    createMut.mutate({
      employeeId: selectedEmp.id,
      employeeName: selectedEmp.name,
      employeeCode: selectedEmp.employee_id,
      advanceType,
      principal: parsed.principal,
      interestPct: interestAppliesTo(advanceType) ? parsed.interestPct : 0,
      recoveryMode,
      emiMonths: recoveryMode === 'ONE_TIME' ? 1 : parsed.emiMonths,
      upfrontPaid: upfrontAppliesTo(advanceType) ? parsed.upfrontPaid : 0,
      reason,
      createdBy: localStorage.getItem('userName') || 'HR',
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">Advances Centre</h2>
          <p className="text-sm text-muted-foreground">Staff loans and joining deposits — recovered from salary</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => flagMut.mutate()} disabled={flagMut.isPending}>
            {flagMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldAlert className="h-4 w-4 mr-2" />}
            Re-evaluate Risk
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Advance
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex justify-between items-start">
            <div><p className="text-xs text-muted-foreground">Active Advances</p><p className="text-2xl font-bold">{stats.activeCount}</p></div>
            <HandCoins className="h-5 w-5 text-blue-600" />
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex justify-between items-start">
            <div><p className="text-xs text-muted-foreground">Total Outstanding</p><p className="text-2xl font-bold">₹{stats.outstanding.toLocaleString()}</p></div>
            <Wallet className="h-5 w-5 text-green-600" />
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex justify-between items-start">
            <div><p className="text-xs text-muted-foreground">Pending Approval</p><p className="text-2xl font-bold text-amber-600">{stats.pending}</p></div>
            <Loader2 className="h-5 w-5 text-amber-500" />
          </div>
        </CardContent></Card>
        <Card className={stats.flagged > 0 ? 'border-red-300' : ''}><CardContent className="p-4">
          <div className="flex justify-between items-start">
            <div><p className="text-xs text-muted-foreground">Red-Flagged</p><p className="text-2xl font-bold text-red-600">{stats.flagged}</p></div>
            <Flag className="h-5 w-5 text-red-600" />
          </div>
        </CardContent></Card>
      </div>

      {/* List */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">{filter === 'All' ? 'All Advances' : filter === 'Salary Advances' ? 'Salary Advances' : filter}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : visible.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <HandCoins className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No advances found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map((a) => {
                const pct = a.total_recoverable > 0
                  ? Math.round(((a.total_recoverable - a.balance_outstanding) / a.total_recoverable) * 100) : 0;
                return (
                  <div key={a.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold truncate">{a.employee_name}</p>
                          <span className="text-xs text-muted-foreground">{a.employee_code}</span>
                          {a.is_flagged && (
                            <Badge className="bg-red-600 gap-1"><Flag className="h-3 w-3" /> Flagged</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {typeLabel(a.advance_type)} ·{' '}
                          {a.recovery_mode === 'ONE_TIME' ? 'One-time' : `${a.emi_months}-month EMI`}
                          {a.interest_pct > 0 && ` · ${a.interest_pct}% flat`}
                          {a.advance_type === 'SALARY_ADVANCE' && ` · ${new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                        </p>
                      </div>
                      <Badge className={STATUS_STYLES[a.status]}>{STATUS_LABELS[a.status]}</Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                      <div className="rounded-lg bg-muted/50 py-2">
                        <p className="text-[10px] text-muted-foreground uppercase">Recoverable</p>
                        <p className="text-sm font-bold">₹{a.total_recoverable.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 py-2">
                        <p className="text-[10px] text-muted-foreground uppercase">Recovered</p>
                        <p className="text-sm font-bold text-green-600">₹{a.amount_recovered.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 py-2">
                        <p className="text-[10px] text-muted-foreground uppercase">Balance</p>
                        <p className="text-sm font-bold text-amber-600">₹{a.balance_outstanding.toLocaleString()}</p>
                      </div>
                    </div>

                    {a.status === 'active' && (
                      <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    )}

                    {a.status === 'pending_approval' && (
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => approveMut.mutate(a.id)} disabled={approveMut.isPending}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600 border-red-200" onClick={() => setRejectTarget(a)}>
                          <XCircle className="h-4 w-4 mr-1" /> Reject
                        </Button>
                      </div>
                    )}

                    {a.status === 'active' && (isExitView || a.is_flagged) && (
                      <div className="mt-3">
                        {a.flag_reason && (
                          <p className="text-[11px] text-red-600 flex items-center gap-1 mb-2">
                            <AlertTriangle className="h-3 w-3" /> {a.flag_reason}
                          </p>
                        )}
                        <Button size="sm" variant="outline" className="text-[#D71920] border-[#D71920]/30" onClick={() => { setSettleTarget(a); setFnfAmount(''); }}>
                          <Banknote className="h-4 w-4 mr-1" /> Settle from F&amp;F
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Advance dialog */}
      <Dialog open={showForm} onOpenChange={(o) => (o ? setShowForm(true) : resetForm())}>
        <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Advance</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Type toggle */}
            <div role="group" aria-label="Advance type" className="grid grid-cols-3 gap-2">
              {CREATABLE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={advanceType === t}
                  onClick={() => handleTypeChange(t)}
                  className={`h-10 rounded-lg text-sm font-medium border transition-all ${
                    advanceType === t ? 'bg-[#D71920] text-white border-transparent' : 'border-gray-200 dark:border-white/10 text-muted-foreground'
                  }`}
                >
                  {typeLabel(t)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              {advanceType === 'LOAN' && 'Cash disbursed to staff, recovered from salary. May carry flat interest.'}
              {advanceType === 'SALARY_ADVANCE' && 'Advance against salary already earned. Interest-free.'}
              {advanceType === 'JOINING_DEPOSIT' && 'Role-based joining amount, recovered interest-free over EMIs.'}
            </p>

            {/* Employee picker */}
            <div className="space-y-1">
              <Label>Employee*</Label>
              {selectedEmp ? (
                <div className="flex items-center justify-between rounded-lg border p-2.5">
                  <div><p className="text-sm font-medium">{selectedEmp.name}</p><p className="text-xs text-muted-foreground">{selectedEmp.designation} · {selectedEmp.employee_id}</p></div>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedEmp(null)}>Change</Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Search employee..."
                      value={empSearch}
                      onChange={(e) => setEmpSearch(e.target.value)}
                      aria-invalid={submitAttempted && !!errors.employee}
                    />
                  </div>
                  {employeesFailed && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Couldn&apos;t load employees: {(employeesError as any)?.message || 'unknown error'}
                    </p>
                  )}
                  {empSearch && (
                    <div className="max-h-40 overflow-y-auto border rounded-lg mt-1">
                      {filteredEmployees.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">No matching employee.</p>
                      ) : filteredEmployees.slice(0, 20).map((e: any) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => { setSelectedEmp(e); setEmpSearch(''); }}
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                        >
                          {e.name} <span className="text-muted-foreground">· {e.designation} · {e.employee_id}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {submitAttempted && errors.employee && (
                <p className="text-xs text-red-600">{errors.employee}</p>
              )}
            </div>

            {/* Existing exposure for the chosen employee */}
            {selectedEmp && empExposure && (empExposure.outstanding > 0 || empExposure.pendingCount > 0) && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Already has{' '}
                  {empExposure.outstanding > 0 && (
                    <>₹{empExposure.outstanding.toLocaleString('en-IN')} outstanding across {empExposure.activeCount} active advance{empExposure.activeCount !== 1 ? 's' : ''}</>
                  )}
                  {empExposure.outstanding > 0 && empExposure.pendingCount > 0 && ', and '}
                  {empExposure.pendingCount > 0 && (
                    <>{empExposure.pendingCount} request{empExposure.pendingCount !== 1 ? 's' : ''} awaiting approval</>
                  )}
                  .
                </span>
              </div>
            )}

            {roleDeposit && (
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 p-2.5 text-xs text-blue-800 dark:text-blue-300">
                Role deposit for <b>{selectedEmp?.designation}</b>: ₹{roleDeposit.deposit_amount.toLocaleString('en-IN')} · default {roleDeposit.default_emi_months}-month EMI
                <button className="ml-2 underline" onClick={() => { setPrincipal(String(roleDeposit.deposit_amount)); setEmiMonths(String(roleDeposit.default_emi_months)); }}>Use</button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="adv-principal">
                  {advanceType === 'JOINING_DEPOSIT' ? 'Deposit Amount (₹)*' : advanceType === 'SALARY_ADVANCE' ? 'Advance Amount (₹)*' : 'Principal (₹)*'}
                </Label>
                <Input
                  id="adv-principal"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                  placeholder="Amount"
                  aria-invalid={submitAttempted && !!errors.principal}
                />
                {submitAttempted && errors.principal && <p className="text-xs text-red-600">{errors.principal}</p>}
                {empSalary > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Monthly salary ₹{empSalary.toLocaleString('en-IN')}
                  </p>
                )}
              </div>
              {interestAppliesTo(advanceType) ? (
                <div className="space-y-1">
                  <Label htmlFor="adv-interest">Flat Interest (%)</Label>
                  <Input
                    id="adv-interest"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    inputMode="decimal"
                    value={interestPct}
                    onChange={(e) => setInterestPct(e.target.value)}
                    placeholder="0"
                    aria-invalid={submitAttempted && !!errors.interestPct}
                  />
                  {submitAttempted && errors.interestPct && <p className="text-xs text-red-600">{errors.interestPct}</p>}
                </div>
              ) : upfrontAppliesTo(advanceType) ? (
                <div className="space-y-1">
                  <Label htmlFor="adv-upfront">Paid Upfront (₹)</Label>
                  <Input
                    id="adv-upfront"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={upfrontPaid}
                    onChange={(e) => setUpfrontPaid(e.target.value)}
                    placeholder="0"
                    aria-invalid={submitAttempted && !!errors.upfrontPaid}
                  />
                  {submitAttempted && errors.upfrontPaid && <p className="text-xs text-red-600">{errors.upfrontPaid}</p>}
                </div>
              ) : (
                <div className="space-y-1">
                  <Label>Interest</Label>
                  <div className="h-10 flex items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                    Interest-free
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Recovery Mode</Label>
                <Select value={recoveryMode} onValueChange={(v) => setRecoveryMode(v as RecoveryMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMI">EMI (installments)</SelectItem>
                    <SelectItem value="ONE_TIME">One-time (next salary)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {recoveryMode === 'EMI' && (
                <div className="space-y-1">
                  <Label htmlFor="adv-emi">EMI Months</Label>
                  <Input
                    id="adv-emi"
                    type="number"
                    min="1"
                    max={MAX_EMI_MONTHS}
                    step="1"
                    inputMode="numeric"
                    value={emiMonths}
                    onChange={(e) => setEmiMonths(e.target.value)}
                    aria-invalid={submitAttempted && !!errors.emiMonths}
                  />
                  {submitAttempted && errors.emiMonths
                    ? <p className="text-xs text-red-600">{errors.emiMonths}</p>
                    : <p className="text-[11px] text-muted-foreground">Max {MAX_EMI_MONTHS} months</p>}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label>Reason / Notes</Label>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Purpose of the advance..." />
            </div>

            {/* Live preview */}
            {preview && (
              <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total recoverable</span>
                  <b>₹{preview.totalRecoverable.toLocaleString('en-IN')}</b>
                </div>
                {interestAppliesTo(advanceType) && preview.interestAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Flat interest</span>
                    <span>₹{preview.interestAmount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {upfrontAppliesTo(advanceType) && parsed.upfrontPaid > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid upfront</span>
                    <span>-₹{Math.min(parsed.upfrontPaid, parsed.principal || 0).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {recoveryMode === 'ONE_TIME' ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recovered from</span>
                    <b>Next salary</b>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Per installment ({preview.months}x)</span>
                      <b>₹{preview.installmentAmount.toLocaleString('en-IN')}</b>
                    </div>
                    {preview.lastInstallmentAmount !== preview.installmentAmount && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Final installment</span>
                        <span>₹{preview.lastInstallmentAmount.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </>
                )}
                {exceedsWageCap && (
                  <div className="flex items-start gap-1.5 text-amber-600 text-xs pt-1">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    Installment exceeds {HR_CONFIG.LOANS.MAX_DEDUCTION_PCT}% of salary (Payment of Wages Act). Recovery will carry forward.
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMut.isPending || (submitAttempted && hasErrors)}>
              {createMut.isPending ? 'Saving...' : 'Create Advance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectReason(''); } }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Reject Advance</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason(''); }}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" disabled={!rejectReason || rejectMut.isPending} onClick={() => rejectMut.mutate()}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* F&F settlement dialog */}
      <Dialog open={!!settleTarget} onOpenChange={(o) => { if (!o) { setSettleTarget(null); setFnfAmount(''); } }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle>Full &amp; Final Settlement</DialogTitle></DialogHeader>
          {settleTarget && (() => {
            const available = parseFloat(fnfAmount) || 0;
            const balance = settleTarget.balance_outstanding;
            const recover = Math.min(available, balance);
            const shortfall = Math.max(0, balance - recover);
            return (
              <div className="space-y-4">
                <div className="rounded-lg border p-3">
                  <p className="text-sm font-medium">{settleTarget.employee_name} <span className="text-muted-foreground text-xs">{settleTarget.employee_code}</span></p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {typeLabel(settleTarget.advance_type)} · Outstanding <b className="text-amber-600">₹{balance.toLocaleString('en-IN')}</b>
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>F&amp;F amount available (₹)</Label>
                  <Input type="number" min="0" value={fnfAmount} onChange={(e) => setFnfAmount(e.target.value)} placeholder="Net payable in final settlement" autoFocus />
                  <p className="text-[11px] text-muted-foreground">The employee&apos;s final net salary. Recovery is capped here — net never goes negative.</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Recover now</span><b className="text-green-600">₹{recover.toLocaleString()}</b></div>
                  {shortfall > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Write-off (shortfall)</span><b className="text-red-600">₹{shortfall.toLocaleString()}</b></div>
                  )}
                </div>
                {shortfall > 0 && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 p-2.5">
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-700 dark:text-red-400">₹{shortfall.toLocaleString()} cannot be recovered and will be <b>written off</b> as a loss. This requires your approval.</p>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSettleTarget(null); setFnfAmount(''); }}>Cancel</Button>
            <Button className="bg-[#D71920] hover:bg-[#b8151b]" disabled={settleMut.isPending || fnfAmount === ''} onClick={() => settleMut.mutate()}>
              {settleMut.isPending ? 'Settling...' : 'Confirm Settlement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
