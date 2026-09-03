import { NextRequest, NextResponse } from 'next/server';
import {
  applyExpiry,
  selectExpiryCandidates,
  type ExpiryCandidate,
} from '@/lib/attendance/retention';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

/**
 * GET /api/attendance/maintenance/expire — Pending check-in expiry job
 * (Requirement 15).
 *
 * Vercel Cron invokes maintenance endpoints via **GET**, so the expiry job is a
 * `GET` handler. It is protected by the `CRON_SECRET` bearer token Vercel sends
 * in the `Authorization` header — callers lacking it receive 401 and the job
 * performs no work (design "Cron invocation method").
 *
 * Behavior:
 *  - R15.1: set every `pending` check-in whose `check_in_date` is earlier than
 *    the current calendar date (app time zone) to `expired`.
 *  - R15.6: only `pending` records are ever changed; `approved`/`rejected`
 *    records are left untouched (enforced twice — by the query filter and by
 *    the pure `selectExpiryCandidates` guard).
 *  - R15.3/15.4: once `expired`, a record drops out of the pending Approval
 *    Queue (which reads `status = 'pending'`) and remains in the table for the
 *    audit/expired section — this job never deletes rows.
 *  - R15.5: attendance is never touched — this route only writes
 *    `qr_check_ins.status` and has no access to `shift_attendance`.
 *  - R15.7: records are processed one at a time with per-record error
 *    isolation; a failed update leaves that record `pending` (still in the
 *    queue), records an error, and processing continues with the next record.
 *
 * Vercel Hobby constraints (design "Vercel Hobby plan constraints"):
 *  - `maxDuration = 60` so the job is not cut off by the 10s default.
 *  - Work is bounded to a `MAINTENANCE_BATCH_LIMIT` batch ordered oldest-first;
 *    a large backlog drains over successive daily runs. The transition is
 *    idempotent, so re-processing an already-expired record is a no-op.
 *
 * Uses the established module-level service-role client pattern (as in
 * `app/api/attendance/qr/route.ts`).
 */

// Vercel Hobby functions default to 10s and can be raised only up to 60s.
export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Maximum records processed per invocation. A single daily Hobby run has a 60s
 * ceiling, so the backlog is drained in bounded, oldest-first batches.
 */
const MAINTENANCE_BATCH_LIMIT = 200;

/** The subset of `qr_check_ins` columns the expiry job needs. */
interface ExpireRow extends ExpiryCandidate {
  id: string;
}

/**
 * Determine the current calendar date as `YYYY-MM-DD`. The codebase derives the
 * app's calendar date from the runtime clock via `toISOString().split('T')[0]`
 * (see `RotaAttendanceService`, `useSupervisorData`), and `check_in_date` is
 * stored in that same form; this keeps the comparison consistent across the
 * feature.
 */
function currentCalendarDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Reject any caller that does not present the exact `CRON_SECRET` bearer token.
 * Returns `true` when the request is authorized.
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured — fail closed so the route is never open.
    return false;
  }
  const header = request.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  // ── Authorization: only the Vercel scheduler (CRON_SECRET bearer) may run ──
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentDate = currentCalendarDate();

  // ── Fetch a bounded, oldest-first batch of past-date pending records (R15.1,
  //    R15.6). The DB filter restricts to `pending` + past dates; the pure
  //    `selectExpiryCandidates` guard re-checks eligibility before any write. ──
  let candidates: ExpireRow[];
  try {
    const { data, error } = await supabaseAdmin
      .from('qr_check_ins')
      .select('id, status, check_in_date')
      .eq('status', 'pending')
      .lt('check_in_date', currentDate)
      .order('check_in_date', { ascending: true })
      .limit(MAINTENANCE_BATCH_LIMIT);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to load expiry candidates.', detail: error.message },
        { status: 500 },
      );
    }
    candidates = (data ?? []) as ExpireRow[];
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load expiry candidates.', detail: (error as Error).message },
      { status: 500 },
    );
  }

  const eligible = selectExpiryCandidates(candidates, currentDate);

  // ── Process record-by-record with per-record error isolation (R15.7). ──
  let expired = 0;
  const failed: { id: string; error: string }[] = [];

  for (const record of eligible) {
    const { status: nextStatus } = applyExpiry(record);
    try {
      const { data, error } = await supabaseAdmin
        .from('qr_check_ins')
        .update({ status: nextStatus })
        // Guard on `pending` so a record resolved concurrently (approved/
        // rejected) is never overwritten, and re-runs stay idempotent.
        .eq('id', record.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();

      if (error) {
        // R15.7: leave this record pending, record the error, keep going.
        failed.push({ id: record.id, error: error.message });
        continue;
      }
      if (data) {
        expired += 1;
      }
      // `data === null` means the record was no longer `pending` (resolved
      // concurrently) — nothing to do, not a failure.
    } catch (error) {
      failed.push({ id: record.id, error: (error as Error).message });
    }
  }

  return NextResponse.json({
    ok: true,
    currentDate,
    scanned: candidates.length,
    eligible: eligible.length,
    expired,
    failed: failed.length,
    failures: failed,
    batchLimit: MAINTENANCE_BATCH_LIMIT,
  });
}
