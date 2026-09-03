import 'server-only';

import type { NextRequest } from 'next/server';
import { getSupabaseServiceClient } from './server';

/**
 * Request authentication for route handlers.
 *
 * The project depends only on @supabase/supabase-js (no @supabase/ssr), so there
 * is no cookie-based session helper available server-side. Callers therefore send
 * the Supabase access token as a Bearer header and it is verified here against
 * the auth server — validated, not trusted.
 *
 * Two actor kinds exist in this system:
 *   staff   — a row in `users`, carrying a `roles` text[] (note: plural, and an
 *             array — not a scalar `role` column)
 *   client  — a row in `client_users`, scoped to one client_name and keyed to the
 *             auth user by `auth_user_id` (not by its own `id`)
 *
 * Both of those column details bit an earlier version of this file: it selected
 * `role` and matched client_users on `id`, so every lookup silently returned
 * nothing and legitimate users were rejected with 401.
 */

/**
 * Known staff roles. Membership is checked so an unrecognised role fails closed,
 * but note this deliberately does NOT narrow invoice access to accounts/admin:
 * which staff may view an invoice is governed by the UI, and tightening it here
 * would break working flows. The forgery vector is closed by refusing
 * caller-supplied figures, not by role gating.
 */
export const KNOWN_STAFF_ROLES = new Set([
  'admin',
  'superadmin',
  'director',
  'accounts',
  'accountant',
  'hr',
  'office-admin',
  'operations',
  'sales',
]);

export type Actor =
  | { kind: 'staff'; userId: string; email: string | null; roles: string[] }
  | { kind: 'client'; userId: string; email: string | null; clientName: string };

export function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/** Normalises `users.roles` (text[]) — tolerating a scalar `role` if present. */
function normaliseRoles(row: { roles?: unknown; role?: unknown } | null): string[] {
  if (!row) return [];
  const raw = Array.isArray(row.roles) ? row.roles : row.role ? [row.role] : [];
  return raw
    .map((r) => String(r ?? '').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Verifies the caller's token and resolves who they are.
 * Returns null when the token is missing, invalid, or maps to no active actor.
 */
export async function authenticateActor(req: NextRequest): Promise<Actor | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const admin = getSupabaseServiceClient();

  const { data: userData, error } = await admin.auth.getUser(token);
  const authUser = userData?.user;
  if (error || !authUser) return null;

  // Staff first — a staff row wins over a client row for the same identity.
  // public.users.id is the auth uid (verified: all rows join on it).
  const { data: staff } = await admin
    .from('users')
    .select('id, email, roles, status')
    .eq('id', authUser.id)
    .maybeSingle();

  if (staff) {
    const roles = normaliseRoles(staff as any);
    const isActive = !staff.status || String(staff.status).toLowerCase() === 'active';
    if (roles.length > 0 && isActive) {
      return {
        kind: 'staff',
        userId: authUser.id,
        email: (staff as any).email ?? authUser.email ?? null,
        roles,
      };
    }
  }

  // Client-portal user. Keyed by auth_user_id, falling back to email since some
  // provisioning flows create the row before the auth user is linked.
  type ClientRow = { id: string; client_name: string; status: string | null };
  let clientRow: ClientRow | null = null;

  const byAuthId = await admin
    .from('client_users')
    .select('id, client_name, status')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();
  clientRow = (byAuthId.data as ClientRow) ?? null;

  if (!clientRow && authUser.email) {
    const byEmail = await admin
      .from('client_users')
      .select('id, client_name, status')
      .eq('email', authUser.email)
      .maybeSingle();
    clientRow = (byEmail.data as ClientRow) ?? null;
  }

  if (clientRow?.client_name) {
    const isActive = !clientRow.status || String(clientRow.status).toLowerCase() === 'active';
    if (isActive) {
      return {
        kind: 'client',
        userId: authUser.id,
        email: authUser.email ?? null,
        clientName: clientRow.client_name,
      };
    }
  }

  return null;
}

/** True when the actor is staff holding at least one recognised role. */
export function isInvoiceStaff(actor: Actor): boolean {
  return actor.kind === 'staff' && actor.roles.some((r) => KNOWN_STAFF_ROLES.has(r));
}

/**
 * Authorises an actor against a specific invoice.
 *
 * Staff may read any. A client-portal user may read only their own client's
 * invoices — matched on the same `client_name` the portal itself filters by,
 * compared case-insensitively and trimmed.
 */
export function canReadInvoice(actor: Actor, invoiceClientName: string | null): boolean {
  if (isInvoiceStaff(actor)) return true;
  if (actor.kind !== 'client') return false;
  const a = (actor.clientName || '').trim().toLowerCase();
  const b = (invoiceClientName || '').trim().toLowerCase();
  return !!a && a === b;
}
