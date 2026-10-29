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
 *    holds only what Rule 46 requires and what GSTR-1 reports. `statement`
 *    holds receipts, TDS and previous dues, is computed live from the ledger
 *    on every render and is never frozen. Nothing in it can alter
 *    `taxInvoice.invoiceTotal`.
 *
 * 4. Recorded figures win. When `stored` is given (the receivable's amount,
 *    gst_amount and total_amount), those are printed; the lines describe them.
 */

import {
  computeInvoiceTotals,
  buildPaymentAdvice,
  amountInWords,
  formatMoney,
  INVOICE_LABELS,
  getInvoiceDeclaration,
  isEInvoiceRequired,
  DEFAULT_SAC_SECURITY,
  type InvoiceLineItem,
  type InvoiceTaxConfig,
  type InvoiceTotals,
  type ComputedInvoiceLine,
  type SacSummaryRow,
  type PreviousBalanceEntry,
  type PaymentAdvice,
  type TaxType,
  type InvoiceCopyType,
} from './calculations';
import { fromPaise, round2, toPaise } from './ledger';
import { type RateBasis } from './rateBasis';

/** Bumped when the stored shape changes, so old snapshots stay readable. */
export const SNAPSHOT_VERSION = 2;

/** Wording shared by the screen view and the PDF. */
export const DOCUMENT_LABELS = {
  statementHead: 'STATEMENT OF ACCOUNT',
  linesRoundOff: 'Round off',
  linesDiffer:
    'Line amounts are recomputed from the recorded rates. The taxable value, tax and invoice value are as recorded.',
  importedLineNote: 'Imported from the previous billing system; amounts as issued there',
  importedTaxableLabel: 'Amount as issued',
  importedTaxNote: 'GST as charged in the previous billing system',
  cancelled: 'CANCELLED',
  recomputedLegacy: 'Recomputed \u2014 issued before snapshotting',
  recomputedLines: 'Recomputed \u2014 lines differ from the recorded figures',
};

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

/** Extra fields a line can carry into the document. */
export interface DocumentLineExtras {
  /** Line amount as recorded on the receivable (line_items[].amount). */
  storedAmount?: number | null;
  /** Prints only an amount (imported invoices, lines without a rate). */
  lumpSum?: boolean;
  /** Small print under the service name. */
  note?: string | null;
}

export type DocumentLineInput = InvoiceLineItem & DocumentLineExtras;

export interface DocumentLine extends ComputedInvoiceLine, DocumentLineExtras {}

/** The statutory document. Everything here is reportable in GSTR-1. */
export interface TaxInvoiceSection {
  lines: DocumentLine[];
  /** Sum of the printed line amounts. */
  linesTotal: number;
  /** "Round off" row that closes the lines onto the taxable value; 0 when not needed. */
  linesRoundOff: number;
  /** False when the lines differ from the recorded taxable value by more than ₹1. */
  linesReconciled: boolean;
  /** Label of the taxable-value row when it is not "Taxable Value". */
  taxableLabel?: string | null;
  /** Printed instead of the GST rows when set (imported invoices). */
  taxNote?: string | null;
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

/** One row of the statement of account. */
export interface StatementRow {
  key: string;
  label: string;
  /** Amount column; null leaves it blank. */
  amount: number | null;
  /** Printed with a minus sign. */
  less?: boolean;
  /** Small print under the label. */
  note?: string | null;
  /** entry = an older invoice (indented); subtotal and balance are emphasised. */
  kind?: 'line' | 'entry' | 'subtotal' | 'balance';
}

export interface StatementFigures {
  invoiceTotal: number;
  openingBalance: number;
  cashReceived: number;
  tdsCredited: number;
  creditNotes: number;
  /** total_amount + opening_balance − paid_amount (negative when overpaid). */
  balance: number;
  /** What is still owed on this invoice (never negative; 0 when paid or cancelled). */
  amountDue: number;
  /** Live balances of the older invoices listed on this one. */
  olderTotal: number;
  /** TDS the client is expected to withhold from this invoice's payment. */
  tdsToDeduct: number;
  totalPayable: number;
}

/**
 * Statement of account printed under the tax invoice. Built from the ledger at
 * render time and never frozen, so receipts after issue always show.
 */
export interface StatementOfAccount {
  /** DD/MM/YYYY in Asia/Kolkata. */
  asOf: string;
  dueDate: string | null;
  state: 'open' | 'paid' | 'cancelled';
  /** Status chip next to the heading, e.g. "Paid in full". */
  badge: string | null;
  rows: StatementRow[];
  /** Bottom line. amount null prints the label alone (PAID IN FULL, CANCELLED). */
  total: { label: string; amount: number | null; words: string | null };
  /** Display-only interest; never included in the total. */
  interest: { label: string; amount: number; note: string } | null;
  /** Plain-text remark under the rows, e.g. the cancellation reason. */
  remark: string | null;
  /** False when the statement would only restate the invoice value. */
  show: boolean;
  figures: StatementFigures;
}

export interface InvoiceDocumentModel {
  version: number;
  issuedAt: string;
  supplier: SupplierIdentity;
  recipient: RecipientIdentity;
  meta: InvoiceMeta;
  taxInvoice: TaxInvoiceSection;
  /** Statement of account. NOT part of the tax invoice; always live. */
  statement: StatementOfAccount;
  bank: BankDetails;
  terms: string;
  declaration: string;
  eInvoice: EInvoiceDetails;
  /** Lines that could not be priced. Non-empty means the invoice must not issue. */
  blockedReasons: string[];
  /** Screen-only warnings, e.g. lines that do not add up to the recorded figures. */
  notices: string[];
}

/** What is frozen onto receivables.invoice_snapshot at first issue. */
export type InvoiceSnapshot = Omit<InvoiceDocumentModel, 'statement' | 'notices'>;

/** The receivable's recorded (legal) figures. */
export interface StoredInvoiceFigures {
  taxableValue: number;
  gstAmount: number;
  invoiceTotal: number;
  taxType: TaxType;
  /** Total GST rate in %, for the printed head labels. */
  gstRate: number;
  /** Imported from the previous billing system: no GST is added on top. */
  imported?: boolean;
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
    // Date-only values parse as UTC midnight; format them in UTC so the server
    // and every browser print the same month.
    const timeZone = /^\d{4}-\d{2}-\d{2}$/.test(String(d).trim()) ? 'UTC' : 'Asia/Kolkata';
    return Number.isNaN(dt.getTime())
      ? null
      : dt.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone });
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
  items: DocumentLineInput[];
  taxConfig?: Partial<InvoiceTaxConfig>;
  previousEntries?: PreviousBalanceEntry[];
  bank?: Partial<BankDetails>;
  terms?: string;
  gstTreatment?: 'forward' | 'rcm' | 'exempt' | null;
  eInvoice?: Partial<Omit<EInvoiceDetails, 'required'>>;
  /** Recorded figures of the receivable. When set they are printed instead of the line totals. */
  stored?: StoredInvoiceFigures | null;
  /** Live statement of account. When absent one is derived from taxConfig (older callers). */
  statement?: StatementOfAccount | null;
}

/** Lump-sum lines keep their recorded amount; the engine cannot price them. */
function finishLines(lines: DocumentLine[]): DocumentLine[] {
  return lines.map((l) =>
    l.lumpSum
      ? { ...l, amount: round2(l.storedAmount), rate: 0, rateDerivation: '', overBasis: false, blocked: false }
      : l
  );
}

/** Splits recorded GST (paise) into its heads. CGST takes the odd paisa. */
function splitGst(gstP: number, taxType: TaxType): { cgst: number; sgst: number; igst: number } {
  if (taxType === 'inter') return { cgst: 0, sgst: 0, igst: gstP };
  if (taxType === 'intra') {
    const cgst = Math.round(gstP / 2);
    return { cgst, sgst: gstP - cgst, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: 0 };
}

/**
 * SAC-wise summary that adds up to the recorded figures: the recorded taxable
 * value and each tax head are shared across SAC groups in proportion to the
 * line amounts, and the largest group absorbs the rounding.
 */
function allocateSacSummary(
  lines: DocumentLine[],
  taxableP: number,
  heads: { cgst: number; sgst: number; igst: number },
  gstRate: number
): SacSummaryRow[] {
  const weights = new Map<string, number>();
  for (const line of lines) {
    if (line.blocked) continue;
    const sac = (line.sac || '').trim() || 'Unclassified';
    weights.set(sac, (weights.get(sac) ?? 0) + Math.max(0, toPaise(line.amount)));
  }
  const sacs = [...weights.keys()];
  if (sacs.length === 0) return [];
  const w = sacs.map((s) => weights.get(s) ?? 0);
  const totalW = w.reduce((a, b) => a + b, 0);
  const largest = w.indexOf(Math.max(...w));
  const share = (amountP: number) => {
    const parts = w.map((x) => (totalW > 0 ? Math.round((amountP * x) / totalW) : 0));
    parts[largest] += amountP - parts.reduce((a, b) => a + b, 0);
    return parts;
  };
  const taxable = share(taxableP);
  const cgst = share(heads.cgst);
  const sgst = share(heads.sgst);
  const igst = share(heads.igst);
  return sacs.map((sac, i) => ({
    sac,
    taxableValue: fromPaise(taxable[i]),
    gstRate,
    cgst: fromPaise(cgst[i]),
    sgst: fromPaise(sgst[i]),
    igst: fromPaise(igst[i]),
    totalTax: fromPaise(cgst[i] + sgst[i] + igst[i]),
  }));
}

/** Figures straight from the calculation engine (no recorded figures supplied). */
function taxInvoiceFromEngine(totals: InvoiceTotals, lines: DocumentLine[]): TaxInvoiceSection {
  return {
    lines,
    linesTotal: totals.subTotal,
    linesRoundOff: 0,
    linesReconciled: true,
    taxableLabel: null,
    taxNote: null,
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
  };
}

/**
 * Tax invoice from the recorded figures. The lines describe them: when they
 * differ from the recorded taxable value by up to ₹1 a "Round off" row closes
 * the gap; beyond that the recorded figures still print and the lines are
 * flagged as not reconciled.
 */
function taxInvoiceFromStored(
  totals: InvoiceTotals,
  lines: DocumentLine[],
  stored: StoredInvoiceFigures
): TaxInvoiceSection {
  const linesP = lines.reduce((s, l) => s + toPaise(l.amount), 0);
  const taxableP = toPaise(stored.taxableValue);
  const taxType: TaxType = stored.imported ? 'exempt' : stored.taxType;
  const gstP = taxType === 'exempt' ? 0 : toPaise(stored.gstAmount);
  const totalP = toPaise(stored.invoiceTotal);
  const diffP = taxableP - linesP;
  const reconciled = Math.abs(diffP) <= 100;
  const rate = taxType === 'exempt' ? 0 : Number(stored.gstRate) || 0;
  const heads = splitGst(gstP, taxType);
  return {
    lines,
    linesTotal: fromPaise(linesP),
    linesRoundOff: reconciled ? fromPaise(diffP) : 0,
    linesReconciled: reconciled,
    taxableLabel: stored.imported ? DOCUMENT_LABELS.importedTaxableLabel : null,
    taxNote: stored.imported ? DOCUMENT_LABELS.importedTaxNote : null,
    taxableValue: fromPaise(taxableP),
    taxType,
    gstRate: rate,
    cgstRate: taxType === 'intra' ? rate / 2 : 0,
    sgstRate: taxType === 'intra' ? rate / 2 : 0,
    igstRate: taxType === 'inter' ? rate : 0,
    cgst: fromPaise(heads.cgst),
    sgst: fromPaise(heads.sgst),
    igst: fromPaise(heads.igst),
    totalTax: fromPaise(gstP),
    roundOff: fromPaise(totalP - taxableP - gstP),
    invoiceTotal: fromPaise(totalP),
    invoiceTotalWords: totalP < 0 ? `Minus ${amountInWords(fromPaise(-totalP))}` : amountInWords(fromPaise(totalP)),
    sacSummary: allocateSacSummary(lines, taxableP, heads, rate),
    totalDuties: totals.totalDuties,
    totalPersonnel: totals.totalPersonnel,
  };
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

  const lines = finishLines(totals.lines as DocumentLine[]);
  const taxInvoice = input.stored
    ? taxInvoiceFromStored(totals, lines, input.stored)
    : taxInvoiceFromEngine(totals, lines);
  const statement =
    input.statement ??
    statementFromAdvice(
      buildPaymentAdvice(totals, input.meta.invoiceNo, input.previousEntries ?? [], input.meta.dueDate)
    );

  const blockedReasons = lines.filter((l) => l.blocked).map(
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
    taxInvoice,
    statement,
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
    notices: documentNotices(taxInvoice),
  };
}

/**
 * Statement for callers that pass only taxConfig and no ledger rows: the old
 * payment advice, expressed as statement rows.
 */
export function statementFromAdvice(advice: PaymentAdvice): StatementOfAccount {
  const L = INVOICE_LABELS;
  const entries = advice.previousEntries ?? [];
  const rows: StatementRow[] = [
    { key: 'invoice', label: `This invoice (${advice.invoiceNo})`, amount: advice.invoiceTotal },
  ];
  if (advice.tds > 0) {
    rows.push({ key: 'tds-due', label: `Less: TDS @ ${advice.tdsRate}% u/s 194C`, amount: advice.tds, less: true, note: L.tdsNote });
  }
  if (advice.received > 0) {
    rows.push({ key: 'cash', label: `Less: ${L.amountReceived}`, amount: advice.received, less: true });
  }
  if (advice.previousBalance !== 0) {
    rows.push({ key: 'older', label: 'Previous outstanding', amount: entries.length ? null : advice.previousBalance });
    entries.forEach((e, i) => {
      rows.push({ key: `older-${i}-${e.referenceNumber}`, label: `${e.referenceNumber}${e.date ? ` \u00B7 ${e.date}` : ''}`, amount: e.amount, kind: 'entry' });
    });
    if (entries.length) rows.push({ key: 'older-total', label: 'Sub-total', amount: advice.previousBalance, kind: 'subtotal' });
  }
  const due = round2(advice.invoiceTotal - advice.received);
  return {
    asOf: '',
    dueDate: advice.dueDate ?? null,
    state: 'open',
    badge: null,
    rows,
    total: { label: L.amountDue, amount: advice.totalPayable, words: amountInWords(advice.totalPayable) },
    interest: null,
    remark: null,
    show: advice.tds > 0 || advice.received > 0 || advice.previousBalance > 0,
    figures: {
      invoiceTotal: advice.invoiceTotal, openingBalance: 0, cashReceived: advice.received, tdsCredited: 0,
      creditNotes: 0, balance: due, amountDue: Math.max(0, due), olderTotal: advice.previousBalance,
      tdsToDeduct: advice.tds, totalPayable: advice.totalPayable,
    },
  };
}

/** Screen-only warnings derived from the tax invoice. */
function documentNotices(ti: TaxInvoiceSection): string[] {
  if (ti.linesReconciled) return [];
  return [
    `The line items add up to ${formatMoney(ti.linesTotal)} but the recorded taxable value is ${formatMoney(ti.taxableValue)}. ` +
      'The recorded figures are printed; correct the lines before issuing if they are wrong.',
  ];
}

/** Reads a stored snapshot, or null when the row predates snapshotting. */
export function readSnapshot(raw: unknown): InvoiceSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const snap = raw as Partial<InvoiceSnapshot>;
  if (!snap.version || !snap.taxInvoice || !snap.meta || !Array.isArray(snap.taxInvoice.lines)) return null;
  const ti = snap.taxInvoice;
  // Version 1 had no line reconciliation fields.
  const taxInvoice: TaxInvoiceSection = {
    ...ti,
    linesTotal: ti.linesTotal ?? ti.taxableValue,
    linesRoundOff: ti.linesRoundOff ?? 0,
    linesReconciled: ti.linesReconciled ?? true,
  };
  return { ...(snap as InvoiceSnapshot), taxInvoice, blockedReasons: snap.blockedReasons ?? [] };
}

/** The frozen copy written to receivables.invoice_snapshot: everything but the live statement. */
export function snapshotOf(doc: InvoiceDocumentModel, issuedAt: string): InvoiceSnapshot {
  const { statement: _statement, notices: _notices, ...frozen } = doc;
  // Round-trip through JSON so only plain data is stored.
  return JSON.parse(JSON.stringify({ ...frozen, version: SNAPSHOT_VERSION, issuedAt }));
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
 * builds it from the fallback input. The statement of account is always the
 * live one from the fallback. `fromSnapshot` tells the caller which happened,
 * so the UI can mark legacy documents.
 */
export function resolveInvoiceDocument(
  storedSnapshot: unknown,
  fallback: BuildDocumentInput
): { doc: InvoiceDocumentModel; fromSnapshot: boolean } {
  const live = buildInvoiceDocument(fallback);
  const snap = readSnapshot(storedSnapshot);
  if (snap) {
    // Keep every tax-invoice figure exactly as issued; refresh only the
    // letterhead, and show today's statement of account.
    return {
      doc: {
        ...snap,
        meta: { ...snap.meta, copyType: fallback.meta.copyType ?? snap.meta.copyType },
        supplier: withCurrentSupplierLetterhead(snap.supplier),
        statement: live.statement,
        notices: documentNotices(snap.taxInvoice),
      },
      fromSnapshot: true,
    };
  }
  return { doc: live, fromSnapshot: false };
}

/** Ensures a line always carries a SAC — never silently defaults to security. */
export function requireSac(line: Pick<InvoiceLineItem, 'sac' | 'service'>): string | null {
  const sac = (line.sac || '').trim();
  if (sac) return null;
  return `"${line.service || 'Unnamed line'}" has no SAC code. Set it explicitly — it must not fall back to ${DEFAULT_SAC_SECURITY} (private security services), which would misclassify the supply.`;
}

export { type RateBasis };
