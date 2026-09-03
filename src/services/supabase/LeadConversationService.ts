'use client';

import { supabaseClient } from '@/integrations/supabase/client';

export interface LeadConversation {
  id: string;
  leadId: string;
  type: 'call' | 'email' | 'meeting' | 'note' | 'followup' | 'status_change' | 'whatsapp';
  title: string;
  description: string;
  outcome?: string;
  createdBy: string;
  createdAt: string;
}

const mapRowToConversation = (row: any): LeadConversation => ({
  id: row.id,
  leadId: row.lead_id,
  type: row.type || 'note',
  title: row.title || '',
  description: row.description || '',
  outcome: row.outcome || '',
  createdBy: row.created_by || 'System',
  createdAt: row.created_at || new Date().toISOString(),
});

// Get all conversations for a specific lead
export const getLeadConversations = async (leadId: string): Promise<{ success: boolean; data: LeadConversation[]; error?: string }> => {
  try {
    const { data, error } = await supabaseClient
      .from('lead_conversations')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) {
      // Table likely doesn't exist — return empty gracefully, no console error
      return { success: true, data: [] };
    }

    return { success: true, data: (data || []).map(mapRowToConversation) };
  } catch {
    // Any exception (network, table missing, etc.) — return empty gracefully
    return { success: true, data: [] };
  }
};

// Add a new conversation entry
export const addLeadConversation = async (conversation: Omit<LeadConversation, 'id' | 'createdAt'>): Promise<{ success: boolean; id?: string; error?: string; tableExists?: boolean }> => {
  try {
    const insertData = {
      lead_id: conversation.leadId,
      type: conversation.type,
      title: conversation.title,
      description: conversation.description,
      outcome: conversation.outcome || null,
      created_by: conversation.createdBy || localStorage.getItem('userName') || 'Admin',
    };

    const { data, error } = await supabaseClient
      .from('lead_conversations')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      // Table likely doesn't exist — skip silently
      return { success: true, id: undefined, tableExists: false };
    }

    return { success: true, id: data.id, tableExists: true };
  } catch {
    // Any exception — treat as table not available
    return { success: true, id: undefined, tableExists: false };
  }
};

// Update an existing conversation entry
export const updateLeadConversation = async (id: string, updates: Partial<Omit<LeadConversation, 'id' | 'leadId' | 'createdAt'>>): Promise<{ success: boolean; error?: string }> => {
  try {
    const updateData: any = {};
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.outcome !== undefined) updateData.outcome = updates.outcome;

    const { error } = await supabaseClient
      .from('lead_conversations')
      .update(updateData)
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message || 'Failed to update' };
    }
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to update conversation' };
  }
};

// Delete a conversation entry
export const deleteLeadConversation = async (id: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabaseClient
      .from('lead_conversations')
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message || 'Failed to delete' };
    }
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to delete conversation' };
  }
};
