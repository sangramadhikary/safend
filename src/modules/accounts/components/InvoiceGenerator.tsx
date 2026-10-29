'use client';

/**
 * Invoice viewer.
 *
 * This used to be a 560-line hand-built layout with inline-editable inputs
 * scattered through the printed document — a second, drifting copy of the layout
 * the PDF route also implemented, and an editing surface whose edits were never
 * persisted anywhere.
 *
 * It is now a thin shell: it resolves the document with documentFromViewData,
 * the same builder the PDF route uses (snapshot when the invoice was issued
 * with one, the recorded figures otherwise), then hands it to
 * <InvoiceDocument/>, which owns the layout. Build `initialData` with
 * buildInvoiceViewData(row, payments, carried, { original }) — `original` is
 * the original invoice of a credit/debit note. Editing belongs in
 * OneTimeInvoiceForm, which is the actual entry point and does persist.
 */

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, X, AlertTriangle } from 'lucide-react';
import { supabaseClient } from '@/integrations/supabase/client';
import { type InvoiceCopyType } from '@/lib/invoice/calculations';
import { SAFEND_BANK } from '@/lib/invoice/document';
import { documentFromViewData, type InvoiceData } from '@/lib/invoice/document-input';
import { InvoiceDocument } from './invoice/InvoiceDocument';

// The input types live with the shared builder so the PDF route uses the same
// ones; re-exported here for existing imports.
export type { InvoiceData, InvoiceItem, PaymentRecord } from '@/lib/invoice/document-input';

interface InvoiceGeneratorProps {
  onClose?: () => void;
  initialData?: InvoiceData;
  /** Retained for API compatibility; the document is always read-only now. */
  readOnly?: boolean;
}

export function InvoiceGenerator({ onClose, initialData }: InvoiceGeneratorProps) {
  const [bank, setBank] = useState(SAFEND_BANK);
  const [copyType, setCopyType] = useState<InvoiceCopyType>(
    initialData?.invoiceDetails?.copyType ?? 'recipient'
  );

  // Bank details come from the active bank account unless the caller supplied them.
  useEffect(() => {
    if (initialData?.paymentDetails?.bankAccountNo) return;
    (async () => {
      try {
        const { data } = await supabaseClient
          .from('bank_accounts')
          .select('account_name, account_number, bank_name, ifsc_code')
          .eq('status', 'active')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (data) {
          setBank((prev) => ({
            bankName: data.bank_name || prev.bankName,
            bankAccountNo: data.account_number || prev.bankAccountNo,
            ifscCode: data.ifsc_code || prev.ifscCode,
            accountName: data.account_name || prev.accountName,
          }));
        }
      } catch {
        /* bank_accounts may not exist */
      }
    })();
  }, [initialData?.paymentDetails?.bankAccountNo]);

  // Same builder as the PDF route, so the screen and the download match.
  const { doc, recomputed } = useMemo(
    () => documentFromViewData(initialData ?? {}, { bank, copyType }),
    [initialData, bank, copyType]
  );

  return (
    <div className="min-h-screen bg-neutral-100 py-6 dark:bg-neutral-950 print:bg-white print:py-0">
      {/* Toolbar — never printed */}
      <div className="mx-auto mb-4 flex w-[210mm] items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => window.print()} className="gap-1.5">
            <Printer className="h-4 w-4" /> Print / Save PDF
          </Button>
          {/* Rule 48(1) copies — the supplier keeps the duplicate. */}
          <div className="flex overflow-hidden rounded-md border border-neutral-300">
            {(['recipient', 'supplier'] as InvoiceCopyType[]).map((c) => (
              <button
                key={c}
                onClick={() => setCopyType(c)}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  copyType === c ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {c === 'recipient' ? 'Original' : 'Duplicate'}
              </button>
            ))}
          </div>
        </div>
        {onClose && (
          <Button size="sm" variant="ghost" onClick={onClose} className="gap-1.5">
            <X className="h-4 w-4" /> Close
          </Button>
        )}
      </div>

      {/* Anything that would make the document non-compliant is surfaced here
          rather than being silently printed onto a statutory record. */}
      {doc.blockedReasons.length > 0 && (
        <div className="mx-auto mb-4 w-[210mm] rounded-lg border border-amber-300 bg-amber-50 p-4 print:hidden">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-sm">
              <p className="font-semibold text-amber-800">
                This {doc.documentType === 'credit_note' ? 'credit note' : doc.documentType === 'debit_note' ? 'debit note' : 'invoice'} is not ready to issue
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-700">
                {doc.blockedReasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {doc.notices.length > 0 && (
        <div className="mx-auto mb-4 w-[210mm] rounded-lg border border-amber-300 bg-amber-50 p-4 print:hidden">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <ul className="space-y-0.5 text-sm text-amber-800">
              {doc.notices.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <InvoiceDocument doc={doc} copyType={copyType} recomputed={recomputed} />
    </div>
  );
}

export default InvoiceGenerator;
