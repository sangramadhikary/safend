'use client';
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Eye, EyeOff, ShieldCheck, ArrowLeft } from "lucide-react";
import { useToastWithSound } from "@/hooks/use-toast-with-sound";
import { UnifiedLoader } from "@/components/ui/unified-loader";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseClient } from "@/integrations/supabase/client";
import { cleanupAuthState } from "@/utils/authCleanup";
import { claimSession, MAX_SESSIONS, getMaxSessions, pruneStaleSessions } from "@/utils/sessionManager";
import { auditActions } from "@/utils/auditLog";
import { DeviceLimitInfo } from "@/components/session/DeviceLimitInfo";
import { BiometricLoginButton } from "@/components/auth/BiometricLoginButton";
import { TurnstileWidget, type TurnstileHandle } from "@/components/TurnstileWidget";

// The Quick Attendance Scanner relies on browser-only APIs (camera, geolocation,
// BarcodeDetector), so it is loaded lazily and kept out of SSR (R1.1). It only
// mounts once the user activates the scanner control, so no auth is required.
const QuickAttendanceScanner = dynamic(
  () => import("@/components/attendance/QuickAttendanceScanner").then((m) => m.QuickAttendanceScanner),
  { ssr: false },
);

interface LoginFormProps {
  onClose?: () => void;
  /** Show the QR attendance scanner button (mobile/tablet only) */
  showQrScanner?: boolean;
}

// ─── helper: redirect after successful login ──────────────────────────────────
const ROOT_DOMAIN_LOGIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'safend.in';

function getRedirectPath(role: string | null) {
  switch (role) {
    case 'admin':
    case 'branch_admin': return '/dashboard';
    case 'sales':        return '/sales';
    case 'operations':   return '/operations';
    case 'accounts':     return '/accounts';
    case 'hr':           return '/hr';
    case 'office-admin':
    case 'office_admin': return '/office-admin';
    case 'reports':      return '/sales'; // reports users see sales analytics
    case 'client':       return '/client-portal';
    case 'employee_portal':
    case 'supervisor':   return '/supervisor-portal';
    default:             return '/dashboard';
  }
}

/**
 * Returns the redirect URL for the user's role.
 * Since portal boundary enforcement now rejects mismatched logins outright,
 * this always returns a relative path on the current subdomain.
 */
function getPortalAwareRedirectUrl(role: string | null): string {
  return getRedirectPath(role);
}

export function LoginForm({ onClose, showQrScanner = false }: LoginFormProps) {
  const { toast } = useToastWithSound();

  // ── Step 1: email + password ────────────────────────────────────────────────
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState('');

  // ── Step 2: 2FA ─────────────────────────────────────────────────────────────
  const [step, setStep]             = useState<'password' | 'mfa-choice' | 'totp' | 'whatsapp-otp' | 'device-limit' | 'forgot'>('password');
  const [totpCode, setTotpCode]     = useState('');
  const [factorId, setFactorId]     = useState('');
  const [pendingUserId, setPendingUserId] = useState('');
  const [pendingEmail, setPendingEmail]       = useState('');
  const [pendingPassword, setPendingPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [resetSent, setResetSent]   = useState(false);

  // ── WhatsApp OTP state ───────────────────────────────────────────────────────
  const [waOtp, setWaOtp]           = useState('');
  const [waMaskedPhone, setWaMaskedPhone] = useState('');
  const [waExpiresAt, setWaExpiresAt] = useState<string | null>(null);
  const [waResendCooldown, setWaResendCooldown] = useState(0);
  // Tracks which methods are available for the mfa-choice step
  const [availableMfa, setAvailableMfa] = useState<{ totp: boolean; whatsapp: boolean }>({ totp: false, whatsapp: false });

  // ── Cloudflare Turnstile CAPTCHA ────────────────────────────────────────────
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<TurnstileHandle>(null);

  // ── Step 3: Device limit ────────────────────────────────────────────────────
  const [existingSessions, setExistingSessions] = useState<any[]>([]);
  const [pendingUser, setPendingUser] = useState<any>(null);

  // ── Public QR attendance scanner (no auth required) ──────────────────────────
  const [showScanner, setShowScanner] = useState(false);

  // ── Step 2: progressive lockout after wrong OTP attempts ─────────────────────
  // Every 3 failed attempts triggers a cooldown. The cooldown grows by 30s each
  // time it's triggered: 1st lock = 30s, 2nd = 60s, 3rd = 90s, …
  const ATTEMPTS_PER_LOCK = 3;
  const LOCK_STEP_SECONDS = 30;
  const [failedAttempts, setFailedAttempts] = useState(0); // counts toward the next lock
  const [lockCount, setLockCount]           = useState(0); // how many times we've locked
  const [lockUntil, setLockUntil]           = useState<number | null>(null); // epoch ms
  const [secondsLeft, setSecondsLeft]       = useState(0);
  const autoSubmitRef = useRef(false); // guards against double auto-submit

  const isLocked = secondsLeft > 0;

  // Tick down the cooldown timer once per second while locked.
  useEffect(() => {
    if (lockUntil == null) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        setLockUntil(null);
        setError('');
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockUntil]);

  // WhatsApp OTP resend cooldown ticker
  useEffect(() => {
    if (waResendCooldown <= 0) return;
    const id = setInterval(() => setWaResendCooldown(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, [waResendCooldown]);

  // Auto-submit once the user finishes entering all 6 digits.
  useEffect(() => {
    if (step !== 'totp') return;
    if (totpCode.length === 6 && !isVerifying && !isLocked && !autoSubmitRef.current) {
      autoSubmitRef.current = true;
      handleTotpVerify();
    }
    if (totpCode.length < 6) {
      autoSubmitRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totpCode, step, isVerifying, isLocked]);

  // Auto-submit WhatsApp OTP
  useEffect(() => {
    if (step !== 'whatsapp-otp') return;
    if (waOtp.length === 6 && !isVerifying && !autoSubmitRef.current) {
      autoSubmitRef.current = true;
      handleWaOtpVerify();
    }
    if (waOtp.length < 6) autoSubmitRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waOtp, step, isVerifying]);

  // ── Step 1 submit ────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!turnstileToken) {
      setError('Please complete the verification check.');
      setIsLoading(false);
      return;
    }

    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseKey?.startsWith('eyJ')) {
      setError('Authentication service is not configured.');
      setIsLoading(false);
      return;
    }

    try {
      cleanupAuthState();
      try { await supabase.auth.signOut({ scope: 'global' }); } catch {}

      const { data, error: authErr } = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Connection timed out.')), 10000)),
      ]) as any;

      if (authErr) throw authErr;
      if (!data?.user) throw new Error('Login failed. Please try again.');

      // ── CRITICAL SECURITY: capture userId before signing out ───────────────
      // Supabase issues a valid session token the moment signInWithPassword
      // succeeds. If the user refreshes during the 2FA prompt, ProtectedRoute
      // would see this active session and let them in — bypassing 2FA entirely.
      // We sign out immediately when 2FA is required, keep credentials in React
      // state only (never localStorage), and re-authenticate only after 2FA passes.
      const authenticatedUserId = data.user.id;

      // ── Server-side 2FA check (authoritative — reads directly from DB) ─────
      let hasTOTP = false;
      let hasWhatsApp = false;
      try {
        const mfaCheckRes = await fetch('/api/auth/check-mfa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: authenticatedUserId }),
        });
        if (mfaCheckRes.ok) {
          const mfaCheck = await mfaCheckRes.json();
          hasTOTP = mfaCheck.totp === true;
          hasWhatsApp = mfaCheck.whatsapp === true;
        }
      } catch { /* non-critical — fall through to finalizeLogin */ }

      // Fetch TOTP factorId BEFORE signing out — listFactors requires an active session
      let totpFactorId = '';
      if (hasTOTP) {
        try {
          const client = getSupabaseClient();
          const { data: mfaData } = await client.auth.mfa.listFactors();
          const verifiedFactors = (mfaData?.totp || []).filter((f: any) => f.status === 'verified');
          totpFactorId = verifiedFactors[0]?.id || '';
        } catch { /* continue */ }
      }

      // Sign out immediately if 2FA is required — prevents session-based bypass on page refresh
      if (hasTOTP || hasWhatsApp) {
        try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
        // Store credentials in React state only (not localStorage/sessionStorage)
        setPendingEmail(email);
        setPendingPassword(password);
      }

      if (hasTOTP && hasWhatsApp) {
        setFactorId(totpFactorId);
        setPendingUserId(authenticatedUserId);
        setAvailableMfa({ totp: true, whatsapp: true });
        setStep('mfa-choice');
        setIsLoading(false);
        return;
      }

      if (hasTOTP) {
        setFactorId(totpFactorId);
        setPendingUserId(authenticatedUserId);
        setStep('totp');
        setIsLoading(false);
        return;
      }

      if (hasWhatsApp) {
        // WhatsApp OTP — send the code
        const waRes = await fetch('/api/auth/whatsapp-otp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: authenticatedUserId }),
        });
        if (waRes.ok) {
          const waData = await waRes.json();
          setPendingUserId(authenticatedUserId);
          setWaMaskedPhone(waData.maskedPhone || '');
          setWaExpiresAt(waData.expiresAt || null);
          setWaResendCooldown(60);
          setStep('whatsapp-otp');
          setIsLoading(false);
          return;
        }
      }

      // No 2FA — finalize login
      await finalizeLogin(data.user);
    } catch (err: any) {
      let msg = err?.message || 'Authentication failed';
      if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network')) {
        msg = 'Cannot connect. Check your connection and try again.';
      }
      setError(msg);
      toast.error({ title: 'Login Failed', description: msg });
      setIsLoading(false);
      // Reset turnstile for next attempt (tokens are single-use)
      turnstileRef.current?.reset();
      setTurnstileToken('');
      // Requirement 15.2: record the failed login attempt.
      void auditActions.loginFailed(email, msg);
    }
  };

  // ── Step 2: verify TOTP ──────────────────────────────────────────────────────
  const handleTotpVerify = async () => {
    if (isLocked) return; // cooldown active — ignore
    if (totpCode.length !== 6) { setError('Enter the 6-digit code from your authenticator app.'); return; }
    setIsVerifying(true);
    setError('');
    try {
      if (!pendingEmail || !pendingPassword) {
        throw new Error('Session expired. Please sign in again.');
      }

      // Step 1: Re-authenticate to get a fresh Supabase session
      // (the session was signed out before the 2FA prompt to prevent bypass-on-refresh)
      const { data: reAuthData, error: reAuthErr } = await supabase.auth.signInWithPassword({
        email: pendingEmail,
        password: pendingPassword,
      });
      if (reAuthErr || !reAuthData?.user) throw new Error('Re-authentication failed. Please log in again.');

      // Step 2: Run the TOTP challenge+verify on the fresh session
      const client = getSupabaseClient();
      const { data: challenge, error: cErr } = await client.auth.mfa.challenge({ factorId });
      if (cErr) {
        // Sign out the re-authed session since 2FA didn't complete
        try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
        throw new Error(cErr.message);
      }
      const { error: vErr } = await client.auth.mfa.verify({ factorId, challengeId: challenge.id, code: totpCode });
      if (vErr) {
        // Sign out so next attempt starts fresh
        try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
        throw new Error('Invalid code. Please try again.');
      }

      // TOTP verified — clear stored credentials and proceed
      setPendingEmail('');
      setPendingPassword('');
      setFailedAttempts(0);
      setLockCount(0);
      setLockUntil(null);
      await finalizeLogin(reAuthData.user);
    } catch (err: any) {
      // A failed verification counts toward the progressive lockout.
      const nextFailed = failedAttempts + 1;
      setTotpCode('');
      autoSubmitRef.current = false;

      if (nextFailed >= ATTEMPTS_PER_LOCK) {
        // Trigger a cooldown that grows by LOCK_STEP_SECONDS each lock.
        const nextLockCount = lockCount + 1;
        const waitSeconds = nextLockCount * LOCK_STEP_SECONDS;
        setLockCount(nextLockCount);
        setFailedAttempts(0);
        setLockUntil(Date.now() + waitSeconds * 1000);
        const msg = `Too many incorrect codes. Please wait ${waitSeconds}s before trying again.`;
        setError(msg);
        toast.error({ title: 'Too Many Attempts', description: msg });
      } else {
        const remaining = ATTEMPTS_PER_LOCK - nextFailed;
        setFailedAttempts(nextFailed);
        const msg = `Incorrect code. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} left before a temporary lock.`;
        setError(msg);
        toast.error({ title: '2FA Failed', description: msg });
      }
    } finally {
      setIsVerifying(false);
    }
  };

  // ── Step 2b: verify WhatsApp OTP ────────────────────────────────────────────
  const handleWaOtpVerify = async () => {
    if (waOtp.length !== 6) { setError('Enter the 6-digit code from WhatsApp.'); return; }
    setIsVerifying(true);
    setError('');
    try {
      const res = await fetch('/api/auth/whatsapp-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: pendingUserId, otp: waOtp }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Verification failed.');
      // Re-authenticate with stored credentials — session was signed out pre-2FA
      if (pendingEmail && pendingPassword) {
        const { data: reAuthData, error: reAuthErr } = await supabase.auth.signInWithPassword({
          email: pendingEmail,
          password: pendingPassword,
        });
        if (reAuthErr || !reAuthData?.user) throw new Error('Re-authentication failed. Please log in again.');
        setPendingEmail('');
        setPendingPassword('');
        await finalizeLogin(reAuthData.user);
      } else {
        throw new Error('Session expired during 2FA. Please sign in again.');
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
      setWaOtp('');
      toast.error({ title: '2FA Failed', description: err.message });
    } finally {
      setIsVerifying(false);
    }
  };

  // Switch to WhatsApp OTP from the choice screen or from TOTP screen
  const switchToWhatsApp = async () => {
    setError('');
    setIsLoading(true);
    try {
      const waRes = await fetch('/api/auth/whatsapp-otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: pendingUserId }),
      });
      const waData = await waRes.json();
      if (!waRes.ok) throw new Error(waData.error || 'Failed to send WhatsApp code.');
      setWaMaskedPhone(waData.maskedPhone || '');
      setWaExpiresAt(waData.expiresAt || null);
      setWaResendCooldown(60);
      setWaOtp('');
      autoSubmitRef.current = false;
      setStep('whatsapp-otp');
    } catch (err: any) {
      setError(err.message || 'Failed to send code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleWaOtpResend = async () => {    if (waResendCooldown > 0) return;
    setError('');
    try {
      const res = await fetch('/api/auth/whatsapp-otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: pendingUserId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setWaResendCooldown(60);
      toast.success({ title: 'Code Resent', description: result.message });
    } catch (err: any) {
      toast.error({ title: 'Failed to resend', description: err.message });
    }
  };

  // ── Finalize: store state + redirect ─────────────────────────────────────────
  const finalizeLogin = async (user: any) => {
    // ── Session-fixation defense: rotate the session credentials ────────────────
    // Immediately after a successful authentication, exchange the tokens issued
    // at sign-in for a fresh access/refresh pair. This guarantees the active
    // session id is one minted *after* auth, so any token value an attacker may
    // have planted or observed pre-login (e.g. via a URL-borne session) is
    // invalidated and replaced. Non-fatal — a failed rotation must not block a
    // legitimate login.
    try {
      await getSupabaseClient().auth.refreshSession();
    } catch { /* non-critical — proceed with the existing session */ }

    let role: string | null = null;
    let roles: string[] = [];

    // 1. Check user_roles table
    try {
      const { data: userRoles, error: rolesErr } = await supabase
        .from('user_roles').select('role').eq('user_id', user.id);
      if (!rolesErr && userRoles && userRoles.length > 0) {
        roles = userRoles.map((r: any) => r.role) || [];
      }
    } catch { /* continue */ }

    // 2. Determine which portal(s) the user has access to
    const hasClientRole = roles.includes('client');
    const hasSupervisorRole = roles.includes('supervisor') || roles.includes('employee_portal');
    const erpRoles = roles.filter(r => !['client', 'employee_portal', 'supervisor'].includes(r));

    // ERP staff role takes top priority — pick highest-privilege role for redirect
    if (erpRoles.length > 0) {
      const ROLE_PRIORITY = ['admin', 'branch_admin', 'sales', 'hr', 'operations', 'accounts', 'office-admin', 'reports'];
      const topRole = ROLE_PRIORITY.find(r => erpRoles.includes(r)) ?? erpRoles[0];
      role = topRole;
    } else if (hasClientRole && hasSupervisorRole) {
      // User has both portals — redirect based on which login page they came from
      const isClientLogin = window.location.pathname.includes('client-login');
      role = isClientLogin ? 'client' : 'supervisor';
      if (role === 'client') localStorage.setItem('clientAuthenticated', 'true');
    } else if (hasSupervisorRole) {
      role = 'supervisor';
    } else if (hasClientRole) {
      role = 'client';
      localStorage.setItem('clientAuthenticated', 'true');
    }

    // 3. Fallback: check client_users / employee_users tables directly
    if (!role) {
      try {
        const client = getSupabaseClient();
        const { data: clientUser, error: clientErr } = await client
          .from('client_users')
          .select('id, status')
          .eq('auth_user_id', user.id)
          .single();

        if (!clientErr && clientUser) {
          if (clientUser.status !== 'active') {
            await client.auth.signOut();
            throw new Error('Your account has been suspended. Please contact support.');
          }
          role = 'client';
          localStorage.setItem('clientAuthenticated', 'true');
        }
      } catch (err: any) {
        if (err.message?.includes('suspended')) throw err;
      }
    }

    if (!role) {
      try {
        const client = getSupabaseClient();
        const { data: empUser, error: empErr } = await client
          .from('employee_users')
          .select('id, status')
          .eq('auth_user_id', user.id)
          .single();

        if (!empErr && empUser) {
          if (empUser.status !== 'active') {
            await client.auth.signOut();
            throw new Error('Your account has been suspended. Please contact support.');
          }
          role = 'supervisor';
        }
      } catch (err: any) {
        if (err.message?.includes('suspended')) throw err;
      }
    }

    // 4. If still no role, deny access
    if (!role) {
      const client = getSupabaseClient();
      await client.auth.signOut();
      // Requirement 15.2: record the authorization-denied event.
      void auditActions.authDenied(user.email || '', 'ERP', 'No role assigned');
      throw new Error('Access denied. No role assigned. Contact administrator.');
    }

    // ── Portal boundary enforcement ─────────────────────────────────────────────
    // Each subdomain acts as a separate login. If the user's role doesn't belong
    // to the portal they're on, reject with a generic "wrong credentials" message
    // (don't reveal what portal they actually belong to).
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    const currentSubdomain = host.endsWith(`.${ROOT_DOMAIN_LOGIN}`)
      ? host.slice(0, -(ROOT_DOMAIN_LOGIN.length + 1))
      : null;

    const isSupervisorRole = role === 'supervisor' || role === 'employee_portal';
    const isClientRole = role === 'client';
    const isErpRole = !isSupervisorRole && !isClientRole;

    let portalMismatch = false;
    if (currentSubdomain === 'ops' && !isSupervisorRole) portalMismatch = true;
    if (currentSubdomain === 'office' && !isErpRole) portalMismatch = true;
    if (currentSubdomain === 'client' && !isClientRole) portalMismatch = true;

    if (portalMismatch) {
      const client = getSupabaseClient();
      await client.auth.signOut();
      throw new Error('Invalid email or password.');
    }

    localStorage.setItem('userRole', role);
    localStorage.setItem('userRoles', roles.join(','));  // all roles for sidebar/permissions
    localStorage.setItem('userEmail', user.email || '');
    localStorage.setItem('isAuthenticated', 'true');

    // Fetch user profile (name, photo) from users table
    try {
      const client = getSupabaseClient();
      const { data: profile } = await client.from('users').select('name, photo_url').eq('id', user.id).single();
      // Try to get name from users table, then employee_users, then user metadata, then email
      let resolvedUserName = profile?.name;
      if (!resolvedUserName) {
        // Check employee_users table (supervisor/employee portal users)
        const { data: empUser } = await client.from('employee_users').select('name').eq('auth_user_id', user.id).maybeSingle();
        resolvedUserName = empUser?.name;
      }
      localStorage.setItem('userName', resolvedUserName || user.user_metadata?.name || user.email || 'User');
      if (profile?.photo_url) localStorage.setItem('userPhotoURL', profile.photo_url);
    } catch {
      localStorage.setItem('userName', user.user_metadata?.name || user.email?.split('@')[0] || 'User');
    }

    // ── Device limit check: if user already has MAX sessions, show info step ───
    // Check how many sessions the user currently has before claiming a new one.
    let sessionCount = 0;
    let userSessions: any[] = [];
    const maxAllowed = getMaxSessions(role);
    try {
      // Drop ghost rows (closed tabs, crashed browsers, previous logouts that
      // failed to release) before counting. Without this the user is blocked
      // by their own dead sessions and the screen lists devices that are no
      // longer signed in anywhere.
      await pruneStaleSessions(user.id);

      const client = getSupabaseClient();
      const { data: sessions } = await client
        .from('user_sessions')
        .select('id, device_info, location, last_active, ip_address')
        .eq('user_id', user.id)
        .order('last_active', { ascending: false });
      userSessions = sessions || [];
      sessionCount = userSessions.length;
    } catch { /* non-critical — proceed with login */ }

    // If at device limit, show the info step (unless user already confirmed)
    if (sessionCount >= maxAllowed && !pendingUser) {
      // Store the user data and show device-limit step
      setPendingUser(user);
      setExistingSessions(userSessions);
      setStep('device-limit');
      setIsLoading(false);
      return;
    }

    // Claim session — enforces the role's device cap; least-recently-active
    // session is evicted if the limit is already reached. `maxAllowed` is
    // passed explicitly because the server default (2) would silently over-
    // allow the 1-device roles (supervisor / client).
    await claimSession(user.id, maxAllowed);

    // Update last_active timestamp for the user
    try {
      const client = getSupabaseClient();
      await client.from('users').update({ last_active: new Date().toISOString() }).eq('id', user.id);
    } catch { /* non-critical — don't block login */ }

    // Requirement 15.1/15.2: record the successful login event.
    // Use the resolved name from localStorage (set above after profile fetch)
    const resolvedName = localStorage.getItem('userName') || user.email || 'User';
    void auditActions.userLogin(resolvedName, user.email || '');

    // Show transition overlay and redirect
    document.body.innerHTML = '<div style="position:fixed;inset:0;background:#0B0F19;display:flex;align-items:center;justify-content:center;z-index:99999"><div style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.1);border-top-color:#D71920;border-radius:50%;animation:spin 0.8s linear infinite"></div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
    window.location.href = getPortalAwareRedirectUrl(role);
    // Don't call onClose — the page is navigating away. Show nothing during transition.
  };

  // ── Device limit: proceed handler ───────────────────────────────────────────
  const handleDeviceLimitProceed = async () => {
    if (!pendingUser) return;
    setIsLoading(true);
    setError('');
    try {
      // User confirmed — claim the session. This evicts the least-recently-
      // active row, which is what signs the other device out. The role cap is
      // passed explicitly so 1-device roles actually evict (the server default
      // of 2 would leave the other device signed in).
      await claimSession(pendingUser.id, getMaxSessions(localStorage.getItem('userRole')));

      // Update last_active
      try {
        const client = getSupabaseClient();
        await client.from('users').update({ last_active: new Date().toISOString() }).eq('id', pendingUser.id);
      } catch { /* non-critical */ }

      // Audit log
      const resolvedName = localStorage.getItem('userName') || pendingUser.email || 'User';
      void auditActions.userLogin(resolvedName, pendingUser.email || '');

      document.body.innerHTML = '<div style="position:fixed;inset:0;background:#0B0F19;display:flex;align-items:center;justify-content:center;z-index:99999"><div style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.1);border-top-color:#D71920;border-radius:50%;animation:spin 0.8s linear infinite"></div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
      window.location.href = getPortalAwareRedirectUrl(localStorage.getItem('userRole'));
    } catch (err: any) {
      setError(err?.message || 'Failed to complete sign-in');
      setIsLoading(false);
    }
  };

  const handleDeviceLimitCancel = async () => {
    // User cancelled — sign out and go back to login
    try {
      const client = getSupabaseClient();
      await client.auth.signOut();
    } catch {}
    setPendingUser(null);
    setExistingSessions([]);
    setStep('password');
    setError('');
    setIsLoading(false);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Forgot password screen ──────────────────────────────────────────────────
  if (step === 'forgot') {
    const handleResetSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim()) {
        setError('Please enter your email address.');
        return;
      }
      if (!turnstileToken) {
        setError('Please complete the verification check.');
        return;
      }
      setIsLoading(true);
      setError('');
      try {
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
        });
        if (resetErr) throw resetErr;
        setResetSent(true);
        toast.success({
          title: 'Reset link sent',
          description: 'Check your email for the password reset link.',
        });
      } catch (err: any) {
        // Don't reveal whether email exists or not (security)
        setResetSent(true);
      } finally {
        setIsLoading(false);
        turnstileRef.current?.reset();
        setTurnstileToken('');
      }
    };

    return (
      <div className="w-full">
        <button
          type="button"
          className="flex items-center gap-1.5 text-safend-muted hover:text-safend-ink text-[13px] mb-6 transition-colors"
          onClick={() => { setStep('password'); setError(''); setResetSent(false); }}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </button>

        {resetSent ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-green-50 border border-green-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="font-display font-bold text-[20px] text-safend-ink mb-2">Check your email</h2>
            <p className="text-[14px] font-body text-safend-slate-grey leading-[1.6] mb-6">
              If an account exists for <span className="font-medium text-safend-ink">{email}</span>, you&apos;ll receive a password reset link shortly.
            </p>
            <Button
              type="button"
              onClick={() => { setStep('password'); setResetSent(false); setError(''); }}
              className="w-full h-[48px] rounded-[10px] bg-safend-ink hover:bg-safend-ink/90 text-white font-heading font-semibold text-[14px] transition-all"
            >
              Back to sign in
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="font-display font-bold text-[20px] text-safend-ink mb-1">Reset your password</h2>
              <p className="text-[13px] font-body text-safend-slate-grey leading-normal">
                Enter your email and we&apos;ll send you a link to reset your password.
              </p>
            </div>

            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reset-email" className="text-[13px] font-body font-medium text-safend-ink">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="you@safend.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  autoFocus
                  className="h-[48px] rounded-[10px] bg-transparent border-safend-mist text-safend-ink text-[14px] placeholder:text-safend-ink/30 focus:border-safend-red/40 focus:ring-2 focus:ring-safend-red/10 transition-all"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 text-[13px] text-red-700 bg-red-50 p-3 rounded-[10px] border border-red-100">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
                  <span className="font-body leading-[1.4]">{error}</span>
                </div>
              )}

              {/* Cloudflare Turnstile */}
              <TurnstileWidget
                ref={turnstileRef}
                onVerify={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken('')}
                size="flexible"
                className="mt-1"
              />

              <Button
                type="submit"
                disabled={isLoading || !turnstileToken}
                className="w-full h-[48px] rounded-[10px] bg-safend-red hover:bg-[#b8151b] text-white font-heading font-semibold text-[14px] tracking-[0.01em] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading
                  ? <div className="flex items-center gap-2"><UnifiedLoader variant="button" size="sm" />Sending…</div>
                  : 'Send reset link'}
              </Button>
            </form>
          </>
        )}
      </div>
    );
  }

  // ── Step 3: Device limit screen ─────────────────────────────────────────────
  if (step === 'device-limit') {
    return (
      <div className="w-full">
        <div className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight text-safend-ink">Device Limit</h1>
          <p className="text-sm text-safend-muted mt-1.5">
            Max {getMaxSessions(localStorage.getItem('userRole'))} device{getMaxSessions(localStorage.getItem('userRole')) === 1 ? '' : 's'} allowed per account
          </p>
        </div>
        <DeviceLimitInfo
          sessions={existingSessions}
          maxSessions={getMaxSessions(localStorage.getItem('userRole'))}
          userId={pendingUser?.id}
          onProceed={handleDeviceLimitProceed}
          onCancel={handleDeviceLimitCancel}
          onSessionRemoved={async () => {
            // Refresh session list after removal
            if (!pendingUser) return;
            try {
              const client = getSupabaseClient();
              const { data: sessions } = await client
                .from('user_sessions')
                .select('id, device_info, location, last_active, ip_address')
                .eq('user_id', pendingUser.id)
                .order('last_active', { ascending: false });
              const updated = sessions || [];
              setExistingSessions(updated);
              // If now below limit, auto-proceed
              if (updated.length < getMaxSessions(localStorage.getItem('userRole'))) {
                handleDeviceLimitProceed();
              }
            } catch {}
          }}
          isLoading={isLoading}
        />
      </div>
    );
  }

  // ── Step 2: MFA method choice (shown when both TOTP and WhatsApp are enabled) ─
  if (step === 'mfa-choice') {
    return (
      <div className="w-full">
        <button
          type="button"
          className="flex items-center gap-1.5 text-safend-muted hover:text-safend-ink text-sm mb-7 transition-colors"
          onClick={() => { setStep('password'); setError(''); autoSubmitRef.current = false; }}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>

        <div className="mb-7">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-6 w-6 text-[#D71920]" />
            <h1 className="text-2xl font-bold tracking-tight text-safend-ink">Two-Factor Auth</h1>
          </div>
          <p className="text-sm text-safend-muted">Choose how you want to verify your identity.</p>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-[13px] text-red-700 bg-red-50 p-3 rounded-[10px] border border-red-100 mb-4">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3">
          {/* Authenticator App */}
          <button
            type="button"
            onClick={() => { setError(''); setStep('totp'); }}
            className="w-full flex items-center gap-4 p-4 rounded-[14px] border border-safend-mist hover:border-safend-red/40 hover:bg-safend-red/3 transition-all duration-200 group text-left"
          >
            <span className="w-11 h-11 rounded-[10px] bg-[#D71920]/10 flex items-center justify-center shrink-0 group-hover:bg-[#D71920]/15 transition-colors">
              <ShieldCheck className="h-5 w-5 text-[#D71920]" />
            </span>
            <div className="flex-1">
              <p className="text-[14px] font-heading font-semibold text-safend-ink leading-tight">Authenticator App</p>
              <p className="text-[12px] font-body text-safend-muted mt-0.5">Use Google Authenticator, Authy, etc.</p>
            </div>
            <svg className="w-4 h-4 text-safend-muted group-hover:text-safend-red transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* WhatsApp OTP */}
          <button
            type="button"
            onClick={switchToWhatsApp}
            disabled={isLoading}
            className="w-full flex items-center gap-4 p-4 rounded-[14px] border border-safend-mist hover:border-[#25D366]/50 hover:bg-[#25D366]/3 transition-all duration-200 group text-left disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span className="w-11 h-11 rounded-[10px] bg-[#25D366]/10 flex items-center justify-center shrink-0 group-hover:bg-[#25D366]/15 transition-colors">
              {isLoading
                ? <UnifiedLoader variant="button" size="sm" />
                : <svg className="h-5 w-5 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              }
            </span>
            <div className="flex-1">
              <p className="text-[14px] font-heading font-semibold text-safend-ink leading-tight">WhatsApp OTP</p>
              <p className="text-[12px] font-body text-safend-muted mt-0.5">Receive a one-time code on WhatsApp</p>
            </div>
            <svg className="w-4 h-4 text-safend-muted group-hover:text-[#25D366] transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2b: WhatsApp OTP screen ────────────────────────────────────────────
  if (step === 'whatsapp-otp') {
    return (
      <div className="w-full">
        <button
          type="button"
          className="flex items-center gap-1.5 text-safend-muted hover:text-safend-ink text-sm mb-7 transition-colors"
          onClick={() => {
            setStep('password');
            setError('');
            setWaOtp('');
            autoSubmitRef.current = false;
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>

        <div className="mb-7">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-6 w-6 text-[#25D366]" />
            <h1 className="text-2xl font-bold tracking-tight text-safend-ink">WhatsApp 2FA</h1>
          </div>
          <p className="text-sm text-safend-muted">
            A 6-digit code was sent to your WhatsApp
            {waMaskedPhone ? ` ending in ${waMaskedPhone.slice(-4)}` : ''}.
          </p>
        </div>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-safend-muted uppercase tracking-wider">WhatsApp Code</Label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000 000"
              value={waOtp}
              onChange={e => setWaOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && handleWaOtpVerify()}
              disabled={isVerifying}
              autoFocus
              className="w-full h-[48px] rounded-[10px] bg-transparent border border-safend-mist text-safend-ink text-center text-2xl tracking-[0.5em] placeholder:text-safend-ink/30 focus:border-[#25D366]/50 focus:ring-2 focus:ring-[#25D366]/10 transition-all font-mono disabled:opacity-50 outline-hidden px-4"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-[13px] text-red-700 bg-red-50 p-3 rounded-[10px] border border-red-100">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          <Button
            onClick={handleWaOtpVerify}
            disabled={isVerifying || waOtp.length !== 6}
            className="w-full h-[48px] rounded-[10px] bg-[#25D366] hover:bg-[#1da851] text-white font-heading font-semibold text-[14px] tracking-[0.01em] transition-all disabled:opacity-50"
          >
            {isVerifying ? (
              <div className="flex items-center gap-2"><UnifiedLoader variant="button" size="sm" />Verifying…</div>
            ) : 'Verify & Sign In'}
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={handleWaOtpResend}
              disabled={waResendCooldown > 0}
              className="text-xs text-safend-muted hover:text-safend-ink transition-colors disabled:cursor-not-allowed"
            >
              {waResendCooldown > 0
                ? `Resend in ${waResendCooldown}s`
                : "Didn't receive it? Resend code"}
            </button>
          </div>

          {/* Switch method — only shown when both are available */}
          {availableMfa.totp && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => { setStep('totp'); setError(''); setWaOtp(''); autoSubmitRef.current = false; }}
                className="text-xs text-safend-muted hover:text-safend-ink transition-colors"
              >
                Use Authenticator App instead
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Step 2: TOTP screen ──────────────────────────────────────────────────────
  if (step === 'totp') {
    return (
      <div className="w-full">
        <button
          type="button"
          className="flex items-center gap-1.5 text-safend-muted hover:text-safend-ink text-sm mb-7 transition-colors"
          onClick={() => {
            setStep('password');
            setError('');
            setTotpCode('');
            setFailedAttempts(0);
            setLockCount(0);
            setLockUntil(null);
            autoSubmitRef.current = false;
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>

        <div className="mb-7">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-6 w-6 text-[#D71920]" />
            <h1 className="text-2xl font-bold tracking-tight text-safend-ink">Two-Factor Auth</h1>
          </div>
          <p className="text-sm text-safend-muted">Open your authenticator app and enter the 6-digit code.</p>
        </div>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-safend-muted uppercase tracking-wider">Authentication Code</Label>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000 000"
              value={totpCode}
              onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && handleTotpVerify()}
              disabled={isVerifying || isLocked}
              autoFocus
              className="h-14 rounded-xl bg-transparent border-safend-mist text-safend-ink text-center text-2xl tracking-[0.5em] placeholder:text-safend-ink/30 focus:border-[#D71920]/40 focus:ring-2 focus:ring-[#D71920]/10 transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-[13px] text-red-700 bg-red-50 p-3 rounded-[10px] border border-red-100">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {isLocked && (
            <div className="flex items-center justify-center gap-2 text-sm text-amber-700 bg-amber-50 p-3 rounded-[10px] border border-amber-200">
              <span className="font-mono text-lg tabular-nums">{secondsLeft}s</span>
              <span className="text-amber-600">until you can retry</span>
            </div>
          )}

          <Button
            onClick={handleTotpVerify}
            disabled={isVerifying || isLocked || totpCode.length !== 6}
            className="w-full h-[48px] rounded-[10px] bg-safend-red hover:bg-[#b8151b] text-white font-heading font-semibold text-[14px] tracking-[0.01em] transition-all disabled:opacity-50"
          >
            {isVerifying ? (
              <div className="flex items-center gap-2"><UnifiedLoader variant="button" size="sm" />Verifying…</div>
            ) : isLocked ? (
              `Locked — wait ${secondsLeft}s`
            ) : 'Verify & Sign In'}
          </Button>

          {/* Switch method — only shown when both are available */}
          {availableMfa.whatsapp && (
            <div className="text-center">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => { setError(''); setTotpCode(''); autoSubmitRef.current = false; switchToWhatsApp(); }}
                className="text-xs text-safend-muted hover:text-safend-ink transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Sending…' : 'Use WhatsApp OTP instead'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Step 1: Password screen ───────────────────────────────────────────────────
  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-[13px] font-body font-medium text-safend-ink">Email</Label>
          <Input
            id="email" type="email" placeholder="you@safend.com"
            value={email} onChange={e => setEmail(e.target.value)}
            required disabled={isLoading}
            className="h-[48px] rounded-[10px] bg-transparent border-safend-mist text-safend-ink text-[14px] placeholder:text-safend-ink/30 focus:border-safend-red/40 focus:ring-2 focus:ring-safend-red/10 transition-all"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-[13px] font-body font-medium text-safend-ink">Password</Label>
            <button type="button" onClick={() => { setStep('forgot'); setError(''); }} className="text-[11px] font-medium text-safend-red hover:text-safend-red/80 transition-colors">Forgot?</button>
          </div>
          <div className="relative">
            <Input
              id="password" type={showPassword ? 'text' : 'password'} placeholder="Enter password"
              value={password} onChange={e => setPassword(e.target.value)}
              required disabled={isLoading}
              className="h-[48px] rounded-[10px] pr-11 bg-transparent border-safend-mist text-safend-ink text-[14px] placeholder:text-safend-ink/30 focus:border-safend-red/40 focus:ring-2 focus:ring-safend-red/10 transition-all"
            />
            <button type="button" tabIndex={-1} disabled={isLoading}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-[8px] text-safend-muted hover:text-safend-ink transition-colors"
              onClick={() => setShowPassword(v => !v)}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Cloudflare Turnstile */}
        <TurnstileWidget
          ref={turnstileRef}
          onVerify={(token) => setTurnstileToken(token)}
          onExpire={() => setTurnstileToken('')}
          size="flexible"
          className="mt-1"
        />

        {error && (
          <div className="flex items-start gap-2 text-[13px] text-red-700 bg-red-50 p-3 rounded-[10px] border border-red-100">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" /><span className="font-body leading-[1.4]">{error}</span>
          </div>
        )}

        <Button type="submit" disabled={isLoading || !turnstileToken}
          className="w-full h-[48px] rounded-[10px] bg-safend-red hover:bg-[#b8151b] text-white font-heading font-semibold text-[14px] tracking-[0.01em] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
          {isLoading
            ? <div className="flex items-center gap-2"><UnifiedLoader variant="button" size="sm" />Signing in…</div>
            : 'Sign in'}
        </Button>
      </form>

      {/* Biometric login — only shows if user has registered fingerprint on this device */}
      <BiometricLoginButton
        onError={(msg) => { setError(msg); toast.error({ title: 'Biometric Login Failed', description: msg }); }}
      />

      {/* QR Attendance Scanner — mobile/tablet only, supervisor login only */}
      {showQrScanner && (
      <div className="lg:hidden mt-6 pt-5 border-t border-safend-mist">
        <button
          type="button"
          onClick={() => setShowScanner(true)}
          className="w-full flex items-center gap-4 p-4 rounded-[14px] bg-safend-light-grey border border-safend-mist/60 hover:border-safend-red/30 hover:bg-safend-red/3 transition-all duration-200 group"
        >
          <span className="w-11 h-11 rounded-[10px] bg-safend-red/10 flex items-center justify-center shrink-0 group-hover:bg-safend-red/15 transition-colors">
            <svg className="w-5 h-5 text-safend-red" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2M8 7h2v2H8zM14 7h2v2h-2zM8 13h2v2H8zM14 13h2v2h-2z" />
            </svg>
          </span>
          <div className="flex-1 text-left">
            <p className="text-[14px] font-heading font-semibold text-safend-ink leading-tight">
              Quick Attendance Scanner
            </p>
            <p className="text-[12px] font-body text-safend-muted mt-0.5">
              Scan QR code to mark attendance
            </p>
          </div>
          <svg className="w-4 h-4 text-safend-muted group-hover:text-safend-red transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      )}

      {/* Public QR attendance scanner overlay — opens without authentication (R1.1) */}
      {showScanner && (
        <QuickAttendanceScanner onClose={() => setShowScanner(false)} />
      )}
    </div>
  );
}
