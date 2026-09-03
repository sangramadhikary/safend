/**
 * Server-side helpers for the Accounts API routes (Phase 3.3 hardening).
 *
 * Money-touching operations (asset creation/disposal, depreciation runs,
 * liability payments, interest posting) must not rely solely on browser-side
 * Supabase calls guarded by RLS. These helpers centralize:
 *
 *  - a service-role admin client for authoritative writes,
 *  - a role-gated authorization check derived from the server-verified session
 *    (never from the request body), and
 *  - a best-effort audit-trail writer.
 *
 * Only ERP finance staff may mutate the ledger.
 */

import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerUser, getServerRoles } from '@/lib/auth/server-session';
import { decideAccess } from '@/lib/security/access-decision';

/** Roles permitted to mutate the Accounts ledger (assets & liabilities). */
export const ACCOUNTS_ALLOWED_ROLES = ['admin', 'branch_admin', 'accounts'];

/**
 * Returns a service-role Supabase client for authoritative writes, or null if
 * the environment is not configured (callers should surface a 500).
 */
export function getAccountsAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface AccountsAuthOk {
  ok: true;
  userId: string;
  userName: string;
  roles: string[];
  admin: SupabaseClient;
}
export interface AccountsAuthErr {
  ok: false;
  response: NextResponse;
}

/**
 * Guard an Accounts API route: confirms a server-verified session, resolves the
 * caller's roles server-side, and checks them against the accounts allowlist.
 * Returns either an authorized context (with the admin client) or a ready-to-
 * return error response (401/403/500).
 */
export async function requireAccountsAccess(request: Request): Promise<AccountsAuthOk | AccountsAuthErr> {
  const user = await getServerUser(request);
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorised. You must be signed in.' }, { status: 401 }) };
  }
  const roles = await getServerRoles(user.id);
  const decision = decideAccess({
    sessionConfirmed: true,
    resolvedRoles: roles,
    routeAllowedRoles: ACCOUNTS_ALLOWED_ROLES,
  });
  if (decision !== 'allow') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden. Accounts role required.' }, { status: 403 }) };
  }
  const admin = getAccountsAdmin();
  if (!admin) {
    return { ok: false, response: NextResponse.json({ error: 'Server not configured for accounts operations.' }, { status: 500 }) };
  }
  const userName = (user.user_metadata?.name as string) || user.email || user.id;
  return { ok: true, userId: user.id, userName, roles, admin };
}

export interface AuditEntry {
  action: string;              // e.g. 'asset.create', 'depreciation.run', 'liability.payment'
  entity: string;              // e.g. 'fixed_assets', 'liabilities'
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Best-effort audit writer. Records who did what to the ledger. If the
 * `accounts_audit_log` table has not been provisioned, the failure is swallowed
 * so the primary operation still succeeds (mirrors the codebase's tolerance for
 * not-yet-created tables).
 */
export async function writeAudit(
  admin: SupabaseClient,
  actor: { userId: string; userName: string },
  entry: AuditEntry,
): Promise<void> {
  try {
    await admin.from('accounts_audit_log').insert({
      actor_id: actor.userId,
      actor_name: actor.userName,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      before_data: entry.before ?? null,
      after_data: entry.after ?? null,
      created_at: new Date().toISOString(),
    });
  } catch {
    /* audit table may not exist yet — never block the primary operation */
  }
}
