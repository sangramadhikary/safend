'use client';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;

  // Fail fast rather than falling back to a placeholder host or empty key.
  // These NEXT_PUBLIC_* values are inlined at build time; an absent or empty
  // value is a misconfiguration and must surface immediately instead of
  // silently producing a client that points at a non-existent project
  // (Requirements 4.2, 4.3).
  //
  // ── Supabase Key Migration (2026) ──────────────────────────────────────────
  // Supabase is deprecating the legacy anon/service_role key model in late 2026.
  // New projects use "publishable" keys (client) and revocable "secret" keys
  // (server). When migrating, replace NEXT_PUBLIC_SUPABASE_ANON_KEY with the
  // publishable key and SUPABASE_SERVICE_ROLE_KEY with a scoped secret key.
  // See: https://supabase.com/blog/supabase-security-2025-retro
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing = [
    url && url.trim() ? null : 'NEXT_PUBLIC_SUPABASE_URL',
    key && key.trim() ? null : 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Set these before building the app; no fallback value is permitted.'
    );
  }

  _client = createClient(url as string, key as string, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });

  return _client;
}

export { getSupabaseClient };

/**
 * Attempts to refresh the session when a JWT expired error is detected.
 * Returns true if refresh succeeded, false if user must re-login.
 */
export async function refreshSessionOnExpiry(): Promise<boolean> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.refreshSession();
    if (error || !data.session) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if an error is a JWT expired error from Supabase/PostgREST.
 */
export function isJwtExpiredError(error: any): boolean {
  if (!error) return false;
  const msg = error.message || error.msg || (typeof error === 'string' ? error : '');
  return msg.includes('JWT expired') || msg.includes('token is expired');
}

// Named export — plain object so module evaluation never triggers getSupabaseClient()
export const supabaseClient = {
  from: (table: string) => getSupabaseClient().from(table),
  channel: (name: string) => getSupabaseClient().channel(name),
  removeChannel: (channel: any) => getSupabaseClient().removeChannel(channel),
  rpc: (fn: string, params?: any) => getSupabaseClient().rpc(fn, params),
  auth: {
    getSession: () => getSupabaseClient().auth.getSession(),
    getUser: () => getSupabaseClient().auth.getUser(),
    signInWithPassword: (c: any) => getSupabaseClient().auth.signInWithPassword(c),
    signUp: (c: any) => getSupabaseClient().auth.signUp(c),
    signOut: (c?: any) => getSupabaseClient().auth.signOut(c),
    onAuthStateChange: (cb: any) => getSupabaseClient().auth.onAuthStateChange(cb),
    resetPasswordForEmail: (e: string, o?: any) => getSupabaseClient().auth.resetPasswordForEmail(e, o),
    updateUser: (a: any) => getSupabaseClient().auth.updateUser(a),
  },
};

// Wrapped API with error handling (used by ProtectedRoute, LoginForm, etc.)
export const supabase = {
  auth: {
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      try {
        const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
        if (error) return { data: { user: null, session: null }, error: { message: error.message } };
        return { data: { user: data.user, session: data.session }, error: null };
      } catch (error: any) {
        return { data: { user: null, session: null }, error: { message: error.message } };
      }
    },
    signUp: async ({ email, password, options }: { email: string; password: string; options?: any }) => {
      try {
        const { data, error } = await getSupabaseClient().auth.signUp({
          email, password, options: { data: options?.data || {} },
        });
        if (error) return { data: { user: null, session: null }, error: { message: error.message } };
        return { data: { user: data.user, session: data.session }, error: null };
      } catch (error: any) {
        return { data: { user: null, session: null }, error: { message: error.message } };
      }
    },
    signOut: async ({ scope }: { scope?: string } = {}) => {
      try {
        const { error } = await getSupabaseClient().auth.signOut({ scope: scope === 'global' ? 'global' : 'local' });
        if (error) return { error: { message: error.message } };
        return { error: null };
      } catch (error: any) {
        return { error: { message: error.message } };
      }
    },
    getSession: async () => {
      try {
        const { data, error } = await getSupabaseClient().auth.getSession();
        if (error) return { data: { session: null }, error: { message: error.message } };
        return { data: { session: data.session }, error: null };
      } catch (error: any) {
        return { data: { session: null }, error: { message: error.message } };
      }
    },
    getUser: async () => {
      try {
        const { data, error } = await getSupabaseClient().auth.getUser();
        if (error) return { data: { user: null }, error: { message: error.message } };
        return { data: { user: data.user }, error: null };
      } catch (error: any) {
        return { data: { user: null }, error: { message: error.message } };
      }
    },
    onAuthStateChange: (callback: (event: string, session: any) => void) => {
      const { data } = getSupabaseClient().auth.onAuthStateChange((event, session) => {
        callback(event, session);
      });
      return { data: { subscription: { unsubscribe: () => data.subscription.unsubscribe() } } };
    },
    resetPasswordForEmail: async (email: string, options?: { redirectTo?: string }) => {
      try {
        const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, options);
        if (error) return { error: { message: error.message } };
        return { error: null };
      } catch (error: any) {
        return { error: { message: error.message } };
      }
    },
    updateUser: async (attributes: { password?: string; email?: string; data?: any }) => {
      try {
        const { data, error } = await getSupabaseClient().auth.updateUser(attributes);
        if (error) return { data: { user: null }, error: { message: error.message } };
        return { data: { user: data.user }, error: null };
      } catch (error: any) {
        return { data: { user: null }, error: { message: error.message } };
      }
    },
  },
  rpc: async (functionName: string, params?: any) => {
    try {
      const { data, error } = await getSupabaseClient().rpc(functionName, params);
      return { data, error: error ? { message: error.message } : null };
    } catch (error: any) {
      return { data: null, error: { message: error.message } };
    }
  },
  from: (table: string) => getSupabaseClient().from(table),
  channel: (name: string) => getSupabaseClient().channel(name),
  removeChannel: (channel: any) => getSupabaseClient().removeChannel(channel),
};
