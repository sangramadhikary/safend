'use client';

import { supabaseClient } from '@/integrations/supabase/client';
import { getSupabaseClient } from '@/integrations/supabase/client';

export interface ContractRenewal {
  id?: string;
  agreement_id: string;
  work_order_id?: string;
  client_name: string;
  contract_value: string;
  start_date: Date;
  end_date: Date;
  renewal_status: 'upcoming' | 'due' | 'overdue' | 'renewed' | 'terminated';
  days_until_expiry: number;
  notification_sent: boolean;
  notification_date?: Date;
  renewal_notes?: string;
  action_plan?: string;
  assigned_to?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_at?: string;
  updated_at?: string;
  // Legacy camelCase aliases (used by existing UI components)
  agreementId?: string;
  workOrderId?: string;
  clientName?: string;
  contractValue?: string;
  startDate?: Date;
  endDate?: Date;
  renewalStatus?: 'upcoming' | 'due' | 'overdue' | 'renewed' | 'terminated';
  daysUntilExpiry?: number;
  notificationSent?: boolean;
  notificationDate?: Date;
  renewalNotes?: string;
  actionPlan?: string;
  assignedTo?: string;
}

export interface RenewalNotification {
  id?: string;
  renewal_id: string;
  agreement_id: string;
  client_name: string;
  message: string;
  type: 'reminder' | 'warning' | 'urgent' | 'expired';
  is_read: boolean;
  created_at?: string;
  // Legacy aliases
  renewalId?: string;
  agreementId?: string;
  clientName?: string;
  isRead?: boolean;
}

/**
 * Map DB row (snake_case) to include camelCase aliases for backward compatibility.
 */
function mapRenewalRow(row: any): ContractRenewal {
  return {
    ...row,
    agreementId: row.agreement_id,
    workOrderId: row.work_order_id,
    clientName: row.client_name,
    contractValue: row.contract_value,
    startDate: row.start_date ? new Date(row.start_date) : undefined,
    endDate: row.end_date ? new Date(row.end_date) : undefined,
    renewalStatus: row.renewal_status,
    daysUntilExpiry: row.days_until_expiry,
    notificationSent: row.notification_sent,
    notificationDate: row.notification_date ? new Date(row.notification_date) : undefined,
    renewalNotes: row.renewal_notes,
    actionPlan: row.action_plan,
    assignedTo: row.assigned_to,
  };
}

function mapNotificationRow(row: any): RenewalNotification {
  return {
    ...row,
    renewalId: row.renewal_id,
    agreementId: row.agreement_id,
    clientName: row.client_name,
    isRead: row.is_read,
  };
}

// Calculate days until expiry
export const calculateDaysUntilExpiry = (endDate: Date): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(endDate);
  expiry.setHours(0, 0, 0, 0);
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Determine renewal status based on days until expiry
export const getRenewalStatus = (daysUntilExpiry: number): ContractRenewal['renewal_status'] => {
  if (daysUntilExpiry < 0) return 'overdue';
  if (daysUntilExpiry <= 10) return 'due';
  if (daysUntilExpiry <= 30) return 'upcoming';
  return 'upcoming';
};

// Determine priority based on days until expiry
export const getRenewalPriority = (daysUntilExpiry: number): ContractRenewal['priority'] => {
  if (daysUntilExpiry < 0) return 'critical';
  if (daysUntilExpiry <= 5) return 'critical';
  if (daysUntilExpiry <= 10) return 'high';
  if (daysUntilExpiry <= 20) return 'medium';
  return 'low';
};

// Generate action plan based on days until expiry
export const generateActionPlan = (daysUntilExpiry: number, clientName: string): string => {
  if (daysUntilExpiry < 0) {
    return `URGENT: Contract with ${clientName} has EXPIRED. Immediate action required:\n` +
      `1. Contact client immediately to discuss renewal\n` +
      `2. Prepare revised quotation if needed\n` +
      `3. Schedule meeting with client within 24 hours\n` +
      `4. Escalate to management if no response`;
  }
  if (daysUntilExpiry <= 5) {
    return `CRITICAL: Contract expires in ${daysUntilExpiry} days:\n` +
      `1. Final follow-up call to ${clientName}\n` +
      `2. Send renewal agreement for signature\n` +
      `3. Confirm service continuation terms\n` +
      `4. Prepare transition plan if not renewing`;
  }
  if (daysUntilExpiry <= 10) {
    return `HIGH PRIORITY: Contract expires in ${daysUntilExpiry} days:\n` +
      `1. Schedule renewal meeting with ${clientName}\n` +
      `2. Review current contract terms and pricing\n` +
      `3. Prepare renewal proposal with any updates\n` +
      `4. Send formal renewal notice to client`;
  }
  if (daysUntilExpiry <= 20) {
    return `MEDIUM PRIORITY: Contract expires in ${daysUntilExpiry} days:\n` +
      `1. Send initial renewal reminder to ${clientName}\n` +
      `2. Review service performance and feedback\n` +
      `3. Identify any contract modifications needed\n` +
      `4. Prepare preliminary renewal terms`;
  }
  return `Contract renewal upcoming in ${daysUntilExpiry} days:\n` +
    `1. Monitor contract status\n` +
    `2. Plan renewal discussion with ${clientName}\n` +
    `3. Review market rates and service terms`;
};

// Add a new contract renewal record
export const addContractRenewal = async (renewal: Omit<ContractRenewal, 'id'>) => {
  try {
    const insertData: Record<string, unknown> = {
      agreement_id: renewal.agreementId || renewal.agreement_id,
      work_order_id: renewal.workOrderId || renewal.work_order_id || null,
      client_name: renewal.clientName || renewal.client_name,
      contract_value: renewal.contractValue || renewal.contract_value || null,
      start_date: renewal.startDate || renewal.start_date || null,
      end_date: renewal.endDate || renewal.end_date,
      renewal_status: renewal.renewalStatus || renewal.renewal_status || 'upcoming',
      days_until_expiry: renewal.daysUntilExpiry ?? renewal.days_until_expiry ?? null,
      notification_sent: renewal.notificationSent ?? renewal.notification_sent ?? false,
      notification_date: renewal.notificationDate || renewal.notification_date || null,
      renewal_notes: renewal.renewalNotes || renewal.renewal_notes || null,
      action_plan: renewal.actionPlan || renewal.action_plan || null,
      assigned_to: renewal.assignedTo || renewal.assigned_to || null,
      priority: renewal.priority || 'low',
    };

    const { data, error } = await supabaseClient.from('contract_renewals')
      .insert(insertData)
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    return { success: true, id: data?.id };
  } catch (error) {
    console.error('Error adding contract renewal:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Update contract renewal
export const updateContractRenewal = async (id: string, renewal: Partial<ContractRenewal>) => {
  try {
    const updateData: Record<string, unknown> = {};
    // updated_at is set by DB trigger (trg_contract_renewals_updated_at) — server-side timestamp
    if (renewal.agreementId !== undefined || renewal.agreement_id !== undefined) updateData.agreement_id = renewal.agreementId || renewal.agreement_id;
    if (renewal.workOrderId !== undefined || renewal.work_order_id !== undefined) updateData.work_order_id = renewal.workOrderId || renewal.work_order_id;
    if (renewal.clientName !== undefined || renewal.client_name !== undefined) updateData.client_name = renewal.clientName || renewal.client_name;
    if (renewal.contractValue !== undefined || renewal.contract_value !== undefined) updateData.contract_value = renewal.contractValue || renewal.contract_value;
    if (renewal.startDate !== undefined || renewal.start_date !== undefined) updateData.start_date = renewal.startDate || renewal.start_date;
    if (renewal.endDate !== undefined || renewal.end_date !== undefined) updateData.end_date = renewal.endDate || renewal.end_date;
    if (renewal.renewalStatus !== undefined || renewal.renewal_status !== undefined) updateData.renewal_status = renewal.renewalStatus || renewal.renewal_status;
    if (renewal.daysUntilExpiry !== undefined || renewal.days_until_expiry !== undefined) updateData.days_until_expiry = renewal.daysUntilExpiry ?? renewal.days_until_expiry;
    if (renewal.notificationSent !== undefined || renewal.notification_sent !== undefined) updateData.notification_sent = renewal.notificationSent ?? renewal.notification_sent;
    if (renewal.notificationDate !== undefined || renewal.notification_date !== undefined) updateData.notification_date = renewal.notificationDate || renewal.notification_date;
    if (renewal.renewalNotes !== undefined || renewal.renewal_notes !== undefined) updateData.renewal_notes = renewal.renewalNotes || renewal.renewal_notes;
    if (renewal.actionPlan !== undefined || renewal.action_plan !== undefined) updateData.action_plan = renewal.actionPlan || renewal.action_plan;
    if (renewal.assignedTo !== undefined || renewal.assigned_to !== undefined) updateData.assigned_to = renewal.assignedTo || renewal.assigned_to;
    if (renewal.priority !== undefined) updateData.priority = renewal.priority;

    const { error } = await supabaseClient.from('contract_renewals').update(updateData).eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  } catch (error) {
    console.error('Error updating contract renewal:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Delete contract renewal
export const deleteContractRenewal = async (id: string) => {
  try {
    const { error } = await supabaseClient.from('contract_renewals').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  } catch (error) {
    console.error('Error deleting contract renewal:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Get all contract renewals
export const getContractRenewals = async () => {
  try {
    const { data, error } = await supabaseClient.from('contract_renewals')
      .select('*')
      .order('end_date', { ascending: true });

    if (error) throw new Error(error.message);
    return { success: true, data: (data || []).map(mapRenewalRow) };
  } catch (error) {
    console.error('Error getting contract renewals:', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

// Subscribe to real-time contract renewal updates (Supabase Realtime)
export const subscribeToContractRenewals = (callback: (renewals: ContractRenewal[]) => void) => {
  // Initial fetch
  getContractRenewals().then(result => {
    if (result.success) callback(result.data);
  });

  // Subscribe to changes
  const channel = getSupabaseClient()
    .channel('contract_renewals_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'contract_renewals' }, () => {
      // Re-fetch on any change
      getContractRenewals().then(result => {
        if (result.success) callback(result.data);
      });
    })
    .subscribe();

  return () => { getSupabaseClient().removeChannel(channel); };
};

// Get contracts expiring within specified days
export const getExpiringContracts = async (withinDays: number = 10) => {
  try {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + withinDays);

    const { data, error } = await supabaseClient.from('contract_renewals')
      .select('*')
      .lte('end_date', futureDate.toISOString())
      .in('renewal_status', ['upcoming', 'due', 'overdue'])
      .order('end_date', { ascending: true });

    if (error) throw new Error(error.message);
    return { success: true, data: (data || []).map(mapRenewalRow) };
  } catch (error) {
    console.error('Error getting expiring contracts:', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

// Add renewal notification
export const addRenewalNotification = async (notification: Omit<RenewalNotification, 'id'>) => {
  try {
    const insertData = {
      renewal_id: notification.renewalId || notification.renewal_id,
      agreement_id: notification.agreementId || notification.agreement_id,
      client_name: notification.clientName || notification.client_name,
      message: notification.message,
      type: notification.type || 'reminder',
      is_read: false,
    };

    const { data, error } = await supabaseClient.from('renewal_notifications')
      .insert(insertData)
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    return { success: true, id: data?.id };
  } catch (error) {
    console.error('Error adding renewal notification:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Subscribe to renewal notifications
export const subscribeToRenewalNotifications = (callback: (notifications: RenewalNotification[]) => void) => {
  const fetchUnread = async () => {
    const { data, error } = await supabaseClient.from('renewal_notifications')
      .select('*')
      .eq('is_read', false)
      .order('created_at', { ascending: false });
    if (!error) callback((data || []).map(mapNotificationRow));
  };

  fetchUnread();

  const channel = getSupabaseClient()
    .channel('renewal_notifications_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'renewal_notifications' }, () => {
      fetchUnread();
    })
    .subscribe();

  return () => { getSupabaseClient().removeChannel(channel); };
};

// Mark notification as read
export const markNotificationAsRead = async (id: string) => {
  try {
    const { error } = await supabaseClient.from('renewal_notifications')
      .update({ is_read: true })
      .eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true };
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return { success: false, error: (error as Error).message };
  }
};
