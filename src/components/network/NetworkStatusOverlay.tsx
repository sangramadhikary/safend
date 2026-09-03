'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

// ── Animated broken-cable SVG illustration ────────────────────────────────────

function BrokenCableAnimation() {
  return (
    <div className="relative flex items-center justify-center w-56 h-36 select-none" aria-hidden="true">
      <svg viewBox="0 0 220 140" fill="none" className="w-full h-full overflow-visible">
        {/* Left plug body */}
        <rect x="4" y="56" width="54" height="28" rx="6" fill="#e5e7eb" stroke="#d1d5db" strokeWidth="1.5" />
        <rect x="18" y="48" width="8" height="10" rx="2" fill="#9ca3af" />
        <rect x="34" y="48" width="8" height="10" rx="2" fill="#9ca3af" />
        {/* Left cable */}
        <path d="M58 70 C80 70 80 70 95 70" stroke="#9ca3af" strokeWidth="6" strokeLinecap="round" />
        {/* Frayed left end — animated */}
        <g className="animate-[wiggle_1.4s_ease-in-out_infinite]" style={{ transformOrigin: '95px 70px' }}>
          <path d="M95 70 L103 63" stroke="#D71920" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M95 70 L106 68" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
          <path d="M95 70 L104 74" stroke="#D71920" strokeWidth="2" strokeLinecap="round" />
          <path d="M95 70 L102 78" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
        </g>

        {/* Gap spark — pulses */}
        <g className="animate-pulse">
          <circle cx="110" cy="70" r="3" fill="#D71920" opacity="0.7" />
          <path d="M106 66 L110 70 L106 74" stroke="#D71920" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M114 66 L110 70 L114 74" stroke="#D71920" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* Right cable */}
        <path d="M125 70 C140 70 140 70 162 70" stroke="#9ca3af" strokeWidth="6" strokeLinecap="round" />
        {/* Frayed right end */}
        <g className="animate-[wiggle_1.4s_ease-in-out_infinite_0.2s]" style={{ transformOrigin: '125px 70px' }}>
          <path d="M125 70 L117 63" stroke="#D71920" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M125 70 L114 68" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
          <path d="M125 70 L116 74" stroke="#D71920" strokeWidth="2" strokeLinecap="round" />
          <path d="M125 70 L118 78" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
        </g>

        {/* Right plug body */}
        <rect x="162" y="56" width="54" height="28" rx="6" fill="#e5e7eb" stroke="#d1d5db" strokeWidth="1.5" />
        <rect x="176" y="48" width="8" height="10" rx="2" fill="#9ca3af" />
        <rect x="192" y="48" width="8" height="10" rx="2" fill="#9ca3af" />

        {/* Signal waves — broken / fading */}
        <g opacity="0.25">
          <path d="M100 50 Q110 40 120 50" stroke="#D71920" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M95 43 Q110 28 125 43" stroke="#D71920" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </g>

        {/* X mark over gap */}
        <circle cx="110" cy="70" r="14" fill="#fef2f2" stroke="#fca5a5" strokeWidth="1" />
        <line x1="104" y1="64" x2="116" y2="76" stroke="#D71920" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="116" y1="64" x2="104" y2="76" stroke="#D71920" strokeWidth="2.5" strokeLinecap="round" />
      </svg>

      {/* Floating dots animation */}
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-1.5">
        {[0, 0.3, 0.6].map((d, i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-red-300 animate-bounce"
            style={{ animationDelay: `${d}s` }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Signal bars (slow internet) ───────────────────────────────────────────────

function SignalBars({ lit }: { lit: number }) {
  return (
    <div className="flex items-end gap-[3px] h-7" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="rounded-sm transition-all duration-500"
          style={{
            width: 7,
            height: 6 + i * 5,
            backgroundColor: i <= lit ? '#D71920' : '#e5e7eb',
          }}
        />
      ))}
    </div>
  );
}

// ── Fix step component ────────────────────────────────────────────────────────

interface FixStep {
  num: number;
  title: string;
  detail: string;
  icon: string;
}

const FIX_STEPS: FixStep[] = [
  {
    num: 1,
    title: 'Check your Wi-Fi or mobile data',
    detail: 'Make sure Wi-Fi is turned on, or mobile data is enabled. Try toggling airplane mode off and on.',
    icon: '📶',
  },
  {
    num: 2,
    title: 'Reconnect to your network',
    detail: 'Disconnect from Wi-Fi and reconnect. If on mobile, move to an area with better signal.',
    icon: '🔄',
  },
  {
    num: 3,
    title: 'Restart your router or modem',
    detail: 'Unplug the power cable, wait 30 seconds, then plug it back in. Wait a minute for it to reconnect.',
    icon: '🔌',
  },
  {
    num: 4,
    title: 'Disable VPN or proxy',
    detail: 'VPNs and proxies can block access. Try disabling them temporarily and reload the page.',
    icon: '🔒',
  },
  {
    num: 5,
    title: 'Check firewall or network restrictions',
    detail: 'Corporate firewalls may block access. Contact your IT administrator if on a work network.',
    icon: '🛡️',
  },
];

// ── Pulsing dot ───────────────────────────────────────────────────────────────

function PulsingDot({ color }: { color: string }) {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style={{ backgroundColor: color }} />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: color }} />
    </span>
  );
}

// ── Main overlay ──────────────────────────────────────────────────────────────

export function NetworkStatusOverlay() {
  const { quality, effectiveType, downlink } = useNetworkStatus();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showReconnect, setShowReconnect] = useState(false);
  const prevQuality = useRef(quality);

  useEffect(() => {
    if (quality === 'offline') {
      setVisible(true);
      setDismissed(false);
      setShowReconnect(false);
    } else if (quality === 'slow' && !dismissed) {
      setVisible(true);
    } else if (quality === 'online' && prevQuality.current !== 'online') {
      setShowReconnect(true);
      const t = setTimeout(() => {
        setShowReconnect(false);
        setVisible(false);
        setDismissed(false);
      }, 3000);
      return () => clearTimeout(t);
    }
    prevQuality.current = quality;
  }, [quality, dismissed]);

  // ── Reconnected flash ──
  if (showReconnect) {
    return (
      <div className="fixed inset-0 z-9999 flex items-end justify-center pb-8 pointer-events-none" role="status" aria-live="polite">
        <div className="flex items-center gap-3 rounded-2xl bg-white border border-green-200 shadow-2xl px-5 py-3.5 animate-in fade-in slide-in-from-bottom-4 duration-400">
          <PulsingDot color="#22c55e" />
          <span className="text-sm font-semibold text-gray-800">Back online — connection restored</span>
        </div>
      </div>
    );
  }

  if (!visible) return null;
  const isOffline = quality === 'offline';

  return (
    <div
      className="fixed inset-0 z-9998 bg-white flex flex-col overflow-y-auto"
      role="alertdialog"
      aria-modal={isOffline}
      aria-label={isOffline ? 'No internet connection' : 'Slow internet connection'}
    >
      {/* ── Full offline ── */}
      {isOffline && (
        <div className="flex flex-col items-center px-6 py-10 w-full max-w-xl mx-auto">
          {/* Logo */}
          <div className="mb-8">
            <Image src="/logo.png" alt="Safend" width={140} height={48} priority className="h-12 w-auto object-contain" />
          </div>

          {/* Animation */}
          <BrokenCableAnimation />

          {/* Heading */}
          <h1 className="mt-6 text-2xl font-bold text-gray-900 tracking-tight">
            No Internet Connection
          </h1>
          <p className="mt-2 text-sm text-gray-500 text-center max-w-xs leading-relaxed">
            Safend can&apos;t reach the server. Your device appears to be offline.
          </p>

          {/* Status pill */}
          <div className="mt-4 flex items-center gap-2 bg-red-50 border border-red-100 rounded-full px-4 py-1.5">
            <PulsingDot color="#D71920" />
            <span className="text-xs font-medium text-red-600">Disconnected</span>
          </div>

          {/* Fix guide */}
          <div className="mt-8 w-full">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
              How to fix this
            </p>
            <div className="flex flex-col gap-3">
              {FIX_STEPS.map((step) => (
                <div
                  key={step.num}
                  className="flex gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3.5 hover:border-red-100 hover:bg-red-50/30 transition-colors duration-150"
                >
                  <span className="text-xl shrink-0 mt-0.5">{step.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{step.num}. {step.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Retry */}
          <button
            onClick={() => window.location.reload()}
            className="mt-8 w-full rounded-xl bg-[#D71920] hover:bg-red-700 active:scale-[0.98] text-white font-semibold text-sm py-3.5 transition-all duration-150 shadow-xs shadow-red-200"
          >
            Try Again
          </button>

          <p className="mt-6 text-[11px] text-gray-300">
            If the problem persists, contact your network administrator.
          </p>
        </div>
      )}

      {/* ── Slow internet — bottom banner ── */}
      {!isOffline && quality === 'slow' && (
        <div className="mt-auto">
          <div className="mx-4 mb-4 rounded-2xl border border-amber-200 bg-white shadow-xl p-4 flex items-start gap-3 animate-in slide-in-from-bottom-4 duration-300 max-w-sm mx-auto">
            <SignalBars lit={1} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">Slow connection</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {effectiveType ? effectiveType.toUpperCase() : 'Weak signal'}
                {downlink ? ` · ${downlink.toFixed(1)} Mbps` : ''}
                {' '}— some features may be slow.
              </p>
            </div>
            <button
              onClick={() => { setDismissed(true); setVisible(false); }}
              className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors text-xl leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
