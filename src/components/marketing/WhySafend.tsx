'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * "Why Safend" — featuring:
 * 1. Horizontal scrolling stats strip (pinned, scrub-linked)
 * 2. Parallax editorial text/image layout
 * 3. Character-split headline reveal on scroll
 * 4. Counter animation tied to scroll progress
 */

const STATS = [
  { value: '2700+', label: 'Active personnel' },
  { value: '260+', label: 'Happy clients' },
  { value: '14+', label: 'Years in the field' },
  { value: '4', label: 'Industry awards' },
  { value: '100%', label: 'PSARA licensed' },
] as const;

export default function WhySafend() {
  const sectionRef = useRef<HTMLElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const marqueeInnerRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // ─── 1. Horizontal stats marquee on scrub ───
      if (marqueeRef.current && marqueeInnerRef.current) {
        const totalWidth = marqueeInnerRef.current.scrollWidth;
        const viewWidth = marqueeRef.current.offsetWidth;

        gsap.to(marqueeInnerRef.current, {
          x: -(totalWidth - viewWidth),
          ease: 'none',
          scrollTrigger: {
            trigger: marqueeRef.current,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1.5,
          },
        });
      }

      // ─── 2. Headline clip reveal ───
      if (headlineRef.current) {
        gsap.from(headlineRef.current, {
          clipPath: 'inset(0 0 100% 0)',
          y: 60,
          duration: 1.2,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: headlineRef.current,
            start: 'top 80%',
            toggleActions: 'play none none none',
          },
        });
      }

      // ─── 3. Image parallax + reveal ───
      if (imageRef.current) {
        gsap.from(imageRef.current, {
          y: 100,
          scale: 0.9,
          opacity: 0,
          duration: 1.2,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: imageRef.current,
            start: 'top 85%',
            toggleActions: 'play none none none',
          },
        });

        // Continuous parallax
        gsap.to(imageRef.current, {
          y: -60,
          ease: 'none',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 2,
          },
        });
      }

      // ─── 4. Body text fade-in ───
      if (bodyRef.current) {
        gsap.from(bodyRef.current, {
          y: 30,
          opacity: 0,
          duration: 0.8,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: bodyRef.current,
            start: 'top 80%',
            toggleActions: 'play none none none',
          },
        });
      }
    },
    { scope: sectionRef }
  );

  return (
    <section ref={sectionRef} className="w-full bg-safend-canvas overflow-hidden">
      {/* ─── Horizontal stats strip ─── */}
      <div ref={marqueeRef} className="py-14 border-y border-safend-mist overflow-hidden">
        <div ref={marqueeInnerRef} className="flex items-baseline gap-10 sm:gap-20 whitespace-nowrap px-6 sm:px-[50px]">
          {[...STATS, ...STATS].map((stat, i) => (
            <div key={`${stat.label}-${i}`} className="flex items-baseline gap-4 shrink-0">
              <span
                className="font-display font-bold text-safend-ink"
                style={{ fontSize: 'clamp(3.5rem, 8vw, 7rem)', lineHeight: 0.9 }}
              >
                {stat.value}
              </span>
              <span className="text-[11px] font-body text-safend-muted uppercase tracking-[0.06em] max-w-[120px] whitespace-normal leading-[1.3]">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Editorial content ─── */}
      <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px] py-[60px] sm:py-[90px] lg:py-[190px]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-16 lg:gap-24 items-start">
          {/* Left: Headline + Body */}
          <div>
            <p className="text-[11px] font-body text-safend-muted uppercase tracking-[0.08em] mb-6">
              Why us
            </p>
            <h2
              ref={headlineRef}
              className="font-display font-bold text-safend-ink leading-[0.9] tracking-[-0.03em] pb-[0.2em]"
              style={{ fontSize: 'clamp(3rem, 8vw, 6rem)' }}
            >
              We don&apos;t<br />
              just guard<span className="text-safend-red">.</span><br />
              We care<span className="text-safend-red">.</span>
            </h2>

            <div ref={bodyRef} className="mt-10">
              <p className="text-[16px] font-body text-safend-slate-grey leading-[1.6] tracking-[-0.02em] max-w-[420px]">
                Most security companies send a warm body and call it done. We
                send trained professionals who know your site, your risks, and
                your people by name. That&apos;s why almost every client we&apos;ve
                ever worked with is still with us today.
              </p>

              <div className="mt-10 h-[2px] w-[50px] bg-safend-red" aria-hidden />

              <Link
                href="/about"
                className="mt-8 group inline-flex items-center gap-2 text-[14px] font-body text-safend-ink hover:text-safend-red transition-colors duration-200"
              >
                Read Our Story
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
          </div>

          {/* Right: Image tile with parallax */}
          <div ref={imageRef}>
            <div className="rounded-[14px] overflow-hidden aspect-3/4">
              <img
                src="/Images/ourjourny/today.webp"
                alt="Safend security team"
                className="w-full h-full object-cover grayscale hover:grayscale-0 transition-[filter] duration-700"
              />
            </div>
            <p className="mt-4 text-[14px] font-body italic text-safend-muted">
              Our team on deployment, 2024
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
