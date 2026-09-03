'use client';

import { supabaseClient } from '@/integrations/supabase/client';
import { triggerFollowupsRefresh } from '@/utils/dataRefresh';

export interface Followup {
  id?: string;
  contact: string;
  company: string;
  type: string;
  dateTime: string;
  subject: string;
  status: string;
  priority?: string;
  notes?: string;
  email?: string;
  phone?: string;
  leadId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Helper to normalize status to Title Case for UI display
const normalizeStatus = (status: string): string => {
  if (!status) return 'Pending';
  const statusMap: Record<string, string> = {
    'pending': 'Pending',
    'completed': 'Completed',
    'overdue': 'Overdue',
    'cancelled': 'Cancelled',
    'in_progress': 'In Progress',
    'scheduled': 'Scheduled'
  };
  return statusMap[status.toLowerCase()] || status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
};

// Helper to normalize priority to Title Case for UI display
const normalizePriority = (priority: string): string => {
  if (!priority) return 'Medium';
  const priorityMap: Record<string, string> = {
    'high': 'High',
    'medium': 'Medium',
    'low': 'Low'
  };
  return priorityMap[priority.toLowerCase()] || priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase();
};

const mapRowToFollowup = (row: any): Followup => {
  // Parse notes to extract contact and subject if stored together
  const notesData = row.notes || '';
  const [contactFromNotes, ...subjectParts] = notesData.split(' - ');
  
  return {
    id: row.id,
    contact: row.contact_name || contactFromNotes || '',
    company: row.company_name || '',
    type: row.type || 'call',
    dateTime: row.scheduled_date || '',
    subject: row.subject || subjectParts.join(' - ') || notesData,
    status: normalizeStatus(row.status || 'pending'),
    priority: normalizePriority(row.priority || 'medium'),
    notes: row.notes,
    email: row.email || row.contact_email || '',
    phone: row.phone || row.contact_phone || '',
    leadId: row.lead_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

// Add a new follow-up
export const addFollowup = async (followup: Omit<Followup, 'id'>) => {
  try {
    // Build insert data incrementally — start minimal, add what's available
    const insertData: any = {};
    
    // Add fields only if they have values
    if (followup.leadId) insertData.lead_id = followup.leadId;
    if (followup.type) insertData.type = followup.type.toLowerCase();
    if (followup.dateTime) insertData.scheduled_date = followup.dateTime;
    if (followup.status) insertData.status = followup.status.toLowerCase();
    if (followup.notes || followup.contact || followup.subject) {
      insertData.notes = followup.notes || `${followup.contact || ''} - ${followup.subject || ''}`;
    }
    
    // Optional extended fields
    if (followup.contact) insertData.contact_name = followup.contact;
    if (followup.company) insertData.company_name = followup.company;
    if (followup.email) insertData.email = followup.email;
    if (followup.phone) insertData.phone = followup.phone;
    if (followup.subject) insertData.subject = followup.subject;
    if (followup.priority) insertData.priority = followup.priority.toLowerCase();

    // Always set created_by
    insertData.created_by = localStorage.getItem('userName') || 'Admin';

    const { data, error } = await supabaseClient
      .from('followups')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      // Retry with only the bare minimum fields
      const minimalData: any = {
        notes: followup.notes || `${followup.contact || ''} - ${followup.subject || ''}`,
      };
      if (followup.dateTime) minimalData.scheduled_date = followup.dateTime;
      if (followup.status) minimalData.status = followup.status.toLowerCase();

      const retry = await supabaseClient
        .from('followups')
        .insert(minimalData)
        .select('id')
        .single();

      if (retry.error) {
        // Last resort: log the actual error for debugging
        const errMsg = retry.error?.message || retry.error?.details || retry.error?.hint || JSON.stringify(retry.error);
        console.warn('Follow-up insert failed. Error:', errMsg, 'Data attempted:', minimalData);
        return { success: false, error: errMsg || 'Failed to add follow-up' };
      }

      setTimeout(() => triggerFollowupsRefresh(), 100);
      return { success: true, id: retry.data.id };
    }

    // Trigger manual refresh with small delay to ensure DB has committed
    setTimeout(() => triggerFollowupsRefresh(), 100);
    return { success: true, id: data.id };
  } catch (error) {
    return { success: false, error: (error as Error).message || 'Unexpected error' };
  }
};

// Update an existing follow-up
export const updateFollowup = async (id: string, followup: Partial<Followup>) => {
  try {
    const updates: any = {};
    if (followup.contact !== undefined) updates.contact_name = followup.contact;
    if (followup.company !== undefined) updates.company_name = followup.company;
    if (followup.email !== undefined) updates.email = followup.email;
    if (followup.phone !== undefined) updates.phone = followup.phone;
    if (followup.type !== undefined) updates.type = followup.type?.toLowerCase() || 'call';
    if (followup.dateTime !== undefined) updates.scheduled_date = followup.dateTime;
    if (followup.subject !== undefined) updates.subject = followup.subject;
    if (followup.status !== undefined) updates.status = followup.status?.toLowerCase() || 'pending';
    if (followup.priority !== undefined) updates.priority = followup.priority?.toLowerCase() || 'medium';
    if (followup.notes !== undefined) updates.notes = followup.notes;

    const { error } = await supabaseClient
      .from('followups')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Error updating follow-up:', error);
      return { success: false, error: error.message };
    }

    // Trigger manual refresh with small delay to ensure DB has committed
    setTimeout(() => triggerFollowupsRefresh(), 100);
    return { success: true };
  } catch (error) {
    console.error('Error updating follow-up:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Delete a follow-up
export const deleteFollowup = async (id: string) => {
  try {
    if (!id || id.trim() === '') {
      return { success: false, error: 'Invalid followup ID' };
    }

    const { error } = await supabaseClient
      .from('followups')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting follow-up:', error);
      return { success: false, error: error.message };
    }

    // Trigger manual refresh with small delay to ensure DB has committed
    setTimeout(() => triggerFollowupsRefresh(), 100);
    return { success: true };
  } catch (error) {
    console.error('Error deleting follow-up:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Get all follow-ups
export const getFollowups = async () => {
  try {
    const { data, error } = await supabaseClient
      .from('followups')
      .select('*')
      .order('scheduled_date', { ascending: false });

    if (error) {
      console.error('Error getting follow-ups:', error);
      return { success: false, error: error.message, data: [] };
    }

    return { success: true, data: (data || []).map(mapRowToFollowup) };
  } catch (error) {
    console.error('Error getting follow-ups:', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

// Subscribe to real-time follow-up updates
export const subscribeToFollowups = (callback: (followups: Followup[]) => void) => {
  // Initial fetch
  getFollowups().then(result => {
    if (result.success) callback(result.data);
  });

  // Real-time subscription
  const channel = supabaseClient
    .channel('followups-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'followups' }, () => {
      getFollowups().then(result => {
        if (result.success) callback(result.data);
      });
    })
    .subscribe();

  return () => {
    supabaseClient.removeChannel(channel);
  };
};
