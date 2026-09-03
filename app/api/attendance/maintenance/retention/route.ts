import { NextRequest, NextResponse } from 'next/server';
import {
  isPhotoDeletionDue,
  type PhotoRetentionRecord,
} from '@/lib/attendance/retention';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

/**
 * GET /api/attendance/maintenance/retention — Photo retention/auto-deletion job
 * (Requirement 9).
 *
 * Vercel Cron invokes maintenance endpoints via **GET**, so the retention job
 * is a `GET` handler. It is protected by the `CRON_SECRET` bearer token Vercel
 * sends in the `Authorization` header — callers lacking it receive 401 and the
 * job performs no work (design "Cron invocation method").
 *
 * Behavior:
 *  - R9.1: a resolved (`approved`/`rejected`) record retains its photo for a
 *    30-day window measured from its resolution timestamp (approval timestamp
 *    for `approved`, review timestamp for `rejected`).
 *  - R9.2: once that window has elapsed, delete the photo object from the
 *    private `attendance-photos` bucket.
 *  - R9.3: after a successful deletion, mark the record's photo storage path as
 *    expired (`photo_expired = true`) and null the `photo_path`, while retaining
 *    all non-photo check-in metadata unchanged.
 *  - R9.4: if deletion from the bucket fails, leave `photo_path` unchanged,
 *    record the deletion as unresolved, and let the next cycle retry it — the
 *    eligibility guard (`isPhotoDeletionDue`) re-selects any record whose photo
 *    is still present and not yet marked expired, so a failed deletion is
 *    naturally retried on the following run.
 *
 * The whole job is idempotent: a record whose photo is already expired/deleted
 * is never re-selected (`isPhotoDeletionDue` returns false), so re-processing is
 * a no-op.
 *
 * Vercel Hobby constraints (design "Vercel Hobby plan constraints"):
 *  - `maxDuration = 60` so the job is not cut off by the 10s default.
 *  - Work is bounded to a `MAINTENANCE_BATCH_LIMIT` batch ordered oldest-first;
 *    a large backlog drains over successive daily runs.
 *
 * Uses the established module-level service-role client pattern (mirroring the
 * sibling `maintenance/expire/route.ts`).
 */

// Vercel Hobby functions default to 10s and can be raised only up to 60s.
export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Private bucket holding attendance self-photos (never publicly readable). */
const PHOTO_BUCKET = 'attendance-photos';

/**
 * Maximum records processed per invocation. A single daily Hobby run has a 60s
 * ceiling, so photos are deleted in bounded, oldest-first batches.
 */
const MAINTENANCE_BATCH_LIMIT = 200;

/** The subset of `qr_check_ins` columns the retention job needs. */
interface RetentionRow extends PhotoRetentionRecord {
  id: string;
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

  const now = new Date();

  // ── Fetch a bounded, oldest-first batch of resolved records that still hold
  //    a photo (R9.1/R9.2). The DB filter restricts to resolved records with a
  //    non-expired photo path; the pure `isPhotoDeletionDue` guard re-checks the
  //    30-day window (and idempotency) before any deletion. ──
  let candidates: RetentionRow[];
  try {
    const { data, error } = await supabaseAdmin
      .from('qr_check_ins')
      .select('id, status, approved_at, reviewed_at, photo_path, photo_expired')
      .in('status', ['approved', 'rejected'])
      .eq('photo_expired', false)
      .not('photo_path', 'is', null)
      .order('check_in_date', { ascending: true })
      .limit(MAINTENANCE_BATCH_LIMIT);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to load retention candidates.', detail: error.message },
        { status: 500 },
      );
    }
    candidates = (data ?? []) as RetentionRow[];
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load retention candidates.', detail: (error as Error).message },
      { status: 500 },
    );
  }

  // ── Retain only records whose 30-day window has elapsed and whose photo is
  //    still present (idempotent guard). ──
  const eligible = candidates.filter((record) => isPhotoDeletionDue(record, now));

  // ── Process record-by-record with per-record error isolation. A failed
  //    deletion (or a failed metadata update) leaves the record's `photo_path`
  //    unchanged and is recorded as unresolved so the next cycle retries it
  //    (R9.4). ──
  let deleted = 0;
  const unresolved: { id: string; error: string }[] = [];

  for (const record of eligible) {
    const path = record.photo_path;
    if (path == null || path === '') {
      // Nothing to delete — guard should have excluded these, but stay safe.
      continue;
    }

    try {
      // R9.2: delete the object from the private bucket.
      const { error: removeError } = await supabaseAdmin.storage
        .from(PHOTO_BUCKET)
        .remove([path]);

      if (removeError) {
        // R9.4: leave photo_path unchanged, record as unresolved, retry next run.
        unresolved.push({ id: record.id, error: removeError.message });
        continue;
      }

      // R9.3: mark the path expired + null it, retaining all other metadata.
      const { error: updateError } = await supabaseAdmin
        .from('qr_check_ins')
        .update({ photo_expired: true, photo_path: null })
        // Guard on the still-present path so a concurrent change is not clobbered
        // and re-runs stay idempotent.
        .eq('id', record.id)
        .eq('photo_expired', false);

      if (updateError) {
        // Object is gone but the record was not updated: record as unresolved so
        // the next cycle re-attempts. The delete is idempotent, so retrying is
        // safe.
        unresolved.push({ id: record.id, error: updateError.message });
        continue;
      }

      deleted += 1;
    } catch (error) {
      unresolved.push({ id: record.id, error: (error as Error).message });
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    eligible: eligible.length,
    deleted,
    unresolved: unresolved.length,
    failures: unresolved,
    batchLimit: MAINTENANCE_BATCH_LIMIT,
  });
}
