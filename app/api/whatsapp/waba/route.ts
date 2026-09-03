import { NextRequest, NextResponse } from 'next/server';
import { getServerUser, getServerRoles, hasStaffRole } from '@/lib/auth/server-session';
import { getWabaDetails } from '@/lib/whatsapp';

/**
 * GET /api/whatsapp/waba?type=number|template
 *
 * Staff-only endpoint to introspect your Fast2SMS WABA account.
 * Returns phone number IDs, WABA IDs, and approved template details.
 *
 * Use this to discover your FAST2SMS_PHONE_NUMBER_ID and template message_ids
 * before sending messages.
 *
 * Query params:
 *   type           — "number" (default) or "template"
 *   phone_number_id — optional, filter by specific phone number ID
 */
export async function GET(req: NextRequest) {
  // ── Auth guard ──────────────────────────────────────────────────────────────
  const user = await getServerUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised. You must be signed in.' }, { status: 401 });
  }
  if (!hasStaffRole(await getServerRoles(user.id))) {
    return NextResponse.json({ error: 'Forbidden. Staff role required.' }, { status: 403 });
  }

  const type = (req.nextUrl.searchParams.get('type') ?? 'number') as 'number' | 'template';
  const phone_number_id = req.nextUrl.searchParams.get('phone_number_id') ?? undefined;

  try {
    const result = await getWabaDetails(type, phone_number_id);

    if (!result.success) {
      return NextResponse.json(
        { error: (result as { message: string }).message ?? 'Failed to fetch WABA details.' },
        { status: 502 },
      );
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[WhatsApp WABA] Error:', message);
    return NextResponse.json({ error: 'Failed to fetch WABA details.' }, { status: 500 });
  }
}
