'use client';

import { Document, Paragraph, TextRun, AlignmentType, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

interface AgreementData {
  id: string;
  clientName: string;
  serviceDetails: string;
  value: string;
  status: string;
  createdAt?: any;
  linkedQuoteId?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
}

const formatDate = (d: any): string => {
  if (!d) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  try {
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return String(d); }
};

export class AgreementDocumentService {

  // ─── PDF Generation using @react-pdf/renderer ───────────────────────
  static async generatePDFDocument(agreement: AgreementData): Promise<void> {
    const [ReactPDF, React] = await Promise.all([
      import('@react-pdf/renderer'),
      import('react'),
    ]);
    const { Document: PDFDocument, Page, Text, View, StyleSheet, pdf } = ReactPDF;
    const createElement = React.createElement;

    const startDate = formatDate(agreement.createdAt);
    const endDate = formatDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

    const styles = StyleSheet.create({
      page: { padding: 50, fontSize: 10, fontFamily: 'Helvetica', color: '#1a1a1a' },
      header: { fontSize: 18, fontWeight: 'bold', color: '#dc2626', textAlign: 'center', marginBottom: 30 },
      centered: { textAlign: 'center', marginBottom: 8 },
      bold: { fontWeight: 'bold' },
      section: { fontSize: 13, fontWeight: 'bold', color: '#333', marginTop: 20, marginBottom: 10, borderBottom: '1px solid #eee', paddingBottom: 4 },
      row: { flexDirection: 'row', marginBottom: 5 },
      label: { fontWeight: 'bold', width: 140 },
      value: { flex: 1 },
      bullet: { marginBottom: 4, paddingLeft: 10 },
      signatureSection: { marginTop: 50, flexDirection: 'row', justifyContent: 'space-between' },
      signatureBox: { width: '40%' },
      signatureLine: { borderTop: '1px solid #333', marginTop: 50, paddingTop: 5 },
      signatureLabel: { fontSize: 8, color: '#666' },
      footer: { position: 'absolute', bottom: 40, left: 50, right: 50, textAlign: 'center', fontSize: 8, color: '#999' },
    });

    const doc = createElement(PDFDocument, {},
      createElement(Page, { size: 'A4', style: styles.page },
        createElement(Text, { style: styles.header }, 'SERVICE AGREEMENT'),
        createElement(Text, { style: styles.centered }, 'Between'),
        createElement(Text, { style: { ...styles.centered, fontWeight: 'bold' } }, 'Safend Security & Facility Management Pvt. Ltd. ("Service Provider")'),
        createElement(Text, { style: styles.centered }, 'and'),
        createElement(Text, { style: { ...styles.centered, fontWeight: 'bold', marginBottom: 25 } }, `${agreement.clientName} ("Client")`),

        createElement(View, { style: styles.row }, createElement(Text, { style: styles.label }, 'Agreement Ref:'), createElement(Text, { style: styles.value }, agreement.id)),
        createElement(View, { style: styles.row }, createElement(Text, { style: styles.label }, 'Effective Date:'), createElement(Text, { style: styles.value }, startDate)),
        createElement(View, { style: styles.row }, createElement(Text, { style: styles.label }, 'Valid Until:'), createElement(Text, { style: styles.value }, endDate)),
        createElement(View, { style: styles.row }, createElement(Text, { style: styles.label }, 'Linked Quotation:'), createElement(Text, { style: styles.value }, agreement.linkedQuoteId || 'N/A')),

        createElement(Text, { style: styles.section }, 'Scope of Services'),
        createElement(Text, { style: { marginBottom: 15 } }, agreement.serviceDetails || 'As per quotation and work order.'),

        createElement(Text, { style: styles.section }, 'Service Charges'),
        createElement(View, { style: styles.row }, createElement(Text, { style: styles.label }, 'Contract Value:'), createElement(Text, { style: { ...styles.value, fontWeight: 'bold', fontSize: 14, color: '#dc2626' } }, agreement.value)),
        createElement(View, { style: styles.row }, createElement(Text, { style: styles.label }, 'Billing Cycle:'), createElement(Text, { style: styles.value }, 'Monthly')),

        createElement(Text, { style: styles.section }, 'Responsibilities'),
        createElement(Text, { style: styles.bullet }, '• Service Provider will deploy trained, verified personnel and supervise operations.'),
        createElement(Text, { style: styles.bullet }, '• Client will provide facility access, coordination, and timely payments.'),
        createElement(Text, { style: styles.bullet }, '• Both parties agree to comply with applicable labor laws and PSARA regulations.'),

        createElement(Text, { style: styles.section }, 'Termination'),
        createElement(Text, {}, 'Either party may terminate this agreement with 30 days written notice.'),

        createElement(View, { style: styles.signatureSection },
          createElement(View, { style: styles.signatureBox },
            createElement(View, { style: styles.signatureLine }),
            createElement(Text, { style: styles.signatureLabel }, 'Service Provider\nSafend Security & Facility Management'),
          ),
          createElement(View, { style: styles.signatureBox },
            createElement(View, { style: styles.signatureLine }),
            createElement(Text, { style: styles.signatureLabel }, `Client\n${agreement.clientName}`),
          ),
        ),

        createElement(View, { style: styles.footer },
          createElement(Text, {}, 'This is a computer-generated agreement. Contact info@safend.in for queries.'),
        ),
      ),
    );

    const blob = await pdf(doc).toBlob();
    saveAs(blob, `Agreement_${agreement.id}.pdf`);
  }

  // ─── PDF Preview ────────────────────────────────────────────────────
  static async previewPDF(agreement: AgreementData): Promise<void> {
    const [ReactPDF, React] = await Promise.all([
      import('@react-pdf/renderer'),
      import('react'),
    ]);
    const { Document: PDFDocument, Page, Text, View, StyleSheet, pdf } = ReactPDF;
    const createElement = React.createElement;

    const styles = StyleSheet.create({
      page: { padding: 50, fontSize: 11, fontFamily: 'Helvetica' },
      header: { fontSize: 18, fontWeight: 'bold', color: '#dc2626', textAlign: 'center', marginBottom: 20 },
      row: { flexDirection: 'row', marginBottom: 6 },
      label: { fontWeight: 'bold', width: 130 },
      value: { flex: 1 },
    });

    const doc = createElement(PDFDocument, {},
      createElement(Page, { size: 'A4', style: styles.page },
        createElement(Text, { style: styles.header }, 'SERVICE AGREEMENT'),
        createElement(View, { style: styles.row }, createElement(Text, { style: styles.label }, 'Agreement Ref:'), createElement(Text, { style: styles.value }, agreement.id)),
        createElement(View, { style: styles.row }, createElement(Text, { style: styles.label }, 'Client:'), createElement(Text, { style: styles.value }, agreement.clientName)),
        createElement(View, { style: styles.row }, createElement(Text, { style: styles.label }, 'Service:'), createElement(Text, { style: styles.value }, agreement.serviceDetails)),
        createElement(View, { style: styles.row }, createElement(Text, { style: styles.label }, 'Value:'), createElement(Text, { style: styles.value }, agreement.value)),
        createElement(View, { style: styles.row }, createElement(Text, { style: styles.label }, 'Status:'), createElement(Text, { style: styles.value }, agreement.status)),
      ),
    );

    const blob = await pdf(doc).toBlob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  // ─── Word Document ──────────────────────────────────────────────────
  static async generateWordDocument(agreement: AgreementData): Promise<void> {
    const startDate = formatDate(agreement.createdAt);
    const endDate = formatDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({ text: "SERVICE AGREEMENT", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
          new Paragraph({ text: "Between", alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
          new Paragraph({ children: [new TextRun({ text: "Safend Security & Facility Management Pvt. Ltd.", bold: true }), new TextRun(' ("Service Provider")')], alignment: AlignmentType.CENTER, spacing: { after: 80 } }),
          new Paragraph({ text: "and", alignment: AlignmentType.CENTER, spacing: { after: 80 } }),
          new Paragraph({ children: [new TextRun({ text: agreement.clientName, bold: true }), new TextRun(' ("Client")')], alignment: AlignmentType.CENTER, spacing: { after: 300 } }),

          new Paragraph({ children: [new TextRun({ text: "Agreement Reference: ", bold: true }), new TextRun(agreement.id)], spacing: { after: 80 } }),
          new Paragraph({ children: [new TextRun({ text: "Effective Date: ", bold: true }), new TextRun(startDate)], spacing: { after: 80 } }),
          new Paragraph({ children: [new TextRun({ text: "Valid Until: ", bold: true }), new TextRun(endDate)], spacing: { after: 300 } }),

          new Paragraph({ text: "Scope of Services", heading: HeadingLevel.HEADING_2, spacing: { after: 150 } }),
          new Paragraph({ text: agreement.serviceDetails || 'As per quotation and work order.', spacing: { after: 300 } }),

          new Paragraph({ text: "Service Charges", heading: HeadingLevel.HEADING_2, spacing: { after: 150 } }),
          new Paragraph({ children: [new TextRun({ text: "Contract Value: ", bold: true }), new TextRun({ text: agreement.value, bold: true, size: 28 })], spacing: { after: 80 } }),
          new Paragraph({ children: [new TextRun({ text: "Billing Cycle: ", bold: true }), new TextRun("Monthly")], spacing: { after: 300 } }),

          new Paragraph({ text: "Responsibilities", heading: HeadingLevel.HEADING_2, spacing: { after: 150 } }),
          new Paragraph({ text: "• Service Provider will deploy trained, verified personnel and supervise operations.", spacing: { after: 60 } }),
          new Paragraph({ text: "• Client will provide facility access, coordination, and timely payments.", spacing: { after: 60 } }),
          new Paragraph({ text: "• Both parties agree to comply with applicable labor laws and PSARA regulations.", spacing: { after: 300 } }),

          new Paragraph({ text: "Termination", heading: HeadingLevel.HEADING_2, spacing: { after: 150 } }),
          new Paragraph({ text: "Either party may terminate this agreement with 30 days written notice.", spacing: { after: 400 } }),

          new Paragraph({ text: "Authorized Signatures", heading: HeadingLevel.HEADING_2, spacing: { after: 200 } }),
          new Paragraph({ text: "Service Provider: ___________________", spacing: { after: 150 } }),
          new Paragraph({ text: "Client: ___________________", spacing: { after: 150 } }),
          new Paragraph({ text: `Date: ${startDate}` }),
        ]
      }]
    });

    const { Packer } = await import('docx');
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Agreement_${agreement.id}.docx`);
  }
}
