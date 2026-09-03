'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Session Cookie Client — HttpOnly Cookie Management
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This module manages the HttpOnly session cookie via API calls.
 * The cookie itself is invisible to JavaScript (HttpOnly), so we interact
 * with it through the /api/auth/session endpoint.
 *
 * Why both cookie AND localStorage?
 * - Cookie (HttpOnly): Server-side session verification, XSS-proof
 * - localStorage (session_token): Client-side SessionGuard validation
 *
 * The cookie provides defense-in-depth: even if XSS reads localStorage,
 * the attacker can't use the token in a different browser because the
 * server validates the HttpOnly cookie on API requests.
 *
 * On logout: BOTH are cleared (cookie via DELETE, localStorage via cleanup).
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Set the session cookie after successful login.
 * This sends the session token to the server which stores it in an
 * HttpOnly, Secure, SameSite=Strict cookie.
 */
export async function setSessionCookie(sessionToken: string, userId: string, role?: string): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken, userId, role: role || '' }),
    });
    return res.ok;
  } catch {
    // Non-critical — the session still works via localStorage + Bearer token
    return false;
  }
}

/**
 * Clear the session cookie on logout.
 * Called alongside localStorage cleanup.
 */
export async function clearSessionCookie(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/session', { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Verify the session cookie is still valid (server-side check).
 * Useful for rehydration on page load.
 */
export async function verifySessionCookie(): Promise<{
  authenticated: boolean;
  userId?: string;
  sessionToken?: string;
}> {
  try {
    const res = await fetch('/api/auth/session', { method: 'GET' });
    if (!res.ok) return { authenticated: false };
    return await res.json();
  } catch {
    return { authenticated: false };
  }
}
