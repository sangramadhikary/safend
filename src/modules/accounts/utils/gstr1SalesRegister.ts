/**
 * GSTR-1 Sales Register — the CA's monthly "DETAILS OF SALE" sheet.
 *
 * Reproduces the accountant's Excel layout exactly, in both .xlsx and .pdf:
 *
 *   Row 1  "<Company> , GSTIN NO-<GSTIN>"              (merged, yellow)
 *   Row 2  "DETAILS OF SALE FOR THE MONTH OF <MONTH YYYY>" (merged, blue)
 *   Row 3  SL.NO. | NAME OF THE PARTY | GSTIN OF THE PARTY | INVOICE NO. |
 *          DATE | GST RATE | TAXABLE VALUE | IGST | CGST | SGST | TOTAL  (green)
 *   Rows   one line per invoice / note, sorted by invoice number
 *   Last   TOTAL row
 *
 * Figures come from the same allocation used by the GSTR-1 JSON export
 * (`allocateInvoice` / `splitTax`), so this sheet always reconciles with the
 * portal upload. Credit notes appear with negative values.
 */

import {
  allocateInvoice,
  isInterStateRow,
  r2,
  resolveBuyerGstin,
  splitTax,
  toGstnDate,
  triggerDownload,
  type Gstr1InvoiceRow,
} from './complianceExport';

// ─── ROW MODEL ──────────────────────────────────────────────────────────────

export interface SalesRegisterRow {
  slNo: number;
  partyName: string;
  /** Buyer GSTIN, or "—" for unregistered buyers. */
  gstin: string;
  invoiceNo: string;
  /** DD-MM-YYYY */
  date: string;
  /** Calendar parts of the invoice date (local time, same as the period key). */
  dateParts: { y: number; m: number; d: number };
  /** Distinct GST rates on the document, in percent (e.g. [18]). */
  rates: number[];
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  total: number;
}

export interface SalesRegister {
  /** "Safend Secure Solutions Private Limited , GSTIN NO-21ABDCS8727K1Z4" */
  title: string;
  /** "DETAILS OF SALE FOR THE MONTH OF AUGUST 2026" */
  subtitle: string;
  /** "AUGUST 2026" */
  monthLabel: string;
  rows: SalesRegisterRow[];
  totals: { taxable: number; igst: number; cgst: number; sgst: number; total: number };
}

export const SALES_REGISTER_HEADERS = [
  'SL.NO.',
  'NAME OF THE PARTY',
  'GSTIN OF THE PARTY',
  'INVOICE NO.',
  'DATE',
  'GST RATE',
  'TAXABLE VALUE',
  'IGST',
  'CGST',
  'SGST',
  'TOTAL',
] as const;

/** "2026-08" → "AUGUST 2026" */
export function salesRegisterMonthLabel(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number);
  const month = new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long' }).toUpperCase();
  return `${month} ${y}`;
}

/** Build the register rows for one return period. Pure — no DOM access. */
export function buildGstr1SalesRegister(
  rows: Gstr1InvoiceRow[],
  periodKey: string,
  supplier: { name: string; gstin: string },
): SalesRegister {
  const docNo = (r: Gstr1InvoiceRow) => (r.reference_number || r.id || '').trim();
  const sorted = [...rows].sort(
    (a, b) =>
      docNo(a).localeCompare(docNo(b), 'en', { numeric: true }) ||
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const registerRows: SalesRegisterRow[] = sorted.map((row, idx) => {
    const isNote = (row.gst_amount || 0) < 0 || (row.amount || 0) < 0;
    const sign = isNote ? -1 : 1;
    const inter = isInterStateRow(row);

    // Group by rate exactly like the JSON `itms`, then split each rate's tax.
    const byRate = new Map<number, { txval: number; tax: number }>();
    for (const a of allocateInvoice(row)) {
      const g = byRate.get(a.rt) ?? { txval: 0, tax: 0 };
      g.txval = r2(g.txval + a.txval);
      g.tax = r2(g.tax + a.tax);
      byRate.set(a.rt, g);
    }
    let taxable = 0, igst = 0, cgst = 0, sgst = 0;
    for (const g of byRate.values()) {
      const t = splitTax(g.tax, inter);
      taxable = r2(taxable + g.txval);
      igst = r2(igst + t.iamt);
      cgst = r2(cgst + t.camt);
      sgst = r2(sgst + t.samt);
    }

    // TOTAL is the invoice value (GSTR-1 `val`). RCM invoices don't carry the
    // tax in their stored total, so for them the row is summed instead.
    const computed = r2(taxable + igst + cgst + sgst);
    const stored = r2(Math.abs(row.total_amount || 0));
    const total = row.gst_treatment !== 'rcm' && stored > 0 ? stored : computed;

    const d = new Date(row.created_at);
    return {
      slNo: idx + 1,
      partyName: (row.client_name || '').trim(),
      gstin: resolveBuyerGstin(row) ?? '—',
      invoiceNo: docNo(row),
      date: toGstnDate(row.created_at),
      dateParts: { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() },
      rates: Array.from(byRate.keys()).sort((a, b) => a - b),
      taxable: r2(sign * taxable),
      igst: r2(sign * igst),
      cgst: r2(sign * cgst),
      sgst: r2(sign * sgst),
      total: r2(sign * total),
    };
  });

  const sum = (k: 'taxable' | 'igst' | 'cgst' | 'sgst' | 'total') =>
    r2(registerRows.reduce((s, r) => s + r[k], 0));

  const monthLabel = salesRegisterMonthLabel(periodKey);
  return {
    title: `${supplier.name} , GSTIN NO-${supplier.gstin}`,
    subtitle: `DETAILS OF SALE FOR THE MONTH OF ${monthLabel}`,
    monthLabel,
    rows: registerRows,
    totals: { taxable: sum('taxable'), igst: sum('igst'), cgst: sum('cgst'), sgst: sum('sgst'), total: sum('total') },
  };
}

// ─── SHARED FORMATTING ──────────────────────────────────────────────────────

/** Accountant's sheet shows plain 2-dp numbers ("32000.00"); tax columns that don't apply stay blank. */
export const fmtAmount = (n: number, blankZero = false): string =>
  blankZero && n === 0 ? '' : n.toFixed(2);

export const fmtRates = (rates: number[]): string => rates.map((r) => `${r}%`).join(' / ');

/** Colours sampled from the accountant's sheet. */
const COLOR = {
  titleFill: 'FFFF99',   // row 1 — light yellow
  subtitleFill: '00B0F0', // row 2 — light blue
  subtitleFont: 'FFFFCC', // row 2 text — cream
  headerFill: 'CCFFCC',  // row 3 — light green
  border: '000000',
};

// ─── EXCEL (.xlsx) ──────────────────────────────────────────────────────────

/** Build the styled workbook. Works in the browser and in Node. */
export async function buildGstr1SalesRegisterXlsx(register: SalesRegister): Promise<ArrayBuffer> {
  const mod: any = await import('exceljs');
  const ExcelJS = mod.default ?? mod;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Safend ERP';
  wb.created = new Date();

  const ws = wb.addWorksheet(register.monthLabel, {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      printTitlesRow: '1:3',
      margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });

  ws.columns = [
    { width: 7 },  // A SL.NO.
    { width: 44 }, // B NAME OF THE PARTY
    { width: 20 }, // C GSTIN OF THE PARTY
    { width: 11 }, // D INVOICE NO.
    { width: 12 }, // E DATE
    { width: 10 }, // F GST RATE
    { width: 12 }, // G TAXABLE VALUE
    { width: 11 }, // H IGST
    { width: 12 }, // I CGST
    { width: 12 }, // J SGST
    { width: 13 }, // K TOTAL
  ];

  const thin = { style: 'thin', color: { argb: `FF${COLOR.border}` } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (hex: string) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } });
  const LAST_COL = 11;

  // Row 1 — company + GSTIN
  ws.mergeCells(1, 1, 1, LAST_COL);
  const r1 = ws.getRow(1);
  r1.height = 21;
  r1.getCell(1).value = register.title;
  r1.getCell(1).font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF000000' } };
  r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 2 — month caption
  ws.mergeCells(2, 1, 2, LAST_COL);
  const r2row = ws.getRow(2);
  r2row.height = 19;
  r2row.getCell(1).value = register.subtitle;
  r2row.getCell(1).font = { name: 'Arial', size: 12, bold: true, color: { argb: `FF${COLOR.subtitleFont}` } };
  r2row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 3 — column headers
  const r3 = ws.getRow(3);
  r3.height = 30;
  SALES_REGISTER_HEADERS.forEach((h, i) => {
    const c = r3.getCell(i + 1);
    c.value = h;
    c.font = { name: 'Times New Roman', size: 10, bold: true };
    c.alignment = { horizontal: i === 1 ? 'left' : 'center', vertical: 'middle', wrapText: true };
  });

  for (let col = 1; col <= LAST_COL; col++) {
    ws.getCell(1, col).fill = fill(COLOR.titleFill);
    ws.getCell(2, col).fill = fill(COLOR.subtitleFill);
    ws.getCell(3, col).fill = fill(COLOR.headerFill);
    for (let row = 1; row <= 3; row++) ws.getCell(row, col).border = border;
  }

  // Data rows
  const FIRST = 4;
  const AMOUNT_FMT = '0.00';
  const dataFont = { name: 'Arial', size: 10 };
  register.rows.forEach((r, i) => {
    const row = ws.getRow(FIRST + i);
    const invoiceIsNumeric = /^\d{1,15}$/.test(r.invoiceNo);
    const single = r.rates.length === 1 ? r.rates[0] : null;

    row.values = [
      r.slNo,
      r.partyName,
      r.gstin,
      invoiceIsNumeric ? Number(r.invoiceNo) : r.invoiceNo,
      // UTC midnight so Excel shows the same calendar day in every timezone.
      new Date(Date.UTC(r.dateParts.y, r.dateParts.m - 1, r.dateParts.d)),
      single != null ? single / 100 : fmtRates(r.rates),
      r.taxable,
      r.igst === 0 ? null : r.igst,
      r.cgst === 0 ? null : r.cgst,
      r.sgst === 0 ? null : r.sgst,
      r.total,
    ];

    for (let col = 1; col <= LAST_COL; col++) {
      const c = row.getCell(col);
      c.font = dataFont;
      c.border = border;
      c.alignment = { vertical: 'middle', horizontal: col === 2 ? 'left' : col >= 7 ? 'right' : 'center' };
      if (col >= 7) c.numFmt = AMOUNT_FMT;
    }
    row.getCell(5).numFmt = 'dd-mm-yyyy';
    if (single != null) row.getCell(6).numFmt = Number.isInteger(single) ? '0%' : '0.0#%';
  });

  // Totals row — live SUM formulas with cached results.
  const totalRowNo = FIRST + register.rows.length;
  const last = totalRowNo - 1;
  const totalRow = ws.getRow(totalRowNo);
  ws.mergeCells(totalRowNo, 1, totalRowNo, 6);
  totalRow.getCell(1).value = 'TOTAL';
  const sumCell = (col: number, letter: string, result: number) => {
    totalRow.getCell(col).value = register.rows.length
      ? { formula: `SUM(${letter}${FIRST}:${letter}${last})`, result }
      : result;
  };
  sumCell(7, 'G', register.totals.taxable);
  sumCell(8, 'H', register.totals.igst);
  sumCell(9, 'I', register.totals.cgst);
  sumCell(10, 'J', register.totals.sgst);
  sumCell(11, 'K', register.totals.total);
  for (let col = 1; col <= LAST_COL; col++) {
    const c = totalRow.getCell(col);
    c.font = { ...dataFont, bold: true };
    c.border = border;
    c.alignment = { vertical: 'middle', horizontal: col <= 6 ? 'center' : 'right' };
    if (col >= 7) c.numFmt = AMOUNT_FMT;
  }

  ws.pageSetup.printArea = `A1:K${totalRowNo}`;

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

// ─── PDF ────────────────────────────────────────────────────────────────────

/** Column widths in points for A4 landscape; NAME OF THE PARTY flexes. */
const PDF_COLS: { w?: number; align: 'left' | 'center' | 'right' }[] = [
  { w: 30, align: 'center' },  // SL.NO.
  { align: 'left' },           // NAME OF THE PARTY (flex)
  { w: 96, align: 'center' },  // GSTIN
  { w: 52, align: 'center' },  // INVOICE NO.
  { w: 56, align: 'center' },  // DATE
  { w: 40, align: 'center' },  // GST RATE
  { w: 62, align: 'right' },   // TAXABLE VALUE
  { w: 54, align: 'right' },   // IGST
  { w: 56, align: 'right' },   // CGST
  { w: 56, align: 'right' },   // SGST
  { w: 64, align: 'right' },   // TOTAL
];

/** Build the PDF as a react-pdf <Document> element. Works in the browser and in Node. */
export async function buildGstr1SalesRegisterPdfDocument(register: SalesRegister) {
  const React = await import('react');
  const { Document, Page, Text, View, StyleSheet } = await import('@react-pdf/renderer');
  const ce = React.createElement;
  const hex = (h: string) => `#${h}`;
  const BORDER = 0.6;

  const S = StyleSheet.create({
    page: { paddingVertical: 20, paddingHorizontal: 18, fontFamily: 'Helvetica', fontSize: 8, color: '#000' },
    table: { borderTopWidth: BORDER, borderLeftWidth: BORDER, borderColor: '#000' },
    row: { flexDirection: 'row' },
    band: {
      borderRightWidth: BORDER, borderBottomWidth: BORDER, borderColor: '#000',
      paddingVertical: 3, textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: 11,
    },
    cell: {
      borderRightWidth: BORDER, borderBottomWidth: BORDER, borderColor: '#000',
      paddingVertical: 2, paddingHorizontal: 3, justifyContent: 'center',
    },
    head: { fontFamily: 'Times-Bold', fontSize: 8.5 },
    bold: { fontFamily: 'Helvetica-Bold' },
  });

  const cell = (i: number, content: string, extra: object = {}, key?: string) => {
    const col = PDF_COLS[i];
    return ce(
      View,
      { key: key ?? `c${i}`, style: [S.cell, col.w ? { width: col.w } : { flex: 1 }, extra] as any },
      ce(Text, { style: { textAlign: col.align } }, content),
    );
  };

  const header = ce(
    View,
    { key: 'hdr', fixed: true },
    ce(View, { style: [S.band, { backgroundColor: hex(COLOR.titleFill) }] as any }, ce(Text, null, register.title)),
    ce(
      View,
      { style: [S.band, { backgroundColor: hex(COLOR.subtitleFill), color: hex(COLOR.subtitleFont) }] as any },
      ce(Text, null, register.subtitle),
    ),
    ce(
      View,
      { style: [S.row, { backgroundColor: hex(COLOR.headerFill) }] as any },
      SALES_REGISTER_HEADERS.map((h, i) =>
        ce(
          View,
          {
            key: h,
            style: [S.cell, PDF_COLS[i].w ? { width: PDF_COLS[i].w } : { flex: 1 }, { minHeight: 24 }] as any,
          },
          ce(Text, { style: [S.head, { textAlign: i === 1 ? 'left' : 'center' }] as any }, h),
        ),
      ),
    ),
  );

  const body = register.rows.map((r) =>
    ce(
      View,
      { key: `r${r.slNo}`, style: S.row, wrap: false },
      cell(0, String(r.slNo)),
      cell(1, r.partyName),
      cell(2, r.gstin),
      cell(3, r.invoiceNo),
      cell(4, r.date),
      cell(5, fmtRates(r.rates)),
      cell(6, fmtAmount(r.taxable)),
      cell(7, fmtAmount(r.igst, true)),
      cell(8, fmtAmount(r.cgst, true)),
      cell(9, fmtAmount(r.sgst, true)),
      cell(10, fmtAmount(r.total)),
    ),
  );

  const t = register.totals;
  const totals = ce(
    View,
    { key: 'tot', style: S.row, wrap: false },
    // SL.NO.…GST RATE merged: flexing fills exactly the width of columns 1–6.
    ce(
      View,
      { style: [S.cell, { flex: 1 }] as any },
      ce(Text, { style: [S.bold, { textAlign: 'center' }] as any }, 'TOTAL'),
    ),
    cell(6, fmtAmount(t.taxable), S.bold, 't6'),
    cell(7, fmtAmount(t.igst, true), S.bold, 't7'),
    cell(8, fmtAmount(t.cgst, true), S.bold, 't8'),
    cell(9, fmtAmount(t.sgst, true), S.bold, 't9'),
    cell(10, fmtAmount(t.total), S.bold, 't10'),
  );

  return ce(
    Document,
    { title: `GSTR-1 ${register.monthLabel}`, author: 'Safend ERP' },
    ce(
      Page,
      { size: 'A4', orientation: 'landscape', style: S.page },
      ce(View, { style: S.table }, header, ...body, totals),
    ),
  );
}

// ─── BROWSER DOWNLOADS ──────────────────────────────────────────────────────

export async function exportGSTR1_SalesRegisterXLSX(
  rows: Gstr1InvoiceRow[],
  periodKey: string,
  supplier: { name: string; gstin: string },
  filename: string,
): Promise<void> {
  const register = buildGstr1SalesRegister(rows, periodKey, supplier);
  const buf = await buildGstr1SalesRegisterXlsx(register);
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerDownload(blob, filename);
}

export async function exportGSTR1_SalesRegisterPDF(
  rows: Gstr1InvoiceRow[],
  periodKey: string,
  supplier: { name: string; gstin: string },
  filename: string,
): Promise<void> {
  const register = buildGstr1SalesRegister(rows, periodKey, supplier);
  const doc = await buildGstr1SalesRegisterPdfDocument(register);
  const { pdf } = await import('@react-pdf/renderer');
  const blob = await pdf(doc as any).toBlob();
  triggerDownload(blob, filename);
}
