'use client';

import { supabaseClient } from '@/integrations/supabase/client';
import { triggerAgreementsRefresh } from '@/utils/dataRefresh';

export interface Agreement {
  id?: string;
  agreementId?: string;
  linkedQuoteId: string;
  quotationRef?: string;
  leadId?: string;
  clientName: string;
  contactPerson?: string;
  companyName?: string;
  contactEmail?: string;
  clientEmail?: string;
  contactPhone?: string;
  clientPhone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  serviceDetails: string;
  value: string;
  status: string;
  posts?: Array<any>;
  complianceInfo?: any;
  signedOn?: string;
  validUntil?: string;
  legalTerms?: any;
  paymentTerms?: any;
  companySignatory?: string;
  companySignatoryDesignation?: string;
  clientSignatory?: string;
  clientSignatoryDesignation?: string;
  createdAt?: Date;
  updatedAt?: Date;
  signedDate?: Date;
  signedDocumentUrl?: string;
  documentUrl?: string;
  notes?: string;
  pendingUploadSince?: Date;
  pendingUploadBy?: string;
}

// Normalize status for display (convert lowercase to Title Case)
const normalizeStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    'draft': 'Draft',
    'pending_signature': 'Pending Signature',
    'pending_upload': 'Pending Upload',
    'signed': 'Signed',
    'active': 'Active',
    'completed': 'Completed',
    'terminated': 'Terminated',
    'renewed': 'Renewed',
    'expired': 'Expired',
  };
  return statusMap[status?.toLowerCase()] || status || 'Draft';
};

const mapRowToAgreement = (row: any): Agreement => ({
  id: row.id,
  agreementId: row.agreement_id,
  linkedQuoteId: row.quotation_ref || row.quotation_id || '', // prefer display ref
  quotationRef: row.quotation_ref || row.quotation_id || '',
  clientName: row.client_name || '',
  companyName: row.company_name || row.client_name,
  contactPerson: row.contact_person || '',
  contactEmail: row.client_email,
  clientEmail: row.client_email,
  contactPhone: row.client_phone,
  clientPhone: row.client_phone,
  address: row.client_address,
  city: row.client_city,
  state: row.client_state,
  pincode: row.client_pincode,
  serviceDetails: row.service_details || '',
  value: row.contract_value ? `₹${row.contract_value}` : '₹0',
  status: normalizeStatus(row.status),
  posts: row.posts || [],
  complianceInfo: row.compliance_info || {},
  legalTerms: row.legal_terms || {},
  paymentTerms: row.payment_terms ? { billingCycle: row.payment_terms } : {},
  signedOn: row.start_date,
  validUntil: row.end_date,
  companySignatory: row.company_signatory,
  companySignatoryDesignation: row.company_signatory_designation,
  clientSignatory: row.client_signatory,
  clientSignatoryDesignation: row.client_signatory_designation,
  documentUrl: row.document_url,
  signedDocumentUrl: row.document_url,
  signedDate: row.signed_at,
  notes: row.terms_conditions,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// Add a new agreement
export const addAgreement = async (agreement: Omit<Agreement, 'id'>) => {
  try {
    // Generate agreement ID if not provided
    const agreementId = agreement.agreementId || `AGR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    
    // Parse value to number
    const contractValue = parseFloat((agreement.value || '0').replace(/[₹,]/g, '')) || 0;
    
    const { data, error } = await supabaseClient
      .from('agreements')
      .insert({
        agreement_id: agreementId,
        quotation_id: null, // UUID FK — we don't have the UUID here, use quotation_ref for display ID
        quotation_ref: agreement.quotationRef || agreement.linkedQuoteId || null,
        client_name: agreement.clientName || agreement.companyName || '',
        company_name: agreement.companyName || agreement.clientName || '',
        contact_person: agreement.contactPerson || '',
        client_email: agreement.contactEmail || agreement.clientEmail,
        client_phone: agreement.contactPhone || agreement.clientPhone,
        client_address: agreement.address,
        client_city: agreement.city,
        client_state: agreement.state,
        client_pincode: agreement.pincode,
        service_details: agreement.serviceDetails || '',
        start_date: agreement.signedOn || null,
        end_date: agreement.validUntil || null,
        contract_value: contractValue,
        payment_terms: agreement.paymentTerms?.billingCycle || 'monthly',
        billing_cycle: agreement.paymentTerms?.billingCycle || 'monthly',
        posts: agreement.posts || [],
        compliance_info: agreement.complianceInfo || {},
        legal_terms: agreement.legalTerms || {},
        company_signatory: agreement.companySignatory,
        company_signatory_designation: agreement.companySignatoryDesignation,
        client_signatory: agreement.clientSignatory,
        client_signatory_designation: agreement.clientSignatoryDesignation,
        status: agreement.status || 'draft',
        document_url: agreement.documentUrl || agreement.signedDocumentUrl,
        terms_conditions: agreement.notes,
        created_by: localStorage.getItem('userName') || 'Admin',
      })
      .select('id')
      .single();

    if (error) {
      const msg = error.message || (error as any).details || (error as any).hint || (error as any).code || 'Unknown Supabase error';
      console.error('Error adding agreement:', msg, error);
      return { success: false, error: msg };
    }

    // Trigger manual refresh with small delay to ensure DB has committed
    setTimeout(() => triggerAgreementsRefresh(), 100);
    return { success: true, id: data.id };
  } catch (error) {
    console.error('Error adding agreement:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Update an existing agreement
export const updateAgreement = async (id: string, agreement: Partial<Agreement>) => {
  try {
    const updates: any = {};
    if (agreement.agreementId !== undefined) updates.agreement_id = agreement.agreementId;
    if (agreement.clientName !== undefined) updates.client_name = agreement.clientName;
    if (agreement.companyName !== undefined) updates.company_name = agreement.companyName;
    if (agreement.contactPerson !== undefined) updates.contact_person = agreement.contactPerson;
    if (agreement.contactEmail !== undefined) updates.client_email = agreement.contactEmail;
    if (agreement.contactPhone !== undefined) updates.client_phone = agreement.contactPhone;
    if (agreement.address !== undefined) updates.client_address = agreement.address;
    if (agreement.city !== undefined) updates.client_city = agreement.city;
    if (agreement.state !== undefined) updates.client_state = agreement.state;
    if (agreement.pincode !== undefined) updates.client_pincode = agreement.pincode;
    if (agreement.serviceDetails !== undefined) updates.service_details = agreement.serviceDetails;
    if (agreement.signedOn !== undefined) updates.start_date = agreement.signedOn;
    if (agreement.validUntil !== undefined) updates.end_date = agreement.validUntil;
    if (agreement.value !== undefined) {
      updates.contract_value = parseFloat((agreement.value || '0').replace(/[₹,]/g, '')) || 0;
    }
    if (agreement.status !== undefined) updates.status = agreement.status;
    if (agreement.documentUrl !== undefined) updates.document_url = agreement.documentUrl;
    if (agreement.signedDocumentUrl !== undefined) updates.document_url = agreement.signedDocumentUrl;
    if (agreement.signedDate !== undefined) updates.signed_at = agreement.signedDate;
    if (agreement.notes !== undefined) updates.terms_conditions = agreement.notes;
    if (agreement.posts !== undefined) updates.posts = agreement.posts;
    if (agreement.complianceInfo !== undefined) updates.compliance_info = agreement.complianceInfo;
    if (agreement.legalTerms !== undefined) updates.legal_terms = agreement.legalTerms;
    if (agreement.companySignatory !== undefined) updates.company_signatory = agreement.companySignatory;
    if (agreement.companySignatoryDesignation !== undefined) updates.company_signatory_designation = agreement.companySignatoryDesignation;
    if (agreement.clientSignatory !== undefined) updates.client_signatory = agreement.clientSignatory;
    if (agreement.clientSignatoryDesignation !== undefined) updates.client_signatory_designation = agreement.clientSignatoryDesignation;
    if (agreement.pendingUploadSince !== undefined) updates.pending_upload_since = agreement.pendingUploadSince;
    if (agreement.pendingUploadBy !== undefined) updates.pending_upload_by = agreement.pendingUploadBy;

    const { error } = await supabaseClient
      .from('agreements')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating agreement:', error);
      return { success: false, error: error.message };
    }

    // Trigger manual refresh with small delay to ensure DB has committed
    setTimeout(() => triggerAgreementsRefresh(), 100);
    return { success: true };
  } catch (error) {
    console.error('Error updating agreement:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Delete an agreement
export const deleteAgreement = async (id: string) => {
  try {
    if (!id || id.trim() === '') {
      return { success: false, error: 'Invalid agreement ID' };
    }

    const { error } = await supabaseClient
      .from('agreements')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting agreement:', error);
      return { success: false, error: error.message };
    }

    // Trigger manual refresh with small delay to ensure DB has committed
    setTimeout(() => triggerAgreementsRefresh(), 100);
    return { success: true };
  } catch (error) {
    console.error('Error deleting agreement:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Get all agreements
export const getAgreements = async () => {
  try {
    const { data, error } = await supabaseClient
      .from('agreements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error getting agreements:', error);
      return { success: false, error: error.message, data: [] };
    }

    // Filter out deleted agreements after mapping (to handle case-insensitive comparison)
    const mappedData = (data || []).map(mapRowToAgreement).filter(a => a.status !== 'Deleted');
    return { success: true, data: mappedData };
  } catch (error) {
    console.error('Error getting agreements:', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

// Subscribe to real-time agreement updates
export const subscribeToAgreements = (callback: (agreements: Agreement[]) => void) => {
  // Initial fetch
  getAgreements().then(result => {
    if (result.success) callback(result.data);
  });

  // Real-time subscription
  const channel = supabaseClient
    .channel('agreements-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agreements' }, () => {
      getAgreements().then(result => {
        if (result.success) callback(result.data);
      });
    })
    .subscribe();

  return () => {
    supabaseClient.removeChannel(channel);
  };
};
