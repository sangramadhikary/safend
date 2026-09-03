/**
 * Check-in lifecycle rules for QR field attendance (pure, dependency-free).
 *
 * This module encodes the trust-bearing decisions that govern how a
 * `qr_check_ins` record moves through its lifecycle and how duplicate/live
 * slots are prevented. It contains no I/O; the Route Handlers call these
 * predicates and apply the returned decisions against Supabase.
 *
 * It covers three concerns:
 *   1. Status transitions      — approve / reject / already-resolved (R11.1, R11.3, R11.4)
 *   2. Attendance-slot resolution — exactly-one match on approval       (R11.6)
 *   3. Duplicate / live-slot model — at most one live record per slot   (R12.1, R12.2, R12.3)
 *
 * The `qr_check_ins` status model is: `pending`, `approved`, `rejected`,
 * `expired`. Only `pending` records are resolvable; `approved` and `pending`
 * are the two "live" statuses for duplicate prevention.
 *
 * Requirements: 11.1, 11.3, 11.4, 11.6, 12.1, 12.2, 12.3
 */

/** Lifecycle status of a check-in record. */
export type CheckInStatus = 'pending' | 'approved' | 'rejected' | 'expired';

/** The three recognised shift keys on a deployment/slot. */
export type ShiftKey = 'day' | 'afternoon' | 'night';

/** Maximum allowed length of reviewer notes on a rejection (R11.3). */
export const MAX_REVIEWER_NOTES_LENGTH = 500;

/**
 * Statuses that count as "live" for duplicate/slot-uniqueness purposes. A slot
 * may hold at most one live record (this mirrors the DB partial unique index
 * `qr_check_ins_live_slot_uniq`). `rejected` and `expired` are excluded so a
 * slot can be retried after rejection or expiry.
 */
export const LIVE_STATUSES: readonly CheckInStatus[] = ['pending', 'approved'];

/** Returns true when a record in `status` is considered live for a slot. */
export function isLiveStatus(status: CheckInStatus): boolean {
  return LIVE_STATUSES.includes(status);
}

/** Returns true when a record is resolvable (only `pending` records are). */
export function isResolvable(status: CheckInStatus): boolean {
  return status === 'pending';
}

// ---------------------------------------------------------------------------
// Status transitions (R11.1, R11.3, R11.4)
// ---------------------------------------------------------------------------

/** Details recorded when a check-in is approved. */
export interface ApprovalInput {
  /** Identifier of the approving Supervisor/Operations user. */
  approverId: string;
  /** Approval timestamp, ISO 8601 UTC. */
  approvedAt: string;
}

/** Details recorded when a check-in is rejected. */
export interface RejectionInput {
  /** Identifier of the reviewing Supervisor/Operations user. */
  reviewerId: string;
  /** Review timestamp, ISO 8601 UTC. */
  reviewedAt: string;
  /** Optional reviewer notes; must be at most 500 characters (R11.3). */
  notes?: string | null;
}

/** Fields set on a record when it transitions to `approved`. */
export interface ApprovedTransition {
  status: 'approved';
  approvedBy: string;
  approvedAt: string;
}

/** Fields set on a record when it transitions to `rejected`. */
export interface RejectedTransition {
  status: 'rejected';
  reviewedBy: string;
  reviewedAt: string;
  reviewerNotes: string | null;
}

/** Reason a lifecycle action was refused. */
export type TransitionRejectionReason = 'already_resolved' | 'notes_too_long';

export type TransitionResult<T> =
  | { ok: true; changes: T }
  | { ok: false; reason: TransitionRejectionReason };

/**
 * Whether `notes` is acceptable for a rejection: absent, or a string of at
 * most 500 characters (R11.3).
 */
export function isValidReviewerNotes(notes: unknown): notes is string | null | undefined {
  if (notes === null || notes === undefined) {
    return true;
  }
  return typeof notes === 'string' && notes.length <= MAX_REVIEWER_NOTES_LENGTH;
}

/**
 * Apply an approval to a record in the given status.
 *
 * A `pending` record transitions to `approved` with the approver identifier
 * and approval timestamp set (R11.1). A record already in `approved`,
 * `rejected`, or `expired` is left unchanged and reported as already resolved
 * (R11.4).
 */
export function applyApproval(
  status: CheckInStatus,
  input: ApprovalInput,
): TransitionResult<ApprovedTransition> {
  if (!isResolvable(status)) {
    return { ok: false, reason: 'already_resolved' };
  }
  return {
    ok: true,
    changes: {
      status: 'approved',
      approvedBy: input.approverId,
      approvedAt: input.approvedAt,
    },
  };
}

/**
 * Apply a rejection to a record in the given status.
 *
 * A `pending` record transitions to `rejected` with the reviewer identifier,
 * review timestamp, and reviewer notes set (R11.3). Notes longer than 500
 * characters are refused (`notes_too_long`). A record already in `approved`,
 * `rejected`, or `expired` is left unchanged and reported as already resolved
 * (R11.4). The already-resolved check takes precedence over notes validation
 * because a resolved record cannot be acted upon at all.
 */
export function applyRejection(
  status: CheckInStatus,
  input: RejectionInput,
): TransitionResult<RejectedTransition> {
  if (!isResolvable(status)) {
    return { ok: false, reason: 'already_resolved' };
  }
  if (!isValidReviewerNotes(input.notes)) {
    return { ok: false, reason: 'notes_too_long' };
  }
  return {
    ok: true,
    changes: {
      status: 'rejected',
      reviewedBy: input.reviewerId,
      reviewedAt: input.reviewedAt,
      reviewerNotes: input.notes ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Attendance-slot resolution on approval (R11.6)
// ---------------------------------------------------------------------------

export type AttendanceSlotResolution =
  | { ok: true }
  | { ok: false; reason: 'attendance_slot_unresolved' };

/**
 * Resolve the attendance slot that an approval must mark `present`.
 *
 * Attendance may only be marked when exactly one `shift_attendance` row
 * matches the (attendance date, post, shift, service type, employee) tuple.
 * When zero or more than one row matches, attendance must not be partially
 * marked and the check-in must be left `pending` (R11.6).
 */
export function resolveAttendanceSlot(matchCount: number): AttendanceSlotResolution {
  if (matchCount === 1) {
    return { ok: true };
  }
  return { ok: false, reason: 'attendance_slot_unresolved' };
}

// ---------------------------------------------------------------------------
// Duplicate / live-slot decision model (R12.1, R12.2, R12.3)
// ---------------------------------------------------------------------------

/**
 * Canonical identity of an attendance slot. At most one live check-in record
 * may exist per slot.
 */
export interface SlotKey {
  employeeUuid: string;
  postId: string;
  /** Check-in calendar date in the application's configured time zone (YYYY-MM-DD). */
  checkInDate: string;
  shiftKey: ShiftKey;
}

/** Returns true when two slot keys identify the same slot. */
export function slotKeyEquals(a: SlotKey, b: SlotKey): boolean {
  return (
    a.employeeUuid === b.employeeUuid &&
    a.postId === b.postId &&
    a.checkInDate === b.checkInDate &&
    a.shiftKey === b.shiftKey
  );
}

/** Stable string form of a slot key, usable as a map key. */
export function slotKeyToString(key: SlotKey): string {
  return `${key.employeeUuid}|${key.postId}|${key.checkInDate}|${key.shiftKey}`;
}

/**
 * Observable state of a slot at the moment a new submission is evaluated.
 */
export interface SlotState {
  /** A `pending` check-in already exists for the slot (R12.1). */
  livePendingExists: boolean;
  /** An `approved` check-in already exists for the slot. */
  liveApprovedExists: boolean;
  /** The matching `shift_attendance` row is already `present` (R12.2). */
  attendancePresent: boolean;
}

/** Reason a new submission was refused by the duplicate/live-slot model. */
export type SlotRejectionReason = 'duplicate_pending' | 'already_present';

export type SlotAdmission =
  | { accepted: true }
  | { accepted: false; reason: SlotRejectionReason };

/**
 * Decide whether a new check-in submission may be created for a slot.
 *
 * The submission is refused when attendance for the slot is already `present`
 * or an `approved` check-in already exists (`already_present`, R12.2), or when
 * a `pending` check-in already exists for the slot (`duplicate_pending`,
 * R12.1). Otherwise it is accepted. A refused submission creates no record and
 * leaves any existing record unchanged.
 */
export function admitSubmission(state: SlotState): SlotAdmission {
  if (state.attendancePresent || state.liveApprovedExists) {
    return { accepted: false, reason: 'already_present' };
  }
  if (state.livePendingExists) {
    return { accepted: false, reason: 'duplicate_pending' };
  }
  return { accepted: true };
}

export interface SubmissionOutcome {
  accepted: boolean;
  reason?: SlotRejectionReason;
}

export interface ProcessSubmissionsResult {
  /** Outcome for each submission, in arrival order. */
  outcomes: SubmissionOutcome[];
  /** Slot state after processing the whole sequence. */
  finalState: SlotState;
}

/**
 * Fold a sequence of submissions for a single slot through the live-slot
 * model. Models concurrent/sequential arrivals for the same
 * `(employee_uuid, post_id, check_in_date, shift_key)`: exactly one submission
 * is accepted when the slot starts empty, and every subsequent submission is
 * refused, so at most one live record exists afterward (R12.3, Property 9).
 */
export function processSubmissions(
  initial: SlotState,
  submissionCount: number,
): ProcessSubmissionsResult {
  const outcomes: SubmissionOutcome[] = [];
  let state: SlotState = { ...initial };

  for (let i = 0; i < submissionCount; i += 1) {
    const admission = admitSubmission(state);
    // Use an explicit `=== false` discriminant check: the project compiles with
    // `strictNullChecks: false`, under which a negated/else branch does not
    // narrow a boolean-discriminated union, but an explicit `=== false` does.
    if (admission.accepted === false) {
      outcomes.push({ accepted: false, reason: admission.reason });
    } else {
      outcomes.push({ accepted: true });
      // The accepted submission now occupies the slot as a live pending record.
      state = { ...state, livePendingExists: true };
    }
  }

  return { outcomes, finalState: state };
}

/**
 * Count the live records implied by a slot state (0 or 1). Useful for
 * asserting the "at most one live record per slot" invariant.
 */
export function countLiveRecords(state: SlotState): number {
  return state.livePendingExists || state.liveApprovedExists ? 1 : 0;
}
