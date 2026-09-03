import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import path from 'path';
import fs from 'fs';
import { Document, Page, Text, View, StyleSheet, Font, pdf } from '@react-pdf/renderer';
import { rateLimit, getClientIp } from '@/lib/rateLimit';

// Register Noto Sans
const fontsDir = path.join(process.cwd(), 'public', 'fonts');
Font.register({
  family: 'NotoSans',
  fonts: [
    { src: path.join(fontsDir, 'NotoSans-Regular.ttf'), fontWeight: 400 },
    { src: path.join(fontsDir, 'NotoSans-Bold.ttf'), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word: string) => [word]);

// Service provider info (Safend — the recipient of the work order)
const PROVIDER_NAME = 'Safend Secure Solutions Pvt. Ltd.';
const PROVIDER_ADDRESS = 'Plot No. 548, Urali Gopalpur, Cuttack Sadar, Odisha - 753011';
const PROVIDER_GSTIN = '21ABDC8727K1Z4';

// Colors
const DARK = '#1a1a1a';
const GRAY = '#555555';
const LIGHT_GRAY = '#888888';
const BORDER = '#d0d0d0';
const BG_LIGHT = '#f5f5f5';

// Helpers
function fmtDate(d: string | null | undefined): string {
  if (!d) return '___________';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return String(d); }
}
const fmtCur = (v: number) => `\u20B9 ${v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Convert number to Indian currency words
function numberToWordsIndian(num: number): string {
  if (!num || num === 0) return 'Zero';
  num = Math.floor(num);

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const twoDigits = (n: number): string => {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  };

  const threeDigits = (n: number): string => {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    return (h ? ones[h] + ' Hundred' + (rest ? ' ' : '') : '') + (rest ? twoDigits(rest) : '');
  };

  let result = '';
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const hundred = num;

  if (crore) result += threeDigits(crore) + ' Crore ';
  if (lakh) result += twoDigits(lakh) + ' Lakh ';
  if (thousand) result += twoDigits(thousand) + ' Thousand ';
  if (hundred) result += threeDigits(hundred);

  return result.trim();
}

// Styles
const S = StyleSheet.create({
  page: {
    paddingTop: 130,       // ~1.8 inch reserved for client's letterhead header
    paddingBottom: 100,    // ~1.4 inch reserved for client's letterhead footer
    paddingHorizontal: 50,
    fontSize: 9,
    fontFamily: 'NotoSans',
    color: DARK,
    lineHeight: 1.5,
  },
  // Letterhead space indicator — subtle marker showing content area start
  letterheadSpace: { height: 6, borderBottomWidth: 0.5, borderBottomColor: '#e5e5e5', marginBottom: 14 },
  footerSpace: { position: 'absolute' as const, bottom: 60, left: 50, right: 50, borderTopWidth: 0.5, borderTopColor: '#e5e5e5', paddingTop: 4 },
  footerHint: { fontSize: 6, color: '#bbb', textAlign: 'center' as const },
  pageNumber: { position: 'absolute' as const, bottom: 40, left: 50, right: 50, fontSize: 8, color: GRAY, textAlign: 'center' as const },
  // Title
  title: { fontSize: 14, fontWeight: 700, textAlign: 'center' as const, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: 1 },
  subtitle: { fontSize: 8, textAlign: 'center' as const, color: GRAY, marginBottom: 16 },
  // Meta
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  metaLabel: { fontSize: 8, color: GRAY, width: 100 },
  metaValue: { fontSize: 8.5, fontWeight: 700, flex: 1 },
  // Sections
  sectionTitle: { fontSize: 9.5, fontWeight: 700, marginTop: 16, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.3, borderBottomWidth: 0.5, borderBottomColor: BORDER, paddingBottom: 3 },
  // Addressed to
  addressBlock: { padding: 10, backgroundColor: BG_LIGHT, borderRadius: 3, borderWidth: 0.5, borderColor: BORDER, marginBottom: 14 },
  addressLabel: { fontSize: 7, color: LIGHT_GRAY, textTransform: 'uppercase' as const, marginBottom: 2 },
  addressName: { fontSize: 10, fontWeight: 700 },
  addressLine: { fontSize: 8, color: GRAY, marginTop: 1 },
  // Table
  tableHeader: { flexDirection: 'row', backgroundColor: DARK, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 2 },
  tableHeaderCell: { color: '#fff', fontSize: 7.5, fontWeight: 700 },
  tableRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: BORDER },
  tableRowAlt: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: BORDER, backgroundColor: BG_LIGHT },
  tableCell: { fontSize: 8 },
  tableCellBold: { fontSize: 8, fontWeight: 700 },
  // Summary
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 8 },
  summaryLabel: { fontSize: 9, fontWeight: 700 },
  summaryValue: { fontSize: 10, fontWeight: 700 },
  // Instruction paragraph
  para: { fontSize: 8.5, marginBottom: 8, textAlign: 'justify' as const },
  // Signature
  sigBlock: { marginTop: 50, width: '45%' },
  sigLine: { borderBottomWidth: 1, borderBottomColor: DARK, marginBottom: 4, height: 30 },
  sigLabel: { fontSize: 8, fontWeight: 700 },
  sigSub: { fontSize: 7, color: GRAY, marginTop: 2 },
});

// Service labels
const SERVICE_LABELS: Record<string, string> = {
  unarmedGuards: 'Unarmed Security Guard',
  armedGuards: 'Armed Security Guard',
  supervisors: 'Security Supervisor',
  patrolOfficers: 'Patrol Officer',
  pso: 'Personal Security Officer (PSO)',
  bouncers: 'Bouncer',
  manpower: 'Manpower',
};

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { limited } = rateLimit(`wo-pdf:${ip}`, { limit: 10, windowMs: 60_000 });
  if (limited) return NextResponse.json({ error: 'Rate limited' }, { status: 429 });

  try {
  const data = await request.json();
  const {
    workOrderId, client, clientGst, clientWoRef, quotationRef,
    contactPerson, contactPhone,
    address, city, state, pincode,
    startDate, endDate, value,
    locations = [], serviceInstances = {},
    // Per-post Work Order IDs keyed by post index — printed against each post
    // when the client issues a separate work order per post
    perPostWorkOrderIds = {},
    // `value` is the contract value over `contractMonths`; `monthlyValue` is the
    // per-month figure the rate table adds up to
    monthlyValue, contractMonths = 12,
    // Commercial term chosen on the Work Order. This is printed so the client
    // can see the same rate-conversion rule used for future invoices.
    rateBasis, basisDays,
  } = data;

  // Build service summary from instances
  let totalManpower = 0;
  let totalMonthlyValue = 0;
  const serviceRows: { type: string; shift: string; qty: number; rate: number; total: number }[] = [];

  Object.entries(serviceInstances).forEach(([key, instances]: [string, any]) => {
    if (!instances || !Array.isArray(instances)) return;
    instances.forEach((inst: any) => {
      ['day', 'afternoon', 'night'].forEach(shift => {
        const s = inst.shifts?.[shift];
        if (s?.enabled && s.quantity > 0) {
          const qty = Number(s.quantity) || 0;
          const rate = Number(s.rate) || 0;
          totalManpower += qty;
          totalMonthlyValue += qty * rate;
          serviceRows.push({
            type: SERVICE_LABELS[key] || key,
            shift: `${shift.charAt(0).toUpperCase() + shift.slice(1)} (${inst.shiftType || '8H'})`,
            qty,
            rate,
            total: qty * rate,
          });
        }
      });
    });
  });

  const contractValue = parseFloat((value || '0').replace(/[₹,\s]/g, '')) || totalMonthlyValue;
  // The rate table is monthly, so its total must stay monthly even when the
  // contract value covers the full term
  const monthlyTotal = Number(monthlyValue) || totalMonthlyValue
    || (contractMonths > 0 ? contractValue / contractMonths : contractValue);
  const showTermTotal = contractValue > 0 && Math.round(contractValue) !== Math.round(monthlyTotal);
  const fullAddress = [address, city, state, pincode].filter(Boolean).join(', ');
  const billingBasisText = rateBasis === 'calendar_month'
    ? 'Calendar month — monthly price ÷ actual days in the billed month'
    : rateBasis === 'fixed_days'
      ? `Fixed ${Number(basisDays) || 0} days per month — monthly price ÷ ${Number(basisDays) || 0}`
      : rateBasis === 'per_duty'
        ? 'Per duty — agreed price is already the per-duty rate'
        : 'Not specified';

  // Build children array, filtering out falsy values
  const pageChildren: any[] = [
    // Letterhead space indicator
    React.createElement(View, { key: 'lh', style: S.letterheadSpace }),

    // Title
    React.createElement(Text, { key: 't1', style: S.title }, 'Work Order'),
    React.createElement(Text, { key: 't2', style: S.subtitle }, 'For Provision of Private Security Services'),

    // Reference info
    React.createElement(View, { key: 'meta', style: { marginBottom: 14 } },
      React.createElement(View, { style: S.metaRow },
        React.createElement(Text, { style: S.metaLabel }, 'WO Number:'),
        React.createElement(Text, { style: S.metaValue }, workOrderId || '___________'),
      ),
      React.createElement(View, { style: S.metaRow },
        React.createElement(Text, { style: S.metaLabel }, 'Quotation Ref:'),
        React.createElement(Text, { style: S.metaValue }, quotationRef || 'N/A'),
      ),
      React.createElement(View, { style: S.metaRow },
        React.createElement(Text, { style: S.metaLabel }, 'Date:'),
        React.createElement(Text, { style: S.metaValue }, fmtDate(new Date().toISOString())),
      ),
      React.createElement(View, { style: S.metaRow },
        React.createElement(Text, { style: S.metaLabel }, 'Service Start Date:'),
        React.createElement(Text, { style: S.metaValue }, fmtDate(startDate)),
      ),
      React.createElement(View, { style: S.metaRow },
        React.createElement(Text, { style: S.metaLabel }, 'Service End Date:'),
        React.createElement(Text, { style: S.metaValue }, endDate ? fmtDate(endDate) : 'Until further notice'),
      ),
      React.createElement(View, { style: S.metaRow },
        React.createElement(Text, { style: S.metaLabel }, 'Billing Rate Basis:'),
        React.createElement(Text, { style: S.metaValue }, billingBasisText),
      ),
    ),

    // Addressed TO (service provider)
    React.createElement(View, { key: 'addr', style: S.addressBlock },
      React.createElement(Text, { style: S.addressLabel }, 'To'),
      React.createElement(Text, { style: S.addressName }, PROVIDER_NAME),
      React.createElement(Text, { style: S.addressLine }, PROVIDER_ADDRESS),
      React.createElement(Text, { style: S.addressLine }, `GSTIN: ${PROVIDER_GSTIN}`),
    ),

    // Subject line
    React.createElement(Text, { key: 'subj', style: { fontSize: 9, fontWeight: 700, marginBottom: 8 } },
      `Subject: Deployment of Private Security Personnel`
    ),

    // Instruction paragraph
    React.createElement(Text, { key: 'instr', style: S.para },
      `Dear Sir/Madam,`
    ),
    React.createElement(Text, { key: 'instr2', style: S.para },
      `With reference to the above, we, ${client || 'the undersigned'}, hereby authorize and place this Work Order upon you, ${PROVIDER_NAME}, for the provision and deployment of trained private security personnel at our premises detailed hereunder. This Work Order is issued in accordance with the terms mutually agreed between us and shall take effect from ${fmtDate(startDate)}${endDate ? ` and remain valid up to ${fmtDate(endDate)}` : ' and shall remain in force until further written notice'}.`
    ),

    // Combined Deployment & Manpower table
    React.createElement(Text, { key: 'sec-dep', style: S.sectionTitle }, 'Deployment & Manpower Details'),
    React.createElement(View, { key: 'dep-hdr', style: S.tableHeader },
      React.createElement(Text, { style: { ...S.tableHeaderCell, width: '5%' } }, '#'),
      React.createElement(Text, { style: { ...S.tableHeaderCell, width: '27%' } }, 'Category'),
      React.createElement(Text, { style: { ...S.tableHeaderCell, width: '20%' } }, 'Shift / Timing'),
      React.createElement(Text, { style: { ...S.tableHeaderCell, width: '10%', textAlign: 'center' as const } }, 'Nos.'),
      React.createElement(Text, { style: { ...S.tableHeaderCell, width: '18%', textAlign: 'right' as const } }, 'Rate/Month'),
      React.createElement(Text, { style: { ...S.tableHeaderCell, width: '20%', textAlign: 'right' as const } }, 'Amount'),
    ),
  ];

  // For each location, add a grouping row then its service line items
  locations.forEach((loc: any, li: number) => {
    const locAddr = [loc.address, loc.city || loc.district, loc.state, loc.pincode].filter(Boolean).join(', ');
    // Location grouping row (full width)
    pageChildren.push(
      React.createElement(View, { key: `loc-grp-${li}`, style: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, backgroundColor: '#ececec', borderBottomWidth: 0.5, borderBottomColor: BORDER } },
        React.createElement(Text, { style: { fontSize: 8, fontWeight: 700, width: '55%' } }, `Post ${li + 1}: ${loc.name || 'Unnamed Post'}`),
        React.createElement(Text, { style: { fontSize: 7.5, color: GRAY, width: '45%', textAlign: 'right' as const } },
          `${perPostWorkOrderIds?.[String(li)] ? `WO: ${perPostWorkOrderIds[String(li)]}   ` : ''}Guards: ${loc.guards || 0}`),
      ),
      React.createElement(View, { key: `loc-addr-${li}`, style: { paddingVertical: 3, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: BORDER } },
        React.createElement(Text, { style: { fontSize: 7.5, color: GRAY } }, `Address: ${locAddr || 'N/A'}`),
      ),
    );
  });

  // Service line items (apply to the deployment above)
  if (serviceRows.length > 0) {
    serviceRows.forEach((svc, i) => {
      pageChildren.push(
        React.createElement(View, { key: `svc-${i}`, style: i % 2 === 1 ? S.tableRowAlt : S.tableRow },
          React.createElement(Text, { style: { ...S.tableCell, width: '5%' } }, `${i + 1}`),
          React.createElement(Text, { style: { ...S.tableCell, width: '27%' } }, svc.type),
          React.createElement(Text, { style: { ...S.tableCell, width: '20%' } }, svc.shift),
          React.createElement(Text, { style: { ...S.tableCellBold, width: '10%', textAlign: 'center' as const } }, `${svc.qty}`),
          React.createElement(Text, { style: { ...S.tableCell, width: '18%', textAlign: 'right' as const } }, fmtCur(svc.rate)),
          React.createElement(Text, { style: { ...S.tableCellBold, width: '20%', textAlign: 'right' as const } }, fmtCur(svc.total)),
        )
      );
    });
  }

  // Total row — monthly, matching the Rate/Month column above
  pageChildren.push(
    React.createElement(View, { key: 'total-sum', style: { ...S.summaryRow, borderTopWidth: 1, borderTopColor: DARK, marginTop: 2 } },
      React.createElement(Text, { style: S.summaryLabel }, `Total Posts: ${locations.length}  |  Total Manpower: ${locations.reduce((s: number, l: any) => s + (Number(l.guards) || 0), 0)}`),
      React.createElement(Text, { style: { ...S.summaryValue, fontSize: 11 } }, `${fmtCur(monthlyTotal)} / month`),
    ),
  );

  // Contract value over the full term
  if (showTermTotal) {
    pageChildren.push(
      React.createElement(View, { key: 'term-sum', style: { ...S.summaryRow } },
        React.createElement(Text, { style: S.summaryLabel }, `Contract Value (${contractMonths} months)`),
        React.createElement(Text, { style: { ...S.summaryValue, fontSize: 11 } }, fmtCur(contractValue)),
      ),
    );
  }

  // Amount in words
  pageChildren.push(
    React.createElement(View, { key: 'amt-words', style: { marginTop: 8, padding: 8, backgroundColor: BG_LIGHT, borderRadius: 3, borderWidth: 0.5, borderColor: BORDER } },
      React.createElement(Text, { style: { fontSize: 8 } },
        React.createElement(Text, { style: { color: GRAY } }, 'Amount in Words: '),
        React.createElement(Text, { style: { fontWeight: 700 } },
          showTermTotal
            ? `Rupees ${numberToWordsIndian(monthlyTotal)} Only per month, aggregating to Rupees ${numberToWordsIndian(contractValue)} Only over ${contractMonths} months, exclusive of applicable taxes.`
            : `Rupees ${numberToWordsIndian(monthlyTotal)} Only (per month, exclusive of applicable taxes).`),
      ),
    ),
    // Legal declaration
    React.createElement(Text, { key: 'legal-note', style: { fontSize: 7.5, color: GRAY, marginTop: 10, lineHeight: 1.5, textAlign: 'justify' as const } },
      `We understand that you are a licensed Private Security Agency holding a valid licence under the Private Security Agencies (Regulation) Act, 2005 (PSARA), and shall deploy trained security personnel accordingly. This Work Order, once duly signed and stamped by our authorized signatory, shall serve as our binding instruction to you for commencement of services.`
    ),
  );

  // Terms of Payment & Conditions (client's first-person perspective)
  const terms = [
    `We note that the rates mentioned above are exclusive of Goods & Services Tax (GST). We shall pay the applicable GST over and above the invoice amount at the prevailing statutory rate.`,
    `Upon receipt of your monthly invoice along with the duty/attendance record, we shall release payment within 15 (fifteen) days. We acknowledge that you are a registered Micro/Small Enterprise under the Micro, Small and Medium Enterprises Development (MSMED) Act, 2006, and that any delay in payment beyond the due date shall attract compound interest with monthly rests at three times the bank rate notified by the Reserve Bank of India, as prescribed under Section 16 of the MSMED Act, 2006.`,
    `We understand that all statutory contributions and compliances in respect of the deployed personnel \u2014 including EPF, ESIC, Bonus, Gratuity and Minimum Wages \u2014 shall be discharged by you only to the extent that we bill for and duly pay the corresponding statutory components as part of the invoice amount. We acknowledge that you shall not be held liable for any statutory shortfall arising out of our non-payment or short-payment of such components.`,
    `We agree that any additional manpower, overtime, or services required by us beyond the scope of this Work Order shall be billed separately at mutually agreed rates.`,
    `We shall reimburse any statutory revision in minimum wages, statutory contributions, or applicable taxes notified by the Government during the currency of this Work Order.`,
    `We shall deduct TDS, if applicable, as per prevailing Income Tax provisions and furnish the certificate thereof to you.`,
    `We shall, at the deployment site, provide your deployed security personnel with reasonable access to basic welfare facilities including shelter/shade, safe drinking water, toilet facilities, a seating chair at the post, and access to emergency medication and first-aid as and when required.`,
    `We agree that all disputes arising out of this Work Order shall be subject to the jurisdiction of the courts at Cuttack, Odisha.`,
  ];

  pageChildren.push(
    React.createElement(Text, { key: 'sec-terms', style: { ...S.sectionTitle, marginTop: 16 } }, 'Terms of Payment & Conditions'),
    ...terms.map((term, i) =>
      React.createElement(View, { key: `term-${i}`, style: { flexDirection: 'row', marginBottom: 4 } },
        React.createElement(Text, { style: { width: 16, fontSize: 8, fontWeight: 700 } }, `${i + 1}.`),
        React.createElement(Text, { style: { flex: 1, fontSize: 8, textAlign: 'justify' as const, lineHeight: 1.4 } }, term),
      )
    ),
  );

  // Issued By + Signature
  pageChildren.push(
    React.createElement(Text, { key: 'sec-iss', style: { ...S.sectionTitle, marginTop: 18 } }, 'Issued By (Client / First Party)'),
    React.createElement(View, { key: 'issued', style: { flexDirection: 'row', gap: 30 } },
      React.createElement(View, { style: { flex: 1 } },
        React.createElement(Text, { style: { fontSize: 8, color: GRAY } }, 'Company:'),
        React.createElement(Text, { style: { fontSize: 9, fontWeight: 700 } }, client || '___________'),
        React.createElement(Text, { style: { fontSize: 7.5, color: GRAY } }, clientGst ? `GSTIN: ${clientGst}` : ''),
        React.createElement(Text, { style: { fontSize: 7.5, color: GRAY } }, fullAddress || '___________'),
      ),
      React.createElement(View, { style: { flex: 1 } },
        React.createElement(Text, { style: { fontSize: 8, color: GRAY } }, contactPerson ? `Contact Person: ${contactPerson}` : ''),
        React.createElement(Text, { style: { fontSize: 8, color: GRAY } }, contactPhone ? `Phone: ${contactPhone}` : ''),
      ),
    ),

    // Place & Date + Signature row
    React.createElement(View, { key: 'sig-row', style: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 40 } },
      React.createElement(View, { style: { width: '45%' } },
        React.createElement(Text, { style: { fontSize: 8, marginBottom: 24 } }, 'Place: _______________________'),
        React.createElement(Text, { style: { fontSize: 8 } }, `Date: ${fmtDate(new Date().toISOString())}`),
      ),
      React.createElement(View, { style: { width: '45%' } },
        React.createElement(View, { style: S.sigLine }),
        React.createElement(Text, { style: S.sigLabel }, `For ${client || '____________________'}`),
        React.createElement(Text, { style: S.sigSub }, 'Authorised Signatory'),
        React.createElement(Text, { style: S.sigSub }, '(Name, Designation, Signature & Seal)'),
      ),
    ),

    React.createElement(View, { key: 'footer', style: S.footerSpace },
      React.createElement(Text, { style: S.footerHint }, ''),
    ),
  );

  // Page number (fixed, renders on every page)
  const pageNumberEl = React.createElement(Text, {
    key: 'pgnum',
    style: S.pageNumber,
    fixed: true,
    render: ({ pageNumber, totalPages }: any) => `Page ${pageNumber} / ${totalPages}`,
  } as any);

  const WODoc = React.createElement(Document, {},
    React.createElement(Page, { size: 'A4', style: S.page }, ...pageChildren, pageNumberEl),
  );

    const blob = await pdf(WODoc).toBlob();
    const buffer = Buffer.from(await blob.arrayBuffer());
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${workOrderId || 'WorkOrder'}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error('[workorder-pdf]', err);
    return NextResponse.json({ error: err?.message || 'PDF generation failed' }, { status: 500 });
  }
}
