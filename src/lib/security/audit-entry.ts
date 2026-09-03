/**
 * Audit-entry builder (Requirement 15.1).
 *
 * Privileged operations (user creation, role change, file deletion, login, and
 * authorization-denied / login-failure events) must produce an audit record
 * carrying, at minimum, the actor's authenticated user ID, the action type, the
 * affected resource ID, the operation outcome, the source client IP, and a UTC
 * timestamp at a precision of at least one second.
 *
 * The legacy logger (`src/utils/auditLog.ts`) substituted hardcoded sentinels —
 * a `'client-side (see server logs for IP)'` IP and a default `'Admin'` /
 * `'admin@safend.com'` actor — in place of the real runtime values. This
 * builder is the testable core that removes that behavior: every required field
 * is populated *from the supplied input*, and the builder never swaps in a
 * placeholder for a value the caller provided. When a required value is missing
 * or empty it fails loudly rather than silently inserting a sentinel.
 */

/** The outcome of an audited operation. */
export type AuditOutcome = 'success' | 'failure' | 'denied';

/** Input describing a single audit event. */
export interface AuditEntryInput {
  /** The actor's authenticated user ID. */
  actorUserId: string;
  /** The action type, e.g. `user.create`, `role.change`, `file.delete`. */
  actionType: string;
  /** The affected resource's identifier. */
  affectedResourceId: string;
  /** The outcome of the operation. */
  outcome: AuditOutcome;
  /** The resolved source client IP address. */
  sourceClientIp: string;
  /**
   * The event time. Accepts a `Date` or an ISO-8601 string. When omitted, the
   * current time is used. Normalized to a UTC ISO-8601 string on output.
   */
  timestamp?: Date | string;
}

/** A built audit entry with all required fields populated. */
export interface AuditEntry {
  actorUserId: string;
  actionType: string;
  affectedResourceId: string;
  outcome: AuditOutcome;
  sourceClientIp: string;
  /** UTC ISO-8601 timestamp at >= 1-second precision. */
  timestamp: string;
}

/** Required string fields that must be supplied (cannot be defaulted). */
const REQUIRED_STRING_FIELDS: ReadonlyArray<
  keyof Pick<
    AuditEntryInput,
    'actorUserId' | 'actionType' | 'affectedResourceId' | 'sourceClientIp'
  >
> = ['actorUserId', 'actionType', 'affectedResourceId', 'sourceClientIp'];

const VALID_OUTCOMES: ReadonlySet<AuditOutcome> = new Set<AuditOutcome>([
  'success',
  'failure',
  'denied',
]);

/**
 * Resolve the supplied timestamp to a UTC ISO-8601 string at >= 1-second
 * precision. Throws on an invalid date so a malformed value is never silently
 * replaced with a placeholder time.
 */
function resolveTimestamp(timestamp: Date | string | undefined): string {
  const date =
    timestamp === undefined
      ? new Date()
      : timestamp instanceof Date
        ? timestamp
        : new Date(timestamp);

  const time = date.getTime();
  if (Number.isNaN(time)) {
    throw new Error('Audit entry timestamp is not a valid date.');
  }

  // toISOString() yields a UTC ('Z') value with millisecond precision, which
  // satisfies the >= 1-second precision requirement.
  return date.toISOString();
}

/**
 * Build an audit entry from the supplied event input.
 *
 * Every required field is copied directly from the input. The builder never
 * substitutes a placeholder sentinel (such as a hardcoded client IP or a
 * default actor name) for a value the caller supplied. A missing or empty
 * required field, an invalid outcome, or an invalid timestamp causes the
 * builder to throw rather than silently insert a sentinel.
 *
 * @param input - the audit event input
 * @returns the populated audit entry
 */
export function buildAuditEntry(input: AuditEntryInput): AuditEntry {
  for (const field of REQUIRED_STRING_FIELDS) {
    const value = input[field];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Audit entry is missing a required value: ${field}.`);
    }
  }

  if (!VALID_OUTCOMES.has(input.outcome)) {
    throw new Error(`Audit entry has an invalid outcome: ${String(input.outcome)}.`);
  }

  return {
    actorUserId: input.actorUserId,
    actionType: input.actionType,
    affectedResourceId: input.affectedResourceId,
    outcome: input.outcome,
    sourceClientIp: input.sourceClientIp,
    timestamp: resolveTimestamp(input.timestamp),
  };
}
