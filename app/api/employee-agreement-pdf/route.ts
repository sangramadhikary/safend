import { NextRequest, NextResponse } from 'next/server';
import React from 'react';
import path from 'path';
import fs from 'fs';
import { Document, Page, Text, View, Image, StyleSheet, Font, pdf } from '@react-pdf/renderer';
import { rateLimit, getClientIp } from '@/lib/rateLimit';

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

const CO = {
  name: 'Safend Secure Solutions Pvt. Ltd.',
  address: 'Plot No. 548, Urali Gopalpur, Cuttack Sadar, Odisha - 753011',
  cin: 'U74999OR2024PTC048065',
  gstin: '21ABDC8727K1Z4',
  psara: 'Licensed under PSARA, Govt. of Odisha',
  phone: '+91 70083 68628',
  email: 'hr@safend.in',
  jurisdiction: 'Cuttack, Odisha',
};

const BRAND = '#D71920';
const DARK = '#1a1a1a';
const GRAY = '#555';
const LIGHT = '#777';

function fmtDate(d: string | null | undefined): string {
  if (!d) return '____________________';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return String(d); }
}
function fmtSalary(s: number | string | undefined): string {
  if (!s) return '____________________';
  const n = typeof s === 'string' ? parseFloat(s) : s;
  if (!n || isNaN(n)) return '____________________';
  return `₹ ${n.toLocaleString('en-IN')} /- (Rupees ${numberToWords(n)} Only)`;
}
function rupee(n: number): string {
  return `₹ ${Math.round(n).toLocaleString('en-IN')}`;
}
/**
 * Wage breakdown required by the Code on Wages, 2019.
 *
 * The Code defines "wages" so that basic + DA must be at least 50% of total
 * remuneration — if allowances exceed 50%, the excess is deemed to be wages for
 * PF/gratuity purposes. Splitting basic at exactly 50% keeps the structure
 * compliant by construction. Returns null when no salary was supplied, so the
 * letter falls back to blank lines to be filled in by hand.
 */
function wageBreakdown(salary: number | string | undefined) {
  const gross = typeof salary === 'string' ? parseFloat(salary) : salary;
  if (!gross || isNaN(gross) || gross <= 0) return null;

  const basic = Math.round(gross * 0.5);        // 50% floor per Code on Wages
  const hra = Math.round(gross * 0.2);          // 20% of gross
  const conveyance = Math.round(gross * 0.1);   // 10%
  const other = gross - basic - hra - conveyance; // remainder as special allowance

  // Employee-side statutory deductions
  const pfWageCeiling = Math.min(basic, 15000);  // EPF wage ceiling ₹15,000
  const pfEmployee = Math.round(pfWageCeiling * 0.12);
  const esiEligible = gross <= 21000;            // ESI applies up to ₹21,000 gross
  const esiEmployee = esiEligible ? Math.round(gross * 0.0075) : 0;

  return {
    gross, basic, hra, conveyance, other,
    pfEmployee, pfEmployer: pfEmployee,
    esiEligible, esiEmployee,
    esiEmployer: esiEligible ? Math.round(gross * 0.0325) : 0,
    netApprox: gross - pfEmployee - esiEmployee,
  };
}
function numberToWords(num: number): string {
  if (!num) return 'Zero';
  num = Math.floor(num);
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const twoD = (n: number): string => n < 20 ? ones[n] : tens[Math.floor(n/10)] + (n%10 ? ' ' + ones[n%10] : '');
  const threeD = (n: number): string => { const h = Math.floor(n/100); const r = n%100; return (h ? ones[h]+' Hundred'+(r?' ':'') : '')+(r?twoD(r):''); };
  let result = '';
  const crore = Math.floor(num/10000000); num %= 10000000;
  const lakh = Math.floor(num/100000); num %= 100000;
  const thousand = Math.floor(num/1000); num %= 1000;
  if (crore) result += threeD(crore) + ' Crore ';
  if (lakh) result += twoD(lakh) + ' Lakh ';
  if (thousand) result += twoD(thousand) + ' Thousand ';
  if (num) result += threeD(num);
  return result.trim();
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Role-specific content Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
interface RoleConfig {
  title: string;
  category: 'field' | 'office';
  duties: string[];
  probationMonths: number;
  noticeDays: number;
  shiftPattern: string;
  specialClauses: string[];
}

function getRoleConfig(designation: string): RoleConfig {
  const d = (designation || '').toLowerCase();

  if (d.includes('unarmed') || d.includes('security guard') || (!d.includes('armed') && d.includes('guard'))) {
    return {
      title: 'Security Guard (Unarmed)',
      category: 'field',
      probationMonths: 3,
      noticeDays: 7,
      shiftPattern: '8-hour / 12-hour rotational shifts as deployed by the Company',
      duties: [
        'Guard the assigned post/premises and prevent unauthorized entry or exit of persons and material',
        'Conduct regular patrols as per the beat schedule issued by the Supervisor',
        'Maintain the Gate Register / Daily Occurrence Book (DOB) legibly and accurately',
        'Monitor CCTV screens (where applicable) and report anomalies immediately',
        'Check vehicles, parcels, and personnel entering/leaving as per client SOP',
        'Report any theft, fire, accident, or unusual incident to the Supervisor/Control Room without delay',
        'Remain alert, awake, and in proper uniform throughout the duty period',
        'Hand over charge to the reliever with a proper briefing before leaving the post',
        'Follow all lawful instructions of the Supervisor, Area Officer, and client representatives',
        'Cooperate with police and fire authorities during emergencies or investigations',
      ],
      specialClauses: [
        'The Employee shall not leave the assigned post under any circumstances until properly relieved by another guard or authorized by the Supervisor.',
        'Sleeping on duty, consumption of any intoxicant, or use of mobile phone for personal calls during duty hours shall be treated as major misconduct leading to instant dismissal.',
      ],
    };
  }

  if (d.includes('armed')) {
    return {
      title: 'Security Guard (Armed)',
      category: 'field',
      probationMonths: 3,
      noticeDays: 15,
      shiftPattern: '8-hour / 12-hour rotational shifts as deployed by the Company',
      duties: [
        'All duties applicable to an Unarmed Security Guard as listed above',
        'Carry the licensed firearm issued by the Company during duty in the prescribed manner',
        'Ensure safe custody, maintenance, and cleaning of the assigned weapon at all times',
        'Guard high-security posts, escort cash/valuables, and provide armed response as directed',
        'Maintain the Arms Register and Ammunition Log with zero discrepancy',
        'Never discharge the firearm except in a genuine life-threatening situation strictly per the Company\'s Use-of-Force Policy',
        'Submit the weapon for inspection by any authorized Company officer or statutory authority on demand',
        'Attend all mandatory arms training, firing practice, and re-qualification sessions',
        'Report any loss, damage, or malfunction of the weapon immediately to the Area Officer',
      ],
      specialClauses: [
        'The Employee acknowledges that the firearm is licensed in the Company\'s name under the Arms Act, 1959 and is Company property. Any misuse, loss, or unauthorized discharge will attract criminal prosecution in addition to instant dismissal.',
        'The Employee shall comply with all provisions of the Private Security Agencies (Regulation) Act, 2005 and the Arms Rules applicable to deployment of armed private security personnel.',
      ],
    };
  }

  if (d.includes('supervisor')) {
    return {
      title: 'Security Supervisor',
      category: 'field',
      probationMonths: 3,
      noticeDays: 15,
      shiftPattern: 'General shift with mandatory night rounds and rotational site coverage',
      duties: [
        'Supervise, coordinate, and maintain discipline among all Security Guards at assigned post(s)',
        'Conduct daily guard briefings at shift start and debriefings at shift end',
        'Verify that all guards are present, alert, properly uniformed, and positioned correctly',
        'Conduct minimum two surprise rounds per shift (including one between 0100-0400 hrs)',
        'Resolve on-ground security incidents, deploy reserves, and escalate per protocol',
        'Maintain accurate guard attendance, rotation, and overtime records',
        'Liaise with client site managers, attend client meetings, and resolve complaints within 24 hours',
        'Train new guards on site-specific SOPs, access control, and emergency procedures',
        'Submit daily situation reports and weekly summary to the Area Officer',
        'Manage leave scheduling and ensure no post remains unmanned',
      ],
      specialClauses: [
        'The Supervisor shall be held accountable for any security lapse at posts under their charge that results from negligent supervision, falsified attendance, or failure to conduct prescribed rounds.',
      ],
    };
  }

  if (d.includes('area') || d.includes('officer')) {
    return {
      title: 'Area Officer / Operations Officer',
      category: 'field',
      probationMonths: 6,
      noticeDays: 30,
      shiftPattern: 'General shift (office hours) with field visits; on-call for emergencies 24×7',
      duties: [
        'Manage all security operations across multiple posts/sites in the assigned area',
        'Conduct weekly inspections of each post; ensure compliance with deployment SOPs and PSARA norms',
        'Handle client escalations, service-level complaints, and contract renewal discussions',
        'Oversee guard deployment, attendance, payroll inputs, and discipline for the area',
        'Investigate security incidents, prepare investigation reports, and implement corrective actions',
        'Coordinate with HR for recruitment drives, training batches, and exit processing in the area',
        'Maintain relationships with local police stations, fire services, and district administration',
        'Prepare monthly MIS reports (manpower, attendance %, client satisfaction, incident stats)',
        'Ensure timely collection of client payments; flag overdue accounts to Accounts',
        'Represent the Company at client audits, tender presentations, and industry meetings',
      ],
      specialClauses: [
        'The Area Officer holds fiduciary responsibility for Company assets, guard welfare, and client relationships within the assigned geography. Any proven negligence or conflict of interest shall be grounds for termination.',
      ],
    };
  }

  if (d.includes('account') || d.includes('finance')) {
    return {
      title: 'Accountant / Accounts Executive',
      category: 'office',
      probationMonths: 6,
      noticeDays: 30,
      shiftPattern: 'General office hours (0930–1830), 6 days a week',
      duties: [
        'Maintain books of accounts using Tally/accounting software; ensure day-book is updated daily',
        'Process monthly payroll: verify attendance inputs, calculate PF/ESI/PT/TDS deductions, generate pay-slips',
        'Prepare and file monthly GST returns (GSTR-1, GSTR-3B), TDS returns (24Q/26Q), and PT challans',
        'Manage accounts receivable: generate client invoices, track payments, send reminders, and reconcile',
        'Manage accounts payable: process vendor bills, guard reimbursements, and petty cash',
        'Conduct bank reconciliations, inter-branch fund transfers, and maintain cash-flow statements',
        'Prepare monthly MIS, Profit & Loss statement, and Balance Sheet for management review',
        'Handle statutory compliance: PF/ESI challan deposits by the 15th of each month',
        'Coordinate with external auditors and provide supporting documents for annual audit',
        'Maintain proper filing of all financial documents, challans, and receipts for 8 years',
      ],
      specialClauses: [
        'The Employee shall maintain strict confidentiality of all financial data, salary structures, and client billing information. Unauthorized disclosure shall constitute breach of trust.',
        'Any misappropriation of funds, falsification of accounts, or collusion in fraudulent transactions shall result in immediate termination and criminal prosecution.',
      ],
    };
  }

  if (d.includes('hr') || d.includes('human')) {
    return {
      title: 'HR Executive',
      category: 'office',
      probationMonths: 6,
      noticeDays: 30,
      shiftPattern: 'General office hours (0930–1830), 6 days a week',
      duties: [
        'Manage end-to-end recruitment cycle: sourcing, screening, interview coordination, and offer rollout',
        'Conduct employee onboarding: documentation, induction, uniform issue, and site deployment coordination',
        'Maintain employee master database, personal files, and HRIS records with 100% accuracy',
        'Process leave applications, attendance exceptions, and generate monthly payroll inputs',
        'Handle employee grievances, conduct preliminary inquiries, and maintain disciplinary records',
        'Ensure compliance with PSARA, EPF, ESIC, Payment of Bonus, Payment of Gratuity, and Minimum Wages Act',
        'Conduct exit interviews, process full & final settlements, and issue relieving/experience letters',
        'Coordinate training programs: induction, refresher, fire safety, and client-specific training',
        'Prepare HR MIS reports: headcount, attrition, recruitment funnel, compliance status',
        'Maintain all statutory registers (Muster Roll, Register of Wages, etc.) for labor inspections',
      ],
      specialClauses: [
        'The Employee shall maintain absolute confidentiality of all employee personal data, salary information, and disciplinary records as per applicable data protection standards.',
      ],
    };
  }

  if (d.includes('sales') || d.includes('business')) {
    return {
      title: 'Sales / Business Development Executive',
      category: 'office',
      probationMonths: 6,
      noticeDays: 30,
      shiftPattern: 'General shift with flexible field hours; client meetings may extend beyond office hours',
      duties: [
        'Identify, prospect, and convert new business opportunities for security services',
        'Conduct client meetings, site surveys, and security risk assessments for proposals',
        'Prepare commercial quotations, technical proposals, and service-level agreements',
        'Achieve monthly/quarterly revenue targets and maintain a healthy sales pipeline',
        'Maintain accurate CRM records: leads, meetings, proposals, closures, and lost deals',
        'Coordinate with Operations post-contract for smooth manpower deployment',
        'Handle contract renewals, rate revisions, and upselling additional services to existing clients',
        'Attend tenders (government and private), prepare bid documents, and follow up on awards',
        'Provide market intelligence: competitor pricing, new regulations, and industry trends',
        'Represent the Company at industry associations, expos, and networking events',
      ],
      specialClauses: [
        'Client relationships built during employment are Company assets. The Employee shall not solicit Company clients for 12 months after separation (applicable to the extent enforceable under law).',
        'Any commission or incentive earned is payable only after the corresponding client payment is realized by the Company.',
      ],
    };
  }

  // Generic fallback
  return {
    title: designation || 'Employee',
    category: 'office',
    probationMonths: 3,
    noticeDays: 30,
    shiftPattern: 'As assigned by the reporting manager',
    duties: [
      'Perform all duties assigned by the reporting manager diligently and professionally',
      'Maintain punctuality, attendance discipline, and professional conduct',
      'Protect Company assets, data, and reputation',
      'Comply with all Company policies, SOPs, and statutory requirements',
      'Cooperate with colleagues and contribute to a positive working environment',
    ],
    specialClauses: [],
  };
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Styles Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const S = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 46, paddingHorizontal: 42, fontSize: 8.6, fontFamily: 'NotoSans', color: DARK, lineHeight: 1.4 },
  // Letterhead
  lhRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  lhLeft: { flexDirection: 'row', alignItems: 'center' },
  lhLogo: { width: 44, height: 28, marginRight: 8 },
  lhName: { fontSize: 13, fontWeight: 700, color: BRAND },
  lhTagline: { fontSize: 7, color: GRAY, marginTop: 1 },
  lhRight: { alignItems: 'flex-end' },
  lhRightText: { fontSize: 7, color: LIGHT, textAlign: 'right' as const },
  lhBar: { height: 2, backgroundColor: BRAND, marginBottom: 8 },
  // Titles
  title: { fontSize: 12, fontWeight: 700, textAlign: 'center' as const, textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 2 },
  refLine: { fontSize: 7.5, textAlign: 'center' as const, color: GRAY, marginBottom: 8 },
  sectionHead: { fontSize: 9, fontWeight: 700, color: BRAND, marginTop: 8, marginBottom: 3, textTransform: 'uppercase' as const },
  // Body
  para: { fontSize: 8.6, marginBottom: 4, textAlign: 'justify' as const },
  bold: { fontWeight: 700 },
  // Table
  tbl: { width: '100%', borderWidth: 0.5, borderColor: '#ccc', marginVertical: 4 },
  tblRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e8e8e8', minHeight: 14 },
  tblLabel: { width: '32%', paddingVertical: 2.5, paddingHorizontal: 5, fontSize: 8, fontWeight: 700, backgroundColor: '#fafafa' },
  tblVal: { width: '68%', paddingVertical: 2.5, paddingHorizontal: 5, fontSize: 8 },
  // Two pairs per row — halves the vertical space used by detail tables
  tblLabel2: { width: '22%', paddingVertical: 2.5, paddingHorizontal: 5, fontSize: 8, fontWeight: 700, backgroundColor: '#fafafa' },
  tblVal2: { width: '28%', paddingVertical: 2.5, paddingHorizontal: 5, fontSize: 8 },
  // Bullets
  bullet: { flexDirection: 'row', marginBottom: 1.5, paddingLeft: 4 },
  bulletNum: { width: 14, fontSize: 7.8, fontWeight: 700 },
  bulletTxt: { flex: 1, fontSize: 7.8, lineHeight: 1.38 },
  // Clause
  clause: { flexDirection: 'row', marginBottom: 3 },
  clauseNum: { width: 18, fontSize: 8, fontWeight: 700 },
  clauseTxt: { flex: 1, fontSize: 8, textAlign: 'justify' as const, lineHeight: 1.4 },
  clauseHead: { fontWeight: 700 },
  // Signature
  sigSection: { marginTop: 14 },
  sigRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  sigBox: { width: '44%' },
  sigLine: { borderBottomWidth: 1, borderBottomColor: DARK, height: 36, marginBottom: 3 },
  sigLabel: { fontSize: 8.5, fontWeight: 700 },
  sigSub: { fontSize: 7.5, color: GRAY, marginTop: 1 },
  // Footer
  footer: { position: 'absolute' as const, bottom: 28, left: 48, right: 48, fontSize: 6.5, color: LIGHT, textAlign: 'center' as const, borderTopWidth: 0.5, borderTopColor: '#ddd', paddingTop: 4 },
  pageNum: { position: 'absolute' as const, bottom: 16, left: 48, right: 48, fontSize: 7, color: LIGHT, textAlign: 'center' as const },
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { limited } = rateLimit(`emp-agr:${ip}`, { limit: 10, windowMs: 60_000 });
  if (limited) return NextResponse.json({ error: 'Rate limited' }, { status: 429 });

  try {
    const data = await request.json();
    const { name, phone, email, gender, dateOfBirth, fatherName, designation, department, joinDate, salary, aadharNumber, panNumber, address, employeeId, employmentType } = data;

    const role = getRoleConfig(designation);
    // Labour Codes 2025 require the employment category to be stated explicitly
    const empType = employmentType || 'Permanent (Full-Time)';
    const wages = wageBreakdown(salary);
    const today = fmtDate(new Date().toISOString().split('T')[0]);
    const refNo = `SAFEND/HR/APPT/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`;
    const el = React.createElement;

    // Ã¢â€â‚¬Ã¢â€â‚¬ Letterhead builder (unique keys per page) Ã¢â€â‚¬Ã¢â€â‚¬
    const buildLetterhead = (prefix: string) => [
      el(View, { key: `${prefix}-lh`, style: S.lhRow },
        el(View, { style: S.lhLeft },
          LOGO_SRC ? el(Image, { src: LOGO_SRC, style: S.lhLogo }) : null,
          el(View, {},
            el(Text, { style: S.lhName }, CO.name),
            el(Text, { style: S.lhTagline }, CO.psara),
          ),
        ),
        el(View, { style: S.lhRight },
          el(Text, { style: S.lhRightText }, CO.address),
          el(Text, { style: S.lhRightText }, `CIN: ${CO.cin} | GSTIN: ${CO.gstin}`),
          el(Text, { style: S.lhRightText }, `${CO.phone} | ${CO.email}`),
        ),
      ),
      el(View, { key: `${prefix}-bar`, style: S.lhBar }),
    ];

    // Helper
    const row = (label: string, value: string) => el(View, { style: S.tblRow }, el(Text, { style: S.tblLabel }, label), el(Text, { style: S.tblVal }, value || '____________________'));
    // Two label/value pairs on one row — keeps the detail tables to half the height
    const row2 = (l1: string, v1: string, l2: string, v2: string) => el(View, { style: S.tblRow },
      el(Text, { style: S.tblLabel2 }, l1), el(Text, { style: S.tblVal2 }, v1 || '________________'),
      el(Text, { style: S.tblLabel2 }, l2), el(Text, { style: S.tblVal2 }, v2 || '________________'),
    );

    const page1 = [
      ...buildLetterhead('p1'),
      el(Text, { key: 't', style: S.title }, 'Letter of Appointment'),
      el(Text, { key: 'ref', style: S.refLine }, `Ref: ${refNo} | Date: ${today}`),

      el(Text, { key: 'to', style: { ...S.para, marginBottom: 8 } },
        el(Text, { style: S.bold }, 'To,\n'),
        el(Text, {}, `${name || '____________________'}\n`),
        el(Text, {}, address || '____________________'),
      ),

      el(Text, { key: 'sub', style: { ...S.para, fontWeight: 700 } as any }, `Sub: Appointment as ${role.title} — ${department || 'Operations'} Department`),

      el(Text, { key: 'dear', style: S.para },
        `Dear ${name || '____________________'},\n\nWith reference to your application and subsequent interview, we are pleased to appoint you as `,
        el(Text, { style: S.bold }, role.title),
        ` in ${CO.name} on the following terms and conditions. Kindly go through the terms carefully and sign both copies of this agreement as a token of your acceptance.`,
      ),

      // Employee Details — two pairs per row to conserve vertical space
      el(Text, { key: 'sh1', style: S.sectionHead }, 'A. Personal & Employment Details'),
      el(View, { key: 'tbl1', style: S.tbl },
        row2('Employee Name', name, 'Employee ID', employeeId || ''),
        row2("Father's / Husband's Name", fatherName || '', 'Date of Birth', fmtDate(dateOfBirth)),
        row2('Gender', gender ? gender.charAt(0).toUpperCase() + gender.slice(1) : '', 'Contact Number', phone),
        row2('Email', email || 'N/A', 'Aadhaar Number', aadharNumber || ''),
        row2('PAN', panNumber || '', 'Date of Joining', fmtDate(joinDate)),
        row2('Designation', role.title, 'Department', department || 'Operations'),
        row2('Category of Employment', empType, 'Place of Posting', 'As assigned (transferable)'),
        row2('Probation Period', `${role.probationMonths} months`, 'Notice Period (post-confirmation)', `${role.noticeDays} days`),
        row2('Weekly Rest Day', 'One paid day per week', 'Retirement Age', '58 years'),
        row('Working Hours / Shift', role.shiftPattern),
        row('Permanent Address', address || ''),
      ),

      // Wage structure — mandatory breakdown under the Code on Wages, 2019
      el(Text, { key: 'shw', style: S.sectionHead }, 'B. Wage Structure & Statutory Deductions'),
      el(View, { key: 'tblw', style: S.tbl },
        row2('Basic Wage + DA (50%)', wages ? rupee(wages.basic) : '', 'House Rent Allowance', wages ? rupee(wages.hra) : ''),
        row2('Conveyance Allowance', wages ? rupee(wages.conveyance) : '', 'Special / Other Allowance', wages ? rupee(wages.other) : ''),
        row2('Gross Monthly Wage', wages ? rupee(wages.gross) : '', 'Approx. Net Take-Home', wages ? rupee(wages.netApprox) : ''),
        row2('Less: EPF (12% of basic)', wages ? rupee(wages.pfEmployee) : '',
             'Less: ESI (0.75% of gross)', wages ? (wages.esiEligible ? rupee(wages.esiEmployee) : 'Not applicable') : ''),
        row('Employer Contributions (over and above gross)', wages
          ? `EPF ${rupee(wages.pfEmployer)}${wages.esiEligible ? ` + ESI ${rupee(wages.esiEmployer)}` : ' (ESI not applicable — gross above ₹21,000)'} per month`
          : ''),
        row('Wage Period & Payment', 'Calendar month; paid on or before the 7th of the following month by bank transfer'),
        row('Overtime Rate', 'Twice the ordinary rate of wages for every hour worked beyond the daily / weekly limit'),
      ),
      el(Text, { key: 'wnote', style: { fontSize: 7, color: LIGHT, marginTop: 2 } },
        'Net take-home is indicative and excludes Professional Tax and TDS, which are deducted as per prevailing law. Basic wage is set at 50% of gross in line with the Code on Wages, 2019.'
      ),
    ];

    // Ã¢â€â‚¬Ã¢â€â‚¬ PAGE 2: Terms & Conditions + Signature Ã¢â€â‚¬Ã¢â€â‚¬
    const terms: { heading: string; text: string }[] = [
      { heading: 'Category of Employment', text: `You are engaged as a ${empType} employee of the Company. This appointment is issued in compliance with the Code on Wages, 2019, the Industrial Relations Code, 2020, the Code on Social Security, 2020 and the Occupational Safety, Health and Working Conditions Code, 2020, which came into force on 21 November 2025. Your category, wage structure, working hours and social security entitlements are as set out in Sections A and B above.` },
      { heading: 'Probation & Confirmation', text: `You shall be on probation for a period of ${role.probationMonths} months from the date of joining. During probation, your services may be terminated by either party with 24 hours notice without assigning any reason. Upon satisfactory completion of probation, your employment shall be confirmed in writing by the HR department.` },
      { heading: 'Compensation & Deductions', text: `Your monthly gross salary shall be as mentioned above, payable by the 7th of the following month via bank transfer. Statutory deductions including Employee's Provident Fund (EPF @ 12%), Employee's State Insurance (ESI, if applicable), Professional Tax, and TDS shall be deducted at source as per prevailing law. The Company contributes employer's share of PF (12%) and ESI (3.25%) over and above your CTC.` },
      { heading: 'Working Hours & Attendance', text: `You shall adhere to the duty schedule assigned to you. ${role.category === 'field' ? 'For field staff, duty timings are as per the deployment roster which may include night shifts, weekends, and public holidays.' : 'Office hours are 0930–1830, Monday to Saturday.'} Unauthorized absence, habitual late arrival, or leaving duty without proper relief/permission shall attract disciplinary action including salary deduction.` },
      { heading: 'Leave', text: `Leave shall be granted as per Company policy in accordance with the Odisha Shops & Commercial Establishments Act. You are entitled to: Casual Leave (CL): 7 days/year, Sick Leave (SL): 7 days/year (with medical certificate for >2 days), Earned Leave (EL): 1 day per 20 days of continuous service. Leave must be applied in advance; unapproved leave will be treated as unauthorized absence.` },
      { heading: 'Social Security & Statutory Benefits', text: `You shall be covered under the following, subject to the eligibility thresholds prescribed from time to time: (a) Employees' Provident Fund & Pension (EPF/EPS) under the Code on Social Security, 2020 — employee and employer each contribute 12% of basic wages; (b) Employees' State Insurance (ESI) providing medical, sickness and disablement benefits where monthly gross wages do not exceed ₹21,000; (c) Gratuity at 15 days' wages for every completed year of service, payable on separation after 5 years of continuous service (or earlier on death/disablement); (d) Maternity Benefit of 26 weeks' paid leave for eligible women employees under the Maternity Benefit provisions; (e) Employee compensation for employment injury; (f) Annual health check-up where prescribed. Your UAN, ESIC IP number and nominations shall be recorded at the time of enrolment.` },
      { heading: 'Uniform, Equipment & ID', text: `The Company shall provide uniform, identity card, and equipment (${role.category === 'field' ? 'torch, whistle, lathi, notebook' : 'laptop/computer access'}) as required for your role. These remain Company property. Loss or willful damage will be recovered from your salary. All items must be returned in good condition upon separation.` },
      { heading: 'Conduct & Discipline', text: `You shall maintain exemplary conduct, honesty, and discipline at all times. The following shall constitute major misconduct leading to instant dismissal without notice: (a) Theft, fraud, or misappropriation; (b) Sleeping on duty${role.category === 'field' ? ' or abandoning post without relief' : ''}; (c) Consumption of alcohol, drugs, or any intoxicant during duty; (d) Insubordination or violence; (e) Falsification of records or attendance; (f) Unauthorized disclosure of confidential information; (g) Conviction under any criminal offence involving moral turpitude.` },
      { heading: 'Confidentiality', text: `You shall not disclose, during or after employment, any confidential information of the Company or its clients including but not limited to: client identities, contract values, security arrangements, operational procedures, and employee personal data. Breach of confidentiality shall attract legal action.` },
      { heading: 'Transfer & Deputation', text: `The Company may transfer you to any branch, client site, or affiliated entity as per operational requirements. You agree to accept such transfers within reasonable notice. For field staff, deployment site may change based on client requirements and operational exigencies.` },
      { heading: 'Termination (post-confirmation)', text: `After confirmation, either party may terminate this agreement by giving ${role.noticeDays} days written notice or payment of ${role.noticeDays} days gross salary in lieu thereof. The Company reserves the right to terminate without notice in case of misconduct as defined in Clause 6 above. In case of absconding (absence without intimation for 7+ days), employment shall be deemed auto-terminated.` },
      { heading: 'Full & Final Settlement', text: `Upon separation, your final settlement (pending salary, leave encashment, PF, gratuity if applicable) shall be processed within 30 working days after: (a) return of all Company property (uniform, ID, equipment), (b) completion of proper handover, and (c) clearance of all outstanding dues/advances.` },
      { heading: 'PSARA & Statutory Compliance', text: `${CO.name} is licensed under the Private Security Agencies (Regulation) Act, 2005. You consent to mandatory police verification, background check, and any training/certification required under PSARA. You shall cooperate with all regulatory inspections and audits.` },
      { heading: 'Dispute Resolution', text: `Any dispute arising from this agreement shall first be attempted to be resolved amicably through internal grievance mechanisms. Failing resolution, the dispute shall be subject to the exclusive jurisdiction of the competent courts/tribunals at ${CO.jurisdiction}.` },
    ];

    // Special clauses for the role
    if (role.specialClauses.length > 0) {
      terms.push({
        heading: 'Role-Specific Conditions',
        text: role.specialClauses.join(' '),
      });
    }

    terms.push({
      heading: 'General',
      text: 'This letter of appointment, along with the Company\'s HR Policy Manual (available for reference at the HR office), constitutes the entire agreement between you and the Company. No oral assurance or previous correspondence shall override the terms herein. This appointment is subject to your documents and credentials being found genuine upon verification.',
    });

    // Duties sit on page 2 alongside the first block of terms, so page 1 stays
    // dedicated to the statutory detail + wage tables.
    const dutiesBlock = [
      el(Text, { key: 'sh2', style: { ...S.sectionHead, marginTop: 0 } }, 'C. Key Responsibilities & Duties'),
      el(Text, { key: 'dp', style: { fontSize: 7.5, color: GRAY, marginBottom: 3 } }, `As ${role.title}, you shall be responsible for:`),
      ...role.duties.map((duty, i) =>
        el(View, { key: `duty${i}`, style: S.bullet },
          el(Text, { style: S.bulletNum }, `${i + 1}.`),
          el(Text, { style: S.bulletTxt }, duty),
        )
      ),
    ];

    // Split terms so page 3 keeps room for the signature block
    const splitAt = 6;
    const termsFirstHalf = terms.slice(0, splitAt);
    const termsSecondHalf = terms.slice(splitAt);

    // Ã¢â€â‚¬Ã¢â€â‚¬ PAGE 2: Terms 1-7 Ã¢â€â‚¬Ã¢â€â‚¬
    const page2 = [
      ...buildLetterhead('p2'),
      ...dutiesBlock,
      el(Text, { key: 'sh3', style: S.sectionHead }, 'D. Terms & Conditions'),
      ...termsFirstHalf.map((t, i) =>
        el(View, { key: `cl${i}`, style: S.clause },
          el(Text, { style: S.clauseNum }, `${i + 1}.`),
          el(Text, { style: S.clauseTxt },
            el(Text, { style: S.clauseHead }, `${t.heading}: `),
            el(Text, {}, t.text),
          ),
        )
      ),
    ];

    // Ã¢â€â‚¬Ã¢â€â‚¬ PAGE 3: Terms 8+ + Declaration + Signatures Ã¢â€â‚¬Ã¢â€â‚¬
    const page3 = [
      ...buildLetterhead('p3'),
      // No italic NotoSans is registered, so italic would fail font resolution.
      el(Text, { key: 'contd', style: { fontSize: 8, color: GRAY, marginBottom: 6 } as any }, 'Terms & Conditions (continued)'),
      ...termsSecondHalf.map((t, i) =>
        el(View, { key: `cl2${i}`, style: S.clause },
          el(Text, { style: S.clauseNum }, `${termsFirstHalf.length + i + 1}.`),
          el(Text, { style: S.clauseTxt },
            el(Text, { style: S.clauseHead }, `${t.heading}: `),
            el(Text, {}, t.text),
          ),
        )
      ),

      // Declaration & Acceptance
      el(View, { key: 'decl', style: S.sigSection },
        el(Text, { style: { ...S.sectionHead, marginTop: 0 } }, 'E. Acceptance & Declaration'),
        el(Text, { style: S.para },
          'I, ', el(Text, { style: S.bold }, name || '____________________'),
          ', have carefully read and understood all the terms and conditions mentioned in this Letter of Appointment. I hereby accept this appointment and agree to abide by the rules and regulations of the Company. I confirm that the information provided by me is true and correct to the best of my knowledge.',
        ),
        el(View, { style: S.sigRow },
          el(View, { style: S.sigBox },
            el(Text, { style: S.sigLabel }, `For ${CO.name}`),
            el(View, { style: S.sigLine }),
            el(Text, { style: S.sigSub }, 'Authorized Signatory'),
            el(Text, { style: S.sigSub }, 'Name: ____________________'),
            el(Text, { style: S.sigSub }, 'Designation: HR Manager'),
            el(Text, { style: S.sigSub }, `Date: ${today}`),
            el(Text, { style: { ...S.sigSub, marginTop: 4 } }, '(Company Seal)'),
          ),
          el(View, { style: S.sigBox },
            el(Text, { style: S.sigLabel }, 'Employee'),
            el(View, { style: S.sigLine }),
            el(Text, { style: S.sigSub }, `Name: ${name || '____________________'}`),
            el(Text, { style: S.sigSub }, 'Signature: ____________________'),
            el(Text, { style: S.sigSub }, 'Date: ____________________'),
          ),
        ),
        el(View, { style: { marginTop: 16 } },
          el(Text, { style: { fontSize: 8, fontWeight: 700, marginBottom: 6 } }, 'Witnesses:'),
          el(Text, { style: { fontSize: 7.5, color: GRAY, marginBottom: 3 } }, '1. Name: _________________________ Signature: _________________ Address: _________________________'),
          el(Text, { style: { fontSize: 7.5, color: GRAY } }, '2. Name: _________________________ Signature: _________________ Address: _________________________'),
        ),
      ),
    ];

    const footerEl = (key: string) => el(Text, { key, style: S.footer, fixed: true } as any,
      `This is a computer-generated document. | ${CO.name} | ${CO.address} | ${CO.phone}`
    );
    const pageNumEl = (key: string) => el(Text, { key, style: S.pageNum, fixed: true, render: ({ pageNumber, totalPages }: any) => `Page ${pageNumber} of ${totalPages}` } as any);

    const Doc = el(Document, {},
      el(Page, { size: 'A4', style: S.page }, ...page1, footerEl('f1'), pageNumEl('pn1')),
      el(Page, { size: 'A4', style: S.page }, ...page2, footerEl('f2'), pageNumEl('pn2')),
      el(Page, { size: 'A4', style: S.page }, ...page3, footerEl('f3'), pageNumEl('pn3')),
    );

    const blob = await pdf(Doc).toBlob();
    const buffer = Buffer.from(await blob.arrayBuffer());
    const filename = `Appointment_Letter_${(name || 'Employee').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error('[employee-agreement-pdf]', err);
    return NextResponse.json({ error: err?.message || 'PDF generation failed' }, { status: 500 });
  }
}
