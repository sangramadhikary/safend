/**
 * Work-order outstanding balances: what is still owed on THIS work order when a
 * new invoice carries previous dues forward.
 *
 * Billing is per work order, so only invoices of the same work order count; a
 * client's other work orders are never pulled in, and an invoice without a work
 * order carries nothing forward (there is no client-name fallback).
 *
 * Each invoice owes its own live balance (see ledger.ts):
 *     total_amount + opening_balance − paid_amount
 * which the database maintains from the payment allocations. Listing an older
 * invoice in a newer invoice's previous_balance_breakdown does not move the
 * debt: the older invoice stays the debtor and is paid first when a receipt
 * covers both. The work order's outstanding is therefore the plain sum of its
 * unpaid invoices' balances. Nothing is suppressed as "rolled forward" and
 * nothing is parsed out of notes, so a balance can be neither double-counted
 * nor lost.
 */

import { amountDue, fromPaise, sumMoney, toPaise, type LedgerRow } from './ledger';

/** Accepts the supabase-js client and the app's `supabaseClient` facade. */
interface QueryableClient {
  from: (table: string) => any;
}

export interface OutstandingInvoice {
  /** Receivable id (null only for hand-built rows). */
  id: string | null;
  /** Invoice reference number (or em dash when missing). */
  ref: string;
  /** Amount still owed on this invoice. */
  amount: number;
  /** Part of `amount` from the invoice's own charges. */
  ownAmount: number;
  /** Part of `amount` from its opening balance (older dues with no invoice on file). */
  previousBalance: number;
  /** Due date (ISO string) or null. */
  due_date: string | null;
  /** Creation timestamp, for oldest-first ordering. */
  created_at: string | null;
  /** 'overdue' once past due, else 'open'. */
  status: 'overdue' | 'open';
}

/** Stored statuses of an invoice that may still owe money. */
export const UNPAID_INVOICE_STATUSES = ['created', 'issued', 'open', 'pending', 'overdue'];

/** Columns needed to compute live balances. */
export const OUTSTANDING_COLUMNS =
  'id, reference_number, client_name, category, status, created_at, due_date, amount, total_amount, '
  + 'opening_balance, paid_amount, tds_credited, credit_applied, tds_rate, work_order_id';

type OutstandingRow = LedgerRow & { due_date?: string | null };

function toOutstanding(r: OutstandingRow, now: Date): OutstandingInvoice {
  const due = toPaise(amountDue(r));
  // Payments settle an invoice's opening balance (the older dues) first.
  const openingLeft = Math.max(0, toPaise(r.opening_balance) - toPaise(r.paid_amount));
  const previous = Math.min(due, openingLeft);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const isPastDue = !!r.due_date && new Date(`${String(r.due_date).slice(0, 10)}T00:00:00`) < today;
  return {
    id: r.id ?? null,
    ref: r.reference_number || '—',
    amount: fromPaise(due),
    ownAmount: fromPaise(due - previous),
    previousBalance: fromPaise(previous),
    due_date: r.due_date ?? null,
    created_at: r.created_at ?? null,
    status: isPastDue ? 'overdue' : 'open',
  };
}

/**
 * Pure core: the unpaid invoices among `rows` (one work order) with what each
 * still owes, oldest first. Shared by the single-work-order fetch and batch
 * views so both show identical figures.
 *
 * @param rows        Receivables rows for one work order (any status).
 * @param excludeRef  Reference number of the invoice being edited, to skip.
 * @param now         "Today" for overdue derivation (injectable for tests).
 */
export function computeOutstandingFromRows(
  rows: any[],
  excludeRef: string | null = null,
  now: Date = new Date(),
): OutstandingInvoice[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows
    .filter((r) => (r.category ?? 'Invoices') === 'Invoices')
    .filter((r) => UNPAID_INVOICE_STATUSES.includes(String(r.status ?? '')))
    .filter((r) => !excludeRef || r.reference_number !== excludeRef)
    .map((r) => toOutstanding(r, now))
    .filter((r) => r.amount > 0.01)
    .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
      || a.ref.localeCompare(b.ref));
}

/**
 * Fetch the unpaid invoices of a single WORK ORDER and what each still owes.
 * Returns [] without querying when no work order is given.
 *
 * @param supabase     A Supabase client.
 * @param workOrderId  The work order the new invoice belongs to.
 * @param excludeRef   Reference number of the invoice being edited, to skip.
 */
export async function fetchWorkOrderOutstandingInvoices(
  supabase: QueryableClient,
  workOrderId: string | null | undefined,
  excludeRef: string | null = null,
): Promise<OutstandingInvoice[]> {
  const woId = (workOrderId || '').trim();
  if (!woId) return [];

  const { data, error } = await supabase
    .from('receivables')
    .select(OUTSTANDING_COLUMNS)
    .eq('category', 'Invoices')
    .in('status', UNPAID_INVOICE_STATUSES)
    .eq('work_order_id', woId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return computeOutstandingFromRows(data, excludeRef);
}

/** Sum of what a set of outstanding invoices still owe, exact to the paisa. */
export function sumOutstanding(invoices: OutstandingInvoice[]): number {
  return sumMoney(invoices.map((r) => r.amount));
}
