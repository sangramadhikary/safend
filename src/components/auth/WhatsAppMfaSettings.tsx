'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ShieldCheck, Smartphone, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * WhatsAppMfaSettings — self-service component for enabling/disabling
 * WhatsApp OTP 2FA. Embed in the user profile / security settings page.
 *
 * Flow:
 *   1. User enters phone number → save action sends verification OTP
 *   2. User enters OTP → verify action enables 2FA
 *   3. Disable button → disables 2FA (keeps phone saved)
 */
export function WhatsAppMfaSettings() {
  const { toast } = useToast();

  const [status, setStatus] = useState<{ enabled: boolean; phone: string | null; hasPhone: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [phase, setPhase] = useState<'idle' | 'enter-phone' | 'enter-otp' | 'saving'>('idle');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState('');

  // Load current MFA status
  useEffect(() => {
    loadStatus();
  }, []);

  // Resend cooldown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const authHeaders = async () => {
    const { data } = await supabase.auth.getSession();
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` };
  };

  const loadStatus = async () => {
    setIsLoading(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/auth/whatsapp-otp/enroll', { headers });
      if (res.ok) setStatus(await res.json());
    } catch { /* silent */ } finally {
      setIsLoading(false);
    }
  };

  const handleSavePhone = async () => {
    const normalized = phone.replace(/\D/g, '');
    if (normalized.length < 10) {
      setError('Enter a valid phone number with country code (e.g. 919876543210)');
      return;
    }
    setPhase('saving');
    setError('');
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/auth/whatsapp-otp/enroll', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'save', phone: normalized }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setPhase('enter-otp');
      setResendCooldown(60);
      toast({ title: 'Code Sent', description: result.message });
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code.');
      setPhase('enter-phone');
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { setError('Enter the 6-digit code.'); return; }
    setPhase('saving');
    setError('');
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/auth/whatsapp-otp/enroll', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'verify', otp }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      toast({ title: '2FA Enabled', description: 'WhatsApp 2FA is now active on your account.' });
      setPhase('idle');
      setOtp('');
      setPhone('');
      await loadStatus();
    } catch (err: any) {
      setError(err.message || 'Incorrect code.');
      setOtp('');
      setPhase('enter-otp');
    }
  };

  const handleDisable = async () => {
    setPhase('saving');
    try {
      const headers = await authHeaders();
      await fetch('/api/auth/whatsapp-otp/enroll', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'disable' }),
      });
      toast({ title: '2FA Disabled', description: 'WhatsApp 2FA has been turned off.' });
      setPhase('idle');
      await loadStatus();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setPhase('idle');
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    const normalized = phone.replace(/\D/g, '');
    setError('');
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/auth/whatsapp-otp/enroll', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'save', phone: normalized }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setResendCooldown(60);
      toast({ title: 'Code Resent', description: result.message });
    } catch (err: any) {
      toast({ title: 'Failed to resend', description: err.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading 2FA settings…</span>
      </div>
    );
  }

  return (
    <div className="border rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#25D366]/10">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-[#25D366]">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>
          <div>
            <p className="font-semibold text-sm">WhatsApp 2FA</p>
            <p className="text-xs text-muted-foreground">
              Receive a one-time code on WhatsApp every time you log in
            </p>
          </div>
        </div>
        <Badge variant={status?.enabled ? 'default' : 'secondary'} className={status?.enabled ? 'bg-green-600 text-white' : ''}>
          {status?.enabled ? 'Enabled' : 'Disabled'}
        </Badge>
      </div>

      {/* Current phone */}
      {status?.phone && phase === 'idle' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
          <Smartphone className="h-4 w-4 shrink-0" />
          <span>Registered: <span className="font-medium text-foreground">{status.phone}</span></span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Phase: idle */}
      {phase === 'idle' && (
        <div className="flex gap-2">
          {status?.enabled ? (
            <>
              <Button variant="outline" size="sm" onClick={() => { setPhase('enter-phone'); setError(''); }}>
                Change Number
              </Button>
              <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleDisable}>
                Disable 2FA
              </Button>
            </>
          ) : (
            <Button size="sm" className="bg-[#25D366] hover:bg-[#1da851] text-white" onClick={() => { setPhase('enter-phone'); setError(''); }}>
              Enable WhatsApp 2FA
            </Button>
          )}
        </div>
      )}

      {/* Phase: enter phone */}
      {phase === 'enter-phone' && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="wa-phone" className="text-sm">WhatsApp Phone Number</Label>
            <Input
              id="wa-phone"
              type="tel"
              placeholder="e.g. 919876543210 (with country code)"
              value={phone}
              onChange={e => { setPhone(e.target.value); setError(''); }}
              className="font-mono"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Include country code without + (India: 91, then 10-digit number)
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="bg-[#25D366] hover:bg-[#1da851] text-white" onClick={handleSavePhone}>
              Send Verification Code
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setPhase('idle'); setError(''); setPhone(''); }}>
              <X className="h-3.5 w-3.5 mr-1" />Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Phase: enter OTP */}
      {phase === 'enter-otp' && (
        <div className="space-y-3">
          <div className="p-3 bg-[#25D366]/10 rounded-lg text-sm text-green-800 dark:text-green-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Code sent to {phone.replace(/\D/g, '').slice(0, -4).replace(/\d/g, 'X') + phone.replace(/\D/g, '').slice(-4)} via WhatsApp
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wa-otp" className="text-sm">Enter Verification Code</Label>
            <Input
              id="wa-otp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={e => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              className="font-mono text-center text-xl tracking-widest"
              autoFocus
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" className="bg-[#25D366] hover:bg-[#1da851] text-white" onClick={handleVerifyOtp} disabled={otp.length !== 6}>
              Verify & Enable
            </Button>
            <Button variant="outline" size="sm" onClick={handleResend} disabled={resendCooldown > 0}>
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setPhase('enter-phone'); setOtp(''); setError(''); }}>
              Change Number
            </Button>
          </div>
        </div>
      )}

      {/* Phase: saving spinner */}
      {phase === 'saving' && (
        <div className="flex items-center gap-2 text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Processing…</span>
        </div>
      )}
    </div>
  );
}
