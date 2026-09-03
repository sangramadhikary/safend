'use client';

import { useState, useEffect } from 'react';
import { Fingerprint, X, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UnifiedLoader } from '@/components/ui/unified-loader';
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  hasStoredCredential,
  registerCredential,
  storeCredentialLocally,
  type RegistrationOptions,
} from '@/lib/auth/webauthn';
import { getSupabaseClient } from '@/integrations/supabase/client';

interface BiometricRegistrationProps {
  /** Called after registration completes (success or dismiss) */
  onComplete?: () => void;
}

/**
 * Biometric registration prompt — shown to supervisors/employees after login
 * when they haven't registered a fingerprint/face credential on this device yet.
 *
 * Only appears when:
 * 1. WebAuthn is supported
 * 2. Platform authenticator (fingerprint/face) is available
 * 3. No credential is stored for this device
 * 4. User hasn't dismissed the prompt recently (7 day cooldown)
 */
export function BiometricRegistration({ onComplete }: BiometricRegistrationProps) {
  const [show, setShow] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function checkEligibility() {
      // Don't show on desktop — only mobile and tablet
      if (typeof window !== 'undefined') {
        const isMobileOrTablet = /Android|iPhone|iPad|iPod|tablet|playbook|silk/i.test(navigator.userAgent) ||
          (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent)); // iPad with desktop UA
        if (!isMobileOrTablet) return;
      }

      // Don't show if already registered on this device
      if (hasStoredCredential()) return;

      // Don't show if user dismissed recently
      const dismissed = localStorage.getItem('webauthn_prompt_dismissed');
      if (dismissed) {
        const dismissedAt = parseInt(dismissed, 10);
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - dismissedAt < sevenDays) return;
      }

      // Check browser support
      if (!isWebAuthnSupported()) return;
      const platformAvailable = await isPlatformAuthenticatorAvailable();
      if (!platformAvailable) return;

      // Only show for supervisor/employee roles
      const role = localStorage.getItem('userRole');
      if (!role || !['supervisor', 'employee_portal'].includes(role)) return;

      // Small delay so it doesn't appear immediately on page load
      setTimeout(() => setShow(true), 3000);
    }

    checkEligibility();
  }, []);

  if (!show) return null;

  const handleDismiss = () => {
    localStorage.setItem('webauthn_prompt_dismissed', Date.now().toString());
    setShow(false);
    onComplete?.();
  };

  const handleRegister = async () => {
    setIsRegistering(true);
    setError('');

    try {
      const client = getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Session expired. Please log in again.');
      }

      // Phase 1: Get registration options from server
      const challengeRes = await fetch('/api/auth/webauthn/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ phase: 'challenge' }),
      });

      if (!challengeRes.ok) {
        const err = await challengeRes.json();
        throw new Error(err.error || 'Failed to start registration.');
      }

      const options: RegistrationOptions = await challengeRes.json();

      // Phase 2: Create credential (triggers fingerprint scanner)
      const result = await registerCredential(options);

      // Phase 3: Send to server for verification and storage
      const verifyRes = await fetch('/api/auth/webauthn/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          phase: 'verify',
          ...result,
          deviceName: getDeviceDescription(),
        }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || 'Failed to complete registration.');
      }

      // Store credential ID locally for future logins
      const email = localStorage.getItem('userEmail') || session.user?.email || '';
      storeCredentialLocally(result.credentialId, email);

      setSuccess(true);
      // Auto-dismiss after 3 seconds
      setTimeout(() => {
        setShow(false);
        onComplete?.();
      }, 3000);
    } catch (err: any) {
      const msg = err?.message || 'Registration failed.';
      // User cancelled — just dismiss
      if (msg.includes('cancelled') || msg.includes('AbortError') || msg.includes('NotAllowedError')) {
        handleDismiss();
        return;
      }
      setError(msg);
    } finally {
      setIsRegistering(false);
    }
  };

  if (success) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm animate-in slide-in-from-bottom-4 duration-300">
        <div className="rounded-2xl bg-green-900/90 backdrop-blur-xl border border-green-500/30 p-4 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="shrink-0 w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <Shield className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-100">Fingerprint Registered!</p>
              <p className="text-xs text-green-300/70 mt-0.5">Next time, sign in instantly with your fingerprint.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm animate-in slide-in-from-bottom-4 duration-300">
      <div className="rounded-2xl bg-[#1a1d2e]/95 backdrop-blur-xl border border-white/10 p-5 shadow-2xl">
        {/* Close button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-white/30 hover:text-white/60 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 mb-4">
          <div className="shrink-0 w-10 h-10 rounded-full bg-[#D71920]/10 flex items-center justify-center">
            <Fingerprint className="h-5 w-5 text-[#D71920]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Enable Biometric Login</p>
            <p className="text-xs text-white/50 mt-1 leading-relaxed">
              Sign in faster next time using fingerprint or face recognition. No password needed.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-3 text-xs text-red-300 bg-red-500/10 p-2 rounded-lg border border-red-500/20">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            disabled={isRegistering}
            className="flex-1 h-9 text-white/50 hover:text-white/80 hover:bg-white/5 rounded-lg text-xs"
          >
            Not Now
          </Button>
          <Button
            size="sm"
            onClick={handleRegister}
            disabled={isRegistering}
            className="flex-1 h-9 bg-[#D71920] hover:bg-[#b8151b] text-white rounded-lg text-xs font-semibold shadow-lg shadow-[#D71920]/20"
          >
            {isRegistering ? (
              <div className="flex items-center gap-1.5">
                <UnifiedLoader variant="button" size="sm" />
                <span>Scanning…</span>
              </div>
            ) : (
              'Set Up'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function getDeviceDescription(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) {
    const match = ua.match(/;\s*([^;)]+)\s*Build/);
    return match ? match[1].trim() : 'Android Device';
  }
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Mac/i.test(ua)) return 'Mac';
  return 'Mobile Device';
}
