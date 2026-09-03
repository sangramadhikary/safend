'use client';

import { useEffect, useRef } from 'react';

// ── Starfield canvas (mirrors NetworkStatusOverlay) ───────────────────────────

function StarCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    type Star = { x: number; y: number; r: number; speed: number; opacity: number };
    const stars: Star[] = Array.from({ length: 180 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.6 + 0.3,
      speed: Math.random() * 0.2 + 0.04,
      opacity: Math.random() * 0.6 + 0.2,
    }));

    let tick = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#090b0f';
      ctx.fillRect(0, 0, W, H);

      const grad = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, W * 0.5);
      grad.addColorStop(0, 'rgba(215,25,32,0.1)');
      grad.addColorStop(0.5, 'rgba(215,25,32,0.04)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      tick++;
      for (const s of stars) {
        const alpha = s.opacity * (0.7 + 0.3 * Math.sin(tick * 0.04 + s.x));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
        ctx.fill();
        s.y -= s.speed;
        if (s.y < -2) { s.y = H + 2; s.x = Math.random() * W; }
      }
      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W; canvas.height = H;
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', onResize); };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" aria-hidden="true" />;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OfflinePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden select-none">
      <StarCanvas />

      <div className="relative z-10 flex flex-col items-center text-center px-6">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div
            className="h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-red-900/40"
            style={{ background: 'linear-gradient(135deg, #D71920 0%, #8b0000 100%)' }}
            aria-hidden="true"
          >
            S
          </div>
          <span className="text-xs font-semibold text-white/30 tracking-[0.3em] uppercase">
            Safend
          </span>
        </div>

        {/* No-signal icon */}
        <svg viewBox="0 0 48 48" fill="none" className="w-16 h-16 mb-2" aria-hidden="true">
          <circle cx="24" cy="24" r="20" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
          <path d="M8 24 Q24 8 40 24" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M13 29 Q24 17 35 29" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <line x1="17" y1="17" x2="31" y2="31" stroke="#D71920" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="31" y1="17" x2="17" y2="31" stroke="#D71920" strokeWidth="2.5" strokeLinecap="round" />
        </svg>

        <h1 className="mt-4 text-3xl font-bold text-white tracking-tight">
          You&apos;re offline
        </h1>
        <p className="mt-3 max-w-xs text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Safend can&apos;t reach the network. Check your connection, then try again.
        </p>

        {/* Hints */}
        <div className="mt-8 flex flex-col gap-2 w-full max-w-xs text-left">
          {['Check Wi-Fi or mobile data', 'Reconnect to your network', 'Disable VPN if active'].map((h) => (
            <div key={h} className="flex items-center gap-3 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              <span style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>{h}
            </div>
          ))}
        </div>

        <a
          href="/"
          className="mt-10 rounded-lg px-8 py-3 text-sm font-semibold text-white transition-all duration-200 hover:scale-105 active:scale-95 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-red-500"
          style={{ background: 'linear-gradient(135deg, #D71920 0%, #b01218 100%)' }}
        >
          Try again
        </a>
      </div>

      <p className="absolute bottom-6 text-[10px] tracking-widest uppercase z-10" style={{ color: 'rgba(255,255,255,0.12)' }}>
        Safend · Offline
      </p>
    </main>
  );
}
