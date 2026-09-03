'use client';

import { Document, Paragraph, TextRun, AlignmentType, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

export interface QuotationData {
  id: string;
  quotationId?: string;
  client: string;
  companyName?: string;
  service: string;
  amount: string;
  date: string;
  validUntil: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  locations?: any[];
  securityServices?: any;
  serviceInstances?: any;
  gstNumber?: string;
  gstPercentage?: number;
  gstExempt?: boolean;
  shiftType?: string;
  // New fields for detailed quotation PDF
  laborInputs?: {
    dutyHours: number;
    standardWorkingDays: number;
    extraDays: number;
    extraHoursPerMonth: number;
    epfPercentage: number;
    esicPercentage: number;
    uniformAllowance: number;
    serviceChargePercentage: number;
  };
  roles?: Array<{ designation: string; minimumWage: number }>;
  contractTerms?: {
    proposalValidityDays: number;
    deploymentLeadTimeDays: number;
    contractDuration: string;
    terminationNoticePeriod: string;
  };
}

// Format date for documents (DD-MM-YYYY format for PDF)
const formatDocDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch {
    return dateStr;
  }
};

// Parse amount string to number
const parseAmount = (amount: string): number => {
  return parseFloat((amount || '0').replace(/[₹,\s]/g, '')) || 0;
};

/**
 * Submit a native HTML form to the PDF API route.
 * A native form POST is handled by the browser itself and CANNOT be
 * intercepted by Chrome extensions that monkey-patch fetch / XHR.
 *
 * @param target  '_blank' opens preview in a new tab; '' (hidden iframe) triggers download.
 */
function submitPDFForm(quotation: QuotationData, mode: 'preview' | 'download'): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/api/quotation-pdf';
  form.style.display = 'none';

  const payload = document.createElement('input');
  payload.type = 'hidden';
  payload.name = 'payload';
  payload.value = JSON.stringify(quotation);
  form.appendChild(payload);

  if (mode === 'preview') {
    // Open the generated PDF (inline) in a new browser tab
    form.target = '_blank';
  } else {
    // Force download via Content-Disposition: attachment, using a hidden iframe
    const flag = document.createElement('input');
    flag.type = 'hidden';
    flag.name = 'download';
    flag.value = '1';
    form.appendChild(flag);

    const iframeName = `pdf_dl_${Date.now()}`;
    const iframe = document.createElement('iframe');
    iframe.name = iframeName;
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    form.target = iframeName;
    // Clean up the iframe after the download has had time to start
    setTimeout(() => iframe.remove(), 60_000);
  }

  document.body.appendChild(form);
  form.submit();
  form.remove();
}

export class QuotationDocumentService {

  // ─── PDF Download (native form POST → /api/quotation-pdf) ───────────
  static async generatePDFDocument(quotation: QuotationData): Promise<void> {
    submitPDFForm(quotation, 'download');
  }

  // ─── PDF Preview in new tab (native form POST → /api/quotation-pdf) ─
  static async previewPDF(quotation: QuotationData): Promise<void> {
    submitPDFForm(quotation, 'preview');
  }

  // ─── Word Document Generation (kept with docx library) ─────────────
  static async generateWordDocument(quotation: QuotationData): Promise<void> {
    const total = parseAmount(quotation.amount);
    const gstPct = quotation.gstPercentage ?? 18;
    const subtotal = quotation.gstExempt ? total : total / (1 + gstPct / 100);
    const gstAmount = total - subtotal;

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // Header
          new Paragraph({
            text: "Safend Secure Solutions Pvt. Ltd.",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 }
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Plot No. 548, Urali Gopalpur, Cuttack Sadar, Odisha – 753011", size: 18, color: "666666" }),
            ],
            spacing: { after: 300 }
          }),

          // Title
          new Paragraph({
            text: "QUOTATION",
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 }
          }),

          // Quotation meta
          new Paragraph({ children: [new TextRun({ text: "Ref No: ", bold: true }), new TextRun(quotation.quotationId || quotation.id)], spacing: { after: 80 } }),
          new Paragraph({ children: [new TextRun({ text: "Date: ", bold: true }), new TextRun(formatDocDate(quotation.date))], spacing: { after: 80 } }),
          new Paragraph({ children: [new TextRun({ text: "Valid Until: ", bold: true }), new TextRun(formatDocDate(quotation.validUntil))], spacing: { after: 300 } }),

          // Client Details
          new Paragraph({ text: "Client Details", heading: HeadingLevel.HEADING_3, spacing: { after: 150 } }),
          new Paragraph({ children: [new TextRun({ text: "Company: ", bold: true }), new TextRun(quotation.companyName || quotation.client)], spacing: { after: 80 } }),
          new Paragraph({ children: [new TextRun({ text: "Contact Person: ", bold: true }), new TextRun(quotation.contactPerson || "N/A")], spacing: { after: 80 } }),
          new Paragraph({ children: [new TextRun({ text: "Phone: ", bold: true }), new TextRun(quotation.contactPhone || "N/A")], spacing: { after: 80 } }),
          new Paragraph({ children: [new TextRun({ text: "Email: ", bold: true }), new TextRun(quotation.contactEmail || "N/A")], spacing: { after: 80 } }),
          new Paragraph({ children: [new TextRun({ text: "Address: ", bold: true }), new TextRun([quotation.address, quotation.city, quotation.state, quotation.pincode].filter(Boolean).join(', ') || "N/A")], spacing: { after: 300 } }),

          // Service
          new Paragraph({ text: "Service Proposal", heading: HeadingLevel.HEADING_3, spacing: { after: 150 } }),
          new Paragraph({ text: quotation.service, spacing: { after: 300 } }),

          // Pricing
          new Paragraph({ text: "Pricing", heading: HeadingLevel.HEADING_3, spacing: { after: 150 } }),
          new Paragraph({ children: [new TextRun({ text: "Subtotal: ", bold: true }), new TextRun(`₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`)], spacing: { after: 80 } }),
          ...(!quotation.gstExempt ? [
            new Paragraph({ children: [new TextRun({ text: `GST (${gstPct}%): `, bold: true }), new TextRun(`₹${gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`)], spacing: { after: 80 } }),
          ] : []),
          new Paragraph({ children: [new TextRun({ text: "Total Amount: ", bold: true, size: 28 }), new TextRun({ text: quotation.amount, bold: true, size: 28, color: "DC2626" })], spacing: { after: 80 } }),
          ...(quotation.gstNumber ? [new Paragraph({ children: [new TextRun({ text: "GST No: ", bold: true }), new TextRun(quotation.gstNumber)], spacing: { after: 300 } })] : []),

          // Terms
          new Paragraph({ text: "Terms & Conditions", heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 150 } }),
          new Paragraph({ text: "• All personnel provided will be trained and identity verified.", spacing: { after: 60 } }),
          new Paragraph({ text: "• Service rates may vary as per additional manpower or shift adjustments.", spacing: { after: 60 } }),
          new Paragraph({ text: "• Payment due monthly unless otherwise stated.", spacing: { after: 60 } }),
          new Paragraph({ text: "• This quotation is valid until the date mentioned above.", spacing: { after: 300 } }),

          // Signature
          new Paragraph({ text: "", spacing: { before: 400 } }),
          new Paragraph({ children: [new TextRun({ text: "Authorized Signatory", italics: true })], spacing: { after: 80 } }),
          new Paragraph({ children: [new TextRun({ text: "Safend Secure Solutions Pvt. Ltd.", bold: true })] }),
        ]
      }]
    });

    const { Packer } = await import('docx');
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Quotation_${quotation.quotationId || quotation.id}.docx`);
  }
}
