/**
 * The invoice document model — one fully-resolved structure that both the screen
 * view and the PDF render, and that gets frozen onto the receivable at issue.
 *
 * WHY THIS EXISTS
 *
 * 1. Immutability. An invoice used to be recomputed from scratch on every print,
 *    and its previous balance was summed live from currently-open receivables.
 *    Reprinting an issued invoice therefore showed different figures than the
 *    client received, and any change to the calculation engine silently
 *    rewrote history. A document of record cannot behave like that: once
 *    issued, it is frozen here and reprints render the snapshot.
 *
 * 2. One layout source. The screen template and the PDF route each
 *    hand-implemented the same layout and had already drifted — the PDF showed
 *    IRN and honoured the RCM declaration, the screen did neither. Both now
 *    consume this model.
 *
 * 3. Separation of the tax invoice from the statement of account. `taxInvoice`
 *    holds only what Rule 46 requires and what GSTR-1 reports. `advice` holds
 *    TDS, receipts and previous dues. Nothing in `advice` can alter
 *    `taxInvoice.invoiceTotal`.
 */

import {
  computeInvoiceTotals,
  buildPaymentAdvice,
  amountInWords,
  INVOICE_LABELS,
  getInvoiceDeclaration,
  isEInvoiceRequired,
  DEFAULT_SAC_SECURITY,
  type InvoiceLineItem,
  type InvoiceTaxConfig,
  type ComputedInvoiceLine,
  type SacSummaryRow,
  type PreviousBalanceEntry,
  type PaymentAdvice,
  type TaxType,
  type InvoiceCopyType,
} from './calculations';
import { type RateBasis } from './rateBasis';

/** Bumped when the stored shape changes, so old snapshots stay readable. */
export const SNAPSHOT_VERSION = 1;

export interface SupplierIdentity {
  name: string;
  addressLine1: string;
  addressLine2: string;
  phone: string;
  email: string;
  gstin: string;
  state: string;
  /** Derived from the GSTIN when not supplied. Needed by clients claiming TDS credit. */
  pan?: string;
  cin?: string;
}

export interface RecipientIdentity {
  name: string;
  address: string;
  contact?: string;
  gstin: string;
  state: string;
}

export interface InvoiceMeta {
  invoiceNo: string;
  /** DD/MM/YYYY as printed. */
  date: string;
  dueDate?: string | null;
  placeOfSupply: string;
  workOrderNo?: string | null;
  workOrderDate?: string | null;
  servicePeriodStart?: string | null;
  servicePeriodEnd?: string | null;
  copyType?: InvoiceCopyType;
}

export interface EInvoiceDetails {
  required: boolean;
  irn?: string | null;
  qr?: string | null;
  ackNo?: string | null;
  ackDate?: string | null;
}

export interface BankDetails {
  bankName: string;
  bankAccountNo: string;
  ifscCode: string;
  accountName: string;
}

/** The statutory document. Everything here is reportable in GSTR-1. */
export interface TaxInvoiceSection {
  lines: ComputedInvoiceLine[];
  taxableValue: number;
  taxType: TaxType;
  gstRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  roundOff: number;
  /** The document value. Never reduced by TDS, receipts or previous dues. */
  invoiceTotal: number;
  invoiceTotalWords: string;
  sacSummary: SacSummaryRow[];
  totalDuties: number;
  totalPersonnel: number;
}

export interface InvoiceDocumentModel {
  version: number;
  issuedAt: string;
  supplier: SupplierIdentity;
  recipient: RecipientIdentity;
  meta: InvoiceMeta;
  taxInvoice: TaxInvoiceSection;
  /** Statement of account. NOT part of the tax invoice. */
  advice: PaymentAdvice & { totalPayableWords: string };
  bank: BankDetails;
  terms: string;
  declaration: string;
  eInvoice: EInvoiceDetails;
  /** Lines that could not be priced. Non-empty means the invoice must not issue. */
  blockedReasons: string[];
}

/** GSTIN layout: 2 state + 10 PAN + 1 entity + 1 'Z' + 1 checksum. */
export function panFromGstin(gstin?: string | null): string | undefined {
  const g = (gstin || '').trim().toUpperCase();
  if (g.length !== 15) return undefined;
  const pan = g.slice(2, 12);
  return /^[A-Z]{5}\d{4}[A-Z]$/.test(pan) ? pan : undefined;
}

export const SAFEND_SUPPLIER: SupplierIdentity = {
  name: 'Safend Secure Solutions Private Limited',
  addressLine1: 'Plot No - 548, Urali Gopalpur, Katak Sadar,',
  addressLine2: 'Katak, Odisha, India, 753011',
  phone: '9777023934',
  email: 'accounts@safends.com',
  gstin: '21ABDCS8727K1Z4',
  state: '21-Odisha',
};

export const SAFEND_BANK: BankDetails = {
  bankName: 'Axis Bank',
  bankAccountNo: '921020000544081',
  ifscCode: 'UTIB0000091',
  accountName: 'Safend Secure Solutions Private Limited',
};

/** Formats an ISO date range as "July 2026" (same month) or "July 2026 – August 2026" (span). */
export function formatServicePeriod(
  start?: string | null,
  end?: string | null
): string | null {
  const fmt = (d: string) => {
    const dt = new Date(d);
    return Number.isNaN(dt.getTime())
      ? null
      : dt.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  };
  const s = start ? fmt(start) : null;
  const e = end ? fmt(end) : null;
  if (s && e && s === e) return s;           // same month/year — show once
  if (s && e) return `${s} \u2013 ${e}`;    // different months — show range
  return s || e || null;
}

export interface BuildDocumentInput {
  supplier?: Partial<SupplierIdentity>;
  recipient: Partial<RecipientIdentity>;
  meta: InvoiceMeta;
  items: InvoiceLineItem[];
  taxConfig?: Partial<InvoiceTaxConfig>;
  previousEntries?: PreviousBalanceEntry[];
  bank?: Partial<BankDetails>;
  terms?: string;
  gstTreatment?: 'forward' | 'rcm' | 'exempt' | null;
  eInvoice?: Partial<Omit<EInvoiceDetails, 'required'>>;
}

/**
 * Computes the full document. Call once at issue and persist the result; do not
 * call again to re-render an issued invoice — use `readSnapshot` for that.
 */
export function buildInvoiceDocument(input: BuildDocumentInput): InvoiceDocumentModel {
  const supplier: SupplierIdentity = { ...SAFEND_SUPPLIER, ...input.supplier };
  supplier.pan = supplier.pan || panFromGstin(supplier.gstin);

  const recipient: RecipientIdentity = {
    name: '',
    address: '',
    gstin: '',
    state: '',
    ...input.recipient,
  };

  const totals = computeInvoiceTotals(input.items, input.taxConfig, {
    periodStart: input.meta.servicePeriodStart,
    invoiceDate: input.meta.date,
  });

  const advice = buildPaymentAdvice(
    totals,
    input.meta.invoiceNo,
    input.previousEntries ?? [],
    input.meta.dueDate
  );

  const blockedReasons = totals.blockedLines.map(
    (l) =>
      `"${l.service || 'Unnamed line'}" cannot be priced: rate basis is "fixed days" but no basis days are set on the work order.`
  );

  const eInvoiceRequired = isEInvoiceRequired(recipient.gstin);
  if (eInvoiceRequired && !(input.eInvoice?.irn || '').trim()) {
    blockedReasons.push(
      'e-Invoicing is enabled for this B2B supply, so an IRN must be obtained from the IRP before issue (Rule 48(4)).'
    );
  }

  return {
    version: SNAPSHOT_VERSION,
    issuedAt: new Date().toISOString(),
    supplier,
    recipient,
    meta: { copyType: 'recipient', ...input.meta },
    taxInvoice: {
      lines: totals.lines,
      taxableValue: totals.subTotal,
      taxType: totals.taxType,
      gstRate: totals.gstRate,
      cgstRate: totals.cgstRate,
      sgstRate: totals.sgstRate,
      igstRate: totals.igstRate,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      totalTax: totals.totalTax,
      roundOff: totals.roundOff,
      invoiceTotal: totals.invoiceTotal,
      invoiceTotalWords: amountInWords(totals.invoiceTotal),
      sacSummary: totals.sacSummary,
      totalDuties: totals.totalDuties,
      totalPersonnel: totals.totalPersonnel,
    },
    advice: { ...advice, totalPayableWords: amountInWords(advice.totalPayable) },
    bank: { ...SAFEND_BANK, ...input.bank },
    terms: input.terms || INVOICE_LABELS.defaultTerms,
    declaration: getInvoiceDeclaration(input.gstTreatment),
    eInvoice: {
      required: eInvoiceRequired,
      irn: input.eInvoice?.irn ?? null,
      qr: input.eInvoice?.qr ?? null,
      ackNo: input.eInvoice?.ackNo ?? null,
      ackDate: input.eInvoice?.ackDate ?? null,
    },
    blockedReasons,
  };
}

/** Reads a stored snapshot, or null when the row predates snapshotting. */
export function readSnapshot(raw: unknown): InvoiceDocumentModel | null {
  if (!raw || typeof raw !== 'object') return null;
  const snap = raw as Partial<InvoiceDocumentModel>;
  if (!snap.version || !snap.taxInvoice || !snap.meta) return null;
  return snap as InvoiceDocumentModel;
}

/**
 * Overlays the CURRENT letterhead (registered address + contact) onto a supplier
 * identity that came out of a stored snapshot.
 *
 * Snapshots freeze the whole document at issue time so tax figures can never
 * drift on a reprint. Our own registered address is issuer identity, not
 * transaction data, so when it is corrected the new address must appear on every
 * reprint and every PDF download — including invoices issued before the
 * correction, which would otherwise keep rendering the old address forever.
 *
 * Statutory identifiers (GSTIN / state / PAN / CIN) are deliberately left as
 * snapshotted: those are legally part of the issued document and must not be
 * rewritten retroactively.
 */
export function withCurrentSupplierLetterhead(
  supplier?: Partial<SupplierIdentity> | null
): SupplierIdentity {
  return {
    ...SAFEND_SUPPLIER,
    ...(supplier ?? {}),
    name: SAFEND_SUPPLIER.name,
    addressLine1: SAFEND_SUPPLIER.addressLine1,
    addressLine2: SAFEND_SUPPLIER.addressLine2,
    phone: SAFEND_SUPPLIER.phone,
    email: SAFEND_SUPPLIER.email,
  };
}

/**
 * Renders an issued invoice from its snapshot when one exists, otherwise
 * recomputes for rows issued before snapshotting existed. `fromSnapshot` tells
 * the caller which happened, so the UI can mark legacy documents.
 */
export function resolveInvoiceDocument(
  storedSnapshot: unknown,
  fallback: BuildDocumentInput
): { doc: InvoiceDocumentModel; fromSnapshot: boolean } {
  const snap = readSnapshot(storedSnapshot);
  if (snap) {
    // Keep every figure exactly as issued; refresh only the letterhead.
    return {
      doc: { ...snap, supplier: withCurrentSupplierLetterhead(snap.supplier) },
      fromSnapshot: true,
    };
  }
  return { doc: buildInvoiceDocument(fallback), fromSnapshot: false };
}

/** Ensures a line always carries a SAC — never silently defaults to security. */
export function requireSac(line: Pick<InvoiceLineItem, 'sac' | 'service'>): string | null {
  const sac = (line.sac || '').trim();
  if (sac) return null;
  return `"${line.service || 'Unnamed line'}" has no SAC code. Set it explicitly — it must not fall back to ${DEFAULT_SAC_SECURITY} (private security services), which would misclassify the supply.`;
}

export { type RateBasis };
