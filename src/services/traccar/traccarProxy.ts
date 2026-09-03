import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { getServerUser, getServerRoles } from '@/lib/auth/server-session';
import { decideAccess, ERP_STAFF_ROLES } from '@/lib/security/access-decision';
import { TRACCAR_URL, TRACCAR_AUTH, traccarJsonHeaders } from './traccarConfig';
import { normalizeTraccarTimestamp } from './traccarTime';

/**
 * Shared server plumbing for the Traccar proxy routes.
 *
 * Every route under /api/traccar reaches an external GPS server holding staff
 * location history, so all of them go through {@link requireTraccarAccess}
 * before any upstream call is made. Reads are open to ERP staff; mutations that
 * change tracking configuration are restricted further.
 */

/** Roles allowed to read tracking data. */
const READ_ROLES: readonly string[] = ERP_STAFF_ROLES;

/** Roles allowed to change devices, attributes and geofences. */
const WRITE_ROLES: readonly string[] = ['admin', 'branch_admin', 'office-admin', 'operations'];

export type TraccarAccessLevel = 'read' | 'write';

/**
 * Authorise the caller against a server-verified session.
 *
 * Returns `null` when the request may proceed, or the response to send back.
 * Mirrors the guard shape used by the BFF routes: 401 without a session, 403
 * when the resolved roles do not permit the operation.
 */
export async function requireTraccarAccess(
  request: NextRequest,
  level: TraccarAccessLevel = 'read'
): Promise<NextResponse | null> {
  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roles = await getServerRoles(user.id);
  const decision = decideAccess({
    sessionConfirmed: true,
    resolvedRoles: roles,
    routeAllowedRoles: level === 'write' ? WRITE_ROLES : READ_ROLES,
  });

  if (decision !== 'allow') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}

/** Guard against an unconfigured server so callers get a clear message. */
function assertConfigured(): NextResponse | null {
  if (!TRACCAR_AUTH) {
    return NextResponse.json(
      { error: 'Traccar is not configured', details: 'TRACCAR_AUTH is empty on the server' },
      { status: 503 }
    );
  }
  return null;
}

/** Successful upstream call. */
export interface TraccarSuccess<T> {
  ok: true;
  data: T;
}

/** Failed upstream call, carrying the status to pass back to the browser. */
export interface TraccarFailure {
  ok: false;
  status: number;
  details: string;
}

export type TraccarResult<T> = TraccarSuccess<T> | TraccarFailure;

/**
 * Narrow a result to the failure case.
 *
 * An explicit type predicate rather than `if (!result.ok)`: this project builds
 * with `strictNullChecks: false`, where boolean literal discriminants do not
 * narrow a union on their own.
 */
export function traccarFailed<T>(result: TraccarResult<T>): result is TraccarFailure {
  return result.ok === false;
}

/** Perform a GET against the Traccar API and hand back the parsed body. */
export async function traccarGet<T = unknown>(
  path: string,
  params?: Record<string, string | number | undefined | null>
): Promise<TraccarResult<T>> {
  const url = new URL(`${TRACCAR_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), { headers: traccarJsonHeaders() });
  if (!response.ok) {
    const details = await response.text().catch(() => 'Unknown error');
    return { ok: false, status: response.status, details };
  }
  return { ok: true, data: (await response.json()) as T };
}

/** Perform a mutating request against the Traccar API. */
export async function traccarSend(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<TraccarResult<unknown>> {
  const response = await fetch(`${TRACCAR_URL}${path}`, {
    method,
    headers: {
      ...traccarJsonHeaders(),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => 'Unknown error');
    return { ok: false, status: response.status, details };
  }

  // DELETE replies with 204 and an empty body.
  if (response.status === 204) return { ok: true, data: { success: true } };
  const text = await response.text();
  if (!text) return { ok: true, data: { success: true } };
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: true, data: { success: true } };
  }
}

/** Report endpoints exposed through the proxy. */
export const TRACCAR_REPORTS = {
  route: '/api/reports/route',
  summary: '/api/reports/summary',
  trips: '/api/reports/trips',
  stops: '/api/reports/stops',
  events: '/api/reports/events',
} as const;

export type TraccarReport = keyof typeof TRACCAR_REPORTS;

/** Upper bound on devices per report request, to keep upstream load sane. */
const MAX_DEVICES_PER_REQUEST = 50;

/**
 * Proxy a Traccar report request.
 *
 * Accepts `deviceId` (repeatable), `groupId` (repeatable), `from`, `to`, plus
 * `daily` for summary and `type` for events. Timestamps are repaired before
 * forwarding: a `+05:30` offset that arrived percent-decoded as a space is
 * invalid ISO-8601 and Traccar rejects it with a Jersey 404.
 */
export async function proxyTraccarReport(
  request: NextRequest,
  report: TraccarReport
): Promise<NextResponse> {
  const unconfigured = assertConfigured();
  if (unconfigured) return unconfigured;

  const denied = await requireTraccarAccess(request, 'read');
  if (denied) return denied;

  const incoming = request.nextUrl.searchParams;
  const deviceIds = incoming.getAll('deviceId').filter(Boolean);
  const groupIds = incoming.getAll('groupId').filter(Boolean);
  const from = incoming.get('from');
  const to = incoming.get('to');

  if (!from || !to) {
    return NextResponse.json({ error: 'Missing required params: from, to' }, { status: 400 });
  }
  if (deviceIds.length === 0 && groupIds.length === 0) {
    return NextResponse.json(
      { error: 'Missing required param: at least one deviceId or groupId' },
      { status: 400 }
    );
  }
  if (deviceIds.length > MAX_DEVICES_PER_REQUEST) {
    return NextResponse.json(
      { error: `Too many devices requested (max ${MAX_DEVICES_PER_REQUEST})` },
      { status: 400 }
    );
  }

  const url = new URL(`${TRACCAR_URL}${TRACCAR_REPORTS[report]}`);
  deviceIds.forEach((id) => url.searchParams.append('deviceId', id));
  groupIds.forEach((id) => url.searchParams.append('groupId', id));
  url.searchParams.set('from', normalizeTraccarTimestamp(from));
  url.searchParams.set('to', normalizeTraccarTimestamp(to));

  if (report === 'summary' && incoming.get('daily') === 'true') {
    url.searchParams.set('daily', 'true');
  }
  if (report === 'events') {
    const types = incoming.getAll('type').filter(Boolean);
    types.forEach((type) => url.searchParams.append('type', type));
  }

  try {
    const response = await fetch(url.toString(), { headers: traccarJsonHeaders() });

    if (!response.ok) {
      const details = await response.text().catch(() => 'Unknown error');
      return NextResponse.json(
        { error: `Traccar API error: ${response.status}`, details: details.slice(0, 500) },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' },
    });
  } catch (error: any) {
    console.error(`[Traccar ${report} report] Error:`, error?.message || error);
    return NextResponse.json(
      { error: `Failed to fetch ${report} from Traccar`, details: error?.message },
      { status: 500 }
    );
  }
}

/** Shared error response for a failed upstream call. */
export function traccarErrorResponse(result: TraccarFailure, fallback: string): NextResponse {
  return NextResponse.json(
    { error: fallback, details: result.details.slice(0, 500) },
    { status: result.status }
  );
}
