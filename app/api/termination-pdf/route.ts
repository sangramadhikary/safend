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
const PROVIDER_PHONE = '+91-XXXXXXXXXX';

const BRAND = '#D71920';
const DARK = '#1a1a1a';
const GRAY = '#555555';
const LIGHT_GRAY = '#888888';
const BORDER = '#d0d0d0';

function fmtDate(d: string | null | undefined): string {
  if (!d) return '___________';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return String(d); }
}

const S = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 60,
    paddingHorizontal: 50,
    fontSize: 10,
    fontFamily: 'NotoSans',
    color: DARK,
    lineHeight: 1.6,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 44, height: 28, marginRight: 8 },
  companyName: { fontSize: 12, fontWeight: 700, color: BRAND },
  companySub: { fontSize: 7, color: GRAY, marginTop: 1 },
  divider: { height: 1.5, backgroundColor: BRAND, marginVertical: 8 },
  // Letter metadata
  refRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  refText: { fontSize: 9, color: GRAY },
  // Subject
  subject: { fontSize: 11, fontWeight: 700, marginBottom: 16, textAlign: 'center' as const, textDecoration: 'underline' as const },
  // To address
  toBlock: { marginBottom: 16 },
  toLabel: { fontSize: 8, color: LIGHT_GRAY, marginBottom: 2 },
  toName: { fontSize: 10, fontWeight: 700 },
  toLine: { fontSize: 9, color: GRAY, marginTop: 1 },
  // Body
  para: { fontSize: 10, marginBottom: 10, textAlign: 'justify' as const, lineHeight: 1.65 },
  bold: { fontWeight: 700 },
  // Bullet list
  bulletItem: { flexDirection: 'row', marginBottom: 4, paddingLeft: 10 },
  bulletDot: { width: 12, fontSize: 10 },
  bulletText: { flex: 1, fontSize: 9.5 },
  // Sign block
  signBlock: { marginTop: 40 },
  signLabel: { fontSize: 9, fontWeight: 700, marginTop: 4 },
  signSub: { fontSize: 8.5, color: GRAY },
  signLine: { borderBottomWidth: 1, borderBottomColor: DARK, width: 160, height: 30, marginTop: 16 },
  // Footer
  footer: { position: 'absolute' as const, bottom: 30, left: 50, right: 50, borderTopWidth: 0.5, borderTopColor: '#eee', paddingTop: 4 },
  footerText: { fontSize: 7, color: LIGHT_GRAY, textAlign: 'center' as const },
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { limited } = rateLimit(`term-pdf:${ip}`, { limit: 10, windowMs: 60_000 });
  if (limited) return NextResponse.json({ error: 'Rate limited' }, { status: 429 });

  try {
    const data = await request.json();
    const {
      clientName, contactPerson, address, city, state, pincode,
      workOrderId, startDate, lastWorkingDay, reason, value,
    } = data;

    const fullAddress = [address, city, state, pincode].filter(Boolean).join(', ');
    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    const refNo = `SSPL/TERM/${new Date().getFullYear()}/${workOrderId || 'XX'}`;

    // Build PDF document
    const pageChildren: any[] = [
      // Letterhead Header
      React.createElement(View, { key: 'hdr', style: S.headerRow },
        React.createElement(View, { style: S.logoRow },
          LOGO_SRC ? React.createElement(Image, { src: LOGO_SRC, style: S.logo }) : null,
          React.createElement(View, {},
            React.createElement(Text, { style: S.companyName }, PROVIDER_NAME),
            React.createElement(Text, { style: S.companySub }, PROVIDER_ADDRESS),
            React.createElement(Text, { style: S.companySub }, `GSTIN: ${PROVIDER_GSTIN}`),
          ),
        ),
      ),
      React.createElement(View, { key: 'div', style: S.divider }),

      // Reference & Date
      React.createElement(View, { key: 'ref', style: S.refRow },
        React.createElement(Text, { style: S.refText }, `Ref: ${refNo}`),
        React.createElement(Text, { style: S.refText }, `Date: ${today}`),
      ),

      // To Address
      React.createElement(View, { key: 'to', style: S.toBlock },
        React.createElement(Text, { style: S.toLabel }, 'To,'),
        React.createElement(Text, { style: S.toName }, contactPerson || clientName || '____________________'),
        React.createElement(Text, { style: S.toLine }, clientName),
        fullAddress ? React.createElement(Text, { style: S.toLine }, fullAddress) : null,
      ),

      // Subject
      React.createElement(Text, { key: 'sub', style: S.subject },
        `Subject: Notice of Termination of Security Services — Work Order ${workOrderId || ''}`
      ),

      // Salutation
      React.createElement(Text, { key: 'sal', style: S.para },
        `Dear ${contactPerson || 'Sir/Madam'},`
      ),

      // Body Paragraph 1
      React.createElement(Text, { key: 'p1', style: S.para },
        React.createElement(Text, {}, 'We refer to the Service Agreement and Work Order '),
        React.createElement(Text, { style: S.bold }, `(${workOrderId || 'Ref. No.'}) `),
        React.createElement(Text, {}, `dated ${fmtDate(startDate as string)}, executed between `),
        React.createElement(Text, { style: S.bold }, `${clientName || 'your organization'} `),
        React.createElement(Text, {}, `and `),
        React.createElement(Text, { style: S.bold }, `${PROVIDER_NAME} `),
        React.createElement(Text, {}, 'for the provision of private security services at your premises.'),
      ),

      // Body Paragraph 2 - Notice
      React.createElement(Text, { key: 'p2', style: S.para },
        React.createElement(Text, {}, 'In accordance with the termination clause of the said agreement, we hereby give formal notice that the security services shall stand '),
        React.createElement(Text, { style: S.bold }, 'terminated '),
        React.createElement(Text, {}, 'with effect from '),
        React.createElement(Text, { style: S.bold }, `${fmtDate(lastWorkingDay)} `),
        React.createElement(Text, {}, '(Last Working Day).'),
      ),

      // Body Paragraph 3 - Reason
      React.createElement(Text, { key: 'p3', style: S.para },
        React.createElement(Text, { style: S.bold }, 'Reason for Termination: '),
        React.createElement(Text, {}, reason || '___________'),
      ),

      // Body Paragraph 4 - Consequences
      React.createElement(Text, { key: 'p4', style: S.para },
        'Upon the effective date of termination, the following actions shall be taken:'
      ),

      // Bullet points
      React.createElement(View, { key: 'b1', style: S.bulletItem },
        React.createElement(Text, { style: S.bulletDot }, '•'),
        React.createElement(Text, { style: S.bulletText }, 'All deployed security personnel shall be withdrawn from your premises on or before the last working day.'),
      ),
      React.createElement(View, { key: 'b2', style: S.bulletItem },
        React.createElement(Text, { style: S.bulletDot }, '•'),
        React.createElement(Text, { style: S.bulletText }, 'Duty rosters and operational activities pertaining to your site shall be discontinued.'),
      ),
      React.createElement(View, { key: 'b3', style: S.bulletItem },
        React.createElement(Text, { style: S.bulletDot }, '•'),
        React.createElement(Text, { style: S.bulletText }, 'Final invoice for services rendered up to the last working day shall be raised and submitted for settlement.'),
      ),
      React.createElement(View, { key: 'b4', style: S.bulletItem },
        React.createElement(Text, { style: S.bulletDot }, '•'),
        React.createElement(Text, { style: S.bulletText }, 'Any security deposit or pending dues, if applicable, shall be settled as per the terms of the agreement.'),
      ),

      // Body Paragraph 5 - Request
      React.createElement(Text, { key: 'p5', style: { ...S.para, marginTop: 10 } },
        'We request you to kindly acknowledge receipt of this letter and confirm your acceptance of the above termination date. In case of any queries or if you wish to discuss an extension or alternative arrangement, please do not hesitate to contact us.'
      ),

      // Body Paragraph 6 - Thanks
      React.createElement(Text, { key: 'p6', style: S.para },
        'We sincerely thank you for the opportunity to serve your organization and look forward to a continued professional relationship in the future.'
      ),

      // Sign block
      React.createElement(View, { key: 'sign', style: S.signBlock },
        React.createElement(Text, { style: { fontSize: 9.5 } }, 'Yours faithfully,'),
        React.createElement(View, { style: S.signLine }),
        React.createElement(Text, { style: S.signLabel }, `For ${PROVIDER_NAME}`),
        React.createElement(Text, { style: S.signSub }, '(Authorised Signatory)'),
      ),

      // Footer
      React.createElement(View, { key: 'ft', style: S.footer },
        React.createElement(Text, { style: S.footerText },
          `${PROVIDER_NAME} | ${PROVIDER_ADDRESS} | GSTIN: ${PROVIDER_GSTIN}`
        ),
      ),
    ];

    const TerminationDoc = React.createElement(Document, {},
      React.createElement(Page, { size: 'A4', style: S.page }, ...pageChildren),
    );

    const blob = await pdf(TerminationDoc).toBlob();
    const buffer = Buffer.from(await blob.arrayBuffer());

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Termination_Letter_${(clientName || 'Client').replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error('[termination-pdf]', err);
    return NextResponse.json({ error: err?.message || 'PDF generation failed' }, { status: 500 });
  }
}
