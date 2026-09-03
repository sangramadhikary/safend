import type { Metadata } from 'next';
import { LegalDocument, type LegalSection } from '@/components/marketing/LegalDocument';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbSchema } from '@/lib/seo/schemas';

export const metadata: Metadata = {
  title: 'Privacy Policy | Safend Secure Solutions',
  description:
    'Safend Privacy Policy under the Digital Personal Data Protection Act, 2023 (DPDPA). Details on data collection, processing, retention, your rights, and grievance redressal.',
  alternates: { canonical: '/privacy-policy' },
};

const LAST_UPDATED = '10 July 2026';

const SECTIONS: LegalSection[] = [
  {
    heading: 'About This Policy',
    body: [
      'Safend Secure Solutions Private Limited ("Safend", "we", "us", "our"), a company registered under the Companies Act, 2013, acts as the Data Fiduciary for the purposes of the Digital Personal Data Protection Act, 2023 ("DPDP Act" or "Act"). This Privacy Policy describes how we collect, process, store, and protect your Digital Personal Data.',
      'This Policy applies to all individuals ("Data Principals") whose personal data we process — including website visitors, clients, employees, supervisors/area officers, job applicants, and third parties whose data we receive in the course of providing services.',
      'By providing your personal data to us or using our services, you acknowledge that you have read this Policy. Where consent is the legal basis for processing, we will obtain your explicit consent before or at the time of collection.',
    ],
  },
  {
    heading: 'Definitions (DPDP Act, Sec. 2)',
    body: ['Key terms used in this Policy have the meanings assigned by the DPDP Act, 2023:'],
    list: [
      'Data Principal — the individual to whom the personal data relates (you).',
      'Data Fiduciary — the entity that determines the purpose and means of processing (Safend).',
      'Data Processor — any entity that processes data on behalf of the Data Fiduciary.',
      'Digital Personal Data — personal data collected in digital form or digitised after collection.',
      'Consent — free, specific, informed, unconditional, and unambiguous indication of the Data Principal\'s wishes.',
      'Significant Data Fiduciary — a Data Fiduciary notified by the Central Government based on volume/sensitivity of data processed.',
    ],
  },
  {
    heading: 'Personal Data We Collect',
    body: ['We collect and process the following categories of Digital Personal Data:'],
    list: [
      'Identity data: full name, photograph, date of birth, gender, Aadhaar number (masked), PAN, voter ID, or other government-issued identification (collected for statutory KYC and employment compliance only).',
      'Contact data: postal address, email address, mobile/phone number, emergency contact details.',
      'Employment data: employee ID, designation, department, branch assignment, joining date, salary details, bank account (for payroll), PF/ESI numbers, attendance records, shift schedules, performance records.',
      'Client/business data: company name, GSTIN, authorised contact person name, service agreement details, billing address.',
      'Location data: real-time GPS coordinates collected from supervisor/area officer devices during work hours for attendance verification, geofence enforcement, and site check-ins.',
      'Biometric/media data: photographs captured via the supervisor app for patrol documentation and incident evidence.',
      'Device and technical data: IP address, device type, operating system, browser information, session tokens, login timestamps, user-agent strings.',
      'Communication data: enquiry form submissions, email correspondence, chat messages sent through our platforms.',
      'Recruitment data: résumés, cover letters, qualifications, interview notes, background-verification results, reference contact details.',
      'Security/audit data: page access logs, consent records, session activity, content protection event logs.',
    ],
  },
  {
    heading: 'Purpose of Processing (Sec. 4)',
    body: ['We process your personal data only for lawful purposes. The specific purposes for each category are:'],
    list: [
      'Service delivery: to provide contracted security services including guard deployment, roster management, attendance tracking, patrol monitoring, and incident response.',
      'Client relationship: to prepare quotations, execute service agreements, generate invoices, process payments, and manage client communications.',
      'Employment management: to conduct recruitment, verify backgrounds, onboard personnel, manage payroll (including PF, ESI, and professional tax), track attendance, assign shifts, evaluate performance, and process separations.',
      'Supervisor/Area Officer portal: to enable field supervisors to manage assigned posts, mark bulk attendance, track deployments, document patrols, and respond to incidents — all scoped to their assigned locations.',
      'Security and integrity: to enforce device limits, prevent unauthorized access, implement content protection (copy/print/screenshot deterrence, digital watermarking), detect suspicious activity, and maintain audit trails.',
      'Geolocation verification: to verify that field personnel are at their assigned post during duty hours, enforce India-only access, and generate route/trip reports.',
      'Legal compliance: to meet obligations under the Private Security Agencies Regulation Act (PSARA), Shops and Establishments Act, Payment of Wages Act, EPF Act, ESI Act, Income Tax Act, GST law, and other applicable legislation.',
      'Communication: to send operational notifications (shift alerts, attendance reminders, incident updates), and where you have opted in, marketing communications about our services.',
      'Analytics and improvement: to understand usage patterns, improve our platforms, and fix technical issues (using aggregated/anonymised data where possible).',
    ],
  },
  {
    heading: 'Lawful Basis for Processing (Sec. 4 & 7)',
    body: [
      'We process your personal data on one or more of the following legal grounds under the DPDP Act:',
    ],
    list: [
      'Consent (Sec. 6): Where you have given clear, affirmative consent — for example, the security consent screen shown before accessing the supervisor portal, or when submitting an enquiry form.',
      'Legitimate uses (Sec. 7): Processing necessary for (a) performance of a contract to which you are a party (employment contract, service agreement), (b) compliance with applicable law, (c) response to a medical emergency, (d) employment-related purposes such as payroll, prevention of corporate espionage, and maintaining confidentiality of trade secrets.',
      'Voluntary provision: Where you voluntarily provide data (e.g., submitting your résumé for a job application), this constitutes consent for the stated purpose.',
    ],
  },
  {
    heading: 'Consent Mechanism',
    body: [
      'Where consent is the legal basis, we obtain it through clear, specific, and freely given mechanisms:',
    ],
    list: [
      'Portal security consent: Before accessing the Supervisor or ERP portal, users must read and accept the security measures notice, which details every data processing activity, its purpose, and retention period. This consent is versioned — if we update the terms, re-consent is required.',
      'Contact/enquiry forms: Submitting a form constitutes consent for us to process the submitted data to respond to your query.',
      'Cookies: Essential cookies operate on legitimate interest; analytics cookies (if any) require explicit opt-in.',
      'Record of consent: Every consent event is recorded in our database with timestamp, user identity, IP address, device information, and the version of terms accepted — creating an auditable trail as required by Sec. 6(6).',
    ],
  },
  {
    heading: 'Withdrawal of Consent (Sec. 6(6))',
    body: [
      'You have the right to withdraw consent at any time. Withdrawal is as easy as giving consent:',
    ],
    list: [
      'Portal users: Navigate to Settings → Data Protection → "Withdraw Consent". This will immediately log you out and disable portal access.',
      'Other individuals: Send an email to dpo@safends.com with the subject "Consent Withdrawal" and your identification details.',
      'Effect: Withdrawal does not affect the lawfulness of processing carried out before withdrawal. However, continued service delivery may not be possible without consent for essential data processing.',
      'Timeline: We will process your withdrawal within 7 working days and confirm via email.',
    ],
  },
  {
    heading: 'Data Sharing and Disclosure (Sec. 8(8))',
    body: ['We do not sell your personal data. We may share data with the following categories of recipients:'],
    list: [
      'Data Processors: Third-party service providers who process data on our behalf — including cloud infrastructure providers (self-hosted Supabase on our VPS), email delivery services (Resend), payment processors, and background-verification agencies. All processors are bound by written agreements ensuring equivalent data protection.',
      'Clients: Limited operational data (guard names, attendance status, patrol reports) shared with clients solely to fulfil contracted security service obligations.',
      'Government/regulatory authorities: Where required by law, court order, or regulatory direction — including PSARA licensing authorities, labour inspectors, tax authorities, and law enforcement.',
      'Professional advisors: Auditors, legal counsel, and consultants under confidentiality obligations.',
      'No cross-border transfer: All personal data is stored and processed within India. Our infrastructure is hosted on servers located in India. We do not transfer personal data outside India unless required by law or with your explicit consent.',
    ],
  },
  {
    heading: 'Data Retention (Sec. 8(7))',
    body: ['We retain personal data only as long as necessary for the purpose of collection or as required by law:'],
    list: [
      'Active employment data: Duration of employment plus 8 years (per statutory retention under EPF, ESI, and tax laws).',
      'Client service data: Duration of the service agreement plus 6 years (per Limitation Act, 1963 and GST law).',
      'Attendance and location logs: 90 days for real-time operations; aggregated records retained for 3 years.',
      'Session and security logs: 6 months.',
      'Consent records: Retained indefinitely as legal proof of consent (required by DPDP Act).',
      'Recruitment data (unsuccessful candidates): 1 year, then securely deleted.',
      'Website enquiries: 2 years unless converted to a client relationship.',
      'After the retention period, data is securely erased or irreversibly anonymised. Deletion is performed using cryptographic erasure or overwriting as appropriate.',
    ],
  },
  {
    heading: 'Rights of Data Principals (Sec. 11-14)',
    body: ['Under the DPDP Act, 2023, you have the following rights:'],
    list: [
      'Right to access (Sec. 11): Obtain a summary of your personal data being processed and the processing activities undertaken, in a clear and understandable manner.',
      'Right to correction and erasure (Sec. 12): Request correction of inaccurate/misleading data, completion of incomplete data, updating of outdated data, and erasure of data no longer necessary for the stated purpose.',
      'Right to grievance redressal (Sec. 13): Lodge a complaint with our Data Protection Officer. If unsatisfied with the resolution, escalate to the Data Protection Board of India.',
      'Right to nominate (Sec. 14): Nominate another individual to exercise your rights in the event of your death or incapacity.',
      'Right to withdraw consent (Sec. 6): Withdraw consent at any time with ease equal to the manner in which consent was given.',
    ],
  },
  {
    heading: 'Duties of Data Principal (Sec. 15)',
    body: ['As a Data Principal, you also have duties under the DPDP Act:'],
    list: [
      'Provide only authentic and accurate personal data when interacting with us.',
      'Do not impersonate another person or suppress material information when providing data.',
      'Do not register a frivolous or false grievance or complaint with us or the Data Protection Board.',
      'Comply with applicable laws in exercising your rights.',
    ],
  },
  {
    heading: 'Data Security Measures (Sec. 8(4))',
    body: [
      'We implement reasonable security safeguards to protect personal data from unauthorized access, disclosure, alteration, or destruction. Our measures include:',
    ],
    list: [
      'Access controls: Role-based access (RBAC) ensuring personnel can only access data relevant to their function. Device-limit enforcement (max 2 sessions per user).',
      'Encryption: Data in transit protected via TLS 1.3. Sensitive fields (passwords) hashed using industry-standard algorithms.',
      'Authentication: Multi-factor authentication for admin accounts. Session management with HttpOnly cookies, CSRF protection, and automatic session expiry.',
      'Content protection: Copy/print/screenshot deterrence, digital watermarking for traceability, idle lockout, DevTools detection — for non-admin users.',
      'Infrastructure: Self-hosted Supabase on dedicated VPS within India. Row-Level Security (RLS) on all database tables. Regular security patching.',
      'Audit trails: All access and modifications logged with user identity, timestamp, and IP address.',
      'Incident response: Defined procedure for data breach notification — affected individuals and the Data Protection Board will be notified as required by the Act.',
      'Personnel security: All employees sign confidentiality agreements. Security awareness is part of onboarding.',
    ],
  },
  {
    heading: "Children's Data (Sec. 9)",
    body: [
      'Our services are not directed at individuals below 18 years of age. We do not knowingly collect or process the personal data of children.',
      'If processing data of a person below 18 becomes necessary (e.g., a dependent for insurance purposes), we will obtain verifiable consent from the parent or lawful guardian before processing.',
      'We do not engage in tracking, behavioral monitoring, or targeted advertising directed at children.',
    ],
  },
  {
    heading: 'Cookies and Tracking Technologies',
    body: ['Our website uses the following technologies:'],
    list: [
      'Essential cookies: Required for site functionality (session management, security tokens). These operate on legitimate interest and cannot be disabled.',
      'Analytics: Vercel Analytics and Speed Insights collect aggregated, anonymised performance data. No personally identifiable information is collected through these tools.',
      'Cloudflare Turnstile: Used on contact forms for bot protection. Processes device signals temporarily; no personal data is stored.',
      'No third-party advertising or tracking cookies are used on our website.',
      'You can manage cookies through your browser settings. Disabling essential cookies may impair site functionality.',
    ],
  },
  {
    heading: 'Changes to This Policy',
    body: [
      'We may update this Privacy Policy from time to time. Changes will be posted on this page with a revised "Last updated" date. For material changes that affect how we process your data, we will provide reasonable notice (e.g., a banner on our website or re-consent prompt in the portal).',
      'The current version of this Policy always supersedes previous versions. We encourage you to review this page periodically.',
    ],
  },
  {
    heading: 'Grievance Officer & Contact (Sec. 13)',
    body: [
      'In accordance with Section 13 of the DPDP Act, 2023, and Rule 3(11) of the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, we have appointed a Grievance Officer:',
      'Name: Sangram Adhikary\nDesignation: Data Protection Officer & Grievance Officer\nEmail: dpo@safends.com\nAlternate email: grievance@safends.com\nPhone: +91 674 XXX XXXX',
      'Address: Safend Secure Solutions Pvt. Ltd., Bhubaneswar, Odisha, India.',
      'Response timeline: We will acknowledge your complaint within 48 hours and provide a resolution within 30 days of receipt, as mandated by law.',
      'If you are not satisfied with our resolution, you may escalate your complaint to the Data Protection Board of India (once constituted and operational) as per Sec. 13 of the DPDP Act.',
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', url: '/' },
          { name: 'Privacy Policy', url: '/privacy-policy' },
        ])}
      />
      <LegalDocument
        kicker="Legal — Data Protection"
        title="Privacy Policy"
        intro="How Safend Secure Solutions collects, processes, and protects your Digital Personal Data — in full compliance with India's Digital Personal Data Protection Act, 2023 (DPDP Act), the Information Technology Act, 2000, and applicable rules."
        lastUpdated={LAST_UPDATED}
        sections={SECTIONS}
      />
    </>
  );
}
