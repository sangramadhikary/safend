'use client';

/**
 * Record one receipt (bank transfer, cheque or cash) against an invoice and,
 * optionally, older invoices of the same client that the same payment covers.
 *
 * The allocation is previewed with planReceipt (src/lib/invoice/ledger.ts) and
 * recorded by the record_receipt database function, which re-checks it, posts
 * the bank / cheque / cash register entry once for the whole receipt, and
 * derives each invoice's balance and status from its allocation rows. Cash goes
 * to the oldest selected invoice first and to this invoice last. An amount
 * larger than the selected invoices owe is refused, never silently absorbed.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabaseClient } from '@/integrations/supabase/client';
import { getBranchScope } from '@/utils/branchScope';
import { useToast } from '@/hooks/use-toast';
import { logChange } from '@/utils/auditLog';
import { amountDue, planReceipt, round2, sumMoney, suggestedTds, tdsCap, type LedgerRow } from '@/lib/invoice/ledger';
import { OUTSTANDING_COLUMNS, UNPAID_INVOICE_STATUSES } from '@/lib/invoice/outstanding';
import { recordReceipt, type BalanceHandling, type PaymentMode } from '@/services/invoiceLedgerService';

export type ReceivableForPayment = LedgerRow & {
  id: string;
  client_name: string | null;
  description?: string | null;
  due_date?: string | null;
  previous_balance_breakdown?: Array<{ id?: string; referenceNumber?: string; reference_number?: string }> | null;
};

interface ReceivePaymentDialogProps {
  /** The invoice the payment is recorded against; null closes the dialog. */
  entry: ReceivableForPayment | null;
  onClose: () => void;
  /** Called after the receipt is recorded. */
  onRecorded: () => void;
  bankAccounts: Array<{ id: string; account_name?: string | null; bank_name?: string | null; account_number?: string | null }>;
  staffUsers: Array<{ id: string; name: string; role: string }>;
  /** Other invoices of the client to tick initially (e.g. a bulk selection). */
  preselectIds?: string[];
}

const THIRD_PARTY = '__third_party__';
const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/**
 * Loads the client's other unpaid invoices and which invoices have a payment
 * whose TDS is unknown, then opens the form on that live position.
 */
export function ReceivePaymentDialog(props: ReceivePaymentDialogProps) {
  const { entry, onClose } = props;

  // Other unpaid invoices of the same client this receipt may also pay.
  const { data: candidates = [], isLoading: loadingCandidates } = useQuery<ReceivableForPayment[]>({
    queryKey: ['receive-payment-candidates', entry?.id],
    enabled: !!entry?.client_name,
    gcTime: 0, // always read live balances when the dialog opens
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('receivables')
        .select(`${OUTSTANDING_COLUMNS}, previous_balance_breakdown`)
        .eq('category', 'Invoices')
        .eq('client_name', entry!.client_name)
        .in('status', UNPAID_INVOICE_STATUSES)
        .neq('id', entry!.id)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as ReceivableForPayment[]).filter((r) => amountDue(r) > 0.01);
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
        <DialogContent className="sm:max-w-[860px]">
          <DialogHeader><DialogTitle>Record Payment · Invoice {entry.reference_number || entry.id.slice(0, 8)}</DialogTitle></DialogHeader>
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        </DialogContent>
      </Dialog>
    );
  }
  return <ReceivePaymentForm {...props} entry={entry} candidates={candidates} legacyTds={legacyTds ?? ids} />;
}

type FormProps = Omit<ReceivePaymentDialogProps, 'entry'> & {
  entry: ReceivableForPayment;
  candidates: ReceivableForPayment[];
  /** Ids of invoices whose earlier TDS is not on record. */
  legacyTds: string[];
};

/** A fresh form: older invoices this one lists (or the bulk selection) ticked, TDS pre-filled. */
function initialSelection({ entry, candidates, legacyTds, preselectIds = [] }: FormProps) {
  const listed = new Set<string>(preselectIds);
  for (const b of entry.previous_balance_breakdown ?? []) {
    if (b?.id) listed.add(String(b.id));
    const ref = b?.referenceNumber ?? b?.reference_number;
    if (ref) listed.add(String(ref));
  }
  const unknown = new Set(legacyTds);
  const tdsById: Record<string, string> = {};
  for (const r of [entry, ...candidates]) {
    const t = suggestedTds(r, { legacyTdsUnknown: unknown.has(r.id) });
    if (t > 0) tdsById[r.id] = String(t);
  }
  const carriedIds = candidates
    .filter((c) => listed.has(c.id) || (!!c.reference_number && listed.has(c.reference_number)))
    .map((c) => c.id);
  return { carriedIds, tdsById };
}

/** Now as a datetime-local value in the browser's time zone. */
function localDateTimeNow(): string {
  const local = new Date();
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 16);
}

function ReceivePaymentForm(props: FormProps) {
  const { entry, candidates, legacyTds, onClose, onRecorded, bankAccounts, staffUsers } = props;
  const { toast } = useToast();
  const [initial] = useState(() => initialSelection(props));
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
  const [handling, setHandling] = useState<BalanceHandling>('keep');
  const [promiseDate, setPromiseDate] = useState('');
  const [creditNoteReason, setCreditNoteReason] = useState('');

  const selectedCarried = useMemo(
    () => candidates.filter((c) => carriedIds.includes(c.id)), [candidates, carriedIds]);
  const covered = useMemo(() => (entry ? [...selectedCarried, entry] : []), [entry, selectedCarried]);
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
    () => (entry ? planReceipt({ target: entry, carried: selectedCarried, cash: cashValue, tds: tdsMap }) : null),
    [entry, selectedCarried, cashValue, tdsMap]);
  const allocationById = new Map((plan?.allocations ?? []).map((a) => [a.id, a]));
  const balanceLeft = plan?.targetBalanceAfter ?? 0;
  const resolvedReceivedBy = receivedBy === THIRD_PARTY ? (thirdPartyName.trim() || '') : receivedBy;

  // The same instrument checks record_receipt applies, reported before saving.
  const formError = (() => {
    if (!entry || !plan) return 'Invoice not loaded.';
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

  const save = useMutation({
    mutationFn: async () => {
      if (!entry || formError) throw new Error(formError ?? 'Invoice not loaded.');
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
      const target = result.invoices.find((i) => i.id === entry?.id);
      const others = result.allocations.filter((a) => a.receivable_id !== entry?.id).length;
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
  const rows = [entry, ...candidates];
  const receiverSelect = (
    <div className="space-y-1">
      <Label>Received by *</Label>
      <Select value={receivedBy} onValueChange={setReceivedBy}>
        <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
        <SelectContent>
          {staffUsers.map((u) => <SelectItem key={u.id} value={u.name}>{u.name} ({u.role})</SelectItem>)}
          <SelectItem value={THIRD_PARTY}>Authorised 3rd person…</SelectItem>
        </SelectContent>
      </Select>
      {receivedBy === THIRD_PARTY && (
        <Input className="mt-1" value={thirdPartyName} onChange={(e) => setThirdPartyName(e.target.value)} placeholder="Name of the authorised person" />
      )}
    </div>
  );
  const bankSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <div className="space-y-1">
      <Label>{label} *</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
        <SelectContent>
          {bankAccounts.map((b) => (
            <SelectItem key={b.id} value={b.id}>{b.account_name || b.bank_name} {b.account_number ? `· ${String(b.account_number).slice(-4)}` : ''}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[860px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Record Payment · Invoice {entry.reference_number || entry.id.slice(0, 8)}
            <span className="block text-sm font-normal text-muted-foreground">{entry.client_name || 'Unknown client'}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
            {/* Invoices covered by this receipt */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">Invoices this payment covers</p>
              <p className="text-xs text-muted-foreground">
                The amount is applied to the oldest ticked invoice first and to this invoice last. Each invoice keeps its own balance.
              </p>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="w-8 px-2 py-2" />
                      <th className="px-2 py-2 text-left">Invoice</th>
                      <th className="px-2 py-2 text-left">Due date</th>
                      <th className="px-2 py-2 text-right">Owed</th>
                      <th className="px-2 py-2 text-right">TDS withheld</th>
                      <th className="px-2 py-2 text-right">Cash applied</th>
                      <th className="px-2 py-2 text-right">Balance after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const isTarget = r.id === entry.id;
                      const ticked = isTarget || carriedIds.includes(r.id);
                      const alloc = allocationById.get(r.id);
                      const owed = amountDue(r);
                      return (
                        <tr key={r.id} className={`border-t ${ticked ? '' : 'text-muted-foreground'}`}>
                          <td className="px-2 py-1.5 text-center">
                            <Checkbox
                              checked={ticked}
                              disabled={isTarget}
                              onCheckedChange={(v) => setCarriedIds((prev) => v ? [...prev, r.id] : prev.filter((id) => id !== r.id))}
                              aria-label={`Include invoice ${r.reference_number ?? ''}`}
                            />
                          </td>
                          <td className="px-2 py-1.5 font-medium whitespace-nowrap">
                            {r.reference_number || r.id.slice(0, 8)}{isTarget && <span className="ml-1 text-xs text-muted-foreground">(this invoice)</span>}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(r.due_date)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{inr(owed)}</td>
                          <td className="px-2 py-1.5 text-right">
                            {ticked ? (
                              <Input
                                type="number" min="0" step="0.01" inputMode="decimal"
                                className="h-8 w-28 ml-auto text-right"
                                value={tdsById[r.id] ?? ''}
                                placeholder="0"
                                title={`At most ${inr(tdsCap(r))} on this invoice`}
                                onChange={(e) => setTdsById((prev) => ({ ...prev, [r.id]: e.target.value }))}
                              />
                            ) : '—'}
                            {ticked && unknownTds.has(r.id) && (
                              <span className="block text-[10px] text-amber-600">Earlier TDS not on record; enter it</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{ticked ? inr(alloc?.cash ?? 0) : '—'}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                            {ticked ? inr(alloc ? alloc.outstandingAfter : owed) : inr(owed)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Instrument */}
            <div className="space-y-3">
              <p className="text-sm font-semibold">Payment details</p>
              <div className="grid grid-cols-3 gap-2">
                {(['Bank Transfer', 'Cheque', 'Cash'] as PaymentMode[]).map((m) => (
                  <Button key={m} type="button" variant={mode === m ? 'default' : 'outline'} onClick={() => setMode(m)}>{m}</Button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {mode === 'Bank Transfer' && (<>
                  {bankSelect(bankAccountId, setBankAccountId, 'Credited to bank account')}
                  <div className="space-y-1"><Label>Transaction reference (UTR) *</Label>
                    <Input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="UTR / reference number" /></div>
                  <div className="space-y-1"><Label>Transaction date &amp; time</Label>
                    <Input type="datetime-local" value={txnDateTime} onChange={(e) => setTxnDateTime(e.target.value)} /></div>
                </>)}
                {mode === 'Cheque' && (<>
                  <div className="space-y-1"><Label>Cheque number *</Label>
                    <Input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} /></div>
                  <div className="space-y-1"><Label>Cheque date *</Label>
                    <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} /></div>
                  {bankSelect(depositAccountId, setDepositAccountId, 'To be deposited into')}
                  {receiverSelect}
                </>)}
                {mode === 'Cash' && receiverSelect}
                {mode !== 'Bank Transfer' && (
                  <div className="space-y-1"><Label>Received on</Label>
                    <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></div>
                )}
              </div>
            </div>

            {/* Amount */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <Label>Amount received (₹) *</Label>
                <Input
                  type="number" min="0" step="0.01" inputMode="decimal"
                  value={cashTouched ? cash : String(defaultCash)}
                  onChange={(e) => { setCashTouched(true); setCash(e.target.value); }}
                />
                <p className="text-[11px] text-muted-foreground">
                  Ticked invoices owe {inr(sumMoney(covered.map(amountDue)))} less {inr(sumMoney(Object.values(tdsMap)))} TDS = {inr(defaultCash)}.
                </p>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Applied (cash + TDS)</span><span className="tabular-nums">{inr(plan?.total ?? 0)}</span></div>
                <div className="flex justify-between font-semibold"><span>Left on this invoice</span><span className="tabular-nums">{inr(balanceLeft)}</span></div>
              </div>
            </div>

            {/* What happens to a balance left on this invoice */}
            {balanceLeft > 0.01 && (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-semibold">{inr(balanceLeft)} will still be due on this invoice</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {([
                    { key: 'keep', label: 'Keep it due', hint: 'Stays open against the due date' },
                    { key: 'promise', label: 'Client promised a date', hint: 'Recorded for follow-up' },
                    { key: 'credit_note', label: 'Write off by credit note', hint: 'Numbered credit note, GST reversed' },
                  ] as const).map((o) => (
                    <button key={o.key} type="button" onClick={() => setHandling(o.key)}
                      className={`rounded-md border px-3 py-2 text-left ${handling === o.key ? 'border-safend-red bg-safend-red/5' : 'border-border'}`}>
                      <span className="block text-xs font-semibold">{o.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{o.hint}</span>
                    </button>
                  ))}
                </div>
                {handling === 'promise' && (
                  <div className="space-y-1 max-w-xs"><Label>Promised payment date *</Label>
                    <Input type="date" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} /></div>
                )}
                {handling === 'credit_note' && (
                  <div className="space-y-1"><Label>Reason for the credit note *</Label>
                    <Input value={creditNoteReason} onChange={(e) => setCreditNoteReason(e.target.value)} placeholder="e.g. Rate difference agreed with client" /></div>
                )}
              </div>
            )}

            {formError && (
              <p className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/20">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{formError}
              </p>
            )}
          </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-safend-red hover:bg-safend-red/90 text-white" disabled={!!formError || save.isPending}
            onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
            {save.isPending ? 'Recording…' : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
