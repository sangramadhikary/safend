/**
 * Deterministic page layout for the invoice PDF.
 *
 * @react-pdf's automatic flow is not good enough for a document of record. Left
 * to itself it will split a bordered table container mid-box, break a row
 * between its service name and its "@ post" sub-line, and strand a totals
 * panel's header on one page with its grand total on the next. With six or seven
 * service lines that happens routinely.
 *
 * So rows are assigned to pages here, from measured block heights, before
 * anything renders. Every rendered block is additionally marked `wrap={false}`
 * as a backstop, and the table's border is applied per-fragment (top edge on the
 * header, sides on rows, bottom edge on the closing row) so a page boundary
 * never cuts through a box.
 *
 * The estimates are deliberately generous. Over-estimating costs a row of
 * whitespace; under-estimating costs an ugly break.
 */

/** A4 portrait, in PostScript points. */
export const A4_HEIGHT = 841.89;
/** Must track S.page.paddingTop in the PDF route. */
export const PAD_TOP = 22;
/** S.page.paddingBottom plus room for the fixed page-footer strip. */
export const PAD_BOTTOM = 30;
export const USABLE_H = A4_HEIGHT - PAD_TOP - PAD_BOTTOM;

export const H_COPY_MARK = 12;  // "ORIGINAL FOR RECIPIENT"
export const H_HEADER = 95;     // logo + company block + red rule
export const H_PARTIES = 112;   // Bill To / Invoice Details panels
export const H_CONT_BAR = 26;   // continuation strip on pages 2+
export const H_THEAD = 20;      // table column header
export const H_TFOOT = 24;      // table totals row
export const H_EINVOICE = 74;   // IRN + signed QR strip

export interface TailInput {
  /** Distinct SAC/rate groups. The summary is only rendered when > 1. */
  sacRows: number;
  hasAdvice: boolean;
  adviceEntries: number;
  /** Advice rows that are conditional: TDS, payments received. */
  hasTds?: boolean;
  hasReceived?: boolean;
  /** The paid / partially-paid chip in the left column. */
  hasPaymentStatus?: boolean;
  /** Inter-state prints one tax row, intra-state prints two. */
  interState?: boolean;
  hasRoundOff?: boolean;
}

/**
 * A single-SAC summary table restates what the line and the totals panel already
 * say, and it costs ~42pt — enough to push an otherwise one-page invoice onto a
 * second sheet. So it earns its place only when there is more than one group.
 */
export function showSacSummary(sacRows: number): boolean {
  return sacRows > 1;
}

/**
 * Height of the closing stack: optional SAC summary, the bank/words column
 * beside the totals panel, the payment advice, then terms and signature.
 *
 * These are measured against the rendered styles rather than guessed, because
 * over-estimating here forces needless page breaks on small invoices — which is
 * exactly what a generous first cut produced.
 */
export function tailHeight(t: TailInput): number {
  const sac = showSacSummary(t.sacRows) ? 16 + t.sacRows * 14 + 12 : 0;

  // Left column: bank card, then amount-in-words, then the optional status chip.
  const left = 95 + 34 + (t.hasPaymentStatus ? 48 : 0);
  // Totals panel: taxable + tax row(s) + optional round-off + invoice value.
  const totals = 22 + (t.interState ? 20 : 40) + (t.hasRoundOff ? 16 : 0) + 34;
  const lower = 9 + Math.max(left, totals); // 9 = S.lower marginTop

  const advice = t.hasAdvice
    ? 9 + // S.advice marginTop
      17 + // paddingTop + paddingBottom
      15 + // heading row
      16 + // one-line caption
      19 + // "This invoice (…)"
      (t.hasTds ? 28 : 0) + // label + "deducted by you" sub-note
      (t.hasReceived ? 19 : 0) +
      (t.adviceEntries > 0 ? 19 + t.adviceEntries * 13 + 17 : 19) +
      34 + // TOTAL PAYABLE NOW
      26 // payable in words (wraps to two lines on longer amounts)
    : 0;

  const footer = 118; // marginTop + rule + terms/declaration vs signature block

  return sac + lower + advice + footer;
}

export interface PaginatableLine {
  service?: string;
  post?: string;
  hideLocation?: boolean;
  rateDerivation?: string;
}

/** Rendered height of one table row, including its optional sub-lines. */
export function rowHeight(line: PaginatableLine): number {
  let h = 22;
  if (line.post && !line.hideLocation) h += 10; // "@ post"
  if (line.rateDerivation) h += 8;              // printed divisor under the rate
  if (String(line.service || '').length > 46) h += 9; // service name wraps
  return h;
}

export interface RowPage<T = PaginatableLine> {
  rows: T[];
  /** First page carries the full letterhead; later pages carry a continuation bar. */
  first: boolean;
  /** True when the closing stack sits on this page rather than a fresh one. */
  tail: boolean;
}

export function firstPageCapacity(hasEInvoice: boolean): number {
  return (
    USABLE_H - H_COPY_MARK - H_HEADER - H_PARTIES - (hasEInvoice ? H_EINVOICE : 0) - H_THEAD
  );
}

export function continuationCapacity(): number {
  return USABLE_H - H_CONT_BAR - H_THEAD;
}

/**
 * Splits rows across pages and decides whether the closing stack fits beneath
 * the last row block or needs its own page.
 */
export function paginateRows<T extends PaginatableLine>(
  lines: T[],
  tailH: number,
  hasEInvoice: boolean
): RowPage<T>[] {
  const firstCap = firstPageCapacity(hasEInvoice);
  const contCap = continuationCapacity();

  const pages: RowPage<T>[] = [];
  let current: T[] = [];
  let used = 0;
  let capacity = firstCap;
  let isFirst = true;

  for (const line of lines) {
    const h = rowHeight(line);
    // Always keep at least one row per page, so a single very tall row cannot
    // produce an empty page or loop.
    if (current.length > 0 && used + h > capacity) {
      pages.push({ rows: current, first: isFirst, tail: false });
      current = [];
      used = 0;
      isFirst = false;
      capacity = contCap;
    }
    current.push(line);
    used += h;
  }
  pages.push({ rows: current, first: isFirst, tail: false });

  // Splitting the totals away from the table is the worst-looking failure, so
  // the closing stack moves to a fresh page rather than being squeezed in.
  const last = pages[pages.length - 1];
  const remaining = (last.first ? firstCap : contCap) - used - H_TFOOT;
  if (remaining >= tailH) {
    last.tail = true;
  } else {
    pages.push({ rows: [], first: false, tail: true });
  }

  return pages;
}
