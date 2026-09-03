import { NextRequest, NextResponse } from 'next/server';
import { getServerUser, getServerRoles } from '@/lib/auth/server-session';
import { decideAccess } from '@/lib/security/access-decision';
import { isUuid } from '@/lib/attendance/attendanceCode';
import { generateSignedAttendanceCode } from '@/lib/attendance/hmac';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

/**
 * POST /api/attendance/qr — Per-post QR code generation (Requirement 16).
 *
 * Operations-authenticated: only callers holding an operations/admin role may
 * request a code. The route validates that the requested `post_id` exists in
 * `operational_posts` and returns the encoded attendance code
 * `formatAttendanceCode(post_id)` so the client can render a scannable QR.
 *
 *  - R16.1: return a well-formed attendance code containing the post's id so
 *    the Scanner extracts the same `post_id`.
 *  - R16.2: a `post_id` that does not exist in `operational_posts` yields a
 *    404 "post not found".
 *  - R16.3: generation never returns a partial code — any failure returns an
 *    error response with no `code` field, so the client can surface a retry.
 *
 * Uses the established module-level service-role client pattern (as in
 * `app/api/bff/operations-dashboard/route.ts`); authorization is derived from
 * the server-verified session and server-resolved roles only.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Roles permitted to generate post QR codes from Operations post management. */
const QR_ALLOWED_ROLES = ['operations', 'admin', 'branch_admin'];

export async function POST(request: NextRequest) {
  // ── Authorization: operations-authenticated (server-verified session + roles) ──
  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roles = await getServerRoles(user.id);
  const decision = decideAccess({
    sessionConfirmed: true,
    resolvedRoles: roles,
    routeAllowedRoles: QR_ALLOWED_ROLES,
  });
  if (decision !== 'allow') {
    return NextResponse.json({ error: 'Forbidden. Operations role required.' }, { status: 403 });
  }

  // ── Parse + validate the requested post_id ──
  let postId: unknown;
  try {
    const body = await request.json();
    postId = body?.post_id;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (typeof postId !== 'string' || !isUuid(postId)) {
    return NextResponse.json({ error: 'A valid post_id is required.' }, { status: 400 });
  }

  // ── Verify the post exists (R16.2) ──
  try {
    const { data: post, error } = await supabaseAdmin
      .from('operational_posts')
      .select('id, post_name, post_code')
      .eq('id', postId)
      .maybeSingle();

    if (error) {
      // Service failure — never return a partial code (R16.3).
      return NextResponse.json({ error: 'Failed to generate QR code. Please try again.' }, { status: 500 });
    }

    if (!post) {
      return NextResponse.json({ error: 'post not found' }, { status: 404 });
    }

    // ── Generate the HMAC-signed attendance code (R16.1). ──
    const code = generateSignedAttendanceCode(post.id);

    return NextResponse.json({
      code,
      post: {
        id: post.id,
        post_name: post.post_name ?? null,
        post_code: post.post_code ?? null,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to generate QR code. Please try again.' }, { status: 500 });
  }
}
