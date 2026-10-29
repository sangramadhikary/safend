'use client';

/**
 * Record one receipt (bank transfer, cheque or cash) against an invoice and,
 * optionally, older unpaid invoices of the SAME WORK ORDER that the payment
 * also covers. Billing is managed per work order, so invoices of the client's
 * other work orders are never offered (record_receipt refuses them too).
 *
 * The allocation is previewed with planReceipt (src/lib/invoice/ledger.ts) and
 * recorded by the record_receipt database function, which re-checks it, posts
 * the bank / cheque / cash register entry once for the whole receipt, and
 * derives each invoice's balance and status from its allocation rows. Cash goes
 * to the oldest selected invoice first and to this invoice last. An amount
 * larger than the selected invoices owe is refused, never silently absorbed.
 */

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, Banknote, CheckCircle2, ChevronDown, CircleCheck, ClipboardList, Clock, Landmark, Loader2, PenLine,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabaseClient } from '@/integrations/supabase/client';
import { getBranchScope } from '@/utils/branchScope';
import { useToast } from '@/hooks/use-toast';
import { logChange } from '@/utils/auditLog';
import {
  DEFAULT_TDS_CAP_RATE, amountDue, planReceipt, round2, sumMoney, suggestedTds, tdsCap, toPaise, type LedgerRow,
} from '@/lib/invoice/ledger';
import { OUTSTANDING_COLUMNS, UNPAID_INVOICE_STATUSES } from '@/lib/invoice/outstanding';
import { recordReceipt, type BalanceHandling, type PaymentMode } from '@/services/invoiceLedgerService';

type BreakdownItem = { id?: string; referenceNumber?: string; reference_number?: string };

export type ReceivableForPayment = LedgerRow & {
  id: string;
  client_name: string | null;
  description?: string | null;
  due_date?: string | null;
  work_order_id?: string | null;
  previous_balance_breakdown?: BreakdownItem[] | null;
};

interface ReceivePaymentDialogProps {
  /** The invoice the payment is recorded against; null closes the dialog. */
  entry: ReceivableForPayment | null;
  onClose: () => void;
  /** Called after the receipt is recorded. */
  onRecorded: () => void;
  bankAccounts: Array<{ id: string; account_name?: string | null; bank_name?: string | null; account_number?: string | null }>;
  staffUsers: Array<{ id: string; name: string; role: string }>;
  /** Other invoices of the same work order to tick initially (e.g. a bulk selection). */
  preselectIds?: string[];
}

/** The invoice's work order as shown to the user. */
type WorkOrderInfo = { id: string; work_order_id: string | null; order_date: string | null };

const THIRD_PARTY = '__third_party__';
const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** Whole days past the due date as of `today` (YYYY-MM-DD, IST); 0 when not yet due. */
function daysOverdue(dueDate: string | null | undefined, today: string): number {
  if (!dueDate) return 0;
  const days = Math.floor((Date.parse(today) - Date.parse(dueDate.slice(0, 10))) / 86_400_000);
  return Number.isFinite(days) && days > 0 ? days : 0;
}

/** Ids and reference numbers of the older invoices an invoice lists as previous due. */
function listedInBreakdown(entry: ReceivableForPayment): Set<string> {
  const listed = new Set<string>();
  for (const b of entry.previous_balance_breakdown ?? []) {
    if (b?.id) listed.add(String(b.id));
    const ref = b?.referenceNumber ?? b?.reference_number;
    if (ref) listed.add(String(ref));
  }
  return listed;
}

const isListed = (listed: Set<string>, r: { id: string; reference_number?: string | null }) =>
  listed.has(r.id) || (!!r.reference_number && listed.has(r.reference_number));

/**
 * Loads the other unpaid invoices of the same work order and which invoices
 * have a payment whose TDS is unknown, then opens the form on that live position.
 */
export function ReceivePaymentDialog(props: ReceivePaymentDialogProps) {
  const { entry, onClose } = props;
  const workOrderId = entry?.work_order_id ?? null;

  // Older unpaid invoices this receipt may also pay. A receipt is applied within
  // one work order: with a work order, its other unpaid invoices; without one,
  // only the invoices this invoice lists as previous due that also have none.
  const { data: candidates = [], isLoading: loadingCandidates } = useQuery<ReceivableForPayment[]>({
    queryKey: ['receive-payment-candidates', entry?.id, workOrderId],
    enabled: !!entry,
    gcTime: 0, // always read live balances when the dialog opens
    queryFn: async () => {
      const listed = listedInBreakdown(entry!);
      if (!workOrderId && (listed.size === 0 || !entry!.client_name)) return [];
      let query = supabaseClient
        .from('receivables')
        .select(`${OUTSTANDING_COLUMNS}, previous_balance_breakdown`)
        .eq('category', 'Invoices')
        .in('status', UNPAID_INVOICE_STATUSES)
        .neq('id', entry!.id);
      query = workOrderId
        ? query.eq('work_order_id', workOrderId)
        : query.is('work_order_id', null).eq('client_name', entry!.client_name!);
      const { data, error } = await query.order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as ReceivableForPayment[])
        .filter((r) => (r.work_order_id ?? null) === workOrderId)
        .filter((r) => workOrderId || isListed(listed, r))
        .filter((r) => amountDue(r) > 0.01);
    },
  });

  // The work order's display number for the header.
  const { data: workOrder = null } = useQuery<WorkOrderInfo | null>({
    queryKey: ['receive-payment-work-order', workOrderId],
    enabled: !!workOrderId,
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('work_orders')
        .select('id, work_order_id, order_date')
        .eq('id', workOrderId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as WorkOrderInfo | null) ?? null;
    },
  });

  // Invoices with a recorded payment whose TDS is unknown (legacy rows): their
  // remaining TDS cannot be worked out, so it is not pre-filled.
  const ids = useMemo(() => (entry ? [entry.id, ...candidates.map((c) => c.id)] : []), [entry, candidates]);
  const { data: legacyTds, isLoading: loadingTds } = useQuery<string[]>({
    queryKey: ['receive-payment-legacy-tds', ids.join(',')],
    enabled: ids.length > 0 && !loadingCandidates,
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('receivable_payments')
        .select('receivable_id, tds_amount, reversed_at')
        .in('receivable_id', ids);
      if (error) return ids; // unknown → never guess TDS
      return [...new Set((data ?? []).filter((p: any) => p.tds_amount == null && !p.reversed_at)
        .map((p: any) => String(p.receivable_id)))];
    },
  });

  if (!entry) return null;
  if (loadingCandidates || loadingTds) {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="sm:max-w-[960px]">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>Invoice {entry.reference_number || entry.id.slice(0, 8)} · {entry.client_name || 'Unknown client'}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <ReceivePaymentForm {...props} entry={entry} candidates={candidates} legacyTds={legacyTds ?? ids} workOrder={workOrder} />
  );
}

type FormProps = Omit<ReceivePaymentDialogProps, 'entry'> & {
  entry: ReceivableForPayment;
  candidates: ReceivableForPayment[];
  /** Ids of invoices whose earlier TDS is not on record. */
  legacyTds: string[];
  /** The invoice's work order, once loaded (null while loading or when it has none). */
  workOrder: WorkOrderInfo | null;
};

/** A fresh form: older invoices this one lists (or the bulk selection) ticked, TDS pre-filled. */
function initialSelection({ entry, candidates, legacyTds, preselectIds = [] }: FormProps) {
  const listed = listedInBreakdown(entry);
  for (const id of preselectIds) listed.add(id);
  const unknown = new Set(legacyTds);
  const tdsById: Record<string, string> = {};
  for (const r of [entry, ...candidates]) {
    const t = suggestedTds(r, { legacyTdsUnknown: unknown.has(r.id) });
    if (t > 0) tdsById[r.id] = String(t);
  }
  const carriedIds = candidates.filter((c) => isListed(listed, c)).map((c) => c.id);
  return { carriedIds, tdsById };
}

/** Now as a datetime-local value in the browser's time zone. */
function localDateTimeNow(): string {
  const local = new Date();
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
}

/** A labelled form field. */
function Field({ label, htmlFor, children, className = '' }: { label: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/** Amber for an amount that cannot be applied, red for anything else that blocks saving. */
function Notice({ tone, children }: { tone: 'warning' | 'error'; children: ReactNode }) {
  const cls = tone === 'warning'
    ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300'
    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300';
  return (
    <p role="alert" className={`flex items-start gap-2 rounded-md border p-2.5 text-xs leading-relaxed ${cls}`}>
      <AlertTriangle className="h-4 w-4 mt-px shrink-0" />{children}
    </p>
  );
}

const METHODS: Array<{ mode: PaymentMode; label: string; icon: typeof Landmark }> = [
  { mode: 'Bank Transfer', label: 'Bank transfer', icon: Landmark },
  { mode: 'Cheque', label: 'Cheque', icon: PenLine },
  { mode: 'Cash', label: 'Cash', icon: Banknote },
];

function ReceivePaymentForm(props: FormProps) {
  const { entry, candidates, legacyTds, workOrder, onClose, onRecorded, bankAccounts, staffUsers } = props;
  const { toast } = useToast();
  const amountRef = useRef<HTMLInputElement>(null);
  const [initial] = useState(() => initialSelection(props));
  const [today] = useState(istToday);
  const [mode, setMode] = useState<PaymentMode>('Bank Transfer');
  const [receivedBy, setReceivedBy] = useState('');
  const [thirdPartyName, setThirdPartyName] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [utr, setUtr] = useState('');
  const [txnDateTime, setTxnDateTime] = useState(localDateTimeNow);
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [depositAccountId, setDepositAccountId] = useState('');
  const [paymentDate, setPaymentDate] = useState(istToday);
  const [cash, setCash] = useState('');
  const [cashTouched, setCashTouched] = useState(false);
  const [carriedIds, setCarriedIds] = useState<string[]>(initial.carriedIds);
  const [tdsById, setTdsById] = useState<Record<string, string>>(initial.tdsById);
  const [othersOpen, setOthersOpen] = useState(initial.carriedIds.length > 0);
  const [handling, setHandling] = useState<BalanceHandling>('keep');
  const [promiseDate, setPromiseDate] = useState('');
  const [creditNoteReason, setCreditNoteReason] = useState('');

  const selectedCarried = useMemo(
    () => candidates.filter((c) => carriedIds.includes(c.id)), [candidates, carriedIds]);
  const covered = useMemo(() => [...selectedCarried, entry], [entry, selectedCarried]);
  const tdsMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of covered) {
      const v = round2(parseFloat(tdsById[r.id] || '0') || 0);
      if (v !== 0) map[r.id] = v;
    }
    return map;
  }, [covered, tdsById]);
  // Until the amount is typed, it follows what the ticked invoices owe after TDS.
  const defaultCash = sumMoney(covered.map((r) => Math.max(0, amountDue(r) - (tdsMap[r.id] ?? 0))));
  const cashValue = cashTouched ? round2(parseFloat(cash) || 0) : defaultCash;
  const plan = useMemo(
    () => planReceipt({ target: entry, carried: selectedCarried, cash: cashValue, tds: tdsMap }),
    [entry, selectedCarried, cashValue, tdsMap]);
  const allocationById = new Map(plan.allocations.map((a) => [a.id, a]));
  const balanceLeft = plan.targetBalanceAfter;
  const tdsTotal = sumMoney(Object.values(tdsMap));
  const resolvedReceivedBy = receivedBy === THIRD_PARTY ? (thirdPartyName.trim() || '') : receivedBy;
  const entryDue = amountDue(entry);
  const entryOverdue = entryDue > 0.01 ? daysOverdue(entry.due_date, today) : 0;

  // The same instrument checks record_receipt applies, reported before saving.
  const formError = (() => {
    if (plan.errors.length > 0) return plan.errors[0];
    if (cashValue > 0 && mode === 'Bank Transfer' && (!bankAccountId || !utr.trim())) {
      return 'Select the bank account and enter the transaction reference (UTR).';
    }
    if (cashValue > 0 && mode === 'Cheque' && (!chequeNumber.trim() || !chequeDate)) return 'Enter the cheque number and cheque date.';
    if (cashValue > 0 && mode === 'Cheque' && !depositAccountId) return 'Select the bank account the cheque will be deposited into.';
    if (cashValue > 0 && mode !== 'Bank Transfer' && !resolvedReceivedBy) {
      return receivedBy === THIRD_PARTY ? "Enter the authorised person's name." : 'Select who received the payment.';
    }
    if (balanceLeft > 0.01 && handling === 'promise' && !promiseDate) return 'Enter the date the client promised to pay the balance.';
    if (balanceLeft > 0.01 && handling === 'credit_note' && !creditNoteReason.trim()) return 'Enter the reason for the credit note.';
    return null;
  })();
  // Cash that no ticked invoice can take is a warning (fix the amount or tick more), not a failure.
  const errorTone: 'warning' | 'error' = plan.leftover > 0 && formError?.startsWith('OVERPAYMENT') ? 'warning' : 'error';

  const save = useMutation({
    mutationFn: async () => {
      if (formError) throw new Error(formError);
      const scope = getBranchScope();
      const result = await recordReceipt({
        target_id: entry.id,
        carried_ids: selectedCarried.map((c) => c.id),
        cash_amount: cashValue,
        tds: tdsMap,
        mode,
        received_by: mode === 'Bank Transfer' ? null : resolvedReceivedBy || null,
        cheque_number: mode === 'Cheque' ? chequeNumber.trim() : null,
        cheque_date: mode === 'Cheque' ? chequeDate : null,
        deposit_account_id: mode === 'Cheque' ? depositAccountId : null,
        bank_account_id: mode === 'Bank Transfer' ? bankAccountId : null,
        transaction_number: mode === 'Bank Transfer' ? utr.trim() : null,
        transaction_datetime: mode === 'Bank Transfer' && txnDateTime ? new Date(txnDateTime).toISOString() : null,
        payment_date: mode === 'Bank Transfer' && txnDateTime ? txnDateTime.slice(0, 10) : paymentDate || null,
        balance_handling: balanceLeft > 0.01 ? handling : 'keep',
        promise_date: balanceLeft > 0.01 && handling === 'promise' ? promiseDate : null,
        credit_note_reason: balanceLeft > 0.01 && handling === 'credit_note' ? creditNoteReason.trim() : null,
        branch_id: scope.id || null,
      });

      const target = result.invoices.find((i) => i.id === entry.id);
      // The receipt is the money movement, so the instrument is recorded in full.
      void logChange({
        action: 'accounts.payment.receive',
        target: entry.reference_number || entry.id,
        entityType: 'receivables',
        entityId: entry.id,
        entityLabel: `${entry.reference_number ?? entry.id} — ${entry.client_name ?? 'Unknown client'}`,
        severity: target && target.balance > 0.01 ? 'critical' : 'notice',
        before: { status: entry.status ?? null, amountOutstanding: amountDue(entry) },
        after: { status: target?.status ?? null, amountOutstanding: target?.balance ?? null },
        details: {
          receiptId: result.receipt_id, clientName: entry.client_name, cashReceived: cashValue, tds: tdsMap,
          paymentMode: mode, receivedBy: resolvedReceivedBy || null, chequeNumber: chequeNumber || null,
          bankAccount: bankAccounts.find((b) => b.id === (bankAccountId || depositAccountId))?.account_name ?? null,
          transactionNumber: utr || null, allocations: result.allocations,
          balanceHandling: balanceLeft > 0.01 ? handling : null, creditNote: result.credit_note?.reference_number ?? null,
        },
        logUnchanged: true,
      });
      return result;
    },
    onSuccess: (result) => {
      const target = result.invoices.find((i) => i.id === entry.id);
      const others = result.allocations.filter((a) => a.receivable_id !== entry.id).length;
      const parts = [
        `${inr(cashValue)} recorded${others > 0 ? ` across ${others + 1} invoices (oldest first)` : ''}.`,
        result.credit_note ? `Credit note ${result.credit_note.reference_number} for ${inr(Number(result.credit_note.amount))} closes the balance.` : '',
        target && target.balance > 0.01 && !result.credit_note ? `${inr(target.balance)} is still due on this invoice.` : '',
      ].filter(Boolean);
      toast({ title: target?.status === 'received' ? 'Payment received in full' : 'Payment recorded', description: parts.join(' ') });
      onRecorded();
    },
    onError: (err: any) => {
      toast({ title: 'Payment not recorded', description: err?.message || 'Failed to record payment', variant: 'destructive' });
    },
  });

  const unknownTds = new Set(legacyTds);
  const candidatesDue = sumMoney(candidates.map(amountDue));
  const tdsHint = (r: ReceivableForPayment) => {
    const rate = Math.max(Number(r.tds_rate) || 0, DEFAULT_TDS_CAP_RATE);
    return `Up to ${inr(tdsCap(r))} (${rate}% of taxable value${toPaise(r.tds_credited) > 0 ? ', less TDS already credited' : ''})`;
  };
  const setTds = (id: string, value: string) => setTdsById((prev) => ({ ...prev, [id]: value }));
  const toggleCarried = (id: string, on: boolean) =>
    setCarriedIds((prev) => (on ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id)));

  const receiverSelect = (
    <Field label="Received by *" className={receivedBy === THIRD_PARTY ? 'sm:col-span-2' : ''}>
      <div className={receivedBy === THIRD_PARTY ? 'grid grid-cols-1 sm:grid-cols-2 gap-2' : ''}>
        <Select value={receivedBy} onValueChange={setReceivedBy}>
          <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
          <SelectContent>
            {staffUsers.map((u) => <SelectItem key={u.id} value={u.name}>{u.name} ({u.role})</SelectItem>)}
            <SelectItem value={THIRD_PARTY}>Authorised 3rd person…</SelectItem>
          </SelectContent>
        </Select>
        {receivedBy === THIRD_PARTY && (
          <Input value={thirdPartyName} onChange={(e) => setThirdPartyName(e.target.value)} placeholder="Name of the authorised person" aria-label="Name of the authorised person" />
        )}
      </div>
    </Field>
  );
  const bankSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <Field label={`${label} *`}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
        <SelectContent>
          {bankAccounts.map((b) => (
            <SelectItem key={b.id} value={b.id}>{b.account_name || b.bank_name} {b.account_number ? `· ${String(b.account_number).slice(-4)}` : ''}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
  const receivedOn = (
    <Field label="Received on" htmlFor="rp-received-on">
      <Input id="rp-received-on" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
    </Field>
  );
  const sectionTitle = (title: string) => <p className="text-sm font-semibold">{title}</p>;
  const workOrderLabel = !entry.work_order_id ? 'No work order' : (workOrder?.work_order_id || 'Work order');
  const amountInputKeys = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.preventDefault(); };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-[960px]"
        onOpenAutoFocus={(e) => { e.preventDefault(); amountRef.current?.focus(); }}
      >
        <DialogHeader className="space-y-0 border-b px-6 pt-5 pb-4 text-left">
          <div className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 space-y-2">
              <DialogTitle>Record payment</DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="font-medium text-foreground">Invoice {entry.reference_number || entry.id.slice(0, 8)}</span>
                  <span className="truncate">{entry.client_name || 'Unknown client'}</span>
                  <Badge variant="outline" className="gap-1 font-medium"
                    title={workOrder?.order_date ? `Work order dated ${fmtDate(workOrder.order_date)}` : undefined}>
                    <ClipboardList className="h-3 w-3" />{workOrderLabel}
                  </Badge>
                </div>
              </DialogDescription>
            </div>
            <div className="shrink-0 sm:text-right">
              <p className="text-xs text-muted-foreground">Due on this invoice</p>
              <p className="text-2xl font-semibold tabular-nums leading-tight">{inr(entryDue)}</p>
              {entryOverdue > 0 && (
                <Badge variant="outline" className="mt-1 gap-1 border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  <Clock className="h-3 w-3" />{entryOverdue} {entryOverdue === 1 ? 'day' : 'days'} overdue
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-6">
              {/* Payment method */}
              <section className="space-y-3">
                {sectionTitle('Payment method')}
                <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                  {METHODS.map(({ mode: m, label, icon: Icon }) => (
                    <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                      className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${mode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                      <Icon className="h-4 w-4" />{label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {mode === 'Bank Transfer' && (<>
                    {bankSelect(bankAccountId, setBankAccountId, 'Credited to bank account')}
                    <Field label="Transaction reference (UTR) *" htmlFor="rp-utr">
                      <Input id="rp-utr" value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="UTR / reference number" />
                    </Field>
                    <Field label="Transaction date & time" htmlFor="rp-txn">
                      <Input id="rp-txn" type="datetime-local" value={txnDateTime} onChange={(e) => setTxnDateTime(e.target.value)} />
                    </Field>
                  </>)}
                  {mode === 'Cheque' && (<>
                    <Field label="Cheque number *" htmlFor="rp-cheque-no">
                      <Input id="rp-cheque-no" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} />
                    </Field>
                    <Field label="Cheque date *" htmlFor="rp-cheque-date">
                      <Input id="rp-cheque-date" type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
                    </Field>
                    {bankSelect(depositAccountId, setDepositAccountId, 'To be deposited into')}
                    {receivedOn}
                    {receiverSelect}
                  </>)}
                  {mode === 'Cash' && (<>{receiverSelect}{receivedOn}</>)}
                </div>
              </section>

              {/* Amount */}
              <section className="space-y-2">
                <div className="flex items-end justify-between gap-2">
                  <Label htmlFor="rp-amount" className="text-sm font-semibold">Amount received *</Label>
                  <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" disabled={!cashTouched}
                    onClick={() => { setCashTouched(false); setCash(''); amountRef.current?.focus(); }}>
                    Pay full due
                  </Button>
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                  <Input
                    id="rp-amount" ref={amountRef} type="number" min="0" step="0.01" inputMode="decimal"
                    className="h-11 pl-7 text-lg font-semibold tabular-nums"
                    value={cashTouched ? cash : String(defaultCash)}
                    onChange={(e) => { setCashTouched(true); setCash(e.target.value); }}
                    onKeyDown={amountInputKeys}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  Ticked invoices owe {inr(sumMoney(covered.map(amountDue)))} less {inr(tdsTotal)} TDS = {inr(defaultCash)}.
                </p>
              </section>

              {/* TDS on this invoice */}
              <section className="space-y-2">
                <Label htmlFor="rp-tds" className="text-sm font-semibold">TDS withheld on this invoice</Label>
                <div className="relative max-w-60">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                  <Input
                    id="rp-tds" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
                    className="pl-7 tabular-nums" value={tdsById[entry.id] ?? ''}
                    onChange={(e) => setTds(entry.id, e.target.value)} onKeyDown={amountInputKeys}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground tabular-nums">{tdsHint(entry)}</p>
                {unknownTds.has(entry.id) && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">Earlier TDS not on record; enter it</p>
                )}
              </section>

              {/* Earlier invoices of the same work order */}
              <section>
                {candidates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {entry.work_order_id ? 'No other unpaid invoices on this work order.' : 'No other unpaid invoices to include: this invoice has no work order.'}
                  </p>
                ) : (
                  <Collapsible open={othersOpen} onOpenChange={setOthersOpen} className="rounded-lg border">
                    <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/40">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">
                          {entry.work_order_id ? 'Also apply to earlier invoices on this work order' : 'Also apply to earlier invoices listed as previous due'}
                        </span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {candidates.length} unpaid · {inr(candidatesDue)} due
                          {selectedCarried.length > 0 && ` · ${selectedCarried.length} ticked`}
                        </span>
                      </span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${othersOpen ? 'rotate-180' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="border-t">
                      <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] text-muted-foreground">
                        <span>Paid oldest first, before this invoice.</span>
                        <span className="flex gap-3">
                          <button type="button" className="font-medium text-foreground hover:underline" onClick={() => setCarriedIds(candidates.map((c) => c.id))}>Select all</button>
                          <button type="button" className="font-medium text-foreground hover:underline" onClick={() => setCarriedIds([])}>Clear</button>
                        </span>
                      </div>
                      <ul className="divide-y border-t">
                        {candidates.map((r) => {
                          const ticked = carriedIds.includes(r.id);
                          const overdue = daysOverdue(r.due_date, today);
                          const ref = r.reference_number || r.id.slice(0, 8);
                          return (
                            <li key={r.id} className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2 ${ticked ? 'bg-muted/30' : ''}`}>
                              <Checkbox id={`rp-carry-${r.id}`} checked={ticked}
                                onCheckedChange={(v) => toggleCarried(r.id, v === true)} aria-label={`Include invoice ${ref}`} />
                              <label htmlFor={`rp-carry-${r.id}`} className="min-w-0 cursor-pointer">
                                <span className="block truncate text-sm font-medium">{ref}</span>
                                <span className="block text-[11px] text-muted-foreground">
                                  Due {fmtDate(r.due_date)}
                                  {overdue > 0 && <span className="ml-1.5 font-medium text-red-600 dark:text-red-400">{overdue}d overdue</span>}
                                </span>
                              </label>
                              <span className="text-right text-sm font-medium tabular-nums">{inr(amountDue(r))}</span>
                              {ticked && (
                                <div className="col-span-2 col-start-2 flex flex-wrap items-center justify-end gap-2">
                                  {unknownTds.has(r.id) && <span className="text-[10px] text-amber-700 dark:text-amber-400">Earlier TDS not on record; enter it</span>}
                                  <Label htmlFor={`rp-tds-${r.id}`} className="text-[11px] font-normal text-muted-foreground">TDS ₹</Label>
                                  <Input
                                    id={`rp-tds-${r.id}`} type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
                                    className="h-8 w-28 text-right tabular-nums" value={tdsById[r.id] ?? ''} title={tdsHint(r)}
                                    onChange={(e) => setTds(r.id, e.target.value)} onKeyDown={amountInputKeys}
                                  />
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </section>

              {/* What happens to a balance left on this invoice */}
              {balanceLeft > 0.01 && (
                <section className="space-y-2">
                  {sectionTitle(`${inr(balanceLeft)} will still be due on this invoice`)}
                  <RadioGroup value={handling} onValueChange={(v) => setHandling(v as BalanceHandling)} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {([
                      { key: 'keep', label: 'Keep it due', hint: 'Stays open against the due date' },
                      { key: 'promise', label: 'Client promised a date', hint: 'Recorded for follow-up' },
                      { key: 'credit_note', label: 'Write off by credit note', hint: 'Numbered credit note, GST reversed' },
                    ] as const).map((o) => (
                      <Label key={o.key} htmlFor={`rp-handling-${o.key}`}
                        className={`flex cursor-pointer items-start gap-2 rounded-md border p-2.5 font-normal leading-normal transition-colors ${handling === o.key ? 'border-safend-red bg-safend-red/5 dark:bg-safend-red/10' : 'hover:bg-muted/40'}`}>
                        <RadioGroupItem id={`rp-handling-${o.key}`} value={o.key} className="mt-0.5" />
                        <span>
                          <span className="block text-xs font-semibold">{o.label}</span>
                          <span className="block text-[11px] text-muted-foreground">{o.hint}</span>
                        </span>
                      </Label>
                    ))}
                  </RadioGroup>
                  {handling === 'promise' && (
                    <Field label="Promised payment date *" htmlFor="rp-promise" className="max-w-xs">
                      <Input id="rp-promise" type="date" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} />
                    </Field>
                  )}
                  {handling === 'credit_note' && (
                    <Field label="Reason for the credit note *" htmlFor="rp-cn-reason">
                      <Input id="rp-cn-reason" value={creditNoteReason} onChange={(e) => setCreditNoteReason(e.target.value)} placeholder="e.g. Rate difference agreed with client" />
                    </Field>
                  )}
                </section>
              )}
            </div>

            {/* Summary */}
            <aside className="space-y-4 self-start rounded-lg border bg-muted/30 p-4 lg:sticky lg:top-0">
              <p className="text-sm font-semibold">Summary</p>
              <dl className="space-y-1.5 text-sm tabular-nums">
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Amount received</dt><dd>{inr(cashValue)}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">TDS</dt><dd>{inr(tdsTotal)}</dd></div>
                <div className="flex justify-between gap-2 border-t pt-1.5 font-semibold"><dt>Total applied</dt><dd>{inr(plan.total)}</dd></div>
              </dl>
              {plan.allocations.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Applied to, oldest first</p>
                  <ul className="space-y-1 text-sm">
                    {plan.allocations.map((a) => {
                      const settled = a.outstandingAfter <= 0.01;
                      return (
                        <li key={a.id} className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            {settled
                              ? <CircleCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                              : <span className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                            <span className="truncate">{a.referenceNumber || a.id.slice(0, 8)}</span>
                            {settled && <span className="text-[10px] text-emerald-700 dark:text-emerald-400">settled</span>}
                          </span>
                          <span className="tabular-nums">{inr(sumMoney([a.cash, a.tds]))}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2 border-t pt-3">
                <span className="text-sm font-semibold">Left due on this invoice</span>
                <span className={`text-lg font-semibold tabular-nums ${balanceLeft > 0.01 ? '' : 'text-emerald-600 dark:text-emerald-400'}`}>{inr(balanceLeft)}</span>
              </div>
              {formError && <Notice tone={errorTone}>{formError}</Notice>}
            </aside>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t px-6 py-3 sm:space-x-0">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button className="min-w-40 bg-safend-red text-white hover:bg-safend-red/90" disabled={!!formError || save.isPending}
            onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
            {save.isPending ? 'Recording…' : cashValue > 0 ? `Record ${inr(cashValue)}` : 'Record payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
