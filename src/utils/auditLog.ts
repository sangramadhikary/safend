'use client';

/**
 * Audit logging — browser client.
 *
 * WHAT CHANGED AND WHY
 * --------------------
 * This module previously inserted audit rows straight into Supabase from the
 * browser, with the browser supplying the actor id, the actor email, and the IP
 * address. Those three fields are exactly the ones a record must not take on
 * trust, and the result was a log whose contents were whatever the client chose
 * to send. It also fired one network round trip per event, on the same connection
 * the user's actual work was competing for, and captured little beyond an action
 * string — an "Employee Updated" row named the employee but not the field.
 *
 * It now does four things differently:
 *
 *   1. WRITES GO THROUGH THE SERVER. `POST /api/audit/log` re-derives actor
 *      identity, roles, IP, geolocation, device, and timestamp from the request
 *      itself. The client describes only what happened.
 *
 *   2. EVENTS ARE BATCHED. Events accumulate in a queue and flush on a short
 *      timer, on a size threshold, or when the page is being unloaded. A bulk
 *      import that emits 200 events costs a handful of requests instead of 200.
 *
 *   3. CHANGES ARE DIFFED. `logChange` records which fields moved and what they
 *      moved from and to, so the trail shows the actual edit rather than the fact
 *      that an edit occurred.
 *
 *   4. CONTEXT IS ATTACHED. Session id, route, referrer, viewport and timezone
 *      offset ride along on every event, making a session reconstructable.
 *
 * FAILURE POSTURE
 * ---------------
 * Nothing here ever throws into the caller. Audit logging is instrumentation: if
 * it breaks, the user's actual operation must still succeed. Every failure path
 * ends in a console record so the event is at least recoverable from platform
 * logs.
 */

import { getSupabaseClient } from '@/integrations/supabase/client';
import { computeFieldDiff, type DiffOptions } from '@/lib/audit/diff';
import { resolveAction } from '@/lib/audit/actions';
import { captureUiState } from '@/lib/audit/ui-state';
import { captureAndUploadSnapshot } from '@/lib/audit/snapshot';
import type {
  AuditEventInput,
  AuditOutcome,
  AuditQuery,
  AuditQueryResult,
  AuditRecord,
} from '@/lib/audit/types';

export type { AuditEventInput, AuditRecord, AuditQuery, AuditQueryResult, AuditOutcome };

// ─────────────────────────────────────────────────────────────────────────────
// Session identity
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_KEY = 'safend.audit.sessionId';

/**
 * A stable id for the current browser session.
 *
 * Held in `sessionStorage` rather than `localStorage` deliberately: the point of
 * the value is to group one continuous sitting, and a `localStorage` id would
 * persist across weeks and merge unrelated sessions into one indistinguishable
 * stream.
 */
function getSessionId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // Private browsing modes can throw on storage access.
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ambient context
// ─────────────────────────────────────────────────────────────────────────────

/** Collect the navigation/display context available in the browser. */
function ambientContext(): Partial<AuditEventInput> {
  if (typeof window === 'undefined') return {};
  try {
    return {
      sessionId: getSessionId(),
      route: window.location.pathname + window.location.search,
      referrer: document.referrer || undefined,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      // Recorded so a timestamp can be rendered back in the actor's own local
      // time. The stored timestamp is UTC; without the offset there is no way to
      // say what time it was where she was sitting.
      tzOffsetMinutes: -new Date().getTimezoneOffset(),
      clientTimestamp: new Date().toISOString(),
    };
  } catch {
    return {};
  }
}

/** Resolve the current branch, when the app has one selected. */
function branchContext(): Partial<AuditEventInput> {
  if (typeof window === 'undefined') return {};
  try {
    const id = localStorage.getItem('selectedBranchId') ?? undefined;
    const name = localStorage.getItem('selectedBranchName') ?? undefined;
    return { branchId: id || undefined, branchName: name || undefined };
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Authenticated transport
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the auth header for an ingest call.
 *
 * The browser Supabase client keeps its session in `localStorage`, not cookies,
 * so the token has to be attached explicitly — a plain `fetch` would arrive at
 * the route unauthenticated.
 */
async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    const token = data.session?.access_token;
    return token
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      : { 'Content-Type': 'application/json' };
  } catch {
    return { 'Content-Type': 'application/json' };
  }
}

/**
 * Best-effort actor id for fallback attribution.
 *
 * Only used on the fallback path. The authoritative actor is always resolved
 * server-side from the verified session; this is a cached hint so that an event
 * which never reached the server is still attributable to someone in the logs.
 */
function fallbackActorId(): string {
  try {
    return (
      localStorage.getItem('userId') ||
      localStorage.getItem('userEmail') ||
      'unresolved'
    );
  } catch {
    return 'unresolved';
  }
}

/**
 * Last-resort record of events that could not be delivered.
 *
 * Emits ONE `[audit-fallback]` line per event, each carrying the full minimum
 * field set, rather than a single summary line for the batch. A batch summary
 * would make an undelivered event unreconstructable, which is the specific
 * failure this channel exists to prevent — a write that cannot be persisted must
 * still be recoverable from the platform logs.
 *
 * `ip_address` is recorded as `client-unresolvable` rather than a fabricated
 * value: the browser cannot read its own egress IP, and the request that would
 * have let the server resolve it is precisely the one that failed. Inventing a
 * plausible-looking IP here would put an untrue value into an audit record.
 */
function writeAuditFallbackInternal(events: AuditEventInput[], reason: string): void {
  const actorUserId = fallbackActorId();

  for (const event of events) {
    // Resolve the catalog code to its operator-facing label, which is what the
    // server would have stored. The fallback line is meant to be equivalent to
    // the row that failed to be written, so recording `hr.employee.update` here
    // while the table would have held `Employee Updated` would make the two
    // impossible to reconcile during an incident.
    const definition = resolveAction(event.action);

    writeAuditFallback(
      {
        user_id: actorUserId,
        action: definition?.label ?? event.action,
        action_code: definition?.code,
        severity: event.severity ?? definition?.severity,
        target: event.target,
        module: event.module ?? definition?.module,
        outcome: event.outcome ?? 'success',
        ip_address: 'client-unresolvable',
        timestamp: event.clientTimestamp ?? new Date().toISOString(),
        session_id: event.sessionId,
        route: event.route,
        entity_type: event.entityType,
        entity_id: event.entityId,
        changed_fields: event.changedFields,
        before_data: event.beforeData,
        after_data: event.afterData,
        details: event.details,
        error_message: event.errorMessage,
      },
      reason
    );
  }
}

/**
 * Fallback channel for audit entries whose primary write fails.
 *
 * Retained as a named export because it is part of the module's documented
 * surface and is referenced by the security control tests.
 */
export const writeAuditFallback = (entry: Record<string, any>, error?: string): void => {
  try {
    console.error(
      '[audit-fallback]',
      JSON.stringify({ ...entry, fallbackReason: error ?? 'primary-write-failed' })
    );
  } catch {
    console.error('[audit-fallback] failed to serialize audit entry', error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Batching queue
// ─────────────────────────────────────────────────────────────────────────────

/** Flush when this many events are pending. Matches the route's batch ceiling. */
const FLUSH_SIZE = 25;

/** Flush this long after the first pending event arrives. */
const FLUSH_INTERVAL_MS = 2000;

/** Discard the queue beyond this size, to bound memory if the network is down. */
const MAX_QUEUE = 500;

let queue: AuditEventInput[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let unloadHooked = false;

/**
 * Deliver a batch to the ingest route.
 *
 * `keepalive` is set so a flush triggered during page unload still completes.
 * `sendBeacon` would be the conventional choice there, but it cannot carry an
 * `Authorization` header, and the ingest route requires one.
 */
async function deliver(events: AuditEventInput[], keepalive = false): Promise<boolean> {
  if (events.length === 0) return true;
  try {
    const res = await fetch('/api/audit/log', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ events }),
      credentials: 'same-origin',
      keepalive,
    });
    if (!res.ok) {
      writeAuditFallbackInternal(events, `ingest responded ${res.status}`);
      return false;
    }
    return true;
  } catch (error: any) {
    writeAuditFallbackInternal(events, error?.message ?? 'network error');
    return false;
  }
}

/** Send everything currently queued. */
export async function flushAuditQueue(keepalive = false): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;

  const batch = queue.splice(0, FLUSH_SIZE);
  await deliver(batch, keepalive);

  // Anything that arrived past the batch ceiling goes out on the next tick.
  if (queue.length > 0) scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushAuditQueue();
  }, FLUSH_INTERVAL_MS);
}

/**
 * Ensure pending events are delivered before the page goes away.
 *
 * `pagehide` and `visibilitychange` are used rather than `beforeunload`, which
 * is unreliable on mobile Safari and is never fired when a tab is discarded.
 */
function hookUnload(): void {
  if (unloadHooked || typeof window === 'undefined') return;
  unloadHooked = true;

  const flush = () => void flushAuditQueue(true);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

/** Add an event to the queue, flushing if the threshold is reached. */
function enqueue(event: AuditEventInput): void {
  if (queue.length >= MAX_QUEUE) {
    writeAuditFallbackInternal([event], 'audit queue overflow');
    return;
  }
  queue.push(event);
  hookUnload();

  if (queue.length >= FLUSH_SIZE) {
    void flushAuditQueue();
  } else {
    scheduleFlush();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public write API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options accepted by {@link logAuditEvent}.
 *
 * `sessionId`, `referrer`, `viewport`, `tzOffsetMinutes` and `clientTimestamp` are
 * omitted deliberately: they describe the ambient browser state and are filled in
 * automatically, so letting a call site set them would only allow them to be set
 * wrongly.
 *
 * `route` is NOT omitted, because there is one case where the caller genuinely
 * knows better than the ambient value: a page-dwell entry is recorded at the
 * moment of navigating away, so `window.location` already points at the NEW page
 * while the entry belongs to the old one. An explicit `route` wins, because the
 * caller's values are spread after the ambient ones.
 */
export interface LogAuditEventOptions
  extends Omit<AuditEventInput, 'sessionId' | 'referrer' | 'viewport' | 'tzOffsetMinutes' | 'clientTimestamp'> {
  /**
   * Force snapshot capture on or off, overriding the action catalog default.
   * Leave unset to use the catalog's decision.
   */
  snapshot?: boolean;
  /** Element that triggered the action, recorded in the UI state snapshot. */
  trigger?: HTMLElement | null;
  /** Bypass batching and deliver immediately. */
  immediate?: boolean;
}

/**
 * Record an audit event.
 *
 * Resolves ambient context, optionally captures a UI snapshot, then queues the
 * event. Returns once queued (or once delivered, for `immediate`) — callers
 * normally `void` this rather than awaiting it.
 */
export async function logAuditEvent(options: LogAuditEventOptions): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const { snapshot, trigger, immediate, ...rest } = options;

    const definition = resolveAction(rest.action);
    const wantSnapshot = snapshot ?? definition?.snapshot ?? false;

    // Structured UI state is cheap, so it is captured for every event that
    // requests a visual snapshot and for all failures — the two cases where
    // knowing what was on screen actually matters.
    const wantUiState = wantSnapshot || rest.outcome === 'failure' || rest.outcome === 'denied';

    const event: AuditEventInput = {
      ...ambientContext(),
      ...branchContext(),
      ...rest,
      uiState: rest.uiState ?? (wantUiState ? captureUiState(trigger) : undefined),
    };

    if (wantSnapshot) {
      // Awaited before enqueueing so the path is attached to this event rather
      // than requiring a follow-up update — the table is append-only, so there is
      // no second chance to add it.
      const path = await captureAndUploadSnapshot(
        { action: rest.action, target: rest.target },
        null
      );
      if (path) event.snapshotPath = path;
    }

    if (immediate) {
      await deliver([event]);
    } else {
      enqueue(event);
    }
  } catch (error: any) {
    writeAuditFallbackInternal(
      [{ action: options.action, target: options.target, module: options.module }],
      error?.message ?? 'logAuditEvent threw'
    );
  }
}

/** Options for {@link logChange}. */
export interface LogChangeOptions extends Omit<LogAuditEventOptions, 'changedFields' | 'beforeData' | 'afterData'> {
  /** Entity state before the mutation. Omit for a creation. */
  before?: unknown;
  /** Entity state after the mutation. Omit for a deletion. */
  after?: unknown;
  /** Field paths to exclude from the diff. */
  ignoreFields?: readonly string[];
  /**
   * Record the event even when no field actually changed. Off by default: a
   * "saved with no changes" entry is noise that buries the real edits.
   */
  logUnchanged?: boolean;
  diffOptions?: DiffOptions;
}

/**
 * Field paths excluded by default when diffing a whole entity.
 *
 * The primary key and the timestamp columns are present on every record and are
 * never a decision anyone made. Without this, a deletion would report `id` and
 * `createdAt` as removed fields alongside the values that actually matter.
 */
const ENTITY_NOISE_FIELDS = [
  'id', 'createdAt', 'created_at', 'updatedAt', 'updated_at',
] as const;

/**
 * Record a mutation together with its field-level diff.
 *
 * This is the function that makes the trail answer "what exactly did she
 * change?". Prefer it over {@link logAuditEvent} for any create, update, or
 * delete.
 */
export async function logChange(options: LogChangeOptions): Promise<void> {
  const { before, after, ignoreFields, logUnchanged, diffOptions, ...rest } = options;

  // Normalize a wholly-absent side to an empty object so the diff descends into
  // the present side and enumerates its fields individually.
  //
  // Without this, diffing an object against `null` records a single change at the
  // root path whose value is an opaque "{12 fields: …}" summary — so a deletion
  // would state that something was removed without saying what it contained,
  // which is precisely the question a deletion review asks.
  const isAbsent = (v: unknown) => v === null || v === undefined;
  const normalizedBefore = isAbsent(before) && !isAbsent(after) ? {} : before;
  const normalizedAfter = isAbsent(after) && !isAbsent(before) ? {} : after;

  const diff = computeFieldDiff(normalizedBefore, normalizedAfter, {
    ...diffOptions,
    ignore: [
      ...ENTITY_NOISE_FIELDS,
      ...(ignoreFields ?? []),
      ...(diffOptions?.ignore ?? []),
    ],
  });

  if (diff.isEmpty && !logUnchanged) return;

  await logAuditEvent({
    ...rest,
    changedFields: diff.changedFields,
    beforeData: diff.before,
    afterData: diff.after,
    details: {
      ...(rest.details ?? {}),
      changedFieldCount: diff.changedFields.length,
    },
  });
}

/**
 * Legacy write entry point, preserved for the existing call sites.
 *
 * `user` and `userEmail` are accepted but ignored: identity is resolved
 * server-side from the verified session now, and honouring a caller-supplied
 * actor would reintroduce exactly the spoofing problem this rewrite removes. The
 * parameters remain in the signature so the seven existing callers compile
 * unchanged.
 */
export const logActivity = async (activity: {
  user?: string;
  userEmail?: string;
  action: string;
  target: string;
  module: string;
  userAgent?: string;
  outcome?: AuditOutcome;
  details?: any;
}): Promise<{ success: boolean; error?: string }> => {
  if (typeof window === 'undefined') {
    return { success: false, error: 'logActivity called in a non-browser environment.' };
  }
  try {
    await logAuditEvent({
      action: activity.action,
      target: activity.target,
      module: activity.module,
      outcome: activity.outcome ?? 'success',
      details: activity.details ?? {},
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Public read API
// ─────────────────────────────────────────────────────────────────────────────

/** Serialize a query object into the read route's parameters. */
function toSearchParams(query: AuditQuery): URLSearchParams {
  const params = new URLSearchParams();
  const list = (key: string, values?: readonly string[]) => {
    if (values && values.length > 0) params.set(key, values.join(','));
  };

  if (query.search) params.set('search', query.search);
  list('actors', query.actors);
  list('actions', query.actions);
  list('modules', query.modules);
  list('outcomes', query.outcomes);
  list('severities', query.severities);
  list('categories', query.categories);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.entityType) params.set('entityType', query.entityType);
  if (query.entityId) params.set('entityId', query.entityId);
  if (query.sessionId) params.set('sessionId', query.sessionId);
  if (query.changedField) params.set('changedField', query.changedField);
  if (query.hasSnapshot !== undefined) params.set('hasSnapshot', String(query.hasSnapshot));
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortDir) params.set('sortDir', query.sortDir);
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));

  return params;
}

/**
 * Fetch a page of audit records.
 *
 * Every filter, the sort, and the pagination are applied in Postgres. The old
 * readers pulled a fixed 500 rows and filtered in the browser, which silently
 * truncated results and made the summary counts wrong once the table grew past
 * that ceiling.
 *
 * Throws on failure so the caller can distinguish "no matching records" from
 * "the request did not succeed" — the previous readers returned `[]` for both,
 * rendering an empty table on an authorization error.
 */
export async function fetchAuditLog(
  query: AuditQuery = {},
  signal?: AbortSignal
): Promise<AuditQueryResult> {
  const headers = await authHeaders();
  const res = await fetch(`/api/bff/audit-log?${toSearchParams(query).toString()}`, {
    headers,
    credentials: 'same-origin',
    signal,
  });

  if (res.status === 403) {
    throw new Error('You do not have permission to view the audit log.');
  }
  if (res.status === 401) {
    throw new Error('Your session has expired. Sign in again to view the audit log.');
  }
  if (!res.ok) {
    throw new Error(`Failed to load audit log (${res.status})`);
  }

  return (await res.json()) as AuditQueryResult;
}

/**
 * Fetch every record matching a query, across pages.
 *
 * Used by export and print, which must cover the whole filtered set rather than
 * the page on screen. Bounded by `maxRecords` so an unfiltered export cannot
 * attempt to pull an unbounded table into the browser.
 */
export async function fetchAllAuditLog(
  query: AuditQuery = {},
  maxRecords = 10_000,
  onProgress?: (loaded: number, total: number) => void
): Promise<AuditRecord[]> {
  const pageSize = 500;
  const records: AuditRecord[] = [];

  let page = 1;
  let total = Infinity;

  while (records.length < Math.min(maxRecords, total)) {
    const result = await fetchAuditLog({ ...query, page, pageSize });
    total = result.facets.total;
    records.push(...result.records);
    onProgress?.(records.length, Math.min(maxRecords, total));

    if (result.records.length < pageSize || page >= result.totalPages) break;
    page += 1;
  }

  return records.slice(0, maxRecords);
}

/** Resolve a short-lived signed URL for a stored snapshot. */
export async function getSnapshotUrl(path: string): Promise<string | null> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`/api/audit/snapshot?path=${encodeURIComponent(path)}`, {
      headers,
      credentials: 'same-origin',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convenience wrappers, one per audited action.
 *
 * The names and signatures of the pre-existing helpers are preserved so the
 * current call sites keep working, but each now passes a catalog action code
 * instead of a free-text label, which is what gives the entry its severity,
 * category, and snapshot decision.
 *
 * Helpers that record a mutation accept `before`/`after` so the diff is captured.
 */
export const auditActions = {
  // ── Authentication ────────────────────────────────────────────────────────
  userLogin: (userName: string, userEmail: string) =>
    logAuditEvent({
      action: 'auth.login', target: 'System',
      details: { userName, userEmail }, immediate: true,
    }),

  userLogout: (userName: string, userEmail: string) =>
    logAuditEvent({
      action: 'auth.logout', target: 'System',
      details: { userName, userEmail },
      // Delivered immediately: the queue would not survive the navigation that
      // follows a sign-out.
      immediate: true,
    }),

  loginFailed: (userEmail: string, reason?: string) =>
    logAuditEvent({
      action: 'auth.login.failed', target: userEmail || 'unknown',
      outcome: 'failure', errorMessage: reason,
      details: { attemptedEmail: userEmail, reason }, immediate: true,
    }),

  authDenied: (userEmail: string, resource: string, reason?: string) =>
    logAuditEvent({
      action: 'auth.denied', target: resource,
      outcome: 'denied', errorMessage: reason,
      details: { attemptedEmail: userEmail, resource, reason }, immediate: true,
    }),

  sessionExpired: () =>
    logAuditEvent({ action: 'auth.session.expired', target: 'System', immediate: true }),

  biometricLogin: (userName: string, userEmail: string) =>
    logAuditEvent({
      action: 'auth.biometric.login', target: 'System',
      details: { userName, userEmail }, immediate: true,
    }),

  passwordReset: (targetUser: string) =>
    logAuditEvent({ action: 'auth.password.reset', target: targetUser }),

  // ── Navigation ────────────────────────────────────────────────────────────
  pageViewed: (pageName: string) =>
    logAuditEvent({ action: 'nav.page.view', target: pageName, module: pageName }),

  recordViewed: (entityType: string, entityId: string, label?: string) =>
    logAuditEvent({
      action: 'nav.record.view', target: label ?? entityId,
      entityType, entityId, entityLabel: label,
    }),

  // ── User management ───────────────────────────────────────────────────────
  userCreated: (userName: string, userEmail: string, after?: unknown) =>
    logAuditEvent({
      action: 'user.create', target: userName,
      entityType: 'users', entityLabel: userName,
      details: { createdUserEmail: userEmail },
      ...(after ? { afterData: { snapshot: after } } : {}),
    }),

  userUpdated: (userName: string, changes: any, before?: unknown, after?: unknown) =>
    before !== undefined || after !== undefined
      ? logChange({
          action: 'user.update', target: userName,
          entityType: 'users', entityLabel: userName,
          before, after,
        })
      : logAuditEvent({
          action: 'user.update', target: userName,
          entityType: 'users', entityLabel: userName,
          details: changes ?? {},
        }),

  userDeleted: (userName: string, before?: unknown) =>
    logChange({
      action: 'user.delete', target: userName,
      entityType: 'users', entityLabel: userName,
      before, after: null, logUnchanged: true,
    }),

  roleChanged: (userName: string, oldRoles: string[], newRoles: string[]) =>
    logChange({
      action: 'user.role.change', target: userName,
      entityType: 'users', entityLabel: userName,
      before: { roles: oldRoles }, after: { roles: newRoles },
      logUnchanged: true,
    }),

  userStatusChanged: (userName: string, newStatus: string, oldStatus?: string) =>
    logChange({
      action: 'user.status.change', target: userName,
      entityType: 'users', entityLabel: userName,
      before: { status: oldStatus ?? null }, after: { status: newStatus },
      logUnchanged: true,
    }),

  permissionChanged: (roleName: string, changes?: any, before?: unknown, after?: unknown) =>
    before !== undefined || after !== undefined
      ? logChange({
          action: 'permission.change', target: roleName,
          entityType: 'roles', entityLabel: roleName, before, after, logUnchanged: true,
        })
      : logAuditEvent({
          action: 'permission.change', target: roleName,
          entityType: 'roles', entityLabel: roleName, details: changes ?? {},
        }),

  roleCreated: (roleName: string, definition?: unknown) =>
    logChange({
      action: 'role.create', target: roleName,
      entityType: 'roles', entityLabel: roleName,
      before: null, after: definition ?? { name: roleName }, logUnchanged: true,
    }),

  roleDefinitionUpdated: (roleName: string, before?: unknown, after?: unknown) =>
    logChange({
      action: 'role.update', target: roleName,
      entityType: 'roles', entityLabel: roleName,
      before, after, logUnchanged: true,
    }),

  roleDeleted: (roleName: string, before?: unknown) =>
    logChange({
      action: 'role.delete', target: roleName,
      entityType: 'roles', entityLabel: roleName,
      before, after: null, logUnchanged: true,
    }),

  /**
   * Record an administrator resetting another user's credentials.
   *
   * The new password is never passed in, and would be masked by the redaction
   * rules if it were. What matters is that a reset happened, to whom, by whom,
   * and by which mechanism.
   */
  credentialReset: (
    targetUser: string,
    mode: 'direct' | 'email' | '2fa',
    outcome: AuditOutcome = 'success',
    errorMessage?: string
  ) =>
    logAuditEvent({
      action: mode === '2fa' ? 'auth.mfa.reset' : 'auth.password.reset',
      target: targetUser,
      entityType: 'users', entityLabel: targetUser,
      outcome, errorMessage,
      details: { resetMode: mode, targetUser },
      immediate: true,
    }),

  // ── Sales ─────────────────────────────────────────────────────────────────
  leadCreated: (leadName: string, details?: any) =>
    logAuditEvent({
      action: 'sales.lead.create', target: leadName,
      entityType: 'leads', entityLabel: leadName, details,
    }),

  leadUpdated: (leadName: string, changes?: any, before?: unknown, after?: unknown) =>
    before !== undefined || after !== undefined
      ? logChange({
          action: 'sales.lead.update', target: leadName,
          entityType: 'leads', entityLabel: leadName, before, after,
        })
      : logAuditEvent({
          action: 'sales.lead.update', target: leadName,
          entityType: 'leads', entityLabel: leadName, details: changes,
        }),

  leadStatusChanged: (leadName: string, oldStatus: string, newStatus: string) =>
    logChange({
      action: 'sales.lead.status.change', target: leadName,
      entityType: 'leads', entityLabel: leadName,
      before: { status: oldStatus }, after: { status: newStatus }, logUnchanged: true,
    }),

  leadDeleted: (leadName: string, before?: unknown) =>
    logChange({
      action: 'sales.lead.delete', target: leadName,
      entityType: 'leads', entityLabel: leadName,
      before, after: null, logUnchanged: true,
    }),

  followupAdded: (leadName: string, followupType?: string) =>
    logAuditEvent({
      action: 'sales.followup.add', target: leadName,
      entityType: 'leads', entityLabel: leadName, details: { type: followupType },
    }),

  quotationCreated: (quotationId: string, clientName?: string) =>
    logAuditEvent({
      action: 'sales.quotation.create', target: quotationId,
      entityType: 'quotations', entityId: quotationId, details: { clientName },
    }),

  quotationUpdated: (quotationId: string, changes?: any, before?: unknown, after?: unknown) =>
    before !== undefined || after !== undefined
      ? logChange({
          action: 'sales.quotation.update', target: quotationId,
          entityType: 'quotations', entityId: quotationId, before, after,
        })
      : logAuditEvent({
          action: 'sales.quotation.update', target: quotationId,
          entityType: 'quotations', entityId: quotationId, details: changes,
        }),

  agreementCreated: (agreementId: string, clientName?: string) =>
    logAuditEvent({
      action: 'sales.agreement.create', target: agreementId,
      entityType: 'agreements', entityId: agreementId, details: { clientName },
    }),

  workOrderCreated: (workOrderId: string, clientName?: string) =>
    logAuditEvent({
      action: 'sales.workorder.create', target: workOrderId,
      entityType: 'work_orders', entityId: workOrderId, details: { clientName },
    }),

  workOrderStatusChanged: (workOrderId: string, oldStatus: string, newStatus: string) =>
    logChange({
      action: 'sales.workorder.status.change', target: workOrderId,
      entityType: 'work_orders', entityId: workOrderId,
      before: { status: oldStatus }, after: { status: newStatus }, logUnchanged: true,
    }),

  // ── Operations ────────────────────────────────────────────────────────────
  rotaCreated: (postName: string, date?: string) =>
    logAuditEvent({
      action: 'ops.rota.create', target: postName,
      entityType: 'rota', entityLabel: postName, details: { date },
    }),

  rotaUpdated: (postName: string, changes?: any, before?: unknown, after?: unknown) =>
    before !== undefined || after !== undefined
      ? logChange({
          action: 'ops.rota.update', target: postName,
          entityType: 'rota', entityLabel: postName, before, after,
        })
      : logAuditEvent({
          action: 'ops.rota.update', target: postName,
          entityType: 'rota', entityLabel: postName, details: changes,
        }),

  attendanceMarked: (employeeName: string, status: string, date?: string) =>
    logAuditEvent({
      action: 'ops.attendance.mark', target: employeeName,
      entityType: 'attendance', entityLabel: employeeName, details: { status, date },
    }),

  patrolLogged: (postName: string, details?: any) =>
    logAuditEvent({
      action: 'ops.patrol.log', target: postName,
      entityType: 'patrols', entityLabel: postName, details,
    }),

  penaltyIssued: (employeeName: string, reason?: string, amount?: number) =>
    logAuditEvent({
      action: 'ops.penalty.issue', target: employeeName,
      entityType: 'penalties', entityLabel: employeeName, details: { reason, amount },
    }),

  incidentReported: (postName: string, incidentType?: string) =>
    logAuditEvent({
      action: 'ops.incident.report', target: postName,
      entityType: 'incidents', entityLabel: postName, details: { incidentType },
    }),

  // ── HR ────────────────────────────────────────────────────────────────────
  employeeCreated: (employeeName: string, employeeId?: string, after?: unknown) =>
    logAuditEvent({
      action: 'hr.employee.create', target: employeeName,
      entityType: 'employees', entityId: employeeId, entityLabel: employeeName,
      details: { employeeId },
      ...(after ? { afterData: { snapshot: after } } : {}),
    }),

  employeeUpdated: (employeeName: string, changes?: any, before?: unknown, after?: unknown) =>
    before !== undefined || after !== undefined
      ? logChange({
          action: 'hr.employee.update', target: employeeName,
          entityType: 'employees', entityLabel: employeeName, before, after,
        })
      : logAuditEvent({
          action: 'hr.employee.update', target: employeeName,
          entityType: 'employees', entityLabel: employeeName, details: changes,
        }),

  employeeStatusChanged: (employeeName: string, oldStatus: string, newStatus: string) =>
    logChange({
      action: 'hr.employee.status.change', target: employeeName,
      entityType: 'employees', entityLabel: employeeName,
      before: { status: oldStatus }, after: { status: newStatus }, logUnchanged: true,
    }),

  employeeDeleted: (employeeName: string, before?: unknown) =>
    logChange({
      action: 'hr.employee.delete', target: employeeName,
      entityType: 'employees', entityLabel: employeeName,
      before, after: null, logUnchanged: true,
    }),

  employeesImported: (count: number, details?: any) =>
    logAuditEvent({
      action: 'hr.employee.import', target: `${count} employees`,
      entityType: 'employees', details: { count, ...(details ?? {}) },
    }),

  leaveApproved: (employeeName: string, leaveType?: string) =>
    logAuditEvent({
      action: 'hr.leave.approve', target: employeeName,
      entityType: 'leave_requests', entityLabel: employeeName, details: { leaveType },
    }),

  leaveRejected: (employeeName: string, reason?: string) =>
    logAuditEvent({
      action: 'hr.leave.reject', target: employeeName,
      entityType: 'leave_requests', entityLabel: employeeName, details: { reason },
    }),

  payrollGenerated: (month: string, employeeCount?: number, details?: any) =>
    logAuditEvent({
      action: 'hr.payroll.generate', target: month,
      entityType: 'payroll_runs', entityLabel: month,
      details: { employeeCount, ...(details ?? {}) },
    }),

  /**
   * Record a payroll workflow transition.
   *
   * `before`/`after` are the full request objects, so the diff shows the status
   * move together with any other field the transition set (approver name,
   * rejection reason, payment reference).
   */
  payrollTransition: (
    action:
      | 'hr.payroll.submit' | 'hr.payroll.approve' | 'hr.payroll.reject'
      | 'hr.payroll.process' | 'hr.salary.hold' | 'hr.salary.hold.release',
    requestId: string,
    before: unknown,
    after: unknown,
    details?: any
  ) =>
    logChange({
      action, target: requestId,
      entityType: 'payroll_requests', entityId: requestId, entityLabel: requestId,
      before, after, details, logUnchanged: true,
    }),

  // ── Accounts ──────────────────────────────────────────────────────────────
  invoiceCreated: (invoiceId: string, clientName?: string, amount?: number) =>
    logAuditEvent({
      action: 'accounts.invoice.create', target: invoiceId,
      entityType: 'invoices', entityId: invoiceId, details: { clientName, amount },
    }),

  invoiceUpdated: (invoiceId: string, changes?: any, before?: unknown, after?: unknown) =>
    before !== undefined || after !== undefined
      ? logChange({
          action: 'accounts.invoice.update', target: invoiceId,
          entityType: 'invoices', entityId: invoiceId, before, after,
        })
      : logAuditEvent({
          action: 'accounts.invoice.update', target: invoiceId,
          entityType: 'invoices', entityId: invoiceId, details: changes,
        }),

  invoiceDeleted: (invoiceId: string, before?: unknown) =>
    logChange({
      action: 'accounts.invoice.delete', target: invoiceId,
      entityType: 'invoices', entityId: invoiceId,
      before, after: null, logUnchanged: true,
    }),

  paymentReceived: (invoiceId: string, amount: number, method?: string) =>
    logAuditEvent({
      action: 'accounts.payment.receive', target: invoiceId,
      entityType: 'invoices', entityId: invoiceId, details: { amount, method },
    }),

  billPaid: (vendorName: string, amount: number, billId?: string) =>
    logAuditEvent({
      action: 'accounts.bill.pay', target: vendorName,
      entityType: 'bills', entityId: billId, details: { amount, billId },
    }),

  expenseRecorded: (category: string, amount: number) =>
    logAuditEvent({
      action: 'accounts.expense.record', target: category,
      entityType: 'expenses', details: { amount },
    }),

  // ── Branch ────────────────────────────────────────────────────────────────
  branchCreated: (branchName: string) =>
    logAuditEvent({
      action: 'branch.create', target: branchName,
      entityType: 'branches', entityLabel: branchName,
    }),

  branchUpdated: (branchName: string, changes?: any, before?: unknown, after?: unknown) =>
    before !== undefined || after !== undefined
      ? logChange({
          action: 'branch.update', target: branchName,
          entityType: 'branches', entityLabel: branchName, before, after,
        })
      : logAuditEvent({
          action: 'branch.update', target: branchName,
          entityType: 'branches', entityLabel: branchName, details: changes,
        }),

  branchSwitched: (branchName: string) =>
    logAuditEvent({
      action: 'branch.switch', target: branchName,
      entityType: 'branches', entityLabel: branchName,
    }),

  // ── Data operations ───────────────────────────────────────────────────────
  dataExported: (module: string, recordCount: number, format?: string) =>
    logAuditEvent({
      action: 'data.export', target: `${recordCount} records`,
      module, details: { format, recordCount },
    }),

  dataImported: (module: string, recordCount: number) =>
    logAuditEvent({
      action: 'data.import', target: `${recordCount} records`,
      module, details: { recordCount },
    }),

  reportGenerated: (reportName: string, module?: string) =>
    logAuditEvent({
      action: 'report.generate', target: reportName, module: module || 'Reports',
    }),

  documentUploaded: (fileName: string, module?: string) =>
    logAuditEvent({
      action: 'document.upload', target: fileName,
      module: module || 'Documents', entityType: 'documents', entityLabel: fileName,
    }),

  documentDownloaded: (fileName: string, module?: string) =>
    logAuditEvent({
      action: 'document.download', target: fileName,
      module: module || 'Documents', entityType: 'documents', entityLabel: fileName,
    }),

  documentDeleted: (fileName: string, module?: string) =>
    logAuditEvent({
      action: 'document.delete', target: fileName,
      module: module || 'Documents', entityType: 'documents', entityLabel: fileName,
    }),

  recordDeleted: (recordType: string, recordId: string, module?: string, before?: unknown) =>
    logChange({
      action: 'record.delete', target: recordId,
      module: module || 'System', entityType: recordType, entityId: recordId,
      details: { recordType }, before, after: null, logUnchanged: true,
    }),

  settingsChanged: (settingName: string, details?: any, before?: unknown, after?: unknown) =>
    before !== undefined || after !== undefined
      ? logChange({
          action: 'settings.change', target: settingName,
          entityType: 'settings', entityLabel: settingName, before, after, logUnchanged: true,
        })
      : logAuditEvent({
          action: 'settings.change', target: settingName,
          entityType: 'settings', entityLabel: settingName, details,
        }),
};
