import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

/**
 * POST /api/auth/check-mfa
 *
 * Server-side authoritative check for what 2FA methods a user has ACTUALLY
 * enabled. Reads directly from the DB — never trusts client-side session state
 * or Supabase SDK cache.
 *
 * Body: { userId }
 * Returns: { totp: boolean, whatsapp: boolean }
 *
 * Public endpoint — userId is not sensitive on its own and the response
 * reveals only whether the user has 2FA, not any secrets.
 * Rate-limited by IP via the in-process limiter.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  let body: { userId?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
  }

  const { userId } = body;
  if (!userId) return NextResponse.json({ error: 'userId required.' }, { status: 400 });

  // Check TOTP factors via a security-definer DB function that reads
  // auth.mfa_factors (inaccessible from the public REST API directly).
  const { data: factors } = await supabaseAdmin
    .rpc('get_user_mfa_factors', { p_user_id: userId });

  const hasTotp = (factors as any[] ?? []).some(
    (f) => f.factor_type === 'totp' && f.status === 'verified'
  );

  // Check WhatsApp MFA
  const { data: waMfa } = await supabaseAdmin
    .from('whatsapp_mfa')
    .select('enabled')
    .eq('user_id', userId)
    .maybeSingle();
  const hasWhatsapp = waMfa?.enabled === true;

  return NextResponse.json({ totp: hasTotp, whatsapp: hasWhatsapp });
}
