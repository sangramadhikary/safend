'use client';

import { getSupabaseClient } from '@/integrations/supabase/client';

/**
 * Browser-side client for the /api/traccar proxy routes.
 *
 * The proxy routes authorise every call against a server-verified Supabase
 * session, and the browser keeps its session in localStorage rather than a
 * cookie, so the access token has to be attached explicitly as a bearer header
 * (the same approach `src/lib/bff.ts` uses for the BFF endpoints).
 *
 * Query values are serialised with URLSearchParams, which also keeps the `+` in
 * an IST offset percent-encoded. Sent raw it would arrive decoded as a space and
 * Traccar rejects the timestamp.
 */

export type QueryValue = string | number | boolean | undefined | null;
export type QueryParams = Record<string, QueryValue | QueryValue[]>;

async function authHeaders(): Promise<Record<string, string>> {
  const client = getSupabaseClient();
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Build a query string, repeating keys for array values (e.g. deviceId). */
export function buildQuery(params?: QueryParams): string {
  if (!params) return '';
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item === undefined || item === null || item === '') continue;
      search.append(key, String(item));
    }
  }

  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** Error carrying the HTTP status so callers can distinguish auth failures. */
export class TraccarApiError extends Error {
  readonly status: number;
  readonly details?: string;

  constructor(message: string, status: number, details?: string) {
    super(message);
    this.name = 'TraccarApiError';
    this.status = status;
    this.details = details;
  }
}

async function toError(response: Response): Promise<TraccarApiError> {
  const body = await response.json().catch(() => null);

  if (response.status === 401) {
    return new TraccarApiError('Your session has expired — sign in again', 401, body?.details);
  }
  if (response.status === 403) {
    return new TraccarApiError('You do not have permission to view GPS tracking', 403, body?.details);
  }
  if (response.status === 503) {
    return new TraccarApiError(
      body?.error || 'GPS server is not configured',
      503,
      body?.details
    );
  }

  return new TraccarApiError(
    body?.error || `Request failed (HTTP ${response.status})`,
    response.status,
    body?.details
  );
}

/** GET a Traccar proxy route. */
export async function traccarFetch<T>(path: string, params?: QueryParams): Promise<T> {
  const response = await fetch(`${path}${buildQuery(params)}`, {
    headers: await authHeaders(),
  });

  if (!response.ok) throw await toError(response);
  return response.json() as Promise<T>;
}

/** Send a mutating request to a Traccar proxy route. */
export async function traccarMutate<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  options?: { body?: unknown; params?: QueryParams }
): Promise<T> {
  const headers = await authHeaders();
  const response = await fetch(`${path}${buildQuery(options?.params)}`, {
    method,
    headers: options?.body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
    ...(options?.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  if (!response.ok) throw await toError(response);
  return response.json() as Promise<T>;
}
