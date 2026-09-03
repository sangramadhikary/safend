'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * PWA Install Prompt — Android one-tap install banner.
 *
 * Captures the `beforeinstallprompt` event and surfaces a prominent install
 * button. On Android/Chrome this triggers the native "Add to Home Screen"
 * mini-infobar with a single tap — no manual instructions needed.
 *
 * Behaviour:
 * - Only shows on mobile/tablet (not desktop)
 * - Only shows if the browser fires `beforeinstallprompt` (= app is installable)
 * - Hides automatically once installed or dismissed
 * - 24h cooldown after dismiss so it doesn't nag
 * - Does NOT show if already running in standalone mode (already installed)
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pwa_install_dismissed_at';
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Don't show if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if ((navigator as any).standalone === true) return; // iOS

    // Don't show on desktop
    const isMobileOrTablet =
      /Android|iPhone|iPad|iPod|tablet|playbook|silk/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent));
    if (!isMobileOrTablet) return;

    // Check dismiss cooldown
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt && Date.now() - parseInt(dismissedAt, 10) < DISMISS_COOLDOWN_MS) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Hide banner if user installs via browser UI
    window.addEventListener('appinstalled', () => {
      setShowBanner(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    setInstalling(true);

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        setShowBanner(false);
      }
    } catch {
      // User cancelled or error — just hide
    } finally {
      setDeferredPrompt(null);
      setInstalling(false);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setShowBanner(false);
    setDeferredPrompt(null);
  }, []);

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] animate-fade-in-up">
      <div className="mx-auto max-w-sm rounded-2xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.12)] border border-safend-mist p-4">
        <div className="flex items-start gap-3">
          {/* App icon */}
          <div className="shrink-0 w-12 h-12 rounded-xl bg-[#0B0F19] flex items-center justify-center">
            <img src="/favicon.png" alt="Safend" className="w-8 h-8" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-heading font-semibold text-safend-ink leading-tight">
              Install Safend Ops
            </p>
            <p className="text-[12px] font-body text-safend-muted mt-0.5">
              Quick access from your home screen — works offline
            </p>
          </div>

          {/* Dismiss */}
          <button
            onClick={handleDismiss}
            className="shrink-0 p-1 -mt-1 -mr-1 text-safend-muted/60 hover:text-safend-ink transition-colors"
            aria-label="Dismiss install prompt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Install button — full width, prominent */}
        <Button
          onClick={handleInstall}
          disabled={installing}
          className="w-full mt-3 h-11 bg-safend-red hover:bg-safend-red/90 text-white font-heading font-semibold text-[14px] rounded-xl shadow-xs"
        >
          {installing ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Install App
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
