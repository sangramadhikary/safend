'use client';

import { useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const INDUSTRIES = [
  { name: 'Healthcare', description: 'Hospitals need guards who understand patient safety, visitor management, and staying calm in emergencies.' },
  { name: 'Technology', description: 'IT parks and data centres need quiet, reliable presence — not aggressive security theatre.' },
  { name: 'Manufacturing', description: 'Factories run 24/7. We match that with guards who understand shift patterns, hazards, and access control.' },
  { name: 'Logistics', description: 'Warehouses, depots, and transit points — we protect goods in motion and at rest.' },
  { name: 'Construction', description: 'Open sites are easy targets. We lock them down with patrol, CCTV, and access logs.' },
] as const;

/**
 * Industries section with GSAP:
 * - Horizontal scrolling industry names (scrub-linked)
 * - Staggered item reveals with clip-path
 * - Hover: red underline that grows from left
 * - Numbers counter that animates on scroll entry
 */
export function Industries() {
  const sectionRef = useRef<HTMLElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // ─── Marquee scrub ───
      if (marqueeRef.current) {
        const inner = marqueeRef.current.querySelector('.ind-marquee-inner');
        if (inner) {
          gsap.to(inner, {
            xPercent: -30,
            ease: 'none',
            scrollTrigger: {
              trigger: marqueeRef.current,
              start: 'top bottom',
              end: 'bottom top',
              scrub: 1,
            },
          });
        }
      }

      // ─── Headline reveal ───
      if (headlineRef.current) {
        gsap.from(headlineRef.current, {
          clipPath: 'inset(0 0 100% 0)',
          y: 50,
          duration: 1.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: headlineRef.current,
            start: 'top 80%',
            toggleActions: 'play none none none',
          },
        });
      }

      // ─── Industry items — slide in from alternating sides on mobile, stagger on desktop ───
      const items = listRef.current?.querySelectorAll<HTMLElement>('.ind-item');
      if (items && items.length) {
        const mm2 = gsap.matchMedia();

        // Mobile: each dark card slides in from left / right alternating
        mm2.add('(max-width: 767px)', () => {
          items.forEach((item, i) => {
            const fromLeft = i % 2 === 0;
            gsap.fromTo(
              item,
              {
                x: fromLeft ? -60 : 60,
                opacity: 0,
                rotation: fromLeft ? -3 : 3,
              },
              {
                x: 0,
                opacity: 1,
                rotation: 0,
                duration: 0.7,
                ease: 'power3.out',
                scrollTrigger: {
                  trigger: item,
                  start: 'top 88%',
                  toggleActions: 'play none none none',
                },
              }
            );
          });
        });

        // Desktop: original stagger fade-up
        mm2.add('(min-width: 768px)', () => {
          gsap.from(items, {
            y: 40,
            opacity: 0,
            clipPath: 'inset(0 0 100% 0)',
            duration: 0.8,
            ease: 'power3.out',
            stagger: 0.08,
            scrollTrigger: {
              trigger: listRef.current,
              start: 'top 75%',
              toggleActions: 'play none none none',
            },
          });
        });
      }
    },
    { scope: sectionRef }
  );

  return (
    <section ref={sectionRef} className="w-full bg-safend-canvas overflow-hidden">
      {/* ─── Scrolling industry names marquee ─── */}
      <div ref={marqueeRef} className="py-5 sm:py-8 border-y border-safend-mist overflow-hidden">
        <div className="ind-marquee-inner flex items-center gap-6 sm:gap-10 whitespace-nowrap">
          {[...INDUSTRIES, ...INDUSTRIES, ...INDUSTRIES].map((ind, i) => (
            <div key={`${ind.name}-${i}`} className="flex items-center gap-6 sm:gap-10 shrink-0">
              <span
                className="font-display font-bold text-safend-ink/40 select-none"
                style={{ fontSize: 'clamp(1.4rem, 4vw, 3.5rem)' }}
              >
                {ind.name}
              </span>
              <span className="w-[4px] h-[4px] rounded-full bg-safend-red/30 shrink-0" aria-hidden />
            </div>
          ))}
        </div>
      </div>

      {/* ─── Main content ─── */}
      <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px] py-[50px] sm:py-[90px] lg:py-[190px]">
        <div ref={headlineRef}>
          <p className="text-[11px] font-body text-safend-muted uppercase tracking-[0.08em] mb-4 sm:mb-6">
            Industries We Serve
          </p>
          <h2
            className="font-display font-bold text-safend-ink leading-[0.9] tracking-[-0.03em]"
            style={{ fontSize: 'clamp(2.2rem, 8vw, 6rem)' }}
          >
            We know your<br />
            industry<span className="text-safend-red">.</span>
          </h2>
        </div>

        {/* Accent tick */}
        <div className="mt-7 sm:mt-10 h-[2px] w-[40px] sm:w-[50px] bg-safend-red" aria-hidden />

        {/* Industry list */}
        <div ref={listRef} className="mt-10 sm:mt-16 md:divide-y-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-x-6 md:gap-y-10 lg:gap-x-12 lg:gap-y-16">
          {INDUSTRIES.map((industry, i) => (
            <div
              key={industry.name}
              className="ind-item group cursor-default"
            >
              {/* ── Mobile: bold card with dark background ── */}
              <div className="md:hidden relative overflow-hidden rounded-[16px] bg-safend-ink px-5 py-5 mb-3">
                {/* Large faded number in background */}
                <span
                  className="absolute right-3 top-1/2 -translate-y-1/2 font-display font-bold text-white/5 select-none leading-none"
                  style={{ fontSize: 'clamp(3.5rem, 16vw, 5.5rem)' }}
                  aria-hidden
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[10px] font-body text-safend-red uppercase tracking-[0.12em]">
                  0{i + 1}
                </span>
                <h3 className="mt-1 font-display font-bold text-white leading-none tracking-[-0.02em]"
                  style={{ fontSize: 'clamp(1.25rem, 5.5vw, 1.7rem)' }}
                >
                  {industry.name}
                </h3>
                <p className="mt-2 text-[13px] font-body text-white/60 leading-normal">
                  {industry.description}
                </p>
                <div className="mt-3 h-[2px] w-[28px] bg-safend-red" />
              </div>

              {/* ── Desktop: original style ── */}
              <div className="hidden md:block">
                <span className="text-[11px] font-body text-safend-muted uppercase tracking-[0.08em]">
                  0{i + 1}
                </span>
                <h3 className="mt-3 text-[18px] font-heading font-semibold text-safend-ink group-hover:text-safend-red transition-colors duration-300">
                  {industry.name}
                </h3>
                <p className="mt-3 text-[14px] font-body text-safend-slate-grey leading-normal">
                  {industry.description}
                </p>
                <div className="mt-4 h-[2px] w-0 bg-safend-red group-hover:w-[40px] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
