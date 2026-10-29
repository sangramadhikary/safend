/**
 * Invoice Number Service
 *
 * Format: PPPPSSSS
 *   PPPP = financial-year prefix — FY start + end year, 2 digits each
 *          (FY 2026-27 → "2627", rolling over on 1 April)
 *   SSSS = zero-padded sequential number starting at 0001
 *
 *   Above 9999 the sequence is printed in plain digits (2627 + 10000 → "262710000").
 *
 * Rule 46(b) requires a consecutive serial number, unique within a financial
 * year. The number is allocated by the database inside create_invoice, in the
 * same transaction as the insert, so concurrent saves cannot share a serial and
 * a failed save does not burn one. The prefix comes from today's date in India
 * (the invoice date is always the creation date). Numbers only move forward:
 * cancelled or deleted invoices leave a gap and are never reissued, and serials
 * already on file (e.g. imported) are skipped.
 *
 * The app never allocates numbers itself (next_invoice_number is not callable
 * by users); it can only preview the next one with peekNextInvoiceNumber.
 *
 * See supabase/migrations/20261029000000_invoice_ledger_integrity.sql.
 */

import { supabaseClient } from '@/integrations/supabase/client';

/** Financial year containing `date` (defaults to today). FY starts 1 April. */
export function getFYPrefixForDate(date: Date = new Date()): string {
  const month = date.getMonth(); // 0-indexed; 3 = April
  const year = date.getFullYear();
  const fyStartYear = month < 3 ? year - 1 : year;
  const startSuffix = String(fyStartYear).slice(-2);
  const endSuffix = String(fyStartYear + 1).slice(-2);
  return `${startSuffix}${endSuffix}`;
}

/**
 * Parses the date formats the invoice UI produces — ISO (yyyy-mm-dd) and the
 * printed DD/MM/YYYY — without letting the browser guess between them.
 */
export function parseInvoiceDate(input?: string | Date | null): Date | null {
  if (!input) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;

  const s = String(input).trim();

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** @deprecated Prefix now depends on the invoice date. Use getFYPrefixForDate. */
export function getCurrentFYPrefix(): string {
  return getFYPrefixForDate();
}

/** FY start and end dates for the financial year containing `date`. */
export function getFYDates(date: Date = new Date()): { start: string; end: string } {
  const month = date.getMonth();
  const year = date.getFullYear();
  const fyStartYear = month < 3 ? year - 1 : year;
  return { start: `${fyStartYear}-04-01`, end: `${fyStartYear + 1}-03-31` };
}

/** @deprecated Use getFYDates(date). */
export function getCurrentFYDates(): { start: string; end: string } {
  return getFYDates();
}

/** Today's date in India (yyyy-mm-dd), the date create_invoice numbers invoices by. */
export function indiaToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Serial as the database formats it: prefix + 4-digit sequence, plain digits above 9999. */
export function formatInvoiceSerial(fyPrefix: string, seq: number): string {
  return `${fyPrefix}${seq > 9999 ? String(seq) : String(seq).padStart(4, '0')}`;
}

/** Serials checked per round trip while skipping numbers already on file. */
const PEEK_BATCH = 50;

/**
 * The number create_invoice would allocate next, WITHOUT consuming it.
 *
 * Mirrors next_invoice_number: the counter's last_seq + 1 for today's FY prefix
 * in India, skipping serials that already exist (e.g. imported). No gap filling:
 * numbers of cancelled or deleted invoices are never reused.
 *
 * Provisional, for display only: another user may save first, and the number
 * the invoice actually gets is the one create_invoice returns.
 */
export async function peekNextInvoiceNumber(): Promise<{ number: string; fyPrefix: string; provisional: true }> {
  const fyPrefix = getFYPrefixForDate(parseInvoiceDate(indiaToday()) ?? new Date());

  const { data: counter, error: counterError } = await supabaseClient
    .from('invoice_number_counters')
    .select('last_seq')
    .eq('fy_prefix', fyPrefix)
    .maybeSingle();
  if (counterError) throw new Error(counterError.message);

  let seq = Number(counter?.last_seq) || 0;
  for (let round = 0; round < 20; round++) {
    const candidates = Array.from({ length: PEEK_BATCH }, (_, i) => formatInvoiceSerial(fyPrefix, seq + 1 + i));
    const { data: taken, error: takenError } = await supabaseClient
      .from('receivables')
      .select('reference_number')
      .eq('category', 'Invoices')
      .in('reference_number', candidates);
    if (takenError) throw new Error(takenError.message);
    const used = new Set((taken ?? []).map((r: { reference_number: string | null }) => r.reference_number));
    const free = candidates.find((c) => !used.has(c));
    if (free) return { number: free, fyPrefix, provisional: true };
    seq += PEEK_BATCH;
  }
  throw new Error(`No free invoice number found after ${formatInvoiceSerial(fyPrefix, seq)}.`);
}

/**
 * Records a cancelled serial for audit.
 *
 * The number is NOT returned to circulation — reissuing it would put two
 * documents on one serial. The row exists so the gap in the sequence is
 * explainable to an auditor.
 */
export async function recordCancelledInvoiceNumber(
  invoiceNumber: string,
  reason?: string
): Promise<void> {
  if (!invoiceNumber || invoiceNumber.length < 8) return;
  try {
    await supabaseClient.from('deleted_invoice_numbers').insert({
      invoice_number: invoiceNumber,
      fy_prefix: invoiceNumber.slice(0, 4),
      // Closed on arrival: this table is an audit trail, not a free list.
      is_used: true,
      notes: reason ?? null,
    });
  } catch {
    // Audit-only — never block cancellation on this.
  }
}

/** @deprecated Renamed to recordCancelledInvoiceNumber. */
export const recordDeletedInvoiceNumber = recordCancelledInvoiceNumber;

/**
 * @deprecated No-op. Numbers are no longer reused, so there is nothing to mark
 * as consumed. Kept so existing call sites keep compiling.
 */
export async function markDeletedNumberAsUsed(_id?: string): Promise<void> {
  /* intentionally empty */
}
