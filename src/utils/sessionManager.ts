/**
 * Session management utilities for multi-device enforcement.
 *
 * Device caps are per-role (see `getMaxSessions`): 1 for supervisor / client,
 * 2 for ERP users.
 *
 * Lifecycle:
 * - `claimSession()` at login — generates a token, calls the `claim_session`
 *   RPC (which evicts the least-recently-active row if the cap is reached),
 *   then stores the token + userId for SessionGuard.
 * - `releaseSession()` at logout — deletes this device's row so the slot is
 *   freed. Must run before `supabase.auth.signOut()`.
 * - `pruneStaleSessions()` — reclaims slots held by rows whose heartbeat
 *   stopped (closed tab, crashed browser, sleeping machine).
 *
 * A session row IS the device slot: deleting a row is what signs that device
 * out, which SessionGuard observes via realtime plus a 30s poll.
 */

import { supabaseClient } from '@/integrations/supabase/client';
import { setSessionCookie } from '@/lib/auth/session-cookie';

/** Maximum allowed concurrent sessions per user. */
export const MAX_SESSIONS = 2;

/**
 * Get the session limit based on user role.
 * Supervisors and clients: 1 device (security-critical)
 * Admin/ERP users: 2 devices
 */
export function getMaxSessions(role?: string | null): number {
  switch (role) {
    case 'supervisor':
    case 'employee_portal': // backward compat for existing users
    case 'client':
      return 1;
    default:
      return 2;
  }
}

/**
 * Generate a cryptographically random session token.
 */
function generateSessionToken(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Drops the user's ghost session rows (closed tabs, crashed browsers, sleeping
 * machines) so they don't occupy a device slot. Safe to call before counting.
 */
export async function pruneStaleSessions(userId: string): Promise<number> {
  try {
    const { data, error } = await supabaseClient.rpc('prune_stale_sessions', {
      p_user_id: userId,
    });
    if (error) throw error;
    return typeof data === 'number' ? data : 0;
  } catch {
    // Migration may not be applied yet — non-critical.
    return 0;
  }
}

/**
 * Releases this device's session row and clears local session state.
 *
 * MUST run before `supabase.auth.signOut()`: the delete is authorized by the
 * caller's JWT, so signing out first makes it fail silently and leaves a ghost
 * row that permanently consumes one of the user's device slots.
 */
export async function releaseSession(): Promise<boolean> {
  let released = false;

  try {
    const userId = localStorage.getItem('userId');
    const token = localStorage.getItem('session_token');

    if (userId && token) {
      try {
        const { data, error } = await supabaseClient.rpc('release_session', {
          p_user_id: userId,
          p_session_token: token,
        });
        if (error) throw error;
        released = data === true;
      } catch {
        // Fallback for environments without the RPC — relies on RLS.
        try {
          await supabaseClient
            .from('user_sessions')
            .delete()
            .eq('user_id', userId)
            .eq('session_token', token);
          released = true;
        } catch { /* give up — the stale-session TTL will reclaim the slot */ }
      }
    }
  } catch { /* localStorage unavailable — nothing to release */ }

  clearSessionData();
  return released;
}

/**
 * Claims a session for the user. Must be called after successful login.
 * If the user is already at their device limit, the least-recently-active
 * session is evicted (which is what signs the other device out).
 *
 * @param maxSessions Device cap to enforce. Defaults to the stored role's
 *   limit. Pass explicitly at login, where the role is known but may not have
 *   been written to localStorage yet.
 */
export async function claimSession(userId: string, maxSessions?: number): Promise<string> {
  const token = generateSessionToken();
  const roleLimit = maxSessions ?? getMaxSessions(
    typeof localStorage !== 'undefined' ? localStorage.getItem('userRole') : null
  );

  // Gather device info — use our own API endpoint instead of a third-party
  // service to avoid CSP violations, privacy concerns, and login slowdowns.
  let ip: string | null = null;
  let location: string | null = null;
  let serverOS: string | null = null;
  try {
    const ipRes = await fetch('/api/client-ip', { signal: AbortSignal.timeout(3000) });
    if (ipRes.ok) {
      const ipData = await ipRes.json();
      ip = ipData.ip || null;
      location = ipData.location || null;
      serverOS = ipData.os || null;
    }
  } catch {
    // Non-critical — session still works without IP/location
  }

  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;
  const isMobile = typeof navigator !== 'undefined' && /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
  const deviceType = isMobile ? 'Mobile' : 'Desktop';
  const osLabel = serverOS || (typeof navigator !== 'undefined' ? navigator.platform : '') || 'Unknown';
  const deviceInfo = `${osLabel} · ${deviceType}`;

  let persisted = false;

  try {
    const { error: rpcError } = await supabaseClient.rpc('claim_session', {
      p_user_id: userId,
      p_session_token: token,
      p_ip_address: ip,
      p_user_agent: userAgent,
      p_device_info: deviceInfo,
      p_location: location,
      p_max_sessions: roleLimit,
    });
    // supabase-js returns `{ error }` rather than throwing — must check it
    // explicitly, otherwise an errored RPC is treated as success.
    if (rpcError) throw rpcError;
    persisted = true;
  } catch (err) {
    console.warn('claim_session RPC failed, falling back to legacy RPC:', err);
    // Fallback: try the old claim_single_session (backward compat)
    try {
      const { error: legacyError } = await supabaseClient.rpc('claim_single_session', {
        p_user_id: userId,
        p_session_token: token,
        p_ip_address: ip,
        p_user_agent: userAgent,
        p_device_info: deviceInfo,
        p_location: location,
      });
      if (legacyError) throw legacyError;
      persisted = true;
    } catch (fallbackErr) {
      console.warn('Legacy session claim also failed; falling back to manual insert:', fallbackErr);
      // Final fallback: manually manage sessions
      try {
        // Count existing sessions
        const { data: existingSessions } = await supabaseClient
          .from('user_sessions')
          .select('id, last_active')
          .eq('user_id', userId)
          .order('last_active', { ascending: true });

        // If at or above limit, remove oldest. Uses the outer `roleLimit` so
        // the caller-supplied cap is honoured here too.
        if (existingSessions && existingSessions.length >= roleLimit) {
          const toRemove = existingSessions.slice(0, existingSessions.length - roleLimit + 1);
          for (const s of toRemove) {
            await supabaseClient.from('user_sessions').delete().eq('id', s.id);
          }
        }

        // Mark all remaining as not current
        await supabaseClient
          .from('user_sessions')
          .update({ is_current: false })
          .eq('user_id', userId);

        // Insert new session
        const { error: insertError } = await supabaseClient.from('user_sessions').insert({
          user_id: userId,
          session_token: token,
          ip_address: ip,
          user_agent: userAgent,
          device_info: deviceInfo,
          location,
          is_current: true,
        });
        if (insertError) throw insertError;
        persisted = true;
      } catch (manualErr) {
        console.warn('Manual session insert failed; session enforcement disabled for this login:', manualErr);
      }
    }
  }

  if (persisted) {
    // Only store the token once the DB row is confirmed. Storing it when no row
    // exists would make validate_session() return false and falsely kick the
    // user out ("logged in from another device") on the very next check.
    localStorage.setItem('session_token', token);
    localStorage.setItem('userId', userId);
    // Stamp the absolute session start so SessionGuard can enforce a maximum
    // session lifetime (bounds the window a hijacked/stale token is usable).
    localStorage.setItem('session_started_at', String(Date.now()));

    // Set HttpOnly cookie for server-side session verification (XSS-proof).
    // This is fire-and-forget — doesn't block login if it fails.
    const userRole = typeof localStorage !== 'undefined' ? localStorage.getItem('userRole') || '' : '';
    setSessionCookie(token, userId, userRole).catch(() => {});
  } else {
    // Could not persist a session row. Skip enforcement rather than store a
    // token that would trigger a false-positive logout.
    localStorage.removeItem('session_token');
    localStorage.removeItem('userId');
    localStorage.removeItem('session_started_at');
  }

  return token;
}

/**
 * Clears session data from localStorage. Called on logout.
 */
export function clearSessionData(): void {
  localStorage.removeItem('session_token');
  localStorage.removeItem('userId');
  localStorage.removeItem('session_started_at');
}

/**
 * Returns the count of active sessions for the current user.
 * Useful for showing "Logged in on X devices" in the UI.
 */
export async function getActiveSessionCount(userId: string): Promise<number> {
  try {
    const { data, error } = await supabaseClient.rpc('count_active_sessions', {
      p_user_id: userId,
    });
    if (error) throw error;
    return typeof data === 'number' ? data : 0;
  } catch {
    // Fallback: direct query
    try {
      const { data: sessions } = await supabaseClient
        .from('user_sessions')
        .select('id')
        .eq('user_id', userId);
      return sessions?.length || 0;
    } catch {
      return 0;
    }
  }
}

/**
 * Revokes a specific session by ID. Returns true if successful.
 */
export async function revokeSessionById(userId: string, sessionId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseClient.rpc('revoke_session', {
      p_user_id: userId,
      p_session_id: sessionId,
    });
    if (error) throw error;
    return data === true;
  } catch {
    // Fallback: direct delete
    try {
      await supabaseClient.from('user_sessions').delete().eq('id', sessionId).eq('user_id', userId);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Revokes all sessions except the current one. Returns number of sessions revoked.
 */
export async function revokeAllOtherSessions(userId: string): Promise<number> {
  const currentToken = localStorage.getItem('session_token');
  if (!currentToken) return 0;

  try {
    const { data, error } = await supabaseClient.rpc('revoke_all_other_sessions', {
      p_user_id: userId,
      p_current_session_token: currentToken,
    });
    if (error) throw error;
    return typeof data === 'number' ? data : 0;
  } catch {
    // Fallback: direct delete
    try {
      const { data: deleted } = await supabaseClient
        .from('user_sessions')
        .delete()
        .eq('user_id', userId)
        .neq('session_token', currentToken)
        .select('id');
      return deleted?.length || 0;
    } catch {
      return 0;
    }
  }
}
