import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import path from 'path';
import fs from 'fs';
import { Document, Page, Text, View, Image, StyleSheet, Font, pdf } from '@react-pdf/renderer';
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

const logoPath = path.join(process.cwd(), 'public', 'logo.png');
const LOGO_SRC = fs.existsSync(logoPath)
  ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`
  : null;

// Provider (Safend)
const PROVIDER_NAME = 'Safend Secure Solutions Pvt. Ltd.';
const PROVIDER_ADDRESS = 'Plot No. 548, Urali Gopalpur, Cuttack Sadar, Odisha - 753011';
const PROVIDER_GSTIN = '21ABDC8727K1Z4';

const BRAND = '#D71920';
const DARK = '#1a1a1a';
const GRAY = '#555555';
const LIGHT_GRAY = '#888888';
const BORDER = '#d0d0d0';
const BG_LIGHT = '#f5f5f5';

function fmtDate(d: string | null | undefined): string {
  if (!d) return '___________';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return String(d); }
}
const fmtCur = (v: number) => `\u20B9 ${v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function numberToWordsIndian(num: number): string {
  if (!num || num === 0) return 'Zero';
  num = Math.floor(num);
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const twoDigits = (n: number): string => n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  const threeDigits = (n: number): string => {
    const h = Math.floor(n / 100); const rest = n % 100;
    return (h ? ones[h] + ' Hundred' + (rest ? ' ' : '') : '') + (rest ? twoDigits(rest) : '');
  };
  let result = '';
  const crore = Math.floor(num / 10000000); num %= 10000000;
  const lakh = Math.floor(num / 100000); num %= 100000;
  const thousand = Math.floor(num / 1000); num %= 1000;
  if (crore) result += threeDigits(crore) + ' Crore ';
  if (lakh) result += twoDigits(lakh) + ' Lakh ';
  if (thousand) result += twoDigits(thousand) + ' Thousand ';
  if (num) result += threeDigits(num);
  return result.trim();
}

const S = StyleSheet.create({
  // Indian Legal paper size (LEGAL = 8.5 x 14 inch)
  page: { paddingTop: 44, paddingBottom: 60, paddingHorizontal: 50, fontSize: 9.5, fontFamily: 'NotoSans', color: DARK, lineHeight: 1.55 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 44, height: 28, marginRight: 8 },
  companyName: { fontSize: 12, fontWeight: 700, color: BRAND },
  companySub: { fontSize: 7, color: GRAY, marginTop: 1 },
  divider: { height: 1.5, backgroundColor: BRAND, marginVertical: 8 },
  title: { fontSize: 15, fontWeight: 700, textAlign: 'center' as const, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 2 },
  titleSub: { fontSize: 8, textAlign: 'center' as const, color: GRAY, marginBottom: 12 },
  para: { fontSize: 9.5, marginBottom: 8, textAlign: 'justify' as const, lineHeight: 1.6 },
  bold: { fontWeight: 700 },
  partyBlock: { padding: 8, backgroundColor: BG_LIGHT, borderRadius: 3, borderWidth: 0.5, borderColor: BORDER, marginBottom: 8 },
  sectionTitle: { fontSize: 10, fontWeight: 700, color: BRAND, marginTop: 12, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: 0.3 },
  clauseItem: { flexDirection: 'row', marginBottom: 6 },
  clauseNum: { width: 22, fontSize: 9, fontWeight: 700 },
  clauseText: { flex: 1, fontSize: 9, textAlign: 'justify' as const, lineHeight: 1.55 },
  clauseHeading: { fontSize: 9, fontWeight: 700 },
  sigRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 44 },
  sigBlock: { width: '45%' },
  sigLine: { borderBottomWidth: 1, borderBottomColor: DARK, marginBottom: 4, height: 34 },
  sigLabel: { fontSize: 8.5, fontWeight: 700 },
  sigSub: { fontSize: 7.5, color: GRAY, marginTop: 1 },
  pageNumber: { position: 'absolute' as const, bottom: 26, left: 50, right: 50, fontSize: 7.5, color: GRAY, textAlign: 'center' as const },
  footerNote: { position: 'absolute' as const, bottom: 40, left: 50, right: 50, fontSize: 6.5, color: LIGHT_GRAY, textAlign: 'center' as const, borderTopWidth: 0.5, borderTopColor: '#eee', paddingTop: 3 },
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { limited } = rateLimit(`agr-pdf:${ip}`, { limit: 10, windowMs: 60_000 });
  if (limited) return NextResponse.json({ error: 'Rate limited' }, { status: 429 });

  try {
    const data = await request.json();
    const {
      client, clientGst, address, city, state, pincode,
      contactPerson, contactPhone, contactEmail, workOrderId, value,
      agreementDate, contractDurationMonths, paymentCreditDays,
      securityDeposit, noticePeriodDays, rateEscalation, jurisdiction,
      clientSignatoryName, clientSignatoryDesignation, specialTerms,
    } = data;

    const contractValue = parseFloat((value || '0').replace(/[₹,\s]/g, '')) || 0;
    const fullAddress = [address, city, state, pincode].filter(Boolean).join(', ');
    const duration = contractDurationMonths || '12';
    const credit = paymentCreditDays || '15';
    const notice = noticePeriodDays || '30';
    const jur = jurisdiction || 'Cuttack, Odisha';

    // Legal clauses
    const clauses: { heading: string; text: string }[] = [
      { heading: 'Scope of Services', text: `The Service Provider agrees to deploy trained private security personnel at the premises of the Client as detailed in the associated Work Order${workOrderId ? ` (Ref. ${workOrderId})` : ''}. The nature, number, and shift pattern of personnel shall be as mutually agreed and may be revised by written consent of both Parties.` },
      { heading: 'Term & Commencement', text: `This Agreement shall come into force on ${fmtDate(agreementDate)} and shall remain valid for a period of ${duration} (${numberToWordsIndian(parseInt(duration, 10) || 12)}) months, unless terminated earlier in accordance with the provisions herein. The Agreement may be renewed upon mutual written consent of both Parties.` },
      { heading: 'Consideration & Payment', text: `In consideration of the services, the Client shall pay the Service Provider the agreed monthly charges of ${fmtCur(contractValue)} (Rupees ${numberToWordsIndian(contractValue)} Only), exclusive of applicable Goods & Services Tax (GST). The Client shall pay GST over and above the invoice amount. Payment shall be released within ${credit} (${numberToWordsIndian(parseInt(credit, 10) || 15)}) days from the date of receipt of the invoice along with the duty/attendance record.` },
      { heading: 'MSME & Delayed Payment', text: `The Service Provider is a registered Micro/Small Enterprise under the Micro, Small and Medium Enterprises Development (MSMED) Act, 2006. Any delay in payment beyond the due date shall attract compound interest with monthly rests at three times the bank rate notified by the Reserve Bank of India, as prescribed under Section 16 of the said Act.` },
      { heading: 'Statutory Compliance', text: `The Service Provider shall be responsible for compliance with all applicable labour and statutory laws in respect of its deployed personnel, including EPF, ESIC, Bonus, Gratuity and Minimum Wages, strictly to the extent that the corresponding statutory components are billed for and duly paid by the Client as part of the invoice amount. The Service Provider holds a valid licence under the Private Security Agencies (Regulation) Act, 2005 (PSARA).` },
      { heading: 'Rate Revision', text: `The charges shall be subject to revision as follows: ${rateEscalation || 'As per annual revision in Government-notified minimum wages'}. The Client shall reimburse any statutory revision in minimum wages, statutory contributions, or applicable taxes notified by the Government during the currency of this Agreement.` },
      { heading: 'Client Obligations', text: `The Client shall provide the deployed security personnel with reasonable access to basic welfare facilities at the deployment site, including shelter/shade, safe drinking water, toilet facilities, seating arrangement at the post, and access to emergency medication and first-aid as and when required.` },
      { heading: 'Security Deposit', text: securityDeposit && parseFloat(String(securityDeposit).replace(/[₹,\s]/g, '')) > 0 ? `The Client shall furnish an interest-free refundable security deposit of ${fmtCur(parseFloat(String(securityDeposit).replace(/[₹,\s]/g, '')))}, refundable upon satisfactory completion or termination of this Agreement after adjustment of outstanding dues, if any.` : `No security deposit shall be payable under this Agreement unless otherwise mutually agreed in writing.` },
      { heading: 'Liability & Indemnity', text: `The Service Provider shall exercise due diligence in the selection and supervision of deployed personnel. Liability arising from proven negligence or misconduct of deployed personnel shall be limited to the extent established after due investigation. Neither Party shall be liable for any indirect or consequential losses.` },
      { heading: 'Confidentiality', text: `Both Parties shall maintain strict confidentiality regarding all information exchanged during the course of this Agreement and shall not disclose the same to any third party without prior written consent, except as required by law.` },
      { heading: 'Termination', text: `Either Party may terminate this Agreement by giving ${notice} (${numberToWordsIndian(parseInt(notice, 10) || 30)}) days prior written notice. Upon termination, all outstanding dues up to the effective date of termination shall be settled in full by the Client.` },
      { heading: 'Force Majeure', text: `Neither Party shall be held liable for failure to perform its obligations due to causes beyond its reasonable control, including acts of God, war, riots, pandemics, or governmental restrictions.` },
      { heading: 'Dispute Resolution & Jurisdiction', text: `Any dispute arising out of or in connection with this Agreement shall first be attempted to be resolved amicably. Failing which, the same shall be subject to arbitration under the Arbitration and Conciliation Act, 1996, and to the exclusive jurisdiction of the courts at ${jur}.` },
    ];

    if (specialTerms && specialTerms.trim()) {
      clauses.push({ heading: 'Special Terms', text: specialTerms.trim() });
    }

    // ── Page 1 children ──
    const page1: any[] = [
      React.createElement(View, { key: 'hdr', style: S.headerRow },
        React.createElement(View, { style: S.logoRow },
          LOGO_SRC ? React.createElement(Image, { src: LOGO_SRC, style: S.logo }) : null,
          React.createElement(View, {},
            React.createElement(Text, { style: S.companyName }, PROVIDER_NAME),
            React.createElement(Text, { style: S.companySub }, PROVIDER_ADDRESS),
          ),
        ),
      ),
      React.createElement(View, { key: 'div', style: S.divider }),
      React.createElement(Text, { key: 'title', style: S.title }, 'Service Agreement'),
      React.createElement(Text, { key: 'titlesub', style: S.titleSub }, 'For Provision of Private Security Services'),

      React.createElement(Text, { key: 'preamble', style: S.para },
        React.createElement(Text, {}, `This Service Agreement ("Agreement") is made and executed on this ${fmtDate(agreementDate)}, by and between:`),
      ),

      // Party 1 — Client
      React.createElement(View, { key: 'p1', style: S.partyBlock },
        React.createElement(Text, { style: { fontSize: 9.5, fontWeight: 700 } }, `${client || '____________________'}`),
        React.createElement(Text, { style: { fontSize: 8.5, color: GRAY } }, fullAddress || '____________________'),
        clientGst ? React.createElement(Text, { style: { fontSize: 8, color: GRAY } }, `GSTIN: ${clientGst}`) : null,
        React.createElement(Text, { style: { fontSize: 8.5, marginTop: 2 } }, 'hereinafter referred to as the "Client" / "First Party" (which expression shall, unless repugnant to the context, include its successors and permitted assigns) of the ONE PART;'),
      ),

      React.createElement(Text, { key: 'and', style: { fontSize: 9.5, fontWeight: 700, textAlign: 'center' as const, marginVertical: 4 } }, 'AND'),

      // Party 2 — Provider
      React.createElement(View, { key: 'p2', style: S.partyBlock },
        React.createElement(Text, { style: { fontSize: 9.5, fontWeight: 700 } }, PROVIDER_NAME),
        React.createElement(Text, { style: { fontSize: 8.5, color: GRAY } }, PROVIDER_ADDRESS),
        React.createElement(Text, { style: { fontSize: 8, color: GRAY } }, `GSTIN: ${PROVIDER_GSTIN}`),
        React.createElement(Text, { style: { fontSize: 8.5, marginTop: 2 } }, 'a licensed private security agency, hereinafter referred to as the "Service Provider" / "Second Party" (which expression shall, unless repugnant to the context, include its successors and permitted assigns) of the OTHER PART.'),
      ),

      React.createElement(Text, { key: 'whereas', style: { ...S.para, marginTop: 8 } },
        `WHEREAS the Client desires to engage private security services for its premises, and the Service Provider has agreed to provide such services on the terms and conditions hereinafter appearing; NOW THEREFORE, in consideration of the mutual covenants set forth herein, both Parties agree as follows:`
      ),
    ];

    // Add first few clauses on page 1
    const half = Math.ceil(clauses.length / 2);
    clauses.slice(0, half).forEach((c, i) => {
      page1.push(
        React.createElement(View, { key: `c1-${i}`, style: S.clauseItem },
          React.createElement(Text, { style: S.clauseNum }, `${i + 1}.`),
          React.createElement(Text, { style: S.clauseText },
            React.createElement(Text, { style: S.clauseHeading }, `${c.heading}. `),
            React.createElement(Text, {}, c.text),
          ),
        )
      );
    });

    // ── Page 2 children ──
    const page2: any[] = [];
    clauses.slice(half).forEach((c, i) => {
      page2.push(
        React.createElement(View, { key: `c2-${i}`, style: S.clauseItem },
          React.createElement(Text, { style: S.clauseNum }, `${half + i + 1}.`),
          React.createElement(Text, { style: S.clauseText },
            React.createElement(Text, { style: S.clauseHeading }, `${c.heading}. `),
            React.createElement(Text, {}, c.text),
          ),
        )
      );
    });

    // Execution / signature block
    page2.push(
      React.createElement(Text, { key: 'exec', style: { ...S.para, marginTop: 12 } },
        `IN WITNESS WHEREOF, the Parties hereto have set their hands and seals on the day, month and year first above written.`
      ),
      React.createElement(View, { key: 'sigrow', style: S.sigRow },
        React.createElement(View, { style: S.sigBlock },
          React.createElement(View, { style: S.sigLine }),
          React.createElement(Text, { style: S.sigLabel }, `For ${client || 'the Client'}`),
          React.createElement(Text, { style: S.sigSub }, clientSignatoryName || '(Authorised Signatory)'),
          clientSignatoryDesignation ? React.createElement(Text, { style: S.sigSub }, clientSignatoryDesignation) : null,
          React.createElement(Text, { style: { ...S.sigSub, marginTop: 6 } }, 'Signature, Name & Seal'),
        ),
        React.createElement(View, { style: S.sigBlock },
          React.createElement(View, { style: S.sigLine }),
          React.createElement(Text, { style: S.sigLabel }, `For ${PROVIDER_NAME}`),
          React.createElement(Text, { style: S.sigSub }, '(Authorised Signatory)'),
          React.createElement(Text, { style: { ...S.sigSub, marginTop: 6 } }, 'Signature, Name & Seal'),
        ),
      ),
      React.createElement(View, { key: 'witness', style: { marginTop: 24 } },
        React.createElement(Text, { style: { fontSize: 8.5, fontWeight: 700, marginBottom: 8 } }, 'Witnesses:'),
        React.createElement(View, { style: { flexDirection: 'row', justifyContent: 'space-between' } },
          React.createElement(Text, { style: { fontSize: 8, color: GRAY } }, '1. _______________________'),
          React.createElement(Text, { style: { fontSize: 8, color: GRAY } }, '2. _______________________'),
        ),
      ),
    );

    const pageNumberEl = (key: string) => React.createElement(Text, {
      key, style: S.pageNumber, fixed: true,
      render: ({ pageNumber, totalPages }: any) => `Page ${pageNumber} of ${totalPages}`,
    } as any);

    const contactLine = [contactPerson, contactPhone, contactEmail].filter(Boolean).join(' | ');
    const footerEl = (key: string) => React.createElement(Text, { key, style: S.footerNote, fixed: true },
      `Service Agreement between ${client || 'Client'} and ${PROVIDER_NAME}${contactLine ? ' | ' + contactLine : ''}`
    );

    const AgreementDoc = React.createElement(Document, {},
      React.createElement(Page, { size: 'LEGAL', style: S.page }, ...page1, footerEl('f1'), pageNumberEl('p1')),
      React.createElement(Page, { size: 'LEGAL', style: S.page }, ...page2, footerEl('f2'), pageNumberEl('p2')),
    );

    const blob = await pdf(AgreementDoc).toBlob();
    const buffer = Buffer.from(await blob.arrayBuffer());

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Agreement_${(client || 'Draft').replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error('[agreement-pdf]', err);
    return NextResponse.json({ error: err?.message || 'PDF generation failed' }, { status: 500 });
  }
}
