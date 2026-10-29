/**
 * Freeze the issued invoices, credit notes and debit notes that have no frozen copy.
 *
 * Invoices issued before snapshotting existed carry no receivables.invoice_snapshot,
 * so every View and download rebuilds them from the current code. This writes the
 * frozen copy once, from the figures recorded on each row, through the SAME builder
 * the PDF route uses (buildInvoiceViewData -> documentFromViewData -> snapshotOf).
 * Each copy is marked frozenFrom 'recorded-figures' with frozenOn = today (IST),
 * so it stays identifiable as frozen after the fact.
 *
 * Selected: category 'Invoices' or 'Invoice Adjustments', invoice_snapshot null,
 * not cancelled, and not a draft (draft = status 'created', issued_at null,
 * paid_amount 0). Rows whose document is blocked (e.g. IRN missing) are skipped.
 *
 * Usage (from the repo root):
 *   npx -y tsx scripts/maintenance/freeze-issued-invoices.mts           # dry run
 *   npx -y tsx scripts/maintenance/freeze-issued-invoices.mts --apply   # write
 *
 * Only invoice_snapshot is written, filtered on .is('invoice_snapshot', null);
 * issued_at and status are left alone. The database allows a null snapshot to be
 * written once on an issued row and refuses to replace it.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { snapshotOf, type BankDetails, type FreezeMarker } from '../../src/lib/invoice/document.ts';
import {
  buildInvoiceViewData,
  carriedReferenceNumbers,
  documentFromViewData,
  istToday,
  needsBackfillSnapshot,
  originalInvoiceLookup,
} from '../../src/lib/invoice/document-input.ts';

type Row = Record<string, any>;

const APPLY = process.argv.includes('--apply');

function loadEnv(path = '.env.local'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    while (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) {
      v = v.slice(1, -1).trim();
    }
    out[m[1]] = v;
  }
  return out;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.');
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

/** Same bank account the PDF route prints (the first active one). */
async function activeBankAccount(): Promise<Partial<BankDetails> | null> {
  const { data, error } = await db
    .from('bank_accounts')
    .select('account_name, account_number, bank_name, ifsc_code')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const bank: Partial<BankDetails> = {};
  if (data.bank_name) bank.bankName = data.bank_name;
  if (data.account_number) bank.bankAccountNo = data.account_number;
  if (data.ifsc_code) bank.ifscCode = data.ifsc_code;
  if (data.account_name) bank.accountName = data.account_name;
  return bank;
}

async function candidates(): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('receivables')
      .select('*')
      .in('category', ['Invoices', 'Invoice Adjustments'])
      .is('invoice_snapshot', null)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`Could not load receivables: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  // Drafts stay unfrozen; they are frozen on first download.
  return rows.filter(needsBackfillSnapshot);
}

/** Payments, carried invoices and original invoice: the same queries as app/api/invoice-pdf/route.ts. */
async function relations(row: Row): Promise<{ payments: Row[]; carried: Row[]; original: Row | null }> {
  const { data: payments, error: payErr } = await db
    .from('receivable_payments')
    .select('*')
    .eq('receivable_id', row.id)
    .order('created_at', { ascending: true });
  if (payErr) throw new Error(`payments not loaded: ${payErr.message}`);

  const refs = carriedReferenceNumbers(row);
  let carried: Row[] = [];
  if (refs.length > 0 && row.work_order_id) {
    const { data, error } = await db
      .from('receivables')
      .select('*')
      .eq('category', 'Invoices')
      .eq('work_order_id', row.work_order_id)
      .in('reference_number', refs);
    if (error) throw new Error(`earlier invoices not loaded: ${error.message}`);
    carried = data ?? [];
  }

  const lookup = originalInvoiceLookup(row);
  let original: Row | null = null;
  if (lookup) {
    let q = db.from('receivables').select('*').eq('category', 'Invoices');
    q = 'id' in lookup
      ? q.eq('id', lookup.id)
      : q.eq('reference_number', lookup.referenceNumber).eq('client_name', lookup.clientName);
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw new Error(`original invoice not loaded: ${error.message}`);
    original = data ?? null;
  }
  return { payments: payments ?? [], carried, original };
}

const money = (n: unknown) => Number(n ?? 0).toFixed(2);
const pad = (s: unknown, w: number) => String(s ?? '').padEnd(w).slice(0, w);
const padL = (s: unknown, w: number) => String(s ?? '').padStart(w);

async function main() {
  const marker: FreezeMarker = { frozenFrom: 'recorded-figures', frozenOn: istToday() };
  const bank = await activeBankAccount();
  const rows = await candidates();
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${rows.length} issued row(s) without a frozen copy. Freeze date ${marker.frozenOn}.`);
  console.log([pad('reference', 20), pad('category', 11), pad('status', 9), padL('total_amount', 13),
    padL('taxable', 12), padL('gst', 10), padL('printed', 12), pad(' lines', 7), ' action'].join(' '));

  const counts = { ready: 0, written: 0, skippedBlocked: 0, unreconciled: 0, totalMismatch: 0, failed: 0, raced: 0 };
  const blocked: string[] = [];
  const unreconciled: string[] = [];
  const failures: string[] = [];

  for (const row of rows) {
    const label = String(row.reference_number || String(row.id).slice(0, 8));
    let action: string;
    let figures = ['', '', ''];
    let lines = '';
    try {
      const { payments, carried, original } = await relations(row);
      const { doc } = documentFromViewData(buildInvoiceViewData(row, payments, carried, { original }), { bank });
      const ti = doc.taxInvoice;
      figures = [money(ti.taxableValue), money(ti.totalTax), money(ti.invoiceTotal)];
      lines = ti.linesReconciled ? 'yes' : 'NO';
      if (!ti.linesReconciled) {
        counts.unreconciled++;
        unreconciled.push(`${label}: lines add up to ${money(ti.linesTotal)}, recorded taxable value ${money(ti.taxableValue)}`);
      }
      // Credit notes are stored negative and print positive.
      if (Math.abs(Math.round(ti.invoiceTotal * 100)) !== Math.abs(Math.round(Number(row.total_amount ?? 0) * 100))) {
        counts.totalMismatch++;
      }
      if (doc.blockedReasons.length > 0) {
        counts.skippedBlocked++;
        blocked.push(`${label}: ${doc.blockedReasons.join(' ')}`);
        action = 'skip (blocked)';
      } else if (!APPLY) {
        counts.ready++;
        action = 'would write';
      } else {
        const snapshot = snapshotOf(doc, row.issued_at || row.created_at, marker);
        const { data, error } = await db
          .from('receivables')
          .update({ invoice_snapshot: snapshot })
          .eq('id', row.id)
          .is('invoice_snapshot', null)
          .select('id');
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) { counts.raced++; action = 'skip (already frozen)'; }
        else { counts.written++; action = 'written'; }
      }
    } catch (err: any) {
      counts.failed++;
      failures.push(`${label}: ${err?.message ?? err}`);
      action = 'FAILED';
    }
    console.log([pad(label, 20), pad(row.category === 'Invoices' ? 'invoice' : row.adjustment_type || 'note', 11),
      pad(row.status, 9), padL(money(row.total_amount), 13), padL(figures[0], 12), padL(figures[1], 10),
      padL(figures[2], 12), pad(` ${lines}`, 7), ` ${action}`].join(' '));
  }

  console.log('\nSummary');
  console.log(`  rows considered:            ${rows.length}`);
  if (APPLY) {
    console.log(`  written:                    ${counts.written}`);
    console.log(`  already frozen meanwhile:   ${counts.raced}`);
  } else {
    console.log(`  would write:                ${counts.ready}`);
  }
  console.log(`  skipped (blocked):          ${counts.skippedBlocked}`);
  console.log(`  lines not reconciled:       ${counts.unreconciled} (recorded figures are printed regardless)`);
  console.log(`  printed total != recorded:  ${counts.totalMismatch}`);
  console.log(`  failed:                     ${counts.failed}`);
  if (blocked.length) console.log(`\nBlocked:\n  ${blocked.join('\n  ')}`);
  if (unreconciled.length) console.log(`\nLines not reconciled:\n  ${unreconciled.join('\n  ')}`);
  if (failures.length) console.log(`\nFailures:\n  ${failures.join('\n  ')}`);
  if (!APPLY) console.log('\nDry run only. Re-run with --apply to write the frozen copies.');
  if (counts.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
