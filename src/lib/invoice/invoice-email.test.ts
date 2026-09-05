import { describe, expect, it } from 'vitest';
import {
  buildInvoiceEmailHtml,
  buildInvoiceEmailText,
  buildInvoiceEmailSubject,
  ENCLOSURE_LABELS,
} from './invoice-email';

const base = {
  clientName: 'M/S ODYSSEY ADVANCED TELEMETICS SYSTEMS',
  invoiceNo: '26270056',
  invoiceValue: 17700,
  taxable: 15000,
  gst: 2700,
  dueDate: '2026-09-12',
  servicePeriod: '01 Aug 2026 – 31 Aug 2026',
};

describe('buildInvoiceEmailSubject', () => {
  it('includes the invoice number and company', () => {
    expect(buildInvoiceEmailSubject('26270056')).toContain('26270056');
    expect(buildInvoiceEmailSubject('26270056')).toContain('Safend');
  });
});

describe('buildInvoiceEmailHtml — responsive shell', () => {
  it('is fluid with a max-width and carries mobile media queries', () => {
    const html = buildInvoiceEmailHtml(base);
    expect(html).toContain('max-width:600px');
    expect(html).toContain('@media only screen and (max-width:600px)');
    expect(html).toContain('@media only screen and (max-width:400px)');
    expect(html).toContain('name="viewport"');
  });

  it('renders the invoice summary values', () => {
    const html = buildInvoiceEmailHtml(base);
    expect(html).toContain('26270056');
    expect(html).toContain('₹17,700'); // Indian grouping
    expect(html).toContain('₹15,000');
    expect(html).toContain('₹2,700');
  });
});

describe('content adapts to attachments (enclosures)', () => {
  it('invoice only: no "Documents Enclosed" section and a simple intro', () => {
    const html = buildInvoiceEmailHtml({
      ...base,
      enclosures: [{ kind: 'invoice', filename: 'Invoice_26270056.pdf' }],
    });
    expect(html).not.toContain('Documents Enclosed');
    expect(html).toContain('for your kind reference.');
  });

  it('lists a single extra document and names it in the intro', () => {
    const html = buildInvoiceEmailHtml({
      ...base,
      enclosures: [
        { kind: 'invoice', filename: 'Invoice_26270056.pdf' },
        { kind: 'rota', filename: 'rota-aug.pdf' },
      ],
    });
    expect(html).toContain('Documents Enclosed');
    expect(html).toContain(ENCLOSURE_LABELS.rota.label);
    expect(html).toContain('rota-aug.pdf');
    expect(html).toContain(`along with the ${ENCLOSURE_LABELS.rota.label}`);
  });

  it('joins multiple extra documents with commas and "and"', () => {
    const html = buildInvoiceEmailHtml({
      ...base,
      enclosures: [
        { kind: 'invoice', filename: 'Invoice.pdf' },
        { kind: 'rota', filename: 'rota.pdf' },
        { kind: 'epf', filename: 'epf.pdf' },
        { kind: 'esic', filename: 'esic.pdf' },
      ],
    });
    expect(html).toContain(`${ENCLOSURE_LABELS.rota.label}, ${ENCLOSURE_LABELS.epf.label} and ${ENCLOSURE_LABELS.esic.label}`);
    expect(html).toContain('epf.pdf');
    expect(html).toContain('esic.pdf');
  });

  it('plain text mirrors the enclosures', () => {
    const text = buildInvoiceEmailText({
      ...base,
      enclosures: [
        { kind: 'invoice', filename: 'Invoice.pdf' },
        { kind: 'epf', filename: 'epf-aug.pdf' },
      ],
    });
    expect(text).toContain('Documents Enclosed:');
    expect(text).toContain(`${ENCLOSURE_LABELS.epf.label}: epf-aug.pdf`);
    expect(text).toContain(`along with the ${ENCLOSURE_LABELS.epf.label}`);
  });

  it('plain text keeps intentional blank lines (paragraph breaks)', () => {
    const text = buildInvoiceEmailText(base);
    expect(text).toContain('\n\n');
  });

  it('omits optional rows when values are absent', () => {
    const text = buildInvoiceEmailText({
      clientName: null,
      invoiceNo: 'X1',
      invoiceValue: 100,
    });
    expect(text).toContain('Dear Sir/Madam,');
    expect(text).not.toContain('Taxable Value');
    expect(text).not.toContain('Service Period');
  });
});
