'use client';

/**
 * Compliance Export Utilities
 * Multi-format export: CSV, Excel (CSV with BOM), JSON, PDF
 */

export interface GSTOutwardEntry {
  client_name: string | null;
  description: string;
  amount: number;
  gst_amount: number;
  total_amount: number;
  created_at: string;
  status: string;
}

export interface GSTInwardEntry {
  vendor_name: string | null;
  description: string;
  amount: number;
  gst_amount: number;
  total_amount: number;
  created_at: string;
  status: string;
}

export interface EmployeeComplianceEntry {
  id: string;
  name: string;
  salary: number;
  gross_salary?: number;
  designation?: string;
  epf_employee: number;
  epf_employer: number;
  esic_employee: number;
  esic_employer: number;
  pt_amount: number;
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCSV(value: any): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ─── GENERIC MULTI-FORMAT EXPORTS ───────────────────────────────────────────

export function exportToCSV(data: any[], filename: string): void {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => escapeCSV(row[h])).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

export function exportToJSON(data: any[], filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.json') ? filename : `${filename}.json`);
}

export function exportToExcel(data: any[], filename: string, _sheetName?: string): void {
  // Export as UTF-8 CSV with BOM — Excel opens this natively without format errors.
  // A true .xlsx requires a third-party library (e.g. xlsx/SheetJS); using CSV+BOM
  // is the safe browser-only alternative that works in all Excel versions.
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => escapeCSV(row[h])).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  // Always use .csv so Excel opens it without the "file format not valid" error
  const safeFilename = filename.replace(/\.xlsx?$/i, '.csv');
  triggerDownload(blob, safeFilename);
}

export function exportToPDF(data: any[], filename: string, title: string): void {
  // Generate a printable HTML and trigger print-to-PDF
  if (!data.length) return;
  const headers = Object.keys(data[0]);

  const tableRows = data.map(row =>
    `<tr>${headers.map(h => `<td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;">${row[h] ?? ''}</td>`).join('')}</tr>`
  ).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; color: #333; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .meta { font-size: 11px; color: #666; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th { border: 1px solid #ddd; padding: 8px; background: #f5f5f5; font-size: 11px; font-weight: 600; text-align: left; }
        td { font-size: 11px; }
        .footer { margin-top: 20px; border-top: 1px solid #eee; padding-top: 8px; font-size: 10px; color: #999; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <div class="meta">Generated: ${new Date().toLocaleString('en-IN')} | Total Records: ${data.length}</div>
      <table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="footer">This document was generated from Safend Compliance Module. Save as PDF using browser print dialog.</div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 400);
}

// ─── GSTR-1 PORTAL EXPORTS ──────────────────────────────────────────────────

/**
 * A single outward supply row as fetched from the receivables table.
 * Only the fields needed for GSTR-1 classification and export.
 */
export interface Gstr1InvoiceRow {
  id: string;
  reference_number: string | null;   // invoice number (e.g. "26270015")
  created_at: string;                // ISO date string
  amount: number;                    // taxable value (before GST)
  gst_amount: number;                // GST charged (negative = credit note)
  total_amount: number;              // invoice total
  client_name: string | null;
  client_gstin: string | null;       // present = B2B; absent = B2C
  gst_type: string | null;           // 'igst' = inter-state | 'cgst_sgst' = intra-state
  gst_treatment: string | null;      // 'forward' | 'rcm' | 'exempt'
  description: string | null;
  notes: string | null;
  /** Stored JSON array of line items — each has sac, service, gstRate, amount, personnel, duties etc. */
  line_items?: any[] | null;
}

/** Format a date as DD-MM-YYYY required by GSTN portal */
function toGstnDate(isoDate: string): string {
  const d = new Date(isoDate);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/** First 2 digits of GSTIN = state code. Falls back to '00' if absent. */
function stateCodeFromGstin(gstin?: string | null): string {
  const g = (gstin || '').trim();
  return g.length >= 2 ? g.slice(0, 2) : '00';
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** B2C inter-state invoices above this value go to B2CL (₹1 lakh since 1 Aug 2024). */
const B2CL_THRESHOLD = 100000;

const DEFAULT_SAC = '998525';

/** Official SAC descriptions, used for the HSN summary `desc` field. */
const SAC_DESCRIPTIONS: Record<string, string> = {
  '998511': 'Executive/retained personnel search services',
  '998512': 'Permanent placement services',
  '998513': 'Contract staffing services',
  '998514': 'Temporary staffing services',
  '998521': 'Investigation services',
  '998522': 'Security consulting services',
  '998523': 'Security systems services',
  '998524': 'Armoured car services',
  '998525': 'Guard services',
  '998526': 'Training of guard dogs',
  '998527': 'Polygraph services',
  '998528': 'Fingerprinting services',
  '998529': 'Other security services',
  '998531': 'Disinfecting and exterminating services',
  '998532': 'Window cleaning services',
  '998533': 'General cleaning services',
  '998534': 'Specialized cleaning services',
  '998599': 'Other support services',
};

/** Keys the GST offline tool always writes with 2 decimals (e.g. 18.00). */
const GSTN_DECIMAL_KEYS = new Set(['rt', 'txval', 'iamt', 'camt', 'samt', 'csamt', 'val', 'qty']);

/**
 * Serialise a GSTN payload so amount fields carry exactly 2 decimals,
 * matching the portal/offline-tool output byte-for-byte in number format.
 */
function toGstnJson(payload: unknown): string {
  return JSON.stringify(payload, (key, value) =>
    typeof value === 'number' && GSTN_DECIMAL_KEYS.has(key)
      ? `__GSTN__${value.toFixed(2)}__GSTN__`
      : value
  ).replace(/"__GSTN__(-?\d+\.\d{2})__GSTN__"/g, '$1');
}

function isInterStateRow(row: Gstr1InvoiceRow): boolean {
  if (row.gst_type) return row.gst_type === 'igst';
  return typeof row.notes === 'string' && row.notes.toLowerCase().includes('igst');
}

/** Split a tax amount into IGST, or into equal CGST/SGST halves. */
function splitTax(tax: number, inter: boolean): { iamt: number; camt: number; samt: number } {
  const t = r2(tax);
  if (inter) return { iamt: t, camt: 0, samt: 0 };
  const camt = r2(t / 2);
  return { iamt: 0, camt, samt: r2(t - camt) };
}

/** Snap a derived percentage to the nearest GST slab. */
function snapRate(raw: number): number {
  const slabs = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 12, 18, 28, 40];
  return slabs.reduce((best, s) => (Math.abs(s - raw) < Math.abs(best - raw) ? s : best), 18);
}

/** One invoice's taxable value and tax, apportioned to a (SAC, rate) bucket. */
interface InvoiceAllocation { sac: string; rt: number; txval: number; tax: number }

/**
 * Apportion an invoice across (SAC, rate) buckets.
 *
 * The invoice's stored `amount` and `gst_amount` are authoritative: the totals
 * reported to the portal must equal what was billed, so line items are used
 * only as weights for splitting. All values are positive magnitudes; credit
 * notes are handled by the caller.
 *
 * RCM supplies store gst_amount = 0 (the recipient pays), but GSTR-1 still
 * reports the tax on them, so it is computed from the rate.
 */
function allocateInvoice(row: Gstr1InvoiceRow): InvoiceAllocation[] {
  const txTotal = r2(Math.abs(row.amount || 0));
  const lines = Array.isArray(row.line_items) ? row.line_items : [];

  const lineRate = (li: any): number | null => {
    const n = Number(li?.gstRate ?? li?.gst_rate);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const storedTax = r2(Math.abs(row.gst_amount || 0));
  const firstLineRate = lines.map(lineRate).find((n): n is number => n != null) ?? null;
  const invoiceRate = storedTax > 0 && txTotal > 0
    ? snapRate((storedTax / txTotal) * 100)
    : (firstLineRate ?? 18);
  const taxTotal = storedTax > 0 ? storedTax : r2(txTotal * invoiceRate / 100);

  const buckets = new Map<string, { sac: string; rt: number; weight: number }>();
  for (const li of lines) {
    const weight = Math.abs(Number(li?.amount) || 0);
    if (!weight) continue;
    const sac = String(li?.sac || DEFAULT_SAC).trim();
    const rt = lineRate(li) ?? invoiceRate;
    const key = `${sac}|${rt}`;
    const b = buckets.get(key) ?? { sac, rt, weight: 0 };
    b.weight += weight;
    buckets.set(key, b);
  }

  if (buckets.size <= 1) {
    const only = buckets.values().next().value;
    const sac = only?.sac ?? String(lines[0]?.sac || DEFAULT_SAC).trim();
    return [{ sac, rt: invoiceRate, txval: txTotal, tax: taxTotal }];
  }

  // Multiple buckets: split by weight, last bucket absorbs rounding so the
  // allocations sum exactly to the invoice totals.
  const list = Array.from(buckets.values());
  const totalWeight = list.reduce((s, b) => s + b.weight, 0);
  let txLeft = txTotal;
  let taxLeft = taxTotal;
  return list.map((b, i) => {
    if (i === list.length - 1) {
      return { sac: b.sac, rt: b.rt, txval: r2(txLeft), tax: r2(taxLeft) };
    }
    const txval = r2(txTotal * (b.weight / totalWeight));
    const tax = r2(txval * b.rt / 100);
    txLeft = r2(txLeft - txval);
    taxLeft = r2(taxLeft - tax);
    return { sac: b.sac, rt: b.rt, txval, tax };
  });
}

/**
 * Build the `itms` array for an invoice or note.
 *
 * The portal allows one item per tax rate per document, so allocations are
 * grouped by rate only (SAC detail goes to the HSN summary instead).
 */
function buildItms(row: Gstr1InvoiceRow, igstOnly = false) {
  const inter = isInterStateRow(row);
  const byRate = new Map<number, { txval: number; tax: number }>();
  for (const a of allocateInvoice(row)) {
    const g = byRate.get(a.rt) ?? { txval: 0, tax: 0 };
    g.txval = r2(g.txval + a.txval);
    g.tax = r2(g.tax + a.tax);
    byRate.set(a.rt, g);
  }
  return Array.from(byRate.entries()).map(([rt, g], idx) => {
    const { iamt, camt, samt } = splitTax(g.tax, inter);
    // B2CL items carry only IGST (always inter-state).
    const itm_det = igstOnly
      ? { rt, txval: g.txval, iamt, csamt: 0 }
      : { rt, txval: g.txval, iamt, camt, samt, csamt: 0 };
    return { num: idx + 1, itm_det };
  });
}

type HsnRow = {
  num: number; hsn_sc: string; uqc: string; rt: number; qty: number;
  txval: number; iamt: number; camt: number; samt: number; csamt: number; desc: string;
};

/**
 * HSN/SAC summary, split into B2B and B2C tables as the portal requires.
 *
 * Grouped by (SAC, rate). Credit notes are netted off (sign = -1), since the
 * HSN summary reports supplies net of notes. Services use UQC "NA", qty 0.
 */
function buildHsnSummary(rows: Gstr1InvoiceRow[]): { hsn_b2b: HsnRow[]; hsn_b2c: HsnRow[] } {
  type Acc = { sac: string; rt: number; txval: number; iamt: number; camt: number; samt: number };
  const b2b = new Map<string, Acc>();
  const b2c = new Map<string, Acc>();

  for (const row of rows) {
    const sign = (row.gst_amount || 0) < 0 || (row.amount || 0) < 0 ? -1 : 1;
    const target = row.client_gstin?.trim() ? b2b : b2c;
    const inter = isInterStateRow(row);
    for (const a of allocateInvoice(row)) {
      const key = `${a.sac}|${a.rt}`;
      const acc = target.get(key) ?? { sac: a.sac, rt: a.rt, txval: 0, iamt: 0, camt: 0, samt: 0 };
      const { iamt, camt, samt } = splitTax(a.tax, inter);
      acc.txval = r2(acc.txval + sign * a.txval);
      acc.iamt = r2(acc.iamt + sign * iamt);
      acc.camt = r2(acc.camt + sign * camt);
      acc.samt = r2(acc.samt + sign * samt);
      target.set(key, acc);
    }
  }

  const toRows = (m: Map<string, Acc>): HsnRow[] =>
    Array.from(m.values())
      .filter((a) => a.txval !== 0 || a.iamt !== 0 || a.camt !== 0 || a.samt !== 0)
      .sort((x, y) => x.sac.localeCompare(y.sac) || x.rt - y.rt)
      .map((a, idx) => ({
        num: idx + 1,
        hsn_sc: a.sac,
        uqc: 'NA',
        rt: a.rt,
        qty: 0,
        txval: a.txval,
        iamt: a.iamt,
        camt: a.camt,
        samt: a.samt,
        csamt: 0,
        desc: SAC_DESCRIPTIONS[a.sac] ?? 'Support services',
      }));

  return { hsn_b2b: toRows(b2b), hsn_b2c: toRows(b2c) };
}

/** Sort document numbers numerically where possible ("999" before "1096"). */
function sortDocNumbers(nums: string[]): string[] {
  return [...nums].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

/**
 * Generates the GSTN-portal-compliant JSON for GSTR-1.
 *
 * Schema source: GSTN Sandbox API (sandbox-docs.readme.io/reference/file-gstr-1)
 * Upload: GST Portal → Returns Dashboard → GSTR-1 → Prepare Offline → Upload JSON
 *
 * Structure exactly matches the real portal file format:
 *   - Root: { gstin, fp, b2b, hsn, doc_issue } (no gt/cur_gt unless needed)
 *   - b2b grouped by buyer GSTIN, each invoice has line-item-level itms[]
 *   - pos = buyer's state code (from buyer GSTIN), not supplier state
 *   - HSN built from actual line_items SAC codes
 *   - doc_issue: invoice serial range for the period
 */
export function exportGSTR1_JSON(
  rows: Gstr1InvoiceRow[],
  periodKey: string,
  supplierGstin: string,
  filename: string,
): void {
  const [year, month] = periodKey.split('-');
  const fp = `${month}${year}`; // MMYYYY
  const supplierState = stateCodeFromGstin(supplierGstin);
  const docNo = (row: Gstr1InvoiceRow) => (row.reference_number || row.id).trim();

  const isNote = (r: Gstr1InvoiceRow) => (r.gst_amount || 0) < 0 || (r.amount || 0) < 0;
  const invoices = rows.filter(r => !isNote(r));
  const notes    = rows.filter(isNote);
  const isB2B    = (r: Gstr1InvoiceRow) => !!r.client_gstin?.trim();
  const isB2CL   = (r: Gstr1InvoiceRow) =>
    !isB2B(r) && isInterStateRow(r) && Math.abs(r.total_amount || 0) > B2CL_THRESHOLD;

  // ── B2B (Table 4) — grouped by buyer GSTIN ─────────────────────────────
  const b2bMap = new Map<string, Gstr1InvoiceRow[]>();
  for (const row of invoices.filter(isB2B)) {
    const ctin = row.client_gstin!.trim().toUpperCase();
    b2bMap.set(ctin, [...(b2bMap.get(ctin) ?? []), row]);
  }
  const b2b = Array.from(b2bMap.entries()).map(([ctin, invs]) => ({
    ctin,
    inv: invs.map(row => ({
      inum:    docNo(row),
      idt:     toGstnDate(row.created_at),
      val:     r2(Math.abs(row.total_amount || 0)),
      pos:     stateCodeFromGstin(row.client_gstin), // buyer's registered state
      inv_typ: 'R',
      itms:    buildItms(row),
      rchrg:   row.gst_treatment === 'rcm' ? 'Y' : 'N',
    })),
  }));

  // ── B2CL (Table 5) — unregistered, inter-state, value > ₹1 lakh ────────
  const b2clMap = new Map<string, Gstr1InvoiceRow[]>();
  for (const row of invoices.filter(isB2CL)) {
    // Buyer state is unknown for unregistered buyers; the supplier state is
    // the only value available. The CA must correct POS if it differs.
    b2clMap.set(supplierState, [...(b2clMap.get(supplierState) ?? []), row]);
  }
  const b2cl = Array.from(b2clMap.entries()).map(([pos, invs]) => ({
    pos,
    inv: invs.map(row => ({
      inum: docNo(row),
      idt:  toGstnDate(row.created_at),
      val:  r2(Math.abs(row.total_amount || 0)),
      itms: buildItms(row, true),
    })),
  }));

  // ── B2CS (Table 7) — consolidated by supply type + POS + rate ──────────
  // Credit notes to small B2C buyers are netted here (they never go to CDNUR).
  const b2csMap = new Map<string, { sply_ty: string; pos: string; rt: number; txval: number; iamt: number; camt: number; samt: number }>();
  for (const row of rows.filter(r => !isB2B(r) && !isB2CL(r))) {
    const sign = isNote(row) ? -1 : 1;
    const inter = isInterStateRow(row);
    const sply_ty = inter ? 'INTER' : 'INTRA';
    for (const a of allocateInvoice(row)) {
      const key = `${sply_ty}|${supplierState}|${a.rt}`;
      const g = b2csMap.get(key) ?? { sply_ty, pos: supplierState, rt: a.rt, txval: 0, iamt: 0, camt: 0, samt: 0 };
      const { iamt, camt, samt } = splitTax(a.tax, inter);
      g.txval = r2(g.txval + sign * a.txval);
      g.iamt  = r2(g.iamt  + sign * iamt);
      g.camt  = r2(g.camt  + sign * camt);
      g.samt  = r2(g.samt  + sign * samt);
      b2csMap.set(key, g);
    }
  }
  const b2cs = Array.from(b2csMap.values())
    .filter(g => g.txval !== 0)
    .map(g => ({
      sply_ty: g.sply_ty,
      txval:   g.txval,
      typ:     'OE', // "Other than E-commerce"
      pos:     g.pos,
      rt:      g.rt,
      iamt:    g.iamt,
      camt:    g.camt,
      samt:    g.samt,
      csamt:   0,
    }));

  // ── CDNR (Table 9B) — credit notes to registered buyers ────────────────
  const cdnrMap = new Map<string, Gstr1InvoiceRow[]>();
  for (const row of notes.filter(isB2B)) {
    const ctin = row.client_gstin!.trim().toUpperCase();
    cdnrMap.set(ctin, [...(cdnrMap.get(ctin) ?? []), row]);
  }
  const cdnr = Array.from(cdnrMap.entries()).map(([ctin, nts]) => ({
    ctin,
    nt: nts.map(row => ({
      ntty:    'C',
      nt_num:  docNo(row),
      nt_dt:   toGstnDate(row.created_at),
      val:     r2(Math.abs(row.total_amount || 0)),
      pos:     stateCodeFromGstin(row.client_gstin),
      rchrg:   row.gst_treatment === 'rcm' ? 'Y' : 'N',
      inv_typ: 'R',
      itms:    buildItms(row),
    })),
  }));

  // ── CDNUR (Table 9B) — credit notes against B2CL invoices only ─────────
  const cdnur = notes.filter(isB2CL).map(row => ({
    typ:    'B2CL',
    ntty:   'C',
    nt_num: docNo(row),
    nt_dt:  toGstnDate(row.created_at),
    val:    r2(Math.abs(row.total_amount || 0)),
    pos:    supplierState,
    itms:   buildItms(row, true),
  }));

  // ── HSN summary (Table 12) — split B2B / B2C ───────────────────────────
  const hsn = buildHsnSummary(rows);

  // ── Documents issued (Table 13) ─────────────────────────────────────────
  const docRange = (doc_num: number, doc_typ: string, list: Gstr1InvoiceRow[]) => {
    const nums = sortDocNumbers(list.map(r => r.reference_number?.trim()).filter((n): n is string => !!n));
    if (!nums.length) return null;
    return {
      doc_num,
      doc_typ,
      docs: [{
        num:       1,
        from:      nums[0],
        to:        nums[nums.length - 1],
        totnum:    nums.length,
        cancel:    0,
        net_issue: nums.length,
      }],
    };
  };
  const doc_det = [
    docRange(1, 'Invoices for outward supply', invoices),
    docRange(5, 'Credit Note', notes),
  ].filter(Boolean);

  // ── Assemble in the same key order as the GST offline tool ─────────────
  const payload: Record<string, unknown> = {
    gstin: supplierGstin,
    fp,
    version: 'GST3.2.2',
    hash: 'hash',
  };
  if (b2b.length)   payload.b2b   = b2b;
  if (b2cl.length)  payload.b2cl  = b2cl;
  if (b2cs.length)  payload.b2cs  = b2cs;
  if (cdnr.length)  payload.cdnr  = cdnr;
  if (cdnur.length) payload.cdnur = cdnur;
  if (hsn.hsn_b2b.length || hsn.hsn_b2c.length) payload.hsn = hsn;
  if (doc_det.length) payload.doc_issue = { doc_det };

  const blob = new Blob([toGstnJson(payload)], { type: 'application/json;charset=utf-8;' });
  triggerDownload(blob, filename);
}

/**
 * CA-readable CSV for GSTR-1 — one section per table, matching
 * the GSTN Excel Offline Tool worksheet layout.
 */
export function exportGSTR1_CSV(
  rows: Gstr1InvoiceRow[],
  periodKey: string,
  supplierGstin: string,
  filename: string,
): void {
  const [year, month] = periodKey.split('-');
  const periodLabel = new Date(Number(year), Number(month) - 1, 1)
    .toLocaleDateString('en-IN', { year: 'numeric', month: 'long' });

  const lines: string[] = [];
  lines.push('GSTR-1 Return — Outward Supplies');
  lines.push(`GSTIN,${supplierGstin}`);
  lines.push(`Return Period,${periodLabel}`);
  lines.push(`Generated,${new Date().toLocaleString('en-IN')}`);
  lines.push('');

  // Same classification as the JSON export, so the two always reconcile.
  const isNote = (r: Gstr1InvoiceRow) => (r.gst_amount || 0) < 0 || (r.amount || 0) < 0;
  const isB2B  = (r: Gstr1InvoiceRow) => !!r.client_gstin?.trim();
  const isB2CL = (r: Gstr1InvoiceRow) =>
    !isB2B(r) && isInterStateRow(r) && Math.abs(r.total_amount || 0) > B2CL_THRESHOLD;
  const supplierState = stateCodeFromGstin(supplierGstin);
  const f2 = (n: number) => r2(n).toFixed(2);

  /** One CSV line per (document, rate) — mirrors the JSON `itms`. */
  const itemLines = (row: Gstr1InvoiceRow, lead: (string | number)[]) =>
    buildItms(row).map(({ itm_det }) => {
      const d = itm_det as { rt: number; txval: number; iamt: number; camt?: number; samt?: number };
      return [...lead, f2(d.rt), f2(d.txval), f2(d.iamt), f2(d.camt ?? 0), f2(d.samt ?? 0), '0.00'].join(',');
    });

  const invoices = rows.filter(r => !isNote(r));
  const notes    = rows.filter(isNote);

  // Table 4A — B2B
  lines.push('Table 4A — B2B Invoices (Sales to Registered Buyers)');
  lines.push('GSTIN/UIN of Recipient,Receiver Name,Invoice Number,Invoice Date,Invoice Value,Place Of Supply,Reverse Charge,Invoice Type,Rate,Taxable Value,Integrated Tax,Central Tax,State/UT Tax,Cess Amount');
  const b2bRows = invoices.filter(isB2B);
  for (const row of b2bRows) {
    lines.push(...itemLines(row, [
      escapeCSV(row.client_gstin!.trim().toUpperCase()),
      escapeCSV(row.client_name || ''),
      escapeCSV(row.reference_number || row.id),
      toGstnDate(row.created_at),
      f2(Math.abs(row.total_amount || 0)),
      stateCodeFromGstin(row.client_gstin),
      row.gst_treatment === 'rcm' ? 'Y' : 'N',
      'Regular B2B',
    ]));
  }
  if (!b2bRows.length) lines.push('(No B2B invoices for this period)');
  lines.push('');

  // Table 5 — B2CL
  lines.push('Table 5 — B2CL (Unregistered, Inter-State, Invoice Value > ₹1 Lakh)');
  lines.push('Invoice Number,Invoice Date,Invoice Value,Place Of Supply,Rate,Taxable Value,Integrated Tax,Central Tax,State/UT Tax,Cess Amount');
  const b2clRows = invoices.filter(isB2CL);
  for (const row of b2clRows) {
    lines.push(...itemLines(row, [
      escapeCSV(row.reference_number || row.id),
      toGstnDate(row.created_at),
      f2(Math.abs(row.total_amount || 0)),
      supplierState,
    ]));
  }
  if (!b2clRows.length) lines.push('(No B2CL invoices for this period)');
  lines.push('');

  // Table 7 — B2CS (net of small-B2C credit notes)
  lines.push('Table 7 — B2CS (Unregistered Buyers — Consolidated)');
  lines.push('Type,Place Of Supply,Supply Type,Rate,Taxable Value,Integrated Tax,Central Tax,State/UT Tax,Cess Amount');
  const b2csMap = new Map<string, { sply_ty: string; rt: number; txval: number; iamt: number; camt: number; samt: number }>();
  for (const row of rows.filter(r => !isB2B(r) && !isB2CL(r))) {
    const sign = isNote(row) ? -1 : 1;
    const inter = isInterStateRow(row);
    const sply_ty = inter ? 'INTER' : 'INTRA';
    for (const a of allocateInvoice(row)) {
      const key = `${sply_ty}|${a.rt}`;
      const g = b2csMap.get(key) ?? { sply_ty, rt: a.rt, txval: 0, iamt: 0, camt: 0, samt: 0 };
      const t = splitTax(a.tax, inter);
      g.txval = r2(g.txval + sign * a.txval);
      g.iamt  = r2(g.iamt  + sign * t.iamt);
      g.camt  = r2(g.camt  + sign * t.camt);
      g.samt  = r2(g.samt  + sign * t.samt);
      b2csMap.set(key, g);
    }
  }
  const b2csList = Array.from(b2csMap.values()).filter(g => g.txval !== 0);
  for (const g of b2csList) {
    lines.push(['OE', supplierState, g.sply_ty, f2(g.rt), f2(g.txval), f2(g.iamt), f2(g.camt), f2(g.samt), '0.00'].join(','));
  }
  if (!b2csList.length) lines.push('(No B2CS supplies for this period)');
  lines.push('');

  // Table 9B — CDNR
  lines.push('Table 9B — CDNR: Credit Notes to Registered Buyers');
  lines.push('GSTIN/UIN of Recipient,Receiver Name,Note Number,Note Date,Note Type,Note Value,Place Of Supply,Reverse Charge,Note Supply Type,Rate,Taxable Value,Integrated Tax,Central Tax,State/UT Tax,Cess Amount');
  const cdnrRows = notes.filter(isB2B);
  for (const row of cdnrRows) {
    lines.push(...itemLines(row, [
      escapeCSV(row.client_gstin!.trim().toUpperCase()),
      escapeCSV(row.client_name || ''),
      escapeCSV(row.reference_number || row.id),
      toGstnDate(row.created_at),
      'C',
      f2(Math.abs(row.total_amount || 0)),
      stateCodeFromGstin(row.client_gstin),
      row.gst_treatment === 'rcm' ? 'Y' : 'N',
      'Regular B2B',
    ]));
  }
  if (!cdnrRows.length) lines.push('(No credit notes to registered buyers)');
  lines.push('');

  // Table 9B — CDNUR (only notes against B2CL invoices)
  lines.push('Table 9B — CDNUR: Credit Notes to Unregistered Buyers (against B2CL)');
  lines.push('UR Type,Note Number,Note Date,Note Type,Place Of Supply,Note Value,Rate,Taxable Value,Integrated Tax,Central Tax,State/UT Tax,Cess Amount');
  const cdnurRows = notes.filter(isB2CL);
  for (const row of cdnurRows) {
    lines.push(...itemLines(row, [
      'B2CL',
      escapeCSV(row.reference_number || row.id),
      toGstnDate(row.created_at),
      'C',
      supplierState,
      f2(Math.abs(row.total_amount || 0)),
    ]));
  }
  if (!cdnurRows.length) lines.push('(No credit notes against B2CL invoices)');
  lines.push('');

  // Table 12 — HSN summary, B2B and B2C
  const hsn = buildHsnSummary(rows);
  const hsnHeader = 'HSN,Description,UQC,Total Quantity,Rate,Taxable Value,Integrated Tax Amount,Central Tax Amount,State/UT Tax Amount,Cess Amount';
  const hsnLine = (h: HsnRow) =>
    [h.hsn_sc, escapeCSV(h.desc), h.uqc, f2(h.qty), f2(h.rt), f2(h.txval), f2(h.iamt), f2(h.camt), f2(h.samt), '0.00'].join(',');

  lines.push('Table 12 — HSN/SAC Summary (B2B)');
  lines.push(hsnHeader);
  if (hsn.hsn_b2b.length) hsn.hsn_b2b.forEach(h => lines.push(hsnLine(h)));
  else lines.push('(No B2B supplies)');
  lines.push('');

  lines.push('Table 12 — HSN/SAC Summary (B2C)');
  lines.push(hsnHeader);
  if (hsn.hsn_b2c.length) hsn.hsn_b2c.forEach(h => lines.push(hsnLine(h)));
  else lines.push('(No B2C supplies)');
  lines.push('');

  // Table 13 — Documents issued
  lines.push('Table 13 — Documents Issued');
  lines.push('Nature of Document,Sr. No. From,Sr. No. To,Total Number,Cancelled,Net Issued');
  const docLine = (label: string, list: Gstr1InvoiceRow[]) => {
    const nums = sortDocNumbers(list.map(r => r.reference_number?.trim()).filter((n): n is string => !!n));
    if (nums.length) lines.push([escapeCSV(label), nums[0], nums[nums.length - 1], nums.length, 0, nums.length].join(','));
  };
  docLine('Invoices for outward supply', invoices);
  docLine('Credit Note', notes);

  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

// ─── GSTR-3B PORTAL EXPORTS ─────────────────────────────────────────────────

/**
 * Input shape passed by ComplianceModule for a single return period.
 * All amounts already rounded to 2dp by the caller.
 */
export interface Gstr3bPeriodData {
  /** YYYY-MM — the return period key used internally */
  periodKey: string;
  /** Company GSTIN e.g. "21ABDCS8727K1Z4" */
  gstin: string;
  /** Total forward-charge output GST for the period */
  outputGST: number;
  /** Taxable value (invoice amount before GST) for the period */
  taxableValue: number;
  /** RCM inward taxable value (Table 3.1d) */
  rcmTaxableValue: number;
  /** RCM inward GST (IGST portion) */
  rcmIgst: number;
  /** RCM inward GST (CGST portion) */
  rcmCgst: number;
  /** RCM inward GST (SGST portion) */
  rcmSgst: number;
  /** IGST portion of output GST (inter-state sales) */
  outputIgst: number;
  /** CGST portion of output GST (intra-state sales) */
  outputCgst: number;
  /** SGST portion of output GST (intra-state sales) */
  outputSgst: number;
  /** Total eligible ITC for the period */
  itc: number;
  /** IGST portion of ITC */
  itcIgst: number;
  /** CGST portion of ITC */
  itcCgst: number;
  /** SGST portion of ITC */
  itcSgst: number;
}

/**
 * Generates the GSTN-portal-compliant JSON file for GSTR-3B.
 *
 * Schema reference: GSTN sandbox API (sandbox-docs.readme.io/reference/file-gstr-3b-api)
 * The portal accepts this via Services → Returns → Returns Dashboard →
 * GSTR-3B tile → Prepare Offline → Upload.
 *
 * Sections populated from available data:
 *   3.1  sup_details  — outward + RCM inward supplies
 *   4    itc_elg      — eligible ITC (type "OTH" = all other eligible ITC)
 *
 * Sections left at zero (require data not tracked here):
 *   3.1b osup_zero    — zero-rated/export supplies
 *   3.1c osup_nil_exmp— nil/exempt supplies
 *   3.1e osup_nongst  — non-GST supplies
 *   3.2  inter_sup    — state-wise inter-state breakdown
 *   5    inward_sup   — exempt/nil inward supplies
 *   5.1  intr_ltfee   — interest & late fee
 *
 * The CA can fill in zeros for un-tracked sections directly on the portal
 * after upload.
 */
export function exportGSTR3B_JSON(data: Gstr3bPeriodData, filename: string): void {
  // ret_period format is MMYYYY as required by the portal
  const [year, month] = data.periodKey.split('-');
  const retPeriod = `${month}${year}`;

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  // Net ITC after reversals — using full eligible ITC with no reversals tracked
  const itcNet = {
    iamt: round2(data.itcIgst),
    camt: round2(data.itcCgst),
    samt: round2(data.itcSgst),
    csamt: 0,
  };

  const payload = {
    gstin: data.gstin,
    ret_period: retPeriod,

    // ── Table 3.1: Outward supplies + inward RCM ──────────────────────────
    sup_details: {
      // 3.1(a) Outward taxable supplies (other than zero/nil/exempt)
      osup_det: {
        txval: round2(data.taxableValue),
        iamt:  round2(data.outputIgst),
        camt:  round2(data.outputCgst),
        samt:  round2(data.outputSgst),
        csamt: 0,
      },
      // 3.1(b) Zero-rated supplies (exports / SEZ) — not tracked, left at 0
      osup_zero: { txval: 0, iamt: 0, csamt: 0 },
      // 3.1(c) Nil/exempt supplies — not tracked, left at 0
      osup_nil_exmp: { txval: 0 },
      // 3.1(d) Inward supplies liable to reverse charge
      isup_rev: {
        txval: round2(data.rcmTaxableValue),
        iamt:  round2(data.rcmIgst),
        camt:  round2(data.rcmCgst),
        samt:  round2(data.rcmSgst),
        csamt: 0,
      },
      // 3.1(e) Non-GST outward supplies — not tracked, left at 0
      osup_nongst: { txval: 0 },
    },

    // ── Table 3.2: Inter-state supplies (state-wise) — not tracked ─────────
    inter_sup: {
      unreg_details: [],
      comp_details: [],
      uin_details: [],
    },

    // ── Table 4: Eligible ITC ───────────────────────────────────────────────
    itc_elg: {
      // 4A: ITC available — "OTH" covers all domestic eligible ITC
      itc_avl: [
        { ty: 'IMPG', iamt: 0, camt: 0, samt: 0, csamt: 0 }, // Import of goods
        { ty: 'IMPS', iamt: 0, camt: 0, samt: 0, csamt: 0 }, // Import of services
        { ty: 'ISRC', iamt: 0, camt: 0, samt: 0, csamt: 0 }, // Inward supplies (RCM)
        { ty: 'ISD',  iamt: 0, camt: 0, samt: 0, csamt: 0 }, // ISD credit
        {
          ty: 'OTH',                                          // All other eligible ITC
          iamt:  round2(data.itcIgst),
          camt:  round2(data.itcCgst),
          samt:  round2(data.itcSgst),
          csamt: 0,
        },
      ],
      // 4B: ITC reversals — none tracked; CA to fill on portal if applicable
      itc_rev: [
        { ty: 'RUL', iamt: 0, camt: 0, samt: 0, csamt: 0 },
        { ty: 'OTH', iamt: 0, camt: 0, samt: 0, csamt: 0 },
      ],
      // 4C: Net ITC = 4A − 4B
      itc_net: itcNet,
      // 4D: Ineligible ITC — not tracked
      itc_inelg: [
        { ty: 'RUL', iamt: 0, camt: 0, samt: 0, csamt: 0 },
        { ty: 'OTH', iamt: 0, camt: 0, samt: 0, csamt: 0 },
      ],
    },

    // ── Table 5: Exempt / nil / non-GST inward supplies — not tracked ──────
    inward_sup: {
      isup_details: [
        { ty: 'GST',    inter: 0, intra: 0 },
        { ty: 'NONGST', inter: 0, intra: 0 },
      ],
    },

    // ── Table 5.1: Interest & late fee — CA fills on portal ────────────────
    intr_ltfee: {
      intr_details: { iamt: 0, camt: 0, samt: 0, csamt: 0 },
      ltfee_details: { camt: 0, samt: 0 },
    },
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  triggerDownload(blob, filename);
}

/**
 * Generates a CA-readable CSV for GSTR-3B — matching the official form's
 * table structure so the CA can verify figures before portal upload.
 *
 * Mirrors the sections of Form GSTR-3B:
 *   Table 3.1  Details of outward supplies
 *   Table 3.1d Inward RCM supplies
 *   Table 4    Eligible ITC
 *   Summary    Net GST payable
 */
export function exportGSTR3B_CSV(data: Gstr3bPeriodData, filename: string): void {
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const [year, month] = data.periodKey.split('-');
  const periodLabel = new Date(Number(year), Number(month) - 1, 1)
    .toLocaleDateString('en-IN', { year: 'numeric', month: 'long' });

  const lines: string[] = [];

  lines.push(`GSTR-3B Return Summary`);
  lines.push(`GSTIN,${data.gstin}`);
  lines.push(`Return Period,${periodLabel}`);
  lines.push(`Generated,${new Date().toLocaleString('en-IN')}`);
  lines.push('');

  // Table 3.1 — Outward Supplies
  lines.push('Table 3.1 - Details of Outward Supplies and Inward Supplies Liable to Reverse Charge');
  lines.push('Section,Nature of Supplies,Taxable Value (₹),Integrated Tax (₹),Central Tax (₹),State/UT Tax (₹),Cess (₹)');
  lines.push([
    '3.1(a)',
    'Outward taxable supplies (other than zero / nil / exempted)',
    round2(data.taxableValue),
    round2(data.outputIgst),
    round2(data.outputCgst),
    round2(data.outputSgst),
    0,
  ].join(','));
  lines.push(['3.1(b)', 'Outward taxable supplies (zero rated)', 0, 0, '', '', 0].join(','));
  lines.push(['3.1(c)', 'Other outward supplies (nil / exempted)', 0, '', '', '', ''].join(','));
  lines.push([
    '3.1(d)',
    'Inward supplies (liable to reverse charge)',
    round2(data.rcmTaxableValue),
    round2(data.rcmIgst),
    round2(data.rcmCgst),
    round2(data.rcmSgst),
    0,
  ].join(','));
  lines.push(['3.1(e)', 'Non-GST outward supplies', 0, '', '', '', ''].join(','));
  lines.push('');

  // Table 4 — Eligible ITC
  lines.push('Table 4 - Eligible Input Tax Credit');
  lines.push('Section,Details,Integrated Tax (₹),Central Tax (₹),State/UT Tax (₹),Cess (₹)');
  lines.push(['4A(5)', 'All other ITC (domestic eligible ITC)', round2(data.itcIgst), round2(data.itcCgst), round2(data.itcSgst), 0].join(','));
  lines.push(['4B',    'ITC reversed (Rules 42/43 & others)',   0,                   0,                   0,                   0].join(','));
  lines.push(['4C',    'Net ITC available (4A − 4B)',           round2(data.itcIgst), round2(data.itcCgst), round2(data.itcSgst), 0].join(','));
  lines.push('');

  // Summary
  const netIgst  = round2(data.outputIgst - data.itcIgst);
  const netCgst  = round2(data.outputCgst - data.itcCgst);
  const netSgst  = round2(data.outputSgst - data.itcSgst);
  const netTotal = round2(data.outputGST  - data.itc);

  lines.push('Net GST Payable Summary');
  lines.push('Head,Output Tax (₹),ITC (₹),Net Payable (₹)');
  lines.push(['IGST (Inter-state)',    round2(data.outputIgst), round2(data.itcIgst), netIgst].join(','));
  lines.push(['CGST (Intra-state)',    round2(data.outputCgst), round2(data.itcCgst), netCgst].join(','));
  lines.push(['SGST/UTGST (Intra-state)', round2(data.outputSgst), round2(data.itcSgst), netSgst].join(','));
  lines.push(['TOTAL',               round2(data.outputGST),  round2(data.itc),      netTotal].join(','));
  lines.push('');
  lines.push('Note: Sections 3.1(b) / 3.1(c) / 3.1(e) / Table 5 / Table 5.1 left at zero — fill on portal if applicable.');

  const csv = lines.join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

// ─── SPECIALIZED GST EXPORT ─────────────────────────────────────────────────

export function exportGSTToCSV(
  outwardData: GSTOutwardEntry[],
  inwardData: GSTInwardEntry[],
  period: string
): void {
  const lines: string[] = [];

  lines.push('GST Compliance Report');
  lines.push(`Period: ${period}`);
  lines.push(`Generated: ${new Date().toLocaleDateString('en-IN')}`);
  lines.push('');

  // GSTR-1 (Outward Supplies)
  lines.push('GSTR-1 - Outward Supplies (Sales)');
  lines.push('Client Name,Invoice/Description,Taxable Amount,GST Amount,Total Amount,Date,Status');
  outwardData.forEach(e => {
    lines.push([
      escapeCSV(e.client_name || 'N/A'),
      escapeCSV(e.description),
      e.amount,
      e.gst_amount,
      e.total_amount,
      new Date(e.created_at).toLocaleDateString('en-IN'),
      e.status,
    ].join(','));
  });
  const totalOutGST = outwardData.reduce((s, e) => s + e.gst_amount, 0);
  lines.push('');

  // ITC Register (Inward)
  lines.push('ITC Register - Inward Supplies (Purchases)');
  lines.push('Vendor Name,Description,Taxable Amount,GST Amount (ITC),Total Amount,Date,Status');
  inwardData.forEach(e => {
    lines.push([
      escapeCSV(e.vendor_name || 'N/A'),
      escapeCSV(e.description),
      e.amount,
      e.gst_amount,
      e.total_amount,
      new Date(e.created_at).toLocaleDateString('en-IN'),
      e.status,
    ].join(','));
  });
  const totalInGST = inwardData.reduce((s, e) => s + e.gst_amount, 0);
  lines.push('');

  // GSTR-3B Summary
  lines.push('GSTR-3B Summary');
  lines.push('Particulars,Amount');
  lines.push(`GST Output (Collected),${totalOutGST}`);
  lines.push(`Less: ITC (Input Tax Credit),${totalInGST}`);
  lines.push(`Net GST Payable,${totalOutGST - totalInGST}`);

  const filename = `GST_Report_${period.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

export function exportEPFESICToCSV(
  employees: EmployeeComplianceEntry[],
  period: string
): void {
  const lines: string[] = [];

  lines.push('EPF / ESIC / PT Compliance Report');
  lines.push(`Period: ${period}`);
  lines.push(`Generated: ${new Date().toLocaleDateString('en-IN')}`);
  lines.push('');

  lines.push('Employee Name,Basic/Salary,EPF (Employee 12%),EPF (Employer 13%),ESIC (Employee 0.75%),ESIC (Employer 3.25%),Professional Tax,Total Statutory');

  employees.forEach(e => {
    const totalStatutory = e.epf_employee + e.epf_employer + e.esic_employee + e.esic_employer + e.pt_amount;
    lines.push([
      escapeCSV(e.name),
      e.salary,
      e.epf_employee.toFixed(0),
      e.epf_employer.toFixed(0),
      e.esic_employee.toFixed(0),
      e.esic_employer.toFixed(0),
      e.pt_amount,
      totalStatutory.toFixed(0),
    ].join(','));
  });

  const filename = `EPFESIC_Report_${period.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

export function printComplianceReport(elementId: string): void {
  const element = document.getElementById(elementId);
  if (!element) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Compliance Report</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; padding: 20px; color: #333; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f5f5f5; font-weight: 600; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      ${element.innerHTML}
      <div style="margin-top: 24px; border-top: 1px solid #eee; padding-top: 8px; font-size: 11px; color: #999;">
        Generated on ${new Date().toLocaleString('en-IN')}
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
}
