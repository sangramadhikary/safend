/**
 * Work-order outstanding-balance detection — the single source of truth for
 * "how much is still unpaid on THIS work order" used when raising a new
 * invoice and carrying previous dues forward.
 *
 * FUNDAMENTAL: billing is per WORK ORDER, not per client. A client can hold
 * several work orders, each billed and settled independently, so the previous
 * due carried into a new invoice must be scoped to the SAME work order — never
 * the client's other work orders. (Summing across the whole client was wrong:
 * it pulled unrelated work orders' invoices into one work order's bill.)
 *
 * Design notes:
 *
 * 1. MATCHING. Match strictly on `work_order_id`. When there is no work order
 *    (New Customer one-off invoices, and generate-from-duty invoices that never
 *    persist a work_order_id) there is no reliable scope to carry a balance
 *    forward from, so we return nothing rather than over-collecting. The user
 *    can still enter a previous-due figure manually.
 *
 * 2. AMOUNT OWED PER INVOICE. An invoice's real debt is:
 *        (its own remaining charges) + (its carried-forward previous_balance)
 *    where "own remaining charges" is the "Balance: ₹Y" figure recorded in
 *    notes after a partial payment, else `total_amount` (which excludes
 *    previous_balance). previous_balance is included because it can be the only
 *    place an older unpaid amount for this work order is recorded.
 *
 * 3. NO DOUBLE COUNTING. If an older invoice both (a) still exists as its own
 *    unpaid row and (b) was rolled into a newer invoice (via structured
 *    previous_balance_breakdown, or the legacy free-text "Outstanding: <ref>"
 *    note), counting both double-counts it. Such already-rolled-forward
 *    references are dropped.
 *
 * 4. SELF-EXCLUSION. When editing an existing invoice we must not count that
 *    same invoice as its own previous due.
 */

/**
 * Minimal structural type for the query surface we use. Accepts both the real
 * `@supabase/supabase-js` client and the app's hand-rolled `supabaseClient`
 * facade (which only re-exports `.from()` and friends).
 */
interface QueryableClient {
  from: (table: string) => any;
}

export interface OutstandingInvoice {
  /** Invoice reference number (or em dash when missing). */
  ref: string;
  /** Remaining amount owed on this invoice = own balance + carried previous balance. */
  amount: number;
  /** The invoice's own remaining charges (excludes carried-forward previous balance). */
  ownAmount: number;
  /** Previous balance carried forward on this invoice (0 when none). */
  previousBalance: number;
  /** Due date (ISO string) or null. */
  due_date: string | null;
  /** Display status for the outstanding panel: 'overdue' once past due, else 'open'. */
  status: 'overdue' | 'open';
}

/** Statuses that represent an unpaid invoice still carrying a balance. */
const UNPAID_STATUSES = ['created', 'issued', 'open', 'pending', 'overdue'];

/** Parse the remaining balance recorded in notes after a partial payment. */
function parseBalanceFromNotes(notes: string | null): number | null {
  if (!notes) return null;
  const m = notes.match(/Balance:\s*₹?([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const value = parseFloat(m[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

/** Collect reference numbers that have already been rolled into another invoice. */
function collectRolledForwardRefs(rows: any[]): Set<string> {
  const refs = new Set<string>();
  for (const r of rows) {
    // (a) Structured breakdown (newer invoices).
    const breakdown = r.previous_balance_breakdown;
    if (Array.isArray(breakdown)) {
      for (const entry of breakdown) {
        const ref = entry?.referenceNumber ?? entry?.reference_number;
        if (ref) refs.add(String(ref));
      }
    }
    // (b) Legacy free-text roll-forward: notes contain
    //     "Outstanding: <ref> (₹amount), <ref> (₹amount)". Historical invoices
    //     recorded the carried-forward invoices here rather than as JSONB, so
    //     we must parse them too or those older invoices get double-counted.
    const outstandingNote = (r.notes || '').match(/Outstanding:\s*([^|]+)/);
    if (outstandingNote) {
      const refMatches = outstandingNote[1].match(/\d{5,}/g);
      if (refMatches) for (const ref of refMatches) refs.add(ref);
    }
  }
  return refs;
}

/** Shape a raw receivables row into an OutstandingInvoice. */
function toOutstanding(r: any, now: Date): OutstandingInvoice {
  const notesBalance = parseBalanceFromNotes(r.notes);
  const ownAmount = notesBalance != null ? notesBalance : Number(r.total_amount) || 0;
  const previousBalance = Number(r.previous_balance) || 0;
  const isPastDue = !!r.due_date && new Date(r.due_date) < now;
  return {
    ref: r.reference_number || '—',
    amount: ownAmount + previousBalance,
    ownAmount,
    previousBalance,
    due_date: r.due_date ?? null,
    status: isPastDue ? 'overdue' : 'open',
  };
}

/**
 * Fetch the unpaid invoices for a single WORK ORDER and the amount still owed
 * on each. Scoped to the work order so a client's other work orders are never
 * pulled in.
 *
 * @param supabase     A Supabase client instance.
 * @param workOrderId  The work order the new invoice belongs to. When null/blank,
 *                     there is no scope to carry forward from and [] is returned.
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
    .select('reference_number, total_amount, previous_balance, previous_balance_breakdown, due_date, status, notes')
    .eq('category', 'Invoices')
    .in('status', UNPAID_STATUSES)
    .eq('work_order_id', woId)
    .order('due_date', { ascending: true });

  if (error || !data) return [];

  const now = new Date();
  // Refs already carried forward by a newer invoice — skip so we never
  // double-count an older invoice that lives both on its own row and inside a
  // newer invoice's previous balance.
  const rolledForward = collectRolledForwardRefs(data);

  return data
    .filter((r: any) => !excludeRef || r.reference_number !== excludeRef)
    .filter((r: any) => !r.reference_number || !rolledForward.has(String(r.reference_number)))
    .map((r: any) => toOutstanding(r, now))
    .filter((r) => r.amount > 0);
}

/** Sum the remaining balances of a set of outstanding invoices (rounded). */
export function sumOutstanding(invoices: OutstandingInvoice[]): number {
  return Math.round(invoices.reduce((s, r) => s + r.amount, 0));
}
