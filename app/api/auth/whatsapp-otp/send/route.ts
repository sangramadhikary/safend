import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { sendTemplateSimple } from '@/lib/whatsapp';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

/**
 * POST /api/auth/whatsapp-otp/send
 *
 * Generates a 6-digit OTP, stores its SHA-256 hash in whatsapp_mfa,
 * and sends it via the approved Fast2SMS AUTHENTICATION template (ID 1043655142001486).
 *
 * Template: "otp"
 *   BODY: "OTP Code: {{1}}. This is your OTP code for {{2}}."
 *   {{1}} = 6-digit OTP, {{2}} = "Login"
 *   FOOTER: "Expires in 5 minutes."
 *   BUTTON: Copy Code (deep-links into WhatsApp OTP autofill)
 *
 * Uses sendTemplateSimple (GET /dev/whatsapp) — works anytime, no prior
 * conversation needed. The session message approach required a 24h window
 * which is unsuitable for 2FA.
 *
 * Called during login AFTER password verified, BEFORE finalizeLogin.
 * Public endpoint — rate-limited to 3 sends per 10 min per IP.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Fast2SMS approved OTP template — set in env, hardcoded as fallback
const OTP_TEMPLATE_MESSAGE_ID = Number(
  process.env.FAST2SMS_WHATSAPP_OTP_TEMPLATE_ID ?? '1043655142001486'
);

/** Cryptographically secure 6-digit OTP */
function generateOtp(): string {
  return (crypto.randomBytes(4).readUInt32BE(0) % 1_000_000)
    .toString()
    .padStart(6, '0');
}

function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

/** Rollback: clear stored OTP on send failure so it can't be guessed */
async function clearOtp(userId: string) {
  await supabaseAdmin
    .from('whatsapp_mfa')
    .update({ otp_hash: null, otp_expires_at: null, otp_attempts: 0 })
    .eq('user_id', userId);
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { limited, retryAfter } = rateLimit(`whatsapp-otp-send:${ip}`, { limit: 3, windowMs: 10 * 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: 'Too many OTP requests. Please wait before requesting another code.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  let body: { userId?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { userId } = body;
  if (!userId) return NextResponse.json({ error: 'userId is required.' }, { status: 400 });

  // Look up the user's WhatsApp MFA record
  const { data: mfa, error: mfaErr } = await supabaseAdmin
    .from('whatsapp_mfa')
    .select('phone, enabled')
    .eq('user_id', userId)
    .single();

  if (mfaErr || !mfa) {
    return NextResponse.json({ error: 'WhatsApp 2FA is not configured for this account.' }, { status: 404 });
  }
  if (!mfa.enabled) {
    return NextResponse.json({ error: 'WhatsApp 2FA is not enabled for this account.' }, { status: 400 });
  }

  // Generate OTP and persist hash
  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  const { error: updateErr } = await supabaseAdmin
    .from('whatsapp_mfa')
    .update({ otp_hash: otpHash, otp_expires_at: expiresAt, otp_attempts: 0 })
    .eq('user_id', userId);

  if (updateErr) {
    console.error('[whatsapp-otp/send] DB update error:', updateErr.message);
    return NextResponse.json({ error: 'Failed to generate OTP. Please try again.' }, { status: 500 });
  }

  // Send via approved Fast2SMS AUTHENTICATION template
  // variables_values: "OTP|purpose" → {{1}}=OTP, {{2}}=Login
  try {
    const result = await sendTemplateSimple({
      message_id: OTP_TEMPLATE_MESSAGE_ID,
      numbers: mfa.phone,
      variables_values: `${otp}|Login`,
      udf1: userId,
    });

    if (!result.success) {
      console.error('[whatsapp-otp/send] Fast2SMS error:', result);
      await clearOtp(userId);
      return NextResponse.json(
        { error: 'Failed to send WhatsApp OTP. Please try again.' },
        { status: 502 }
      );
    }
  } catch (err: any) {
    console.error('[whatsapp-otp/send] Unexpected error:', err.message);
    await clearOtp(userId);
    return NextResponse.json({ error: 'Failed to send OTP.' }, { status: 500 });
  }

  const maskedPhone = mfa.phone.length >= 4
    ? mfa.phone.slice(0, -4).replace(/\d/g, 'X') + mfa.phone.slice(-4)
    : 'XXXX';

  return NextResponse.json({
    success: true,
    maskedPhone,
    expiresAt,
    message: `OTP sent to WhatsApp ending in ${mfa.phone.slice(-4)}`,
  });
}
