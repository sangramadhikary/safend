'use client';

import { useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

interface StatementBandProps {
  text: string;
  /** Word(s) to render in red as the accent */
  accent?: string;
}

/**
 * Large letter-spaced statement that reveals character-by-character, scrubbed
 * to scroll position — replicates the newformcap.com mission-statement band
 * ("Investing at the intersection of fintech and blockchain since 2019.").
 *
 * Each character fades from low opacity to full as the band scrolls through
 * the viewport, creating a "reading light" sweeping across the sentence.
 */
export function StatementBand({ text, accent }: StatementBandProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);

  useGSAP(
    () => {
      const chars = textRef.current?.querySelectorAll('.stmt-char');
      if (!chars || !chars.length) return;

      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) {
        gsap.set(chars, { opacity: 1 });
        return;
      }

      gsap.set(chars, { opacity: 0.12 });
      gsap.to(chars, {
        opacity: 1,
        ease: 'power2.out',
        duration: 0.8,
        stagger: 0.015,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 80%',
          toggleActions: 'play none none none',
        },
      });
    },
    { scope: sectionRef }
  );

  // Split into characters, marking accent words red
  const accentLower = accent?.toLowerCase();
  const words = text.split(' ');

  return (
    <section ref={sectionRef} className="w-full bg-safend-canvas">
      <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px] py-[60px] sm:py-[90px] lg:py-[190px]">
        <p
          ref={textRef}
          className="font-display font-bold text-safend-ink leading-[1.05] tracking-[-0.02em] max-w-5xl"
          style={{ fontSize: 'clamp(2rem, 5.5vw, 4.5rem)' }}
        >
          {words.map((word, wi) => {
            const isAccent = accentLower && word.toLowerCase().replace(/[.,]/g, '') === accentLower;
            return (
              <span key={wi} className="inline-block whitespace-nowrap">
                {word.split('').map((c, ci) => (
                  <span
                    key={ci}
                    className={`stmt-char inline-block ${isAccent ? 'text-safend-red' : ''}`}
                  >
                    {c}
                  </span>
                ))}
                {wi < words.length - 1 && <span className="stmt-char inline-block">&nbsp;</span>}
              </span>
            );
          })}
        </p>
      </div>
    </section>
  );
}
