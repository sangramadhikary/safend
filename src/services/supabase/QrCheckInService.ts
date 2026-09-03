/**
 * QR Check-In Service — Supabase data access for the `qr_check_ins` table.
 *
 * This service has two audiences:
 *
 *  1. **Portal reads (client-side)** — branch/role-scoped queries that surface
 *     the pending Approval Queue in both the Supervisor and Operations portals
 *     (R10.1). These mirror the established `OperationalPostService` pattern:
 *     they use the shared browser `supabaseClient` and `applyBranchScope`, and
 *     expose a realtime subscription so a newly-`pending` record appears in the
 *     queue promptly.
 *
 *  2. **Resolution helpers (server-side)** — primitives the authenticated
 *     resolve route (`POST /api/attendance/checkin/[id]/resolve`) composes to
 *     approve/reject a check-in and mark the matching `shift_attendance` slot
 *     `present` (R11.1, R11.2, R11.6). These accept an explicit
 *     service-role `SupabaseClient` supplied by the route (they never import a
 *     client at module scope), so this module stays usable from both the
 *     browser and Route Handlers. The trust-bearing transition rules live in
 *     the pure `src/lib/attendance/lifecycle.ts` module and are reused here.
 *
 * All writes in production go through the service role (bypassing RLS); this
 * module never adds an anon write path. Column names match the
 * `qr_check_ins` migration exactly.
 *
 * Requirements: 10.1, 11.1
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseClient } from '@/integrations/supabase/client';
import { applyBranchScope, onBranchScopeChange } from '@/utils/branchScope';
import {
  applyApproval,
  applyRejection,
  resolveAttendanceSlot,
  type ApprovalInput,
  type CheckInStatus,
  type RejectionInput,
  type ShiftKey,
  type TransitionRejectionReason,
} from '@/lib/attendance/lifecycle';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A `qr_check_ins` row mapped to camelCase for portal/UI consumption. */
export interface QrCheckIn {
  id: string;
  postId: string;
  employeeCode: string;
  employeeUuid: string;
  shiftKey: ShiftKey;
  serviceTypeKey: string;
  checkInDate: string; // YYYY-MM-DD (app time zone)

  gpsLat: number;
  gpsLng: number;
  gpsAccuracyM: number | null;
  distanceM: number;
  withinGeofence: boolean;
  lowAccuracy: boolean;

  photoPath: string | null;
  photoExpired: boolean;
  consentAcceptedAt: string;

  status: CheckInStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewerNotes: string | null;

  branchId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Options for scoping a portal read of pending check-ins. */
export interface PendingCheckInQuery {
  /** Restrict to a single post (optional). */
  postId?: string;
  /**
   * Explicit branch id(s) to scope by. Primarily for server callers; browser
   * portal callers can omit this and rely on the ambient branch scope applied
   * via `applyBranchScope`.
   */
  branchIds?: string[] | null;
  /** Max rows to return (default 200). */
  limit?: number;
}

export interface ServiceResult<T> {
  success: boolean;
  error?: string;
  data?: T;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

const mapRowToCheckIn = (row: any): QrCheckIn => ({
  id: row.id,
  postId: row.post_id,
  employeeCode: row.employee_code,
  employeeUuid: row.employee_uuid,
  shiftKey: row.shift_key,
  serviceTypeKey: row.service_type_key,
  checkInDate: row.check_in_date,

  gpsLat: row.gps_lat,
  gpsLng: row.gps_lng,
  gpsAccuracyM: row.gps_accuracy_m ?? null,
  distanceM: row.distance_m,
  withinGeofence: !!row.within_geofence,
  lowAccuracy: !!row.low_accuracy,

  photoPath: row.photo_path ?? null,
  photoExpired: !!row.photo_expired,
  consentAcceptedAt: row.consent_accepted_at,

  status: row.status,
  approvedBy: row.approved_by ?? null,
  approvedAt: row.approved_at ?? null,
  reviewedBy: row.reviewed_by ?? null,
  reviewedAt: row.reviewed_at ?? null,
  reviewerNotes: row.reviewer_notes ?? null,

  branchId: row.branch_id ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Columns selected for portal reads. Kept explicit so the shape is stable. */
const CHECK_IN_COLUMNS =
  'id, post_id, employee_code, employee_uuid, shift_key, service_type_key, ' +
  'check_in_date, gps_lat, gps_lng, gps_accuracy_m, distance_m, within_geofence, ' +
  'low_accuracy, photo_path, photo_expired, consent_accepted_at, status, ' +
  'approved_by, approved_at, reviewed_by, reviewed_at, reviewer_notes, ' +
  'branch_id, created_at, updated_at';

// ---------------------------------------------------------------------------
// Portal reads (branch/role-scoped) — R10.1
// ---------------------------------------------------------------------------

/**
 * Read the `pending` check-ins visible to the current portal user.
 *
 * Branch scoping is applied via `applyBranchScope` (which reads the ambient
 * branch selection in the browser and is a no-op server-side), and an explicit
 * `branchIds` filter may be supplied for server callers. Records are ordered
 * oldest-first so the queue drains in arrival order. Role gating (Supervisor /
 * Operations) is enforced by the calling portal/route, per the design.
 */
export const getPendingCheckIns = async (
  query: PendingCheckInQuery = {},
): Promise<ServiceResult<QrCheckIn[]>> => {
  try {
    const limit = query.limit ?? 200;
    let q = supabaseClient
      .from('qr_check_ins')
      .select(CHECK_IN_COLUMNS)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (query.postId) {
      q = q.eq('post_id', query.postId);
    }

    if (query.branchIds && query.branchIds.length > 0) {
      q = q.in('branch_id', query.branchIds);
    } else {
      // Fall back to the ambient (browser) branch scope for portal callers.
      q = applyBranchScope(q);
    }

    const { data, error } = await q;
    if (error) {
      const msg = error.message || (error as any).details || 'Unknown error';
      console.error('getPendingCheckIns: Error:', msg);
      return { success: false, error: msg, data: [] };
    }
    return { success: true, data: (data || []).map(mapRowToCheckIn) };
  } catch (error) {
    console.error('getPendingCheckIns: Error:', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

/**
 * Fetch a single check-in by id (any status). Used by the portals to refresh a
 * card after resolution and by the photo/resolve routes to load a record.
 * When `client` is omitted the shared browser client is used; the resolve/photo
 * routes pass their service-role client.
 */
export const getCheckInById = async (
  id: string,
  client?: SupabaseClient,
): Promise<ServiceResult<QrCheckIn | null>> => {
  try {
    const db = client ?? (supabaseClient as unknown as SupabaseClient);
    const { data, error } = await db
      .from('qr_check_ins')
      .select(CHECK_IN_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message, data: null };
    }
    return { success: true, data: data ? mapRowToCheckIn(data) : null };
  } catch (error) {
    return { success: false, error: (error as Error).message, data: null };
  }
};

/**
 * Subscribe to the pending Approval Queue for a portal. Performs an initial
 * fetch, then re-fetches on any change to `qr_check_ins` and on branch-scope
 * switches, so a record that becomes `pending` surfaces promptly (R10.1).
 * Returns an unsubscribe function.
 */
export const subscribeToPendingCheckIns = (
  callback: (checkIns: QrCheckIn[]) => void,
  query: PendingCheckInQuery = {},
): (() => void) => {
  getPendingCheckIns(query).then((result) => callback(result.data || []));

  const channel = supabaseClient
    .channel('qr-check-ins-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'qr_check_ins' },
      () => {
        getPendingCheckIns(query).then((result) => callback(result.data || []));
      },
    )
    .subscribe();

  const offBranch = onBranchScopeChange(() => {
    getPendingCheckIns(query).then((result) => callback(result.data || []));
  });

  return () => {
    supabaseClient.removeChannel(channel);
    offBranch();
  };
};

// ---------------------------------------------------------------------------
// Resolution helpers (server-side) — R11.1, R11.2, R11.6
// ---------------------------------------------------------------------------

/** Reason a resolution attempt was refused. */
export type ResolveRejectionReason =
  | TransitionRejectionReason // 'already_resolved' | 'notes_too_long'
  | 'not_found'
  | 'attendance_slot_unresolved'
  | 'service_error';

export type ResolveResult =
  | { ok: true; checkIn: QrCheckIn }
  | { ok: false; reason: ResolveRejectionReason; error?: string };

/**
 * Identity of the `shift_attendance` slot an approval must mark `present`.
 * Note `employeeUuid` maps to `shift_attendance.employee_id` (a UUID column).
 */
export interface AttendanceSlotKey {
  attendanceDate: string;
  postId: string;
  shiftKey: ShiftKey;
  serviceTypeKey: string;
  employeeUuid: string;
}

/**
 * Count the `shift_attendance` rows matching the slot key. Attendance may only
 * be marked when exactly one row matches (R11.6); the caller feeds this count
 * to `resolveAttendanceSlot`.
 */
export const countAttendanceSlotMatches = async (
  client: SupabaseClient,
  slot: AttendanceSlotKey,
): Promise<ServiceResult<number>> => {
  try {
    const { count, error } = await client
      .from('shift_attendance')
      .select('id', { count: 'exact', head: true })
      .eq('attendance_date', slot.attendanceDate)
      .eq('post_id', slot.postId)
      .eq('shift_key', slot.shiftKey)
      .eq('service_type_key', slot.serviceTypeKey)
      .eq('employee_id', slot.employeeUuid);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data: count ?? 0 };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Mark the single matching `shift_attendance` slot `present`, recording
 * `marked_at` and `marked_by` (R11.2). The update is constrained to the exact
 * slot key so it can only affect the intended row.
 */
export const markAttendanceSlotPresent = async (
  client: SupabaseClient,
  slot: AttendanceSlotKey,
  markedBy: string,
  markedAt: string,
): Promise<ServiceResult<number>> => {
  try {
    const { data, error } = await client
      .from('shift_attendance')
      .update({ status: 'present', marked_at: markedAt, marked_by: markedBy })
      .eq('attendance_date', slot.attendanceDate)
      .eq('post_id', slot.postId)
      .eq('shift_key', slot.shiftKey)
      .eq('service_type_key', slot.serviceTypeKey)
      .eq('employee_id', slot.employeeUuid)
      .select('id');

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data: (data || []).length };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Flip a check-in's status to `approved`, guarded on it still being `pending`.
 *
 * The `.eq('status', 'pending')` filter makes the update concurrency-safe: if
 * the record was already resolved (by another approver or an expiry run), zero
 * rows update and the caller learns the record is already resolved (R11.4).
 * The transition fields come from the pure `applyApproval` rule (R11.1).
 */
export const markCheckInApproved = async (
  client: SupabaseClient,
  id: string,
  currentStatus: CheckInStatus,
  input: ApprovalInput,
): Promise<ResolveResult> => {
  const decision = applyApproval(currentStatus, input);
  // `=== false` (not `!decision.ok`) so the union narrows under the project's
  // `strictNullChecks: false` compiler setting.
  if (decision.ok === false) {
    return { ok: false, reason: decision.reason };
  }
  try {
    const { data, error } = await client
      .from('qr_check_ins')
      .update({
        status: decision.changes.status,
        approved_by: decision.changes.approvedBy,
        approved_at: decision.changes.approvedAt,
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select(CHECK_IN_COLUMNS)
      .maybeSingle();

    if (error) {
      return { ok: false, reason: 'service_error', error: error.message };
    }
    if (!data) {
      // Lost the race — already resolved concurrently.
      return { ok: false, reason: 'already_resolved' };
    }
    return { ok: true, checkIn: mapRowToCheckIn(data) };
  } catch (error) {
    return { ok: false, reason: 'service_error', error: (error as Error).message };
  }
};

/**
 * Revert an `approved` check-in back to `pending`. Used by the resolve route to
 * roll back an approval when the attendance slot could not be resolved to
 * exactly one row (R11.6), leaving the check-in `pending` as required.
 */
export const revertCheckInToPending = async (
  client: SupabaseClient,
  id: string,
): Promise<ServiceResult<void>> => {
  try {
    const { error } = await client
      .from('qr_check_ins')
      .update({ status: 'pending', approved_by: null, approved_at: null })
      .eq('id', id)
      .eq('status', 'approved');

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Flip a check-in's status to `rejected`, guarded on it still being `pending`.
 * Reviewer notes over 500 characters are refused by the pure `applyRejection`
 * rule before any write (R11.3); an already-resolved record yields
 * `already_resolved` (R11.4).
 */
export const markCheckInRejected = async (
  client: SupabaseClient,
  id: string,
  currentStatus: CheckInStatus,
  input: RejectionInput,
): Promise<ResolveResult> => {
  const decision = applyRejection(currentStatus, input);
  // `=== false` so the union narrows under `strictNullChecks: false`.
  if (decision.ok === false) {
    return { ok: false, reason: decision.reason };
  }
  try {
    const { data, error } = await client
      .from('qr_check_ins')
      .update({
        status: decision.changes.status,
        reviewed_by: decision.changes.reviewedBy,
        reviewed_at: decision.changes.reviewedAt,
        reviewer_notes: decision.changes.reviewerNotes,
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select(CHECK_IN_COLUMNS)
      .maybeSingle();

    if (error) {
      return { ok: false, reason: 'service_error', error: error.message };
    }
    if (!data) {
      return { ok: false, reason: 'already_resolved' };
    }
    return { ok: true, checkIn: mapRowToCheckIn(data) };
  } catch (error) {
    return { ok: false, reason: 'service_error', error: (error as Error).message };
  }
};

/**
 * Approve a check-in and mark its attendance slot `present` as a single logical
 * operation (R11.1, R11.2, R11.6), reusing the pure lifecycle rules.
 *
 * Sequence (best-effort atomicity without a DB transaction):
 *   1. Load the record; 404 → `not_found`.
 *   2. Require exactly one matching `shift_attendance` slot; 0 or >1 →
 *      `attendance_slot_unresolved`, leaving the check-in `pending` (R11.6).
 *   3. Flip status to `approved` (guarded on `pending`, concurrency-safe).
 *   4. Mark the slot `present`; if that fails, revert the check-in to `pending`
 *      so no partial state remains.
 *
 * The route (task 8.3) may replace this with an RPC-backed transaction; the
 * decision logic and slot resolution encoded here are the contract.
 */
export const approveCheckInAndMarkAttendance = async (
  client: SupabaseClient,
  id: string,
  approverId: string,
  approvedAt: string,
): Promise<ResolveResult> => {
  const loaded = await getCheckInById(id, client);
  if (!loaded.success) {
    return { ok: false, reason: 'service_error', error: loaded.error };
  }
  const record = loaded.data;
  if (!record) {
    return { ok: false, reason: 'not_found' };
  }

  const approval = applyApproval(record.status, { approverId, approvedAt });
  // `=== false` so the union narrows under `strictNullChecks: false`.
  if (approval.ok === false) {
    return { ok: false, reason: approval.reason };
  }

  const slot: AttendanceSlotKey = {
    attendanceDate: record.checkInDate,
    postId: record.postId,
    shiftKey: record.shiftKey,
    serviceTypeKey: record.serviceTypeKey,
    employeeUuid: record.employeeUuid,
  };

  const matchCount = await countAttendanceSlotMatches(client, slot);
  if (!matchCount.success) {
    return { ok: false, reason: 'service_error', error: matchCount.error };
  }
  if (!resolveAttendanceSlot(matchCount.data ?? 0).ok) {
    // Zero or more than one slot — do not mark, leave check-in pending (R11.6).
    return { ok: false, reason: 'attendance_slot_unresolved' };
  }

  const approved = await markCheckInApproved(client, id, record.status, {
    approverId,
    approvedAt,
  });
  if (!approved.ok) {
    return approved;
  }

  const marked = await markAttendanceSlotPresent(client, slot, approverId, approvedAt);
  if (!marked.success || (marked.data ?? 0) !== 1) {
    // Roll back the approval so the record stays actionable (R11.6).
    await revertCheckInToPending(client, id);
    return {
      ok: false,
      reason: marked.success ? 'attendance_slot_unresolved' : 'service_error',
      error: marked.error,
    };
  }

  return approved;
};
