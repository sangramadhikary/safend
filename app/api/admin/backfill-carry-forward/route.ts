import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { computeOutstandingFromRows, sumOutstanding, OUTSTANDING_COLUMNS } from '@/lib/invoice/outstanding';

/**
 * POST /api/admin/backfill-carry-forward
 *
 * Fills previous_balance / previous_balance_breakdown on DRAFT invoices that
 * were raised without them, listing the older unpaid invoices of the SAME
 * WORK ORDER with their live balances.
 *
 * Under the invoice ledger (supabase/migrations/20261029000000_invoice_ledger_integrity.sql)
 * these two columns are informational: they print as "Previous Due". The older
 * invoices stay the debtors of their own balances, so this route never touches
 * opening_balance and never moves money.
 *
 *   - Grouped by work_order_id only. Invoices without a work order are skipped
 *     (there is no client-name grouping).
 *   - Only drafts are updated (status 'created', issued_at null, paid_amount 0).
 *     The database freezes everything else.
 *   - Only drafts with no previous balance yet, so re-running is safe.
 *   - Balances come from the ledger columns (computeOutstandingFromRows), never
 *     from notes.
 *
 * Auth: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>.
 * Body: { "apply": true } writes the changes. Anything else is a dry run that
 * reports what would change.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PAGE_SIZE = 1000;
const COLUMNS = `${OUTSTANDING_COLUMNS}, issued_at, previous_balance, previous_balance_breakdown`;

/** Constant-time comparison; hashing first gives equal-length buffers. */
function secretMatches(provided: string, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Same rule as isDraftInvoice in src/services/invoiceLedgerService.ts. */
function isDraft(row: { status?: string | null; issued_at?: string | null; paid_amount?: number | string | null }): boolean {
  return row.status === 'created' && !row.issued_at && !(Number(row.paid_amount) > 0);
}

const hasBreakdown = (value: unknown) => Array.isArray(value) && value.length > 0;
const timeOf = (value: unknown) => {
  const t = new Date(String(value ?? '')).getTime();
  return Number.isNaN(t) ? null : t;
};

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!secretMatches(token, SUPABASE_SERVICE_ROLE_KEY)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Dry run unless the body explicitly says { "apply": true }.
  const body = await req.json().catch(() => null);
  const apply = body?.apply === true;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1. Every invoice that belongs to a work order (paged past the API cap) ─
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('receivables')
      .select(COLUMNS)
      .eq('category', 'Invoices')
      .not('work_order_id', 'is', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      return NextResponse.json({ error: `Failed to load invoices: ${error.message}` }, { status: 500 });
    }
    rows.push(...((data ?? []) as any[]));
    if (!data || data.length < PAGE_SIZE) break;
  }

  // ── 2. Group by work order only ─────────────────────────────────────────────
  const byWorkOrder = new Map<string, any[]>();
  for (const row of rows) {
    const woId = String(row.work_order_id);
    if (!byWorkOrder.has(woId)) byWorkOrder.set(woId, []);
    byWorkOrder.get(woId)!.push(row);
  }

  // ── 3. Drafts with no previous balance, and the older invoices they list ──
  const updates: Array<{
    id: string;
    reference_number: string | null;
    client_name: string | null;
    work_order_id: string;
    new_previous_balance: number;
    new_breakdown: Array<{ id: string | null; referenceNumber: string; date: string | null; amount: number }>;
  }> = [];

  for (const [woId, group] of byWorkOrder) {
    for (const row of group) {
      if (!isDraft(row)) continue;
      if (Number(row.previous_balance) > 0 || hasBreakdown(row.previous_balance_breakdown)) continue;
      const created = timeOf(row.created_at);
      if (created === null) continue;

      // Older invoices of the same work order, at their live balances.
      const older = group.filter((r) => r.id !== row.id && (timeOf(r.created_at) ?? Infinity) < created);
      const outstanding = computeOutstandingFromRows(older, row.reference_number || null);
      if (outstanding.length === 0) continue;

      const total = sumOutstanding(outstanding);
      if (total <= 0) continue;
      updates.push({
        id: row.id,
        reference_number: row.reference_number ?? null,
        client_name: row.client_name ?? null,
        work_order_id: woId,
        new_previous_balance: total,
        new_breakdown: outstanding.map((o) => ({
          id: o.id, referenceNumber: o.ref, date: o.due_date ?? null, amount: o.amount,
        })),
      });
    }
  }

  if (!apply) {
    return NextResponse.json({ dry_run: true, would_update: updates.length, updates });
  }

  // ── 4. Apply. The filters re-check draft status at write time, so a draft
  //       issued or paid since it was read is left alone. ───────────────────
  const results: Array<{ id: string; reference_number: string | null; ok: boolean; error?: string }> = [];
  for (const u of updates) {
    const { data, error } = await admin
      .from('receivables')
      .update({
        previous_balance: u.new_previous_balance,
        previous_balance_breakdown: u.new_breakdown,
      })
      .eq('id', u.id)
      .eq('status', 'created')
      .is('issued_at', null)
      .eq('paid_amount', 0)
      .select('id');

    if (error) {
      results.push({ id: u.id, reference_number: u.reference_number, ok: false, error: error.message });
    } else if (!data || data.length === 0) {
      results.push({ id: u.id, reference_number: u.reference_number, ok: false, error: 'No longer a draft; skipped.' });
    } else {
      results.push({ id: u.id, reference_number: u.reference_number, ok: true });
    }
  }

  return NextResponse.json({
    dry_run: false,
    updated: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
