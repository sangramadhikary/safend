'use client';

import { useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { LeadCaptureModal } from './LeadCaptureModal';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Splits a string into per-character <span>s for staggered animation.
 * The caller wraps the result in a `whitespace-nowrap` element so a word is
 * never broken mid-letter when the headline wraps to the next line.
 */
function splitChars(text: string, cls: string) {
  return text.split('').map((c, i) => (
    <span key={i} className={`${cls} inline-block`}>
      {c}
    </span>
  ));
}

export default function HeroSection() {
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const topChars = gsap.utils.toArray<HTMLElement>('.hero-char-top');
      const bottomChars = gsap.utils.toArray<HTMLElement>('.hero-char-bottom');
      const sub = sectionRef.current?.querySelector('.hero-sub');
      const img1 = sectionRef.current?.querySelector('.hero-img-1');
      const img2 = sectionRef.current?.querySelector('.hero-img-2');
      const tick = sectionRef.current?.querySelector('.hero-tick');
      const cue = sectionRef.current?.querySelector('.hero-cue');

      // ─── 1. Top headline chars stagger in on load ───
      if (topChars.length) {
        gsap.fromTo(
          topChars,
          { yPercent: 120, opacity: 0 },
          { yPercent: 0, opacity: 1, duration: 0.9, ease: 'power3.out', stagger: 0.035, delay: 0.2 }
        );
      }

      // ─── 2. Images scale + fade in ───
      if (img1) {
        gsap.fromTo(img1,
          { y: 60, opacity: 0, scale: 0.88 },
          { y: 0, opacity: 1, scale: 1, duration: 1.1, ease: 'power3.out', delay: 0.6 }
        );
        gsap.to(img1, {
          y: -80, ease: 'none',
          scrollTrigger: { trigger: sectionRef.current, start: 'top top', end: 'bottom top', scrub: 1.5 },
        });
      }
      if (img2) {
        gsap.fromTo(img2,
          { y: 80, opacity: 0, scale: 0.85 },
          { y: 0, opacity: 1, scale: 1, duration: 1.2, ease: 'power3.out', delay: 0.8 }
        );
        gsap.to(img2, {
          y: -50, ease: 'none',
          scrollTrigger: { trigger: sectionRef.current, start: 'top top', end: 'bottom top', scrub: 2 },
        });
      }

      // ─── 3. Sub-content fades up after headline ───
      if (sub) {
        gsap.fromTo(sub,
          { y: 40, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', delay: 1.0 }
        );
      }

      // ─── 4. Tick mark scales in ───
      if (tick) {
        gsap.fromTo(tick,
          { scaleX: 0 },
          { scaleX: 1, duration: 0.5, ease: 'power2.out', delay: 1.4, transformOrigin: 'left' }
        );
      }

      // ─── 5. Scroll cue bouncing ───
      if (cue) {
        gsap.fromTo(cue, { opacity: 0 }, { opacity: 1, duration: 0.5, delay: 1.6 });
        gsap.to(cue.querySelector('.cue-line'), {
          y: 8, repeat: -1, yoyo: true, duration: 1.2, ease: 'sine.inOut',
        });
      }

      // ─── 6. Bottom headline — collapsed on load, expands as you scroll ───
      // The line starts at height:0 with its characters tucked below, then a
      // SCRUBBED (scroll-linked) timeline expands it and rises the letters as
      // you scroll the first stretch of the page.
      //
      // This grows the hero as it reveals, which shifts sections below it. That
      // used to leave the pinned ServiceHighlights measured against a stale
      // offset — but SmoothScroll now runs a ResizeObserver that re-measures
      // every ScrollTrigger whenever the content height actually changes, so
      // this reveal is safe again and keeps its original look (no dead gap).
      const bottomLine = sectionRef.current?.querySelector('.hero-bottom-line');
      if (bottomLine && bottomChars.length) {
        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (prefersReduced) {
          // Respect reduced motion — just show the full headline.
          gsap.set(bottomLine, { height: 'auto' });
          gsap.set(bottomChars, { yPercent: 0, opacity: 1 });
        } else {
          gsap.set(bottomLine, { height: 0, overflow: 'hidden' });
          gsap.set(bottomChars, { yPercent: 100, opacity: 0 });

          const expandTl = gsap.timeline({
            scrollTrigger: {
              trigger: sectionRef.current,
              start: 'top top', // begins at the top of the page
              end: '+=350', // fully revealed after ~350px of scrolling
              scrub: 0.8,
              invalidateOnRefresh: true,
            },
          });

          expandTl.to(bottomLine, { height: 'auto', duration: 0.4, ease: 'power2.out' });
          expandTl.to(
            bottomChars,
            {
              yPercent: 0,
              opacity: 1,
              duration: 0.6,
              ease: 'power3.out',
              stagger: 0.02,
            },
            '<0.1'
          );
        }
      }
    },
    { scope: sectionRef }
  );

  return (
    <>
      <section
        ref={sectionRef}
        className="relative w-full bg-safend-canvas min-h-screen flex items-center overflow-hidden"
      >

        <div className="relative max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px] w-full pt-[96px] pb-[60px] sm:py-[80px] lg:py-[140px]">
          {/* ─── Display headline ─── */}
          <div className="relative">
            {/* Top part — visible on load, ends with comma.
                Each word is kept whole (whitespace-nowrap) so it never breaks
                mid-letter; lines wrap between words only. */}
            <h1
              className="font-display font-bold text-safend-ink leading-[0.88] tracking-[-0.04em]"
              style={{ fontSize: 'clamp(3rem, 10vw, 8rem)' }}
            >
              <span className="inline-block whitespace-nowrap">
                {splitChars('Responsible', 'hero-char-top')}
              </span>
              <br />
              <span className="inline-block whitespace-nowrap">
                {splitChars('Security', 'hero-char-top')}
                <span className="hero-char-top inline-block text-safend-red">,</span>
              </span>
            </h1>

            {/* Bottom part */}
            <div className="hero-bottom-line overflow-hidden mt-2">
              <p
                className="font-display font-bold text-safend-ink leading-[0.88] tracking-[-0.04em]"
                style={{ fontSize: 'clamp(3rem, 10vw, 8rem)' }}
              >
                <span className="inline-block whitespace-nowrap">
                  {splitChars('for', 'hero-char-bottom')}
                </span>{' '}
                <span className="inline-block whitespace-nowrap">
                  {splitChars('Productive', 'hero-char-bottom')}
                </span>
                <br />
                <span className="inline-block whitespace-nowrap">
                  {splitChars('Businesses', 'hero-char-bottom')}
                  <span className="hero-char-bottom inline-block text-safend-red">.</span>
                </span>
              </p>
            </div>

            {/* ─── Image tiles ─── */}
            <div className="hero-img-1 hidden lg:block absolute top-[5%] right-[2%] w-[200px] xl:w-[260px] 2xl:right-[5%]">
              <div className="rounded-[14px] overflow-hidden aspect-4/3">
                <img
                  src="/Images/unarmed-guards.webp"
                  alt="Safend security team on site"
                  className="w-full h-full object-cover grayscale hover:grayscale-0 transition-[filter] duration-700"
                />
              </div>
              <p className="mt-2 text-[13px] font-body italic text-safend-muted">
                On-site deployment, Odisha
              </p>
            </div>

            <div className="hero-img-2 hidden lg:block absolute bottom-[-10%] right-[22%] w-[150px] xl:w-[190px] 2xl:right-[25%]">
              <div className="rounded-[14px] overflow-hidden aspect-3/4">
                <img
                  src="/Images/armed-guards.webp"
                  alt="Armed security personnel"
                  className="w-full h-full object-cover grayscale hover:grayscale-0 transition-[filter] duration-700"
                />
              </div>
            </div>
          </div>

          {/* ─── Mobile image pair (in-flow; mirrors the desktop floating tiles) ─── */}
          <div className="lg:hidden mt-10 grid grid-cols-2 gap-3">
            <div>
              <div className="rounded-[14px] overflow-hidden aspect-4/3">
                <img
                  src="/Images/unarmed-guards.webp"
                  alt="Safend security team on site"
                  className="w-full h-full object-cover grayscale"
                />
              </div>
              <p className="mt-2 text-[12px] font-body italic text-safend-muted">
                On-site deployment, Odisha
              </p>
            </div>
            <div className="rounded-[14px] overflow-hidden aspect-4/3">
              <img
                src="/Images/armed-guards.webp"
                alt="Armed security personnel"
                className="w-full h-full object-cover grayscale"
              />
            </div>
          </div>

          {/* ─── Sub-content (always visible, no scroll fade) ─── */}
          <div className="hero-sub mt-12 lg:mt-16 max-w-[520px]">
            <p className="text-[16px] font-body text-safend-slate-grey leading-[1.6] tracking-[-0.02em]">
              Trained guards, armed officers, and 24/7 monitoring for your
              business, events, and residential properties across India. Let Safend
              handle your security so you can focus on what matters.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-wrap items-center gap-6">
              <button
                type="button"
                onClick={() => setLeadModalOpen(true)}
                className="group inline-flex items-center gap-2 rounded-[10px] bg-safend-red px-6 sm:px-[40px] lg:px-[50px] py-[18px] lg:py-[20px] text-[14px] font-heading font-semibold tracking-[0.01em] uppercase text-white transition-all duration-300 hover:translate-y-[-2px]"
              >
                Get Security Assessment
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </button>

              <a
                href="/services"
                className="text-[14px] font-body text-safend-ink hover:text-safend-red transition-colors duration-200 underline-offset-4 hover:underline"
              >
                View our services →
              </a>
            </div>

            {/* Accent tick */}
            <div className="hero-tick mt-12 h-[2px] w-[50px] bg-safend-red" aria-hidden />

            {/* Quick stats */}
            <div className="mt-8 flex flex-wrap gap-x-6 sm:gap-x-10 gap-y-4">
              {[
                { val: '2700+', label: 'Guards' },
                { val: '260+', label: 'Clients' },
                { val: '14+', label: 'Years' },
              ].map((s) => (
                <div key={s.label} className="flex items-baseline gap-2">
                  <span className="text-[24px] lg:text-[32px] font-display font-bold text-safend-ink leading-none">
                    {s.val}
                  </span>
                  <span className="text-[11px] font-body text-safend-muted uppercase tracking-[0.06em]">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Scroll cue ─── */}
        <div className="hero-cue absolute bottom-8 left-6 sm:left-10 lg:left-[50px] flex items-center gap-3 opacity-0">
          <span className="cue-line relative block h-8 w-px bg-safend-red" />
          <span className="text-[11px] font-body text-safend-muted uppercase tracking-widest">
            Scroll
          </span>
        </div>
      </section>

      <LeadCaptureModal open={leadModalOpen} onOpenChange={setLeadModalOpen} />
    </>
  );
}
