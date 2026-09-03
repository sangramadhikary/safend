import type { Metadata } from 'next';
import { LegalDocument, type LegalSection } from '@/components/marketing/LegalDocument';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbSchema } from '@/lib/seo/schemas';

export const metadata: Metadata = {
  title: 'Terms & Conditions | Safend Secure Solutions',
  description:
    'Terms and Conditions for Safend Secure Solutions — governing website use, security services, ERP/Supervisor portal access, and client engagements under Indian law.',
  alternates: { canonical: '/terms' },
};

const LAST_UPDATED = '10 July 2026';

const SECTIONS: LegalSection[] = [
  {
    heading: 'Acceptance of Terms',
    body: [
      'These Terms and Conditions ("Terms") constitute a legally binding agreement between you ("User", "Client", "you") and Safend Secure Solutions Private Limited ("Safend", "Company", "we", "us"), a company incorporated under the Companies Act, 2013, having its registered office in Bhubaneswar, Odisha, India.',
      'By accessing our website (www.safends.com, www.safend.in), using our web applications (ERP Portal, Supervisor/Area Officer Portal, Client Portal), or engaging our services, you agree to be bound by these Terms.',
      'These Terms are enforceable under the Indian Contract Act, 1872. If you do not agree with any provision, you must immediately discontinue use. Your continued access after any modification to these Terms constitutes acceptance of such modifications.',
    ],
  },
  {
    heading: 'Definitions',
    body: ['In these Terms, unless the context requires otherwise:'],
    list: [
      '"Services" means the private security services provided by Safend, including manned guarding (armed and unarmed), patrol services, event security, personal security officers, K9 units, electronic surveillance, and all ancillary services.',
      '"Platform" means the Safend website, ERP portal, Supervisor/Area Officer portal, and Client portal, including their Progressive Web App (PWA) versions.',
      '"Service Agreement" means the written contract between Safend and a Client specifying the scope, terms, and fees for security services.',
      '"Personnel" means security guards, supervisors, area officers, and other staff deployed by Safend.',
      '"Confidential Information" means any non-public information including client site details, deployment plans, security protocols, pricing, and business strategies.',
    ],
  },
  {
    heading: 'Eligibility',
    body: [
      'You must be at least 18 years of age and competent to contract under Section 11 of the Indian Contract Act, 1872 to access our Platform or engage our Services.',
      'If you are accessing the Platform on behalf of an organization, you represent that you have authority to bind that organization to these Terms.',
      'Personnel accessing the Supervisor/Area Officer Portal must be current employees of Safend with valid credentials issued by administration.',
    ],
  },
  {
    heading: 'Platform Access and User Accounts',
    body: ['By creating an account or being granted access to our Platform:'],
    list: [
      'You are responsible for maintaining the confidentiality of your login credentials. Sharing credentials is strictly prohibited and constitutes a security violation.',
      'You agree to mandatory security measures including device-limit enforcement (max 2 devices), session monitoring, content protection, and digital watermarking as described in our Privacy Policy.',
      'The Supervisor/Area Officer Portal requires installation as a PWA and mandatory permissions (location, camera, notifications). Access is restricted to Indian territory (geofence enforcement).',
      'We reserve the right to suspend or terminate access for: security policy violations, unauthorized access attempts, credential sharing, data exfiltration attempts, or any activity that threatens platform integrity.',
      'All activity on your account is your responsibility. Notify us immediately at security@safends.com if you suspect unauthorized use.',
    ],
  },
  {
    heading: 'Acceptable Use Policy',
    body: ['When using our Platform, you shall NOT:'],
    list: [
      'Use the Platform for any purpose that violates the Information Technology Act, 2000, the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, or any other applicable law.',
      'Attempt to reverse-engineer, decompile, circumvent, or bypass any security measures including content protection, watermarking, copy/print restrictions, or access controls.',
      'Use screen recording, automated scraping, or any tool to capture or extract data from the Platform.',
      'Share, distribute, or disclose any information accessed through the Platform to unauthorized persons, including but not limited to client data, employee data, deployment details, or operational information.',
      'Introduce malware, viruses, ransomware, or any malicious code into our systems.',
      'Attempt to gain unauthorized access to any system, database, or network connected to our Platform.',
      'Use the Platform to engage in activities that constitute unfair trade practices under the Consumer Protection Act, 2019.',
      'Impersonate any person or entity, or misrepresent your affiliation with any person or entity.',
    ],
  },
  {
    heading: 'Security Services — Terms of Engagement',
    body: [
      'The provision of security services is governed by the Private Security Agencies Regulation Act, 2005 (PSARA) and the rules framed thereunder. Safend holds valid PSARA licenses for the states in which it operates.',
    ],
    list: [
      'Service scope: The specific services, number of personnel, deployment locations, shift timings, and fees are defined in the Service Agreement. These Terms supplement but do not override the Service Agreement.',
      'Quotations: All quotations issued are valid for the period stated (default 30 days). Quotations are not binding until a Service Agreement is executed.',
      'Commencement: Services commence on the date specified in the Service Agreement, subject to site readiness and regulatory clearances.',
      'Minimum commitment: Unless stated otherwise, service engagements carry a minimum commitment period of 3 months.',
      'Personnel substitution: Safend reserves the right to substitute deployed personnel for operational reasons, maintaining equivalent qualification and training standards.',
    ],
  },
  {
    heading: 'Fees, Taxes, and Payment',
    body: ['Financial terms governing our service engagements:'],
    list: [
      'All fees are computed on the basis of applicable minimum wages (as per the Minimum Wages Act, 1948 and state notifications), statutory contributions (EPF @ 13%, ESI @ 3.25%, bonus @ 8.33%), and service charges as detailed in the quotation.',
      'Fees are exclusive of Goods and Services Tax (GST) at the applicable rate (currently 18% for security services under SAC 998513) unless stated as inclusive.',
      'Invoices are raised on the billing cycle specified in the Service Agreement (typically monthly in arrears). Payment is due within the credit period stated (default 15 days from invoice date).',
      'Late payment beyond the credit period shall attract interest at 1.5% per month (18% per annum) on the outstanding amount, without prejudice to other remedies.',
      'In case of sustained non-payment exceeding 30 days, Safend reserves the right to suspend services after giving 7 days written notice.',
      'All payments to be made via bank transfer (NEFT/RTGS/IMPS) to the account specified in the invoice. Cash payments are not accepted.',
    ],
  },
  {
    heading: 'Client Obligations',
    body: ['The Client engaging our Services shall:'],
    list: [
      'Provide a safe and secure working environment for deployed Personnel in compliance with the Factories Act, 1948, Building and Other Construction Workers Act, 1996, and applicable occupational safety laws.',
      'Furnish accurate and complete information regarding the site, threat assessment, number of access points, and any hazardous conditions that may affect personnel safety.',
      'Not directly or indirectly employ, solicit, or engage any Personnel deployed by Safend during the term of the Service Agreement and for 12 months thereafter (non-solicitation clause).',
      'Provide basic amenities (drinking water, rest area, sanitary facilities) for deployed Personnel as required by labour laws.',
      'Make available necessary infrastructure (guard room, communication equipment, access control systems) as agreed in the Service Agreement.',
      'Promptly report any incident, threat, or complaint involving Personnel to the designated Safend operations coordinator.',
      'Not require Personnel to perform tasks outside the scope of the Service Agreement without prior written consent from Safend.',
    ],
  },
  {
    heading: 'Compliance with Labour Laws',
    body: [
      'Safend maintains strict compliance with all applicable employment and labour legislation:',
    ],
    list: [
      'Minimum Wages Act, 1948: All Personnel are paid at or above the minimum wage notified by the respective State Government for the security services category.',
      'Payment of Wages Act, 1936: Wages disbursed by the 7th of each month via bank transfer.',
      'Employees Provident Funds and Miscellaneous Provisions Act, 1952: All eligible employees enrolled; contributions deposited by the 15th of each month.',
      'Employees State Insurance Act, 1948: All eligible employees covered under ESI; contributions remitted monthly.',
      'Payment of Bonus Act, 1965: Statutory bonus computed and paid annually.',
      'Payment of Gratuity Act, 1972: Gratuity paid to eligible employees upon separation.',
      'Contract Labour (Regulation and Abolition) Act, 1970: Applicable licenses maintained where Personnel are deployed as contract labour.',
      'Industrial Disputes Act, 1947 / Industrial Relations Code, 2020: Compliance with notice periods, settlement procedures, and retrenchment norms.',
      'Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013: Internal Complaints Committee constituted; POSH policy in place.',
    ],
  },
  {
    heading: 'Intellectual Property',
    body: [
      'All intellectual property on the Platform — including the Safend name, logo, trademarks, website design, software, documentation, training materials, SOPs, and content — is the exclusive property of Safend Secure Solutions Pvt. Ltd., protected under:',
    ],
    list: [
      'The Copyright Act, 1957 — all original literary, artistic, and software works.',
      'The Trade Marks Act, 1999 — all registered and unregistered trademarks, service marks, and trade dress.',
      'The Information Technology Act, 2000 — database rights and software protection.',
      'No license, right, or interest in any intellectual property is granted except the limited right to access the Platform for its intended purpose during the term of your engagement.',
      'Any unauthorized reproduction, distribution, modification, or commercial exploitation constitutes infringement and may result in civil and criminal liability.',
    ],
  },
  {
    heading: 'Confidentiality and Non-Disclosure',
    body: [
      'Both parties acknowledge that Confidential Information may be exchanged during the engagement:',
    ],
    list: [
      'Each party shall hold Confidential Information in strict confidence, using it solely for the purpose of the engagement.',
      'Disclosure is permitted only to employees/agents with a need-to-know, who are bound by equivalent confidentiality obligations.',
      'Obligations survive termination of the engagement for a period of 3 years.',
      'Exceptions: information that becomes publicly available (not through breach), was already known, is independently developed, or is required to be disclosed by law or court order (with prompt notice to the disclosing party).',
      'For Personnel: all operational information, client details, site security plans, deployment data, and ERP/Portal data accessed during employment is strictly confidential. Violation constitutes grounds for immediate termination and legal action.',
    ],
  },
  {
    heading: 'Data Protection',
    body: [
      'Our collection and processing of personal data is governed by our Privacy Policy (available at /privacy-policy) and the Digital Personal Data Protection Act, 2023. Key provisions:',
    ],
    list: [
      'We process personal data only with consent or for legitimate uses as defined in the DPDP Act.',
      'Content protection measures (watermarking, copy restrictions) are applied to protect client and company data — not to infringe on your personal rights.',
      'Platform users have rights of access, correction, erasure, and consent withdrawal as detailed in the Privacy Policy.',
      'Data breach notification will be made to affected persons and the Data Protection Board as required by law.',
    ],
  },
  {
    heading: 'Termination',
    body: ['Either party may terminate the service engagement as follows:'],
    list: [
      'Convenience: By giving written notice as specified in the Service Agreement (default 30 days).',
      'Breach: Immediately upon material breach by the other party that remains uncured 15 days after written notice.',
      'Insolvency: Immediately if either party becomes insolvent, enters liquidation, or ceases to carry on business.',
      'Upon termination: Client shall pay all fees due for services rendered up to the termination date. Safend shall withdraw personnel and return any client property. Confidentiality and IP obligations survive termination.',
      'Platform access: Terminated users\' portal access is revoked immediately. Data retention follows the periods stated in the Privacy Policy.',
    ],
  },
  {
    heading: 'Limitation of Liability',
    body: [
      'To the maximum extent permitted under Indian law:',
    ],
    list: [
      'Safend shall not be liable for any indirect, incidental, consequential, special, or punitive damages including loss of profit, revenue, data, goodwill, or business opportunity.',
      'Our total aggregate liability for any claim arising out of or connected to the services shall not exceed the total fees paid by the Client to Safend in the 3 months immediately preceding the event giving rise to the claim.',
      'This limitation applies regardless of the form of action (contract, tort, negligence, or otherwise).',
      'Nothing in these Terms excludes or limits liability for: (a) death or personal injury caused by negligence, (b) fraud or fraudulent misrepresentation, (c) any liability that cannot be excluded under mandatory provisions of Indian law.',
      'The Platform is provided "as is" for internal operational use. We do not warrant uninterrupted or error-free operation.',
    ],
  },
  {
    heading: 'Indemnification',
    body: ['You agree to indemnify, defend, and hold harmless Safend, its directors, officers, employees, and agents from and against all claims, losses, damages, penalties, and expenses (including legal fees) arising from:'],
    list: [
      'Your breach of these Terms or any Service Agreement.',
      'Your violation of any applicable law or third-party rights.',
      'Any negligent or wrongful act by you or persons under your control at a deployment site.',
      'Any unauthorized use of the Platform through your credentials.',
      'Safend shall similarly indemnify the Client against claims arising from the proven negligence or willful misconduct of deployed Personnel in the course of their duties.',
    ],
  },
  {
    heading: 'Force Majeure',
    body: [
      'Neither party shall be liable for failure or delay in performance caused by circumstances beyond reasonable control, including but not limited to:',
    ],
    list: [
      'Natural disasters (flood, earthquake, cyclone), epidemics/pandemics, acts of God.',
      'War, armed conflict, terrorism, riots, civil unrest, strikes (not involving the affected party\'s own employees).',
      'Government orders, curfews, lockdowns, regulatory changes that make performance unlawful.',
      'Failure of public infrastructure (telecommunications, power, transportation) not attributable to the party.',
      'The affected party must notify the other within 48 hours and take reasonable steps to mitigate. If the force majeure continues for more than 30 consecutive days, either party may terminate without liability.',
    ],
  },
  {
    heading: 'Governing Law and Jurisdiction',
    body: [
      'These Terms shall be governed by and construed in accordance with the laws of India, without regard to conflict of law principles.',
      'Subject to the arbitration clause below, the courts of competent jurisdiction at Cuttack, Odisha, India shall have exclusive jurisdiction over any disputes arising from these Terms or the Services.',
    ],
  },
  {
    heading: 'Dispute Resolution and Arbitration',
    body: [
      'The parties shall follow a tiered dispute resolution process:',
    ],
    list: [
      'Negotiation: The parties shall first attempt to resolve any dispute through good-faith discussion between designated representatives within 15 days of written notice of the dispute.',
      'Mediation: If negotiation fails, the parties may agree to refer the dispute to mediation before a mutually agreed mediator.',
      'Arbitration: Any dispute not resolved through negotiation or mediation shall be finally settled by arbitration under the Arbitration and Conciliation Act, 1996 (as amended). A sole arbitrator shall be appointed by mutual consent. The seat and venue of arbitration shall be Cuttack, Odisha. The language shall be English. The arbitrator\'s award shall be final and binding.',
      'Interim relief: Nothing in this clause prevents either party from seeking urgent interim or injunctive relief from a court of competent jurisdiction.',
      'Costs: Each party shall bear its own costs unless the arbitrator directs otherwise.',
    ],
  },
  {
    heading: 'Severability',
    body: [
      'If any provision of these Terms is held by a court or tribunal of competent jurisdiction to be invalid, illegal, or unenforceable, such provision shall be modified to the minimum extent necessary to make it valid and enforceable, or severed if modification is not possible. The remaining provisions shall continue in full force and effect.',
    ],
  },
  {
    heading: 'Entire Agreement',
    body: [
      'These Terms, together with the Privacy Policy and any executed Service Agreement, constitute the entire agreement between you and Safend regarding the subject matter hereof. They supersede all prior or contemporaneous oral or written communications, proposals, and representations.',
      'No amendment or waiver of any provision shall be effective unless in writing and signed by an authorized representative of Safend.',
    ],
  },
  {
    heading: 'Modifications',
    body: [
      'We reserve the right to modify these Terms at any time. The revised Terms will be posted on this page with an updated "Last updated" date. Material changes affecting existing service engagements will be notified via email or platform notification at least 15 days before taking effect.',
      'Your continued use of the Platform or Services after the modification constitutes acceptance.',
    ],
  },
  {
    heading: 'Contact Information',
    body: [
      'For any questions, concerns, or notices regarding these Terms:',
      'Safend Secure Solutions Private Limited\nRegistered Office: Bhubaneswar, Odisha, India\nEmail: legal@safends.com\nPhone: +91 674 XXX XXXX\nGrievance Officer: Sangram Adhikary (dpo@safends.com)',
      'For service-related queries: operations@safends.com\nFor billing disputes: accounts@safends.com',
    ],
  },
];

export default function TermsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', url: '/' },
          { name: 'Terms & Conditions', url: '/terms' },
        ])}
      />
      <LegalDocument
        kicker="Legal — Terms of Service"
        title="Terms & Conditions"
        intro="The terms governing your use of the Safend Platform and our security services — enforceable under the Indian Contract Act, 1872 and applicable laws of India."
        lastUpdated={LAST_UPDATED}
        sections={SECTIONS}
      />
    </>
  );
}
