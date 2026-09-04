/**
 * Client outstanding-balance detection — the single source of truth for
 * "how much does this client still owe from prior invoices" used when raising
 * a new invoice and carrying previous dues forward.
 *
 * Design notes (why this is not just a naive query):
 *
 * 1. MATCHING. Invoices for the same client can be stored with:
 *      - a specific work_order_id (One-Time form, Existing Customer),
 *      - a NULL work_order_id (One-Time New Customer, and EVERY invoice from the
 *        Generate-from-duty dialog, which never writes work_order_id), or
 *      - a DIFFERENT work_order_id (the client has more than one work order).
 *    The previous `.or(work_order_id.eq.X, and(work_order_id.is.null, name=Y))`
 *    filter silently dropped same-client invoices tied to a different work
 *    order. We instead match every invoice for the client by a normalised
 *    (trim + case-insensitive) client name, which is stable across both
 *    creation paths.
 *
 * 2. AMOUNT OWED PER INVOICE. An invoice's real debt is:
 *        (its own remaining charges) + (its carried-forward previous_balance)
 *    where "own remaining charges" is the "Balance: ₹Y" figure recorded in
 *    notes after a partial payment, else `total_amount` (which excludes
 *    previous_balance). The previous_balance MUST be included: it can be the
 *    only place an older unpaid amount is recorded when that older amount was
 *    never raised as its own invoice row (e.g. it was entered directly as a
 *    "Previous Due" when the invoice was created).
 *
 * 3. NO DOUBLE COUNTING. If an older invoice both (a) still exists as its own
 *    unpaid row and (b) was rolled into a newer invoice's previous_balance,
 *    counting both would double it. We therefore drop any invoice whose
 *    reference number appears inside another invoice's
 *    previous_balance_breakdown (i.e. it has already been carried forward).
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
    const breakdown = r.previous_balance_breakdown;
    if (Array.isArray(breakdown)) {
      for (const entry of breakdown) {
        const ref = entry?.referenceNumber ?? entry?.reference_number;
        if (ref) refs.add(String(ref));
      }
    }
  }
  return refs;
}

/**
 * Fetch a client's outstanding (unpaid) invoices and the amount still owed on
 * each. Matches by normalised client name so invoices across multiple work
 * orders — or with no work order — are all included.
 *
 * @param supabase        A Supabase client instance.
 * @param clientName      The client's name as entered/selected.
 * @param excludeRef      Reference number of the invoice being edited, to skip.
 */
export async function fetchClientOutstandingInvoices(
  supabase: QueryableClient,
  clientName: string,
  excludeRef: string | null = null,
): Promise<OutstandingInvoice[]> {
  const normalised = (clientName || '').trim();
  if (!normalised) return [];

  // Escape LIKE metacharacters so a name such as "A_B Ltd" is matched
  // literally rather than treating "_"/"%" as wildcards.
  const pattern = normalised.replace(/[\\%_]/g, (c) => `\\${c}`);

  const { data, error } = await supabase
    .from('receivables')
    .select('reference_number, total_amount, previous_balance, previous_balance_breakdown, due_date, status, notes')
    .eq('category', 'Invoices')
    .in('status', UNPAID_STATUSES)
    // Case-insensitive exact match on the trimmed client name. ilike with no
    // wildcards behaves as a case-insensitive equals; this tolerates the
    // capitalisation/whitespace differences seen between creation paths.
    .ilike('client_name', pattern)
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
    .map((r: any): OutstandingInvoice => {
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
    })
    .filter((r) => r.amount > 0);
}

/** Sum the remaining balances of a set of outstanding invoices (rounded). */
export function sumOutstanding(invoices: OutstandingInvoice[]): number {
  return Math.round(invoices.reduce((s, r) => s + r.amount, 0));
}
