'use client';

/**
 * Invoice viewer.
 *
 * This used to be a 560-line hand-built layout with inline-editable inputs
 * scattered through the printed document — a second, drifting copy of the layout
 * the PDF route also implemented, and an editing surface whose edits were never
 * persisted anywhere.
 *
 * It is now a thin shell: it resolves the document (snapshot when the invoice was
 * issued with one, recomputed otherwise), then hands it to <InvoiceDocument/>,
 * which owns the layout. Editing belongs in OneTimeInvoiceForm, which is the
 * actual entry point and does persist.
 */

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, X, AlertTriangle } from 'lucide-react';
import { supabaseClient } from '@/integrations/supabase/client';
import {
  INVOICE_LABELS,
  type InvoiceLineItem,
  type PreviousBalanceEntry,
  type InvoiceCopyType,
} from '@/lib/invoice/calculations';
import {
  resolveInvoiceDocument,
  SAFEND_BANK,
  SAFEND_SUPPLIER,
  type BuildDocumentInput,
} from '@/lib/invoice/document';
import { InvoiceDocument } from './invoice/InvoiceDocument';

export interface PaymentRecord {
  id: string;
  amount: number;
  mode: string;
  received_by: string | null;
  cheque_number: string | null;
  cheque_date: string | null;
  bank_account_id: string | null;
  transaction_number: string | null;
  transaction_datetime: string | null;
  is_partial: boolean;
  balance_amount: number;
  balance_handling: string | null;
  balance_due_date: string | null;
  notes: string | null;
  created_at: string;
}

/** Line item as supplied by callers — same shape as before, plus rate basis. */
export interface InvoiceItem extends InvoiceLineItem {
  id: number | string;
  gstRate: number;
}

export interface InvoiceData {
  companyInfo?: Partial<{
    name: string; addressLine1: string; addressLine2: string; phone: string;
    email: string; tagline: string; gstin: string; state: string; pan: string; cin: string;
  }>;
  invoiceDetails?: Partial<{
    invoiceNo: string; date: string; dueDate: string; placeOfSupply: string;
    workOrderNo: string; workOrderDate: string;
    irn: string; irnQr: string; irnAckNo: string; irnAckDate: string;
    servicePeriodStart: string; servicePeriodEnd: string;
    copyType: InvoiceCopyType;
  }>;
  clientInfo?: Partial<{ name: string; address: string; contact: string; gstin: string; state: string }>;
  items?: InvoiceItem[];
  taxConfig?: Partial<{
    gstRate: number; taxType: 'intra' | 'inter' | 'exempt';
    sgstRate: number; cgstRate: number; igstRate: number;
    tdsRate: number; received: number; previousBalance: number; ratePrecision: number;
  }>;
  /** Itemised previous outstanding, printed on the payment advice. */
  previousEntries?: PreviousBalanceEntry[];
  paymentDetails?: Partial<{
    bankName: string; bankAccountNo: string; ifscCode: string; accountName: string; terms: string;
  }>;
  invoiceStatus?: string;
  receivableId?: string;
  payments?: PaymentRecord[];
  gstTreatment?: 'forward' | 'rcm' | 'exempt' | null;
  /** Frozen document from receivables.invoice_snapshot. Rendered verbatim when present. */
  snapshot?: unknown;
}

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

  const { doc, fromSnapshot } = useMemo(() => {
    const d = initialData ?? {};
    const meta = d.invoiceDetails ?? {};

    const fallback: BuildDocumentInput = {
      supplier: { ...SAFEND_SUPPLIER, ...d.companyInfo },
      recipient: d.clientInfo ?? {},
      meta: {
        invoiceNo: meta.invoiceNo ?? '',
        date:
          meta.date ??
          new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        dueDate: meta.dueDate ?? null,
        placeOfSupply: meta.placeOfSupply ?? SAFEND_SUPPLIER.state,
        workOrderNo: meta.workOrderNo ?? null,
        workOrderDate: meta.workOrderDate ?? null,
        servicePeriodStart: meta.servicePeriodStart ?? null,
        servicePeriodEnd: meta.servicePeriodEnd ?? null,
        copyType,
      },
      items: (d.items ?? []) as InvoiceLineItem[],
      taxConfig: d.taxConfig,
      previousEntries: d.previousEntries,
      bank: { ...bank, ...d.paymentDetails },
      terms: d.paymentDetails?.terms || INVOICE_LABELS.defaultTerms,
      gstTreatment: d.gstTreatment,
      eInvoice: {
        irn: meta.irn ?? null,
        qr: meta.irnQr ?? null,
        ackNo: meta.irnAckNo ?? null,
        ackDate: meta.irnAckDate ?? null,
      },
    };

    return resolveInvoiceDocument(d.snapshot, fallback);
  }, [initialData, bank, copyType]);

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
                This invoice is not ready to issue
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

      <InvoiceDocument doc={doc} copyType={copyType} recomputed={!fromSnapshot} />
    </div>
  );
}

export default InvoiceGenerator;
