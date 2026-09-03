'use client';

import { useState, useEffect } from 'react';
import { Fingerprint } from 'lucide-react';
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  hasStoredCredential,
  getStoredBiometricEmail,
  authenticateCredential,
  type AuthenticationOptions,
} from '@/lib/auth/webauthn';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { claimSession, getMaxSessions } from '@/utils/sessionManager';
import { auditActions } from '@/utils/auditLog';

interface BiometricLoginButtonProps {
  onSuccess?: () => void;
  onError?: (message: string) => void;
}

/**
 * "Login with Fingerprint" button shown on the login page
 * when the user has previously registered a biometric credential on this device.
 */
export function BiometricLoginButton({ onSuccess, onError }: BiometricLoginButtonProps) {
  const [available, setAvailable] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    // Only show if: mobile/tablet + WebAuthn supported + platform auth available + credential stored
    async function check() {
      // Skip desktop devices
      const isMobileOrTablet = /Android|iPhone|iPad|iPod|tablet|playbook|silk/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent));
      if (!isMobileOrTablet) return;

      if (!isWebAuthnSupported()) return;
      if (!hasStoredCredential()) return;
      const platformAvailable = await isPlatformAuthenticatorAvailable();
      if (platformAvailable) setAvailable(true);
    }
    check();
  }, []);

  if (!available) return null;

  const handleBiometricLogin = async () => {
    setIsAuthenticating(true);

    try {
      const credentialId = localStorage.getItem('webauthn_credential_id');
      const email = getStoredBiometricEmail();

      if (!credentialId) {
        throw new Error('No stored credential found.');
      }

      // Phase 1: Get challenge from server
      const challengeRes = await fetch('/api/auth/webauthn/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'challenge', credentialId }),
      });

      if (!challengeRes.ok) {
        const err = await challengeRes.json();
        throw new Error(err.error || 'Failed to get challenge.');
      }

      const challengeData = await challengeRes.json();

      // Phase 2: Trigger biometric (fingerprint/face)
      const authOptions: AuthenticationOptions = {
        challenge: challengeData.challenge,
        rpId: challengeData.rpId,
        allowCredentials: challengeData.allowCredentials,
      };

      const assertion = await authenticateCredential(authOptions);

      // Phase 3: Verify with server
      const verifyRes = await fetch('/api/auth/webauthn/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: 'verify',
          sessionKey: challengeData.sessionKey,
          ...assertion,
        }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || 'Biometric verification failed.');
      }

      const result = await verifyRes.json();

      // Try to establish a proper Supabase session via OTP if token is available
      if (result.token?.otp_token) {
        const client = getSupabaseClient();
        try {
          await client.auth.verifyOtp({
            email: result.token.email,
            token: result.token.otp_token,
            type: 'magiclink',
          });
        } catch {
          // If OTP fails, we still trust the biometric — proceed with local session
          console.warn('Biometric login: OTP session failed, using verified identity');
        }
      }

      // Store user session info
      const { user: userData } = result;
      localStorage.setItem('userRole', userData.role);
      localStorage.setItem('userEmail', userData.email || '');
      localStorage.setItem('userName', userData.name || '');
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('userId', userData.id);

      // Claim session — pass the role cap explicitly so 1-device roles
      // (supervisor / client) actually evict the other device.
      await claimSession(userData.id, getMaxSessions(userData.role));

      // Set session cookie
      try {
        const sessionToken = localStorage.getItem('session_token');
        if (sessionToken) {
          await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionToken,
              userId: userData.id,
              role: userData.role,
            }),
          });
        }
      } catch { /* non-critical */ }

      // Audit log
      void auditActions.userLogin(userData.name, userData.email);

      // Show transition and redirect
      document.body.innerHTML = '<div style="position:fixed;inset:0;background:#0B0F19;display:flex;align-items:center;justify-content:center;z-index:99999"><div style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.1);border-top-color:#D71920;border-radius:50%;animation:spin 0.8s linear infinite"></div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';

      const redirectPath = userData.role === 'client' ? '/client-portal' : '/supervisor-portal';
      window.location.href = redirectPath;

      onSuccess?.();
    } catch (err: any) {
      const msg = err?.message || 'Biometric login failed.';
      // Don't show error for user cancellation
      if (msg.includes('cancelled') || msg.includes('AbortError') || msg.includes('NotAllowedError')) {
        setIsAuthenticating(false);
        return;
      }
      onError?.(msg);
      setIsAuthenticating(false);
    }
  };

  const storedEmail = getStoredBiometricEmail();

  return (
    <div className="w-full space-y-4 mt-4">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-safend-mist" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-3 text-safend-muted font-body">or sign in faster</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleBiometricLogin}
        disabled={isAuthenticating}
        className="w-full flex items-center gap-4 p-4 rounded-[14px] bg-safend-light-grey border border-safend-mist/60 hover:border-safend-red/30 hover:bg-safend-red/3 transition-all duration-200 group disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className="w-11 h-11 rounded-[10px] bg-safend-red/10 flex items-center justify-center shrink-0 group-hover:bg-safend-red/15 transition-colors">
          {isAuthenticating ? (
            <div className="w-5 h-5 border-2 border-safend-red/30 border-t-safend-red rounded-full animate-spin" />
          ) : (
            <Fingerprint className="h-5 w-5 text-safend-red" />
          )}
        </span>
        <div className="flex flex-col items-start text-left">
          <span className="text-[14px] font-heading font-semibold text-safend-ink leading-tight">
            {isAuthenticating ? 'Verifying…' : 'Sign in with Biometrics'}
          </span>
          {storedEmail && (
            <span className="text-[11px] font-body text-safend-muted mt-0.5">{storedEmail}</span>
          )}
        </div>
      </button>
    </div>
  );
}
