'use client';

/**
 * Compliance Export Utilities
 * Multi-format export: CSV, Excel (CSV with BOM), JSON, PDF
 */

export interface GSTOutwardEntry {
  client_name: string | null;
  description: string;
  amount: number;
  gst_amount: number;
  total_amount: number;
  created_at: string;
  status: string;
}

export interface GSTInwardEntry {
  vendor_name: string | null;
  description: string;
  amount: number;
  gst_amount: number;
  total_amount: number;
  created_at: string;
  status: string;
}

export interface EmployeeComplianceEntry {
  id: string;
  name: string;
  salary: number;
  gross_salary?: number;
  designation?: string;
  epf_employee: number;
  epf_employer: number;
  esic_employee: number;
  esic_employer: number;
  pt_amount: number;
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCSV(value: any): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ─── GENERIC MULTI-FORMAT EXPORTS ───────────────────────────────────────────

export function exportToCSV(data: any[], filename: string): void {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => escapeCSV(row[h])).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

export function exportToJSON(data: any[], filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.json') ? filename : `${filename}.json`);
}

export function exportToExcel(data: any[], filename: string, _sheetName?: string): void {
  // Generate a well-formatted CSV with BOM that Excel opens correctly
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => escapeCSV(row[h])).join('\t'));
  const tsv = [headers.join('\t'), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + tsv], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function exportToPDF(data: any[], filename: string, title: string): void {
  // Generate a printable HTML and trigger print-to-PDF
  if (!data.length) return;
  const headers = Object.keys(data[0]);

  const tableRows = data.map(row =>
    `<tr>${headers.map(h => `<td style="border:1px solid #ddd;padding:6px 8px;font-size:11px;">${row[h] ?? ''}</td>`).join('')}</tr>`
  ).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; color: #333; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .meta { font-size: 11px; color: #666; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th { border: 1px solid #ddd; padding: 8px; background: #f5f5f5; font-size: 11px; font-weight: 600; text-align: left; }
        td { font-size: 11px; }
        .footer { margin-top: 20px; border-top: 1px solid #eee; padding-top: 8px; font-size: 10px; color: #999; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <div class="meta">Generated: ${new Date().toLocaleString('en-IN')} | Total Records: ${data.length}</div>
      <table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="footer">This document was generated from Safend Compliance Module. Save as PDF using browser print dialog.</div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 400);
}

// ─── SPECIALIZED GST EXPORT ─────────────────────────────────────────────────

export function exportGSTToCSV(
  outwardData: GSTOutwardEntry[],
  inwardData: GSTInwardEntry[],
  period: string
): void {
  const lines: string[] = [];

  lines.push('GST Compliance Report');
  lines.push(`Period: ${period}`);
  lines.push(`Generated: ${new Date().toLocaleDateString('en-IN')}`);
  lines.push('');

  // GSTR-1 (Outward Supplies)
  lines.push('GSTR-1 - Outward Supplies (Sales)');
  lines.push('Client Name,Invoice/Description,Taxable Amount,GST Amount,Total Amount,Date,Status');
  outwardData.forEach(e => {
    lines.push([
      escapeCSV(e.client_name || 'N/A'),
      escapeCSV(e.description),
      e.amount,
      e.gst_amount,
      e.total_amount,
      new Date(e.created_at).toLocaleDateString('en-IN'),
      e.status,
    ].join(','));
  });
  const totalOutGST = outwardData.reduce((s, e) => s + e.gst_amount, 0);
  lines.push('');

  // ITC Register (Inward)
  lines.push('ITC Register - Inward Supplies (Purchases)');
  lines.push('Vendor Name,Description,Taxable Amount,GST Amount (ITC),Total Amount,Date,Status');
  inwardData.forEach(e => {
    lines.push([
      escapeCSV(e.vendor_name || 'N/A'),
      escapeCSV(e.description),
      e.amount,
      e.gst_amount,
      e.total_amount,
      new Date(e.created_at).toLocaleDateString('en-IN'),
      e.status,
    ].join(','));
  });
  const totalInGST = inwardData.reduce((s, e) => s + e.gst_amount, 0);
  lines.push('');

  // GSTR-3B Summary
  lines.push('GSTR-3B Summary');
  lines.push('Particulars,Amount');
  lines.push(`GST Output (Collected),${totalOutGST}`);
  lines.push(`Less: ITC (Input Tax Credit),${totalInGST}`);
  lines.push(`Net GST Payable,${totalOutGST - totalInGST}`);

  const filename = `GST_Report_${period.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

export function exportEPFESICToCSV(
  employees: EmployeeComplianceEntry[],
  period: string
): void {
  const lines: string[] = [];

  lines.push('EPF / ESIC / PT Compliance Report');
  lines.push(`Period: ${period}`);
  lines.push(`Generated: ${new Date().toLocaleDateString('en-IN')}`);
  lines.push('');

  lines.push('Employee Name,Basic/Salary,EPF (Employee 12%),EPF (Employer 13%),ESIC (Employee 0.75%),ESIC (Employer 3.25%),Professional Tax,Total Statutory');

  employees.forEach(e => {
    const totalStatutory = e.epf_employee + e.epf_employer + e.esic_employee + e.esic_employer + e.pt_amount;
    lines.push([
      escapeCSV(e.name),
      e.salary,
      e.epf_employee.toFixed(0),
      e.epf_employer.toFixed(0),
      e.esic_employee.toFixed(0),
      e.esic_employer.toFixed(0),
      e.pt_amount,
      totalStatutory.toFixed(0),
    ].join(','));
  });

  const filename = `EPFESIC_Report_${period.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

export function printComplianceReport(elementId: string): void {
  const element = document.getElementById(elementId);
  if (!element) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Compliance Report</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; padding: 20px; color: #333; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f5f5f5; font-weight: 600; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      ${element.innerHTML}
      <div style="margin-top: 24px; border-top: 1px solid #eee; padding-top: 8px; font-size: 11px; color: #999;">
        Generated on ${new Date().toLocaleString('en-IN')}
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
}
