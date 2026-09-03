'use client';

import { supabaseClient } from '@/integrations/supabase/client';
import { triggerQuotationsRefresh } from '@/utils/dataRefresh';
import { applyBranchScope, onBranchScopeChange, getBranchScope } from '@/utils/branchScope';

export interface Quotation {
  id?: string;
  quotationId?: string;
  leadId?: string;
  client: string;
  companyName?: string;
  service: string;
  amount?: string;
  status: string;
  date?: string;
  validUntil?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  locations?: any[];
  securityServices?: any;
  serviceInstances?: any;
  /** Per-post service instances keyed by post index ("0", "1", ...) */
  perPostServiceInstances?: Record<string, any>;
  shiftType?: string;
  gstNumber?: string;
  gstPercentage?: number;
  gstExempt?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Real quotations table columns (from live Supabase schema):
 *   id, quotation_id, client_id, lead_id, quotation_date,
 *   valid_until, total_amount, status, terms, notes,
 *   created_by, created_at, updated_at
 *
 * All rich quotation data (client info, service details, locations,
 * GST, service instances, etc.) is stored as JSON in the `notes` column.
 */

// Normalize status for display
const normalizeQuotationStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    'draft': 'Draft',
    'pending': 'Pending',
    'sent': 'Sent',
    'revised': 'Revised',
    'accepted': 'Accepted',
    'rejected': 'Rejected',
    'expired': 'Expired',
    'converted': 'Converted',
  };
  return statusMap[status?.toLowerCase()] || status || 'Draft';
};

// Pack all rich data into the `notes` JSON column
const packNotes = (q: Partial<Quotation>): string => JSON.stringify({
  client: q.client || '',
  companyName: q.companyName || q.client || '',
  contactPerson: q.contactPerson || '',
  contactEmail: q.contactEmail || '',
  contactPhone: q.contactPhone || '',
  address: q.address || '',
  city: q.city || '',
  state: q.state || '',
  pincode: q.pincode || '',
  service: q.service || '',
  locations: q.locations || [],
  securityServices: q.securityServices || {},
  serviceInstances: q.serviceInstances || {},
  perPostServiceInstances: q.perPostServiceInstances || {},
  shiftType: q.shiftType || '8H',
  gstNumber: q.gstNumber || '',
  gstPercentage: q.gstPercentage ?? 18,
  gstExempt: q.gstExempt ?? false,
});

// Unpack notes JSON back into Quotation fields
const unpackNotes = (notesStr: string | null): Partial<Quotation> => {
  if (!notesStr) return {};
  try {
    return JSON.parse(notesStr);
  } catch {
    return {};
  }
};

const mapRowToQuotation = (row: any): Quotation => {
  const n = unpackNotes(row.notes);
  return {
    id: row.id,
    quotationId: row.quotation_id,
    leadId: row.lead_id,
    client: n.client || '',
    companyName: n.companyName || '',
    service: n.service || '',
    amount: row.total_amount != null ? `₹${row.total_amount}` : '₹0',
    status: normalizeQuotationStatus(row.status),
    date: row.quotation_date || row.created_at,
    validUntil: row.valid_until,
    contactPerson: n.contactPerson || '',
    contactEmail: n.contactEmail || '',
    contactPhone: n.contactPhone || '',
    address: n.address || '',
    city: n.city || '',
    state: n.state || '',
    pincode: n.pincode || '',
    locations: n.locations || [],
    securityServices: n.securityServices || {},
    serviceInstances: n.serviceInstances || {},
    perPostServiceInstances: n.perPostServiceInstances || {},
    shiftType: n.shiftType || '8H',
    gstNumber: n.gstNumber || '',
    gstPercentage: n.gstPercentage ?? 18,
    gstExempt: n.gstExempt ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

// Add a new quotation
export const addQuotation = async (quotation: Omit<Quotation, 'id'> & { id?: string }) => {
  try {
    const quotationId = quotation.quotationId || `QT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const total = parseFloat((quotation.amount || '0').replace(/[₹,]/g, '')) || 0;

    // Get current branch scope for branch isolation
    const scope = getBranchScope();
    const branchId = scope.code || scope.id || null;

    const insertData: Record<string, any> = {
      quotation_id: quotationId,
      quotation_date: new Date().toISOString().split('T')[0],
      valid_until: quotation.validUntil || null,
      total_amount: total,
      status: (quotation.status || 'draft').toLowerCase(),
      notes: packNotes(quotation),
      created_by: localStorage.getItem('userName') || 'Admin',
    };

    // Only include optional FK fields if they have values
    if (quotation.leadId?.trim()) {
      insertData.lead_id = quotation.leadId.trim();
    }
    if (branchId) {
      insertData.branch_id = branchId;
    }

    const { data, error } = await supabaseClient
      .from('quotations')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      // If FK constraint fails on lead_id, retry without it
      if (error.message?.includes('foreign key') && error.message?.includes('lead_id')) {
        delete insertData.lead_id;
        const { data: retryData, error: retryError } = await supabaseClient
          .from('quotations')
          .insert(insertData)
          .select('id')
          .single();

        if (retryError) {
          const msg = retryError.message || (retryError as any).details || (retryError as any).hint || (retryError as any).code || 'Unknown Supabase error';
          console.error('[QuotationService] Insert failed (retry):', msg, retryError);
          return { success: false, error: msg };
        }

        setTimeout(() => triggerQuotationsRefresh(), 100);
        return { success: true, id: retryData.id };
      }

      // If any other column doesn't exist (e.g. branch_id), retry without it
      if (error.message?.includes('branch_id')) {
        delete insertData.branch_id;
        const { data: retryData, error: retryError } = await supabaseClient
          .from('quotations')
          .insert(insertData)
          .select('id')
          .single();

        if (retryError) {
          const msg = retryError.message || (retryError as any).details || (retryError as any).hint || (retryError as any).code || 'Unknown Supabase error';
          console.error('[QuotationService] Insert failed (retry no branch):', msg, retryError);
          return { success: false, error: msg };
        }

        setTimeout(() => triggerQuotationsRefresh(), 100);
        return { success: true, id: retryData.id };
      }

      const msg = error.message || (error as any).details || (error as any).hint || (error as any).code || 'Unknown Supabase error';
      console.error('[QuotationService] Insert failed:', msg, error);
      return { success: false, error: msg };
    }

    setTimeout(() => triggerQuotationsRefresh(), 100);
    return { success: true, id: data.id };
  } catch (error) {
    console.error('[QuotationService] Exception:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Update an existing quotation
export const updateQuotation = async (id: string, quotation: Partial<Quotation>) => {
  try {
    const updates: any = {};

    if (quotation.status !== undefined) updates.status = quotation.status.toLowerCase();
    if (quotation.validUntil !== undefined) updates.valid_until = quotation.validUntil;
    if (quotation.amount !== undefined) {
      updates.total_amount = parseFloat((quotation.amount || '0').replace(/[₹,]/g, '')) || 0;
    }

    // Merge notes: fetch current, overlay changed fields
    const { data: current } = await supabaseClient
      .from('quotations')
      .select('notes')
      .eq('id', id)
      .maybeSingle();

    if (!current) {
      return { success: false, error: 'Quotation not found' };
    }

    const existing = unpackNotes(current?.notes);
    updates.notes = packNotes({ ...existing, ...quotation });

    const { error } = await supabaseClient
      .from('quotations')
      .update(updates)
      .eq('id', id);

    if (error) {
      const msg = error.message || (error as any).details || (error as any).hint || (error as any).code || 'Unknown Supabase error';
      console.error('Error updating quotation:', msg, error);
      return { success: false, error: msg };
    }

    setTimeout(() => triggerQuotationsRefresh(), 100);
    return { success: true };
  } catch (error) {
    console.error('Error updating quotation (exception):', error);
    return { success: false, error: (error as Error).message };
  }
};

// Delete a quotation
export const deleteQuotation = async (id: string) => {
  try {
    if (!id || id.trim() === '') {
      return { success: false, error: 'Invalid quotation ID' };
    }

    const { error } = await supabaseClient
      .from('quotations')
      .delete()
      .eq('id', id);

    if (error) {
      const msg = error.message || (error as any).details || (error as any).hint || 'Unknown Supabase error';
      console.error('Error deleting quotation:', msg, error);
      return { success: false, error: msg };
    }

    setTimeout(() => triggerQuotationsRefresh(), 100);
    return { success: true };
  } catch (error) {
    console.error('Error deleting quotation (exception):', error);
    return { success: false, error: (error as Error).message };
  }
};

// Get all quotations
export const getQuotations = async () => {
  try {
    let query = supabaseClient
      .from('quotations')
      .select('*')
      .order('created_at', { ascending: false });
    query = applyBranchScope(query);

    const { data, error } = await query;

    if (error) {
      const msg = error.message || (error as any).details || (error as any).hint || 'Unknown Supabase error';
      console.error('Error getting quotations:', msg, error);
      return { success: false, error: msg, data: [] };
    }

    return { success: true, data: (data || []).map(mapRowToQuotation) };
  } catch (error) {
    console.error('Error getting quotations (exception):', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

// Get a single quotation by ID
export const getQuotationById = async (id: string) => {
  try {
    const { data, error } = await supabaseClient
      .from('quotations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      const msg = error.message || (error as any).details || (error as any).hint || 'Unknown Supabase error';
      console.error('Error getting quotation by ID:', msg, error);
      return { success: false, error: msg, data: null };
    }

    return { success: true, data: data ? mapRowToQuotation(data) : null };
  } catch (error) {
    console.error('Error getting quotation by ID (exception):', error);
    return { success: false, error: (error as Error).message, data: null };
  }
};

// Get a quotation by its display ID (quotation_id like QT-2026-xxxx)
export const getQuotationByDisplayId = async (quotationId: string) => {
  try {
    const { data, error } = await supabaseClient
      .from('quotations')
      .select('*')
      .eq('quotation_id', quotationId)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data: data ? mapRowToQuotation(data) : null };
  } catch (error) {
    return { success: false, error: (error as Error).message, data: null };
  }
};

// Subscribe to real-time quotation updates
export const subscribeToQuotations = (callback: (quotations: Quotation[]) => void) => {
  getQuotations().then(result => {
    if (result.success) callback(result.data);
  });

  const channel = supabaseClient
    .channel('quotations-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'quotations' }, () => {
      getQuotations().then(result => {
        if (result.success) callback(result.data);
      });
    })
    .subscribe();

  // Re-fetch when the active branch changes
  const offBranch = onBranchScopeChange(() => {
    getQuotations().then(result => {
      if (result.success) callback(result.data);
    });
  });

  return () => {
    supabaseClient.removeChannel(channel);
    offBranch();
  };
};
