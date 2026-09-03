import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/auth/server-session';
import { rateLimit } from '@/lib/rateLimit';
import { sendTemplateSimple } from '@/lib/whatsapp';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

const OTP_TEMPLATE_MESSAGE_ID = Number(
  process.env.FAST2SMS_WHATSAPP_OTP_TEMPLATE_ID ?? '1043655142001486'
);

/**
 * GET  /api/auth/whatsapp-otp/enroll — Fetch current MFA status for the logged-in user
 * POST /api/auth/whatsapp-otp/enroll — Enroll or update WhatsApp 2FA
 *   body: { action: 'save', phone }       — save phone, send verification OTP
 *   body: { action: 'verify', otp }       — verify OTP and enable 2FA
 *   body: { action: 'disable' }           — disable WhatsApp 2FA
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OTP_TTL_MS = 10 * 60 * 1000;

function generateOtp() {
  return crypto.randomBytes(4).readUInt32BE(0).toString().slice(-6).padStart(6, '0');
}
function hashOtp(otp: string) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

// ── GET ────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });

  const { data } = await supabaseAdmin
    .from('whatsapp_mfa')
    .select('phone, enabled, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json({
    enabled: data?.enabled ?? false,
    phone: data?.phone
      ? data.phone.slice(0, -4).replace(/\d/g, 'X') + data.phone.slice(-4)
      : null,
    hasPhone: !!data?.phone,
    updatedAt: data?.updated_at ?? null,
  });
}

// ── POST ───────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });

  const { limited, retryAfter } = rateLimit(`whatsapp-enroll:${user.id}`, { limit: 5, windowMs: 10 * 60_000 });
  if (limited) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  }

  let body: { action?: string; phone?: string; otp?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { action } = body;

  // ── Save phone + send verification OTP ────────────────────────────────────
  if (action === 'save') {
    const { phone } = body;
    if (!phone) return NextResponse.json({ error: 'Phone number is required.' }, { status: 400 });

    // Normalize: strip non-digits, ensure starts with country code
    const normalized = phone.replace(/\D/g, '');
    if (normalized.length < 10 || normalized.length > 15) {
      return NextResponse.json({ error: 'Invalid phone number. Include country code e.g. 919999999999.' }, { status: 400 });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

    // Upsert the MFA record (enabled=false until verified)
    const { error: upsertErr } = await supabaseAdmin
      .from('whatsapp_mfa')
      .upsert({
        user_id: user.id,
        phone: normalized,
        enabled: false,
        otp_hash: otpHash,
        otp_expires_at: expiresAt,
        otp_attempts: 0,
      }, { onConflict: 'user_id' });

    if (upsertErr) {
      return NextResponse.json({ error: 'Failed to save phone number.' }, { status: 500 });
    }

    // Send verification OTP via approved template
    const result = await sendTemplateSimple({
      message_id: OTP_TEMPLATE_MESSAGE_ID,
      numbers: normalized,
      variables_values: `${otp}|Verification`,
      udf1: user.id,
    });

    if (!result.success) {
      console.error('[whatsapp-enroll/save] Fast2SMS error:', result);
      return NextResponse.json({ error: 'Failed to send verification code. Check the phone number and try again.' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      message: `Verification code sent to WhatsApp ending in ${normalized.slice(-4)}`,
    });
  }

  // ── Verify OTP and enable 2FA ──────────────────────────────────────────────
  if (action === 'verify') {
    const { otp } = body;
    if (!otp || !/^\d{6}$/.test(otp)) {
      return NextResponse.json({ error: 'Enter the 6-digit verification code.' }, { status: 400 });
    }

    const { data: mfa } = await supabaseAdmin
      .from('whatsapp_mfa')
      .select('otp_hash, otp_expires_at, otp_attempts')
      .eq('user_id', user.id)
      .single();

    if (!mfa?.otp_hash) {
      return NextResponse.json({ error: 'No verification pending. Please save your phone number first.' }, { status: 400 });
    }

    if (new Date(mfa.otp_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Verification code expired. Please try again.' }, { status: 400 });
    }

    if ((mfa.otp_attempts ?? 0) >= 5) {
      await supabaseAdmin.from('whatsapp_mfa').update({ otp_hash: null, otp_expires_at: null, otp_attempts: 0 }).eq('user_id', user.id);
      return NextResponse.json({ error: 'Too many failed attempts. Please save your number again to get a new code.' }, { status: 400 });
    }

    const isValid = crypto.timingSafeEqual(
      Buffer.from(hashOtp(otp), 'hex'),
      Buffer.from(mfa.otp_hash, 'hex')
    );

    if (!isValid) {
      await supabaseAdmin.from('whatsapp_mfa').update({ otp_attempts: (mfa.otp_attempts ?? 0) + 1 }).eq('user_id', user.id);
      return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 401 });
    }

    // Enable 2FA
    await supabaseAdmin
      .from('whatsapp_mfa')
      .update({ enabled: true, otp_hash: null, otp_expires_at: null, otp_attempts: 0 })
      .eq('user_id', user.id);

    return NextResponse.json({ success: true, message: 'WhatsApp 2FA enabled successfully.' });
  }

  // ── Disable 2FA ────────────────────────────────────────────────────────────
  if (action === 'disable') {
    await supabaseAdmin
      .from('whatsapp_mfa')
      .update({ enabled: false, otp_hash: null, otp_expires_at: null, otp_attempts: 0 })
      .eq('user_id', user.id);

    return NextResponse.json({ success: true, message: 'WhatsApp 2FA disabled.' });
  }

  return NextResponse.json({ error: 'Invalid action. Use save, verify, or disable.' }, { status: 400 });
}
