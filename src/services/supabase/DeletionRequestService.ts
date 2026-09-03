'use client';

import { supabaseClient } from '@/integrations/supabase/client';

export interface DeletionRequest {
  id?: string;
  itemType: 'lead' | 'quotation' | 'agreement' | 'followup' | 'workorder' | 'contract';
  itemId: string;
  clientName: string;
  contactDetails: string;
  reason: string;
  requestedBy: string;
  requestedAt: Date;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: Date;
  additionalInfo?: string;
}

// Helper to map DB row to DeletionRequest
const mapRow = (row: any): DeletionRequest => ({
  id: row.id,
  itemType: row.item_type,
  itemId: row.item_id,
  clientName: row.client_name,
  contactDetails: row.contact_details || '',
  reason: row.reason || '',
  requestedBy: row.requested_by || '',
  requestedAt: row.requested_at ? new Date(row.requested_at) : new Date(),
  status: row.status || 'pending',
  reviewedBy: row.reviewed_by || undefined,
  reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
  additionalInfo: row.additional_info || undefined,
});

const TABLE = 'deletion_requests';

// Add a new deletion request
export const addDeletionRequest = async (request: Omit<DeletionRequest, 'id' | 'requestedAt' | 'status'>) => {
  try {
    const { data, error } = await supabaseClient
      .from(TABLE)
      .insert({
        item_type: request.itemType,
        item_id: request.itemId,
        client_name: request.clientName,
        contact_details: request.contactDetails,
        reason: request.reason,
        requested_by: request.requestedBy,
        status: 'pending',
        additional_info: request.additionalInfo || null,
      })
      .select('id')
      .single();

    if (error) {
      console.error("Error adding deletion request:", error);
      return { success: false, error: error.message };
    }
    return { success: true, id: data.id };
  } catch (error: any) {
    console.error("Error adding deletion request:", error);
    return { success: false, error: error.message };
  }
};

// Get all deletion requests
export const getDeletionRequests = async () => {
  try {
    const { data, error } = await supabaseClient
      .from(TABLE)
      .select('*')
      .order('requested_at', { ascending: false });

    if (error) {
      console.error("Error getting deletion requests:", error);
      return { success: false, error: error.message, data: [] as DeletionRequest[] };
    }
    return { success: true, data: (data || []).map(mapRow) };
  } catch (error: any) {
    console.error("Error getting deletion requests:", error);
    return { success: false, error: error.message, data: [] as DeletionRequest[] };
  }
};

// Get pending deletion requests count
export const getPendingDeletionRequestsCount = async () => {
  try {
    const { count, error } = await supabaseClient
      .from(TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (error) {
      console.error("Error getting pending count:", error);
      return { success: false, error: error.message, count: 0 };
    }
    return { success: true, count: count || 0 };
  } catch (error: any) {
    console.error("Error getting pending count:", error);
    return { success: false, error: error.message, count: 0 };
  }
};

// Subscribe to deletion requests (real-time)
export const subscribeToDeletionRequests = (callback: (requests: DeletionRequest[]) => void) => {
  // Initial fetch
  const fetchAll = async () => {
    const { data, error } = await supabaseClient
      .from(TABLE)
      .select('*')
      .order('requested_at', { ascending: false });

    if (error) {
      console.error('Error fetching deletion requests:', error);
      callback([]);
      return;
    }
    callback((data || []).map(mapRow));
  };

  fetchAll();

  // Real-time subscription
  const channel = supabaseClient
    .channel('deletion-requests-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => {
      fetchAll();
    })
    .subscribe();

  return () => {
    supabaseClient.removeChannel(channel);
  };
};

// Subscribe to pending deletion requests only
export const subscribeToPendingDeletionRequests = (callback: (requests: DeletionRequest[]) => void) => {
  const fetchPending = async () => {
    const { data, error } = await supabaseClient
      .from(TABLE)
      .select('*')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending deletion requests:', error);
      callback([]);
      return;
    }
    callback((data || []).map(mapRow));
  };

  fetchPending();

  const channel = supabaseClient
    .channel('deletion-requests-pending')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => {
      fetchPending();
    })
    .subscribe();

  return () => {
    supabaseClient.removeChannel(channel);
  };
};

// Approve deletion request
export const approveDeletionRequest = async (requestId: string, reviewedBy: string) => {
  try {
    const { error } = await supabaseClient
      .from(TABLE)
      .update({
        status: 'approved',
        reviewed_by: reviewedBy,
        // reviewed_at set by DB trigger (trg_deletion_requests_reviewed_at)
      })
      .eq('id', requestId);

    if (error) {
      console.error("Error approving deletion request:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error: any) {
    console.error("Error approving deletion request:", error);
    return { success: false, error: error.message };
  }
};

// Reject deletion request
export const rejectDeletionRequest = async (requestId: string, reviewedBy: string) => {
  try {
    const { error } = await supabaseClient
      .from(TABLE)
      .update({
        status: 'rejected',
        reviewed_by: reviewedBy,
        // reviewed_at set by DB trigger (trg_deletion_requests_reviewed_at)
      })
      .eq('id', requestId);

    if (error) {
      console.error("Error rejecting deletion request:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error: any) {
    console.error("Error rejecting deletion request:", error);
    return { success: false, error: error.message };
  }
};

// Delete a deletion request record
export const deleteDeletionRequest = async (requestId: string) => {
  try {
    const { error } = await supabaseClient
      .from(TABLE)
      .delete()
      .eq('id', requestId);

    if (error) {
      console.error("Error deleting deletion request:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting deletion request:", error);
    return { success: false, error: error.message };
  }
};
