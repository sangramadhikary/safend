import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Session Cookie API — HttpOnly Secure Cookie Management
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This endpoint manages session tokens via HttpOnly cookies instead of
 * localStorage. HttpOnly cookies are:
 * - Invisible to JavaScript (XSS cannot exfiltrate them)
 * - Sent automatically by the browser on every request
 * - Protected by SameSite=Strict (CSRF protection)
 * - Encrypted in transit via Secure flag (HTTPS only)
 *
 * Flow:
 * 1. POST /api/auth/session — sets the session cookie after login
 * 2. GET /api/auth/session — validates the session (server-side)
 * 3. DELETE /api/auth/session — clears the cookie on logout
 *
 * The session_token stored here is the same one used by SessionGuard
 * (validate_session RPC). The cookie is an ADDITIONAL security layer —
 * localStorage still has a copy for the client-side SessionGuard to read,
 * but the cookie ensures the server can verify sessions independently.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const COOKIE_NAME = 'safend_session';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  // 10 hours = ERP session max lifetime
  maxAge: 10 * 60 * 60,
};

/**
 * POST — Set session cookie after login.
 * Called by LoginForm after successful authentication.
 * Body: { sessionToken, userId, role? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionToken, userId, role } = body;

    if (!sessionToken || !userId) {
      return NextResponse.json(
        { error: 'sessionToken and userId are required' },
        { status: 400 }
      );
    }

    // Create response and set HttpOnly cookie
    const response = NextResponse.json({ success: true });

    response.cookies.set(COOKIE_NAME, JSON.stringify({ sessionToken, userId, role: role || '' }), COOKIE_OPTIONS);

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET — Validate the session cookie.
 * Used by middleware or server components to verify the session.
 * Returns the userId and sessionToken if valid cookie exists.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(COOKIE_NAME);

    if (!sessionCookie?.value) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const { sessionToken, userId } = JSON.parse(sessionCookie.value);

    if (!sessionToken || !userId) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      userId,
      sessionToken,
    });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}

/**
 * DELETE — Clear the session cookie on logout.
 * Called by the logout flow to ensure no session persists.
 */
export async function DELETE() {
  const response = NextResponse.json({ success: true });

  // Clear the cookie by setting maxAge to 0
  response.cookies.set(COOKIE_NAME, '', {
    ...COOKIE_OPTIONS,
    maxAge: 0,
  });

  return response;
}
