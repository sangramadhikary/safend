/**
 * Shared audit types and the wire contract between the browser logger, the
 * server ingest route, and the admin read route.
 *
 * Kept dependency-free (types plus a Zod schema) so both the client bundle and
 * the Node route handlers can import it without pulling in Supabase or DOM APIs.
 */

import { z } from 'zod';
import type { ActionCategory, AuditSeverity } from './actions';
import type { FieldChange } from './diff';

/** Outcome of an audited operation. Mirrors the DB CHECK constraint. */
export type AuditOutcome = 'success' | 'failure' | 'denied';

/** Device form factor, derived server-side from the user agent. */
export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';

/**
 * A structured snapshot of what was on screen when the action occurred.
 *
 * Recorded alongside (not instead of) the PNG. An image is good evidence but bad
 * data: it cannot be searched, it breaks under CSS changes, and it costs orders
 * of magnitude more to store. This object is queryable, diffable, and survives
 * a redesign — so it is captured for far more actions than the image is.
 */
export interface UiStateSnapshot {
  /** Document title at capture time. */
  title?: string;
  /** Primary visible heading, usually the page's h1. */
  heading?: string;
  /** Active tab or sub-view label, when the page has one. */
  activeTab?: string;
  /** Number of rows visible in the primary table, if any. */
  visibleRowCount?: number;
  /** Filters and search terms active on screen, as label/value pairs. */
  activeFilters?: Record<string, string>;
  /**
   * Values of visible form fields, redacted through the standard rules. This is
   * what makes "she submitted the form with these values" reviewable.
   */
  formValues?: Record<string, unknown>;
  /** Label of the control that triggered the action, e.g. `Confirm Delete`. */
  triggerLabel?: string;
  /** Scroll offset, so a snapshot can be related to a long page. */
  scrollY?: number;
}

/**
 * One audit event as submitted by the client to the ingest route.
 *
 * Fields the client is NOT trusted to supply are absent by design: IP address,
 * geolocation, parsed OS/browser/device, actor roles, and the server timestamp
 * are all resolved server-side. A browser can lie about every one of them, and
 * an audit trail that records self-reported identity is not an audit trail.
 */
export interface AuditEventInput {
  /** Catalog code, or a legacy label for the transitional call sites. */
  action: string;
  /** What was acted upon, as shown in the Target column. */
  target: string;
  /** Owning module. Defaults to the catalog module when omitted. */
  module?: string;
  outcome?: AuditOutcome;
  /** Overrides the catalog severity when a call site knows better. */
  severity?: AuditSeverity;

  /** Stable entity addressing, preferred over the legacy target string. */
  entityType?: string;
  entityId?: string;
  entityLabel?: string;

  /** Free-form supplementary payload. */
  details?: Record<string, unknown>;

  /** Field-level change record produced by `computeFieldDiff`. */
  changedFields?: string[];
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;

  /** Correlation identifiers. */
  sessionId?: string;
  correlationId?: string;

  /** Navigation context. */
  route?: string;
  referrer?: string;
  viewport?: string;
  tzOffsetMinutes?: number;

  /** Timing and failure context. */
  durationMs?: number;
  statusCode?: number;
  errorMessage?: string;

  /** Branch attribution. */
  branchId?: string;
  branchName?: string;

  /** Structured on-screen state. */
  uiState?: UiStateSnapshot;
  /**
   * Storage path of an already-uploaded snapshot image. The image itself is
   * uploaded separately so a large binary never blocks the audit write.
   */
  snapshotPath?: string;

  /** Client-observed event time, used only to order a batch. */
  clientTimestamp?: string;
}

/**
 * A fully materialized audit record as returned to the admin UI.
 */
export interface AuditRecord {
  id: string;
  timestamp: string;

  actorId: string;
  actorName: string;
  actorEmail: string;
  actorRoles: string[];
  isImpersonated: boolean;
  impersonatedBy?: string | null;

  action: string;
  actionCategory: ActionCategory;
  severity: AuditSeverity;
  outcome: AuditOutcome;
  module: string;
  target: string;

  entityType?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;

  details: Record<string, unknown>;
  changedFields: string[];
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  /** Rehydrated per-field breakdown, computed from beforeData/afterData. */
  changes: FieldChange[];

  ip: string;
  location?: string | null;
  os?: string | null;
  browser?: string | null;
  deviceType?: DeviceType | null;
  userAgent?: string | null;
  viewport?: string | null;
  /**
   * The actor's UTC offset in minutes at the time of the action. Stored so the
   * UI can render the timestamp in the actor's own local time — a trail shown
   * only in the reviewer's timezone invites wrong conclusions about whether
   * something happened during working hours.
   */
  tzOffsetMinutes?: number | null;

  route?: string | null;
  referrer?: string | null;
  httpMethod?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;

  sessionId?: string | null;
  requestId?: string | null;
  correlationId?: string | null;

  branchId?: string | null;
  branchName?: string | null;

  uiState?: UiStateSnapshot | null;
  hasSnapshot: boolean;
  snapshotPath?: string | null;

  entryHash?: string | null;
}

/** Query parameters accepted by the admin read route. */
export interface AuditQuery {
  search?: string;
  actors?: string[];
  actions?: string[];
  modules?: string[];
  outcomes?: AuditOutcome[];
  severities?: AuditSeverity[];
  categories?: ActionCategory[];
  from?: string;
  to?: string;
  entityType?: string;
  entityId?: string;
  sessionId?: string;
  changedField?: string;
  hasSnapshot?: boolean;
  sortBy?: 'timestamp' | 'actor' | 'action' | 'module' | 'severity';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/** Aggregate counts returned alongside a page of results. */
export interface AuditFacets {
  total: number;
  byOutcome: Record<string, number>;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  byModule: Record<string, number>;
  uniqueActors: number;
  /** Distinct actor list for populating the actor filter. */
  actors: Array<{ email: string; name: string; count: number }>;
}

/** Full response shape of the admin read route. */
export interface AuditQueryResult {
  records: AuditRecord[];
  facets: AuditFacets;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Caps on client-supplied payload sizes.
 *
 * The ingest route is authenticated but reachable by every logged-in user, which
 * makes it the most exposed write path in the application. Without explicit
 * bounds a caller could push arbitrarily large JSONB into an append-only table
 * that nobody is permitted to delete from.
 */
const MAX_DETAILS_KEYS = 100;
const MAX_CHANGED_FIELDS = 200;
const MAX_STRING = 2000;
const MAX_BATCH = 50;

const boundedString = z.string().max(MAX_STRING);
const jsonRecord = z.record(z.string(), z.unknown()).refine(
  (obj) => Object.keys(obj).length <= MAX_DETAILS_KEYS,
  { message: `Object may not exceed ${MAX_DETAILS_KEYS} keys` }
);

export const uiStateSchema = z.object({
  title: boundedString.optional(),
  heading: boundedString.optional(),
  activeTab: boundedString.optional(),
  visibleRowCount: z.number().int().nonnegative().max(1_000_000).optional(),
  activeFilters: z.record(z.string(), boundedString).optional(),
  formValues: jsonRecord.optional(),
  triggerLabel: boundedString.optional(),
  scrollY: z.number().nonnegative().optional(),
});

export const auditEventInputSchema = z.object({
  action: z.string().min(1).max(200),
  target: z.string().min(1).max(500),
  module: boundedString.optional(),
  outcome: z.enum(['success', 'failure', 'denied']).optional(),
  severity: z.enum(['info', 'notice', 'warning', 'critical']).optional(),

  entityType: boundedString.optional(),
  entityId: boundedString.optional(),
  entityLabel: boundedString.optional(),

  details: jsonRecord.optional(),

  changedFields: z.array(boundedString).max(MAX_CHANGED_FIELDS).optional(),
  beforeData: jsonRecord.optional(),
  afterData: jsonRecord.optional(),

  sessionId: boundedString.optional(),
  correlationId: boundedString.optional(),

  route: boundedString.optional(),
  referrer: boundedString.optional(),
  viewport: z.string().max(32).optional(),
  tzOffsetMinutes: z.number().int().min(-900).max(900).optional(),

  durationMs: z.number().int().nonnegative().max(86_400_000).optional(),
  statusCode: z.number().int().min(100).max(599).optional(),
  errorMessage: boundedString.optional(),

  branchId: boundedString.optional(),
  branchName: boundedString.optional(),

  uiState: uiStateSchema.optional(),
  snapshotPath: boundedString.optional(),

  clientTimestamp: z.string().datetime().optional(),
});

/** The ingest route accepts either a single event or a bounded batch. */
export const auditIngestSchema = z.object({
  events: z.array(auditEventInputSchema).min(1).max(MAX_BATCH),
});

export type AuditIngestPayload = z.infer<typeof auditIngestSchema>;

/**
 * A single event after schema validation.
 *
 * Distinct from {@link AuditEventInput}, which is the interface client call sites
 * program against. This project compiles with `strictNullChecks: false`, under
 * which Zod's inferred output type marks every property optional — `undefined` is
 * assignable to every type, so the required/optional distinction collapses. The
 * server therefore types its handler against the inferred shape rather than the
 * hand-written interface; validity is guaranteed by the schema having already
 * run, not by the type.
 */
export type ValidatedAuditEvent = z.infer<typeof auditEventInputSchema>;
