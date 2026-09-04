import { NextRequest, NextResponse } from 'next/server';
import { getServerUser, getServerRoles } from '@/lib/auth/server-session';
import { decideAccess } from '@/lib/security/access-decision';
import { rateLimit } from '@/lib/rateLimit';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

/**
 * POST /api/admin/reset-password
 *
 * Resets a user's password. Two modes:
 *   { userId, newPassword }  — admin sets a specific new password (direct reset)
 *   { email }                — sends a password reset email to the user
 *
 * Also handles 2FA (WebAuthn) reset:
 *   { userId, reset2fa: true } — deletes all WebAuthn credentials for the user
 *
 * Requires admin or branch_admin role.
 */
export async function POST(request: NextRequest) {
  const callerUser = await getServerUser(request);
  if (!callerUser) {
    return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });
  }

  const callerRoles = await getServerRoles(callerUser.id);
  const decision = decideAccess({
    sessionConfirmed: true,
    resolvedRoles: callerRoles,
    routeAllowedRoles: ['admin', 'branch_admin'],
  });
  if (decision !== 'allow') {
    return NextResponse.json({ error: 'Forbidden. Admin role required.' }, { status: 403 });
  }

  const { limited, retryAfter } = rateLimit(`reset-password:${callerUser.id}`, { limit: 10, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  }

  const body = await request.json();
  const { userId, newPassword, email, reset2fa } = body;

  // Mode: Reset 2FA (WebAuthn credentials + Supabase TOTP factors)
  if (userId && reset2fa) {
    // 1. Delete all WebAuthn (biometric/passkey) credentials
    const { count: webauthnCount } = await supabaseAdmin
      .from('webauthn_credentials')
      .delete({ count: 'exact' })
      .eq('user_id', userId);

    // 2. Unenroll all Supabase TOTP MFA factors (authenticator app)
    let totpCount = 0;
    try {
      // Admin MFA methods live under `admin.mfa` in supabase-js v2, and
      // deleteFactor takes `id` (not `factorId`). The previous calls used the old
      // shape, so this block silently threw and no factor was ever unenrolled.
      const { data: factors } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
      const allFactors = factors?.factors ?? [];
      for (const factor of allFactors) {
        await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
        totpCount++;
      }
    } catch (err: any) {
      console.error('[reset-password] TOTP unenroll error:', err.message);
    }

    // 3. Clear WhatsApp MFA OTP state (don't disable the phone — just clear pending OTP)
    await supabaseAdmin
      .from('whatsapp_mfa')
      .update({ enabled: false, otp_hash: null, otp_expires_at: null, otp_attempts: 0 })
      .eq('user_id', userId);

    // 4. Invalidate all active sessions so the old AAL2 state doesn't persist
    try {
      await supabaseAdmin.auth.admin.signOut(userId, 'others');
    } catch { /* non-critical */ }

    const cleared = [];
    if ((webauthnCount ?? 0) > 0) cleared.push(`${webauthnCount} biometric device(s)`);
    if (totpCount > 0) cleared.push(`${totpCount} authenticator app(s)`);
    cleared.push('WhatsApp 2FA');

    return NextResponse.json({
      success: true,
      message: `2FA fully reset. Cleared: ${cleared.join(', ')}. The user can log in with password only.`,
    });
  }

  // Mode 1: Direct password set by admin
  if (userId && newPassword) {
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, message: 'Password updated successfully.' });
  }

  // Mode 2: Send reset email
  if (email) {
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://office.safend.in'}/login`,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, message: `Password reset email sent to ${email}.` });
  }

  return NextResponse.json({ error: 'Provide either userId + newPassword, userId + reset2fa, or email.' }, { status: 400 });
}
