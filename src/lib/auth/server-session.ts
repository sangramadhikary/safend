/**
 * Server-side session resolver (Req 5.2, 7.2, 9.1).
 *
 * Centralizes the "who is calling, and what may they do" question for API route
 * handlers so that authorization is always derived from a *server-verified*
 * Supabase session and *server-resolved* roles — never from client-supplied
 * role data in the request body, headers, or query (Req 7.4).
 *
 *  - {@link getServerUser} resolves the caller's verified Supabase user from the
 *    `Authorization: Bearer <token>` header or the session cookie, returning
 *    `null` when neither yields a confirmed user (Req 5.2, 9.1).
 *  - {@link getServerRoles} loads the caller's ERP roles from the `user_roles`
 *    table via the service-role client, bypassing RLS to authoritatively read
 *    the role set (Req 7.2).
 *  - {@link hasStaffRole} is re-exported from the pure access-decision module so
 *    callers can gate destructive operations from a single import (Req 7.6).
 *
 * The browser client persists its session in `localStorage` rather than
 * cookies, so the access token is normally sent explicitly via the bearer
 * header; the cookie path is retained for any cookie-based callers.
 */

import { createClient, type User } from '@supabase/supabase-js';

// Re-export the pure staff-role predicate so route handlers can import the
// session resolver and the role gate from one place (Req 7.6).
export { hasStaffRole } from '../security/access-decision';

/** The verified Supabase user as returned by the auth server. */
export type AuthUser = User;

/**
 * Resolve the caller's verified Supabase user, or `null`.
 *
 * Prefers the `Authorization: Bearer <token>` header (the browser stores its
 * session in localStorage, not cookies), falling back to cookie-based session
 * resolution. The token/cookie is validated against the Supabase auth server —
 * a present-but-invalid credential yields `null`, never a partially-trusted
 * user (Req 5.2, 9.1).
 */
export async function getServerUser(request: Request): Promise<AuthUser | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Cookie: request.headers.get('cookie') ?? '' } },
  });

  // Prefer the bearer token from the Authorization header.
  const authHeader = request.headers.get('authorization') ?? '';
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (bearerToken) {
    const { data: { user } } = await client.auth.getUser(bearerToken);
    if (user) return user;
  }

  // Fall back to cookie-based session resolution.
  const { data: { user } } = await client.auth.getUser();
  return user ?? null;
}

/**
 * Load the caller's server-verified ERP roles from the `user_roles` table.
 *
 * Uses the service-role client to bypass RLS and read the authoritative role
 * set for `userId` (Req 7.2). Returns an empty array when the service-role
 * client is unconfigured, the lookup errors, or the user has no role rows
 * (e.g. portal users) — callers must treat an empty set as "no privileges",
 * never as a default role (Req 5.8).
 */
export async function getServerRoles(userId: string): Promise<string[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return [];

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: roles, error } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  if (error || !roles) return [];
  return roles
    .map((r: { role: unknown }) => r.role)
    .filter((role): role is string => typeof role === 'string');
}
