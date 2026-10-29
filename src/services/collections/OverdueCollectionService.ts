'use client';

import { supabaseClient } from '@/integrations/supabase/client';
import { addNotification } from '@/services/supabase/NotificationService';
import { markOverdueReceivables, refreshCollectionTasks } from '@/services/invoiceLedgerService';
import { amountDue, type LedgerRow } from '@/lib/invoice/ledger';

/**
 * Collections for overdue invoices.
 *
 * The overdue rules live in the database (supabase/migrations/
 * 20261029000000_invoice_ledger_integrity.sql). mark_overdue_receivables()
 * flags invoices and debit notes that are past due and still owe money, and
 * opens one task per item for the amount still owed. refresh_collection_tasks()
 * keeps each open task's amount and age in step with its invoice and closes
 * tasks whose invoice is settled or cancelled. This module calls those and reads
 * the tasks back. Resolving a task never touches the invoice: the invoice is
 * settled only by recording the payment in Accounts → Receivables.
 */

export interface CollectionTask {
  id: string;
  receivable_id: string;
  assigned_to: string | null;
  client_name: string | null;
  invoice_description: string | null;
  /** What the invoice still owes. fetchCollectionTasks reads it from the invoice's ledger columns. */
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
  /** The invoice behind the task, set by fetchCollectionTasks; null when it could not be read. */
  invoice?: CollectionInvoice | null;
}

/** The invoice columns a collection task needs to show a live balance. */
export type CollectionInvoice = LedgerRow & { id: string; due_date?: string | null };

const INVOICE_COLUMNS =
  'id, category, status, reference_number, created_at, due_date, amount, total_amount, '
  + 'opening_balance, paid_amount, tds_credited, credit_applied';

/** Invoice ids per request, so the query string stays short. */
const ID_BATCH = 100;

/**
 * Flag overdue invoices, open collection tasks for them and notify the sales
 * users they were assigned to. Called when the accounts or sales screens open;
 * the database also runs the sweep nightly when pg_cron is available.
 *
 * 1. mark_overdue_receivables(): past-due invoices that still owe money become
 *    'overdue', and each one without an open task gets a task for the amount
 *    still owed, assigned round-robin to the sales team.
 * 2. refresh_collection_tasks(): open tasks take their invoice's current balance
 *    and age; tasks whose invoice is settled or cancelled are closed.
 *
 * Never throws: failures are returned in `errors`.
 */
export async function checkAndAssignOverdueCollections(): Promise<{
  overdueCount: number;
  tasksCreated: number;
  errors: string[];
}> {
  const result = { overdueCount: 0, tasksCreated: 0, errors: [] as string[] };

  try {
    const sweep = await markOverdueReceivables();
    const tasks = sweep?.tasks ?? [];
    result.overdueCount = sweep?.overdue_marked ?? 0;
    result.tasksCreated = tasks.length;

    for (const task of tasks) {
      if (!task.assigned_to) continue;
      const ref = task.reference_number ? ` ${task.reference_number}` : '';
      await addNotification({
        userId: task.assigned_to,
        title: '🔴 New Collection Task Assigned',
        message: `Overdue invoice${ref} from "${task.client_name || 'Unknown'}": ₹${Number(task.amount).toLocaleString('en-IN')} still due (${task.days_overdue} days overdue). Please follow up.`,
        type: 'warning',
        relatedItemType: 'collections',
        relatedItemId: task.receivable_id,
      });
    }
  } catch (err: any) {
    result.errors.push(`Overdue check failed: ${err?.message || String(err)}`);
  }

  try {
    await refreshCollectionTasks();
  } catch (err: any) {
    result.errors.push(`Collection task refresh failed: ${err?.message || String(err)}`);
  }

  return result;
}

/**
 * Fetch collection tasks (for the sales collections tab). The amount of each
 * open task is what its invoice still owes, worked out from the invoice's
 * ledger columns, so totals never rely on a stale task amount. Resolved tasks
 * keep the amount they were closed at.
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
  return attachInvoices((data ?? []) as CollectionTask[]);
}

async function attachInvoices(tasks: CollectionTask[]): Promise<CollectionTask[]> {
  const ids = [...new Set(tasks.map((t) => t.receivable_id).filter(Boolean))];
  const byId = new Map<string, CollectionInvoice>();
  for (let i = 0; i < ids.length; i += ID_BATCH) {
    const { data, error } = await supabaseClient
      .from('receivables')
      .select(INVOICE_COLUMNS)
      .in('id', ids.slice(i, i + ID_BATCH));
    if (error) {
      console.error('Error fetching the invoices of collection tasks:', error);
      return tasks;
    }
    for (const row of (data ?? []) as unknown as CollectionInvoice[]) byId.set(row.id, row);
  }
  return tasks.map((task) => {
    const invoice = byId.get(task.receivable_id) ?? null;
    if (!invoice || task.status === 'resolved') return { ...task, invoice };
    return { ...task, invoice, amount: amountDue(invoice) };
  });
}

/**
 * Update a collection task's status. Resolving closes the task only. The
 * invoice is not marked paid: the payment is recorded in Accounts →
 * Receivables, which settles the invoice and closes its open tasks itself.
 */
export async function updateCollectionTaskStatus(
  taskId: string,
  status: CollectionTask['status'],
  notes?: string
): Promise<boolean> {
  const updateData: Record<string, unknown> = { status };
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
  return true;
}

/**
 * Bring every open task's amount, days overdue and priority up to date from its
 * invoice, and close tasks whose invoice is settled or cancelled. Best effort:
 * a failure is logged, never thrown.
 */
export async function refreshOverdueDays(): Promise<void> {
  try {
    await refreshCollectionTasks();
  } catch (err) {
    console.warn('Collection task refresh failed:', err);
  }
}
