'use client';

import { supabaseClient } from '@/integrations/supabase/client';
import { addNotification } from "./NotificationService";

export interface PendingTask {
  id?: string;
  type: "agreement_upload" | "document_pending" | "compliance_due";
  agreementId: string;
  clientName: string;
  value: string;
  assignedTo: string;
  dueDate: Date;
  tatDays: number;
  status: "pending" | "completed" | "overdue";
  createdAt: Date;
  completedAt?: Date;
  remindersSent: number;
  lastReminderAt?: Date;
}

const TABLE = 'pending_tasks';

// Helper to map DB row to PendingTask
const mapRow = (row: any): PendingTask => ({
  id: row.id,
  type: row.type || 'agreement_upload',
  agreementId: row.agreement_id,
  clientName: row.client_name,
  value: row.value || '',
  assignedTo: row.assigned_to,
  dueDate: row.due_date ? new Date(row.due_date) : new Date(),
  tatDays: row.tat_days || 7,
  status: row.status || 'pending',
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  remindersSent: row.reminders_sent || 0,
  lastReminderAt: row.last_reminder_at ? new Date(row.last_reminder_at) : undefined,
});

// Add a new pending agreement upload task
export const addPendingAgreementTask = async (taskData: {
  agreementId: string;
  clientName: string;
  value: string;
  assignedTo: string;
  dueDate: Date;
  tatDays: number;
}) => {
  try {
    const { data, error } = await supabaseClient
      .from(TABLE)
      .insert({
        type: 'agreement_upload',
        agreement_id: taskData.agreementId,
        client_name: taskData.clientName,
        value: taskData.value,
        assigned_to: taskData.assignedTo,
        due_date: taskData.dueDate.toISOString(),
        tat_days: taskData.tatDays,
        status: 'pending',
        reminders_sent: 0,
      })
      .select('id')
      .single();

    if (error) {
      console.error("Error adding pending task:", error);
      return { success: false, error: error.message };
    }

    // Send initial notification to the assigned user
    await addNotification({
      userId: taskData.assignedTo,
      title: "⚠️ Pending Agreement Upload",
      message: `Agreement for "${taskData.clientName}" needs signed document upload within ${taskData.tatDays} days. Value: ${taskData.value}`,
      type: "warning",
      relatedItemType: "agreement",
      relatedItemId: taskData.agreementId,
    });

    return { success: true, id: data.id };
  } catch (error: any) {
    console.error("Error adding pending task:", error);
    return { success: false, error: error.message };
  }
};

// Subscribe to pending tasks for a specific user
export const subscribeToPendingTasks = (
  userId: string,
  callback: (tasks: PendingTask[]) => void
) => {
  // Guard: don't query if userId is empty (user not yet authenticated)
  if (!userId) {
    callback([]);
    return () => {};
  }

  const fetchTasks = async () => {
    const { data, error } = await supabaseClient
      .from(TABLE)
      .select('*')
      .eq('assigned_to', userId)
      .eq('status', 'pending')
      .order('due_date', { ascending: true });

    if (error) {
      console.error("Error fetching pending tasks:", error);
      callback([]);
      return;
    }
    callback((data || []).map(mapRow));
  };

  fetchTasks();

  const channel = supabaseClient
    .channel(`pending-tasks-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => {
      fetchTasks();
    })
    .subscribe();

  return () => {
    supabaseClient.removeChannel(channel);
  };
};

// Subscribe to all pending tasks (for admin view)
export const subscribeToAllPendingTasks = (
  callback: (tasks: PendingTask[]) => void
) => {
  const fetchTasks = async () => {
    const { data, error } = await supabaseClient
      .from(TABLE)
      .select('*')
      .in('status', ['pending', 'overdue'])
      .order('due_date', { ascending: true });

    if (error) {
      console.error("Error fetching all pending tasks:", error);
      callback([]);
      return;
    }
    callback((data || []).map(mapRow));
  };

  fetchTasks();

  const channel = supabaseClient
    .channel('pending-tasks-all')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => {
      fetchTasks();
    })
    .subscribe();

  return () => {
    supabaseClient.removeChannel(channel);
  };
};

// Mark task as completed
export const completePendingTask = async (taskId: string) => {
  try {
    const { error } = await supabaseClient
      .from(TABLE)
      .update({
        status: 'completed',
        // completed_at set by DB trigger (trg_pending_tasks_completed_at)
      })
      .eq('id', taskId);

    if (error) {
      console.error("Error completing pending task:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error: any) {
    console.error("Error completing pending task:", error);
    return { success: false, error: error.message };
  }
};

// Mark task as overdue
export const markTaskOverdue = async (taskId: string) => {
  try {
    const { error } = await supabaseClient
      .from(TABLE)
      .update({ status: 'overdue' })
      .eq('id', taskId);

    if (error) {
      console.error("Error marking task overdue:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error: any) {
    console.error("Error marking task overdue:", error);
    return { success: false, error: error.message };
  }
};

// Send reminder notification for a pending task
export const sendTaskReminder = async (task: PendingTask) => {
  try {
    const dueDate = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
    const now = new Date();
    const daysRemaining = Math.ceil(
      (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    let urgency = "";
    let notificationType: "warning" | "error" = "warning";

    if (daysRemaining <= 0) {
      urgency = "🚨 OVERDUE";
      notificationType = "error";
    } else if (daysRemaining <= 2) {
      urgency = "🔴 URGENT";
      notificationType = "error";
    } else if (daysRemaining <= 5) {
      urgency = "🟠 Due Soon";
      notificationType = "warning";
    } else {
      urgency = "🟡 Reminder";
      notificationType = "warning";
    }

    await addNotification({
      userId: task.assignedTo,
      title: `${urgency}: Agreement Upload Pending`,
      message: `Agreement for "${task.clientName}" needs signed document upload. ${
        daysRemaining > 0
          ? `${daysRemaining} day${daysRemaining > 1 ? "s" : ""} remaining.`
          : "This task is overdue!"
      } Value: ${task.value}`,
      type: notificationType,
      relatedItemType: "agreement",
      relatedItemId: task.agreementId,
    });

    // Update reminder count
    if (task.id) {
      await supabaseClient
        .from(TABLE)
        .update({
          reminders_sent: (task.remindersSent || 0) + 1,
          last_reminder_at: new Date().toISOString(),
        })
        .eq('id', task.id);
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error sending task reminder:", error);
    return { success: false, error: error.message };
  }
};

// Get pending task by agreement ID
export const getPendingTaskByAgreementId = async (agreementId: string) => {
  try {
    const { data, error } = await supabaseClient
      .from(TABLE)
      .select('*')
      .eq('agreement_id', agreementId)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error getting pending task:", error);
      return { success: false, error: error.message, data: null };
    }

    return {
      success: true,
      data: data ? mapRow(data) : null,
    };
  } catch (error: any) {
    console.error("Error getting pending task:", error);
    return { success: false, error: error.message, data: null };
  }
};

// Calculate days remaining for a task
export const calculateDaysRemaining = (dueDate: Date): number => {
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  const now = new Date();
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

// Delete a pending task
export const deletePendingTask = async (taskId: string) => {
  try {
    const { error } = await supabaseClient
      .from(TABLE)
      .delete()
      .eq('id', taskId);

    if (error) {
      console.error("Error deleting pending task:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting pending task:", error);
    return { success: false, error: error.message };
  }
};
