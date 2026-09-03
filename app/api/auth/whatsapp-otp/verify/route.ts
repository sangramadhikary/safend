import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

/**
 * POST /api/auth/whatsapp-otp/verify
 *
 * Verifies the 6-digit OTP entered by the user during login.
 * Uses SHA-256 hash comparison against the stored hash.
 * Max 5 attempts per OTP — exceeded attempts invalidate the OTP.
 *
 * Body: { userId, otp }
 * Returns: { success: true } on valid OTP — caller then proceeds to finalizeLogin
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAX_ATTEMPTS = 5;

function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  // Tight rate limit — 10 attempts per 15 min per IP across all accounts
  const { limited, retryAfter } = rateLimit(`whatsapp-otp-verify:${ip}`, { limit: 10, windowMs: 15 * 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: 'Too many verification attempts. Please wait and try again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  let body: { userId?: string; otp?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { userId, otp } = body;
  if (!userId || !otp) return NextResponse.json({ error: 'userId and otp are required.' }, { status: 400 });
  if (!/^\d{6}$/.test(otp)) return NextResponse.json({ error: 'OTP must be exactly 6 digits.' }, { status: 400 });

  // Fetch MFA record
  const { data: mfa, error: mfaErr } = await supabaseAdmin
    .from('whatsapp_mfa')
    .select('otp_hash, otp_expires_at, otp_attempts, enabled')
    .eq('user_id', userId)
    .single();

  if (mfaErr || !mfa) {
    return NextResponse.json({ error: 'WhatsApp 2FA not configured.' }, { status: 404 });
  }
  if (!mfa.enabled) {
    return NextResponse.json({ error: 'WhatsApp 2FA is not enabled.' }, { status: 400 });
  }
  if (!mfa.otp_hash || !mfa.otp_expires_at) {
    return NextResponse.json({ error: 'No OTP pending. Please request a new code.' }, { status: 400 });
  }

  // Check expiry
  if (new Date(mfa.otp_expires_at) < new Date()) {
    await supabaseAdmin
      .from('whatsapp_mfa')
      .update({ otp_hash: null, otp_expires_at: null, otp_attempts: 0 })
      .eq('user_id', userId);
    return NextResponse.json({ error: 'OTP has expired. Please request a new code.' }, { status: 400 });
  }

  // Check attempt count
  if (mfa.otp_attempts >= MAX_ATTEMPTS) {
    await supabaseAdmin
      .from('whatsapp_mfa')
      .update({ otp_hash: null, otp_expires_at: null, otp_attempts: 0 })
      .eq('user_id', userId);
    return NextResponse.json({ error: 'Too many failed attempts. OTP invalidated. Please request a new code.' }, { status: 400 });
  }

  // Verify OTP using constant-time comparison
  const providedHash = hashOtp(otp);
  const isValid = crypto.timingSafeEqual(
    Buffer.from(providedHash, 'hex'),
    Buffer.from(mfa.otp_hash, 'hex')
  );

  if (!isValid) {
    // Increment attempt counter
    const newAttempts = (mfa.otp_attempts ?? 0) + 1;
    await supabaseAdmin
      .from('whatsapp_mfa')
      .update({ otp_attempts: newAttempts })
      .eq('user_id', userId);

    const remaining = MAX_ATTEMPTS - newAttempts;
    return NextResponse.json({
      error: remaining > 0
        ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        : 'Incorrect code. OTP invalidated — please request a new one.',
    }, { status: 401 });
  }

  // Success — clear the OTP so it can't be reused
  await supabaseAdmin
    .from('whatsapp_mfa')
    .update({ otp_hash: null, otp_expires_at: null, otp_attempts: 0 })
    .eq('user_id', userId);

  return NextResponse.json({ success: true });
}
