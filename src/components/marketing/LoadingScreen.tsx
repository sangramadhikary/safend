'use client';

import { useState, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

/**
 * Minimal editorial loading screen — no logo.
 * Just a large counter and a thin red line that sweeps across the full width.
 * Then the entire panel wipes up to reveal the page.
 */
export function LoadingScreen() {
  const [done, setDone] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Announce completion so ScrollSmoother/ScrollTrigger can re-measure once
    // the loading panel is gone and the real layout is in place.
    const announceComplete = () => {
      window.dispatchEvent(new Event('safend:loading-complete'));
    };

    if (prefersReduced) {
      setDone(true);
      announceComplete();
      return;
    }

    const tl = gsap.timeline();

    // Counter 0 → 100 with line sweeping across
    const obj = { val: 0 };
    tl.to(obj, {
      val: 100,
      duration: 1.8,
      ease: 'power1.inOut',
      onUpdate: () => {
        const v = Math.round(obj.val);
        if (counterRef.current) counterRef.current.textContent = `${v}`;
        if (lineRef.current) lineRef.current.style.transform = `scaleX(${obj.val / 100})`;
      },
    });

    // Brief pause
    tl.to({}, { duration: 0.3 });

    // Wipe up
    tl.to(containerRef.current, {
      yPercent: -100,
      duration: 0.8,
      ease: 'expo.inOut',
      onComplete: () => {
        setDone(true);
        announceComplete();
      },
    });
  }, { scope: containerRef });

  if (done) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-9999 bg-safend-canvas flex flex-col items-center justify-center"
      aria-hidden="true"
    >
      {/* Large counter — dark on light, with % */}
      <div className="flex items-baseline">
        <span
          ref={counterRef}
          className="font-display font-bold text-safend-ink leading-none tabular-nums"
          style={{ fontSize: 'clamp(5rem, 15vw, 12rem)' }}
        >
          0
        </span>
        <span
          className="font-display font-bold text-safend-red leading-none"
          style={{ fontSize: 'clamp(2rem, 5vw, 4rem)' }}
        >
          %
        </span>
      </div>

      {/* Full-width red line that fills left to right */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-safend-mist">
        <div
          ref={lineRef}
          className="h-full bg-safend-red origin-left"
          style={{ transform: 'scaleX(0)' }}
        />
      </div>
    </div>
  );
}
