import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import path from 'path';
import fs from 'fs';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { authenticateActor, canReadInvoice, isInvoiceStaff, type Actor } from '@/lib/supabase/auth';
import { Document, Page, Text, View, Image, StyleSheet, Font, pdf } from '@react-pdf/renderer';
import {
  computeInvoiceTotals,
  buildPaymentAdvice,
  amountInWords,
  formatNumber as num,
  formatWholeNumber as numInt,
  formatRate,
  formatMoney as money,
  INVOICE_LABELS as L,
  formatPaymentLine,
  getInvoiceDeclaration,
  invoiceCopyLabel,
  DEFAULT_SAC_SECURITY,
  type InvoiceLineItem,
} from '@/lib/invoice/calculations';
import {
  formatServicePeriod,
  panFromGstin,
  withCurrentSupplierLetterhead,
} from '@/lib/invoice/document';
import { showSacSummary } from '@/lib/invoice/pdfPagination';
import { INDIAN_STATES } from '@/lib/tax/gst';

/* ────────────────────────────────────────────────────────────────────────────
 * Font registration — NotoSans supports the ₹ (rupee) glyph. Only 400 & 700
 * weights are bundled; no italic variant, so we never use fontStyle: 'italic'.
 * ──────────────────────────────────────────────────────────────────────────── */
const fontsDir = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: 'NotoSans',
  fonts: [
    { src: path.join(fontsDir, 'NotoSans-Regular.ttf'), fontWeight: 400 },
    { src: path.join(fontsDir, 'NotoSans-Bold.ttf'), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word: string) => [word]);

const logoPath = path.join(process.cwd(), 'public', 'logo.png');
const LOGO_SRC = fs.existsSync(logoPath)
  ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
  : null;

const signPath = path.join(process.cwd(), 'public', 'Sign-transparent.png');
const SIGN_SRC = fs.existsSync(signPath)
  ? `data:image/png;base64,${fs.readFileSync(signPath).toString('base64')}`
  : null;

/* ── Palette: strictly red / black / white / greys ────────────────────────── */
const RED = '#B91C1C';
const BLACK = '#111827';
const INK = '#374151';
const MUTE = '#6B7280';
const FAINT = '#9CA3AF';
const LINE = '#E5E7EB';
const PANEL = '#F9FAFB';
const WHITE = '#FFFFFF';

const S = StyleSheet.create({
  // Margins trimmed from 28 to reclaim vertical space: with the payment advice
  // added, a single-line invoice was landing ~20pt over one A4 page. 22pt is
  // ~7.8mm, comfortably inside any printer's non-printable margin.
  page: { paddingTop: 18, paddingBottom: 22, paddingHorizontal: 28, fontSize: 8.5, fontFamily: 'NotoSans', color: INK, lineHeight: 1.3 },

  /* Header */
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brandRow: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, paddingRight: 12 },
  logo: { width: 42, height: 28, marginRight: 9, objectFit: 'contain' },
  brandDivider: { borderLeftWidth: 1.5, borderLeftColor: '#FCA5A5', paddingLeft: 9 },
  companyName: { fontSize: 12, fontWeight: 700, color: RED, marginBottom: 2 },
  companyLine: { fontSize: 7.5, color: MUTE, lineHeight: 1.4 },
  companyEmail: { fontSize: 7.5, color: RED, marginTop: 1 },
  titleBox: { alignItems: 'flex-end' },
  invoiceTitle: { fontSize: 14, fontWeight: 700, color: RED, letterSpacing: 2 },
  taxIdBox: { marginTop: 5, borderWidth: 0.5, borderColor: LINE, borderRadius: 3, paddingHorizontal: 7, paddingVertical: 4, backgroundColor: PANEL, minWidth: 150 },
  taxIdRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 },
  taxIdLabel: { fontSize: 6.5, color: MUTE, fontWeight: 700 },
  taxIdValue: { fontSize: 7.5, color: BLACK, fontWeight: 400 },

  rule: { height: 2, backgroundColor: RED, borderRadius: 2, marginTop: 7, marginBottom: 8 },

  /* Parties */
  parties: { flexDirection: 'row', gap: 10, marginBottom: 9 },
  partyBox: { flex: 1, borderWidth: 0.5, borderColor: LINE, borderRadius: 4, overflow: 'hidden' },
  partyHead: { backgroundColor: PANEL, paddingHorizontal: 8, paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: LINE },
  partyHeadText: { fontSize: 7, fontWeight: 700, color: RED, letterSpacing: 0.8 },
  partyBody: { paddingHorizontal: 8, paddingVertical: 5 },
  partyName: { fontSize: 9, fontWeight: 700, color: BLACK, marginBottom: 2 },
  partyLine: { fontSize: 7.5, color: MUTE, marginBottom: 1 },
  kv: { flexDirection: 'row', marginTop: 2 },
  kvLabel: { fontSize: 7, color: MUTE, width: 40 },
  kvValue: { fontSize: 7, color: BLACK, fontWeight: 400, flex: 1 },

  metaGrid: { paddingHorizontal: 8, paddingVertical: 5 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: '#F1F1F1' },
  metaLabel: { fontSize: 7, color: MUTE, fontWeight: 700 },
  metaValue: { fontSize: 7.5, color: BLACK, fontWeight: 400 },
  metaValueBig: { fontSize: 10, color: RED, fontWeight: 700 },

  /* Items table */
  table: { borderWidth: 1, borderColor: RED, borderRadius: 3, overflow: 'hidden' },
  thead: { flexDirection: 'row', backgroundColor: RED },
  th: { color: WHITE, fontSize: 7, fontWeight: 700, letterSpacing: 0.3, paddingVertical: 5, paddingHorizontal: 5 },
  trow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE, alignItems: 'flex-start' },
  td: { fontSize: 8.5, paddingVertical: 6, paddingHorizontal: 5 },

  cHash: { width: 22, textAlign: 'center' },
  cDesc: { flex: 1 },
  cSac: { width: 52, textAlign: 'center' },
  cWo: { width: 66, textAlign: 'right' },
  cDuty: { width: 48, textAlign: 'center' },
  cRate: { width: 60, textAlign: 'right' },
  cAmt: { width: 72, textAlign: 'right' },

  svcName: { fontSize: 8.5, fontWeight: 700, color: BLACK },
  svcMeta: { fontSize: 7, color: MUTE, marginTop: 2 },

  /* Lower section */
  lower: { flexDirection: 'row', gap: 12, marginTop: 10 },
  lowerLeft: { flex: 1.15 },
  lowerRight: { flex: 1 },

  card: { borderWidth: 0.5, borderColor: LINE, borderRadius: 4, backgroundColor: PANEL, padding: 8, marginBottom: 8 },
  cardHeadRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  cardAccent: { width: 3, height: 10, backgroundColor: RED, borderRadius: 2, marginRight: 5 },
  cardHead: { fontSize: 7.5, fontWeight: 700, color: RED, letterSpacing: 1 },
  bankRow: { flexDirection: 'row', marginBottom: 4, alignItems: 'flex-start' },
  bankLabel: { width: 72, fontSize: 6.8, fontWeight: 700, color: MUTE, letterSpacing: 0.3 },
  bankValue: { flex: 1, fontSize: 7.5, fontWeight: 400, color: BLACK },

  /* Amount-in-words */
  words: { borderLeftWidth: 2.5, borderLeftColor: RED, backgroundColor: PANEL, borderTopRightRadius: 4, borderBottomRightRadius: 4, paddingLeft: 9, paddingRight: 7, paddingVertical: 6, marginBottom: 8 },
  wordsLabel: { fontSize: 6.5, fontWeight: 700, color: MUTE, letterSpacing: 0.6, marginBottom: 2 },
  wordsValue: { fontSize: 8.5, fontWeight: 700, color: BLACK, lineHeight: 1.35 },

  /* Payment status: a small neutral chip (dot + label), not a full-width color banner */
  payWrap: { borderRadius: 4, overflow: 'hidden', borderWidth: 0.5, borderColor: LINE, backgroundColor: WHITE },
  payHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 9, borderBottomWidth: 0.5, borderBottomColor: LINE },
  payDot: { width: 5, height: 5, borderRadius: 2.5, marginRight: 6 },
  payHeadText: { fontSize: 7.5, fontWeight: 700, letterSpacing: 0.6 },
  payBody: { backgroundColor: WHITE, paddingVertical: 5, paddingHorizontal: 9 },
  payLine: { fontSize: 7.5, color: INK, marginBottom: 1 },

  /* Totals panel — only the final "Amount Due" row carries strong color; everything above it stays neutral so the eye lands on one number */
  totals: { borderWidth: 0.5, borderColor: LINE, borderRadius: 4, overflow: 'hidden' },
  tRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: LINE },
  tLabel: { fontSize: 8, color: MUTE },
  tValue: { fontSize: 8, color: INK, fontWeight: 400 },
  tRowSub: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 10, backgroundColor: PANEL, borderBottomWidth: 0.5, borderBottomColor: LINE },
  tRowTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 11, backgroundColor: WHITE, borderTopWidth: 1, borderTopColor: BLACK, borderBottomWidth: 0.5, borderBottomColor: LINE },
  tTotalText: { fontSize: 10.5, fontWeight: 700, color: BLACK },
  tRowGrand: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, paddingHorizontal: 11, backgroundColor: RED },
  tGrandText: { fontSize: 11, fontWeight: 700, color: WHITE },

  /* Footer */
  footer: { marginTop: 12, borderTopWidth: 1.5, borderTopColor: RED, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  termsCol: { width: '60%' },
  termsHead: { fontSize: 7, fontWeight: 700, color: RED, letterSpacing: 0.6, marginBottom: 4 },
  termsText: { fontSize: 6.5, color: MUTE, lineHeight: 1.6 },
  declaration: { fontSize: 6.5, color: INK, marginTop: 7, lineHeight: 1.4 },
  signCol: { width: 140, alignItems: 'center' },
  signFor: { fontSize: 7, color: MUTE },
  signCompany: { fontSize: 7.5, fontWeight: 700, color: BLACK, textAlign: 'center', marginTop: 2 },
  signImg: { width: 88, height: 34, objectFit: 'contain', marginTop: 3, marginBottom: 2 },
  signLine: { width: 110, borderTopWidth: 1, borderTopColor: BLACK, marginTop: 3, paddingTop: 3, alignItems: 'center' },
  signLabel: { fontSize: 6.5, fontWeight: 700, color: INK, letterSpacing: 0.4 },

  pageFoot: { position: 'absolute', bottom: 12, left: 28, right: 80, textAlign: 'center', fontSize: 6.5, color: FAINT, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 4 },
  pageNum: { position: 'absolute', bottom: 16, right: 28, textAlign: 'right', fontSize: 7, fontWeight: 700, color: INK },

  copyMark: { fontSize: 6.5, fontWeight: 700, color: FAINT, letterSpacing: 1.4, marginBottom: 3 },

  /* Continuation strip on pages 2+ so a spilled table is never context-free */
  contBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1.5, borderBottomColor: RED, paddingBottom: 5, marginBottom: 9 },
  contTitle: { fontSize: 9, fontWeight: 700, color: RED, letterSpacing: 0.8 },
  contMeta: { fontSize: 7.5, color: MUTE },

  /* Table pieces split out so a page break never cuts through a border box */
  tableTopEdge: { borderTopWidth: 1, borderTopColor: RED, borderLeftWidth: 1, borderRightWidth: 1, borderColor: RED },
  tableSide: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: RED },
  tableBottomEdge: { borderBottomWidth: 1, borderBottomColor: RED, borderLeftWidth: 1, borderRightWidth: 1, borderColor: RED },
  contNote: { fontSize: 6.5, color: FAINT, fontWeight: 700, paddingVertical: 3, paddingHorizontal: 5 },
  rateDeriv: { fontSize: 6, color: FAINT, marginTop: 1 },

  tfootRow: { flexDirection: 'row', backgroundColor: PANEL, borderTopWidth: 1, borderTopColor: RED, alignItems: 'center' },
  tfootLabel: { fontSize: 7.5, fontWeight: 700, color: MUTE, paddingVertical: 5, paddingHorizontal: 5, textAlign: 'right' },

  sacTable: { borderWidth: 0.5, borderColor: LINE, borderRadius: 3, overflow: 'hidden', marginTop: 9, marginBottom: 8 },
  sacHead: { flexDirection: 'row', backgroundColor: '#F3F4F6' },
  sacTh: { fontSize: 6.3, fontWeight: 700, color: MUTE, paddingVertical: 4, paddingHorizontal: 5 },
  sacRow: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: LINE },
  sacTd: { fontSize: 7.5, color: INK, fontWeight: 400, paddingVertical: 3.5, paddingHorizontal: 5 },

  advice: { marginTop: 10, borderWidth: 0.5, borderColor: '#9CA3AF', borderStyle: 'dashed', borderRadius: 4, backgroundColor: PANEL, paddingHorizontal: 11, paddingTop: 8, paddingBottom: 8 },
  adviceHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 },
  adviceHead: { fontSize: 8.5, fontWeight: 700, color: BLACK, letterSpacing: 1 },
  adviceDue: { fontSize: 7.5, fontWeight: 400, color: MUTE },
  adviceCaption: { fontSize: 6.5, color: MUTE, lineHeight: 1.5, marginBottom: 6 },
  aRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: LINE },
  aLabel: { fontSize: 8, color: INK, flex: 1, paddingRight: 8 },
  aSubNote: { fontSize: 6.5, color: FAINT, marginTop: 3, lineHeight: 1.4 },
  aValue: { fontSize: 8, color: INK, fontWeight: 700 },
  aEntry: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, paddingLeft: 11 },
  aEntryText: { fontSize: 7, color: MUTE },
  aTotal: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: RED, paddingVertical: 7, paddingHorizontal: 9, marginTop: 5, borderRadius: 3 },
  aTotalText: { fontSize: 9.5, fontWeight: 700, color: WHITE, letterSpacing: 0.3 },
  aWords: { fontSize: 7, color: MUTE, marginTop: 5, lineHeight: 1.4 },

  tRowValue: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, backgroundColor: WHITE, borderTopWidth: 1.2, borderTopColor: BLACK, borderBottomWidth: 1.2, borderBottomColor: BLACK },
  tValueLabel: { fontSize: 10, fontWeight: 700, color: BLACK },
  tValueNote: { fontSize: 6, color: FAINT, letterSpacing: 0.4 },
  tValueAmt: { fontSize: 12, fontWeight: 700, color: BLACK },
});

const ce = React.createElement;

type PayloadResult = { payload: any } | { status: number; error: string };

const asDMY = (d?: string | null): string => {
  if (!d) return '';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? ''
    : dt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/**
 * Builds the render payload from the database rather than the request.
 *
 * This is what makes the endpoint forgery-proof: the caller supplies only an id,
 * so amounts, GSTIN and party details all come from our own records.
 *
 * When the receivable carries an `invoice_snapshot`, its stored lines and rates
 * are fed back through the engine. The engine is deterministic for a given set
 * of line inputs and rate basis, so this reproduces the issued figures exactly
 * instead of recomputing against today's rules.
 */
async function loadInvoicePayload(receivableId: string, actor: Actor): Promise<PayloadResult> {
  const admin = getSupabaseServiceClient();

  const { data: row, error } = await admin
    .from('receivables')
    .select('*')
    .eq('id', receivableId)
    .maybeSingle();

  if (error) return { status: 500, error: `Could not load invoice: ${error.message}` };
  if (!row) return { status: 404, error: 'Invoice not found.' };
  if (!canReadInvoice(actor, row.client_name)) {
    return { status: 403, error: 'You are not permitted to view this invoice.' };
  }

  // Lifecycle: downloading the PDF marks an invoice as "Issued". Only promote
  // invoices that are still in their initial state (created / legacy pending)
  // and have not already been issued, paid or cancelled. Best-effort: a failure
  // here must never block the PDF from being generated.
  const issuableStatuses = ['created', 'pending'];
  if (row.category === 'Invoices' && !row.issued_at && issuableStatuses.includes(String(row.status ?? ''))) {
    const issuedAt = new Date().toISOString();
    const { error: issueErr } = await admin
      .from('receivables')
      .update({ status: 'issued', issued_at: issuedAt })
      .eq('id', receivableId);
    if (!issueErr) {
      row.status = 'issued';
      row.issued_at = issuedAt;
    }
  }

  const { data: paymentRows } = await admin
    .from('receivable_payments')
    .select('*')
    .eq('receivable_id', receivableId)
    .order('created_at', { ascending: true });
  const payments = paymentRows ?? [];
  const received = payments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);

  // Legacy rows still hold some fields in the free-text notes blob; real columns
  // win where the migration has backfilled them.
  const notes = String(row.notes ?? '');
  const pick = (re: RegExp) => notes.match(re)?.[1]?.trim() ?? null;

  const snapshot = row.invoice_snapshot as any | null;
  const snapTax = snapshot?.taxInvoice;

  const gstPct = snapTax?.gstRate ?? (Number(pick(/GST:\s*([\d.]+)\s*%/)) || 0);
  const gstType: string = row.gst_type || 'cgst_sgst';
  const taxType = snapTax?.taxType ?? (gstType === 'igst' ? 'inter' : gstType === 'exempt' ? 'exempt' : 'intra');

  const items = ((snapTax?.lines ?? row.line_items ?? []) as InvoiceLineItem[]).map((li: any) => ({
    ...li,
    // Clean any accumulated duplicate shift suffixes from repeatedly edited invoices
    service: (li.service || '')
      .replace(/(\s*\(12-Hour\))+/g, ' (12-Hour)')
      .replace(/(\s*\(8-Hour\))+/g, ' (8-Hour)')
      .trim(),
  }));

  return {
    payload: {
      // Snapshot keeps the issued figures; the letterhead always reflects our
      // current registered address so a corrected address appears on reprints.
      companyInfo: withCurrentSupplierLetterhead(snapshot?.supplier),
      clientInfo:
        snapshot?.recipient ?? {
          name: row.client_name ?? '',
          address: row.client_address ?? pick(/Addr:\s*([^|]+)/) ?? '',
          gstin: row.client_gstin ?? pick(/GSTIN:\s*([0-9A-Za-z]{15})/) ?? '',
          state: (() => {
            const gstin: string = row.client_gstin ?? pick(/GSTIN:\s*([0-9A-Za-z]{15})/) ?? '';
            if (gstin.length >= 2) {
              const found = INDIAN_STATES.find((s: any) => s.code === gstin.slice(0, 2));
              if (found) return found.label;
            }
            const pos: string = row.place_of_supply ?? '';
            const posCode = pos.split('-')[0]?.trim();
            const posState = INDIAN_STATES.find((s: any) => s.code === posCode);
            return posState ? posState.label : pos;
          })(),
        },
      invoiceDetails: {
        invoiceNo: row.reference_number ?? '',
        date: snapshot?.meta?.date ?? asDMY(row.created_at),
        dueDate: snapshot?.meta?.dueDate ?? asDMY(row.due_date),
        placeOfSupply: row.place_of_supply ?? '',
        workOrderNo: snapshot?.meta?.workOrderNo ?? '',
        workOrderDate: snapshot?.meta?.workOrderDate ?? '',
        servicePeriodStart: row.service_period_start ?? null,
        servicePeriodEnd: row.service_period_end ?? null,
        irn: row.irn ?? null,
        irnQr: row.irn_qr ?? null,
        irnAckNo: row.irn_ack_no ?? null,
        irnAckDate: row.irn_ack_date ?? null,
      },
      items,
      taxConfig: {
        gstRate: gstPct,
        taxType,
        tdsRate: row.tds_rate != null ? Number(row.tds_rate) : Number(pick(/TDS:\s*([\d.]+)\s*%/)) || 0,
        received,
        // DB column wins; fall back to notes regex for invoices saved before the column existed
        previousBalance: Number(row.previous_balance ?? 0) ||
          Number((pick(/Previous Due:\s*₹?([\d,]+(?:\.\d+)?)/) ?? '').replace(/,/g, '')) || 0,
      },
      previousEntries: row.previous_balance_breakdown ?? [],
      paymentDetails: snapshot?.bank ?? {},
      invoiceStatus: row.status ?? 'pending',
      payments,
      gstTreatment: gstType === 'exempt' ? 'exempt' : 'forward',
      snapshot,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    /* ── Authentication ────────────────────────────────────────────────────
     * This endpoint previously accepted companyInfo/clientInfo/items/taxConfig
     * straight off the request body with no session check, so anyone who could
     * reach the URL could mint a PDF on company letterhead carrying an
     * arbitrary GSTIN and arbitrary amounts.
     *
     * Two changes close that:
     *   1. A valid Supabase access token is now required.
     *   2. The preferred call shape is `{ receivableId }` — the figures are read
     *      from the database server-side, so a caller cannot dictate them.
     *
     * The legacy payload shape still works, restricted to accounts/admin staff,
     * so existing callers keep functioning while they migrate. Remove that
     * branch once ManageReceivables passes receivableId.
     * ─────────────────────────────────────────────────────────────────────── */
    const actor = await authenticateActor(req);
    if (!actor) {
      return NextResponse.json(
        { error: 'Authentication required to generate an invoice PDF.' },
        { status: 401 }
      );
    }

    const rawBody = await req.json();
    let body = rawBody;

    if (rawBody?.receivableId) {
      const resolved = await loadInvoicePayload(String(rawBody.receivableId), actor);
      if ('status' in resolved) {
        return NextResponse.json({ error: resolved.error }, { status: resolved.status });
      }
      body = resolved.payload;
    } else if (!isInvoiceStaff(actor)) {
      // A client-portal user must not be able to hand us numbers of their own.
      return NextResponse.json(
        { error: 'Pass { receivableId }. Supplying invoice figures directly is not permitted.' },
        { status: 403 }
      );
    }

    const {
      companyInfo: rawCompanyInfo = {}, invoiceDetails = {}, clientInfo = {}, items = [],
      taxConfig = {}, paymentDetails = {}, invoiceStatus = 'pending', payments = [],
      gstTreatment = null,
    } = body;

    // The letterhead is ours, never the caller's. This also covers the legacy
    // payload branch above, so a stale snapshot or a hand-rolled body can never
    // put an outdated registered address on our letterhead.
    const companyInfo = withCurrentSupplierLetterhead(rawCompanyInfo);

    /* ── Shared calculation engine (identical to the screen view) ─────────── */
    // receivable_payments.amount is stored as (cash + TDS). The Payment Advice
    // shows TDS on its own line, so "Payments received" must be pure cash or the
    // TDS is subtracted twice. Compute the invoice TDS first, then strip it out
    // of the summed payments before feeding `received` into the totals engine.
    const tdsProbe = computeInvoiceTotals(items as InvoiceLineItem[], { ...taxConfig, received: 0 });
    const cashReceived = Math.max(0, (Number(taxConfig.received) || 0) - (tdsProbe.tds || 0));
    const totals = computeInvoiceTotals(items as InvoiceLineItem[], { ...taxConfig, received: cashReceived });
    const { lines, subTotal, sgst, cgst, tds, roundOff, invoiceTotal, received, previousBalance, currentBalance } = totals;
    const sgstRate = taxConfig.sgstRate ?? 9;
    const cgstRate = taxConfig.cgstRate ?? 9;
    const igstRate = taxConfig.igstRate ?? 0;
    const tdsRate = taxConfig.tdsRate ?? 0;
    const isIGST = igstRate > 0;

    const isPaid = invoiceStatus === 'received';
    const isPartial = payments.length > 0 && !isPaid;

    /* ── Reusable pieces ───────────────────────────────────────────────── */
    const invNo = invoiceDetails.invoiceNo || '—';
    const supplierPan = companyInfo.pan || panFromGstin(companyInfo.gstin || '21ABDCS8727K1Z4');
    const period = formatServicePeriod(invoiceDetails.servicePeriodStart, invoiceDetails.servicePeriodEnd);

    const advice = buildPaymentAdvice(
      totals,
      invNo,
      (body.previousEntries ?? []) as any[],
      invoiceDetails.dueDate
    );
    const hasAdvice = advice.tds > 0 || advice.received > 0 || advice.previousBalance > 0;

    const metaRows: [string, string, string?][] = [
      ['Invoice No.', invNo, 'big'],
      ['Date', invoiceDetails.date || '—'],
      ['Due Date', invoiceDetails.dueDate || '—'],
      ...(period ? ([[L.servicePeriod, period]] as [string, string][]) : []),
      ['Place of Supply', invoiceDetails.placeOfSupply || '21-Odisha'],
      ...(invoiceDetails.workOrderNo ? ([['Work Order No.', invoiceDetails.workOrderNo]] as [string, string][]) : []),
      ...(invoiceDetails.workOrderDate ? ([['Work Order Date', invoiceDetails.workOrderDate]] as [string, string][]) : []),
    ];

    const showWoCol = lines.some((item: any) => !item.hideWoPrice);
    const sacSummary = totals.sacSummary ?? [];
    const hasEInvoice = !!(invoiceDetails.irn && invoiceDetails.irnQr);



    /* ── Block builders (each is wrap={false} so it moves whole) ────────── */

    const tableHead = (key: string) =>
      ce(View, { key, style: { ...S.thead, ...S.tableTopEdge }, wrap: false },
        ce(Text, { style: { ...S.th, ...S.cHash } }, '#'),
        ce(Text, { style: { ...S.th, ...S.cDesc } }, L.serviceAndPost),
        ce(Text, { style: { ...S.th, ...S.cSac } }, 'SAC'),
        showWoCol ? ce(Text, { style: { ...S.th, ...S.cWo } }, 'CONTRACT PRICE') : null,
        ce(Text, { style: { ...S.th, ...S.cDuty } }, L.duties),
        ce(Text, { style: { ...S.th, ...S.cRate } }, 'RATE/DUTY'),
        ce(Text, { style: { ...S.th, ...S.cAmt } }, 'AMOUNT'),
      );

    // A row is atomic: wrap={false} stops @react-pdf breaking between the
    // service name and its "@ post" / rate-derivation sub-lines.
    const tableRow = (item: any, idx: number) =>
      ce(View, { key: `r${idx}`, style: { ...S.trow, ...S.tableSide }, wrap: false },
        ce(Text, { style: { ...S.td, ...S.cHash, fontWeight: 700, color: MUTE } }, String(idx + 1)),
        ce(View, { style: { ...S.td, ...S.cDesc } },
          ce(Text, { style: S.svcName }, item.service || '—'),
          item.personnel ? ce(Text, { style: S.svcMeta }, `${item.personnel} ${L.personnelSuffix}`) : null,
          (item.post && !item.hideLocation) ? ce(Text, { style: S.svcMeta }, `@ ${item.post}`) : null,
        ),
        ce(Text, { style: { ...S.td, ...S.cSac, color: MUTE } }, item.sac || DEFAULT_SAC_SECURITY),
        showWoCol ? ce(Text, { style: { ...S.td, ...S.cWo, fontWeight: 700 } }, item.hideWoPrice ? '—' : num(item.woPrice || 0)) : null,
        ce(Text, { style: { ...S.td, ...S.cDuty, fontWeight: 700 } }, String(item.duties || 0)),
        ce(View, { style: { ...S.td, ...S.cRate } },
          ce(Text, { style: { fontSize: 8.5, color: INK, fontWeight: 700, textAlign: 'right' } }, `\u20B9${numInt(item.rate ?? 0)}`),
          item.rateDerivation ? ce(Text, { style: { ...S.rateDeriv, textAlign: 'right' } }, item.rateDerivation) : null,
        ),
        ce(Text, { style: { ...S.td, ...S.cAmt, fontWeight: 700, color: BLACK } }, numInt(item.amount)),
      );

    const headerBlock = () =>
      ce(View, { key: 'hdr', wrap: false },
        ce(Text, { style: S.copyMark }, invoiceCopyLabel(invoiceDetails.copyType)),
        ce(View, { style: S.header },
          ce(View, { style: S.brandRow },
            LOGO_SRC ? ce(Image, { src: LOGO_SRC, style: S.logo }) : null,
            ce(View, { style: S.brandDivider },
              // companyInfo is normalised through withCurrentSupplierLetterhead,
              // so these are always populated — no inline address duplication.
              ce(Text, { style: S.companyName }, companyInfo.name),
              ce(Text, { style: S.companyLine }, companyInfo.addressLine1),
              ce(Text, { style: S.companyLine }, companyInfo.addressLine2),
              ce(Text, { style: S.companyEmail }, companyInfo.email),
            ),
          ),
          ce(View, { style: S.titleBox },
            ce(Text, { style: S.invoiceTitle }, L.documentTitle),
            ce(View, { style: S.taxIdBox },
              ce(View, { style: S.taxIdRow },
                ce(Text, { style: S.taxIdLabel }, 'GSTIN'),
                ce(Text, { style: S.taxIdValue }, companyInfo.gstin || '21ABDCS8727K1Z4'),
              ),
              ce(View, { style: S.taxIdRow },
                ce(Text, { style: S.taxIdLabel }, 'STATE'),
                ce(Text, { style: S.taxIdValue }, companyInfo.state || '21-Odisha'),
              ),
              // PAN: the client deducts TDS and needs it to claim credit.
              supplierPan ? ce(View, { style: { ...S.taxIdRow, marginBottom: companyInfo.cin ? 1 : 0 } },
                ce(Text, { style: S.taxIdLabel }, 'PAN'),
                ce(Text, { style: S.taxIdValue }, supplierPan),
              ) : null,
              companyInfo.cin ? ce(View, { style: { ...S.taxIdRow, marginBottom: 0 } },
                ce(Text, { style: S.taxIdLabel }, 'CIN'),
                ce(Text, { style: S.taxIdValue }, companyInfo.cin),
              ) : null,
            ),
          ),
        ),
        ce(View, { style: S.rule }),
      );

    const partiesBlock = () =>
      ce(View, { key: 'parties', style: S.parties, wrap: false },
        ce(View, { style: S.partyBox },
          ce(View, { style: S.partyHead }, ce(Text, { style: S.partyHeadText }, L.billTo)),
          ce(View, { style: S.partyBody },
            ce(Text, { style: S.partyName }, clientInfo.name || '—'),
            ce(Text, { style: S.partyLine }, clientInfo.address || 'Address not on record'),
            ce(View, { style: S.kv },
              ce(Text, { style: S.kvLabel }, 'GSTIN'),
              ce(Text, { style: S.kvValue }, clientInfo.gstin || 'Unregistered / —'),
            ),
            ce(View, { style: S.kv },
              ce(Text, { style: S.kvLabel }, 'State'),
              ce(Text, { style: S.kvValue }, clientInfo.state || '21-Odisha'),
            ),
          ),
        ),
        ce(View, { style: S.partyBox },
          ce(View, { style: S.partyHead }, ce(Text, { style: S.partyHeadText }, L.invoiceDetailsHead)),
          ce(View, { style: S.metaGrid },
            ...metaRows.map(([label, value, big], i) =>
              ce(View, { key: label, style: { ...S.metaRow, borderBottomWidth: i === metaRows.length - 1 ? 0 : 0.5 } },
                ce(Text, { style: S.metaLabel }, label),
                ce(Text, { style: big === 'big' ? S.metaValueBig : S.metaValue }, value),
              )
            ),
          ),
        ),
      );

    const eInvoiceBlock = () =>
      ce(View, { key: 'einv', style: { ...S.card, flexDirection: 'row', alignItems: 'center' }, wrap: false },
        ce(Image, { src: invoiceDetails.irnQr, style: { width: 58, height: 58, marginRight: 10, objectFit: 'contain' } }),
        ce(View, { style: { flex: 1 } },
          ce(View, { style: S.kv }, ce(Text, { style: S.kvLabel }, 'IRN'), ce(Text, { style: { ...S.kvValue, fontSize: 6 } }, invoiceDetails.irn)),
          ce(View, { style: S.kv }, ce(Text, { style: S.kvLabel }, 'Ack No.'), ce(Text, { style: S.kvValue }, invoiceDetails.irnAckNo || '—')),
          ce(View, { style: S.kv }, ce(Text, { style: S.kvLabel }, 'Ack Date'), ce(Text, { style: S.kvValue }, invoiceDetails.irnAckDate || '—')),
        ),
      );

    const contBar = (pageLabel: string) =>
      ce(View, { key: 'cont', style: S.contBar, wrap: false },
        ce(Text, { style: S.contTitle }, `${L.documentTitle} · ${invNo}`),
        ce(Text, { style: S.contMeta }, `${clientInfo.name || ''}  ·  ${pageLabel}`),
      );

    const tableFoot = () =>
      ce(View, { key: 'tfoot', style: { ...S.tfootRow, ...S.tableBottomEdge }, wrap: false },
        ce(Text, { style: { ...S.tfootLabel, ...S.cHash } }, ''),
        ce(Text, { style: { ...S.tfootLabel, ...S.cDesc } }, 'TOTAL'),
        ce(Text, { style: { ...S.tfootLabel, ...S.cSac } }, ''),
        showWoCol ? ce(Text, { style: { ...S.tfootLabel, ...S.cWo } }, '') : null,
        ce(Text, { style: { ...S.td, ...S.cDuty, fontWeight: 700, color: BLACK } }, String(totals.totalDuties ?? 0)),
        ce(Text, { style: { ...S.tfootLabel, ...S.cRate } }, ''),
        ce(Text, { style: { ...S.td, ...S.cAmt, fontWeight: 700, color: BLACK } }, numInt(subTotal)),
      );

    // Only worth printing when there is more than one SAC/rate group — with a
    // single group it restates the line and the totals panel, and costs a page.
    const sacBlock = () =>
      !showSacSummary(sacSummary.length) ? null :
      ce(View, { key: 'sac', style: S.sacTable, wrap: false },
        ce(View, { style: S.sacHead },
          ce(Text, { style: { ...S.sacTh, flex: 1 } }, 'SAC'),
          ce(Text, { style: { ...S.sacTh, width: 62, textAlign: 'right' } }, 'TAXABLE'),
          ce(Text, { style: { ...S.sacTh, width: 32, textAlign: 'center' } }, 'RATE'),
          ...(isIGST
            ? [ce(Text, { key: 'i', style: { ...S.sacTh, width: 54, textAlign: 'right' } }, 'IGST')]
            : [
                ce(Text, { key: 'c', style: { ...S.sacTh, width: 54, textAlign: 'right' } }, 'CGST'),
                ce(Text, { key: 's', style: { ...S.sacTh, width: 54, textAlign: 'right' } }, 'SGST'),
              ]),
          ce(Text, { style: { ...S.sacTh, width: 56, textAlign: 'right' } }, 'TOTAL TAX'),
        ),
        ...sacSummary.map((r: any) =>
          ce(View, { key: `${r.sac}-${r.gstRate}`, style: S.sacRow },
            ce(Text, { style: { ...S.sacTd, flex: 1 } }, r.sac),
            ce(Text, { style: { ...S.sacTd, width: 62, textAlign: 'right' } }, numInt(r.taxableValue)),
            ce(Text, { style: { ...S.sacTd, width: 32, textAlign: 'center' } }, `${r.gstRate}%`),
            ...(isIGST
              ? [ce(Text, { key: 'i', style: { ...S.sacTd, width: 54, textAlign: 'right' } }, numInt(r.igst))]
              : [
                  ce(Text, { key: 'c', style: { ...S.sacTd, width: 54, textAlign: 'right' } }, numInt(r.cgst)),
                  ce(Text, { key: 's', style: { ...S.sacTd, width: 54, textAlign: 'right' } }, numInt(r.sgst)),
                ]),
            ce(Text, { style: { ...S.sacTd, width: 56, textAlign: 'right', fontWeight: 700 } }, numInt(r.totalTax)),
          )
        ),
      );

    // Tax invoice totals — ends at INVOICE VALUE and nothing beyond it, so the
    // GSTR-1 document value is the unambiguous bottom line of the tax invoice.
    const totalsBlock = () =>
      ce(View, { key: 'totals', style: S.totals, wrap: false },
        ce(View, { style: S.tRowSub },
          ce(Text, { style: { fontSize: 9, fontWeight: 700, color: BLACK } }, L.taxableValue),
          ce(Text, { style: { fontSize: 9, fontWeight: 700, color: BLACK } }, `\u20B9${numInt(subTotal)}`),
        ),
        ...(isIGST ? [
          ce(View, { key: 'igst', style: S.tRow },
            ce(Text, { style: S.tLabel }, `IGST @ ${igstRate}%`),
            ce(Text, { style: S.tValue }, numInt(totals.igst ?? 0)),
          ),
        ] : [
          ce(View, { key: 'cgst', style: S.tRow },
            ce(Text, { style: S.tLabel }, `CGST @ ${cgstRate}%`),
            ce(Text, { style: S.tValue }, numInt(cgst)),
          ),
          ce(View, { key: 'sgst', style: S.tRow },
            ce(Text, { style: S.tLabel }, `SGST @ ${sgstRate}%`),
            ce(Text, { style: S.tValue }, numInt(sgst)),
          ),
        ]),
        roundOff !== 0 ? ce(View, { style: S.tRow },
          ce(Text, { style: { ...S.tLabel, fontSize: 7.5 } }, 'Round Off'),
          ce(Text, { style: { ...S.tValue, fontSize: 7.5, color: MUTE } }, `${roundOff >= 0 ? '+ ' : '- '}${num(Math.abs(roundOff))}`),
        ) : null,
        ce(View, { style: S.tRowValue },
          ce(View, null,
            ce(Text, { style: S.tValueLabel }, L.invoiceTotal),
            ce(Text, { style: S.tValueNote }, L.invoiceTotalNote.toUpperCase()),
          ),
          ce(Text, { style: S.tValueAmt }, money(invoiceTotal)),
        ),
      );

    // Statement of account. Captioned so it cannot be read as part of the tax
    // invoice, which is what keeps the previous-dues carry-forward compliant.
    const adviceBlock = () =>
      !hasAdvice ? null :
      ce(View, { key: 'advice', style: S.advice, wrap: false },
        ce(View, { style: S.adviceHeadRow },
          ce(Text, { style: S.adviceHead }, L.paymentAdviceHead),
          advice.dueDate ? ce(Text, { style: S.adviceDue }, `Payment due by ${advice.dueDate}`) : null,
        ),
        ce(Text, { style: S.adviceCaption }, L.adviceDisclaimer),
        ce(View, { style: S.aRow },
          ce(Text, { style: S.aLabel }, `This invoice (${invNo})`),
          ce(Text, { style: S.aValue }, num(advice.invoiceTotal)),
        ),
        advice.tds > 0 ? ce(View, { style: S.aRow },
          ce(View, { style: { flex: 1, paddingRight: 8 } },
            ce(Text, { style: S.aLabel }, `Less: TDS @ ${advice.tdsRate}% u/s 194C`),
            ce(Text, { style: S.aSubNote }, L.tdsNote),
          ),
          ce(Text, { style: { ...S.aValue, marginTop: 2 } }, `\u2212 ${numInt(advice.tds)}`),
        ) : null,
        advice.received > 0 ? ce(View, { style: S.aRow },
          ce(Text, { style: S.aLabel }, L.amountReceived),
          ce(Text, { style: S.aValue }, `- ${num(advice.received)}`),
        ) : null,
        advice.previousBalance !== 0 ? ce(View, null,
          ce(View, { style: { ...S.aRow, borderBottomWidth: advice.previousEntries.length ? 0 : 0.5 } },
            ce(Text, { style: S.aLabel }, 'Previous outstanding'),
            ce(Text, { style: S.aValue }, advice.previousEntries.length ? '' : num(advice.previousBalance)),
          ),
          // Itemised: a bare carried-forward figure is what clients dispute.
          ...advice.previousEntries.map((e: any) =>
            ce(View, { key: e.referenceNumber, style: S.aEntry },
              ce(Text, { style: S.aEntryText }, `· ${e.referenceNumber}${e.date ? `  ·  ${e.date}` : ''}`),
              ce(Text, { style: S.aEntryText }, num(e.amount)),
            )
          ),
          advice.previousEntries.length ? ce(View, { style: { ...S.aRow, paddingLeft: 10 } },
            ce(Text, { style: { ...S.aEntryText, fontWeight: 700 } }, 'Sub-total'),
            ce(Text, { style: { ...S.aEntryText, fontWeight: 700 } }, num(advice.previousBalance)),
          ) : null,
        ) : null,
        ce(View, { style: S.aTotal },
          ce(Text, { style: S.aTotalText }, L.amountDue),
          ce(Text, { style: S.aTotalText }, money(advice.totalPayable)),
        ),
        ce(Text, { style: S.aWords }, `${L.payableWords}: ${amountInWords(advice.totalPayable)}`),
      );

    const lowerBlock = () =>
      ce(View, { key: 'lower', style: S.lower },
        // LEFT: SAC summary (when present) + Bank Details + words
        ce(View, { style: S.lowerLeft, wrap: false },
          // SAC table sits directly above bank details in the left column
          showSacSummary(sacSummary.length) ? ce(View, { style: { ...S.sacTable, marginTop: 0 } },
            ce(View, { style: S.sacHead },
              ce(Text, { style: { ...S.sacTh, flex: 1 } }, 'SAC'),
              ce(Text, { style: { ...S.sacTh, width: 56, textAlign: 'right' } }, 'TAXABLE'),
              ce(Text, { style: { ...S.sacTh, width: 28, textAlign: 'center' } }, 'RATE'),
              ...(isIGST
                ? [ce(Text, { key: 'i', style: { ...S.sacTh, width: 48, textAlign: 'right' } }, 'IGST')]
                : [
                    ce(Text, { key: 'c', style: { ...S.sacTh, width: 44, textAlign: 'right' } }, 'CGST'),
                    ce(Text, { key: 's', style: { ...S.sacTh, width: 44, textAlign: 'right' } }, 'SGST'),
                  ]),
              ce(Text, { style: { ...S.sacTh, width: 48, textAlign: 'right' } }, 'TAX'),
            ),
            ...sacSummary.map((r: any) =>
              ce(View, { key: `${r.sac}-${r.gstRate}`, style: S.sacRow },
                ce(Text, { style: { ...S.sacTd, flex: 1 } }, r.sac),
                ce(Text, { style: { ...S.sacTd, width: 56, textAlign: 'right' } }, numInt(r.taxableValue)),
                ce(Text, { style: { ...S.sacTd, width: 28, textAlign: 'center' } }, `${r.gstRate}%`),
                ...(isIGST
                  ? [ce(Text, { key: 'i', style: { ...S.sacTd, width: 48, textAlign: 'right' } }, numInt(r.igst))]
                  : [
                      ce(Text, { key: 'c', style: { ...S.sacTd, width: 44, textAlign: 'right' } }, numInt(r.cgst)),
                      ce(Text, { key: 's', style: { ...S.sacTd, width: 44, textAlign: 'right' } }, numInt(r.sgst)),
                    ]),
                ce(Text, { style: { ...S.sacTd, width: 48, textAlign: 'right', fontWeight: 700 } }, numInt(r.totalTax)),
              )
            ),
          ) : null,
          ce(View, { style: { ...S.card, marginTop: showSacSummary(sacSummary.length) ? 10 : 0 } },
            ce(View, { style: S.cardHeadRow },
              ce(View, { style: S.cardAccent }),
              ce(Text, { style: S.cardHead }, L.bankDetails),
            ),
            ...[
              ['BANK', paymentDetails.bankName || 'Axis Bank'],
              ['A/C NUMBER', paymentDetails.bankAccountNo || '921020000544081'],
              ['IFSC CODE', paymentDetails.ifscCode || 'UTIB0000091'],
              ['BENEFICIARY', paymentDetails.accountName || 'Safend Secure Solutions Private Limited'],
            ].map(([label, value]: any) =>
              ce(View, { key: label, style: S.bankRow },
                ce(Text, { style: S.bankLabel }, label),
                ce(Text, { style: S.bankValue }, value),
              )
            ),
          ),
          ce(View, { style: S.words },
            ce(Text, { style: S.wordsLabel }, L.totalAmountWords),
            ce(Text, { style: S.wordsValue }, amountInWords(invoiceTotal)),
          ),
          (isPaid || isPartial) ? ce(View, { style: S.payWrap },
            ce(View, { style: S.payHead },
              ce(View, { style: { ...S.payDot, backgroundColor: isPaid ? '#15803D' : RED } }),
              ce(Text, { style: { ...S.payHeadText, color: isPaid ? '#15803D' : RED } }, isPaid ? 'PAID IN FULL' : 'PARTIALLY PAID'),
            ),
            ce(View, { style: S.payBody },
              ...(payments.length ? payments : [{}]).map((p: any, i: number) =>
                ce(Text, { key: String(i), style: S.payLine }, formatPaymentLine(p))
              ),
            ),
          ) : null,
        ),
        // RIGHT: Totals panel
        ce(View, { style: S.lowerRight, wrap: false }, totalsBlock()),
      );

    const footerBlock = () =>
      ce(View, { key: 'foot', style: S.footer, wrap: false },
        ce(View, { style: S.termsCol },
          ce(Text, { style: S.termsHead }, L.termsAndConditions),
          ce(Text, { style: S.termsText }, paymentDetails.terms || L.defaultTerms),
          ce(Text, { style: S.declaration }, getInvoiceDeclaration(gstTreatment)),
        ),
        ce(View, { style: S.signCol },
          ce(Text, { style: S.signFor }, 'For'),
          ce(Text, { style: S.signCompany }, companyInfo.name || 'Safend Secure Solutions Private Limited'),
          SIGN_SRC ? ce(Image, { src: SIGN_SRC, style: S.signImg }) : null,
          ce(View, { style: S.signLine },
            ce(Text, { style: S.signLabel }, 'AUTHORISED SIGNATORY'),
          ),
        ),
      );

    /* ── Assemble ──────────────────────────────────────────────────────── */
    const doc = ce(Document, { title: `Invoice ${invNo}`, author: companyInfo.name || 'Safend Secure Solutions' },
      ce(Page, { size: 'A4', style: S.page },

        // Page 1 letterhead
        headerBlock(),
        partiesBlock(),
        hasEInvoice ? eInvoiceBlock() : null,

        // Line items — each row is wrap={false} so rows never break internally,
        // but the table as a whole flows naturally across pages.
        tableHead('th0'),
        ...lines.map((item: any, i: number) => tableRow(item, i)),
        tableFoot(),

        // Closing stack — wrap={false} on each block so they move whole to next
        // page rather than breaking internally.
        lowerBlock(),
        adviceBlock(),
        footerBlock(),

        // Fixed footer on every page — page number sits on the right of the border line
        ce(Text, { key: 'pf', style: S.pageFoot, fixed: true }, L.pageFooterNote),
        ce(Text, {
          key: 'pn',
          style: S.pageNum,
          fixed: true,
          render: ({ pageNumber, totalPages: tp }: any) => `Page ${pageNumber} / ${tp}`,
        } as any),
      )
    );

    const pdfBuffer = await pdf(doc).toBuffer();

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Invoice_${invoiceDetails.invoiceNo || 'draft'}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('Invoice PDF generation error:', err);
    return NextResponse.json({ error: err.message || 'PDF generation failed' }, { status: 500 });
  }
}
