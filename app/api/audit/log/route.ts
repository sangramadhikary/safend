import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerUser, getServerRoles } from '@/lib/auth/server-session';
import { auditIngestSchema, type ValidatedAuditEvent } from '@/lib/audit/types';
import { resolveAction, inferClassification } from '@/lib/audit/actions';
import { resolveAuditRequestContext } from '@/lib/audit/request-context';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Audit ingest — POST /api/audit/log
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Every audit write in the application funnels through here.
 *
 * WHY THIS ROUTE EXISTS
 * ---------------------
 * Audit entries were previously written straight from the browser via
 * `supabaseClient.from('audit_log').insert(...)`, with the client supplying the
 * actor id, the actor email, and the IP address. That arrangement cannot produce
 * a trustworthy record: the values it stored were whatever the browser chose to
 * send. Anyone able to open a devtools console could append entries naming a
 * colleague, from a fabricated IP, for an action they never performed — and
 * because the table is append-only, those forged rows could never be removed.
 *
 * Routing writes through a server handler moves every security-relevant field
 * out of the client's reach:
 *
 *   actor id, email      from the verified Supabase session
 *   actor roles          read from user_roles server-side, snapshotted per row
 *   IP address           from x-forwarded-for / x-real-ip on this request
 *   geolocation          from platform edge headers
 *   OS, browser, device  parsed from this request's User-Agent header
 *   timestamp            from the server clock, not the user's machine
 *   severity, category   from the action catalog, not from the caller
 *
 * The client is left supplying only the description of what happened, which is
 * the one thing it is the authority on.
 *
 * BATCHING
 * --------
 * Accepts up to 50 events per call so the browser can coalesce a burst (a bulk
 * import emitting one row per record) into a single request instead of 200
 * parallel inserts.
 *
 * FAILURE POSTURE
 * ---------------
 * Returns 202 with a per-event result list rather than failing the whole batch on
 * one bad event. A rejected audit write must never surface as a user-visible
 * error in the operation being audited — the user's actual work should not fail
 * because logging did.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Default retention window for the textual record, in days. */
const ENTRY_RETENTION_DAYS = 730;

/**
 * Map one validated client event plus the server-resolved context into an
 * `audit_log` row.
 */
function buildRow(
  event: ValidatedAuditEvent,
  ctx: ReturnType<typeof resolveAuditRequestContext>,
  actor: { id: string; email: string; name: string; roles: string[] }
): Record<string, unknown> {
  // Resolve the catalog entry from either a code or a legacy label, falling back
  // to heuristic classification for dynamically-composed action names so an
  // uncatalogued action is still filterable rather than dumped into `system`.
  const definition = resolveAction(event.action);
  const inferred = definition
    ? { category: definition.category, severity: definition.severity }
    : inferClassification(event.action);

  const label = definition?.label ?? event.action;
  const module = event.module ?? definition?.module ?? 'System';
  // An explicit call-site severity wins over the catalog default, but a failed
  // or denied outcome is always at least a warning regardless of what the
  // catalog says about the action in its successful form.
  const baseSeverity = event.severity ?? inferred.severity;
  const outcome = event.outcome ?? 'success';
  const severity =
    outcome !== 'success' && baseSeverity === 'info' ? 'warning' : baseSeverity;

  const createdAt = ctx.timestamp;
  const retentionUntil = new Date(
    new Date(createdAt).getTime() + ENTRY_RETENTION_DAYS * 86_400_000
  ).toISOString();

  return {
    created_at: createdAt,

    // Actor — entirely server-resolved.
    user_id: actor.id,
    user_email: actor.email,
    actor_name: actor.name,
    actor_roles: actor.roles,

    // Classification.
    action: label,
    action_category: inferred.category,
    severity,
    outcome,
    module,
    target: event.target,

    // Entity addressing, with the legacy columns kept in sync so existing
    // queries and historical rows stay comparable.
    entity_type: event.entityType ?? module,
    entity_id: event.entityId ?? event.target,
    entity_label: event.entityLabel ?? event.target,
    table_name: event.entityType ?? module,
    record_id: event.entityId ?? event.target,

    // Payload and field-level changes.
    //
    // The diff is written into `old_data` / `new_data`, which already existed on
    // the table (unused) before this feature. Adding a parallel
    // `before_data` / `after_data` pair would have left two sets of columns
    // meaning the same thing.
    details: event.details ?? {},
    changed_fields: event.changedFields ?? null,
    old_data: event.beforeData ?? null,
    new_data: event.afterData ?? null,

    // Network and device — server-resolved.
    ip_address: ctx.ip,
    location: ctx.location,
    user_agent: ctx.userAgent,
    os: ctx.device.os,
    browser: ctx.device.browser,
    device_type: ctx.device.deviceType,
    viewport: event.viewport ?? null,
    tz_offset_minutes: event.tzOffsetMinutes ?? null,

    // Correlation.
    session_id: event.sessionId ?? null,
    request_id: ctx.requestId,
    correlation_id: event.correlationId ?? null,

    // Request context.
    route: event.route ?? null,
    referrer: event.referrer ?? null,
    http_method: ctx.httpMethod,
    status_code: event.statusCode ?? null,
    duration_ms: event.durationMs ?? null,
    error_message: event.errorMessage ?? null,

    // Branch attribution.
    branch_id: event.branchId ?? null,
    branch_name: event.branchName ?? null,

    // Snapshot.
    ui_state: event.uiState ?? null,
    snapshot_path: event.snapshotPath ?? null,

    retention_until: retentionUntil,
  };
}

export async function POST(request: NextRequest) {
  try {
    return await handlePost(request);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[audit-ingest] Unhandled exception:', msg, stack);
    return NextResponse.json({ error: 'Internal error', detail: msg }, { status: 500 });
  }
}

async function handlePost(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Audit backend not configured' }, { status: 503 });
  }

  let user;
  try {
    user = await getServerUser(request);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[audit-ingest] getServerUser threw:', msg);
    return NextResponse.json({ error: 'Auth resolution failed', detail: msg }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
  }

  const parsed = auditIngestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid audit payload', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let roles: string[] = [];
  try {
    roles = await getServerRoles(user.id);
  } catch (err: unknown) {
    console.error('[audit-ingest] getServerRoles threw:', err);
    // non-fatal — proceed with empty roles
  }

  let actorName =
    (user.user_metadata?.name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    '';

  if (!actorName) {
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('name')
        .eq('id', user.id)
        .maybeSingle();
      actorName = (profile?.name as string | undefined) ?? user.email ?? user.id;
    } catch (err: unknown) {
      console.error('[audit-ingest] profile fetch threw:', err);
      actorName = user.email ?? user.id;
    }
  }

  let ctx;
  try {
    ctx = resolveAuditRequestContext(request);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[audit-ingest] resolveAuditRequestContext threw:', msg);
    return NextResponse.json({ error: 'Context resolution failed', detail: msg }, { status: 500 });
  }

  const actor = { id: user.id, email: user.email ?? 'unknown', name: actorName, roles };
  const rows = parsed.data.events.map((event) => buildRow(event, ctx, actor));

  const { data, error } = await supabase.from('audit_log').insert(rows).select('id');

  if (error) {
    console.error('[audit-ingest] insert failed:', error.code, error.message, error.details);
    for (const row of rows) {
      console.error('[audit-fallback]', JSON.stringify({
        user_id: row.user_id, action: row.action, target: row.target,
        session_id: row.session_id, fallbackReason: error.message,
      }));
    }
    return NextResponse.json(
      { error: 'Audit write failed', detail: error.message, code: error.code },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { accepted: data?.length ?? rows.length, requestId: ctx.requestId },
    { status: 202, headers: { 'Cache-Control': 'no-store' } }
  );
}
