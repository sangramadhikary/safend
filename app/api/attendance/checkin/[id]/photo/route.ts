import { NextRequest, NextResponse } from 'next/server';
import { getServerUser, getServerRoles } from '@/lib/auth/server-session';
import { decideAccess } from '@/lib/security/access-decision';
import { getCheckInById } from '@/services/supabase/QrCheckInService';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

/**
 * GET /api/attendance/checkin/[id]/photo — Authorized signed-URL access to a
 * check-in photo (Requirements 8.4, 8.5, 8.6, 9.5).
 *
 * Attendance photos are biometric-adjacent personal data held in the private
 * `attendance-photos` bucket, which has no public read access. This route is
 * the *only* way an approver reaches a photo, and it hands back a short-lived
 * signed URL rather than the object itself.
 *
 *  - R8.5: authorization is derived from the server-verified session and
 *    server-resolved roles only. A caller who is not an Approver (Supervisor
 *    or Operations role) is denied with 403 and no URL is generated.
 *  - R8.4: an authorized request receives a signed URL that expires 300
 *    seconds after generation.
 *  - R9.5: once a photo has been marked expired by the retention job
 *    (`photo_expired = true`, or `photo_path` nulled), the photo is treated as
 *    inaccessible — the route returns 410 and never generates a signed URL.
 *  - R8.6: if signed-URL generation fails, the photo stays inaccessible; the
 *    route returns 502 and never exposes an alternative public access path.
 *
 * Uses the established module-level service-role client pattern (see
 * `app/api/attendance/qr/route.ts`). The service-role client is used only to
 * read the record and sign the private object; it is never used to widen
 * access beyond the authorized caller.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** The private bucket holding attendance photos (R8.3). */
const PHOTO_BUCKET = 'attendance-photos';

/** Signed-URL lifetime in seconds (R8.4). */
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Roles permitted to view a check-in photo: the Approvers, i.e. holders of the
 * Supervisor role or the Operations role (R8.5, mirroring R11.5).
 */
const APPROVER_ROLES = ['operations', 'supervisor'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // ── Authorization: Approver-only (server-verified session + resolved roles) ──
  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roles = await getServerRoles(user.id);
  const decision = decideAccess({
    sessionConfirmed: true,
    resolvedRoles: roles,
    routeAllowedRoles: APPROVER_ROLES,
  });
  if (decision !== 'allow') {
    // Not an Approver — deny and generate no URL (R8.5).
    return NextResponse.json(
      { error: 'Forbidden. Supervisor or Operations role required.' },
      { status: 403 },
    );
  }

  // ── Load the check-in record via the service-role client ──
  const loaded = await getCheckInById(id, supabaseAdmin);
  if (!loaded.success) {
    return NextResponse.json({ error: 'Failed to load check-in.' }, { status: 500 });
  }

  const record = loaded.data;
  if (!record) {
    return NextResponse.json({ error: 'Check-in not found.' }, { status: 404 });
  }

  // ── Expired photo: treat as inaccessible, never sign (R9.5) ──
  if (record.photoExpired || !record.photoPath) {
    return NextResponse.json(
      { error: 'The photo for this check-in is no longer available.' },
      { status: 410 },
    );
  }

  // ── Generate the short-lived signed URL (R8.4) ──
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(record.photoPath, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      // Signing failed — leave the photo inaccessible, no public fallback (R8.6).
      return NextResponse.json(
        { error: 'The photo cannot be accessed at this time.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: data.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS });
  } catch {
    // Unexpected signing failure — same terminal behavior, no fallback (R8.6).
    return NextResponse.json(
      { error: 'The photo cannot be accessed at this time.' },
      { status: 502 },
    );
  }
}
