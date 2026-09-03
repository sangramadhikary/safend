import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerUser, getServerRoles } from '@/lib/auth/server-session';
import { decideAccess } from '@/lib/security/access-decision';
import { pathToLabel } from '@/lib/audit/diff';
import type {
  AuditRecord,
  AuditFacets,
  AuditQueryResult,
  AuditOutcome,
  DeviceType,
  UiStateSnapshot,
} from '@/lib/audit/types';
import type { ActionCategory, AuditSeverity } from '@/lib/audit/actions';
import type { FieldChange } from '@/lib/audit/diff';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BFF: Activity & Audit Log read — GET /api/bff/audit-log
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS ROUTE EXISTS
 * ---------------------
 * The audit log was previously read directly from the browser. Three consequences
 * followed, all of which this route fixes:
 *
 *   1. NO ACCESS CONTROL. `audit_log` had no RLS policy in version control, so
 *      the read was gated by whatever happened to be configured in the live
 *      database. Any authenticated user could fetch the full trail — including
 *      every colleague's IP address, location, and activity history.
 *
 *   2. FILTERING AND COUNTING WERE WRONG. The client fetched a hard-capped 500
 *      rows and then filtered, searched, paginated and computed summary
 *      statistics over that slice. Once the table held more than 500 matching
 *      rows, the search box was silently searching a truncated window and the
 *      "Total Activities" card read 500 no matter the real figure.
 *
 *   3. FILTERS COULD NOT COMBINE. Selecting both a date range and a module ran
 *      the date query server-side and then re-filtered by module in JavaScript,
 *      compounding the truncation.
 *
 * Every filter, the sort, the pagination, and the aggregate counts are now
 * evaluated in Postgres against the whole table.
 *
 * CLIENT IDENTITY
 * ---------------
 * Queries run through a client bound to the CALLER's access token rather than the
 * service role, even though the route has already checked the caller's roles
 * itself. That makes the RLS policy a second, independent gate: a bug in this
 * handler's role check cannot leak audit data, because the database would still
 * refuse the rows. It is also required for the facet RPC, which re-asserts
 * `is_admin_or_branch_admin(auth.uid())` internally.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const ADMIN_ALLOWED_ROLES = ['admin', 'branch_admin'];

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

/** Columns selected for the list view. */
const SELECT_COLUMNS = `
  id, created_at, user_id, user_email, actor_name, actor_roles,
  action, action_category, severity, outcome, module, target,
  entity_type, entity_id, entity_label,
  details, changed_fields, old_data, new_data,
  ip_address, location, user_agent, os, browser, device_type, viewport,
  tz_offset_minutes,
  route, referrer, http_method, status_code, duration_ms, error_message,
  session_id, request_id, correlation_id,
  branch_id, branch_name,
  ui_state, snapshot_path, entry_hash,
  is_impersonated, impersonated_by
`;

/** Map the UI's sort keys onto real columns. */
const SORT_COLUMNS: Record<string, string> = {
  timestamp: 'created_at',
  actor: 'actor_name',
  action: 'action',
  module: 'module',
  severity: 'severity',
};

/**
 * Strip characters that carry meaning in PostgREST's filter grammar.
 *
 * A search term is interpolated into an `or=(...)` expression, where commas
 * separate conditions and parentheses group them. Leaving them in would let a
 * search string alter the filter's structure rather than just its operand.
 */
function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()*\\"']/g, ' ').trim().slice(0, 120);
}

/** Read a repeatable/comma-separated query param into a string array. */
function readList(params: URLSearchParams, key: string): string[] | null {
  const all = params.getAll(key).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
  return all.length > 0 ? [...new Set(all)] : null;
}

/** Validate a list against an allowlist, dropping unknown values. */
function readEnumList<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[]
): T[] | null {
  const list = readList(params, key);
  if (!list) return null;
  const allowedSet = new Set<string>(allowed);
  const filtered = list.filter((v): v is T => allowedSet.has(v));
  return filtered.length > 0 ? filtered : null;
}

/** Parse an ISO date param, ignoring unparseable values. */
function readDate(params: URLSearchParams, key: string): string | null {
  const raw = params.get(key);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Rebuild the per-field change list from the stored before/after maps.
 *
 * Both are stored keyed by dotted field path, so the breakdown the UI renders can
 * be reconstructed without persisting a third, redundant representation of the
 * same information.
 */
function rehydrateChanges(
  changedFields: string[] | null,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): FieldChange[] {
  if (!changedFields || changedFields.length === 0) return [];

  return changedFields.map((path) => {
    const b = before?.[path];
    const a = after?.[path];
    const bMissing = b === null || b === undefined;
    const aMissing = a === null || a === undefined;

    return {
      path,
      label: pathToLabel(path),
      before: b ?? null,
      after: a ?? null,
      kind: bMissing && !aMissing ? 'added' : !bMissing && aMissing ? 'removed' : 'modified',
    };
  });
}

/** Map a database row to the API's record shape. */
function mapRow(row: Record<string, any>): AuditRecord {
  const changedFields: string[] = Array.isArray(row.changed_fields) ? row.changed_fields : [];
  // The diff lives in the table's pre-existing old_data/new_data columns; the API
  // exposes it as beforeData/afterData, which is how the UI and exporters read it.
  const beforeData = (row.old_data ?? null) as Record<string, unknown> | null;
  const afterData = (row.new_data ?? null) as Record<string, unknown> | null;

  return {
    id: row.id,
    timestamp: row.created_at,

    actorId: row.user_id ?? '',
    // Fall back through the available identifiers so the column never renders a
    // bare UUID, which the old UI did whenever the name lookup missed.
    actorName: row.actor_name || row.user_email || row.user_id || 'Unknown',
    actorEmail: row.user_email ?? '',
    actorRoles: Array.isArray(row.actor_roles) ? row.actor_roles : [],
    isImpersonated: Boolean(row.is_impersonated),
    impersonatedBy: row.impersonated_by ?? null,

    action: row.action ?? '',
    actionCategory: (row.action_category ?? 'system') as ActionCategory,
    severity: (row.severity ?? 'info') as AuditSeverity,
    outcome: (row.outcome ?? 'success') as AuditOutcome,
    module: row.module ?? row.table_name ?? '',
    target: row.target ?? row.record_id ?? '',

    entityType: row.entity_type ?? null,
    entityId: row.entity_id ?? null,
    entityLabel: row.entity_label ?? null,

    details: (row.details ?? {}) as Record<string, unknown>,
    changedFields,
    beforeData,
    afterData,
    changes: rehydrateChanges(changedFields, beforeData, afterData),

    ip: row.ip_address ?? '',
    location: row.location ?? null,
    os: row.os ?? null,
    browser: row.browser ?? null,
    deviceType: (row.device_type ?? null) as DeviceType | null,
    userAgent: row.user_agent ?? null,
    viewport: row.viewport ?? null,
    tzOffsetMinutes: row.tz_offset_minutes ?? null,

    route: row.route ?? null,
    referrer: row.referrer ?? null,
    httpMethod: row.http_method ?? null,
    statusCode: row.status_code ?? null,
    durationMs: row.duration_ms ?? null,
    errorMessage: row.error_message ?? null,

    sessionId: row.session_id ?? null,
    requestId: row.request_id ?? null,
    correlationId: row.correlation_id ?? null,

    branchId: row.branch_id ?? null,
    branchName: row.branch_name ?? null,

    uiState: (row.ui_state ?? null) as UiStateSnapshot | null,
    hasSnapshot: Boolean(row.snapshot_path),
    snapshotPath: row.snapshot_path ?? null,

    entryHash: row.entry_hash ?? null,
  };
}

/** Build a Supabase client bound to the caller's own access token. */
function callerScopedClient(request: NextRequest): SupabaseClient {
  const authHeader = request.headers.get('authorization') ?? '';
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        ...(authHeader ? { Authorization: authHeader } : {}),
        Cookie: request.headers.get('cookie') ?? '',
      },
    },
  });
}

export async function GET(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'Audit backend not configured' }, { status: 503 });
  }

  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roles = await getServerRoles(user.id);
  const decision = decideAccess({
    sessionConfirmed: true,
    resolvedRoles: roles,
    routeAllowedRoles: ADMIN_ALLOWED_ROLES,
  });
  if (decision !== 'allow') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;

  const search = sanitizeSearch(params.get('search') ?? '');
  const actors = readList(params, 'actors');
  const actions = readList(params, 'actions');
  const modules = readList(params, 'modules');
  const outcomes = readEnumList(params, 'outcomes', ['success', 'failure', 'denied'] as const);
  const severities = readEnumList(params, 'severities', ['info', 'notice', 'warning', 'critical'] as const);
  const categories = readEnumList(params, 'categories', [
    'auth', 'read', 'create', 'update', 'delete', 'export', 'permission', 'system',
  ] as const);
  const from = readDate(params, 'from');
  const to = readDate(params, 'to');
  const entityType = params.get('entityType') || null;
  const entityId = params.get('entityId') || null;
  const sessionId = params.get('sessionId') || null;
  const changedField = params.get('changedField') || null;
  const hasSnapshotRaw = params.get('hasSnapshot');
  const hasSnapshot = hasSnapshotRaw === null ? null : hasSnapshotRaw === 'true';

  const sortBy = SORT_COLUMNS[params.get('sortBy') ?? 'timestamp'] ?? 'created_at';
  const sortDir = params.get('sortDir') === 'asc' ? 'asc' : 'desc';

  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(params.get('pageSize') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );

  const supabase = callerScopedClient(request);

  // ── Records query ─────────────────────────────────────────────────────────
  let query = supabase.from('audit_log').select(SELECT_COLUMNS, { count: 'exact' });

  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);
  if (actors) query = query.in('user_email', actors);
  if (actions) query = query.in('action', actions);
  if (modules) query = query.in('module', modules);
  if (outcomes) query = query.in('outcome', outcomes);
  if (severities) query = query.in('severity', severities);
  if (categories) query = query.in('action_category', categories);
  if (entityType) query = query.eq('entity_type', entityType);
  if (entityId) query = query.eq('entity_id', entityId);
  if (sessionId) query = query.eq('session_id', sessionId);
  // Array containment: rows whose changed_fields include this path.
  if (changedField) query = query.contains('changed_fields', [changedField]);
  if (hasSnapshot === true) query = query.not('snapshot_path', 'is', null);
  if (hasSnapshot === false) query = query.is('snapshot_path', null);

  if (search) {
    query = query.or(
      [
        `actor_name.ilike.%${search}%`,
        `user_email.ilike.%${search}%`,
        `action.ilike.%${search}%`,
        `target.ilike.%${search}%`,
        `module.ilike.%${search}%`,
        `entity_label.ilike.%${search}%`,
        `ip_address.ilike.%${search}%`,
        `location.ilike.%${search}%`,
      ].join(',')
    );
  }

  const offset = (page - 1) * pageSize;
  query = query
    .order(sortBy, { ascending: sortDir === 'asc' })
    // Secondary sort keeps pagination stable when the primary key ties, which it
    // frequently does on severity or module. Without it, rows can repeat or
    // vanish between pages.
    .order('id', { ascending: false })
    .range(offset, offset + pageSize - 1);

  // ── Facets, in parallel ───────────────────────────────────────────────────
  const facetsPromise = supabase.rpc('audit_log_facets', {
    p_search: search || null,
    p_actors: actors,
    p_actions: actions,
    p_modules: modules,
    p_outcomes: outcomes,
    p_severities: severities,
    p_categories: categories,
    p_from: from,
    p_to: to,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_session_id: sessionId,
    p_changed_field: changedField,
    p_has_snapshot: hasSnapshot,
  });

  const [{ data, error, count }, { data: facetData, error: facetError }] = await Promise.all([
    query,
    facetsPromise,
  ]);

  if (error) {
    console.error('[audit-read] records query failed:', error.message);
    return NextResponse.json({ error: 'Failed to load audit log' }, { status: 500 });
  }

  const records = (data ?? []).map(mapRow);
  const total = count ?? records.length;

  // Degrade to counts derivable from the page rather than failing the request:
  // the operator would rather see the log with approximate summary cards than an
  // error screen because an aggregate could not be computed.
  if (facetError) {
    console.error('[audit-read] facet RPC failed:', facetError.message);
  }

  const facets: AuditFacets = facetData
    ? {
        total: Number(facetData.total ?? total),
        byOutcome: facetData.byOutcome ?? {},
        bySeverity: facetData.bySeverity ?? {},
        byCategory: facetData.byCategory ?? {},
        byModule: facetData.byModule ?? {},
        uniqueActors: Number(facetData.uniqueActors ?? 0),
        actors: Array.isArray(facetData.actors) ? facetData.actors : [],
      }
    : {
        total,
        byOutcome: {},
        bySeverity: {},
        byCategory: {},
        byModule: {},
        uniqueActors: new Set(records.map((r) => r.actorEmail)).size,
        actors: [],
      };

  const result: AuditQueryResult = {
    records,
    facets,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };

  return NextResponse.json(result, {
    headers: {
      // Short private cache: the log is append-only so a few seconds of staleness
      // is harmless, and it absorbs the repeated fetches that filter toggling
      // produces. Never shared, because the payload is admin-only.
      'Cache-Control': 'private, max-age=10',
    },
  });
}
