import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerUser, getServerRoles } from '@/lib/auth/server-session';
import { decideAccess } from '@/lib/security/access-decision';
import {
  getCheckInById,
  approveCheckInAndMarkAttendance,
  markCheckInRejected,
  type ResolveResult,
  type ResolveRejectionReason,
} from '@/services/supabase/QrCheckInService';
import { MAX_REVIEWER_NOTES_LENGTH } from '@/lib/attendance/lifecycle';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

/**
 * POST /api/attendance/checkin/[id]/resolve — Approve or reject a pending
 * check-in (Requirement 11).
 *
 * Either an Operations-role or a Supervisor-role user may resolve an item; the
 * approval is not blocked on one specific role (R11.5). The trust-bearing
 * decision logic lives in the pure `src/lib/attendance/lifecycle.ts` rules and
 * is composed by the `QrCheckInService` helpers this route calls — the route
 * itself only handles authorization, request parsing, and HTTP mapping.
 *
 *  - R11.1/R11.2 (approve): set status `approved`, record approver + timestamp,
 *    and mark the single matching `shift_attendance` slot `present` (with
 *    `marked_at`/`marked_by`) as one logical operation.
 *  - R11.3 (reject): set status `rejected`, record reviewer + timestamp +
 *    reviewer notes (≤ 500 characters).
 *  - R11.4 (already resolved): a record not in `pending` is left unchanged and
 *    the action is refused with 409.
 *  - R11.5 (permissions): a caller holding neither role is refused with 403 and
 *    the record is left unchanged.
 *  - R11.6 (ambiguous slot): when zero or more than one attendance slot matches
 *    on approval, attendance is not partially marked, the check-in is left
 *    `pending`, and the action is refused with `attendance_slot_unresolved`.
 *
 * Uses the established module-level service-role client pattern (see the sibling
 * `app/api/attendance/checkin/[id]/photo/route.ts`). The service-role client is
 * used only after the caller's Approver authorization has been confirmed.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Roles permitted to resolve a check-in: the Approvers, i.e. holders of the
 * Supervisor role or the Operations role (R11.5, mirroring the photo route).
 */
const APPROVER_ROLES = ['operations', 'supervisor'];

/** Request body: `{ action: 'approve' | 'reject', notes?: string }` (R11.3). */
const resolveBody = z.object({
  action: z.enum(['approve', 'reject']),
  notes: z.string().max(MAX_REVIEWER_NOTES_LENGTH).optional(),
});

/**
 * Map a service-layer `ResolveRejectionReason` to an HTTP status:
 *   - `already_resolved`            → 409 (R11.4)
 *   - `not_found`                   → 404
 *   - `attendance_slot_unresolved`  → 422 (R11.6, leaves check-in pending)
 *   - `notes_too_long`              → 400 (R11.3)
 *   - `service_error`               → 500
 */
function statusForReason(reason: ResolveRejectionReason): number {
  switch (reason) {
    case 'already_resolved':
      return 409;
    case 'not_found':
      return 404;
    case 'attendance_slot_unresolved':
      return 422;
    case 'notes_too_long':
      return 400;
    case 'service_error':
    default:
      return 500;
  }
}

/** Human-facing message for each refusal reason. */
function messageForReason(reason: ResolveRejectionReason): string {
  switch (reason) {
    case 'already_resolved':
      return 'This check-in has already been resolved.';
    case 'not_found':
      return 'Check-in not found.';
    case 'attendance_slot_unresolved':
      return 'The attendance slot could not be resolved; the check-in was left pending.';
    case 'notes_too_long':
      return `Reviewer notes must be at most ${MAX_REVIEWER_NOTES_LENGTH} characters.`;
    case 'service_error':
    default:
      return 'Failed to resolve the check-in. Please try again.';
  }
}

/** Convert a failed `ResolveResult` into the route's error response. */
function errorResponse(result: Extract<ResolveResult, { ok: false }>) {
  return NextResponse.json(
    { error: messageForReason(result.reason), reason: result.reason },
    { status: statusForReason(result.reason) },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // ── Authorization: Approver-only (server-verified session + resolved roles) ──
  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roles = await getServerRoles(user.id);
  const decision = decideAccess({
    sessionConfirmed: true,
    resolvedRoles: roles,
    routeAllowedRoles: APPROVER_ROLES,
  });
  if (decision !== 'allow') {
    // Neither Supervisor nor Operations — refuse, leave the record unchanged (R11.5).
    return NextResponse.json(
      { error: 'Forbidden. Supervisor or Operations role required.' },
      { status: 403 },
    );
  }

  // ── Parse + validate the request body ──
  let parsed: z.infer<typeof resolveBody>;
  try {
    const raw = await request.json();
    const result = resolveBody.safeParse(raw);
    if (!result.success) {
      const notesIssue = result.error.issues.find((issue) => issue.path[0] === 'notes');
      const message = notesIssue
        ? `Reviewer notes must be at most ${MAX_REVIEWER_NOTES_LENGTH} characters.`
        : "Invalid request body. Expected { action: 'approve' | 'reject', notes?: string }.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const nowIso = new Date().toISOString();

  // ── Approve: flip status + mark the single matching attendance slot present ──
  if (parsed.action === 'approve') {
    const result = await approveCheckInAndMarkAttendance(
      supabaseAdmin,
      id,
      user.id,
      nowIso,
    );
    // `=== false` so the union narrows under the project's `strictNullChecks: false`.
    if (result.ok === false) {
      return errorResponse(result);
    }
    return NextResponse.json({ status: result.checkIn.status, checkIn: result.checkIn });
  }

  // ── Reject: load current status, then flip to rejected with reviewer notes ──
  const loaded = await getCheckInById(id, supabaseAdmin);
  if (!loaded.success) {
    return NextResponse.json(
      { error: messageForReason('service_error'), reason: 'service_error' },
      { status: 500 },
    );
  }
  if (!loaded.data) {
    return NextResponse.json(
      { error: messageForReason('not_found'), reason: 'not_found' },
      { status: 404 },
    );
  }

  const result = await markCheckInRejected(supabaseAdmin, id, loaded.data.status, {
    reviewerId: user.id,
    reviewedAt: nowIso,
    notes: parsed.notes ?? null,
  });
  if (result.ok === false) {
    return errorResponse(result);
  }
  return NextResponse.json({ status: result.checkIn.status, checkIn: result.checkIn });
}
