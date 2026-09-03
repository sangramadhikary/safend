/**
 * Invoice Number Service
 *
 * Format: PPPPSSSS
 *   PPPP = financial-year prefix — FY start + end year, 2 digits each
 *          (FY 2026-27 → "2627", rolling over on 1 April)
 *   SSSS = zero-padded sequential number starting at 0001
 *
 * Rule 46(b) requires a consecutive serial number, unique within a financial
 * year. Three things previously broke that:
 *
 *   1. The prefix came from `new Date()` rather than the invoice date, so an
 *      invoice dated either side of 1 April was filed under the wrong FY.
 *   2. Allocation was "read the highest, add one" from the client with no lock,
 *      so two concurrent users were handed the same number.
 *   3. Cancelled numbers were recycled out of `deleted_invoice_numbers`, so a
 *      cancelled document and a live one shared a serial.
 *
 * Now: the prefix is derived from the invoice date, allocation goes through the
 * atomic `next_invoice_number()` database function, and numbers are never
 * reused — a cancelled invoice leaves a gap and its value is reversed by credit
 * note, which is the correct treatment.
 *
 * See supabase/migrations/20260802000000_invoice_compliance.sql.
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

export interface AllocatedInvoiceNumber {
  number: string;
  fyPrefix: string;
  /** Always false. Retained so existing call sites keep type-checking. */
  isReused: false;
  reusedFrom?: undefined;
}

/**
 * Allocates the next invoice number for the financial year containing
 * `invoiceDate`.
 *
 * The allocation is atomic and server-side: `next_invoice_number()` performs an
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING` against a counter row, so
 * concurrent callers are serialised by Postgres rather than racing.
 *
 * Allocation CONSUMES a serial. Call it when the invoice is actually being
 * saved, not to populate a preview — an abandoned form would otherwise burn a
 * number and leave a gap.
 */
export async function getNextInvoiceNumber(
  invoiceDate?: string | Date | null
): Promise<AllocatedInvoiceNumber> {
  const prefix = getFYPrefixForDate(parseInvoiceDate(invoiceDate) ?? new Date());

  const { data, error } = await supabaseClient.rpc('next_invoice_number', {
    p_fy_prefix: prefix,
  });

  if (error || !data) {
    throw new Error(
      `Could not allocate an invoice number for FY ${prefix}: ${
        error?.message ?? 'no number returned'
      }. Invoice numbers must be issued in sequence, so the invoice was not saved.`
    );
  }

  return { number: String(data), fyPrefix: prefix, isReused: false };
}

/**
 * Peeks at the number that would be allocated next, WITHOUT consuming it.
 *
 * For previews only. The displayed value is advisory: another user may take it
 * first, and the number actually written is the one returned by
 * getNextInvoiceNumber() at save time.
 *
 * Now accounts for gap-filling: if a serial in [1..lastSeq] has no matching
 * invoice in receivables, the peek returns that gap (matching the DB function).
 */
export async function peekNextInvoiceNumber(
  invoiceDate?: string | Date | null
): Promise<{ number: string; fyPrefix: string; provisional: true }> {
  const prefix = getFYPrefixForDate(parseInvoiceDate(invoiceDate) ?? new Date());

  // Read the current high-water mark
  const { data: counterData } = await supabaseClient
    .from('invoice_number_counters')
    .select('last_seq')
    .eq('fy_prefix', prefix)
    .maybeSingle();

  const lastSeq = Number(counterData?.last_seq) || 0;

  if (lastSeq === 0) {
    // No counter exists — first invoice for this FY
    return { number: `${prefix}0001`, fyPrefix: prefix, provisional: true };
  }

  // Check for gaps: find the lowest serial in [1..lastSeq] that doesn't exist
  // in receivables. Query existing invoice numbers for this prefix.
  const { data: existingInvoices } = await supabaseClient
    .from('receivables')
    .select('reference_number')
    .eq('category', 'Invoices')
    .like('reference_number', `${prefix}%`);

  const existingNumbers = new Set(
    (existingInvoices ?? []).map((r: any) => r.reference_number)
  );

  // Find first gap
  for (let seq = 1; seq <= lastSeq; seq++) {
    const candidate = `${prefix}${String(seq).padStart(4, '0')}`;
    if (!existingNumbers.has(candidate)) {
      return { number: candidate, fyPrefix: prefix, provisional: true };
    }
  }

  // No gap — next is lastSeq + 1
  const next = lastSeq + 1;
  return { number: `${prefix}${String(next).padStart(4, '0')}`, fyPrefix: prefix, provisional: true };
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
