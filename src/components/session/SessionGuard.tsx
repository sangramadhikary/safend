'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { supabaseClient, getSupabaseClient } from '@/integrations/supabase/client';
import { InactivityCountdown } from './InactivityCountdown';
import { MAX_SESSIONS, getMaxSessions } from '@/utils/sessionManager';
import { nuclearCacheCleanup } from '@/lib/queryCache';

// ── Config ────────────────────────────────────────────────────────────────────
const COUNTDOWN_DURATION_S = 60;              // 1 minute countdown
const SESSION_CHECK_INTERVAL_MS = 30 * 1000;  // check every 30s
const HEARTBEAT_INTERVAL_MS = 60 * 1000;      // heartbeat every 60s
// Window after login during which a "session not found" result is treated as a
// possible race (claim not yet committed) rather than an eviction.
const POST_LOGIN_GRACE_MS = 15 * 1000;

// Per-portal timeout configuration
const PORTAL_CONFIG = {
  erp: {
    inactivityMs: 30 * 60 * 1000,       // 30 minutes idle timeout
    absoluteMs: 10 * 60 * 60 * 1000,    // 10 hours (workday)
  },
  employee: {
    inactivityMs: 30 * 60 * 1000,       // 30 minutes idle timeout
    absoluteMs: 10 * 60 * 60 * 1000,    // 10 hours (workday)
  },
  client: {
    inactivityMs: 60 * 60 * 1000,       // 60 minutes idle timeout
    absoluteMs: 24 * 60 * 60 * 1000,    // 24 hours
  },
} as const;

type PortalType = keyof typeof PORTAL_CONFIG;

// Events that count as "user activity"
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'wheel',
];

interface SessionGuardProps {
  /** Which portal this guard is protecting. Determines timeout values. Default: 'erp' */
  portal?: PortalType;
}

/**
 * SessionGuard sits inside the authenticated layout and enforces:
 * 1. Multi-session (max 2 devices) — periodically validates the session token.
 *    If invalidated (a newer login evicted this session), forces logout with a message.
 * 2. Inactivity timeout — configurable per portal (30 min ERP, 60 min client).
 *    Shows a 1-minute countdown overlay. If not cancelled, auto-logs the user out.
 * 3. Absolute lifetime — force re-auth after workday/24h regardless of activity.
 */
export function SessionGuard({ portal = 'erp' }: SessionGuardProps) {
  const config = PORTAL_CONFIG[portal];
  const INACTIVITY_TIMEOUT_MS = config.inactivityMs;
  const ABSOLUTE_SESSION_MS = config.absoluteMs;
  const [showCountdown, setShowCountdown] = useState(false);
  const [kickedOut, setKickedOut] = useState(false);
  const [expired, setExpired] = useState(false);

  const lastActivityRef = useRef(0);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownActiveRef = useRef(false);
  // Counts consecutive "invalid" results. We require two in a row before
  // kicking, so a single transient race (e.g. the heartbeat/claim not yet
  // committed right after login) can't trigger a false "logged in elsewhere".
  const invalidStreakRef = useRef(0);
  // forceLogout can now be reached from two places (the poll and the realtime
  // eviction signal). Latch so the logout sequence only ever runs once.
  const loggingOutRef = useRef(false);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const getSessionToken = () => localStorage.getItem('session_token');
  const getUserId = () => localStorage.getItem('userId');
  const getSessionStartedAt = () => {
    const raw = localStorage.getItem('session_started_at');
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  };

  const forceLogout = useCallback((reason: 'inactivity' | 'kicked' | 'expired') => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;

    // Clean up intervals
    if (sessionCheckRef.current) clearInterval(sessionCheckRef.current);
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);

    if (reason === 'kicked' || reason === 'expired') {
      if (reason === 'expired') setExpired(true);
      else setKickedOut(true);
      // Show the message for 3 seconds, THEN wipe data and logout.
      // Nuclear cleanup runs here (not before) so ProtectedRoute doesn't
      // redirect to /login before the user sees the explanation.
      setTimeout(() => {
        nuclearCacheCleanup();
        window.dispatchEvent(new CustomEvent('app:logout'));
      }, 3000);
    } else {
      // Inactivity: wipe immediately and logout (no message to show)
      nuclearCacheCleanup();
      window.dispatchEvent(new CustomEvent('app:logout'));
    }
  }, []);

  // ── Absolute session lifetime ─────────────────────────────────────────────────
  const checkAbsoluteLifetime = useCallback(() => {
    const startedAt = getSessionStartedAt();
    if (startedAt === null) return; // no stamp (e.g. enforcement disabled this login)
    if (Date.now() - startedAt >= ABSOLUTE_SESSION_MS) {
      forceLogout('expired');
    }
  }, [forceLogout]);

  // ── Activity tracking ───────────────────────────────────────────────────────
  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();

    // If countdown is showing, cancel it
    if (countdownActiveRef.current) {
      countdownActiveRef.current = false;
      setShowCountdown(false);
    }

    // Reset the inactivity timer
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      // Start countdown
      countdownActiveRef.current = true;
      setShowCountdown(true);
    }, INACTIVITY_TIMEOUT_MS);
  }, []);

  // ── Countdown handlers ──────────────────────────────────────────────────────
  const handleCountdownExpire = useCallback(() => {
    countdownActiveRef.current = false;
    setShowCountdown(false);
    forceLogout('inactivity');
  }, [forceLogout]);

  const handleCountdownCancel = useCallback(() => {
    countdownActiveRef.current = false;
    setShowCountdown(false);
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  // ── Session validation ──────────────────────────────────────────────────────
  const validateSession = useCallback(async () => {
    const userId = getUserId();
    const token = getSessionToken();
    if (!userId || !token) return; // Not authenticated or no token yet

    try {
      const { data, error } = await supabaseClient.rpc('validate_session', {
        p_user_id: userId,
        p_session_token: token,
      });

      if (error) {
        // RPC error is treated as transient — don't kick on it.
        invalidStreakRef.current = 0;
        return;
      }

      if (data === false) {
        // Session not found — this device was evicted because a newer login
        // exceeded the max device limit.
        //
        // The post-login race (claim not yet committed when the first check
        // fires) is handled by a time-based grace window rather than a
        // two-strike counter. The counter cost every eviction an extra full
        // poll interval, so a user watching the other device saw nothing
        // happen for up to a minute and concluded eviction was broken.
        const startedAt = getSessionStartedAt();
        const withinGrace =
          startedAt !== null && Date.now() - startedAt < POST_LOGIN_GRACE_MS;

        if (withinGrace) {
          invalidStreakRef.current += 1;
          if (invalidStreakRef.current >= 2) forceLogout('kicked');
          return;
        }

        forceLogout('kicked');
        return;
      }

      // Valid — reset the streak.
      invalidStreakRef.current = 0;
    } catch {
      // Network error — don't kick the user out for transient failures
      invalidStreakRef.current = 0;
    }
  }, [forceLogout]);

  // ── Heartbeat ───────────────────────────────────────────────────────────────
  const sendHeartbeat = useCallback(async () => {
    const userId = getUserId();

    // Update last_active using server-side RPC (single source of truth for timestamps)
    if (userId) {
      try {
        await supabaseClient.rpc('update_last_active');
      } catch { /* non-critical */ }
    }

    const token = getSessionToken();
    if (!userId || !token) return;

    // Session heartbeat (RPC may not exist yet)
    try {
      await supabaseClient.rpc('heartbeat_session', {
        p_user_id: userId,
        p_session_token: token,
      });
    } catch {
      // Silent fail — function may not exist
    }

    // Proactively refresh the Supabase auth session to prevent JWT expiry.
    // The SDK's autoRefreshToken should handle this, but as a safety net we
    // explicitly refresh during heartbeat so the token is always fresh.
    try {
      const client = getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      if (session) {
        // Access token expires in 1h. If it's within 5 minutes of expiry, refresh now.
        const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
        const fiveMinutes = 5 * 60 * 1000;
        if (expiresAt && Date.now() > expiresAt - fiveMinutes) {
          await client.auth.refreshSession();
        }
      }
    } catch { /* non-critical */ }
  }, []);

  // ── Setup ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const isAuth = localStorage.getItem('isAuthenticated') === 'true';
    if (!isAuth) return;

    // Initialize the activity timestamp now that we're on the client
    lastActivityRef.current = Date.now();

    // Start inactivity timer
    resetInactivityTimer();

    // Attach activity listeners
    const handler = () => resetInactivityTimer();
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, handler, { passive: true }));

    // Start session validation interval
    sessionCheckRef.current = setInterval(() => {
      validateSession();
      checkAbsoluteLifetime();
    }, SESSION_CHECK_INTERVAL_MS);

    // Start heartbeat interval
    heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Re-check the moment the tab regains focus. Background tabs get their
    // timers throttled, so without this an evicted device could sit on stale
    // screens until the throttled interval finally fires.
    const revalidateOnFocus = () => {
      if (document.visibilityState === 'visible') validateSession();
    };
    document.addEventListener('visibilitychange', revalidateOnFocus);
    window.addEventListener('focus', revalidateOnFocus);

    // ── Instant eviction signal ───────────────────────────────────────────────
    // Eviction is a row delete performed by the *other* device, so polling is
    // the only thing that would otherwise notice it. Subscribing to our own
    // user's session deletes turns a ≤30s delay into an immediate sign-out.
    //
    // Requires REPLICA IDENTITY FULL on user_sessions (see the
    // 20260806000000_session_lifecycle_fixes migration) — with the default
    // replica identity the DELETE payload carries only the primary key, which
    // this device never stored and so could not match against its own token.
    const userId = getUserId();
    const channel = userId
      ? supabaseClient
          .channel(`session-guard-${userId}`)
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'user_sessions',
              filter: `user_id=eq.${userId}`,
            },
            (payload: { old?: { session_token?: string | null } }) => {
              const deletedToken = payload.old?.session_token;
              const myToken = getSessionToken();
              // Only react to our own row. Other rows disappearing just means a
              // different device of ours was evicted or signed out.
              if (!myToken || !deletedToken || deletedToken !== myToken) return;
              forceLogout('kicked');
            }
          )
          .subscribe()
      : null;

    // Also validate + send heartbeat immediately on mount (updates last_active now)
    validateSession();
    checkAbsoluteLifetime();
    sendHeartbeat();

    return () => {
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, handler));
      document.removeEventListener('visibilitychange', revalidateOnFocus);
      window.removeEventListener('focus', revalidateOnFocus);
      if (channel) supabaseClient.removeChannel(channel);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (sessionCheckRef.current) clearInterval(sessionCheckRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [resetInactivityTimer, validateSession, sendHeartbeat, checkAbsoluteLifetime, forceLogout]);

  // ── Render ──────────────────────────────────────────────────────────────────
  // Read at render time: MAX_SESSIONS is the ERP default, but supervisor and
  // client roles are capped at one device, and quoting "2" to them is wrong.
  const deviceLimit = typeof localStorage !== 'undefined'
    ? getMaxSessions(localStorage.getItem('userRole'))
    : MAX_SESSIONS;

  if (kickedOut) {
    return (
      <div className="fixed inset-0 z-9998 bg-black/80 backdrop-blur-xs flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-sm mx-4 text-center shadow-2xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Session Ended
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            You&apos;ve been signed out because your account reached the maximum of {deviceLimit} active {deviceLimit === 1 ? 'device' : 'devices'}. A newer login replaced this session.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
            Redirecting to login…
          </p>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="fixed inset-0 z-9998 bg-black/80 backdrop-blur-xs flex items-center justify-center">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-sm mx-4 text-center shadow-2xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Session Expired
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            For your security, this session has reached its maximum duration. Please sign in again to continue.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
            Redirecting to login…
          </p>
        </div>
      </div>
    );
  }

  if (showCountdown) {
    return (
      <InactivityCountdown
        durationSeconds={COUNTDOWN_DURATION_S}
        onExpire={handleCountdownExpire}
        onCancel={handleCountdownCancel}
      />
    );
  }

  return null;
}
