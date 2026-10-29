import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import path from 'path';
import fs from 'fs';
import { getSupabaseServiceClient } from '@/lib/supabase/server';
import { authenticateActor, canReadInvoice, isInvoiceStaff, type Actor } from '@/lib/supabase/auth';
import { Document, Page, Text, View, Image, StyleSheet, Font, pdf } from '@react-pdf/renderer';
import {
  formatNumber as num,
  formatMoney as money,
  INVOICE_LABELS as L,
  NOTE_LABELS as N,
  invoiceCopyLabel,
} from '@/lib/invoice/calculations';
import {
  DOCUMENT_LABELS as D,
  documentHeadings,
  formatServicePeriod,
  frozenNotice,
  panFromGstin,
  snapshotOf,
  type BankDetails,
  type InvoiceDocumentModel,
} from '@/lib/invoice/document';
import {
  buildInvoiceViewData,
  carriedReferenceNumbers,
  documentFromViewData,
  issuePatch,
  originalInvoiceLookup,
  shouldFreezeOnDownload,
} from '@/lib/invoice/document-input';
import { showSacSummary } from '@/lib/invoice/pdfPagination';

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
  cancelBanner: { fontSize: 14, fontWeight: 700, color: RED, letterSpacing: 5, textAlign: 'center', borderWidth: 1.5, borderColor: RED, borderRadius: 3, paddingVertical: 3, marginBottom: 6 },
  linesNote: { fontSize: 6.5, color: MUTE, marginTop: 3 },

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

type LoadResult = { doc: InvoiceDocumentModel } | { status: number; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The active bank account, which the screen view also prints. Null when none is set up. */
async function activeBankAccount(admin: ReturnType<typeof getSupabaseServiceClient>): Promise<Partial<BankDetails> | null> {
  const { data, error } = await admin
    .from('bank_accounts')
    .select('account_name, account_number, bank_name, ifsc_code')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const bank: Partial<BankDetails> = {};
  if (data.bank_name) bank.bankName = data.bank_name;
  if (data.account_number) bank.bankAccountNo = data.account_number;
  if (data.ifsc_code) bank.ifscCode = data.ifsc_code;
  if (data.account_name) bank.accountName = data.account_name;
  return bank;
}

/**
 * Builds the document from the database, never from the request: the caller
 * supplies only an id, so amounts, GSTIN and party details all come from our
 * own records. It goes through the same builder as the screen view
 * (buildInvoiceViewData → documentFromViewData), so the download matches it.
 *
 * The first download by staff of a never-issued invoice, credit note or debit
 * note issues it: the document is frozen onto invoice_snapshot and issued_at
 * is set (the database keeps both write-once). Client-portal downloads never
 * issue. Credit and debit notes also load their original invoice, whose
 * number and date they print.
 */
async function loadInvoiceDocument(receivableId: string, actor: Actor): Promise<LoadResult> {
  const admin = getSupabaseServiceClient();

  const { data: row, error } = await admin
    .from('receivables')
    .select('*')
    .eq('id', receivableId)
    .maybeSingle();

  if (error) return { status: 500, error: `Could not load invoice: ${error.message}` };
  if (!row) return { status: 404, error: 'Invoice not found.' };
  // Only tax invoices and credit/debit notes are GST documents; other receivables
  // (event letters, tax refunds, other income) must not print as a tax invoice.
  if (row.category !== 'Invoices' && row.category !== 'Invoice Adjustments') {
    return { status: 400, error: 'Only tax invoices and credit/debit notes can be printed.' };
  }
  if (!canReadInvoice(actor, row.client_name)) {
    return { status: 403, error: 'You are not permitted to view this invoice.' };
  }
  // Clients see an invoice once it is issued, never a draft Accounts can still
  // change (same rule as the receivables_select_client policy).
  const isDraft = row.status === 'created' && !row.issued_at && !(Number(row.paid_amount) > 0);
  if (!isInvoiceStaff(actor) && isDraft) {
    return { status: 404, error: 'Invoice not found.' };
  }

  // Payment rows supply the receipt details. If they fail to load the statement
  // still adds up: it falls back to the row's trigger-maintained paid, TDS and
  // credit-note columns.
  const { data: payments, error: payErr } = await admin
    .from('receivable_payments')
    .select('*')
    .eq('receivable_id', receivableId)
    .order('created_at', { ascending: true });
  if (payErr) console.error(`Invoice PDF ${receivableId}: payments not loaded: ${payErr.message}`);

  // Older invoices this one lists, looked up live. A failure here would print
  // too small a "total payable", so it fails the download instead.
  const refs = carriedReferenceNumbers(row);
  let carried: Record<string, any>[] = [];
  if (refs.length > 0 && row.work_order_id) {
    const { data, error: carriedErr } = await admin
      .from('receivables')
      .select('*')
      .eq('category', 'Invoices')
      .eq('work_order_id', row.work_order_id)
      .in('reference_number', refs);
    if (carriedErr) return { status: 500, error: `Could not load the earlier invoices: ${carriedErr.message}` };
    carried = data ?? [];
  }

  // A credit/debit note prints the number and date of its original invoice.
  // buildInvoiceViewData ignores it unless it is the one named and of the same client.
  const lookup = originalInvoiceLookup(row);
  let original: Record<string, any> | null = null;
  if (lookup) {
    let q = admin.from('receivables').select('*').eq('category', 'Invoices');
    q = 'id' in lookup
      ? q.eq('id', lookup.id)
      : q.eq('reference_number', lookup.referenceNumber).eq('client_name', lookup.clientName);
    const { data, error: origErr } = await q.limit(1).maybeSingle();
    if (origErr) return { status: 500, error: `Could not load the original invoice: ${origErr.message}` };
    original = data ?? null;
  }

  const bank = await activeBankAccount(admin);
  let { doc } = documentFromViewData(buildInvoiceViewData(row, payments ?? [], carried, { original }), { bank });

  // Issue on first staff download. The filters make a concurrent second
  // download a no-op instead of tripping the write-once guard. Best-effort: a
  // failure here never blocks the PDF.
  if (isInvoiceStaff(actor) && shouldFreezeOnDownload(row) && doc.blockedReasons.length === 0) {
    const issuedAt = new Date().toISOString();
    const { error: issueErr } = await admin
      .from('receivables')
      .update(issuePatch(row, snapshotOf(doc, issuedAt), issuedAt))
      .eq('id', receivableId)
      .is('issued_at', null)
      .is('invoice_snapshot', null);
    if (issueErr) {
      console.error(`Invoice PDF ${row.reference_number ?? receivableId}: not marked issued: ${issueErr.message}`);
    } else {
      doc = { ...doc, issuedAt };
    }
  }

  return { doc };
}

export async function POST(req: NextRequest) {
  try {
    /* ── Authentication and input ──────────────────────────────────────────
     * A valid Supabase access token is required, and the only accepted body is
     * { receivableId }: every figure is read from the database. The branch that
     * rendered caller-supplied figures is gone, so nobody can put amounts or a
     * GSTIN of their own on our letterhead. Client-portal users may download
     * their own client's invoices (canReadInvoice).
     * ─────────────────────────────────────────────────────────────────────── */
    const actor = await authenticateActor(req);
    if (!actor) {
      return NextResponse.json(
        { error: 'Authentication required to generate an invoice PDF.' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    const receivableId = typeof body?.receivableId === 'string' ? body.receivableId.trim() : '';
    if (!UUID_RE.test(receivableId)) {
      return NextResponse.json(
        { error: 'Pass { receivableId }. Invoice figures are read from the database, never from the request.' },
        { status: 400 }
      );
    }

    const loaded = await loadInvoiceDocument(receivableId, actor);
    if ('status' in loaded) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }

    /* ── The document model: the same one the screen view renders ──────── */
    const model = loaded.doc;
    const { supplier: companyInfo, recipient: clientInfo, meta, taxInvoice: ti, statement, bank, eInvoice } = model;
    const lines = ti.lines;
    const isIGST = ti.taxType === 'inter';
    const isExempt = ti.taxType === 'exempt';
    const cancelled = statement.state === 'cancelled';
    // Reconciled lines close onto the recorded taxable value via the round-off row.
    const tableTotal = ti.linesReconciled ? ti.taxableValue : ti.linesTotal;
    const invNo = meta.invoiceNo || '—';
    const supplierPan = companyInfo.pan || panFromGstin(companyInfo.gstin);
    const period = formatServicePeriod(meta.servicePeriodStart, meta.servicePeriodEnd);

    // Title and figure labels: TAX INVOICE, CREDIT NOTE or DEBIT NOTE (Rule 53).
    const H = documentHeadings(model.documentType);
    const note = model.note;
    const frozen = frozenNotice(model);
    const noteRows: [string, string][] = !note ? [] : note.originalInvoiceNo
      ? [[N.originalInvoice, note.originalInvoiceNo], [N.originalInvoiceDate, note.originalInvoiceDate || '—']]
      : [[N.originalInvoice, N.originalNotLinked]];

    const metaRows: [string, string, string?][] = [
      [H.numberLabel, invNo, 'big'],
      ['Date', meta.date || '—'],
      ...noteRows,
      ...(H.showDueDate ? ([['Due Date', meta.dueDate || '—']] as [string, string][]) : []),
      ...(period ? ([[L.servicePeriod, period]] as [string, string][]) : []),
      ['Place of Supply', meta.placeOfSupply || '21-Odisha'],
      ...(meta.workOrderNo ? ([['Work Order No.', meta.workOrderNo]] as [string, string][]) : []),
      ...(meta.workOrderDate ? ([['Work Order Date', meta.workOrderDate]] as [string, string][]) : []),
    ];

    const showWoCol = lines.some((item) => !item.hideWoPrice);
    const sacSummary = ti.sacSummary ?? [];
    const hasEInvoice = !!(eInvoice.irn && eInvoice.qr);



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
    const tableRow = (item: (typeof lines)[number], idx: number) =>
      ce(View, { key: `r${idx}`, style: { ...S.trow, ...S.tableSide }, wrap: false },
        ce(Text, { style: { ...S.td, ...S.cHash, fontWeight: 700, color: MUTE } }, String(idx + 1)),
        ce(View, { style: { ...S.td, ...S.cDesc } },
          ce(Text, { style: S.svcName }, item.service || '—'),
          item.personnel ? ce(Text, { style: S.svcMeta }, `${item.personnel} ${L.personnelSuffix}`) : null,
          item.post ? ce(Text, { style: S.svcMeta }, `@ ${item.post}`) : null,
          item.note ? ce(Text, { style: S.svcMeta }, item.note) : null,
        ),
        ce(Text, { style: { ...S.td, ...S.cSac, color: MUTE } }, item.sac || '—'),
        showWoCol ? ce(Text, { style: { ...S.td, ...S.cWo, fontWeight: 700 } }, item.hideWoPrice ? '—' : num(item.woPrice || 0)) : null,
        ce(Text, { style: { ...S.td, ...S.cDuty, fontWeight: 700 } }, item.lumpSum ? '—' : String(item.duties || 0)),
        item.lumpSum
          ? ce(Text, { style: { ...S.td, ...S.cRate, color: MUTE } }, '—')
          : ce(View, { style: { ...S.td, ...S.cRate } },
              ce(Text, { style: { fontSize: 8.5, color: INK, fontWeight: 700, textAlign: 'right' } }, `\u20B9${num(item.rate ?? 0)}`),
              item.rateDerivation ? ce(Text, { style: { ...S.rateDeriv, textAlign: 'right' } }, item.rateDerivation) : null,
            ),
        ce(Text, { style: { ...S.td, ...S.cAmt, fontWeight: 700, color: BLACK } }, num(item.amount)),
      );

    // Closes reconciled lines onto the recorded taxable value.
    const roundOffRow = () =>
      ti.linesRoundOff === 0 ? null :
      ce(View, { key: 'lro', style: { ...S.trow, ...S.tableSide }, wrap: false },
        ce(Text, { style: { ...S.td, ...S.cHash } }, ''),
        ce(Text, { style: { ...S.td, ...S.cDesc, fontSize: 7.5, color: MUTE } }, D.linesRoundOff),
        ce(Text, { style: { ...S.td, ...S.cAmt, fontSize: 7.5, color: MUTE } },
          `${ti.linesRoundOff > 0 ? '+ ' : '- '}${num(Math.abs(ti.linesRoundOff))}`),
      );

    const headerBlock = () =>
      ce(View, { key: 'hdr', wrap: false },
        ce(Text, { style: S.copyMark },
          frozen ? `${invoiceCopyLabel(meta.copyType)}  \u00B7  ${frozen}` : invoiceCopyLabel(meta.copyType)),
        cancelled ? ce(Text, { style: S.cancelBanner }, D.cancelled) : null,
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
            ce(Text, { style: S.invoiceTitle }, H.title),
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
              supplierPan ? ce(View, { style: { ...S.taxIdRow, marginBottom: 1 } },
                ce(Text, { style: S.taxIdLabel }, 'PAN'),
                ce(Text, { style: S.taxIdValue }, supplierPan),
              ) : null,
              // Udyam registration: mandatory on invoices to support MSME Samadhaan
              // delayed-payment claims under Sections 15-16 of the MSMED Act, 2006.
              ce(View, { style: { ...S.taxIdRow, marginBottom: companyInfo.cin ? 1 : 0 } },
                ce(Text, { style: S.taxIdLabel }, 'MSME Udyam No.'),
                ce(Text, { style: { ...S.taxIdValue, fontSize: 6.8 } }, 'UDYAM-OD-07-0000118'),
              ),
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
          ce(View, { style: S.partyHead }, ce(Text, { style: S.partyHeadText }, H.detailsHead)),
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
        ce(Image, { src: eInvoice.qr, style: { width: 58, height: 58, marginRight: 10, objectFit: 'contain' } }),
        ce(View, { style: { flex: 1 } },
          ce(View, { style: S.kv }, ce(Text, { style: S.kvLabel }, 'IRN'), ce(Text, { style: { ...S.kvValue, fontSize: 6 } }, eInvoice.irn)),
          ce(View, { style: S.kv }, ce(Text, { style: S.kvLabel }, 'Ack No.'), ce(Text, { style: S.kvValue }, eInvoice.ackNo || '—')),
          ce(View, { style: S.kv }, ce(Text, { style: S.kvLabel }, 'Ack Date'), ce(Text, { style: S.kvValue }, eInvoice.ackDate || '—')),
        ),
      );

    const contBar = (pageLabel: string) =>
      ce(View, { key: 'cont', style: S.contBar, wrap: false },
        ce(Text, { style: S.contTitle }, `${H.title} · ${invNo}`),
        ce(Text, { style: S.contMeta }, `${clientInfo.name || ''}  ·  ${pageLabel}`),
      );

    const tableFoot = () =>
      ce(View, { key: 'tfoot', style: { ...S.tfootRow, ...S.tableBottomEdge }, wrap: false },
        ce(Text, { style: { ...S.tfootLabel, ...S.cHash } }, ''),
        ce(Text, { style: { ...S.tfootLabel, ...S.cDesc } }, 'TOTAL'),
        ce(Text, { style: { ...S.tfootLabel, ...S.cSac } }, ''),
        showWoCol ? ce(Text, { style: { ...S.tfootLabel, ...S.cWo } }, '') : null,
        ce(Text, { style: { ...S.td, ...S.cDuty, fontWeight: 700, color: BLACK } },
          lines.every((l) => l.lumpSum) ? '—' : String(ti.totalDuties ?? 0)),
        ce(Text, { style: { ...S.tfootLabel, ...S.cRate } }, ''),
        ce(Text, { style: { ...S.td, ...S.cAmt, fontWeight: 700, color: BLACK } }, num(tableTotal)),
      );

    const linesNote = () =>
      ti.linesReconciled ? null : ce(Text, { key: 'lnote', style: S.linesNote }, D.linesDiffer);

    const taxRow = (key: string, label: string, value: string) =>
      ce(View, { key, style: S.tRow },
        ce(Text, { style: S.tLabel }, label),
        ce(Text, { style: S.tValue }, value),
      );

    // Tax invoice totals — ends at INVOICE VALUE and nothing beyond it, so the
    // GSTR-1 document value is the unambiguous bottom line of the tax invoice.
    const totalsBlock = () =>
      ce(View, { key: 'totals', style: S.totals, wrap: false },
        ce(View, { style: S.tRowSub },
          ce(Text, { style: { fontSize: 9, fontWeight: 700, color: BLACK } }, ti.taxableLabel || H.taxableValue),
          ce(Text, { style: { fontSize: 9, fontWeight: 700, color: BLACK } }, money(ti.taxableValue)),
        ),
        ...(ti.taxNote
          ? [ce(View, { key: 'note', style: S.tRow }, ce(Text, { style: { ...S.tLabel, fontSize: 7.5 } }, ti.taxNote))]
          : isExempt
            ? [taxRow('gst', H.taxHead('GST'), 'Exempt / Nil-rated')]
            : isIGST
              ? [taxRow('igst', H.taxHead('IGST', ti.igstRate), num(ti.igst))]
              : [taxRow('cgst', H.taxHead('CGST', ti.cgstRate), num(ti.cgst)), taxRow('sgst', H.taxHead('SGST', ti.sgstRate), num(ti.sgst))]),
        ti.roundOff !== 0 ? ce(View, { style: S.tRow },
          ce(Text, { style: { ...S.tLabel, fontSize: 7.5 } }, 'Round Off'),
          ce(Text, { style: { ...S.tValue, fontSize: 7.5, color: MUTE } }, `${ti.roundOff >= 0 ? '+ ' : '- '}${num(Math.abs(ti.roundOff))}`),
        ) : null,
        ce(View, { style: S.tRowValue },
          ce(View, null,
            ce(Text, { style: S.tValueLabel }, H.totalValue),
            ce(Text, { style: S.tValueNote }, L.invoiceTotalNote.toUpperCase()),
          ),
          ce(Text, { style: S.tValueAmt }, money(ti.invoiceTotal)),
        ),
      );

    // Statement of account: live from the ledger, and captioned so it cannot be
    // read as part of the tax invoice. Same rows as the screen view.
    const statementRow = (r: (typeof statement.rows)[number]) => {
      const amount = r.amount === null ? '' : `${r.less ? '\u2212 ' : ''}${num(r.amount)}`;
      if (r.kind === 'entry') {
        return ce(View, { key: r.key, style: S.aEntry },
          ce(Text, { style: S.aEntryText }, `\u00B7 ${r.label}`),
          ce(Text, { style: S.aEntryText }, amount),
        );
      }
      const strong = r.kind === 'balance' || r.kind === 'subtotal';
      return ce(View, { key: r.key, style: S.aRow },
        ce(View, { style: { flex: 1, paddingRight: 8 } },
          ce(Text, { style: strong ? { ...S.aLabel, fontWeight: 700 } : S.aLabel }, r.label),
          r.note ? ce(Text, { style: S.aSubNote }, r.note) : null,
        ),
        ce(Text, { style: S.aValue }, amount),
      );
    };

    // Payable figure in red; PAID IN FULL in green; CANCELLED in grey.
    const totalBg = statement.total.amount !== null ? RED : statement.state === 'paid' ? '#15803D' : INK;
    const statementHead = [D.statementHead, statement.asOf ? `as of ${statement.asOf}` : '', statement.badge?.toUpperCase() ?? '']
      .filter(Boolean).join('  \u00B7  ');

    const statementBlock = () =>
      !statement.show ? null :
      ce(View, { key: 'statement', style: S.advice, wrap: false },
        ce(View, { style: S.adviceHeadRow },
          ce(Text, { style: S.adviceHead }, statementHead),
          statement.dueDate && statement.state === 'open'
            ? ce(Text, { style: S.adviceDue }, `Payment due by ${statement.dueDate}`) : null,
        ),
        ce(Text, { style: S.adviceCaption }, L.adviceDisclaimer),
        ...statement.rows.map(statementRow),
        ce(View, { style: { ...S.aTotal, backgroundColor: totalBg } },
          ce(Text, { style: S.aTotalText }, statement.total.label),
          ce(Text, { style: S.aTotalText }, statement.total.amount === null ? '' : money(statement.total.amount)),
        ),
        statement.remark ? ce(Text, { style: { ...S.aWords, color: INK, fontWeight: 700 } }, statement.remark) : null,
        statement.total.words ? ce(Text, { style: S.aWords }, `${L.payableWords}: ${statement.total.words}`) : null,
        statement.interest ? ce(View, { style: { marginTop: 5 } },
          ce(Text, { style: { fontSize: 7, color: INK, fontWeight: 700 } },
            `${statement.interest.label}: ${money(statement.interest.amount)}`),
          ce(Text, { style: S.aSubNote }, statement.interest.note),
        ) : null,
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
                ce(Text, { style: { ...S.sacTd, width: 56, textAlign: 'right' } }, num(r.taxableValue)),
                ce(Text, { style: { ...S.sacTd, width: 28, textAlign: 'center' } }, `${r.gstRate}%`),
                ...(isIGST
                  ? [ce(Text, { key: 'i', style: { ...S.sacTd, width: 48, textAlign: 'right' } }, num(r.igst))]
                  : [
                      ce(Text, { key: 'c', style: { ...S.sacTd, width: 44, textAlign: 'right' } }, num(r.cgst)),
                      ce(Text, { key: 's', style: { ...S.sacTd, width: 44, textAlign: 'right' } }, num(r.sgst)),
                    ]),
                ce(Text, { style: { ...S.sacTd, width: 48, textAlign: 'right', fontWeight: 700 } }, num(r.totalTax)),
              )
            ),
          ) : null,
          // Nothing is payable on a credit note, so no bank details.
          !H.showPaymentDetails ? null : ce(View, { style: { ...S.card, marginTop: showSacSummary(sacSummary.length) ? 10 : 0 } },
            ce(View, { style: S.cardHeadRow },
              ce(View, { style: S.cardAccent }),
              ce(Text, { style: S.cardHead }, L.bankDetails),
            ),
            ...[
              ['BANK', bank.bankName],
              ['A/C NUMBER', bank.bankAccountNo],
              ['IFSC CODE', bank.ifscCode],
              ['BENEFICIARY', bank.accountName],
            ].map(([label, value]) =>
              ce(View, { key: label, style: S.bankRow },
                ce(Text, { style: S.bankLabel }, label),
                ce(Text, { style: S.bankValue }, value || '—'),
              )
            ),
          ),
          ce(View, { style: S.words },
            ce(Text, { style: S.wordsLabel }, H.totalAmountWords),
            ce(Text, { style: S.wordsValue }, ti.invoiceTotalWords),
          ),
          // Paid / part-paid status and the receipts now live in the statement
          // of account below, as on the screen view.
        ),
        // RIGHT: Totals panel
        ce(View, { style: S.lowerRight, wrap: false }, totalsBlock()),
      );

    const footerBlock = () =>
      ce(View, { key: 'foot', style: S.footer, wrap: false },
        ce(View, { style: S.termsCol },
          // Payment terms do not apply to a credit note.
          H.showPaymentDetails ? ce(Text, { style: S.termsHead }, L.termsAndConditions) : null,
          H.showPaymentDetails ? ce(Text, { style: S.termsText }, model.terms) : null,
          ce(Text, { style: S.declaration }, model.declaration),
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
    const docName = model.documentType === 'credit_note' ? 'Credit Note' : model.documentType === 'debit_note' ? 'Debit Note' : 'Invoice';
    const doc = ce(Document, { title: `${docName} ${invNo}`, author: companyInfo.name || 'Safend Secure Solutions' },
      ce(Page, { size: 'A4', style: S.page },

        // Page 1 letterhead
        headerBlock(),
        partiesBlock(),
        // Credit/debit note: reason (Rule 53).
        note ? ce(View, { key: 'reason', style: { ...S.card, flexDirection: 'row' }, wrap: false },
          ce(Text, { style: { ...S.metaLabel, marginRight: 6 } }, N.reason.toUpperCase()),
          ce(Text, { style: { ...S.metaValue, flex: 1 } }, note.reason || '—'),
        ) : null,
        hasEInvoice ? eInvoiceBlock() : null,

        // Line items — each row is wrap={false} so rows never break internally,
        // but the table as a whole flows naturally across pages.
        tableHead('th0'),
        ...lines.map((item, i) => tableRow(item, i)),
        roundOffRow(),
        tableFoot(),
        linesNote(),

        // Closing stack — wrap={false} on each block so they move whole to next
        // page rather than breaking internally.
        lowerBlock(),
        statementBlock(),
        footerBlock(),

        // Fixed footer on every page — page number sits on the right of the border line
        ce(Text, { key: 'pf', style: S.pageFoot, fixed: true }, H.pageFooterNote),
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
        'Content-Disposition': `attachment; filename="${docName.replace(' ', '')}_${(meta.invoiceNo || 'draft').replace(/[^A-Za-z0-9._-]/g, '_')}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('Invoice PDF generation error:', err);
    return NextResponse.json({ error: err.message || 'PDF generation failed' }, { status: 500 });
  }
}
