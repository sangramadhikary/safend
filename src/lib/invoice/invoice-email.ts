/**
 * Builds the HTML + plain-text body for the "email this invoice" action.
 *
 * The markup is intentionally table-based with fully inline styles: email
 * clients (Outlook in particular) ignore <style> blocks, flexbox and modern CSS,
 * so a clean, professional look has to be achieved with tables, inline styles
 * and web-safe fonts. Kept framework-free so it can be unit-tested in isolation.
 */

import { formatINR } from '@/lib/format';

/** Document categories that can accompany an invoice email. */
export type EnclosureKind = 'invoice' | 'rota' | 'epf' | 'esic' | 'other';

/** Human labels + descriptions for each enclosure category. */
export const ENCLOSURE_LABELS: Record<EnclosureKind, { label: string; blurb: string }> = {
  invoice: { label: 'Tax Invoice', blurb: 'GST tax invoice for the service period' },
  rota: { label: 'Duty Rota', blurb: 'Deployment roster / duty chart for the billed period' },
  epf: { label: 'EPF Challan', blurb: 'Provident Fund remittance challan (statutory proof)' },
  esic: { label: 'ESIC Challan', blurb: 'Employees State Insurance remittance challan (statutory proof)' },
  other: { label: 'Supporting Document', blurb: 'Additional document as requested' },
};

/** One enclosed document, as listed in the email body. */
export interface EmailEnclosure {
  kind: EnclosureKind;
  filename: string;
}

export interface InvoiceEmailInput {
  clientName: string | null;
  invoiceNo: string;
  invoiceValue: number;
  taxable?: number | null;
  gst?: number | null;
  dueDate?: string | null;
  servicePeriod?: string | null;
  /** Attached documents — drives the "Documents Enclosed" section. */
  enclosures?: EmailEnclosure[];
}

const BRAND = '#D71920';
const INK = '#1a1a1a';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const BG = '#f4f5f7';

const COMPANY = {
  name: 'Safend Secure Solutions Private Limited',
  email: 'accounts@safends.com',
  phone: '9777023934',
  bankName: 'Axis Bank',
  accountNo: '921020000544081',
  ifsc: 'UTIB0000091',
  beneficiary: 'Safend Secure Solutions Private Limited',
};

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * A single label/value row in the summary table.
 *  - `last`  drops the bottom divider (so the card doesn't end on a line).
 *  - `total` renders the row as a highlighted band (the invoice value).
 */
function summaryRow(
  label: string,
  value: string,
  opts?: { total?: boolean; last?: boolean },
): string {
  const divider = opts?.last || opts?.total ? '' : `border-bottom:1px solid ${LINE};`;
  const vPad = opts?.total ? '14px' : '11px';
  const rowBg = opts?.total ? 'background:#fdf2f3;' : '';
  const valClass = opts?.total ? 'sf-value sf-value-strong' : 'sf-value';
  const labelStyle =
    `font-size:${opts?.total ? '14px' : '13px'};` +
    `font-weight:${opts?.total ? '700' : '400'};` +
    `color:${opts?.total ? INK : MUTED};` +
    `text-align:left;padding:${vPad} 16px;${divider}${rowBg}`;
  const valStyle =
    `font-size:${opts?.total ? '18px' : '14px'};` +
    `font-weight:${opts?.total ? '700' : '600'};` +
    `color:${opts?.total ? BRAND : INK};` +
    `text-align:right;padding:${vPad} 16px;${divider}${rowBg}`;
  return `<tr><td class="sf-cell" style="${labelStyle}">${label}</td><td class="${valClass}" style="${valStyle}">${value}</td></tr>`;
}

/**
 * "Documents Enclosed" block — only rendered when something beyond the invoice
 * is attached, so a plain invoice email stays clean.
 */
function enclosuresBlock(enclosures: EmailEnclosure[]): string {
  // Nothing to list, or only the invoice itself — the intro already states the
  // invoice is attached, so a one-row "enclosures" table would be noise.
  if (enclosures.filter((e) => e.kind !== 'invoice').length === 0) return '';
  const listed = enclosures.filter((e) => e.kind !== 'invoice');
  const items = listed
    .map((e, i) => {
      const meta = ENCLOSURE_LABELS[e.kind] || ENCLOSURE_LABELS.other;
      const divider = i < listed.length - 1 ? `border-bottom:1px solid ${LINE};` : '';
      return `<tr>
        <td valign="middle" style="padding:12px 14px;width:34px;${divider}">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${BRAND};"></span>
        </td>
        <td valign="middle" style="padding:12px 14px 12px 0;${divider}">
          <div class="sf-cell" style="font-size:13px;font-weight:600;color:${INK};">${meta.label}</div>
          <div style="font-size:11px;color:${MUTED};margin-top:2px;word-break:break-all;">${e.filename}</div>
        </td>
      </tr>`;
    })
    .join('');

  return `
    <p style="margin:28px 0 10px;font-size:13px;font-weight:700;color:${INK};text-transform:uppercase;letter-spacing:0.4px;">Documents Enclosed</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="sf-summary"
           style="border:1px solid ${LINE};border-radius:12px;overflow:hidden;background:#ffffff;">
      ${items}
    </table>`;
}

/** The professional HTML email body. */
export function buildInvoiceEmailHtml(input: InvoiceEmailInput): string {
  const greetingName = input.clientName?.trim() || 'Sir/Madam';
  const enclosures = input.enclosures ?? [];
  // Mention the extra paperwork in the opening line when it is present.
  const extras = enclosures.filter((e) => e.kind !== 'invoice');
  const extraNames = Array.from(new Set(extras.map((e) => (ENCLOSURE_LABELS[e.kind] || ENCLOSURE_LABELS.other).label)));
  const intro = extraNames.length > 0
    ? `Please find attached our tax invoice <strong style="color:${INK};">${input.invoiceNo}</strong>, along with the ${
        extraNames.length === 1
          ? extraNames[0]
          : `${extraNames.slice(0, -1).join(', ')} and ${extraNames[extraNames.length - 1]}`
      } for your kind reference and records.`
    : `Please find attached our tax invoice <strong style="color:${INK};">${input.invoiceNo}</strong> for your kind reference.`;
  const rows: string[] = [
    summaryRow('Invoice Number', input.invoiceNo),
    input.servicePeriod ? summaryRow('Service Period', input.servicePeriod) : '',
    typeof input.taxable === 'number' && input.taxable > 0 ? summaryRow('Taxable Value', formatINR(input.taxable)) : '',
    typeof input.gst === 'number' && input.gst > 0 ? summaryRow('GST', formatINR(input.gst)) : '',
    summaryRow('Due Date', fmtDate(input.dueDate), { last: true }),
    summaryRow('Invoice Value', formatINR(input.invoiceValue), { total: true }),
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <style>
    /* Mobile-responsive overrides. Email clients that support media queries
       (iOS Mail, Gmail app, Outlook mobile, Apple Mail) apply these; older
       desktop clients fall back to the inline styles below. */
    body { width:100% !important; margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { border-collapse:collapse; }
    img { border:0; line-height:100%; outline:none; text-decoration:none; }
    a { color:${BRAND}; }
    /* Phones: edge-to-edge card, tighter padding, slightly smaller type. */
    @media only screen and (max-width:600px) {
      .sf-outer { padding:0 !important; }
      .sf-gutter { padding:0 !important; }
      .sf-container { width:100% !important; max-width:100% !important; border-radius:0 !important; border-left:0 !important; border-right:0 !important; }
      .sf-pad { padding:20px !important; }
      .sf-header { padding:20px !important; }
      .sf-title { font-size:17px !important; line-height:1.3 !important; }
      .sf-cell { font-size:13px !important; }
      .sf-value { font-size:13px !important; }
      .sf-value-strong { font-size:15px !important; }
      /* Bank details: let the label column shrink so values never get squeezed. */
      .sf-bank-label { width:96px !important; font-size:12px !important; }
      .sf-bank-value { font-size:12px !important; word-break:break-word !important; }
    }
    /* Very small phones. */
    @media only screen and (max-width:400px) {
      .sf-pad { padding:16px !important; }
      .sf-header { padding:16px !important; }
      .sf-title { font-size:16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${BG};width:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="sf-outer" style="background:${BG};padding:24px 0;">
    <tr><td align="center" class="sf-gutter" style="padding:0 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="sf-container" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${LINE};font-family:Segoe UI,Arial,Helvetica,sans-serif;">

        <!-- Header -->
        <tr><td class="sf-header" style="background:${BRAND};padding:28px 32px;">
          <div class="sf-title" style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.3px;">${COMPANY.name}</div>
          <div style="color:#ffffff;opacity:0.85;font-size:12px;margin-top:4px;">Tax Invoice · Statement of Account</div>
        </td></tr>

        <!-- Body -->
        <tr><td class="sf-pad" style="padding:32px;">
          <p style="margin:0 0 4px;font-size:15px;color:${INK};">Dear ${greetingName},</p>
          <p class="sf-cell" style="margin:12px 0 24px;font-size:14px;line-height:1.6;color:${MUTED};">
            ${intro} A summary is provided below.
          </p>

          <!-- Summary card -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="sf-summary"
                 style="border:1px solid ${LINE};border-radius:12px;overflow:hidden;background:#ffffff;">
            ${rows.join('')}
          </table>

          ${enclosuresBlock(enclosures)}

          <!-- Bank details -->
          <p style="margin:28px 0 8px;font-size:13px;font-weight:700;color:${INK};text-transform:uppercase;letter-spacing:0.4px;">Bank Details for Payment</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:${INK};">
            <tr><td class="sf-bank-label" style="padding:3px 0;color:${MUTED};width:120px;">Bank</td><td class="sf-bank-value" style="padding:3px 0;">${COMPANY.bankName}</td></tr>
            <tr><td class="sf-bank-label" style="padding:3px 0;color:${MUTED};">A/c Number</td><td class="sf-bank-value" style="padding:3px 0;">${COMPANY.accountNo}</td></tr>
            <tr><td class="sf-bank-label" style="padding:3px 0;color:${MUTED};">IFSC</td><td class="sf-bank-value" style="padding:3px 0;">${COMPANY.ifsc}</td></tr>
            <tr><td class="sf-bank-label" style="padding:3px 0;color:${MUTED};">Beneficiary</td><td class="sf-bank-value" style="padding:3px 0;">${COMPANY.beneficiary}</td></tr>
          </table>

          <p style="margin:26px 0 0;font-size:14px;line-height:1.6;color:${MUTED};">
            Kindly arrange the payment at your earliest convenience. For any queries regarding this invoice,
            please reply to this email or contact our accounts team.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td class="sf-pad" style="background:#fafafa;border-top:1px solid ${LINE};padding:20px 32px;">
          <div style="font-size:13px;font-weight:600;color:${INK};">${COMPANY.name}</div>
          <div style="font-size:12px;color:${MUTED};margin-top:4px;">
            ${COMPANY.email} &nbsp;·&nbsp; ${COMPANY.phone}
          </div>
          <div style="font-size:11px;color:${MUTED};margin-top:10px;">
            This is a statement of account. GST is charged only on the taxable value shown on the attached tax invoice.
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Plain-text fallback for clients that don't render HTML. */
export function buildInvoiceEmailText(input: InvoiceEmailInput): string {
  const greetingName = input.clientName?.trim() || 'Sir/Madam';
  const enclosures = input.enclosures ?? [];
  const extras = enclosures.filter((e) => e.kind !== 'invoice');
  const extraNames = Array.from(new Set(extras.map((e) => (ENCLOSURE_LABELS[e.kind] || ENCLOSURE_LABELS.other).label)));
  const intro = extraNames.length > 0
    ? `Please find attached our tax invoice ${input.invoiceNo}, along with the ${
        extraNames.length === 1
          ? extraNames[0]
          : `${extraNames.slice(0, -1).join(', ')} and ${extraNames[extraNames.length - 1]}`
      } for your kind reference and records.`
    : `Please find attached our tax invoice ${input.invoiceNo} for your kind reference.`;
  // Only list enclosures when something beyond the invoice is attached.
  const enclosureLines = extras.length > 0
    ? ['Documents Enclosed:', ...enclosures.map((e) => `  - ${(ENCLOSURE_LABELS[e.kind] || ENCLOSURE_LABELS.other).label}: ${e.filename}`), '']
    : [];
  // `null` marks a conditionally-omitted line; empty strings are intentional
  // blank lines and must survive (an earlier version filtered both, which
  // collapsed every paragraph break).
  const lines: (string | null)[] = [
    `Dear ${greetingName},`,
    '',
    intro,
    '',
    `Invoice Number: ${input.invoiceNo}`,
    input.servicePeriod ? `Service Period: ${input.servicePeriod}` : null,
    typeof input.taxable === 'number' && input.taxable > 0 ? `Taxable Value: ${formatINR(input.taxable)}` : null,
    typeof input.gst === 'number' && input.gst > 0 ? `GST: ${formatINR(input.gst)}` : null,
    `Due Date: ${fmtDate(input.dueDate)}`,
    `Invoice Value: ${formatINR(input.invoiceValue)}`,
    '',
    ...enclosureLines,
    'Bank Details for Payment:',
    `  Bank: ${COMPANY.bankName}`,
    `  A/c Number: ${COMPANY.accountNo}`,
    `  IFSC: ${COMPANY.ifsc}`,
    `  Beneficiary: ${COMPANY.beneficiary}`,
    '',
    'Kindly arrange the payment at your earliest convenience.',
    '',
    'Thank you,',
    'Accounts Team',
    COMPANY.name,
    `${COMPANY.email} | ${COMPANY.phone}`,
  ];
  return lines.filter((l): l is string => l !== null).join('\n');
}

/** Subject line for the invoice email. */
export function buildInvoiceEmailSubject(invoiceNo: string): string {
  return `Invoice ${invoiceNo} - ${COMPANY.name}`;
}
