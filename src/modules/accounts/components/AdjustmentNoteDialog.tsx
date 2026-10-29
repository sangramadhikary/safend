'use client';

/**
 * Raise a credit or debit note against a tax invoice (CGST s.34, Rule 53).
 *
 * The note is numbered (CN/… or DN/…) and created by create_adjustment_note,
 * which takes GST at the original invoice's rate, links the note to it, and
 * either applies a credit note against the invoice (its balance drops) or
 * raises a debit note as its own receivable on the same work order.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileMinus2, FilePlus2, Loader2, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabaseClient } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logChange } from '@/utils/auditLog';
import { amountDue, round2, type LedgerRow } from '@/lib/invoice/ledger';
import { createAdjustmentNote } from '@/services/invoiceLedgerService';

type NoteType = 'credit' | 'debit';

export type NoteInvoice = LedgerRow & {
  id: string;
  client_name: string | null;
  created_at?: string | null;
  gst_amount?: number | string | null;
  issued_at?: string | null;
};

interface AdjustmentNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Invoice to adjust, when opened from an invoice row. */
  invoice?: NoteInvoice | null;
  onCreated: () => void;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const istDatePlus = (days: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + days * 86_400_000));
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** GST rate of the original invoice, as the database computes it (2 decimals). */
function invoiceGstRate(inv: NoteInvoice): number {
  const taxable = Number(inv.amount) || 0;
  const gst = Number(inv.gst_amount) || 0;
  return taxable > 0 && gst > 0 ? round2((gst / taxable) * 100) : 0;
}

const isDraft = (r: NoteInvoice) => r.status === 'created' && !r.issued_at && !(Number(r.paid_amount) > 0);

export function AdjustmentNoteDialog({ open, onOpenChange, invoice = null, onCreated }: AdjustmentNoteDialogProps) {
  if (!open) return null;
  // Keyed so each opening starts from a clean form.
  return <AdjustmentNoteForm key={invoice?.id ?? 'pick'} invoice={invoice} onClose={() => onOpenChange(false)} onCreated={onCreated} />;
}

function AdjustmentNoteForm({ invoice, onClose, onCreated }: { invoice: NoteInvoice | null; onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [type, setType] = useState<NoteType>('credit');
  const [selectedId, setSelectedId] = useState<string | null>(invoice?.id ?? null);
  const [search, setSearch] = useState('');
  const [taxable, setTaxable] = useState('');
  const [reason, setReason] = useState('');
  const [dueDate, setDueDate] = useState(istDatePlus(7));

  // Issued, not cancelled invoices (drafts are edited instead of noted).
  const { data: invoices = [], isLoading } = useQuery<NoteInvoice[]>({
    queryKey: ['adjustment-note-invoices'],
    enabled: !invoice,
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('receivables')
        .select('id, reference_number, client_name, created_at, issued_at, status, category, amount, gst_amount, total_amount, opening_balance, paid_amount, work_order_id')
        .eq('category', 'Invoices')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as NoteInvoice[]).filter((r) => !isDraft(r));
    },
  });

  const selected = invoice ?? invoices.find((r) => r.id === selectedId) ?? null;
  const matches = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = s
      ? invoices.filter((r) => (r.reference_number ?? '').toLowerCase().includes(s) || (r.client_name ?? '').toLowerCase().includes(s))
      : invoices;
    return list.slice(0, 50);
  }, [invoices, search]);

  const rate = selected ? invoiceGstRate(selected) : 0;
  const taxableValue = round2(parseFloat(taxable) || 0);
  const gst = round2((taxableValue * rate) / 100);
  const total = round2(taxableValue + gst);
  const due = selected ? amountDue(selected) : 0;

  // The same checks create_adjustment_note applies, shown before saving.
  const formError = (() => {
    if (!selected) return 'Select the tax invoice this note adjusts.';
    if (taxableValue <= 0) return 'Enter the taxable value (before GST).';
    if (!reason.trim()) return 'Enter the reason for the note.';
    if (type === 'credit' && due <= 0.01) {
      return `Invoice ${selected.reference_number} is fully paid, so a credit note would mean a refund. Record the refund separately.`;
    }
    if (type === 'credit' && total > due + 0.005) {
      return `The credit note (${inr(total)} with GST) is more than invoice ${selected.reference_number} still owes (${inr(due)}).`;
    }
    if (type === 'debit' && !dueDate) return 'Enter when the extra amount is due.';
    return null;
  })();

  const save = useMutation({
    mutationFn: async () => {
      if (!selected || formError) throw new Error(formError ?? 'Select an invoice.');
      const note = await createAdjustmentNote({
        against_id: selected.id, type, taxable_value: taxableValue, reason: reason.trim(),
        due_date: type === 'debit' ? dueDate : null,
      });
      void logChange({
        action: 'accounts.invoice.adjustment',
        target: note.reference_number,
        entityType: 'receivables',
        entityId: note.id,
        entityLabel: `${note.reference_number} — ${selected.client_name ?? 'Unknown client'}`,
        severity: 'notice',
        before: { invoiceDue: due },
        after: { noteValue: Number(note.total_amount) },
        details: { type, againstInvoice: selected.reference_number, taxableValue, gstRate: rate, gst, reason: reason.trim() },
        logUnchanged: true,
      });
      return note;
    },
    onSuccess: (note) => {
      toast({
        title: type === 'credit' ? `Credit note ${note.reference_number} raised` : `Debit note ${note.reference_number} raised`,
        description: type === 'credit'
          ? `${inr(total)} credited against invoice ${selected?.reference_number}. It now owes ${inr(Math.max(0, round2(due - total)))}.`
          : `${inr(total)} is due by ${fmtDate(dueDate)} on the same work order as invoice ${selected?.reference_number}.`,
      });
      onCreated();
      onClose();
    },
    onError: (err: any) => toast({ title: 'Note not raised', description: err?.message, variant: 'destructive' }),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Credit / Debit Note</DialogTitle>
          <DialogDescription>
            Numbered in sequence and linked to the original tax invoice. GST is charged at that invoice&apos;s rate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Type */}
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Note type">
            {([
              { key: 'credit', label: 'Credit note', hint: 'Client owes less', icon: FileMinus2 },
              { key: 'debit', label: 'Debit note', hint: 'Client owes more', icon: FilePlus2 },
            ] as const).map((o) => (
              <button key={o.key} type="button" role="radio" aria-checked={type === o.key} onClick={() => setType(o.key)}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${type === o.key
                  ? 'border-safend-red bg-safend-red/5 dark:bg-safend-red/10' : 'border-border hover:bg-muted/50'}`}>
                <o.icon className={`h-5 w-5 shrink-0 ${type === o.key ? 'text-safend-red' : 'text-muted-foreground'}`} />
                <span>
                  <span className="block text-sm font-semibold">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">{o.hint}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Original invoice */}
          <div className="space-y-2">
            <Label>Original tax invoice *</Label>
            {selected ? (
              <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="space-y-0.5">
                  <p className="font-semibold">{selected.reference_number} <span className="font-normal text-muted-foreground">· {fmtDate(selected.created_at)}</span></p>
                  <p className="text-muted-foreground">{selected.client_name || 'Unknown client'}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Value {inr(Number(selected.total_amount) || 0)} · Still due {inr(due)} · GST {rate}%
                  </p>
                </div>
                {!invoice && <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedId(null)}>Change</Button>}
              </div>
            ) : (
              <div className="rounded-lg border">
                <div className="relative border-b">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by invoice number or client"
                    className="border-0 pl-8 shadow-none focus-visible:ring-0" />
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {isLoading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
                  {!isLoading && matches.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No issued invoice matches.</p>}
                  {matches.map((r) => (
                    <button key={r.id} type="button" onClick={() => setSelectedId(r.id)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60">
                      <span className="min-w-0">
                        <span className="font-medium">{r.reference_number}</span>
                        <span className="ml-2 truncate text-muted-foreground">{r.client_name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fmtDate(r.created_at)} · due {inr(amountDue(r))}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Amount and reason */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="note-taxable">Taxable value (before GST) *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                <Input id="note-taxable" type="number" min="0" step="0.01" inputMode="decimal" className="pl-7 tabular-nums"
                  value={taxable} onChange={(e) => setTaxable(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
              </div>
            </div>
            {type === 'debit' && (
              <div className="space-y-1">
                <Label htmlFor="note-due">Due by *</Label>
                <Input id="note-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="note-reason">Reason *</Label>
            <Textarea id="note-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder={type === 'credit' ? 'e.g. Short deployment on 12 and 13 Oct, rate difference agreed' : 'e.g. Extra guards on 20 Oct, overtime'} />
          </div>

          {/* Preview */}
          <div className="rounded-lg border bg-muted/30 p-3 text-sm tabular-nums">
            <div className="flex justify-between"><span className="text-muted-foreground">Taxable value</span><span>{inr(taxableValue)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">GST @ {rate}%</span><span>{inr(gst)}</span></div>
            <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
              <span>{type === 'credit' ? 'Credit note value' : 'Debit note value'}</span><span>{inr(total)}</span>
            </div>
            {selected && type === 'credit' && taxableValue > 0 && !formError && (
              <p className="mt-1 text-xs text-muted-foreground">Invoice {selected.reference_number} will then owe {inr(Math.max(0, round2(due - total)))}.</p>
            )}
          </div>

          {formError && (taxable !== '' || reason !== '' || (!!selected && type === 'credit' && due <= 0.01)) && (
            <p className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{formError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-safend-red text-white hover:bg-safend-red/90" disabled={!!formError || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {type === 'credit' ? 'Raise credit note' : 'Raise debit note'}{total > 0 ? ` · ${inr(total)}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
