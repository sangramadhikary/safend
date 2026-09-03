'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Star, ArrowLeft, ArrowRight, Quote } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const TESTIMONIALS = [
  {
    quote:
      'Safend transformed how we think about site security. Their guards are professional, punctual, and genuinely vigilant. Incidents dropped to zero within the first quarter.',
    name: 'Facilities Director',
    designation: 'Corporate Business Park, Bhubaneswar',
    initials: 'FD',
    color: 'bg-safend-red',
  },
  {
    quote:
      "We handle large events and crowd control is everything. Safend\u2019s team manages access and de-escalation flawlessly. They are now our default security partner.",
    name: 'Operations Head',
    designation: 'Event Management Company, Cuttack',
    initials: 'OH',
    color: 'bg-safend-ink',
  },
  {
    quote:
      'Reliable, courteous, and always reachable. Switching to Safend gave our residents real peace of mind, and their response time is the fastest we have seen.',
    name: 'Secretary',
    designation: 'Residential Welfare Association, Odisha',
    initials: 'RW',
    color: 'bg-safend-red/80',
  },
];

const AUTOPLAY_MS = 5000;

export function Testimonials() {
  const sectionRef = useRef<HTMLElement>(null);
  const quoteRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const count = TESTIMONIALS.length;
  const current = TESTIMONIALS[active];

  const go = useCallback(
    (dir: number) => setActive((prev) => (prev + dir + count) % count),
    [count]
  );

  /* Section reveal */
  useGSAP(
    () => {
      const head = sectionRef.current?.querySelector('.testi-head');
      if (head) {
        gsap.from(head, {
          y: 40, opacity: 0, duration: 0.9, ease: 'power3.out',
          scrollTrigger: { trigger: head, start: 'top 90%', toggleActions: 'play none none none' },
        });
      }
    },
    { scope: sectionRef }
  );

  /* Crossfade quote on change */
  useGSAP(
    () => {
      if (!quoteRef.current) return;
      gsap.fromTo(
        quoteRef.current.querySelectorAll('.testi-anim'),
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: 0.05 }
      );
    },
    { dependencies: [active], scope: sectionRef }
  );

  /* Autoplay */
  useEffect(() => {
    if (paused) return;
    const bar = progressRef.current;
    let tween: gsap.core.Tween | undefined;
    if (bar) {
      gsap.set(bar, { scaleX: 0 });
      tween = gsap.to(bar, {
        scaleX: 1,
        duration: AUTOPLAY_MS / 1000,
        ease: 'none',
        onComplete: () => go(1),
      });
    }
    return () => { tween?.kill(); };
  }, [active, paused, go]);

  return (
    <section ref={sectionRef} className="w-full bg-safend-canvas">
      <div
        className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px] py-[60px] sm:py-[90px] lg:py-[160px]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Header */}
        <div className="testi-head mb-14 lg:mb-20">
          <p className="text-[11px] font-body text-safend-muted uppercase tracking-[0.18em] mb-5">
            Client Stories
          </p>
          <h2
            className="font-display font-bold text-safend-ink leading-[0.9] tracking-[-0.03em]"
            style={{ fontSize: 'clamp(2.25rem, 6vw, 4.5rem)' }}
          >
            Don&apos;t take our word<br />
            for it<span className="text-safend-red">.</span>
          </h2>
        </div>

        {/* Testimonial card */}
        <div className="relative max-w-4xl">
          {/* Big quote icon */}
          <Quote className="absolute -top-2 -left-2 lg:-left-6 w-12 h-12 lg:w-16 lg:h-16 text-safend-red/10" />

          <div ref={quoteRef} className="relative">
            {/* Stars */}
            <div className="testi-anim flex items-center gap-1 mb-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-safend-red text-safend-red" />
              ))}
            </div>

            {/* Quote */}
            <blockquote>
              <p
                className="testi-anim font-heading font-medium text-safend-ink leading-[1.35] tracking-[-0.01em]"
                style={{ fontSize: 'clamp(1.25rem, 2.5vw, 2rem)' }}
              >
                &ldquo;{current.quote}&rdquo;
              </p>
            </blockquote>

            {/* Author */}
            <div className="testi-anim mt-8 flex items-center gap-4">
              {/* Initial avatar */}
              <div
                className={`w-12 h-12 rounded-full ${current.color} flex items-center justify-center text-white text-[14px] font-heading font-bold tracking-wide`}
              >
                {current.initials}
              </div>
              <div>
                <p className="text-[15px] font-heading font-semibold text-safend-ink">
                  {current.name}
                </p>
                <p className="text-[12px] font-body text-safend-muted uppercase tracking-wider mt-0.5">
                  {current.designation}
                </p>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="mt-10 flex items-center gap-5">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous testimonial"
              className="w-10 h-10 rounded-full border border-safend-mist flex items-center justify-center text-safend-ink hover:bg-safend-ink hover:text-safend-canvas hover:border-safend-ink transition-all duration-300"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next testimonial"
              className="w-10 h-10 rounded-full border border-safend-mist flex items-center justify-center text-safend-ink hover:bg-safend-red hover:text-white hover:border-safend-red transition-all duration-300"
            >
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Counter */}
            <span className="ml-auto text-[13px] font-body text-safend-muted tabular-nums">
              {String(active + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-6 h-[2px] w-full bg-safend-mist overflow-hidden rounded-full">
            <div
              ref={progressRef}
              className="h-full bg-safend-red origin-left"
              style={{ transform: 'scaleX(0)' }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
