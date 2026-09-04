'use client';

import { supabaseClient } from '@/integrations/supabase/client';
import { addNotification } from '@/services/supabase/NotificationService';

export interface CollectionTask {
  id: string;
  receivable_id: string;
  assigned_to: string | null;
  client_name: string | null;
  invoice_description: string | null;
  amount: number;
  due_date: string | null;
  days_overdue: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'in_progress' | 'follow_up' | 'resolved' | 'escalated';
  notes: string | null;
  reminders_sent: number;
  last_reminder_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Calculate priority based on days overdue
 */
function getPriority(daysOverdue: number): CollectionTask['priority'] {
  if (daysOverdue <= 7) return 'low';
  if (daysOverdue <= 30) return 'medium';
  if (daysOverdue <= 60) return 'high';
  return 'critical';
}

/**
 * Get all users with the 'sales' role to assign collection tasks
 */
async function getSalesUsers(): Promise<{ user_id: string; email: string }[]> {
  const { data, error } = await supabaseClient
    .from('user_roles')
    .select('user_id, email')
    .eq('role', 'sales');

  if (error || !data) return [];
  return data;
}

/**
 * Check for overdue receivables and create collection tasks for the sales team.
 * This should be called periodically (e.g., on page load of accounts or sales module).
 * 
 * Flow:
 * 1. Find all receivables where due_date < today AND status = 'pending'
 * 2. Update their status to 'overdue'
 * 3. Create a collection_task for each (if one doesn't already exist)
 * 4. Notify sales team users
 */
export async function checkAndAssignOverdueCollections(): Promise<{
  overdueCount: number;
  tasksCreated: number;
  errors: string[];
}> {
  const result = { overdueCount: 0, tasksCreated: 0, errors: [] as string[] };

  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // 1. Find unpaid receivables that are past their due date. Unpaid stored
    //    states span the lifecycle before payment: 'created', 'issued' and the
    //    legacy 'pending'.
    const { data: overdueReceivables, error: fetchError } = await supabaseClient
      .from('receivables')
      .select('*')
      .in('status', ['created', 'issued', 'pending'])
      .lt('due_date', today)
      .not('due_date', 'is', null);

    if (fetchError) {
      result.errors.push(`Failed to fetch overdue receivables: ${fetchError.message}`);
      return result;
    }

    if (!overdueReceivables || overdueReceivables.length === 0) {
      return result;
    }

    result.overdueCount = overdueReceivables.length;

    // 2. Update status to 'overdue' in bulk
    const overdueIds = overdueReceivables.map(r => r.id);
    const { error: updateError } = await supabaseClient
      .from('receivables')
      .update({ status: 'overdue' })
      .in('id', overdueIds);

    if (updateError) {
      result.errors.push(`Failed to update overdue status: ${updateError.message}`);
    }

    // 3. Get sales users for assignment (round-robin)
    const salesUsers = await getSalesUsers();

    // 4. Create collection tasks for each overdue receivable
    for (let i = 0; i < overdueReceivables.length; i++) {
      const receivable = overdueReceivables[i];
      const daysOverdue = Math.ceil(
        (new Date().getTime() - new Date(receivable.due_date).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Assign round-robin to sales users, or null if no sales users exist
      const assignedUser = salesUsers.length > 0
        ? salesUsers[i % salesUsers.length]
        : null;

      const { error: insertError } = await supabaseClient
        .from('collection_tasks')
        .insert({
          receivable_id: receivable.id,
          assigned_to: assignedUser?.user_id || null,
          client_name: receivable.client_name,
          invoice_description: receivable.description,
          amount: receivable.total_amount,
          due_date: receivable.due_date,
          days_overdue: daysOverdue,
          priority: getPriority(daysOverdue),
          status: 'pending',
        })
        .select()
        .single();

      if (insertError) {
        // Likely already exists (unique constraint) — skip
        if (!insertError.message.includes('duplicate') && !insertError.message.includes('unique')) {
          result.errors.push(`Task creation failed for ${receivable.id}: ${insertError.message}`);
        }
        continue;
      }

      result.tasksCreated++;

      // 5. Send notification to assigned sales user
      if (assignedUser) {
        await addNotification({
          userId: assignedUser.user_id,
          title: '🔴 New Collection Task Assigned',
          message: `Overdue invoice from "${receivable.client_name || 'Unknown'}" — ₹${receivable.total_amount.toLocaleString('en-IN')} (${daysOverdue} days overdue). Please follow up.`,
          type: 'warning',
          relatedItemType: 'collections',
          relatedItemId: receivable.id,
        });
      }
    }
  } catch (err: any) {
    result.errors.push(`Unexpected error: ${err.message}`);
  }

  return result;
}

/**
 * Fetch all active collection tasks (for the sales collections tab)
 */
export async function fetchCollectionTasks(filters?: {
  status?: string;
  priority?: string;
  assignedTo?: string;
}): Promise<CollectionTask[]> {
  let query = supabaseClient
    .from('collection_tasks')
    .select('*')
    .order('days_overdue', { ascending: false });

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }
  if (filters?.priority && filters.priority !== 'all') {
    query = query.eq('priority', filters.priority);
  }
  if (filters?.assignedTo) {
    query = query.eq('assigned_to', filters.assignedTo);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching collection tasks:', error);
    return [];
  }
  return (data ?? []) as CollectionTask[];
}

/**
 * Update a collection task status
 */
export async function updateCollectionTaskStatus(
  taskId: string,
  status: CollectionTask['status'],
  notes?: string
): Promise<boolean> {
  const updateData: any = { status };
  if (notes) updateData.notes = notes;
  if (status === 'resolved') updateData.resolved_at = new Date().toISOString();

  const { error } = await supabaseClient
    .from('collection_tasks')
    .update(updateData)
    .eq('id', taskId);

  if (error) {
    console.error('Error updating collection task:', error);
    return false;
  }

  // If resolved, also mark the receivable as received
  if (status === 'resolved') {
    const { data: task } = await supabaseClient
      .from('collection_tasks')
      .select('receivable_id')
      .eq('id', taskId)
      .single();

    if (task) {
      await supabaseClient
        .from('receivables')
        .update({ status: 'received' })
        .eq('id', task.receivable_id);
    }
  }

  return true;
}

/**
 * Update days_overdue for all active collection tasks (call periodically)
 */
export async function refreshOverdueDays(): Promise<void> {
  const { data: tasks } = await supabaseClient
    .from('collection_tasks')
    .select('id, due_date')
    .neq('status', 'resolved');

  if (!tasks) return;

  const today = new Date();
  for (const task of tasks) {
    if (!task.due_date) continue;
    const daysOverdue = Math.ceil(
      (today.getTime() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    await supabaseClient
      .from('collection_tasks')
      .update({ days_overdue: daysOverdue, priority: getPriority(daysOverdue) })
      .eq('id', task.id);
  }
}
