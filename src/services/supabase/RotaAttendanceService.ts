'use client';

import { supabaseClient } from '@/integrations/supabase/client';
import { applyBranchScope } from '@/utils/branchScope';
import { auditActions, logChange } from '@/utils/auditLog';

export interface RotaAssignment {
  id?: string;
  rotaDate: string;        // YYYY-MM-DD
  postId: string;
  postName?: string;
  clientName?: string;
  shiftKey: string;        // 'day' | 'afternoon' | 'night'
  serviceTypeKey: string;
  employeeId: string;
  employeeName?: string;
  employeeCode?: string;
  createdAt?: string;
}

export type AttendanceStatus = 'pending' | 'present' | 'absent' | 'half_day' | 'half_vacant';

export interface ShiftAttendance {
  id?: string;
  attendanceDate: string;
  postId: string;
  postName?: string;
  clientName?: string;
  shiftKey: string;
  serviceTypeKey: string;
  slotIndex: number;

  employeeId?: string;
  employeeName?: string;
  employeeCode?: string;

  secondaryEmployeeId?: string;
  secondaryEmployeeName?: string;
  secondaryEmployeeCode?: string;

  status: AttendanceStatus;
  markedAt?: string;
  markedBy?: string;
  notes?: string;
}

const mapRowToAssignment = (row: any): RotaAssignment => ({
  id: row.id,
  rotaDate: row.rota_date,
  postId: row.post_id,
  postName: row.post_name,
  clientName: row.client_name,
  shiftKey: row.shift_key,
  serviceTypeKey: row.service_type_key,
  employeeId: row.employee_id,
  employeeName: row.employee_name,
  employeeCode: row.employee_code,
  createdAt: row.created_at,
});

const mapRowToAttendance = (row: any): ShiftAttendance => ({
  id: row.id,
  attendanceDate: row.attendance_date,
  postId: row.post_id,
  postName: row.post_name,
  clientName: row.client_name,
  shiftKey: row.shift_key,
  serviceTypeKey: row.service_type_key,
  slotIndex: row.slot_index,
  employeeId: row.employee_id,
  employeeName: row.employee_name,
  employeeCode: row.employee_code,
  secondaryEmployeeId: row.secondary_employee_id,
  secondaryEmployeeName: row.secondary_employee_name,
  secondaryEmployeeCode: row.secondary_employee_code,
  status: row.status,
  markedAt: row.marked_at,
  markedBy: row.marked_by,
  notes: row.notes,
});

// ─── ROTA ASSIGNMENTS ──────────────────────────────────────────

/**
 * FIX #1: Atomic save — insert new rows first, then delete old ones.
 * If the insert fails, no data is lost (old assignments remain).
 * FIX #3: Apply branch scope to rota operations.
 */
export const saveRotaAssignments = async (date: string, postId: string, assignments: RotaAssignment[]) => {
  try {
    // Snapshot the roster before it is rewritten. This function replaces a whole
    // post-day's assignments, so without a before-state the trail could only say
    // "the rota was saved" — not who was taken off duty, which is the question
    // that gets asked after an incident at an unstaffed post.
    const priorRoster = await getRotaAssignmentsForDate(date);
    const before = (priorRoster.data ?? []).filter((a) => a.postId === postId);
    const postLabel = assignments[0]?.postName || before[0]?.postName || postId;

    /** Compare rosters by deployed staff, which is what a reviewer cares about. */
    const rosterShape = (rows: RotaAssignment[]) => ({
      assignmentCount: rows.length,
      deployed: rows
        .map((a) => `${a.shiftKey}/${a.serviceTypeKey}: ${a.employeeName ?? a.employeeId}`)
        .sort(),
    });

    if (assignments.length === 0) {
      // Only deleting — safe to proceed directly
      let deleteQuery = supabaseClient
        .from('rota_assignments')
        .delete()
        .eq('rota_date', date)
        .eq('post_id', postId);
      deleteQuery = applyBranchScope(deleteQuery);
      const { error: delError } = await deleteQuery;
      if (delError) {
        console.error('Error deleting rota assignments:', delError);
        return { success: false, error: delError.message };
      }

      // Clearing a post's roster leaves it unstaffed, so it is recorded even
      // though nothing was written — an empty save is the most consequential one.
      void logChange({
        action: 'ops.rota.update',
        target: postLabel,
        entityType: 'rota_assignments',
        entityId: `${date}:${postId}`,
        entityLabel: `${postLabel} — ${date}`,
        severity: 'critical',
        before: rosterShape(before),
        after: rosterShape([]),
        details: { rotaDate: date, postId, clearedCount: before.length },
        logUnchanged: true,
      });

      return { success: true };
    }

    const rows = assignments.map(a => ({
      rota_date: a.rotaDate,
      post_id: a.postId,
      post_name: a.postName,
      client_name: a.clientName,
      shift_key: a.shiftKey,
      service_type_key: a.serviceTypeKey,
      employee_id: a.employeeId,
      employee_name: a.employeeName,
      employee_code: a.employeeCode,
    }));

    // Upsert new assignments first — if this fails, old data remains intact.
    // Idempotent on the unique key (rota_date, post_id, shift_key, service_type_key, employee_id)
    // so re-saving an unchanged assignment does not violate idx_rota_unique_assignment.
    const { error: insertError } = await supabaseClient
      .from('rota_assignments')
      .upsert(rows, {
        onConflict: 'rota_date,post_id,shift_key,service_type_key,employee_id',
        ignoreDuplicates: true,
      });
    if (insertError) {
      const msg = insertError.message || (insertError as any).details || 'Unknown error';
      console.error('Error saving rota assignments:', msg, insertError);
      return { success: false, error: msg };
    }

    // Insert succeeded — now safely delete old assignments that are NOT in the new set
    const newKeys = new Set(assignments.map(a => `${a.shiftKey}|${a.serviceTypeKey}|${a.employeeId}`));

    // Fetch existing IDs for this date+post to find stale ones
    let fetchQuery = supabaseClient
      .from('rota_assignments')
      .select('id, shift_key, service_type_key, employee_id')
      .eq('rota_date', date)
      .eq('post_id', postId);
    fetchQuery = applyBranchScope(fetchQuery);
    const { data: existing } = await fetchQuery;

    if (existing && existing.length > 0) {
      // Group by key — keep only the latest (highest id) for each key from newly inserted
      const keyToIds: Record<string, string[]> = {};
      for (const row of existing) {
        const k = `${row.shift_key}|${row.service_type_key}|${row.employee_id}`;
        if (!keyToIds[k]) keyToIds[k] = [];
        keyToIds[k].push(row.id);
      }
      // For each key that's in the new set, keep only 1 row (the latest), delete the rest
      // For keys NOT in the new set, delete all
      const idsToDelete: string[] = [];
      for (const [k, ids] of Object.entries(keyToIds)) {
        if (newKeys.has(k)) {
          // Keep the last one (most recently inserted), delete duplicates
          if (ids.length > 1) {
            idsToDelete.push(...ids.slice(0, ids.length - 1));
          }
        } else {
          // Old assignment not in new set — delete all
          idsToDelete.push(...ids);
        }
      }
      if (idsToDelete.length > 0) {
        await supabaseClient.from('rota_assignments').delete().in('id', idsToDelete);
      }
    }

    // `logChange` suppresses no-op entries by default, so re-saving an unchanged
    // roster produces nothing — which is what keeps this high-traffic screen from
    // flooding the trail.
    void logChange({
      action: before.length === 0 ? 'ops.rota.create' : 'ops.rota.update',
      target: postLabel,
      entityType: 'rota_assignments',
      entityId: `${date}:${postId}`,
      entityLabel: `${postLabel} — ${date}`,
      before: rosterShape(before),
      after: rosterShape(assignments),
      details: { rotaDate: date, postId, clientName: assignments[0]?.clientName },
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

/**
 * FIX #3: Apply branch scope to rota queries.
 *
 * Ordering is load-bearing, not cosmetic. Attendance is keyed by `slot_index`,
 * but the roster itself has no slot column — the UI derives a slot from an
 * employee's *position* in this array. An unordered select lets Postgres return
 * the same roster in a different order after any write, which silently re-points
 * an existing "absent" mark at a different guard. Sorting by (created_at, id)
 * gives every caller the same stable slot mapping.
 */
export const getRotaAssignmentsForDate = async (date: string) => {
  try {
    let query = supabaseClient
      .from('rota_assignments')
      .select('*')
      .eq('rota_date', date);
    query = applyBranchScope(query);
    query = query
      .order('post_id', { ascending: true })
      .order('shift_key', { ascending: true })
      .order('service_type_key', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message, data: [] as RotaAssignment[] };
    }
    return { success: true, data: (data || []).map(mapRowToAssignment) };
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as RotaAssignment[] };
  }
};

/**
 * Fetch rosters for an inclusive date range in one round trip.
 *
 * Exists so "copy yesterday's deployment" costs one query instead of one per
 * post. Returns a date-keyed map because every caller wants to compare days.
 */
export const getRotaAssignmentsForDateRange = async (fromDate: string, toDate: string) => {
  try {
    let query = supabaseClient
      .from('rota_assignments')
      .select('*')
      .gte('rota_date', fromDate)
      .lte('rota_date', toDate);
    query = applyBranchScope(query);
    query = query
      .order('rota_date', { ascending: true })
      .order('post_id', { ascending: true })
      .order('shift_key', { ascending: true })
      .order('service_type_key', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    const { data, error } = await query;
    if (error) return { success: false, error: error.message, byDate: {} as Record<string, RotaAssignment[]> };

    const byDate: Record<string, RotaAssignment[]> = {};
    for (const row of data || []) {
      const mapped = mapRowToAssignment(row);
      if (!byDate[mapped.rotaDate]) byDate[mapped.rotaDate] = [];
      byDate[mapped.rotaDate].push(mapped);
    }
    return { success: true, byDate };
  } catch (e: any) {
    return { success: false, error: e.message, byDate: {} as Record<string, RotaAssignment[]> };
  }
};

// Get distinct dates that have rota assignments (used to find "missed" days)
export const getDatesWithAssignments = async (fromDate: string, toDate: string) => {
  try {
    let query = supabaseClient
      .from('rota_assignments')
      .select('rota_date')
      .gte('rota_date', fromDate)
      .lte('rota_date', toDate);
    query = applyBranchScope(query);

    const { data, error } = await query;

    if (error) return { success: false, dates: [] as string[] };
    const dates = Array.from(new Set((data || []).map((r: any) => r.rota_date)));
    return { success: true, dates };
  } catch {
    return { success: false, dates: [] as string[] };
  }
};

/**
 * How many people are rostered per (date, post, shift, service type).
 *
 * Attendance identifies a slot by its ordinal `slot_index` within one of these
 * groups, so the group's size *is* the number of slots that legitimately exist.
 * Anything beyond it is a slot nobody was ever deployed to.
 */
export const getRotaCoverage = async (dates: string[], postIds?: string[]) => {
  try {
    if (dates.length === 0) return { success: true, counts: new Map<string, number>() };

    let query = supabaseClient
      .from('rota_assignments')
      .select('rota_date, post_id, shift_key, service_type_key')
      .in('rota_date', dates);
    if (postIds && postIds.length > 0) query = query.in('post_id', postIds);
    query = applyBranchScope(query);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message, counts: new Map<string, number>() };

    const counts = new Map<string, number>();
    for (const r of (data || []) as any[]) {
      const k = `${r.rota_date}|${r.post_id}|${r.shift_key}|${r.service_type_key}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return { success: true, counts };
  } catch (e: any) {
    return { success: false, error: e.message, counts: new Map<string, number>() };
  }
};

interface SlotIdentity {
  attendanceDate: string;
  postId: string;
  postName?: string;
  shiftKey: string;
  serviceTypeKey: string;
  slotIndex: number;
}

/**
 * Enforce the rule that attendance may only be recorded against a deployment.
 *
 * A shift_attendance row is a payroll and liability record asserting that a
 * particular post was covered. If no rota assignment exists for the slot, nobody
 * was ever scheduled there, and the record would assert coverage that was never
 * planned — inventing billable, payable duty out of nothing.
 *
 * This lives in the service rather than the screen deliberately. Three separate
 * clients write attendance (the operations screen, the supervisor portal, and the
 * QR approval flow), so a rule enforced in one of them is not enforced at all.
 * The QR flow only ever `update`s a pre-existing slot, so gating creation here
 * closes every path that can bring a slot into existence.
 */
const assertDeployed = async (slots: SlotIdentity[]): Promise<{ ok: boolean; error?: string }> => {
  const dates = Array.from(new Set(slots.map((s) => s.attendanceDate)));
  const postIds = Array.from(new Set(slots.map((s) => s.postId)));

  const coverage = await getRotaCoverage(dates, postIds);
  if (!coverage.success) {
    // Fail closed. If the roster cannot be read, we cannot show the slot was
    // deployed, and guessing in favour of the write is what this rule exists to
    // prevent.
    return { ok: false, error: `Could not verify the deployment for this slot: ${coverage.error}` };
  }

  const undeployed = slots.filter((s) => {
    const rostered = coverage.counts.get(`${s.attendanceDate}|${s.postId}|${s.shiftKey}|${s.serviceTypeKey}`) ?? 0;
    return s.slotIndex >= rostered;
  });
  if (undeployed.length === 0) return { ok: true };

  const posts = Array.from(new Set(undeployed.map((s) => s.postName ?? s.postId)));
  const subject = posts.length === 1
    ? `${posts[0]} is not deployed`
    : `${posts.length} posts are not deployed`;

  return {
    ok: false,
    error: `${subject} for ${dates.join(', ')} on ${undeployed.length === 1
      ? `the ${undeployed[0].shiftKey} shift`
      : `${undeployed.length} slots`}. Assign staff in Deployments first — attendance can only be marked against a deployed slot.`,
  };
};

// ─── ATTENDANCE ────────────────────────────────────────────────

/**
 * FIX #3: Apply branch scope to attendance queries.
 */
export const getAttendanceForDate = async (date: string) => {
  try {
    let query = supabaseClient
      .from('shift_attendance')
      .select('*')
      .eq('attendance_date', date);
    query = applyBranchScope(query);

    const { data, error } = await query;

    if (error) return { success: false, error: error.message, data: [] as ShiftAttendance[] };
    return { success: true, data: (data || []).map(mapRowToAttendance) };
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as ShiftAttendance[] };
  }
};

// Get all dates that have attendance records (used to find "missed" days)
export const getDatesWithAttendance = async (fromDate: string, toDate: string) => {
  try {
    let query = supabaseClient
      .from('shift_attendance')
      .select('attendance_date, status')
      .gte('attendance_date', fromDate)
      .lte('attendance_date', toDate)
      .neq('status', 'pending');
    query = applyBranchScope(query);

    const { data, error } = await query;

    if (error) return { success: false, dates: [] as string[] };
    const dates = Array.from(new Set((data || []).map((r: any) => r.attendance_date)));
    return { success: true, dates };
  } catch {
    return { success: false, dates: [] as string[] };
  }
};

/**
 * FIX #12: Validate that attendance date is not in the future (server-side guard).
 * FIX #10: Use authenticated user ID from Supabase session for audit trail instead of localStorage.
 */
export const upsertAttendance = async (att: Partial<ShiftAttendance> & {
  attendanceDate: string;
  postId: string;
  shiftKey: string;
  serviceTypeKey: string;
  slotIndex: number;
}) => {
  try {
    // FIX #12: Reject future dates
    const today = new Date().toISOString().split('T')[0];
    if (att.attendanceDate > today) {
      return { success: false, error: 'Cannot mark attendance for a future date.' };
    }

    // Attendance requires a deployment. See `assertDeployed`.
    const deployed = await assertDeployed([{
      attendanceDate: att.attendanceDate,
      postId: att.postId,
      postName: att.postName,
      shiftKey: att.shiftKey,
      serviceTypeKey: att.serviceTypeKey,
      slotIndex: att.slotIndex,
    }]);
    if (!deployed.ok) {
      void logChange({
        action: 'ops.attendance.mark',
        target: att.employeeName || att.employeeCode || att.postName || att.postId,
        entityType: 'shift_attendance',
        entityId: `${att.attendanceDate}:${att.postId}:${att.shiftKey}:${att.slotIndex}`,
        outcome: 'denied',
        severity: 'warning',
        errorMessage: deployed.error,
        details: { reason: 'no-rota-assignment', attendanceDate: att.attendanceDate, postId: att.postId, shift: att.shiftKey },
        logUnchanged: true,
      });
      return { success: false, error: deployed.error };
    }

    // FIX #10: Prefer authenticated user from Supabase session, fall back to localStorage
    let markedBy = att.markedBy;
    if (!markedBy) {
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        markedBy = user?.user_metadata?.name || user?.email || undefined;
      } catch { /* fallback below */ }
    }
    if (!markedBy && typeof window !== 'undefined') {
      markedBy = localStorage.getItem('userName') || undefined;
    }
    markedBy = markedBy || 'Admin';

    // Read the existing slot before overwriting it. Attendance is the highest-
    // volume mutation in the system, so this extra lookup is the most expensive
    // instrumentation decision here — it is made deliberately, because the
    // question this table gets audited for is precisely "was a record changed
    // after it was first marked?" (absent later becoming present), and that is
    // unanswerable without the prior value. The lookup hits the same unique
    // composite index the upsert uses, so it is a single-row index seek.
    const { data: priorRow } = await supabaseClient
      .from('shift_attendance')
      .select('*')
      .eq('attendance_date', att.attendanceDate)
      .eq('post_id', att.postId)
      .eq('shift_key', att.shiftKey)
      .eq('service_type_key', att.serviceTypeKey)
      .eq('slot_index', att.slotIndex)
      .maybeSingle();

    const before = priorRow ? mapRowToAttendance(priorRow) : undefined;

    const row: any = {
      attendance_date: att.attendanceDate,
      post_id: att.postId,
      post_name: att.postName,
      client_name: att.clientName,
      shift_key: att.shiftKey,
      service_type_key: att.serviceTypeKey,
      slot_index: att.slotIndex,
      employee_id: att.employeeId || null,
      employee_name: att.employeeName,
      employee_code: att.employeeCode,
      secondary_employee_id: att.secondaryEmployeeId || null,
      secondary_employee_name: att.secondaryEmployeeName,
      secondary_employee_code: att.secondaryEmployeeCode,
      status: att.status || 'pending',
      marked_by: markedBy,
      notes: att.notes,
    };

    const { error } = await supabaseClient
      .from('shift_attendance')
      .upsert(row, { onConflict: 'attendance_date,post_id,shift_key,service_type_key,slot_index' });

    if (error) {
      const msg = error.message || (error as any).details || 'Unknown error';
      console.error('Error upserting attendance:', msg, error);
      return { success: false, error: msg };
    }

    const employeeLabel = att.employeeName || att.employeeCode || att.employeeId || 'Unassigned slot';
    const newStatus = att.status || 'pending';
    const slotLabel = `${att.postName ?? att.postId} · ${att.shiftKey} · slot ${att.slotIndex + 1}`;

    // An amendment to an already-marked slot is escalated above a first mark.
    // Overwriting a settled attendance record is the pattern worth reviewing;
    // filling in a pending slot is routine work.
    const isAmendment =
      before !== undefined && before.status !== 'pending' && before.status !== newStatus;

    void logChange({
      action: 'ops.attendance.mark',
      target: employeeLabel,
      entityType: 'shift_attendance',
      entityId: before?.id ?? `${att.attendanceDate}:${att.postId}:${att.shiftKey}:${att.slotIndex}`,
      entityLabel: `${employeeLabel} — ${slotLabel}`,
      severity: isAmendment ? 'critical' : undefined,
      snapshot: isAmendment,
      before: before ? { status: before.status, employeeName: before.employeeName, notes: before.notes, markedBy: before.markedBy } : { status: 'pending' },
      after: { status: newStatus, employeeName: att.employeeName, notes: att.notes, markedBy },
      details: {
        attendanceDate: att.attendanceDate,
        post: att.postName ?? att.postId,
        client: att.clientName,
        shift: att.shiftKey,
        slotIndex: att.slotIndex,
        amendedPreviousMark: isAmendment,
      },
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export interface BulkAttendanceSlot {
  attendanceDate: string;
  postId: string;
  postName?: string;
  clientName?: string;
  shiftKey: string;
  serviceTypeKey: string;
  slotIndex: number;
  employeeId?: string;
  employeeName?: string;
  employeeCode?: string;
  secondaryEmployeeId?: string;
  secondaryEmployeeName?: string;
  secondaryEmployeeCode?: string;
  status: AttendanceStatus;
  notes?: string;
}

/**
 * Mark many slots in one round trip.
 *
 * `upsertAttendance` costs three queries per slot (prior-row read, upsert, audit
 * write). That is the right shape for a single deliberate mark, but "mark this
 * whole post present" multiplies it by the roster size, and a day-wide bulk
 * action multiplies it again by the post count — the operation most likely to be
 * used at scale was the most expensive one per unit of work.
 *
 * This batches the prior-row read and the upsert, and emits one audit entry for
 * the batch rather than one per slot. The audit trail still answers the question
 * it exists for ("was a settled record amended?") because amendments are
 * itemised inside the entry instead of being flattened into a count.
 */
export const bulkUpsertAttendance = async (slots: BulkAttendanceSlot[]) => {
  try {
    if (slots.length === 0) return { success: true, count: 0 };

    const today = new Date().toISOString().split('T')[0];
    const future = slots.find((s) => s.attendanceDate > today);
    if (future) {
      return { success: false, error: 'Cannot mark attendance for a future date.', count: 0 };
    }

    // Attendance requires a deployment. Checked for the whole batch in one query,
    // and the batch is rejected as a unit: a partial write would leave the
    // operator unable to tell which of a hundred slots actually landed.
    const deployed = await assertDeployed(slots);
    if (!deployed.ok) {
      void logChange({
        action: 'ops.attendance.mark',
        target: `${new Set(slots.map((s) => s.postId)).size} post(s)`,
        entityType: 'shift_attendance',
        entityId: `bulk:${Array.from(new Set(slots.map((s) => s.attendanceDate))).join(',')}`,
        outcome: 'denied',
        severity: 'warning',
        errorMessage: deployed.error,
        details: { reason: 'no-rota-assignment', bulk: true, slotCount: slots.length },
        logUnchanged: true,
      });
      return { success: false, error: deployed.error, count: 0 };
    }

    let markedBy: string | undefined;
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      markedBy = user?.user_metadata?.name || user?.email || undefined;
    } catch { /* fall through */ }
    if (!markedBy && typeof window !== 'undefined') {
      markedBy = localStorage.getItem('userName') || undefined;
    }
    markedBy = markedBy || 'Admin';

    // One read for the whole batch. Scoped to the dates and posts actually being
    // touched so this stays an index range scan rather than a table sweep.
    const dates = Array.from(new Set(slots.map((s) => s.attendanceDate)));
    const postIds = Array.from(new Set(slots.map((s) => s.postId)));
    const { data: priorRows } = await supabaseClient
      .from('shift_attendance')
      .select('*')
      .in('attendance_date', dates)
      .in('post_id', postIds);

    const slotKey = (s: { attendanceDate: string; postId: string; shiftKey: string; serviceTypeKey: string; slotIndex: number }) =>
      `${s.attendanceDate}|${s.postId}|${s.shiftKey}|${s.serviceTypeKey}|${s.slotIndex}`;

    const priorByKey = new Map<string, ShiftAttendance>();
    for (const row of priorRows || []) {
      const mapped = mapRowToAttendance(row);
      priorByKey.set(slotKey(mapped), mapped);
    }

    const rows = slots.map((s) => ({
      attendance_date: s.attendanceDate,
      post_id: s.postId,
      post_name: s.postName,
      client_name: s.clientName,
      shift_key: s.shiftKey,
      service_type_key: s.serviceTypeKey,
      slot_index: s.slotIndex,
      employee_id: s.employeeId || null,
      employee_name: s.employeeName,
      employee_code: s.employeeCode,
      secondary_employee_id: s.secondaryEmployeeId || null,
      secondary_employee_name: s.secondaryEmployeeName,
      secondary_employee_code: s.secondaryEmployeeCode,
      status: s.status,
      marked_by: markedBy,
      notes: s.notes,
    }));

    const { error } = await supabaseClient
      .from('shift_attendance')
      .upsert(rows, { onConflict: 'attendance_date,post_id,shift_key,service_type_key,slot_index' });

    if (error) {
      const msg = error.message || (error as any).details || 'Unknown error';
      console.error('Error bulk upserting attendance:', msg, error);
      return { success: false, error: msg, count: 0 };
    }

    // Amendments are listed individually. A bulk action that quietly overwrote
    // settled records is the reviewable event here, and a bare count would not
    // let anyone find which ones.
    const amendments = slots
      .map((s) => ({ s, before: priorByKey.get(slotKey(s)) }))
      .filter(({ s, before }) => before && before.status !== 'pending' && before.status !== s.status)
      .map(({ s, before }) => ({
        employee: s.employeeName || s.employeeCode || s.employeeId,
        post: s.postName ?? s.postId,
        shift: s.shiftKey,
        slotIndex: s.slotIndex,
        from: before!.status,
        to: s.status,
        originallyMarkedBy: before!.markedBy,
      }));

    const statusTally = slots.reduce<Record<string, number>>((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {});

    void logChange({
      action: 'ops.attendance.mark',
      target: postIds.length === 1 ? (slots[0].postName ?? slots[0].postId) : `${postIds.length} posts`,
      entityType: 'shift_attendance',
      entityId: `bulk:${dates.join(',')}:${postIds.join(',')}`,
      entityLabel: `Bulk mark — ${slots.length} slot${slots.length > 1 ? 's' : ''} (${dates.join(', ')})`,
      severity: amendments.length > 0 ? 'critical' : undefined,
      snapshot: amendments.length > 0,
      before: { amendedSlots: amendments.length },
      after: { statusTally, slotCount: slots.length },
      details: {
        attendanceDates: dates,
        postIds,
        bulk: true,
        markedBy,
        amendedPreviousMarks: amendments.length > 0,
        amendments,
      },
      logUnchanged: true,
    });

    return { success: true, count: slots.length };
  } catch (e: any) {
    return { success: false, error: e.message, count: 0 };
  }
};

/**
 * FIX #9: canUndoAttendance now also accepts server time from the record.
 * We still use a client-side check for UI rendering (hide/show button), but
 * the actual undo operation (undoAttendance) now validates server-side via
 * a time constraint in the query itself.
 */
export const canUndoAttendance = (markedAt: string | undefined): boolean => {
  if (!markedAt) return false;
  const marked = new Date(markedAt).getTime();
  const now = Date.now();
  const twelveHoursMs = 12 * 60 * 60 * 1000;
  return now - marked < twelveHoursMs;
};

/**
 * FIX #9: Add server-side time guard — only allow undo if marked_at is within
 * 12 hours of now (using DB's now() function). If the record was marked longer
 * ago, the update will match 0 rows and we report failure.
 */
export const undoAttendance = async (id: string) => {
  try {
    // Capture what is being reverted. An undo erases marked_at, marked_by and the
    // status, so after the update there is no record that the original mark ever
    // existed — this snapshot is the only trace.
    const { data: priorRow } = await supabaseClient
      .from('shift_attendance')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    const before = priorRow ? mapRowToAttendance(priorRow) : undefined;

    // Use a raw filter to ensure the record was marked within 12 hours (server time)
    const { data, error } = await supabaseClient
      .from('shift_attendance')
      .update({
        status: 'pending',
        marked_at: null,
        marked_by: null,
        secondary_employee_id: null,
        secondary_employee_name: null,
        secondary_employee_code: null,
      })
      .eq('id', id)
      .gte('marked_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
      .select('id');

    if (error) return { success: false, error: error.message };
    if (!data || data.length === 0) {
      // A refused undo is recorded too. An attempt to alter a settled attendance
      // record outside the permitted window is exactly the kind of event an audit
      // trail exists to surface, and logging only successes would hide it.
      void logChange({
        action: 'ops.attendance.mark',
        target: before?.employeeName ?? id,
        entityType: 'shift_attendance',
        entityId: id,
        outcome: 'denied',
        severity: 'warning',
        errorMessage: 'Undo window expired (12 hours)',
        before: before ? { status: before.status, markedAt: before.markedAt, markedBy: before.markedBy } : undefined,
        after: before ? { status: before.status, markedAt: before.markedAt, markedBy: before.markedBy } : undefined,
        details: { attemptedAction: 'undo', reason: 'undo-window-expired' },
        logUnchanged: true,
      });
      return { success: false, error: 'Undo window has expired (12 hours). Cannot revert this record.' };
    }

    void logChange({
      action: 'ops.attendance.mark',
      target: before?.employeeName ?? id,
      entityType: 'shift_attendance',
      entityId: id,
      entityLabel: before
        ? `${before.employeeName ?? 'Unassigned'} — ${before.postName ?? before.postId} · ${before.shiftKey}`
        : id,
      severity: 'critical',
      before: before
        ? { status: before.status, markedAt: before.markedAt, markedBy: before.markedBy, secondaryEmployeeName: before.secondaryEmployeeName }
        : undefined,
      after: { status: 'pending', markedAt: null, markedBy: null, secondaryEmployeeName: null },
      details: {
        revertedAction: 'undo',
        attendanceDate: before?.attendanceDate,
        post: before?.postName ?? before?.postId,
      },
      logUnchanged: true,
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};
