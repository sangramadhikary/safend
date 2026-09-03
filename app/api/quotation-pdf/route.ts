import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import path from 'path';
import fs from 'fs';
import { Document, Page, Text, View, Image, StyleSheet, Font, pdf } from '@react-pdf/renderer';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { sanitizeKeySegment } from '@/lib/security/path-sanitizer';

// Register Noto Sans (supports ₹ symbol) from local bundled TTF files
const fontsDir = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: 'NotoSans',
  fonts: [
    { src: path.join(fontsDir, 'NotoSans-Regular.ttf'), fontWeight: 400 },
    { src: path.join(fontsDir, 'NotoSans-Bold.ttf'), fontWeight: 700 },
  ],
});

// Disable hyphenation for clean number rendering
Font.registerHyphenationCallback((word: string) => [word]);

// Logo — read as base64 data URI for guaranteed react-pdf compatibility
const logoPath = path.join(process.cwd(), 'public', 'logo.png');
const LOGO_SRC = fs.existsSync(logoPath)
  ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
  : null;

// ── Constants ────────────────────────────────────────────────────────────────
const COMPANY_NAME = 'Safend Secure Solutions Pvt. Ltd.';
const COMPANY_ADDRESS = 'Plot No. 548, Urali Gopalpur, Cuttack Sadar, Odisha - 753011';
const COMPANY_EMAIL = 'info@safend.in';
const COMPANY_PHONE = '+91 93371 91654';
const COMPANY_GSTIN = '21AADCS1234K1Z5'; // Issuer GSTIN
const SAC_CODE = '998512'; // Security services SAC
const COMPANY_PAN = 'AADCS1234K';

// Minimum wage daily gross rates (as per Odisha 2026 notification, effective 1 April 2026, incl. VDA)
// Source: Govt. of Odisha / ETHRWorld: Unskilled ₹472 · Semi-Skilled ₹522 · Skilled ₹572 · Highly Skilled ₹622
// Category classification per FICCI/PSARA/CLC Watch & Ward standard:
//   Unarmed Guards  → Semi-Skilled  (PSARA-certified, trained — not unskilled)
//   Armed Guards    → Skilled       (weapon licence, higher training)
//   Supervisors     → Highly Skilled (supervisory role, PSARA-certified)
//   Patrol Officers → Skilled       (mobile patrol, trained)
//   PSO             → Highly Skilled (personal protection, highest training)
//   Bouncers        → Skilled       (physical security specialism)
//   Manpower        → Unskilled     (general labour / support roles)
const MIN_WAGE_DAILY: Record<string, { rate: number; category: string }> = {
  unarmedGuards:  { rate: 522, category: 'Semi-Skilled' },
  armedGuards:    { rate: 572, category: 'Skilled' },
  supervisors:    { rate: 622, category: 'Highly Skilled' },
  patrolOfficers: { rate: 572, category: 'Skilled' },
  pso:            { rate: 622, category: 'Highly Skilled' },
  bouncers:       { rate: 572, category: 'Skilled' },
  manpower:       { rate: 472, category: 'Unskilled' },
};

// Statutory rates
const PF_RATE = 0.13;        // 13% (12% PF + 1% admin)
const ESI_RATE = 0.0325;     // 3.25%
const BONUS_RATE = 0.0833;   // 8.33%
const WORKING_DAYS = 26;

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: string | null | undefined): string {
  if (!d) return 'N/A';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return String(d); }
}

const fmtCur = (v: number) =>
  `\u20B9 ${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtCurShort = (v: number) =>
  `\u20B9 ${v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// ── Styles ───────────────────────────────────────────────────────────────────
const BRAND = '#D71920';
const DARK = '#1a1a1a';
const GRAY = '#555555';
const LIGHT_GRAY = '#888888';
const BORDER = '#e0e0e0';
const BG_LIGHT = '#f8f9fa';

const S = StyleSheet.create({
  page: { padding: 48, paddingBottom: 60, fontSize: 9, fontFamily: 'NotoSans', color: DARK, lineHeight: 1.5 },

  // ── Letterhead ──
  letterhead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  logoRow: { flexDirection: 'row', alignItems: 'flex-start' },
  logo: { width: 52, height: 32, marginRight: 10 },
  companyBlock: { justifyContent: 'flex-start' },
  companyName: { fontSize: 13, fontFamily: 'NotoSans', fontWeight: 700, color: BRAND, letterSpacing: 0.3 },
  companySub: { fontSize: 7, color: GRAY, marginTop: 2 },
  refBlock: { alignItems: 'flex-end' },
  refLabel: { fontSize: 7, color: LIGHT_GRAY, textTransform: 'uppercase', letterSpacing: 0.5 },
  refValue: { fontSize: 8.5, fontFamily: 'NotoSans', fontWeight: 700, color: DARK, marginTop: 1 },
  refDate: { fontSize: 7.5, color: GRAY, marginTop: 3 },

  // ── Divider ──
  dividerBrand: { height: 2, backgroundColor: BRAND, marginBottom: 14 },
  dividerThin: { height: 0.5, backgroundColor: BORDER, marginVertical: 10 },

  // ── Addressee block ──
  addressBlock: { marginBottom: 14 },
  addressTo: { fontSize: 8.5, fontFamily: 'NotoSans', fontWeight: 700, color: DARK },
  addressLine: { fontSize: 8.5, color: DARK },
  addressGray: { fontSize: 8, color: GRAY },

  // ── Subject line ──
  subjectRow: { flexDirection: 'row', marginBottom: 12, marginTop: 2 },
  subjectLabel: { fontSize: 9, fontFamily: 'NotoSans', fontWeight: 700, color: DARK },
  subjectText: { fontSize: 9, color: DARK, flex: 1 },

  // ── Body text ──
  bodyText: { fontSize: 9, color: DARK, lineHeight: 1.6, marginBottom: 10 },

  // ── Validity strip ──
  validityStrip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff8f8', borderRadius: 3, border: `0.5px solid #f5c6c6`,
    paddingHorizontal: 10, paddingVertical: 5, marginBottom: 14 },
  validityItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  validityLabel: { fontSize: 7, color: LIGHT_GRAY, textTransform: 'uppercase', letterSpacing: 0.4 },
  validityValue: { fontSize: 8, fontFamily: 'NotoSans', fontWeight: 700, color: DARK },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  statusText: { color: '#fff', fontFamily: 'NotoSans', fontWeight: 700, fontSize: 7 },

  // ── Section heading ──
  sectionHeading: { fontSize: 9, fontFamily: 'NotoSans', fontWeight: 700, color: BRAND,
    textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12, marginBottom: 4 },

  // ── Scope of services table ──
  tableWrap: { border: `0.5px solid ${BORDER}`, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  tableHeader: { flexDirection: 'row', backgroundColor: BRAND, paddingVertical: 5, paddingHorizontal: 8 },
  tableHeaderCell: { color: '#fff', fontFamily: 'NotoSans', fontWeight: 700, fontSize: 7.5 },
  tableRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottom: `0.5px solid ${BORDER}` },
  tableRowAlt: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottom: `0.5px solid ${BORDER}`, backgroundColor: BG_LIGHT },
  colSno: { width: 22, textAlign: 'center' },
  colService: { flex: 3 },
  colShift: { flex: 1.2 },
  colQty: { width: 28, textAlign: 'center' },
  colRate: { width: 70, textAlign: 'right' },
  colAmount: { width: 76, textAlign: 'right' },

  // ── Price summary box ──
  summaryBox: { alignSelf: 'flex-end', width: 210, marginTop: 6, marginBottom: 12,
    padding: 8, backgroundColor: BG_LIGHT, borderRadius: 3, border: `0.5px solid ${BORDER}` },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  summaryLabel: { fontSize: 8.5, color: GRAY },
  summaryValue: { fontSize: 8.5, color: DARK },
  summaryNote: { fontSize: 7, color: LIGHT_GRAY, marginTop: 4, lineHeight: 1.5 },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5,
    paddingTop: 5, borderTop: `1.5px solid ${BRAND}` },
  grandLabel: { fontSize: 10.5, fontFamily: 'NotoSans', fontWeight: 700, color: BRAND },
  grandValue: { fontSize: 10.5, fontFamily: 'NotoSans', fontWeight: 700, color: BRAND },

  // ── Location card ──
  locCard: { backgroundColor: BG_LIGHT, border: `0.5px solid ${BORDER}`, borderRadius: 3,
    paddingVertical: 5, paddingHorizontal: 9, marginBottom: 4 },
  locName: { fontFamily: 'NotoSans', fontWeight: 700, fontSize: 8.5 },
  locAddr: { fontSize: 7.5, color: GRAY, marginTop: 1 },
  locBadge: { fontSize: 7, color: BRAND, marginTop: 2, fontFamily: 'NotoSans', fontWeight: 700 },

  // ── Rate basis note (compact, no cards) ──
  rateNote: { fontSize: 7.5, color: GRAY, lineHeight: 1.6, marginBottom: 3 },
  rateTable: { border: `0.5px solid ${BORDER}`, borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
  rateTableHeader: { flexDirection: 'row', backgroundColor: '#f0f0f0', paddingVertical: 4, paddingHorizontal: 8 },
  rateTableHeaderCell: { fontFamily: 'NotoSans', fontWeight: 700, fontSize: 7, color: DARK },
  rateTableRow: { flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 8, borderTop: `0.5px solid ${BORDER}` },
  rateTableCell: { fontSize: 7.5, color: DARK },
  rCat: { width: 90 },
  rDaily: { width: 52, textAlign: 'right' },
  rStat: { width: 52, textAlign: 'right' },
  rCTC: { width: 52, textAlign: 'right' },
  rMonthly: { width: 58, textAlign: 'right' },
  rBilling: { width: 68, textAlign: 'right' },

  // ── Terms ──
  termsItem: { fontSize: 8, color: GRAY, marginLeft: 10, lineHeight: 1.65, marginBottom: 1 },
  termsBold: { fontSize: 8, color: DARK, fontFamily: 'NotoSans', fontWeight: 700 },

  // ── Sign-off ──
  signoff: { marginTop: 18 },
  signoffText: { fontSize: 9, color: DARK, lineHeight: 1.7 },
  signoffName: { fontSize: 9.5, fontFamily: 'NotoSans', fontWeight: 700, color: DARK, marginTop: 18 },
  signoffDesig: { fontSize: 8, color: GRAY },
  signoffStamp: { width: 68, height: 22, marginTop: 4, borderRadius: 2,
    border: `0.5px solid ${BORDER}`, backgroundColor: BG_LIGHT },

  // ── Footer ──
  footer: { position: 'absolute', bottom: 20, left: 48, right: 48,
    borderTop: `0.5px solid ${BORDER}`, paddingTop: 5,
    flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 6.5, color: LIGHT_GRAY },
});

// ── PDF Document Builder ─────────────────────────────────────────────────────
function buildDoc(q: any) {
  const ce = React.createElement;

  const SERVICE_LABELS: Record<string, string> = {
    unarmedGuards: 'Unarmed Security Guard',
    armedGuards: 'Armed Security Guard',
    supervisors: 'Security Supervisor',
    patrolOfficers: 'Patrol Officer',
    pso: 'Personal Security Officer (PSO)',
    bouncers: 'Bouncer',
    manpower: 'Manpower',
  };
  const SHIFT_LABELS: Record<string, string> = { day: 'Day', afternoon: 'Afternoon', night: 'Night' };

  const serviceInstances: Record<string, any[]> = q.serviceInstances || {};
  type Row = { sno: number; label: string; shift: string; shiftType: string; qty: number; rate: number; total: number; serviceType: string };
  const rows: Row[] = [];
  let sno = 0;
  const personnelSummary: Record<string, number> = {};

  Object.keys(serviceInstances).forEach((type) => {
    (serviceInstances[type] || []).forEach((inst: any) => {
      if (!inst?.shifts) return;
      (['day', 'afternoon', 'night'] as const).forEach((shift) => {
        const s = inst.shifts[shift];
        if (!s?.enabled) return;
        if (shift === 'afternoon' && inst.shiftType !== '8H') return;
        sno++;
        rows.push({
          sno,
          label: SERVICE_LABELS[type] || type,
          shift: SHIFT_LABELS[shift],
          shiftType: inst.shiftType,
          qty: s.quantity || 0,
          rate: s.rate || 0,
          total: (s.quantity || 0) * (s.rate || 0),
          serviceType: type,
        });
        const key = SERVICE_LABELS[type] || type;
        personnelSummary[key] = (personnelSummary[key] || 0) + (s.quantity || 0);
      });
    });
  });

  const subtotal = rows.reduce((a, r) => a + r.total, 0);
  const gstPct = q.gstExempt ? 0 : (q.gstPercentage ?? 18);
  const gstAmt = subtotal * gstPct / 100;
  const grandTotal = subtotal + gstAmt;
  const locations: any[] = q.locations || [];
  const totalPersonnel = Object.values(personnelSummary).reduce((a: number, b: any) => a + b, 0);

  // Unique service types for rate-basis table
  const usedServiceTypes = [...new Set(rows.map(r => r.serviceType))];

  // Wage breakdowns (compact table rows)
  const wageBreakdowns = usedServiceTypes.map(type => {
    const info = MIN_WAGE_DAILY[type] || { rate: 0, category: 'Unknown' };
    const dailyWage = info.rate;
    const pf = Math.round(dailyWage * PF_RATE);
    const esi = Math.round(dailyWage * ESI_RATE);
    const bonus = Math.round(dailyWage * BONUS_RATE);
    const dailyCTC = dailyWage + pf + esi + bonus;
    const monthlyCTC = dailyCTC * WORKING_DAYS;
    const sampleRow = rows.find(r => r.serviceType === type);
    const shiftMultiplier = sampleRow?.shiftType === '12H' ? 1.5 : 1;
    const billingRate = sampleRow?.rate || 0;
    const margin = billingRate > 0 ? Math.round(((billingRate / (monthlyCTC * shiftMultiplier)) - 1) * 100) : 0;
    return {
      label: SERVICE_LABELS[type] || type,
      category: info.category,
      dailyWage, pf, esi, bonus, dailyCTC, monthlyCTC,
      shiftMultiplier, billingRate, margin,
    };
  });

  // Status badge colour
  const statusColor = (q.status || '').toLowerCase() === 'accepted' ? '#22c55e'
    : (q.status || '').toLowerCase() === 'rejected' ? '#ef4444'
    : (q.status || '').toLowerCase() === 'pending' ? '#f59e0b'
    : '#6b7280';

  // Opening letter body
  const clientName = q.companyName || q.client || 'Sir/Madam';
  const contactPerson = q.contactPerson || '';
  const salutation = contactPerson ? `Dear ${contactPerson},` : `Dear Sir/Madam,`;
  const serviceDesc = q.service || 'Security & Manpower Services';

  return ce(Document, { title: `Quotation ${q.quotationId || q.id}` },
    ce(Page, { size: 'A4', style: S.page },

      // ─── LETTERHEAD ───
      ce(View, { style: S.letterhead },
        ce(View, { style: S.logoRow },
          ...(LOGO_SRC ? [ce(Image, { src: LOGO_SRC, style: S.logo })] : []),
          ce(View, { style: S.companyBlock },
            ce(Text, { style: S.companyName }, COMPANY_NAME),
            ce(Text, { style: S.companySub }, COMPANY_ADDRESS),
            ce(Text, { style: S.companySub }, `${COMPANY_EMAIL}  |  ${COMPANY_PHONE}`),
            ce(Text, { style: S.companySub }, `GSTIN: ${COMPANY_GSTIN}  |  PAN: ${COMPANY_PAN}`),
          ),
        ),
        // Ref block top-right
        ce(View, { style: S.refBlock },
          ce(Text, { style: S.refLabel }, 'Quotation Ref.'),
          ce(Text, { style: S.refValue }, q.quotationId || q.id || 'N/A'),
          ce(Text, { style: S.refDate }, `Date: ${fmtDate(q.date)}`),
        ),
      ),
      ce(View, { style: S.dividerBrand }),

      // ─── ADDRESSEE ───
      ce(View, { style: S.addressBlock },
        ce(Text, { style: S.addressTo }, 'To,'),
        ce(Text, { style: { ...S.addressTo, marginTop: 2 } }, clientName),
        ...(q.clientAddress ? q.clientAddress.split(',').map((line: string, i: number) =>
          ce(Text, { key: String(i), style: S.addressLine }, line.trim())
        ) : []),
        ...(q.contactPhone  ? [ce(Text, { style: { ...S.addressGray, marginTop: 2 } }, `Ph: ${q.contactPhone}`)] : []),
        ...(q.contactEmail  ? [ce(Text, { style: S.addressGray }, q.contactEmail)] : []),
      ),

      // ─── SUBJECT ───
      ce(View, { style: S.subjectRow },
        ce(Text, { style: S.subjectLabel }, 'Sub: '),
        ce(Text, { style: S.subjectText },
          `Quotation for ${serviceDesc}${locations.length > 0 ? ` at ${locations.map((l: any) => l.name || l.city || '').filter(Boolean).join(', ')}` : ''}`
        ),
      ),

      // ─── OPENING PARAGRAPH ───
      ce(Text, { style: S.bodyText }, salutation),
      ce(Text, { style: S.bodyText },
        `With reference to your enquiry, we at ${COMPANY_NAME} are pleased to submit our quotation for providing professional ${serviceDesc}. ` +
        `Our rates are inclusive of all statutory employer contributions and are fully compliant with the Govt. of Odisha Minimum Wages notification.`
      ),

      // ─── VALIDITY STRIP ───
      ce(View, { style: S.validityStrip },
        ce(View, { style: S.validityItem },
          ce(Text, { style: S.validityLabel }, 'Quote Date'),
          ce(Text, { style: S.validityValue }, fmtDate(q.date)),
        ),
        ce(View, { style: S.validityItem },
          ce(Text, { style: S.validityLabel }, 'Valid Until'),
          ce(Text, { style: S.validityValue }, fmtDate(q.validUntil)),
        ),
        ce(View, { style: S.validityItem },
          ce(Text, { style: S.validityLabel }, 'Status'),
          ce(View, { style: { ...S.statusBadge, backgroundColor: statusColor } },
            ce(Text, { style: S.statusText }, (q.status || 'Draft').toUpperCase()),
          ),
        ),
      ),

      // ─── SCOPE OF SERVICES TABLE ───
      ...(rows.length > 0 ? [
        ce(Text, { style: S.sectionHeading }, 'Scope of Services & Proposed Rates'),
        ce(View, { style: S.tableWrap },
          ce(View, { style: S.tableHeader },
            ce(Text, { style: { ...S.tableHeaderCell, ...S.colSno } }, '#'),
            ce(Text, { style: { ...S.tableHeaderCell, ...S.colService } }, 'Service'),
            ce(Text, { style: { ...S.tableHeaderCell, ...S.colShift } }, 'Shift'),
            ce(Text, { style: { ...S.tableHeaderCell, ...S.colQty } }, 'Qty'),
            ce(Text, { style: { ...S.tableHeaderCell, ...S.colRate } }, 'Rate / Head / Mo'),
            ce(Text, { style: { ...S.tableHeaderCell, ...S.colAmount } }, 'Monthly Value'),
          ),
          ...rows.map((row, i) =>
            ce(View, { key: String(i), style: i % 2 === 0 ? S.tableRow : S.tableRowAlt },
              ce(Text, { style: S.colSno }, String(row.sno)),
              ce(Text, { style: S.colService }, `${row.label} (${row.shiftType})`),
              ce(Text, { style: S.colShift }, row.shift),
              ce(Text, { style: S.colQty }, String(row.qty)),
              ce(Text, { style: S.colRate }, fmtCur(row.rate)),
              ce(Text, { style: { ...S.colAmount, fontFamily: 'NotoSans', fontWeight: 700 } }, fmtCur(row.total)),
            ),
          ),
        ),

        // ─── PRICE SUMMARY ───
        ce(View, { style: S.summaryBox },
          ce(View, { style: S.summaryRow },
            ce(Text, { style: S.summaryLabel }, 'Monthly Subtotal'),
            ce(Text, { style: S.summaryValue }, fmtCur(subtotal)),
          ),
          ce(View, { style: S.summaryRow },
            ce(Text, { style: S.summaryLabel }, `GST @ ${gstPct > 0 ? `${gstPct}%` : 'Exempt'}`),
            ce(Text, { style: S.summaryValue }, gstPct > 0 ? fmtCur(gstAmt) : 'Exempt'),
          ),
          ce(View, { style: S.grandRow },
            ce(Text, { style: S.grandLabel }, 'Total Monthly Value'),
            ce(Text, { style: S.grandValue }, fmtCur(grandTotal)),
          ),
          ce(Text, { style: S.summaryNote },
            `All rates are per person per month. GST (SAC: ${SAC_CODE}) will be charged as applicable at the time of invoicing. Quoted rates are exclusive of GST unless stated otherwise.`
          ),
        ),
      ] : []),

      // ─── SERVICE LOCATIONS ───
      ...(locations.length > 0 ? [
        ce(Text, { style: S.sectionHeading }, `Service Locations (${locations.length})`),
        ...locations.map((loc: any, i: number) => {
          const personnelStr = totalPersonnel > 0
            ? Object.entries(personnelSummary).map(([k, v]) => `${v} ${k}`).join(' + ')
            : (loc.guards ? `${loc.guards} Personnel` : '');
          return ce(View, { key: String(i), style: S.locCard },
            ce(Text, { style: S.locName }, loc.name || `Post ${i + 1}`),
            ce(Text, { style: S.locAddr },
              [loc.address, loc.city, loc.district, loc.state].filter(Boolean).join(', ') +
              (loc.pincode ? ` - ${loc.pincode}` : '')
            ),
            ...(personnelStr || loc.asPerStateMinWage || q.minWageCompliance ? [
              ce(Text, { style: S.locBadge },
                [personnelStr, (loc.asPerStateMinWage || q.minWageCompliance) ? 'Min. Wage Compliant' : ''].filter(Boolean).join('  |  ')
              ),
            ] : []),
          );
        }),
      ] : []),

      // ─── RATE BASIS (compact table, only if min wage used) ───
      ...(wageBreakdowns.length > 0 ? [
        ce(Text, { style: S.sectionHeading }, 'Rate Basis — Statutory Wage Compliance'),
        ce(Text, { style: S.rateNote },
          `Rates are derived from the Govt. of Odisha Minimum Wages notification (effective 1 Apr 2026). ` +
          `All statutory employer contributions (EPF, ESI, Bonus) are included. Working days: ${WORKING_DAYS}/month.`
        ),
        ce(View, { style: S.rateTable },
          ce(View, { style: S.rateTableHeader },
            ce(Text, { style: { ...S.rateTableHeaderCell, ...S.rCat } }, 'Category'),
            ce(Text, { style: { ...S.rateTableHeaderCell, ...S.rDaily, textAlign: 'right' } }, 'Daily Wage'),
            ce(Text, { style: { ...S.rateTableHeaderCell, ...S.rStat, textAlign: 'right' } }, 'Statutory'),
            ce(Text, { style: { ...S.rateTableHeaderCell, ...S.rCTC, textAlign: 'right' } }, 'Daily CTC'),
            ce(Text, { style: { ...S.rateTableHeaderCell, ...S.rMonthly, textAlign: 'right' } }, `Monthly\u00D7${WORKING_DAYS}`),
            ce(Text, { style: { ...S.rateTableHeaderCell, ...S.rBilling, textAlign: 'right' } }, 'Billing Rate/Mo'),
          ),
          ...wageBreakdowns.map((wb, i) => {
            const statutory = wb.pf + wb.esi + wb.bonus;
            const effectiveMonthly = Math.round(wb.monthlyCTC * wb.shiftMultiplier);
            return ce(View, { key: String(i), style: S.rateTableRow },
              ce(Text, { style: { ...S.rateTableCell, ...S.rCat } },
                `${wb.label}\n${wb.category}${wb.shiftMultiplier === 1.5 ? ' \u2022 12H' : ''}`
              ),
              ce(Text, { style: { ...S.rateTableCell, ...S.rDaily } }, fmtCurShort(wb.dailyWage)),
              ce(Text, { style: { ...S.rateTableCell, ...S.rStat } }, fmtCurShort(statutory)),
              ce(Text, { style: { ...S.rateTableCell, ...S.rCTC } }, fmtCurShort(wb.dailyCTC)),
              ce(Text, { style: { ...S.rateTableCell, ...S.rMonthly } }, fmtCurShort(effectiveMonthly)),
              ce(Text, { style: { ...S.rateTableCell, ...S.rBilling, fontFamily: 'NotoSans', fontWeight: 700, color: BRAND } },
                fmtCur(wb.billingRate)
              ),
            );
          }),
        ),
      ] : []),

      // ─── TERMS & CONDITIONS ───
      ce(Text, { style: S.sectionHeading }, 'Terms & Conditions'),
      ce(Text, { style: S.termsItem }, '1. GST as applicable will be charged extra on the bill amount.'),
      ce(Text, { style: S.termsItem }, '2. The Staff will wear a uniform, which is provided by us to our staff members.'),
      ce(Text, { style: S.termsItem }, '3. Our personnel shall be under your administrative control and will perform duties as per instructions.'),
      ce(Text, { style: S.termsItem }, '4. The security staff will have full right to check any staff or visitor in case of any doubts.'),
      ce(Text, { style: S.termsItem }, '5. Only one person will issue the instruction to the Staff from the Organization and the guards will report to the same, the letter of appointment of such person should be handed over to security staff on the day of joining or at the time of issuing a letter of commencement of job.'),
      ce(Text, { style: S.termsItem }, '6. If required the security will maintain the staff attendance, movement, visitors, stock in-out registers, Materials Register at the Premises on the prescribed format, if required other required registers may be taken care of.'),
      ce(Text, { style: S.termsItem }, '7. Proper communication facilities in the Guard Cabin to be made available for better response in shortest time.'),
      ce(View, { style: { flexDirection: 'row', marginLeft: 10 } },
        ce(Text, { style: { ...S.termsItem, marginLeft: 0 } }, '8. A minimum '),
        ce(Text, { style: S.termsBold }, '15 days lead-time'),
        ce(Text, { style: { ...S.termsItem, marginLeft: 0 } }, ' will be required for selection, training and deployment of security personnel.'),
      ),
      ce(Text, { style: S.termsItem }, '9. The client will not employ any of our staff members directly or indirectly even after the contract ends for a period of one year.'),
      ce(Text, { style: S.termsItem }, '10. The contract will be for one year.'),
      ce(Text, { style: S.termsItem }, '11. The contract will be subject to termination on either side by giving one-month advance notice.'),
      ce(View, { style: { flexDirection: 'row', marginLeft: 10, flexWrap: 'wrap' } },
        ce(Text, { style: { ...S.termsItem, marginLeft: 0 } }, '12. The charges for hiring the personnel should be paid to '),
        ce(Text, { style: S.termsBold }, 'M/s Safend Secure Solutions Pvt. Ltd.'),
        ce(Text, { style: { ...S.termsItem, marginLeft: 0 } }, ' through cheque, draft, or online transfer.'),
      ),
      ...(q.paymentTerms ? [
        ce(Text, { style: { ...S.termsItem, marginTop: 4 } }, `Payment Terms: ${q.paymentTerms}`),
      ] : []),
      ...(q.termsAndConditions && q.termsAndConditions !== 'Standard terms and conditions apply as per our service agreement.' ? [
        ce(Text, { style: { ...S.termsBold, marginTop: 6, marginLeft: 0 } }, 'Additional Terms:'),
        ce(Text, { style: S.termsItem }, q.termsAndConditions),
      ] : []),

      // ─── SIGN-OFF ───
      ce(View, { style: S.signoff },
        ce(Text, { style: S.signoffText },
          'We hope our proposal meets your requirements. We assure you of our best services at all times. ' +
          'Kindly acknowledge your acceptance and we will be happy to proceed with the formalities.'
        ),
        ce(Text, { style: { ...S.signoffText, marginTop: 6 } }, 'Thanking you,'),
        ce(Text, { style: { ...S.signoffText, marginTop: 2 } }, 'Yours faithfully,'),
        ce(Text, { style: S.signoffName }, 'For Safend Secure Solutions Pvt. Ltd.'),
        ce(Text, { style: S.signoffDesig }, 'Authorised Signatory'),
      ),

      ce(Text, { style: { fontSize: 7, color: LIGHT_GRAY, marginTop: 10 } },
        'E. & O.E. \u2014 Subject to Odisha jurisdiction. This is a computer-generated document.'
      ),

      // ─── FOOTER ───
      ce(View, { style: S.footer, fixed: true },
        ce(Text, { style: S.footerText }, `${COMPANY_NAME}  |  GSTIN: ${COMPANY_GSTIN}  |  ${COMPANY_EMAIL}`),
        ce(Text, { style: S.footerText, render: ({ pageNumber, totalPages }: any) => `Page ${pageNumber} of ${totalPages}` }),
      ),
    ),
  );
}

// ── State code → state name mapping (first 2 digits of GSTIN) ────────────────
function getStateName(code: string): string {
  const states: Record<string, string> = {
    '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
    '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
    '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
    '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
    '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
    '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
    '27': 'Maharashtra', '29': 'Karnataka', '32': 'Kerala', '33': 'Tamil Nadu',
    '36': 'Telangana', '37': 'Andhra Pradesh',
  };
  return states[code] || code;
}

// ── API Handler ──────────────────────────────────────────────────────────────

function safeFilenamePart(value: unknown): string {
  return sanitizeKeySegment(String(value ?? 'document')).slice(0, 80) || 'document';
}

const MAX_SERVICE_LINE_ENTRIES = 500;

function countServiceLineEntries(q: any): number {
  let count = 0;
  const si = q?.serviceInstances;
  if (si && typeof si === 'object' && !Array.isArray(si)) {
    for (const key of Object.keys(si)) {
      const instances = si[key];
      if (Array.isArray(instances)) count += instances.length;
    }
  }
  if (Array.isArray(q?.posts)) count += q.posts.length;
  if (Array.isArray(q?.locations)) count += q.locations.length;
  return count;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { limited, retryAfter } = rateLimit(`quotation-pdf:${ip}`, { limit: 10, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  try {
    let quotation: any;
    let asDownload = false;

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      quotation = await request.json();
    } else {
      const form = await request.formData();
      const payload = form.get('payload');
      quotation = payload ? JSON.parse(String(payload)) : {};
      asDownload = String(form.get('download') || '') === '1';
    }

    if (!quotation || typeof quotation !== 'object' || Array.isArray(quotation)) {
      return NextResponse.json({ error: 'Invalid quotation payload.' }, { status: 400 });
    }
    if (countServiceLineEntries(quotation) > MAX_SERVICE_LINE_ENTRIES) {
      return NextResponse.json(
        { error: 'Payload too large: too many service-line entries.' },
        { status: 413 }
      );
    }

    const docElement = buildDoc(quotation);
    const blob = await pdf(docElement).toBlob();
    const buffer = Buffer.from(await blob.arrayBuffer());

    const filename = `Quotation_${safeFilenamePart(quotation.quotationId || quotation.id)}.pdf`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${asDownload ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('[quotation-pdf]', err);
    return NextResponse.json({ error: err?.message || 'PDF generation failed' }, { status: 500 });
  }
}
