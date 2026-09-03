'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Clock, Lock, MapPin, Terminal, type LucideIcon } from 'lucide-react';

/**
 * Full-screen security interstitials (idle lock, geofence block, devtools warning).
 *
 * Shared visual language with the marketing surfaces: animated aurora mesh
 * behind a frosted glass panel, brand-red accents, Montserrat headings.
 * All motion is disabled when the user prefers reduced motion.
 */

type Tone = 'brand' | 'amber';

const TONES: Record<Tone, { blobA: string; blobB: string; ring: string; badge: string; icon: string }> = {
  brand: {
    blobA: 'bg-[#D71920]/15',
    blobB: 'bg-[#ff4d4d]/12',
    ring: 'border-[#D71920]/25',
    badge: 'from-[#D71920]/15 to-[#D71920]/3 border-[#D71920]/20',
    icon: 'text-[#D71920]',
  },
  amber: {
    blobA: 'bg-amber-500/15',
    blobB: 'bg-orange-500/10',
    ring: 'border-amber-500/30',
    badge: 'from-amber-500/15 to-amber-500/3 border-amber-500/25',
    icon: 'text-amber-500',
  },
};

/* ─────────────────────────── Shell ─────────────────────────── */

function SecurityScreenShell({
  children,
  tone = 'brand',
  label,
}: {
  children: React.ReactNode;
  tone?: Tone;
  label: string;
}) {
  const reduceMotion = useReducedMotion();
  const t = TONES[tone];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#FAFAFB] px-5 py-10 dark:bg-[#07090F]"
    >
      {/* Aurora mesh + grid texture — purely decorative */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className={`absolute -top-40 left-1/2 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full blur-[120px] ${t.blobA}`}
          animate={reduceMotion ? undefined : { x: [0, 40, 0], y: [0, 26, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className={`absolute -bottom-40 -right-24 h-[22rem] w-[22rem] rounded-full blur-[120px] ${t.blobB}`}
          animate={reduceMotion ? undefined : { x: [0, -34, 0], y: [0, -22, 0], scale: [1, 1.12, 1] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div
          className="absolute inset-0 opacity-40 mask-[radial-gradient(ellipse_at_center,black,transparent_70%)] dark:opacity-20"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.18) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 24 }}
        className="relative w-full max-w-[380px]"
      >
        <div className="rounded-[28px] border border-white/60 bg-white/70 p-7 shadow-[0_24px_70px_-24px_rgba(15,23,42,0.35)] backdrop-blur-2xl sm:p-8 dark:border-white/10 dark:bg-white/4 dark:shadow-[0_24px_70px_-20px_rgba(0,0,0,0.85)]">
          {children}
        </div>
      </motion.div>
    </div>
  );
}

/* ──────────────────────── Icon badge ──────────────────────── */

function IconBadge({ icon: Icon, tone = 'brand' }: { icon: LucideIcon; tone?: Tone }) {
  const reduceMotion = useReducedMotion();
  const t = TONES[tone];

  return (
    <div className="relative mx-auto h-16 w-16">
      {/* Breathing sonar rings */}
      {!reduceMotion &&
        [0, 1].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className={`absolute inset-0 rounded-full border ${t.ring}`}
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.85, opacity: 0 }}
            transition={{ duration: 2.8, repeat: Infinity, delay: i * 1.4, ease: 'easeOut' }}
          />
        ))}
      <div
        className={`relative flex h-16 w-16 items-center justify-center rounded-full border bg-linear-to-b ${t.badge} shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]`}
      >
        <Icon className={`h-7 w-7 ${t.icon}`} strokeWidth={1.75} aria-hidden />
      </div>
    </div>
  );
}

/* ──────────────────── Identity footer row ──────────────────── */

function IdentityRow({ userName, employeeId }: { userName?: string; employeeId?: string }) {
  const initials = useMemo(() => {
    if (!userName) return '';
    return userName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');
  }, [userName]);

  if (!userName && !employeeId) return null;

  return (
    <div className="mt-6 border-t border-black/5 pt-5 dark:border-white/8">
      <div className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white/60 px-3 py-2.5 dark:border-white/8 dark:bg-white/3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-linear-to-br from-[#D71920] to-[#8f0f14] text-[11px] font-bold text-white">
          {initials || <Lock className="h-4 w-4" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1 text-left">
          {userName && (
            <p className="truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">{userName}</p>
          )}
          {employeeId && (
            <p className="truncate font-mono text-[10px] tracking-tight text-gray-400 dark:text-gray-500">
              {employeeId}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────── Session lock screen ───────────────────── */

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

export function SessionLockScreen({
  onUnlock,
  userName,
  employeeId,
  lockedAt,
  idleMinutes = 3,
}: {
  onUnlock: () => void;
  userName?: string;
  employeeId?: string;
  /** Epoch ms when the session locked — drives the elapsed counter. */
  lockedAt: number;
  idleMinutes?: number;
}) {
  const reduceMotion = useReducedMotion();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [elapsed, setElapsed] = useState(() => Math.max(0, Math.floor((Date.now() - lockedAt) / 1000)));

  // Tick the "locked for" counter.
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - lockedAt) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [lockedAt]);

  // Focus the CTA so keyboard and screen-reader users land on the action.
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  // Enter / Space anywhere unlocks. Skip when the button itself is the target,
  // otherwise the native click would fire onUnlock twice.
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.target === buttonRef.current) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onUnlock();
      }
    },
    [onUnlock]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <SecurityScreenShell tone="brand" label="Session locked">
      <div className="text-center">
        <IconBadge icon={Lock} tone="brand" />

        <h1 className="mt-5 font-heading text-[22px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white">
          Session Locked
        </h1>
        <p className="mx-auto mt-2 max-w-[19rem] text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
          We paused your session after {idleMinutes} minutes of inactivity to keep client data protected.
        </p>

        {/* Live elapsed counter */}
        <div
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-white/70 px-3 py-1 dark:border-white/8 dark:bg-white/4"
          aria-live="polite"
        >
          <Clock className="h-3 w-3 text-gray-400" aria-hidden />
          <span className="font-mono text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
            Locked for {formatElapsed(elapsed)}
          </span>
        </div>

        {/* Primary action */}
        <button
          ref={buttonRef}
          onClick={onUnlock}
          className="group relative mt-6 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-linear-to-b from-[#E31E26] to-[#C0141A] py-3.5 text-sm font-semibold text-white shadow-[0_12px_28px_-10px_rgba(215,25,32,0.75)] transition-all duration-200 hover:shadow-[0_16px_34px_-10px_rgba(215,25,32,0.85)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D71920]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-[0.98] dark:focus-visible:ring-offset-[#07090F]"
        >
          {/* Specular sweep on hover */}
          {!reduceMotion && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
            />
          )}
          <span className="relative">Unlock Session</span>
          <ArrowRight
            className="relative h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden
          />
        </button>

        <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500">
          or press{' '}
          <kbd className="rounded-md border border-black/10 bg-white/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
            Enter
          </kbd>
        </p>

        <IdentityRow userName={userName} employeeId={employeeId} />
      </div>
    </SecurityScreenShell>
  );
}

/* ──────────────────── Geofence blocked screen ──────────────────── */

export function GeoBlockedScreen() {
  return (
    <SecurityScreenShell tone="brand" label="Access restricted by region">
      <div className="text-center">
        <IconBadge icon={MapPin} tone="brand" />

        <h1 className="mt-5 font-heading text-[22px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white">
          Access Restricted
        </h1>
        <p className="mx-auto mt-2 max-w-[19rem] text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
          This application is available only from within India. Your current location falls outside the permitted
          zone.
        </p>

        <div className="mt-6 space-y-2 text-left">
          <div className="flex items-center justify-between rounded-xl border border-black/5 bg-white/60 px-3.5 py-2.5 dark:border-white/8 dark:bg-white/3">
            <span className="text-[11px] font-medium tracking-wide text-gray-400 uppercase">Required region</span>
            <span className="text-[12px] font-semibold text-gray-800 dark:text-gray-200">India</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-black/5 bg-white/60 px-3.5 py-2.5 dark:border-white/8 dark:bg-white/3">
            <span className="text-[11px] font-medium tracking-wide text-gray-400 uppercase">Your location</span>
            <span className="text-[12px] font-semibold text-[#D71920]">Outside zone</span>
          </div>
        </div>

        <p className="mt-6 border-t border-black/5 pt-5 text-[11px] leading-relaxed text-gray-400 dark:border-white/8 dark:text-gray-500">
          Contact your administrator if you believe this is an error.
        </p>
      </div>
    </SecurityScreenShell>
  );
}

/* ───────────────────── DevTools warning screen ───────────────────── */

export function DevToolsScreen() {
  return (
    <SecurityScreenShell tone="amber" label="Developer tools detected">
      <div className="text-center">
        <IconBadge icon={Terminal} tone="amber" />

        <h1 className="mt-5 font-heading text-[22px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white">
          Developer Tools Detected
        </h1>
        <p className="mx-auto mt-2 max-w-[19rem] text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
          Close your browser developer tools to resume. Access is restored automatically once they are closed.
        </p>

        <div
          className="mt-6 flex items-start gap-2.5 rounded-2xl border border-amber-500/20 bg-amber-500/8 px-3.5 py-3 text-left"
          role="status"
        >
          <span
            aria-hidden
            className="mt-1.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-500"
          />
          <p className="text-[11.5px] leading-relaxed text-amber-700 dark:text-amber-300/90">
            This event has been recorded in the security audit log.
          </p>
        </div>
      </div>
    </SecurityScreenShell>
  );
}
