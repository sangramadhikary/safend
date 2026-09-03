'use client';

import { useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { HomeCta } from './HomeCta';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/* ─── Data ─────────────────────────────────────────────────────────────── */

const JOURNEY = [
  {
    year: '2010',
    kicker: 'The Spark',
    title: 'A guard with a vision',
    body: 'Mr. Chitta Ranjan worked the floor as a security guard. He saw the good, the bad, and the frustrating sides of the industry — unhappy clients, unreliable manpower. Frustration lit a fire: "I can do better."',
    image: '/Images/ourjourny/2010.webp',
  },
  {
    year: '2010—20',
    kicker: 'The Decade',
    title: 'Mastering the craft',
    body: 'With his brother Sangram, the leap was made. Safend began as a humble proprietorship — mastering fundamentals, understanding client pain points, and empathizing with the people who would work for Safend. A decade of learning.',
    image: '/Images/ourjourny/2010-20.webp',
  },
  {
    year: '2020',
    kicker: 'The Leap',
    title: 'A proper organization',
    body: 'A time of upheaval, but also opportunity. Safend made the leap from a small operation to a properly incorporated organization — everything learned about client expectations and excellence woven into its DNA.',
    image: '/Images/ourjourny/2020.webp',
  },
  {
    year: 'Today',
    kicker: 'The Standard',
    title: 'Responsible security',
    body: 'A philosophy built on respect, professionalism, and reliability. Today Safend protects businesses, events, and residences across India — with an almost 100% retention rate among clients and staff alike.',
    image: '/Images/ourjourny/today.webp',
  },
] as const;

const PILLARS = [
  { n: '01', title: 'People', desc: 'Our success begins with our people. Every employee, partner, and customer is at the heart of what we do. We nurture talent and foster a respectful environment so individuals thrive.' },
  { n: '02', title: 'Service', desc: 'Exceptional service is a commitment, not a goal. We exceed expectations at every touchpoint, ensuring personalized care and detail form the foundation of lasting relationships.' },
  { n: '03', title: 'Profit', desc: 'Profit is the natural outcome of a people-centered, service-driven business. It lets us reinvest in our team, refine our services, and fuel sustainable growth.' },
] as const;

const TEAM = [
  { name: 'C.R Adhikary', role: 'Executive Director', desc: 'Guides strategic leadership and fosters a culture of excellence, leading Safend with a bold vision.', linkedin: 'https://www.linkedin.com/in/chittaranjanadhikary', image: '/Images/team/cr-adhikary.webp' },
  { name: 'S.K Adhikary', role: 'Director Operations', desc: 'Oversees operational excellence with focus on efficiency, ensuring Safend runs smoothly every day.', linkedin: 'https://in.linkedin.com/in/sangram-keshari-adhikary-3418072ba', image: '/Images/team/sk-adhikary.webp' },
] as const;

const STATS = [
  { value: 2700, suffix: '+', label: 'Active personnel at any time' },
  { value: 260, suffix: '+', label: 'Clients across India' },
  { value: 14, suffix: '+', label: 'Years of experience' },
  { value: 4, suffix: '', label: 'Industry awards' },
] as const;

const PRESS = ['YourStory', 'OTV', 'Kalinga News'] as const;

/* ─── Component ────────────────────────────────────────────────────────── */

/**
 * Splits a string for a character-by-character typewriter reveal while
 * preserving natural word wrapping: each word is an inline-block (so it never
 * breaks mid-word) and a real space sits between words (so lines wrap normally).
 * Every visible character carries the `tw-char` class for GSAP to reveal.
 */
function twSplit(text: string) {
  const words = text.split(' ');
  return words.flatMap((word, wi) => {
    const wordSpan = (
      <span key={`w${wi}`} className="inline-block whitespace-nowrap">
        {word.split('').map((ch, ci) => (
          <span key={ci} className="tw-char inline-block">
            {ch}
          </span>
        ))}
      </span>
    );
    // Real breaking space BETWEEN word spans (as a sibling text node) so the
    // gap is preserved and lines still wrap normally.
    return wi < words.length - 1 ? [wordSpan, ' '] : [wordSpan];
  });
}

export function AboutContent() {
  const pageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const horizSectionRef = useRef<HTMLDivElement>(null);
  const mobileTrackRef = useRef<HTMLDivElement>(null);
  const mobileSectionRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      /* ── Hero: word-mask line reveal ── */
      gsap.utils.toArray<HTMLElement>('.hero-line-inner').forEach((line, i) => {
        gsap.from(line, {
          yPercent: 120,
          duration: 1.0,
          ease: 'power4.out',
          delay: 0.25 + i * 0.1,
        });
      });
      gsap.from('.hero-meta', { opacity: 0, y: 20, duration: 0.8, ease: 'power2.out', delay: 0.9 });
      gsap.from('.hero-portrait', { opacity: 0, scale: 1.08, duration: 1.4, ease: 'power3.out', delay: 0.3 });

      /* ── Horizontal pinned journey timeline ── */
      const isDesktop = window.matchMedia('(min-width: 1024px)').matches;

      if (!reduced && isDesktop && trackRef.current && horizSectionRef.current) {
        const panels = gsap.utils.toArray<HTMLElement>('.journey-panel');
        const track = trackRef.current;
        const getScrollDistance = () => track.scrollWidth - window.innerWidth;

        const horizTween = gsap.to(track, {
          x: () => -getScrollDistance(),
          ease: 'none',
          scrollTrigger: {
            trigger: horizSectionRef.current,
            start: 'top top',
            end: () => `+=${getScrollDistance()}`,
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
            anticipatePin: 1,
          },
        });

        // Per-panel inner parallax + reveal as they enter the viewport horizontally
        panels.forEach((panel) => {
          const img = panel.querySelector('.journey-img');
          if (img) {
            gsap.fromTo(img, { scale: 1.18 }, {
              scale: 1,
              ease: 'none',
              scrollTrigger: {
                trigger: panel,
                containerAnimation: horizTween,
                start: 'left right',
                end: 'right left',
                scrub: true,
              },
            });
          }
        });

        // Intro cover title: shrinks from its oversized cover state back to
        // roughly the original panel size as the horizontal scroll begins,
        // then slides out with its panel. 0.64 ≈ the old 6rem / new 9rem ratio.
        const introTitle = panels[0]?.querySelector<HTMLElement>('.journey-intro-title');
        if (introTitle) {
          gsap.to(introTitle, {
            scale: 0.64,
            ease: 'none',
            transformOrigin: 'center center',
            scrollTrigger: {
              trigger: panels[0],
              containerAnimation: horizTween,
              start: 'left left', // the moment horizontal scrolling starts
              end: 'right left', // finished as the intro panel exits left
              scrub: true,
            },
          });
        }

        // Progress bar for the journey
        gsap.to('.journey-progress-fill', {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: horizSectionRef.current,
            start: 'top top',
            end: () => `+=${getScrollDistance()}`,
            scrub: true,
          },
        });

        // Quick typewriter reveal — each era's title + body types itself out
        // (char by char) as its panel scrolls into view. Plays once only.
        panels.forEach((panel) => {
          const chars = panel.querySelectorAll<HTMLElement>('.tw-char');
          if (!chars.length) return; // intro panel has none
          gsap.set(chars, { opacity: 0 });
          const content = panel.querySelector<HTMLElement>('.journey-content') || panel;
          ScrollTrigger.create({
            trigger: content,
            containerAnimation: horizTween,
            start: 'left 78%',
            once: true,
            onEnter: () =>
              gsap.to(chars, {
                opacity: 1,
                duration: 0.01,
                ease: 'none',
                stagger: 0.012,
                overwrite: true,
              }),
          });
        });
      } else if (!reduced && !isDesktop && mobileTrackRef.current && mobileSectionRef.current) {
        // Mobile: hijack vertical scroll → drive horizontal card movement
        const track = mobileTrackRef.current;
        const section = mobileSectionRef.current;
        const getScrollWidth = () => track.scrollWidth - section.offsetWidth;

        gsap.to(track, {
          x: () => -getScrollWidth(),
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: () => `+=${getScrollWidth()}`,
            pin: true,
            scrub: 0.8,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });

        // Progress bar on mobile too
        gsap.to('.journey-progress-fill', {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: () => `+=${getScrollWidth()}`,
            scrub: true,
          },
        });
      } else {
        // Reduced motion: simple fade-in
        gsap.utils.toArray<HTMLElement>('.journey-panel').forEach((panel) => {
          gsap.from(panel, {
            opacity: 0, y: 40, duration: 0.7, ease: 'power2.out',
            scrollTrigger: { trigger: panel, start: 'top 85%' },
          });
        });
      }

      /* ── Philosophy: pinned, pillars cross-fade ── */
      gsap.utils.toArray<HTMLElement>('.section-head').forEach((el) => {
        gsap.from(el, {
          clipPath: 'inset(0 0 100% 0)', yPercent: 30, duration: 1.0, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' },
        });
      });

      gsap.utils.toArray<HTMLElement>('.pillar-item').forEach((el, i) => {
        gsap.from(el, {
          opacity: 0, y: 50, clipPath: 'inset(0 0 100% 0)', duration: 0.9, ease: 'power3.out', delay: i * 0.08,
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' },
        });
      });

      /* ── Team: stagger + image-mask reveal ── */
      const teamCards = gsap.utils.toArray<HTMLElement>('.team-card');
      if (teamCards.length) {
        teamCards.forEach((card, i) => {
          gsap.from(card, {
            opacity: 0, y: 40, duration: 0.7, ease: 'power3.out',
            delay: i * 0.1,
            immediateRender: false,
            scrollTrigger: { trigger: card, start: 'top 95%', toggleActions: 'play none none none' },
          });
        });
      }

      /* ── Stats: count up ── */
      gsap.utils.toArray<HTMLElement>('.stat-num').forEach((el) => {
        const target = Number(el.dataset.value || '0');
        const suffix = el.dataset.suffix || '';
        // Capture the final string so we can restore it after the animation
        // runs. This guarantees crawlers that only execute partial JS still
        // see the real number, and the animation re-arrives at it exactly.
        const finalText = `${target}${suffix}`;
        const obj = { v: 0 };
        gsap.to(obj, {
          v: target,
          duration: 2,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' },
          onStart: () => { el.textContent = `0${suffix}`; },
          onUpdate: () => { el.textContent = `${Math.round(obj.v)}${suffix}`; },
          onComplete: () => { el.textContent = finalText; },
        });
      });
      gsap.from('.stat-item', {
        opacity: 0, y: 30, duration: 0.7, ease: 'power2.out', stagger: 0.08,
        scrollTrigger: { trigger: '.stats-grid', start: 'top 88%', toggleActions: 'play none none none' },
      });

      /* ── Press marquee fade ── */
      gsap.from('.press-item', {
        opacity: 0, x: -20, duration: 0.6, ease: 'power2.out', stagger: 0.1,
        scrollTrigger: { trigger: '.press-row', start: 'top 90%', toggleActions: 'play none none none' },
      });
    },
    { scope: pageRef }
  );

  return (
    <div ref={pageRef} className="bg-safend-canvas">
      {/* ════════════════════ HERO ════════════════════ */}
      <section className="relative w-full min-h-[92vh] flex items-center pt-[96px] sm:pt-[90px] lg:pt-[140px] pb-[80px] overflow-hidden">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px] w-full">
          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-12 lg:gap-16 items-center">
            {/* Headline */}
            <div>
              <p className="hero-meta text-[11px] font-body text-safend-muted uppercase tracking-[0.18em] mb-8">
                Est. 2010 — Cuttack, Odisha
              </p>
              <h1
                className="font-display font-bold text-safend-ink leading-[0.86] tracking-[-0.04em]"
                style={{ fontSize: 'clamp(2.75rem, 9vw, 7.5rem)' }}
              >
                <span className="block overflow-hidden"><span className="hero-line-inner block">The Heart</span></span>
                <span className="block overflow-hidden"><span className="hero-line-inner block">Behind the</span></span>
                <span className="block overflow-hidden pb-[0.18em]"><span className="hero-line-inner block">Badge<span className="text-safend-red">.</span></span></span>
              </h1>
              <div className="hero-meta mt-10 flex items-center gap-5">
                <div className="h-[2px] w-[50px] bg-safend-red" aria-hidden />
                <p className="text-[15px] font-body text-safend-slate-grey leading-[1.6] max-w-[380px]">
                  How a guard on the frontlines built one of Odisha&apos;s most trusted security organizations.
                </p>
              </div>
            </div>

            {/* Portrait image */}
            <div className="hero-portrait relative">
              <div className="rounded-[14px] overflow-hidden aspect-3/4">
                <img
                  src="/Images/ourjourny/today.webp"
                  alt="Safend founder"
                  className="w-full h-full object-cover grayscale"
                />
              </div>
              <p className="mt-3 text-[13px] font-body italic text-safend-muted">
                From the frontlines, not a boardroom.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════ HORIZONTAL JOURNEY ════════════════════ */}
      <div ref={horizSectionRef} className="relative w-full lg:h-screen overflow-hidden bg-safend-ink hidden lg:block">
        {/* Section label */}
        <div className="absolute top-8 left-6 sm:left-10 lg:left-[50px] z-20">
          <p className="text-[11px] font-body text-safend-canvas/40 uppercase tracking-[0.18em]">
            Our Journey
          </p>
        </div>

        {/* Horizontal track (desktop) / Vertical stack (mobile) */}
        <div ref={trackRef} className="flex flex-col lg:flex-row lg:h-full lg:items-center will-change-transform">
          {/* Intro panel */}
          <div className="journey-panel relative shrink-0 lg:w-screen lg:h-full flex items-center justify-center px-6 sm:px-10 lg:px-[50px] pt-16 pb-10 lg:pt-0 lg:pb-0">
            <div className="journey-content max-w-4xl mx-auto text-center">
              <h2
                className="journey-intro-title font-display font-bold text-safend-canvas leading-[0.9] tracking-[-0.03em] will-change-transform"
                style={{ fontSize: 'clamp(2.5rem, 11vw, 9rem)' }}
              >
                A decade in<br />the making<span className="text-safend-red">.</span>
              </h2>
              <p className="mt-8 text-[18px] font-body text-safend-canvas/50 leading-[1.7] max-w-[520px] mx-auto">
                Scroll to walk through the story — from a single guard&apos;s frustration to a security agency trusted across India.
              </p>
              <div className="mt-10 hidden lg:flex items-center justify-center gap-3 text-safend-canvas/40">
                <span className="text-[11px] font-body uppercase tracking-widest">Scroll</span>
                <span className="text-safend-red">→</span>
              </div>
            </div>
          </div>

          {/* Era panels */}
          {JOURNEY.map((era) => (
            <div
              key={era.year}
              className="journey-panel relative shrink-0 lg:w-[80vw] lg:h-full flex items-center px-6 sm:px-10 lg:px-[50px] py-10 lg:py-0"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 lg:gap-16 items-center w-full max-w-6xl">
                {/* Image */}
                <div className="relative overflow-hidden rounded-[14px] aspect-16/10 lg:aspect-3/4">
                  <img
                    src={era.image}
                    alt={era.title}
                    className="journey-img w-full h-full object-cover grayscale"
                  />
                  {/* Year overlay */}
                  <span
                    className="absolute bottom-4 left-5 font-display font-bold text-safend-canvas leading-none mix-blend-difference"
                    style={{ fontSize: 'clamp(2rem, 5vw, 4rem)' }}
                  >
                    {era.year}
                  </span>
                </div>

                {/* Content */}
                <div className="journey-content">
                  <p className="text-[11px] font-body text-safend-red uppercase tracking-[0.15em] mb-4">
                    {era.kicker}
                  </p>
                  <h3
                    className="font-display font-bold text-safend-canvas leading-[0.95] tracking-[-0.02em]"
                    style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)' }}
                  >
                    {twSplit(era.title)}
                  </h3>
                  <p className="mt-6 text-[16px] font-body text-safend-canvas/55 leading-[1.7] max-w-[420px]">
                    {twSplit(era.body)}
                  </p>
                  <div className="mt-8 h-[2px] w-[40px] bg-safend-red" aria-hidden />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Journey progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-safend-canvas/10 z-20">
          <div className="journey-progress-fill h-full bg-safend-red origin-left scale-x-0" />
        </div>
      </div>

      {/* ════════════════════ MOBILE JOURNEY (scroll-hijacked horizontal) ════════════════════ */}
      <div
        ref={mobileSectionRef}
        className="lg:hidden relative w-full overflow-hidden bg-safend-ink"
        style={{ height: '92vh' }}
      >
        {/* Section label */}
        <div className="absolute top-8 left-6 z-20">
          <p className="text-[11px] font-body text-safend-canvas/40 uppercase tracking-[0.18em]">
            Our Journey
          </p>
        </div>

        {/* Horizontal track — GSAP moves this left */}
        <div
          ref={mobileTrackRef}
          className="flex flex-row items-center h-full will-change-transform"
          style={{ width: 'max-content' }}
        >
          {/* Intro card */}
          <div className="shrink-0 flex items-center justify-center px-6" style={{ width: '90vw' }}>
            <div>
              <h2
                className="font-display font-bold text-safend-canvas leading-[0.9] tracking-[-0.03em]"
                style={{ fontSize: 'clamp(2.2rem, 10vw, 3.5rem)' }}
              >
                A decade in<br />the making<span className="text-safend-red">.</span>
              </h2>
              <p className="mt-5 text-[14px] font-body text-safend-canvas/50 leading-[1.7] max-w-[320px]">
                Swipe through the story — from a single guard&apos;s frustration to a security agency trusted across India.
              </p>
              <div className="mt-6 flex items-center gap-3 text-safend-canvas/40">
                <span className="text-[11px] font-body uppercase tracking-widest">Scroll</span>
                <span className="text-safend-red">→</span>
              </div>
            </div>
          </div>

          {/* Era cards */}
          {JOURNEY.map((era) => (
            <div
              key={era.year}
              className="shrink-0 flex items-center px-4"
              style={{ width: '88vw', maxWidth: '360px' }}
            >
              <div className="w-full rounded-[20px] overflow-hidden border border-safend-canvas/10 bg-safend-canvas/5 flex flex-col" style={{ height: '78vh', maxHeight: '640px' }}>
                {/* Image */}
                <div className="relative overflow-hidden" style={{ height: '46%' }}>
                  <img
                    src={era.image}
                    alt={era.title}
                    className="w-full h-full object-cover grayscale"
                  />
                  <span
                    className="absolute bottom-3 left-4 font-display font-bold text-safend-canvas leading-none mix-blend-difference"
                    style={{ fontSize: 'clamp(1.75rem, 7vw, 2.5rem)' }}
                  >
                    {era.year}
                  </span>
                </div>
                {/* Content */}
                <div className="flex flex-col flex-1 px-5 pt-5 pb-6">
                  <p className="text-[10px] font-body text-safend-red uppercase tracking-[0.15em] mb-2">
                    {era.kicker}
                  </p>
                  <h3
                    className="font-display font-bold text-safend-canvas leading-[0.95] tracking-[-0.02em]"
                    style={{ fontSize: 'clamp(1.25rem, 5vw, 1.6rem)' }}
                  >
                    {era.title}
                  </h3>
                  <p className="mt-3 text-[13px] font-body text-safend-canvas/55 leading-[1.6] line-clamp-4">
                    {era.body}
                  </p>
                  <div className="mt-auto pt-4 h-[2px] w-[28px] bg-safend-red" />
                </div>
              </div>
            </div>
          ))}

          {/* Trailing spacer */}
          <div className="shrink-0 w-6" aria-hidden />
        </div>

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-safend-canvas/10 z-20">
          <div className="journey-progress-fill h-full bg-safend-red origin-left scale-x-0" />
        </div>
      </div>

      {/* ════════════════════ PHILOSOPHY ════════════════════ */}
      <section className="w-full py-[100px] lg:py-[160px]">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <div className="section-head mb-16 max-w-4xl">
            <p className="text-[11px] font-body text-safend-muted uppercase tracking-[0.18em] mb-6">
              Our Philosophy
            </p>
            <h2
              className="font-display font-bold text-safend-ink leading-[0.92] tracking-[-0.03em]"
              style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)' }}
            >
              Almost 100% retention,<br />year after year<span className="text-safend-red">.</span>
            </h2>
            <p className="mt-6 text-[16px] font-body text-safend-slate-grey leading-[1.6] max-w-[520px]">
              A record almost unheard of in the industry. We accomplish it by holding to three pillars — in this exact order.
            </p>
          </div>

          {/* Ordered flow — the pillars build on one another, in order */}
          <div className="mb-10 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-[12px] font-body font-semibold uppercase tracking-[0.16em] text-safend-ink">People</span>
            <span className="text-safend-red" aria-hidden>→</span>
            <span className="text-[12px] font-body font-semibold uppercase tracking-[0.16em] text-safend-ink">Service</span>
            <span className="text-safend-red" aria-hidden>→</span>
            <span className="text-[12px] font-body font-semibold uppercase tracking-[0.16em] text-safend-ink">Profit</span>
            <span className="ml-1 text-[13px] font-body text-safend-muted">— each one holds up the next.</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {PILLARS.map((p) => (
              <div key={p.title} className="pillar-item">
                <div className="group relative flex h-full flex-col overflow-hidden rounded-[16px] border border-safend-mist bg-white transition-colors duration-500 hover:border-safend-ink/20">
                  {/* Capital — the column's cap; fills red on hover */}
                  <div className="h-[10px] w-full bg-safend-ink/8 transition-colors duration-500 group-hover:bg-safend-red" />

                  <div className="relative flex flex-1 flex-col px-8 pt-10 pb-9 lg:px-10">
                    {/* Fluting — faint vertical grooves that read as a column shaft */}
                    <div
                      className="pointer-events-none absolute inset-0 opacity-[0.04] transition-opacity duration-500 group-hover:opacity-[0.07]"
                      style={{ backgroundImage: 'repeating-linear-gradient(90deg, #141414 0, #141414 1px, transparent 1px, transparent 13px)' }}
                      aria-hidden
                    />

                    {/* Index row */}
                    <div className="relative mb-9 flex items-baseline justify-between">
                      <span className="text-[11px] font-body uppercase tracking-[0.18em] text-safend-muted">
                        Pillar {p.n}
                      </span>
                      <span
                        className="font-display font-bold leading-none text-safend-ink/[0.07] transition-colors duration-500 group-hover:text-safend-red/20"
                        style={{ fontSize: 'clamp(2.75rem, 4vw, 4rem)' }}
                        aria-hidden
                      >
                        {p.n}
                      </span>
                    </div>

                    <h3
                      className="relative font-display font-bold leading-none text-safend-ink"
                      style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)' }}
                    >
                      {p.title}
                    </h3>

                    <p className="relative mt-5 text-[14px] font-body leading-[1.7] text-safend-slate-grey">
                      {p.desc}
                    </p>

                    {/* Base — sweeps full width on hover, like a column plinth */}
                    <div className="relative mt-auto pt-9">
                      <div className="h-[2px] w-full overflow-hidden bg-safend-mist">
                        <span className="block h-full origin-left scale-x-0 bg-safend-red transition-transform duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-x-100" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════ TEAM ════════════════════ */}
      <section className="w-full py-[100px] lg:py-[160px] border-t border-safend-mist">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <div className="section-head mb-16">
            <p className="text-[11px] font-body text-safend-muted uppercase tracking-[0.18em] mb-6">
              Our Core Team
            </p>
            <h2
              className="font-display font-bold text-safend-ink leading-[0.92] tracking-[-0.03em]"
              style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)' }}
            >
              The people behind<br />the protection<span className="text-safend-red">.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 lg:gap-10">
            {TEAM.map((m, i) => (
              <div
                key={m.name}
                className="team-card group relative rounded-[20px] border border-safend-mist bg-safend-canvas overflow-hidden transition-all duration-500 hover:border-safend-ink hover:-translate-y-1"
              >
                <div className="flex flex-col">
                  {/* Photo — tall portrait */}
                  <div className="relative w-full overflow-hidden bg-safend-ink/5" style={{ aspectRatio: '5/3' }}>
                    {/* Index badge */}
                    <span className="absolute top-4 left-4 z-10 text-[11px] font-body text-safend-canvas/60 uppercase tracking-[0.12em]">
                      0{i + 1}
                    </span>

                    {/* Monogram placeholder */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span
                        className="font-display font-bold text-safend-ink/12 leading-none transition-transform duration-700 group-hover:scale-110"
                        style={{ fontSize: 'clamp(3rem, 6vw, 5.5rem)' }}
                      >
                        {m.name.split(' ').map((n) => n[0]).join('')}
                      </span>
                    </div>

                    {m.image && (
                      <img
                        src={m.image}
                        alt={m.name}
                        loading="lazy"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        className="absolute inset-0 w-full h-full object-cover object-top grayscale transition-all duration-700 group-hover:grayscale-0 group-hover:scale-105"
                      />
                    )}

                    {/* Red accent line on hover */}
                    <span className="absolute bottom-0 left-0 h-[3px] w-0 bg-safend-red group-hover:w-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] z-10" />
                  </div>

                  {/* Info */}
                  <div className="p-5 lg:p-6 flex flex-col justify-center">
                    <h3 className="font-display font-bold text-safend-ink leading-none" style={{ fontSize: 'clamp(1.1rem, 1.6vw, 1.4rem)' }}>
                      {m.name}
                    </h3>
                    <p className="text-[10px] font-body text-safend-red uppercase tracking-widest mt-1.5">
                      {m.role}
                    </p>
                    <p className="mt-3 text-[13px] font-body text-safend-slate-grey leading-[1.6]">
                      {m.desc}
                    </p>

                    {/* LinkedIn button */}
                    <a
                      href={m.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-5 inline-flex items-center gap-2 self-start rounded-full border border-safend-mist px-4 py-2 text-[12px] font-heading font-medium text-safend-ink/70 transition-all duration-300 hover:border-safend-red hover:text-safend-red hover:bg-safend-red/5"
                      aria-label={`${m.name} on LinkedIn`}
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
                      </svg>
                      Connect
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════ CTA ════════════════════ */}
      <HomeCta />
    </div>
  );
}
