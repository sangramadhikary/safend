/**
 * Photo retention and pending-check-in expiry rules (pure, dependency-free).
 *
 * Two independent, idempotent maintenance concerns are modeled here so the
 * serverless cron routes (`app/api/attendance/maintenance/*`) can stay thin:
 *
 *  1. Retention (R9.1): a resolved check-in retains its photo for a 30-day
 *     window measured from its *resolution timestamp* — the approval timestamp
 *     for an `approved` record, or the review timestamp for a `rejected`
 *     record. Once that window has elapsed the photo becomes eligible for
 *     deletion.
 *
 *  2. Expiry selectivity (R15.1, R15.5, R15.6): a check-in is selected for
 *     expiry if and only if its status is `pending` and its check-in date is
 *     earlier than the current calendar date (in the application's configured
 *     time zone). Applying the expiry transition changes only the record's
 *     status to `expired` and never touches the corresponding
 *     `shift_attendance` row — a guarantee this module upholds by construction
 *     (it returns a status-only change and has no access to attendance data).
 *
 * All functions are pure: they take the values they need and return a decision
 * or a new record value, performing no I/O.
 *
 * Requirements: 9.1, 15.1, 15.5, 15.6
 */

/** Lifecycle status of a check-in record. */
export type CheckInStatus = 'pending' | 'approved' | 'rejected' | 'expired';

/** Retention window length in days, measured from the resolution timestamp. */
export const RETENTION_WINDOW_DAYS = 30;

/** Retention window length in milliseconds. */
export const RETENTION_WINDOW_MS = RETENTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * The subset of a check-in record needed to compute its resolution timestamp
 * and retention-window status.
 */
export interface ResolvedRecord {
  status: CheckInStatus;
  /** Approval timestamp (ISO 8601). Resolution timestamp for `approved`. */
  approved_at?: string | null;
  /** Review timestamp (ISO 8601). Resolution timestamp for `rejected`. */
  reviewed_at?: string | null;
}

/**
 * The subset of a check-in record needed to decide photo-deletion eligibility.
 */
export interface PhotoRetentionRecord extends ResolvedRecord {
  /** Storage path of the photo; null once the photo has been deleted. */
  photo_path?: string | null;
  /** Whether the photo path has already been marked expired/deleted. */
  photo_expired?: boolean | null;
}

/** The subset of a check-in record needed to decide expiry eligibility. */
export interface ExpiryCandidate {
  status: CheckInStatus;
  /** Calendar date the check-in was made (`YYYY-MM-DD`, app time zone). */
  check_in_date: string;
}

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalizes a calendar date to its `YYYY-MM-DD` form. Accepts a bare date or
 * a fuller ISO 8601 timestamp (the date portion is used). Throws when the
 * value does not begin with a syntactically valid `YYYY-MM-DD` date, so
 * callers never silently compare malformed dates.
 */
function normalizeCalendarDate(value: string): string {
  const datePart = typeof value === 'string' ? value.slice(0, 10) : '';
  if (!DATE_ONLY_REGEX.test(datePart)) {
    throw new Error(`Invalid calendar date: ${String(value)}`);
  }
  return datePart;
}

/** Converts a `Date | number | ISO string` instant into epoch milliseconds. */
function toEpochMs(instant: Date | number | string): number {
  if (instant instanceof Date) {
    return instant.getTime();
  }
  if (typeof instant === 'number') {
    return instant;
  }
  return Date.parse(instant);
}

/**
 * The resolution timestamp of a record: the approval timestamp for an
 * `approved` record, the review timestamp for a `rejected` record, otherwise
 * `null` (a record that is not resolved has no resolution timestamp).
 * (R9.1)
 */
export function resolutionTimestamp(record: ResolvedRecord): string | null {
  if (record.status === 'approved') {
    return record.approved_at ?? null;
  }
  if (record.status === 'rejected') {
    return record.reviewed_at ?? null;
  }
  return null;
}

/**
 * Whether a record's 30-day retention window has elapsed as of `now`.
 *
 * The window is measured from the record's resolution timestamp (R9.1) and is
 * considered elapsed once at least `RETENTION_WINDOW_MS` has passed. Returns
 * `false` for records that are not resolved or whose resolution timestamp is
 * missing/unparseable, so the caller leaves such records untouched.
 */
export function isRetentionWindowElapsed(
  record: ResolvedRecord,
  now: Date | number | string,
): boolean {
  const resolvedAt = resolutionTimestamp(record);
  if (resolvedAt === null) {
    return false;
  }

  const resolvedMs = Date.parse(resolvedAt);
  if (!Number.isFinite(resolvedMs)) {
    return false;
  }

  const nowMs = toEpochMs(now);
  if (!Number.isFinite(nowMs)) {
    return false;
  }

  return nowMs - resolvedMs >= RETENTION_WINDOW_MS;
}

/**
 * Whether a resolved record's photo should be deleted on this processing
 * cycle: the retention window has elapsed and a photo is still stored (path
 * present and not already marked expired). Idempotent — records whose photo is
 * already expired/deleted are not re-selected (R9.2, R9.3).
 */
export function isPhotoDeletionDue(
  record: PhotoRetentionRecord,
  now: Date | number | string,
): boolean {
  if (record.photo_expired === true) {
    return false;
  }
  if (record.photo_path == null || record.photo_path === '') {
    return false;
  }
  return isRetentionWindowElapsed(record, now);
}

/**
 * Whether a record is eligible for expiry as of `currentDate`: it is selected
 * if and only if its status is `pending` and its check-in date is strictly
 * earlier than the current calendar date. This makes the expiry process
 * selective — `approved`, `rejected`, and already-`expired` records are never
 * selected (R15.1, R15.6).
 */
export function isExpiryEligible(
  record: ExpiryCandidate,
  currentDate: string,
): boolean {
  if (record.status !== 'pending') {
    return false;
  }
  return normalizeCalendarDate(record.check_in_date) < normalizeCalendarDate(currentDate);
}

/**
 * Selects the records eligible for expiry from a batch, preserving order.
 * A convenience over {@link isExpiryEligible} for the expire maintenance job.
 */
export function selectExpiryCandidates<T extends ExpiryCandidate>(
  records: readonly T[],
  currentDate: string,
): T[] {
  return records.filter((record) => isExpiryEligible(record, currentDate));
}

/**
 * Applies the expiry transition to a record. Returns a new record whose only
 * change is `status: 'expired'`; every other field is carried through
 * unchanged. This module never has access to `shift_attendance`, so an expiry
 * transition cannot affect attendance by construction (R15.5, R15.6).
 */
export function applyExpiry<T extends { status: CheckInStatus }>(record: T): T {
  return { ...record, status: 'expired' };
}
