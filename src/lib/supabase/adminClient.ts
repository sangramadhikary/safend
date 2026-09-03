import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Lazy service-role Supabase client
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS
 *
 * Route handlers used to build their service-role client at module scope:
 *
 *     const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
 *     if (!SUPABASE_URL || !KEY) throw new Error('Missing required env...');
 *     const supabaseAdmin = createClient(SUPABASE_URL, KEY);
 *
 * `next build` imports every route module to collect page data, so that `throw`
 * ran at build time, not request time. The consequence was that the application
 * could only be *built* somewhere that already held production secrets — and the
 * failure was total rather than local: one route missing one variable aborted the
 * entire build with `Failed to collect page data`, taking every unrelated page
 * down with it.
 *
 * Deferring construction to the first request separates the two concerns
 * correctly. A build needs no secrets. A misconfigured deployment fails on the
 * one route that actually needs the missing variable, with a 503 explaining
 * which, while the rest of the application keeps serving.
 *
 * SECURITY
 *
 * This client uses the service-role key and therefore bypasses RLS. It is
 * `server-only` — importing it from client code is a build error — and every
 * caller must perform its own authentication and authorisation check first. It is
 * not a substitute for one.
 */

let cached: SupabaseClient | null = null;

/** Thrown when a service-role client is requested but the environment lacks keys. */
export class MissingSupabaseConfigError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Server misconfigured: missing environment variable(s) ${missing.join(', ')}.`);
    this.name = 'MissingSupabaseConfigError';
    this.missing = missing;
  }
}

/**
 * The service-role client, created on first use and reused thereafter.
 *
 * @throws {MissingSupabaseConfigError} when the required variables are absent.
 *   Call at request time — never at module scope — so the error surfaces as a
 *   response rather than a build failure.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing: string[] = [];
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length > 0) throw new MissingSupabaseConfigError(missing);

  cached = createClient(url!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

/**
 * Lazy stand-in for a module-scope `supabaseAdmin` const.
 *
 * Property access is forwarded to {@link getSupabaseAdmin}, so existing call
 * sites such as `supabaseAdmin.from('users')` keep working verbatim while the
 * client itself is only constructed when a request first touches it. This keeps
 * the conversion of the existing routes mechanical, and therefore reviewable.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseAdmin() as unknown as Record<string | symbol, unknown>;
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
  has(_target, prop) {
    return prop in (getSupabaseAdmin() as unknown as object);
  },
});

/** True when the service-role environment is complete. Never throws. */
export function hasSupabaseAdminConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
