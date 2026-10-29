/**
 * The one input builder behind the invoice View and the invoice PDF.
 *
 * Both load the same receivable row, its receivable_payments rows and the
 * older invoices named in its previous_balance_breakdown, then go through
 * buildInvoiceViewData() and documentFromViewData(), so the screen and the PDF
 * cannot drift apart. Everything here is pure: callers do the I/O.
 *
 * Tax invoice: the recorded figures are the legal ones (amount = taxable value,
 * gst_amount, total_amount, and gst_type for IGST vs CGST+SGST). Line items
 * describe them and are priced on the line's own divisor, never re-derived
 * from the calendar. See taxInvoiceFromStored() in document.ts for how lines
 * that differ from the recorded figures are printed.
 *
 * Statement of account: live from the ledger columns (ledger.ts) as of today in
 * Asia/Kolkata. Nothing is read from notes text for money.
 */

import {
  amountDue,
  fromPaise,
  invoiceBalance,
  lateInterest,
  LEDGER_EPSILON,
  msmeInterestRate,
  round2,
  sortOldestFirst,
  suggestedTds,
  toPaise,
  type LedgerRow,
} from './ledger';
import {
  amountInWords,
  formatMoney,
  DEFAULT_SAC_SECURITY,
  INVOICE_LABELS,
  type InvoiceCopyType,
  type InvoiceLineItem,
  type PreviousBalanceEntry,
  type TaxType,
} from './calculations';
import {
  DOCUMENT_LABELS,
  resolveInvoiceDocument,
  SAFEND_BANK,
  SAFEND_SUPPLIER,
  type BankDetails,
  type BuildDocumentInput,
  type DocumentLineInput,
  type DocumentType,
  type InvoiceDocumentModel,
  type NoteDetails,
  type StatementOfAccount,
  type StatementRow,
  type StoredInvoiceFigures,
} from './document';
import { DEFAULT_PLACE_OF_SUPPLY, getGstType, INDIAN_STATES } from '@/lib/tax/gst';

/** A receivable_payments row as read for display. */
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
  tds_amount?: number | null;
  payment_date?: string | null;
  reversed_at?: string | null;
  credit_note_id?: string | null;
  receipt_id?: string | null;
}

/** Line item as supplied by callers — same shape as before, plus rate basis. */
export interface InvoiceItem extends InvoiceLineItem {
  id: number | string;
  gstRate: number;
  /** Line amount as recorded on the receivable. */
  storedAmount?: number | null;
  /** Print only the amount (imported invoices, lines without a rate). */
  lumpSum?: boolean;
  /** Small print under the service name. */
  note?: string | null;
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
  /** Itemised previous outstanding (older invoices with their live balances). */
  previousEntries?: PreviousBalanceEntry[];
  paymentDetails?: Partial<{
    bankName: string; bankAccountNo: string; ifscCode: string; accountName: string; terms: string;
  }>;
  invoiceStatus?: string;
  receivableId?: string;
  /** Payment rows that still count (reversed rows removed). */
  payments?: PaymentRecord[];
  gstTreatment?: 'forward' | 'rcm' | 'exempt' | null;
  /** Frozen document from receivables.invoice_snapshot. Rendered verbatim when present. */
  snapshot?: unknown;
  /** Recorded figures of the receivable; printed instead of the line totals. */
  stored?: StoredInvoiceFigures | null;
  /** Live statement of account built from the ledger. */
  statement?: StatementOfAccount | null;
  /** receivables.issued_at; an issued row without a snapshot is marked as recomputed. */
  issuedAt?: string | null;
  /** Tax invoice, credit note or debit note. Defaults to tax invoice. */
  documentType?: DocumentType;
  /** Original invoice and reason of a credit or debit note. */
  note?: NoteDetails | null;
}

export interface ViewDataOptions {
  /** "Today" for the statement date and overdue checks (tests inject it). */
  now?: Date;
  /** Annual MSME interest rate; defaults to msmeInterestRate(). null switches the line off. */
  msmeRate?: number | null;
  /**
   * The original tax invoice of a credit or debit note (receivables row,
   * select '*'), found with originalInvoiceLookup(). Ignored for tax invoices,
   * and when it is not the invoice the note names or belongs to another client.
   */
  original?: Record<string, any> | null;
}

type Row = Record<string, any>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const firstPositive = (...values: unknown[]): number => {
  for (const v of values) if (num(v) > 0) return num(v);
  return 0;
};

const normName = (s: unknown) => String(s ?? '').trim().toLowerCase();

const IST_DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
});

function istParts(date: Date): { y: string; m: string; d: string } {
  const parts = IST_DATE.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** DD/MM/YYYY. Timestamps are read in Asia/Kolkata; date-only values print as stored. */
export function formatIstDate(value?: string | Date | null): string {
  if (!value) return '';
  if (typeof value === 'string') {
    const dateOnly = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  }
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const { y, m, d } = istParts(dt);
  return `${d}/${m}/${y}`;
}

/** Today's date in Asia/Kolkata as YYYY-MM-DD. */
export function istToday(now: Date = new Date()): string {
  const { y, m, d } = istParts(now);
  return `${y}-${m}-${d}`;
}

function jsonArray(value: unknown): Row[] {
  let v = value;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return []; }
  }
  return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [];
}

/** Collapses shift suffixes that repeated edits appended more than once. */
function cleanService(service: unknown): string {
  return String(service ?? '')
    .replace(/(\s*\(12-Hour\))+/g, ' (12-Hour)')
    .replace(/(\s*\(8-Hour\))+/g, ' (8-Hour)')
    .trim();
}

/**
 * The divisor the line was priced on: its own `days`, else monthly ÷
 * perDayRate, else what reproduces its recorded amount. The candidate that
 * reproduces the recorded amount (within ₹1) wins. Undefined leaves the engine
 * on its calendar-month fallback.
 */
function lineDivisor(li: Row, price: number, duties: number, stored: number | null): number | undefined {
  const perDay = firstPositive(li.perDayRate, li.per_day_rate);
  const candidates = [
    num(li.days),
    price > 0 && perDay > 0 ? Math.round(price / perDay) : 0,
    price > 0 && duties > 0 && stored ? Math.round((price * duties) / stored) : 0,
  ].filter((d) => d > 0);
  if (stored && price > 0 && duties > 0) {
    const fits = candidates.find((d) => Math.abs((price / d) * duties - stored) <= 1);
    if (fits) return fits;
  }
  return candidates[0];
}

/**
 * Maps receivables.line_items to engine lines. Two shapes are stored:
 * OneTimeInvoiceForm writes woPrice + days; GenerateInvoiceDialog writes
 * monthlyRate + perDayRate + days. A line with a recorded amount but no rate or
 * duties prints as a lump sum at that amount.
 */
export function mapStoredLineItems(lineItems: unknown, defaultGstRate = 0): InvoiceItem[] {
  return jsonArray(lineItems).map((li, i) => {
    const price = firstPositive(li.woPrice, li.monthlyRate, li.wo_price, li.monthly_rate);
    const duties = num(li.duties);
    const stored = li.amount === null || li.amount === undefined || li.amount === '' ? null : round2(li.amount);
    const lumpSum = (price <= 0 || duties <= 0) && !!stored;
    return {
      id: li.id ?? i + 1,
      service: cleanService(li.service ?? li.description),
      post: li.hideLocation ? '' : String(li.post ?? ''),
      sac: String(li.sac || DEFAULT_SAC_SECURITY),
      personnel: num(li.personnel),
      woPrice: price,
      hideWoPrice: !!li.hideWoPrice || lumpSum,
      days: lineDivisor(li, price, duties, stored) ?? 0,
      duties,
      rateBasis: li.rateBasis ?? null,
      basisDays: li.basisDays ?? null,
      gstRate: num(li.gstRate) || defaultGstRate,
      storedAmount: stored,
      lumpSum,
    };
  });
}

/**
 * Imported from the previous billing system: marked source = 'import', or (for
 * rows from before that column) no line items, no GST and amount = total.
 */
export function isImportedInvoice(row: Row): boolean {
  if (row?.source === 'import') return true;
  // Credit/debit notes keyed in without GST are not imports.
  if (row?.source || row?.category === 'Invoice Adjustments') return false;
  return jsonArray(row?.line_items).length === 0
    && toPaise(row?.gst_amount) === 0
    && toPaise(row?.total_amount) > 0
    && toPaise(row?.amount) === toPaise(row?.total_amount);
}

/** IGST vs CGST+SGST comes from gst_type; the place of supply decides only when it is missing. */
function resolveTaxType(row: Row, gstP: number): TaxType {
  if (gstP === 0) return 'exempt';
  if (row.gst_type === 'igst') return 'inter';
  if (row.gst_type === 'cgst_sgst') return 'intra';
  return getGstType(row.place_of_supply || DEFAULT_PLACE_OF_SUPPLY, 1) === 'igst' ? 'inter' : 'intra';
}

/** Rate printed against the GST heads: the lines' rate when it reproduces the recorded tax, else derived. */
function resolveGstRate(lineItems: Row[], taxableP: number, gstP: number): number {
  if (gstP === 0 || taxableP === 0) return 0;
  const lineRate = num(lineItems.find((li) => num(li.gstRate) > 0)?.gstRate);
  if (lineRate > 0 && Math.abs(Math.round((taxableP * lineRate) / 100) - gstP) <= 100) return lineRate;
  return Math.round((gstP / taxableP) * 10000) / 100;
}

/** The receivable's recorded figures, which the tax invoice prints. */
export function storedFigures(row: Row): StoredInvoiceFigures {
  const imported = isImportedInvoice(row);
  const totalP = toPaise(row.total_amount);
  const gstP = imported ? 0 : toPaise(row.gst_amount);
  let taxableP = imported ? totalP : toPaise(row.amount);
  // Rows saved without a taxable value: total less GST.
  if (taxableP === 0 && totalP !== 0) taxableP = totalP - gstP;
  return {
    taxableValue: fromPaise(taxableP),
    gstAmount: fromPaise(gstP),
    invoiceTotal: fromPaise(totalP),
    taxType: imported ? 'exempt' : resolveTaxType(row, gstP),
    gstRate: imported ? 0 : resolveGstRate(jsonArray(row.line_items), taxableP, gstP),
    imported,
  };
}

/** Description without the "| Inv#: …" / "| CN#: …" / "| DN#: …" suffix the forms append. */
function describe(row: Row): string {
  const text = String(row.description ?? '').replace(/\s*\|\s*(?:Inv|CN|DN)#:.*$/i, '').trim();
  return /^\d+\s+services?$/i.test(text) ? '' : text;
}

function lumpSumLine(row: Row, amount: number, note: string | null): InvoiceItem {
  return {
    id: 1,
    service: describe(row) || 'Services as invoiced',
    post: '',
    sac: '',
    personnel: 0,
    woPrice: 0,
    hideWoPrice: true,
    days: 0,
    duties: 0,
    gstRate: 0,
    storedAmount: amount,
    lumpSum: true,
    note,
  };
}

/** The lines the tax invoice prints for this row. */
function documentLines(row: Row, stored: StoredInvoiceFigures): InvoiceItem[] {
  // Imported: one line at the recorded total, nothing added on top.
  if (stored.imported) return [lumpSumLine(row, stored.invoiceTotal, DOCUMENT_LABELS.importedLineNote)];
  const lines = mapStoredLineItems(row.line_items, stored.gstRate);
  // No breakdown on file: one line at the recorded taxable value.
  return lines.length > 0 ? lines : [{ ...lumpSumLine(row, stored.taxableValue, null), sac: DEFAULT_SAC_SECURITY }];
}

/** tax_invoice, or credit_note / debit_note for an 'Invoice Adjustments' row. */
export function noteDocumentType(row: Row): DocumentType {
  if (row?.category !== 'Invoice Adjustments') return 'tax_invoice';
  if (row.adjustment_type === 'credit') return 'credit_note';
  if (row.adjustment_type === 'debit') return 'debit_note';
  return toPaise(row.total_amount) < 0 ? 'credit_note' : 'debit_note';
}

/** "Against Invoice: <no>" written into the notes of credit notes raised by record_receipt. */
export function againstInvoiceNumber(row: Row): string | null {
  return String(row?.notes ?? '').match(/Against Invoice:\s*([^|]+)/i)?.[1]?.trim() || null;
}

function noteReason(row: Row): string | null {
  return String(row?.notes ?? '').match(/Reason:\s*(.+)$/i)?.[1]?.trim() || null;
}

/**
 * How to find the original invoice of a credit or debit note: by
 * credit_note_against_id, else by the invoice number in its notes (same
 * client). Null for tax invoices and unlinked notes.
 */
export function originalInvoiceLookup(
  row: Row
): { id: string } | { referenceNumber: string; clientName: string } | null {
  if (noteDocumentType(row) === 'tax_invoice') return null;
  if (row.credit_note_against_id) return { id: String(row.credit_note_against_id) };
  const ref = againstInvoiceNumber(row);
  return ref && row.client_name ? { referenceNumber: ref, clientName: String(row.client_name) } : null;
}

/** The original invoice, only when it is the one this note names and belongs to the same client. */
function matchingOriginal(row: Row, original: Row | null | undefined): Row | null {
  if (!original || original.id === row.id || (original.category ?? 'Invoices') !== 'Invoices') return null;
  if (normName(original.client_name) !== normName(row.client_name)) return null;
  if (row.credit_note_against_id) return original.id === row.credit_note_against_id ? original : null;
  return String(original.reference_number ?? '') === againstInvoiceNumber(row) ? original : null;
}

/** Recipient and tax particulars a manually keyed note lacks, taken from its original invoice. */
function withOriginalParticulars(row: Row, original: Row | null): Row {
  if (!original) return row;
  const out: Row = { ...row };
  for (const k of ['client_gstin', 'client_address', 'place_of_supply', 'gst_type', 'gst_treatment']) {
    if (!out[k] && original[k]) out[k] = original[k];
  }
  return out;
}

/** Credit notes are stored negative; the note prints its amounts positive. */
function positiveFigures(stored: StoredInvoiceFigures): StoredInvoiceFigures {
  const abs = (v: number) => fromPaise(Math.abs(toPaise(v)));
  return { ...stored, taxableValue: abs(stored.taxableValue), gstAmount: abs(stored.gstAmount), invoiceTotal: abs(stored.invoiceTotal) };
}

/** A note prints one line at its taxable value, under the SAC of the original supply. */
function noteLines(row: Row, stored: StoredInvoiceFigures, original: Row | null): InvoiceItem[] {
  const sac = String(jsonArray(original?.line_items).find((li) => li.sac)?.sac || DEFAULT_SAC_SECURITY);
  return [{ ...lumpSumLine(row, stored.taxableValue, null), sac }];
}

/** Recipient state from the GSTIN's state code, else from the place of supply. */
function clientState(gstin: string, placeOfSupply: string): string {
  const byGstin = gstin.length >= 2 ? INDIAN_STATES.find((s) => s.code === gstin.slice(0, 2)) : undefined;
  if (byGstin) return byGstin.label;
  const posCode = placeOfSupply.split('-')[0]?.trim();
  return INDIAN_STATES.find((s) => s.code === posCode)?.label ?? placeOfSupply;
}

/** Reference numbers of the older invoices listed in previous_balance_breakdown. */
export function carriedReferenceNumbers(row: Row): string[] {
  const refs = jsonArray(row?.previous_balance_breakdown)
    .map((e) => String(e.referenceNumber ?? e.reference_number ?? '').trim())
    .filter((r) => r && r !== row?.reference_number);
  return [...new Set(refs)];
}

export interface OlderInvoiceDue {
  id: string | null;
  referenceNumber: string;
  dueDate: string | null;
  /** Live amount still owed on that invoice. */
  balance: number;
}

/**
 * Older invoices of the same client and work order, listed on this invoice,
 * that still owe money, with their live balances. They stay the debtors of
 * their own balances; this invoice only shows them.
 */
export function olderInvoicesDue(row: Row, carried: Row[] = []): OlderInvoiceDue[] {
  const refs = new Set(carriedReferenceNumbers(row));
  if (!row?.work_order_id || refs.size === 0) return [];
  const client = normName(row.client_name);
  const seen = new Set<string>();
  const matches = (carried ?? []).filter((c) =>
    c && c.id !== row.id
    && refs.has(String(c.reference_number ?? ''))
    && (c.category ?? 'Invoices') === 'Invoices'
    && normName(c.client_name) === client
    && c.work_order_id === row.work_order_id);
  return sortOldestFirst(matches)
    .filter((c) => !seen.has(String(c.reference_number)) && !!seen.add(String(c.reference_number)))
    .map((c) => ({
      id: c.id ?? null,
      referenceNumber: String(c.reference_number),
      dueDate: formatIstDate(c.due_date) || null,
      balance: amountDue(c),
    }))
    .filter((o) => o.balance > LEDGER_EPSILON);
}

/** "Bank Transfer · ref UTR1 · 12/10/2026; Cash · 15/10/2026" */
function receiptNote(rows: Row[]): string | null {
  const parts = rows.map((p) => {
    const ref = p.transaction_number || p.cheque_number;
    const date = formatIstDate(p.payment_date || p.transaction_datetime || p.cheque_date || p.created_at);
    return [p.mode, ref ? `ref ${ref}` : null, date || null].filter(Boolean).join(' \u00B7 ');
  }).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.length > 4 ? `${parts.slice(0, 4).join('; ')}; and ${parts.length - 4} more` : parts.join('; ');
}

const sumP = (values: unknown[]) => values.reduce<number>((s, v) => s + toPaise(v), 0);
const isCreditNote = (p: Row) => p.mode === 'Credit Note';

/**
 * Live statement of account as of today (Asia/Kolkata), from the ledger:
 * receipts, TDS and credit notes from the payment rows that still count, the
 * balance from the row (total + opening balance − paid), the older invoices
 * still owed, and the TDS the client should withhold from this invoice.
 */
export function buildStatementOfAccount(
  row: Row,
  payments: Row[] = [],
  carried: Row[] = [],
  options: ViewDataOptions = {}
): StatementOfAccount {
  const now = options.now ?? new Date();
  const msmeRate = options.msmeRate !== undefined ? options.msmeRate : msmeInterestRate();
  const active = (payments ?? []).filter((p) => p && !p.reversed_at);
  const receipts = active.filter((p) => !isCreditNote(p));
  const creditNotes = active.filter(isCreditNote);
  let cnP = sumP(creditNotes.map((p) => p.amount));
  let tdsP = sumP(receipts.map((p) => p.tds_amount));
  let receiptsP = sumP(receipts.map((p) => p.amount));
  const ledger: LedgerRow = {
    ...row,
    paid_amount: row.paid_amount ?? fromPaise(receiptsP + cnP),
    tds_credited: row.tds_credited ?? fromPaise(tdsP),
    credit_applied: row.credit_applied ?? fromPaise(cnP),
  };
  // The trigger-maintained columns win if the rows passed in disagree with them.
  if (toPaise(ledger.paid_amount) !== receiptsP + cnP) {
    cnP = toPaise(ledger.credit_applied);
    tdsP = toPaise(ledger.tds_credited);
    receiptsP = toPaise(ledger.paid_amount) - cnP;
  }
  const cashP = receiptsP - tdsP;
  const totalP = toPaise(row.total_amount);
  const openingP = toPaise(row.opening_balance);
  const state: StatementOfAccount['state'] =
    row.status === 'cancelled' ? 'cancelled' : row.status === 'received' ? 'paid' : 'open';
  const dueP = state === 'open' ? toPaise(amountDue(ledger)) : 0;
  const older = state === 'cancelled' ? [] : olderInvoicesDue(row, carried);
  const olderP = sumP(older.map((o) => o.balance));
  // TDS on a legacy receipt is unknown, so what is left to withhold cannot be guessed.
  const legacyTdsUnknown = receipts.some((p) => p.tds_amount === null || p.tds_amount === undefined);
  const tdsDueP = state === 'open' ? toPaise(suggestedTds(ledger, { legacyTdsUnknown })) : 0;
  const payableP = Math.max(0, dueP + olderP - tdsDueP);

  const invNo = String(row.reference_number || '');
  const documentType = noteDocumentType(row);
  const noun = documentType === 'credit_note' ? 'credit note' : documentType === 'debit_note' ? 'debit note' : 'invoice';
  const rows: StatementRow[] = [{ key: 'invoice', label: `This ${noun} (${invNo})`, amount: fromPaise(totalP) }];
  if (openingP !== 0) {
    rows.push({ key: 'opening', label: 'Opening balance (earlier dues with no invoice on file)', amount: fromPaise(openingP) });
  }
  if (cashP > 0) {
    rows.push({ key: 'cash', label: `Less: ${INVOICE_LABELS.amountReceived}`, amount: fromPaise(cashP), less: true, note: receiptNote(receipts) });
  }
  if (tdsP > 0) rows.push({ key: 'tds', label: 'Less: TDS credited', amount: fromPaise(tdsP), less: true });
  if (cnP > 0) {
    const cnNote = creditNotes.map((p) => p.notes).filter(Boolean).join('; ') || null;
    rows.push({ key: 'cn', label: 'Less: Credit notes applied', amount: fromPaise(cnP), less: true, note: cnNote });
  }
  if (rows.length > 1) {
    rows.push({ key: 'balance', label: `Balance on this ${noun}`, amount: invoiceBalance(ledger), kind: 'balance' });
  }
  if (older.length > 0) {
    rows.push({ key: 'older', label: 'Previous due on earlier invoices', amount: null, note: 'Still owed on those invoices; settle them together with this one.' });
    for (const o of older) {
      rows.push({ key: `older-${o.referenceNumber}`, label: `${o.referenceNumber}${o.dueDate ? ` \u00B7 due ${o.dueDate}` : ''}`, amount: o.balance, kind: 'entry' });
    }
    rows.push({ key: 'older-total', label: 'Sub-total', amount: fromPaise(olderP), kind: 'subtotal' });
  }
  if (tdsDueP > 0) {
    rows.push({
      key: 'tds-due', label: `Less: TDS @ ${num(row.tds_rate)}% u/s 194C on this invoice`,
      amount: fromPaise(tdsDueP), less: true, note: INVOICE_LABELS.tdsNote,
    });
  }

  const today = istToday(now);
  const dueDay = row.due_date ? String(row.due_date).slice(0, 10) : '';
  const overdue = state === 'open' && dueP > toPaise(LEDGER_EPSILON) && !!dueDay && dueDay < today;
  // Noon "today" keeps the whole-day count the same in every timezone.
  const interestAmt = overdue && msmeRate ? lateInterest(fromPaise(dueP), dueDay, new Date(`${today}T12:00:00`), msmeRate) : 0;
  const interest = interestAmt > 0
    ? {
        label: 'Interest accrued under MSMED Act s.16 (display only)',
        amount: interestAmt,
        note: `At ${msmeRate}% a year compounded monthly on ${formatMoney(fromPaise(dueP))} overdue since ${formatIstDate(dueDay)}. Not included in the total payable.`,
      }
    : null;

  const total =
    state === 'cancelled'
      ? { label: `${DOCUMENT_LABELS.cancelled} \u2014 NOTHING PAYABLE`, amount: null, words: null }
      : state === 'paid' && payableP === 0
        ? { label: 'PAID IN FULL', amount: null, words: null }
        : { label: INVOICE_LABELS.amountDue, amount: fromPaise(payableP), words: amountInWords(fromPaise(payableP)) };
  const cancelledOn = formatIstDate(row.cancelled_at);
  const remark = state === 'cancelled'
    ? `Cancelled${cancelledOn ? ` on ${cancelledOn}` : ''}${row.cancel_reason ? `: ${row.cancel_reason}` : ''}. Nothing is payable against this ${noun}.`
    : null;
  const badge = state === 'cancelled' ? 'Cancelled'
    : state === 'paid' ? 'Paid in full'
      : receiptsP + cnP > 0 ? 'Part paid' : overdue ? 'Overdue' : null;

  return {
    asOf: formatIstDate(now),
    dueDate: formatIstDate(row.due_date) || null,
    state,
    badge,
    rows,
    total,
    interest,
    remark,
    // A credit note carries no payment advice or statement of account.
    show: documentType !== 'credit_note' && (state !== 'open' || rows.length > 1 || !!interest),
    figures: {
      invoiceTotal: fromPaise(totalP),
      openingBalance: fromPaise(openingP),
      cashReceived: fromPaise(cashP),
      tdsCredited: fromPaise(tdsP),
      creditNotes: fromPaise(cnP),
      balance: invoiceBalance(ledger),
      amountDue: fromPaise(dueP),
      olderTotal: fromPaise(olderP),
      tdsToDeduct: fromPaise(tdsDueP),
      totalPayable: fromPaise(payableP),
    },
  };
}

/**
 * Everything the invoice View and PDF render, from stored data only.
 *
 * @param row       A receivables row (select '*').
 * @param payments  Its receivable_payments rows, any order (reversed rows are ignored).
 * @param carried   receivables rows (select '*') of the older invoices named in
 *                  its previous_balance_breakdown.
 * @param options   options.original: the original invoice of a credit/debit note.
 */
export function buildInvoiceViewData(
  row: Record<string, any>,
  payments: Array<Record<string, any>>,
  carried: Array<Record<string, any>> = [],
  options: ViewDataOptions = {}
): InvoiceData {
  const notes = String(row?.notes ?? '');
  const pick = (re: RegExp) => notes.match(re)?.[1]?.trim() || '';
  const documentType = noteDocumentType(row);
  const isNote = documentType !== 'tax_invoice';
  const original = isNote ? matchingOriginal(row, options.original) : null;
  // A note keyed in by hand has no GSTIN, address or GST type of its own.
  const src = withOriginalParticulars(row, original);
  const recorded = storedFigures(src);
  const stored = documentType === 'credit_note' ? positiveFigures(recorded) : recorded;
  const statement = buildStatementOfAccount(row, payments, carried, options);
  const older = olderInvoicesDue(row, carried);
  const note: NoteDetails | null = isNote
    ? {
        originalInvoiceNo: String(original?.reference_number || '') || againstInvoiceNumber(row),
        originalInvoiceDate: original ? formatIstDate(original.created_at) || null : null,
        reason: noteReason(row),
      }
    : null;
  const gstin = String(src.client_gstin || pick(/(?:Client )?GSTIN:\s*([0-9A-Za-z]{15})/)).trim().toUpperCase();
  const placeOfSupply = String(src.place_of_supply || pick(/Place of Supply:\s*([^|]+)/) || DEFAULT_PLACE_OF_SUPPLY);
  // GenerateInvoiceDialog records the period only in notes ("Billing Period: <from> to <to>").
  const [billedFrom, billedTo] = pick(/Billing Period:\s*([^|]+)/).split(/\s+(?:to|–|-)\s+/);
  const woDate = pick(/Work Order Date:\s*([^|]+)/);
  return {
    receivableId: row.id,
    invoiceStatus: row.status || 'created',
    issuedAt: row.issued_at ?? null,
    companyInfo: {},
    invoiceDetails: {
      invoiceNo: row.reference_number || String(row.id ?? '').slice(0, 8),
      date: formatIstDate(row.created_at),
      dueDate: formatIstDate(row.due_date),
      placeOfSupply,
      workOrderNo: pick(/Work Order No:\s*([^|]+)/),
      workOrderDate: formatIstDate(woDate) || woDate,
      servicePeriodStart: row.service_period_start || billedFrom?.trim() || undefined,
      servicePeriodEnd: row.service_period_end || billedTo?.trim() || undefined,
      irn: row.irn || pick(/IRN:\s*([^\s|]+)/) || undefined,
      irnQr: row.irn_qr || undefined,
      irnAckNo: row.irn_ack_no || undefined,
      irnAckDate: row.irn_ack_date || undefined,
    },
    clientInfo: {
      name: row.client_name || '',
      address: src.client_address || pick(/(?:Client )?(?:Address|Addr):\s*([^|]+)/),
      gstin,
      state: clientState(gstin, placeOfSupply),
    },
    items: isNote ? noteLines(row, stored, original) : documentLines(row, stored),
    taxConfig: {
      gstRate: stored.gstRate,
      taxType: stored.taxType,
      tdsRate: num(row.tds_rate),
      received: statement.figures.cashReceived,
      previousBalance: statement.figures.olderTotal,
    },
    previousEntries: older.map((o) => ({ referenceNumber: o.referenceNumber, date: o.dueDate, amount: o.balance })),
    paymentDetails: {},
    payments: (payments ?? []).filter((p) => p && !p.reversed_at) as PaymentRecord[],
    gstTreatment: src.gst_treatment || null,
    snapshot: row.invoice_snapshot ?? undefined,
    stored,
    statement,
    documentType,
    note,
  };
}

export interface ViewDocumentOptions {
  /** Bank account printed when the caller supplied none (the active bank_accounts row). */
  bank?: Partial<BankDetails> | null;
  copyType?: InvoiceCopyType;
}

export interface ViewDocument {
  doc: InvoiceDocumentModel;
  fromSnapshot: boolean;
  /** Not the frozen issued copy: a legacy issued row, or lines that differ from the recorded figures. */
  recomputed: boolean;
}

/** The document the View and the PDF render for `data`. */
export function documentFromViewData(data: InvoiceData = {}, opts: ViewDocumentOptions = {}): ViewDocument {
  const meta = data.invoiceDetails ?? {};
  const { terms, ...payBank } = data.paymentDetails ?? {};
  const input: BuildDocumentInput = {
    supplier: { ...SAFEND_SUPPLIER, ...data.companyInfo },
    recipient: data.clientInfo ?? {},
    meta: {
      invoiceNo: meta.invoiceNo ?? '',
      date: meta.date || formatIstDate(new Date()),
      dueDate: meta.dueDate || null,
      placeOfSupply: meta.placeOfSupply || SAFEND_SUPPLIER.state,
      workOrderNo: meta.workOrderNo || null,
      workOrderDate: meta.workOrderDate || null,
      servicePeriodStart: meta.servicePeriodStart || null,
      servicePeriodEnd: meta.servicePeriodEnd || null,
      copyType: opts.copyType ?? meta.copyType ?? 'recipient',
    },
    items: (data.items ?? []) as DocumentLineInput[],
    taxConfig: data.taxConfig,
    previousEntries: data.previousEntries,
    bank: { ...SAFEND_BANK, ...(opts.bank ?? {}), ...payBank },
    terms: terms || INVOICE_LABELS.defaultTerms,
    gstTreatment: data.gstTreatment,
    eInvoice: {
      irn: meta.irn ?? null,
      qr: meta.irnQr ?? null,
      ackNo: meta.irnAckNo ?? null,
      ackDate: meta.irnAckDate ?? null,
    },
    stored: data.stored ?? null,
    statement: data.statement ?? null,
    documentType: data.documentType ?? 'tax_invoice',
    note: data.note ?? null,
  };
  const { doc, fromSnapshot } = resolveInvoiceDocument(data.snapshot, input);
  // Callers that pass only taxConfig (no recorded figures) keep the old marking.
  const legacyInput = data.stored === undefined;
  const recomputed = !fromSnapshot && (legacyInput
    || (!data.stored?.imported && (!!data.issuedAt || !doc.taxInvoice.linesReconciled)));
  return { doc, fromSnapshot, recomputed };
}

/**
 * True when downloading this row should issue it and freeze its document: a
 * tax invoice, credit note or debit note never issued, never snapshotted and
 * not cancelled. Rows that already carry issued_at without a snapshot are left
 * alone here; scripts/maintenance/freeze-issued-invoices.mts freezes those.
 */
export function shouldFreezeOnDownload(row: Row): boolean {
  return (row?.category === 'Invoices' || row?.category === 'Invoice Adjustments')
    && !row.invoice_snapshot && !row.issued_at && row.status !== 'cancelled';
}

/** True for a draft: created, never issued, nothing paid. Drafts are never frozen. */
function isDraftRow(row: Row): boolean {
  return row?.status === 'created' && !row.issued_at && toPaise(row.paid_amount) === 0;
}

/**
 * True when an issued (or paid) row still has no frozen copy and should get
 * one from its recorded figures. Used by the freeze-issued-invoices script.
 */
export function needsBackfillSnapshot(row: Row): boolean {
  return (row?.category === 'Invoices' || row?.category === 'Invoice Adjustments')
    && !row.invoice_snapshot && row.status !== 'cancelled' && !isDraftRow(row);
}

/** The update that issues a row on first download. Status moves to 'issued' only from 'created'. */
export function issuePatch(row: Row, snapshot: unknown, issuedAt: string): Record<string, unknown> {
  return {
    invoice_snapshot: snapshot,
    issued_at: issuedAt,
    ...(row?.status === 'created' ? { status: 'issued' } : {}),
  };
}
