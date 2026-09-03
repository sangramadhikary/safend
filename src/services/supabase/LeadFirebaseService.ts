'use client';

// Supabase service for Lead Management
import { supabaseClient } from '@/integrations/supabase/client';
import { triggerLeadsRefresh } from '@/utils/dataRefresh';
import { applyBranchScope, onBranchScopeChange } from '@/utils/branchScope';
import { auditActions } from '@/utils/auditLog';

export interface LeadData {
  id?: string;
  leadId?: string; // Display ID e.g. "LEAD-1717..." (leads.lead_id column)
  name: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  source: string;
  status: string;
  assignedTo: string;
  securityNeeds: {
    armedGuards: boolean;
    unarmedGuards: boolean;
    supervisors: boolean;
    patrolOfficers: boolean;
    eventSecurity: boolean;
    personalSecurity: boolean;
  };
  manpowerRequirements: {
    totalGuardsNeeded: string;
    shiftType: string;
    shiftCount: string;
    femaleGuardsRequired: boolean;
    exServicemenRequired: boolean;
    [key: string]: string | boolean | undefined;
  };
  siteInformation: {
    siteCount: string;
    primaryLocation: string;
    locationType: string;
    siteArea: string;
    accessControlNeeded: boolean;
    cameraSystemNeeded: boolean;
  };
  budget: string;
  targetStartDate: string;
  urgency: string;
  notes: string;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
}

/**
 * Read a lead's current state, for capturing the "before" side of an audit diff.
 *
 * Returns `undefined` rather than throwing on any failure: the audit trail is
 * instrumentation, so a failed snapshot read must degrade the audit entry, never
 * block the mutation the user asked for.
 *
 * Defined here rather than exported because it exists purely to serve
 * instrumentation, and the module has no other single-lead read.
 */
const fetchLeadSnapshot = async (leadId: string): Promise<LeadData | undefined> => {
  try {
    const { data, error } = await supabaseClient
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .maybeSingle();
    if (error || !data) return undefined;
    return mapRowToLead(data);
  } catch {
    return undefined;
  }
};

// Create a new lead
export const createLead = async (leadData: LeadData): Promise<{ success: boolean; id?: string; error?: string }> => {
  try {
    const currentUser = localStorage.getItem('userName') || 'Admin';
    
    // Normalize status to lowercase for database
    const normalizedStatus = (leadData.status || 'New Lead').toLowerCase().replace(/\s+/g, '_');
    
    // Map to actual DB column names (contact_person = name in DB)
    const insertData: any = {
      lead_id: `LEAD-${Date.now()}`,                              // NOT NULL required
      company_name: leadData.companyName || leadData.name || '',  // NOT NULL required
      contact_person: leadData.name,
      phone: leadData.phone || null,
      email: leadData.email || null,
      source: leadData.source || null,
      status: normalizedStatus,
      assigned_to: leadData.assignedTo || null,
      notes: leadData.notes || null,
      address: leadData.address || null,
      city: leadData.city || null,
      state: leadData.state || null,
      pincode: leadData.pincode || null,
      budget: leadData.budget || null,
      target_start_date: leadData.targetStartDate || null,
      urgency: leadData.urgency || null,
      security_needs: leadData.securityNeeds || {},
      manpower_requirements: leadData.manpowerRequirements || {},
      site_information: leadData.siteInformation || {},
      created_by: currentUser,
    };
    
    const { data, error } = await supabaseClient
      .from('leads')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      console.error('Error creating lead:', error);
      return { success: false, error: error.message };
    }

    // Instrumented in the service so all callers are covered by one edit: this
    // function is reached from the lead form, the sales module and the quotation
    // flow. Fire-and-forget — logging must not fail the user's save.
    void auditActions.leadCreated(leadData.companyName || leadData.name, {
      leadId: insertData.lead_id,
      contactPerson: leadData.name,
      source: leadData.source,
      status: normalizedStatus,
      assignedTo: leadData.assignedTo,
      budget: leadData.budget,
      city: leadData.city,
    });

    // Trigger manual refresh since real-time might not be enabled
    setTimeout(() => triggerLeadsRefresh(), 100);

    return { success: true, id: data.id };
  } catch (error: any) {
    console.error('Error creating lead:', error);
    return { success: false, error: error.message };
  }
};

// Update an existing lead
export const updateLead = async (leadId: string, leadData: Partial<LeadData>): Promise<{ success: boolean; error?: string }> => {
  try {
    // Read the current state before writing, so the audit entry records what each
    // value changed FROM. One extra SELECT per update, paid only on mutations.
    const before = await fetchLeadSnapshot(leadId);

    const updates: any = {};
    if (leadData.name !== undefined) updates.contact_person = leadData.name; // DB uses contact_person
    if (leadData.companyName !== undefined) updates.company_name = leadData.companyName;
    if (leadData.email !== undefined) updates.email = leadData.email;
    if (leadData.phone !== undefined) updates.phone = leadData.phone;
    if (leadData.address !== undefined) updates.address = leadData.address;
    if (leadData.city !== undefined) updates.city = leadData.city;
    if (leadData.state !== undefined) updates.state = leadData.state;
    if (leadData.pincode !== undefined) updates.pincode = leadData.pincode;
    if (leadData.source !== undefined) updates.source = leadData.source;
    if (leadData.status !== undefined) updates.status = leadData.status.toLowerCase().replace(/\s+/g, '_');
    if (leadData.assignedTo !== undefined) updates.assigned_to = leadData.assignedTo;
    if (leadData.securityNeeds !== undefined) updates.security_needs = leadData.securityNeeds;
    if (leadData.manpowerRequirements !== undefined) updates.manpower_requirements = leadData.manpowerRequirements;
    if (leadData.siteInformation !== undefined) updates.site_information = leadData.siteInformation;
    if (leadData.budget !== undefined) updates.budget = leadData.budget;
    if (leadData.targetStartDate !== undefined) updates.target_start_date = leadData.targetStartDate;
    if (leadData.urgency !== undefined) updates.urgency = leadData.urgency;
    if (leadData.notes !== undefined) updates.notes = leadData.notes;

    const { error } = await supabaseClient
      .from('leads')
      .update(updates)
      .eq('id', leadId);

    if (error) {
      console.error('Error updating lead:', error);
      return { success: false, error: error.message };
    }

    const label = before?.companyName || before?.name || leadData.companyName || leadData.name || leadId;

    if (before) {
      // A pipeline status move is the single most reviewed change on a lead, so it
      // gets its own action rather than being buried among other field edits.
      if (leadData.status !== undefined && normalizeLeadStatus(leadData.status) !== before.status) {
        void auditActions.leadStatusChanged(label, before.status, normalizeLeadStatus(leadData.status));
      }
      // `leadData` is a partial patch, so the post-update state is the prior
      // record with the patch applied. Merging avoids a second round trip.
      void auditActions.leadUpdated(label, undefined, before, { ...before, ...leadData });
    } else {
      void auditActions.leadUpdated(label, leadData);
    }

    // Trigger manual refresh since real-time might not be enabled
    setTimeout(() => triggerLeadsRefresh(), 100);

    return { success: true };
  } catch (error: any) {
    console.error('Error updating lead:', error);
    return { success: false, error: error.message };
  }
};

// Delete a lead
export const deleteLead = async (leadId: string): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!leadId || leadId.trim() === '') {
      return { success: false, error: 'Invalid lead ID' };
    }

    // Capture the record before it is destroyed. This is the only opportunity —
    // afterwards an audit entry could name nothing but an id nobody can resolve.
    const before = await fetchLeadSnapshot(leadId);

    const { error } = await supabaseClient
      .from('leads')
      .delete()
      .eq('id', leadId);

    if (error) {
      console.error('Error deleting lead:', error);
      return { success: false, error: error.message };
    }

    void auditActions.leadDeleted(
      before?.companyName || before?.name || leadId,
      before
    );

    // Trigger manual refresh since real-time might not be enabled
    setTimeout(() => triggerLeadsRefresh(), 100);

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting lead:', error);
    return { success: false, error: error.message };
  }
};

// Normalize lead status for display (convert lowercase to Title Case)
const normalizeLeadStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    'new': 'New Lead',
    'new_lead': 'New Lead',
    'new lead': 'New Lead',
    'qualified': 'Qualified Lead',
    'qualified_lead': 'Qualified Lead',
    'qualified lead': 'Qualified Lead',
    'opportunity': 'Opportunity',
    'client': 'Client',
    'inactive': 'Inactive',
    'lost': 'Lost',
    'converted': 'Converted',
  };
  return statusMap[status?.toLowerCase()] || status || 'New Lead';
};

// Normalize urgency/priority for display
const normalizeUrgency = (urgency: string): string => {
  const urgencyMap: Record<string, string> = {
    'high': 'High',
    'medium': 'Medium',
    'low': 'Low',
    'urgent': 'Urgent',
  };
  return urgencyMap[urgency?.toLowerCase()] || urgency || 'Medium';
};

// Helper to map DB row to LeadData
const mapRowToLead = (row: any): LeadData => ({
  id: row.id,
  leadId: row.lead_id,
  name: row.contact_person || row.name || '',  // DB uses contact_person
  companyName: row.company_name || '',
  email: row.email || '',
  phone: row.phone || '',
  address: row.address || '',
  city: row.city || '',
  state: row.state || '',
  pincode: row.pincode || '',
  source: row.source || '',
  status: normalizeLeadStatus(row.status || 'new'),
  assignedTo: row.assigned_to || '',
  securityNeeds: row.security_needs || {},
  manpowerRequirements: row.manpower_requirements || {},
  siteInformation: row.site_information || {},
  budget: row.budget || '',
  targetStartDate: row.target_start_date || '',
  urgency: normalizeUrgency(row.urgency || ''),
  notes: row.notes || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  createdBy: row.created_by,
});

// Get all leads
export const getAllLeads = async (): Promise<LeadData[]> => {
  try {
    let query = supabaseClient
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });
    query = applyBranchScope(query);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching leads:', error);
      return [];
    }

    return (data || []).map(mapRowToLead);
  } catch (error) {
    console.error('Error fetching leads:', error);
    return [];
  }
};

// Real-time listener for leads
export const subscribeToLeads = (callback: (leads: LeadData[]) => void): (() => void) => {
  // Initial fetch
  getAllLeads().then(callback);

  // Real-time subscription
  const channel = supabaseClient
    .channel('leads-realtime-' + Date.now())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
      getAllLeads().then(callback);
    })
    .subscribe();

  // Re-fetch when the active branch changes
  const offBranch = onBranchScopeChange(() => {
    getAllLeads().then(callback);
  });

  return () => {
    supabaseClient.removeChannel(channel);
    offBranch();
  };
};

// Manual refresh trigger - call this after create/update/delete
export const refreshLeadsData = async (): Promise<LeadData[]> => {
  return getAllLeads();
};
