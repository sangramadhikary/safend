/**
 * Typed wrappers for the invoice ledger database functions
 * (supabase/migrations/20261029000000_invoice_ledger_integrity.sql).
 *
 * Every money-changing invoice operation goes through one of these. Each
 * function checks the caller's role and runs in a single transaction, so the
 * screens never write receivables.status, paid amounts or payment rows
 * themselves.
 */

import { supabaseClient } from '@/integrations/supabase/client';

async function call<T>(fn: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseClient.rpc(fn, params);
  if (error) throw new Error(error.message || `${fn} failed`);
  return data as T;
}

export type PaymentMode = 'Bank Transfer' | 'Cheque' | 'Cash';
export type BalanceHandling = 'keep' | 'promise' | 'credit_note';

export interface RecordReceiptInput {
  target_id: string;
  carried_ids?: string[];
  cash_amount: number;
  /** TDS withheld per invoice id. */
  tds?: Record<string, number>;
  mode: PaymentMode | 'Imported' | 'Adjustment';
  received_by?: string | null;
  cheque_number?: string | null;
  cheque_date?: string | null;
  deposit_account_id?: string | null;
  bank_account_id?: string | null;
  transaction_number?: string | null;
  transaction_datetime?: string | null;
  payment_date?: string | null;
  balance_handling?: BalanceHandling;
  promise_date?: string | null;
  credit_note_reason?: string | null;
  branch_id?: string | null;
  /** false = do not post to the bank/cash/cheque registers. */
  ledger?: boolean;
}

export interface RecordReceiptResult {
  receipt_id: string;
  allocations: Array<{ receivable_id: string; reference_number: string | null; cash: number; tds: number;
    outstanding_before: number; outstanding_after: number }>;
  credit_note: { id: string; reference_number: string; amount: number } | null;
  invoices: Array<{ id: string; reference_number: string | null; status: string; balance: number }>;
}

export const recordReceipt = (p: RecordReceiptInput) =>
  call<RecordReceiptResult>('record_receipt', { p });

export const undoLastReceipt = (receivableId: string) =>
  call<{ removed: number; warnings: string[] }>('undo_last_receipt', { p_receivable_id: receivableId });

/** Fields create_invoice accepts. The number is allocated by the database. */
export interface CreateInvoiceInput {
  client_name: string;
  description: string;
  amount: number;
  gst_amount: number | null;
  total_amount: number;
  due_date: string;
  line_items?: unknown[] | null;
  client_gstin?: string | null;
  client_address?: string | null;
  place_of_supply?: string | null;
  gst_type?: string | null;
  gst_treatment?: string | null;
  service_period_start?: string | null;
  service_period_end?: string | null;
  work_order_id?: string | null;
  previous_balance?: number | null;
  previous_balance_breakdown?: unknown[] | null;
  opening_balance?: number | null;
  tds_rate?: number | null;
  notes?: string | null;
  branch_id?: string | null;
  /**
   * Record a payment in the same transaction (record_receipt shape, without
   * target_id). tds_amount = TDS withheld on this new invoice; `tds` keys other
   * (carried) invoices by id.
   */
  payment?: (Omit<RecordReceiptInput, 'target_id'> & { tds_amount?: number | null }) | null;
}

/** Placeholder replaced by the allocated invoice number in description and notes. */
export const INVOICE_NUMBER_PLACEHOLDER = '{{INVOICE_NO}}';

export const createInvoice = (invoice: CreateInvoiceInput) =>
  call<Record<string, any> & { id: string; reference_number: string }>('create_invoice', { p_invoice: invoice });

export const cancelInvoice = (receivableId: string, reason: string) =>
  call<Record<string, any>>('cancel_invoice', { p_receivable_id: receivableId, p_reason: reason });

export const deleteDraftInvoice = (receivableId: string, reason: string) =>
  call<{ deleted: boolean; reference_number: string | null }>('delete_draft_invoice', { p_receivable_id: receivableId, p_reason: reason });

export const reviewInvoiceDeleteRequest = (requestId: string, decision: 'approve' | 'reject', reviewer: string) =>
  call<{ action: 'deleted' | 'cancelled' | 'rejected' | 'missing' | 'already_cancelled' }>(
    'review_invoice_delete_request', { p_request_id: requestId, p_decision: decision, p_reviewer: reviewer });

export const bounceCheque = (chequeId: string, reason?: string | null) =>
  call<{ reversed: number }>('bounce_cheque', { p_cheque_id: chequeId, p_reason: reason ?? null });

export interface ImportInvoiceRow {
  reference_number: string;
  client_name: string;
  client_gstin?: string | null;
  description?: string | null;
  total_amount: number;
  received_amount?: number | null;
  invoice_date?: string | null;
  due_date?: string | null;
  status?: string | null;
  notes?: string | null;
  work_order_id?: string | null;
  branch_id?: string | null;
}

export const importInvoices = (rows: ImportInvoiceRow[]) =>
  call<{ imported: number; failed: Array<{ row: number; reference_number: string | null; error: string }> }>(
    'import_invoices', { p_rows: rows });

export const markOverdueReceivables = () =>
  call<{ overdue_marked: number; tasks: Array<{ id: string; receivable_id: string; assigned_to: string | null;
    client_name: string | null; reference_number: string | null; amount: number; days_overdue: number }> }>(
    'mark_overdue_receivables', {});

export const refreshCollectionTasks = () => call<number>('refresh_collection_tasks', {});

/**
 * True for a never-issued, unpaid draft: the only kind of invoice that can be
 * edited or deleted. Everything else is frozen and must be cancelled.
 */
export function isDraftInvoice(row: { status?: string | null; issued_at?: string | null; paid_amount?: number | string | null }): boolean {
  return row.status === 'created' && !row.issued_at && !(Number(row.paid_amount) > 0);
}
