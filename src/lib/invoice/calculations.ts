/**
 * Shared invoice calculation engine — single source of truth for the screen
 * view (InvoiceGenerator.tsx) and the PDF (app/api/invoice-pdf/route.ts).
 *
 * ROUNDING follows standard Indian accounting-software practice (Tally/Busy):
 * the rate is rounded to `ratePrecision` decimals and the line amount is
 * computed FROM the rounded rate, so a reader can reproduce every figure with a
 * calculator. Previously the rate was printed at 2dp but the amount used the
 * unrounded value, so 62 × 516.13 came to 32,000.06 while the line claimed
 * 32,000.00 — arithmetically correct, but not verifiable on its face. Each tax
 * head is then rounded to 2dp and only the grand total is rounded to the rupee,
 * with the residual carried in the round-off line.
 *
 * TAX TYPE is a discriminated choice, not three independent rates. CGST+SGST and
 * IGST can no longer both appear on one invoice, which the previous shape
 * permitted (all three heads were computed and summed unconditionally).
 *
 * WHAT IS NOT IN THE INVOICE VALUE: TDS, payments received and previous
 * balance. `invoiceTotal` is the GSTR-1 document value and is never touched by
 * them — they belong to the payment advice, which is a statement of account and
 * not part of the tax invoice.
 */

import {
  resolveRateBasis,
  describeRateDerivation,
  exceedsBasis,
  type RateBasis,
  type ResolvedRateBasis,
} from './rateBasis';

/** Rounds to `dp` decimals, half-up, without float artefacts (2.675 → 2.68). */
export function roundTo(value: number, dp = 2): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** dp;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * f) / f;
}

const round2 = (n: number) => roundTo(n, 2);

/** Intra-state supply attracts CGST+SGST; inter-state attracts IGST. */
export type TaxType = 'intra' | 'inter' | 'exempt';

export interface InvoiceLineItem {
  id?: number | string;
  service: string;
  post: string;
  sac: string;
  /** Personnel deployed on this post (reference only — duties drive the value). */
  personnel: number;
  /**
   * The contracted price. Interpreted by `rateBasis`:
   *   calendar_month / fixed_days → monthly price per personnel
   *   per_duty                    → the per-duty rate itself
   */
  woPrice: number;
  /** Legacy per-line divisor. Only used when `rateBasis` is absent. */
  days: number;
  /** Total duties served across all personnel on this post. */
  duties: number;
  /** Contracted rate basis, snapshotted from the work order. */
  rateBasis?: RateBasis | null;
  /** Divisor when rateBasis === 'fixed_days'. */
  basisDays?: number | null;
  gstRate?: number;
  /** When true the contract-price column prints '—'. */
  hideWoPrice?: boolean;
}

export interface InvoiceTaxConfig {
  /** Preferred: total GST rate (e.g. 18) plus the supply type. */
  gstRate?: number;
  taxType?: TaxType;
  /** Legacy head-level rates. Retained so existing callers keep working. */
  sgstRate: number;
  cgstRate: number;
  igstRate: number;
  tdsRate: number;
  received: number;
  previousBalance: number;
  /** Decimals the per-duty rate is rounded to before the amount is derived. */
  ratePrecision?: number;
}

export interface ComputedInvoiceLine extends InvoiceLineItem {
  /** Per-duty rate, rounded to `ratePrecision`. */
  rate: number;
  /** roundTo(rate × duties, 2) — derived from the ROUNDED rate. */
  amount: number;
  /** Resolved divisor and its label, for printing the derivation. */
  basisResolved: ResolvedRateBasis;
  /** e.g. "₹16,000 ÷ 26" — printed under the rate so the line verifies. */
  rateDerivation: string;
  /** Duties billed exceed the contracted basis (display hint; same rate applies). */
  overBasis: boolean;
  /** True when the line cannot be priced (fixed_days with no basis_days). */
  blocked: boolean;
}

/** Rule 46(g)-style HSN/SAC-wise summary. */
export interface SacSummaryRow {
  sac: string;
  taxableValue: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
}

export interface InvoiceTotals {
  lines: ComputedInvoiceLine[];
  subTotal: number;
  totalDuties: number;
  totalPersonnel: number;
  taxType: TaxType;
  gstRate: number;
  sgstRate: number;
  cgstRate: number;
  igstRate: number;
  sgst: number;
  cgst: number;
  igst: number;
  totalTax: number;
  tds: number;
  tdsRate: number;
  sacSummary: SacSummaryRow[];
  /** subTotal + tax, before rounding to the rupee. */
  beforeRound: number;
  roundOff: number;
  /** GSTR-1 document value. TDS/receipts/previous balance never affect this. */
  invoiceTotal: number;
  /** invoiceTotal − tds − received */
  netPayable: number;
  received: number;
  previousBalance: number;
  /** netPayable + previousBalance — the payment-advice figure. */
  currentBalance: number;
  /** Lines that could not be priced; invoice must not be issued while non-empty. */
  blockedLines: ComputedInvoiceLine[];
  /** Alias kept for backward compatibility — same as invoiceTotal. */
  grandTotal: number;
}

const DEFAULT_TAX_CONFIG: InvoiceTaxConfig = {
  sgstRate: 9,
  cgstRate: 9,
  igstRate: 0,
  tdsRate: 0,
  received: 0,
  previousBalance: 0,
  ratePrecision: 2,
};

/**
 * Normalises the tax config into one rate plus a discriminated type.
 * Prefers the explicit `gstRate`/`taxType` pair; otherwise infers from the
 * legacy head rates (any IGST ⇒ inter-state).
 */
function resolveTax(cfg: InvoiceTaxConfig): {
  taxType: TaxType;
  gstRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
} {
  if (cfg.gstRate !== undefined && cfg.taxType) {
    const rate = Number(cfg.gstRate) || 0;
    if (rate <= 0 || cfg.taxType === 'exempt') {
      return { taxType: 'exempt', gstRate: 0, cgstRate: 0, sgstRate: 0, igstRate: 0 };
    }
    return cfg.taxType === 'inter'
      ? { taxType: 'inter', gstRate: rate, cgstRate: 0, sgstRate: 0, igstRate: rate }
      : { taxType: 'intra', gstRate: rate, cgstRate: rate / 2, sgstRate: rate / 2, igstRate: 0 };
  }

  const igst = Number(cfg.igstRate) || 0;
  const cgst = Number(cfg.cgstRate) || 0;
  const sgst = Number(cfg.sgstRate) || 0;

  if (igst > 0) {
    return { taxType: 'inter', gstRate: igst, cgstRate: 0, sgstRate: 0, igstRate: igst };
  }
  if (cgst + sgst <= 0) {
    return { taxType: 'exempt', gstRate: 0, cgstRate: 0, sgstRate: 0, igstRate: 0 };
  }
  return { taxType: 'intra', gstRate: cgst + sgst, cgstRate: cgst, sgstRate: sgst, igstRate: 0 };
}

export interface ComputeOptions {
  /** Start of the billed service period — the divisor source for calendar_month. */
  periodStart?: string | null;
  /** Invoice date, used when no service period is recorded. */
  invoiceDate?: string | null;
}

export function computeInvoiceTotals(
  items: InvoiceLineItem[],
  taxConfig: Partial<InvoiceTaxConfig> = {},
  options: ComputeOptions = {}
): InvoiceTotals {
  const cfg = { ...DEFAULT_TAX_CONFIG, ...taxConfig };
  const dp = cfg.ratePrecision ?? 2;
  const tax = resolveTax(cfg);

  let subTotal = 0;
  let totalDuties = 0;
  let totalPersonnel = 0;

  const lines: ComputedInvoiceLine[] = (items || []).map((item) => {
    const basisResolved = resolveRateBasis({
      basis: item.rateBasis,
      basisDays: item.basisDays,
      periodStart: options.periodStart,
      invoiceDate: options.invoiceDate,
      legacyDays: item.days,
    });

    const contractPrice = Number(item.woPrice) || 0;
    const duties = Number(item.duties) || 0;
    const blocked = basisResolved.divisor <= 0;

    // Round the rate FIRST, then derive the amount from it, so the printed
    // figures multiply out exactly.
    const rate = blocked ? 0 : roundTo(contractPrice / basisResolved.divisor, dp);
    const amount = blocked ? 0 : round2(rate * duties);

    subTotal += amount;
    totalDuties += duties;
    totalPersonnel += Number(item.personnel) || 0;

    return {
      ...item,
      rate,
      amount,
      basisResolved,
      rateDerivation: describeRateDerivation(contractPrice, basisResolved, formatNumber),
      overBasis: exceedsBasis(duties, basisResolved),
      blocked,
    };
  });

  subTotal = round2(subTotal);

  const cgst = round2(subTotal * (tax.cgstRate / 100));
  const sgst = round2(subTotal * (tax.sgstRate / 100));
  const igst = round2(subTotal * (tax.igstRate / 100));
  const totalTax = round2(cgst + sgst + igst);

  const tdsRate = Number(cfg.tdsRate) || 0;
  // TDS is on the taxable value, GST excluded (Sec 194C read with Circular 23/2017).
  const tds = round2(subTotal * (tdsRate / 100));

  const beforeRound = round2(subTotal + totalTax);
  const invoiceTotal = Math.round(beforeRound);
  const roundOff = round2(invoiceTotal - beforeRound);

  const received = round2(Number(cfg.received) || 0);
  const previousBalance = round2(Number(cfg.previousBalance) || 0);
  const netPayable = round2(invoiceTotal - tds - received);
  const currentBalance = round2(netPayable + previousBalance);

  // SAC-wise summary, grouped by code and rate.
  const groups = new Map<string, SacSummaryRow>();
  for (const line of lines) {
    if (line.blocked) continue;
    const sac = (line.sac || '').trim() || 'Unclassified';
    const key = `${sac}|${tax.gstRate}`;
    const row =
      groups.get(key) ??
      { sac, taxableValue: 0, gstRate: tax.gstRate, cgst: 0, sgst: 0, igst: 0, totalTax: 0 };
    row.taxableValue = round2(row.taxableValue + line.amount);
    groups.set(key, row);
  }
  const sacSummary = [...groups.values()].map((row) => {
    const c = round2(row.taxableValue * (tax.cgstRate / 100));
    const s = round2(row.taxableValue * (tax.sgstRate / 100));
    const i = round2(row.taxableValue * (tax.igstRate / 100));
    return { ...row, cgst: c, sgst: s, igst: i, totalTax: round2(c + s + i) };
  });

  return {
    lines,
    subTotal,
    totalDuties,
    totalPersonnel,
    taxType: tax.taxType,
    gstRate: tax.gstRate,
    cgstRate: tax.cgstRate,
    sgstRate: tax.sgstRate,
    igstRate: tax.igstRate,
    cgst,
    sgst,
    igst,
    totalTax,
    tds,
    tdsRate,
    sacSummary,
    beforeRound,
    roundOff,
    invoiceTotal,
    netPayable,
    received,
    previousBalance,
    currentBalance,
    blockedLines: lines.filter((l) => l.blocked),
    grandTotal: invoiceTotal,
  };
}

/** One entry in the previous-outstanding breakdown printed on the payment advice. */
export interface PreviousBalanceEntry {
  referenceNumber: string;
  date?: string | null;
  amount: number;
}

/**
 * Payment advice — a statement of account, NOT part of the tax invoice.
 *
 * Kept as a separate structure so the invoice value and the payable figure can
 * never be conflated. Previously "Amount Due" (invoice + previous balance) was
 * the largest, reddest figure on a document headed TAX INVOICE, while the actual
 * GSTR-1 document value sat above it in smaller type.
 */
export interface PaymentAdvice {
  invoiceNo: string;
  invoiceTotal: number;
  tds: number;
  tdsRate: number;
  received: number;
  previousBalance: number;
  previousEntries: PreviousBalanceEntry[];
  totalPayable: number;
  dueDate?: string | null;
}

export function buildPaymentAdvice(
  totals: InvoiceTotals,
  invoiceNo: string,
  previousEntries: PreviousBalanceEntry[] = [],
  dueDate?: string | null
): PaymentAdvice {
  // Trust the itemised entries when present; they are what the client reconciles.
  const itemised = round2(previousEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const previousBalance = previousEntries.length > 0 ? itemised : totals.previousBalance;
  return {
    invoiceNo,
    invoiceTotal: totals.invoiceTotal,
    tds: totals.tds,
    tdsRate: totals.tdsRate,
    received: totals.received,
    previousBalance,
    previousEntries,
    totalPayable: round2(totals.invoiceTotal - totals.tds - totals.received + previousBalance),
    dueDate: dueDate ?? null,
  };
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** Converts a rupee amount into Indian-numbering words. */
export function amountInWords(value: number): string {
  const rupees = Math.floor(value);
  const paise = Math.round((value - rupees) * 100);
  const two = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`);
  const three = (n: number) => `${n >= 100 ? ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' : '') : ''}${n % 100 ? two(n % 100) : ''}`;
  if (rupees === 0 && !paise) return 'Zero Rupees Only';
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundred = rupees % 1000;
  let words = '';
  if (crore) words += `${two(crore)} Crore `;
  if (lakh) words += `${two(lakh)} Lakh `;
  if (thousand) words += `${two(thousand)} Thousand `;
  if (hundred) {
    if (hundred < 100 && (crore || lakh || thousand)) words += 'and ';
    words += `${three(hundred)} `;
  }
  words = words.trim() + ' Rupees';
  if (paise) words += ` and ${two(paise)} Paise`;
  return words + ' Only';
}

/** Indian grouping with 2 decimals, no currency symbol. */
export function formatNumber(n: number): string {
  return (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Indian grouping, no decimals — for whole-rupee line amounts on the invoice. */
export function formatWholeNumber(n: number): string {
  return Math.round(n || 0).toLocaleString('en-IN');
}

/** Indian grouping with the given decimals — used for higher-precision rates. */
export function formatRate(n: number, dp = 2): string {
  return (n || 0).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function formatMoney(n: number): string {
  return `\u20B9${formatNumber(n)}`;
}

/** Shared display copy so the screen view and PDF cannot word things differently. */
export const INVOICE_LABELS = {
  documentTitle: 'TAX INVOICE',
  billTo: 'BILL TO',
  invoiceDetailsHead: 'INVOICE DETAILS',
  serviceAndPost: 'SERVICE & POST',
  duties: 'DUTIES',
  personnelSuffix: 'Personnel',
  taxableValue: 'Taxable Value',
  invoiceTotal: 'Invoice Value',
  invoiceTotalNote: 'for GST purposes',
  amountReceived: 'Payments received',
  amountDue: 'TOTAL PAYABLE NOW',
  bankDetails: 'BANK DETAILS',
  totalAmountWords: 'INVOICE VALUE (IN WORDS)',
  payableWords: 'TOTAL PAYABLE (IN WORDS)',
  termsAndConditions: 'TERMS & CONDITIONS',
  sacSummaryHead: 'SAC-WISE TAX SUMMARY',
  paymentAdviceHead: 'PAYMENT ADVICE',
  servicePeriod: 'Service Period',

  /** Rule 46(n) declaration — forward charge. */
  declaration:
    'Certified that the particulars given above are true and correct. Whether GST is payable under reverse charge: No.',
  /**
   * RCM declaration. Retained for completeness only: under Notification
   * 29/2018-CTR reverse charge on security services applies where the SUPPLIER
   * is not a body corporate. Safend is a private limited company, so forward
   * charge always applies and this text is unreachable in normal operation.
   */
  declarationRCM:
    'Certified that the particulars given above are true and correct. Whether GST is payable under reverse charge: Yes. (Security services supplied by a person other than a body corporate — Notification No. 29/2018-CT(Rate) dt. 31.12.2018.)',

  /**
   * Caption that keeps the statement of account outside the tax invoice. Kept to
   * one rendered line — at 6.2pt a second line costs ~9pt, which is enough to
   * push a single-line invoice onto a second sheet.
   */
  adviceDisclaimer:
    'Statement of account \u2014 not part of the tax invoice above. GST is charged only on the taxable value shown there.',
  tdsNote: 'To be deducted and deposited by you. Not a reduction of the invoice value.',

  pageFooterNote:
    'Computer-generated invoice, valid without a physical signature. \u00B7 Subject to Cuttack Jurisdiction.',
  copyRecipient: 'ORIGINAL FOR RECIPIENT',
  copySupplier: 'DUPLICATE FOR SUPPLIER',

  defaultTerms:
    '1. Interest @ 4% p.m will be charged if the bill is not paid before due date as per contract.\n' +
    '2. Any discrepancy in the bill must be reported to us within 5 days to the above local office.\n' +
    '3. All disputes are subject to Cuttack Jurisdiction only.\n' +
    '4. Cash Payment Pay To Company Authorized Person Only.',
};

/** Which copy of the invoice is being rendered (Rule 46(o) / Rule 48(1)). */
export type InvoiceCopyType = 'recipient' | 'supplier';

export function invoiceCopyLabel(copy: InvoiceCopyType | null | undefined): string {
  return copy === 'supplier' ? INVOICE_LABELS.copySupplier : INVOICE_LABELS.copyRecipient;
}

/** Default SAC for private security services. */
export const DEFAULT_SAC_SECURITY = '998525';

/**
 * e-Invoicing (Rule 48(4), Notification 10/2023): mandatory above ₹5 Cr
 * aggregate turnover for B2B supplies, and an invoice issued without an IRN is
 * not treated as an invoice at all.
 *
 * Both paths are built. This flag decides which is live, so switching on needs
 * no code change — set NEXT_PUBLIC_EINVOICE_ENABLED=true once IRP/GSP
 * integration is in place. Held off deliberately: asserting applicability while
 * issuing invoices without an IRN is worse than not asserting it.
 */
export const EINVOICE_ENABLED =
  (process.env.NEXT_PUBLIC_EINVOICE_ENABLED ?? '').toLowerCase() === 'true';

/** @deprecated Use EINVOICE_ENABLED. Kept so existing imports keep compiling. */
export const EINVOICE_TURNOVER_APPLICABLE = EINVOICE_ENABLED;

/** True when this invoice needs an IRN: e-invoicing is live AND the recipient is registered (B2B). */
export function isEInvoiceRequired(clientGstin?: string | null): boolean {
  return EINVOICE_ENABLED && !!(clientGstin && clientGstin.trim());
}

/**
 * Blocks issuance when an IRN is required but absent. Returns null when fine.
 * While the flag is off this always returns null, so current operations are
 * unaffected.
 */
export function eInvoiceBlocker(
  clientGstin?: string | null,
  irn?: string | null
): string | null {
  if (!isEInvoiceRequired(clientGstin)) return null;
  if (irn && irn.trim()) return null;
  return 'e-Invoicing is enabled and this is a B2B supply, so an IRN must be obtained from the IRP before the invoice is issued (Rule 48(4)).';
}

export function getInvoiceDeclaration(gstTreatment?: 'forward' | 'rcm' | 'exempt' | null): string {
  return gstTreatment === 'rcm' ? INVOICE_LABELS.declarationRCM : INVOICE_LABELS.declaration;
}

/** Single human-readable line describing a payment record. */
export function formatPaymentLine(p: {
  mode?: string | null;
  received_by?: string | null;
  transaction_number?: string | null;
  cheque_number?: string | null;
  transaction_datetime?: string | null;
  cheque_date?: string | null;
}): string {
  const date = p.transaction_datetime || p.cheque_date;
  const parts = [
    p.mode,
    p.received_by ? `Received By: ${p.received_by}` : null,
    p.transaction_number ? `Ref: ${p.transaction_number}` : null,
    p.cheque_number ? `Cheque: ${p.cheque_number}` : null,
    date
      ? `Date: ${new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
      : null,
  ].filter(Boolean);
  return parts.join('   |   ') || 'Payment recorded';
}

export { type RateBasis } from './rateBasis';
