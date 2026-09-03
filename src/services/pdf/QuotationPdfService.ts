'use client';

/**
 * Service for generating quotation PDFs
 */

const API_BASE_URL = 'http://localhost:3001';

export interface QuotationPdfData {
  id: string;
  client: string;
  service: string;
  date: string;
  validUntil: string;
  status: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  securityServices: {
    unarmedGuards: { count: number; rate: number };
    armedGuards: { count: number; rate: number };
    supervisors: { count: number; rate: number };
    patrolOfficers: { count: number; rate: number };
  };
  shiftType: string;
  shiftCount: number;
  locations: Array<{
    name: string;
    address: string;
    guards: number;
  }>;
  gstPercentage: number;
  gstNumber?: string;
  gstExempt: boolean;
  paymentTerms: string;
  termsAndConditions?: string;
  notes?: string;
}

/**
 * Generate and download quotation PDF
 */
export async function downloadQuotationPdf(quotationData: QuotationPdfData): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/quotation/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(quotationData),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to generate PDF');
    }
    
    // Get PDF blob
    const blob = await response.blob();
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Quotation_${quotationData.id}.pdf`;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error('❌ PDF download error:', error);
    throw error;
  }
}
