'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

/**
 * Cloudflare Turnstile site key. Trimmed to guard against trailing
 * whitespace/newlines in the env var (which silently break widget rendering).
 * The fallback is the public production site key — safe to ship client-side.
 */
const SITE_KEY = (
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAADxGKr1E4QYNNF5q'
).trim();

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Imperative handle exposed to parents so they can reset the widget. */
export interface TurnstileHandle {
  /** Reset the widget and request a fresh token (tokens are single-use). */
  reset: () => void;
}

interface TurnstileWidgetProps {
  /** Called with the token once the visitor passes verification. */
  onVerify: (token: string) => void;
  /** Called when the token expires or the widget errors (token cleared). */
  onExpire?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  /** Widget footprint. 'compact' is smaller for tight footers/toolbars. */
  size?: 'normal' | 'flexible' | 'compact';
  className?: string;
}

// Single shared promise so the script is only injected once per page even when
// multiple widgets mount.
let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Turnstile failed to load')));
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Turnstile failed to load'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * Reusable Cloudflare Turnstile widget. Handles one-time script injection,
 * explicit render, cleanup on unmount, and exposes a `reset()` via ref for
 * flows that submit more than once (each submit consumes the token).
 */
export const TurnstileWidget = forwardRef<TurnstileHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onVerify, onExpire, theme = 'light', size = 'normal', className }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    // Keep latest callbacks in refs so the render effect can stay mount-only.
    const onVerifyRef = useRef(onVerify);
    const onExpireRef = useRef(onExpire);
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;

    useImperativeHandle(
      ref,
      () => ({
        reset: () => {
          if (widgetIdRef.current && (window as any).turnstile) {
            (window as any).turnstile.reset(widgetIdRef.current);
          }
        },
      }),
      []
    );

    useEffect(() => {
      let cancelled = false;

      loadTurnstileScript()
        .then(() => {
          if (cancelled || !containerRef.current || widgetIdRef.current) return;
          if (!(window as any).turnstile) return;
          widgetIdRef.current = (window as any).turnstile.render(containerRef.current, {
            sitekey: SITE_KEY,
            callback: (token: string) => onVerifyRef.current(token),
            'expired-callback': () => onExpireRef.current?.(),
            'error-callback': () => onExpireRef.current?.(),
            theme,
            size,
          });
        })
        .catch(() => {
          /* Network/script errors are non-fatal; the parent gates submit on a token. */
        });

      return () => {
        cancelled = true;
        if (widgetIdRef.current && (window as any).turnstile) {
          try {
            (window as any).turnstile.remove(widgetIdRef.current);
          } catch {
            /* ignore */
          }
          widgetIdRef.current = null;
        }
      };
    }, [theme, size]);

    return <div ref={containerRef} className={className} />;
  }
);
