'use client';

import { useRef, useCallback } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, useGSAP);

/* ─── Types ────────────────────────────────────────────────────────────── */

export type LegalSection = {
  /** Short label used in the side index (e.g. "Data We Collect"). */
  heading: string;
  /** Body paragraphs. */
  body?: string[];
  /** Optional bullet list rendered after the body. */
  list?: string[];
};

export type LegalDocumentProps = {
  kicker: string;
  title: string;
  titleAccent?: string;
  intro: string;
  lastUpdated: string;
  sections: LegalSection[];
};

/* ─── Helpers ──────────────────────────────────────────────────────────── */

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const pad = (n: number) => String(n + 1).padStart(2, '0');

/* ─── Component ────────────────────────────────────────────────────────── */

export function LegalDocument({
  kicker,
  title,
  titleAccent = '.',
  intro,
  lastUpdated,
  sections,
}: LegalDocumentProps) {
  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from('.legal-hero-line', {
        yPercent: 120,
        duration: 1,
        ease: 'power4.out',
        stagger: 0.08,
        delay: 0.2,
      });
      gsap.from('.legal-hero-meta', {
        opacity: 0,
        y: 20,
        duration: 0.8,
        ease: 'power2.out',
        delay: 0.7,
      });

      gsap.utils.toArray<HTMLElement>('.legal-section').forEach((el) => {
        gsap.from(el, {
          opacity: 0,
          y: 40,
          duration: 0.7,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' },
        });
      });
    },
    { scope: pageRef }
  );

  return (
    <div ref={pageRef} className="bg-safend-canvas">
      {/* ════════════════════ HERO ════════════════════ */}
      <section className="relative w-full pt-[96px] sm:pt-[90px] lg:pt-[160px] pb-[50px] lg:pb-[70px] overflow-hidden">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px] w-full">
          <p className="legal-hero-meta text-[11px] font-body text-safend-muted uppercase tracking-[0.18em] mb-8">
            {kicker}
          </p>
          <h1
            className="font-display font-bold text-safend-ink leading-[0.88] tracking-[-0.04em]"
            style={{ fontSize: 'clamp(2.5rem, 8vw, 6rem)' }}
          >
            <span className="block overflow-hidden">
              <span className="legal-hero-line block">
                {title}
                <span className="text-safend-red">{titleAccent}</span>
              </span>
            </span>
          </h1>
          <div className="legal-hero-meta mt-9 flex items-center gap-5">
            <div className="h-[2px] w-[50px] bg-safend-red" aria-hidden />
            <p className="text-[15px] font-body text-safend-slate-grey leading-[1.6] max-w-[560px]">
              {intro}
            </p>
          </div>
          <p className="legal-hero-meta mt-7 text-[12px] font-body text-safend-muted uppercase tracking-[0.12em]">
            Last updated: {lastUpdated}
          </p>
        </div>
      </section>

      {/* ════════════════════ BODY ════════════════════ */}
      <section className="w-full pb-[100px] lg:pb-[150px] border-t border-safend-mist">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-12 lg:gap-20 pt-[60px] lg:pt-[80px]">
            {/* ── Side index ── */}
            <aside className="lg:sticky lg:top-[120px] self-start">
              <p className="text-[11px] font-body text-safend-muted uppercase tracking-[0.15em] mb-5">
                Contents
              </p>
              <nav>
                <ol className="space-y-3">
                  {sections.map((s, i) => (
                    <li key={s.heading}>
                      <button
                        type="button"
                        onClick={() => {
                          const target = document.getElementById(slugify(s.heading));
                          if (!target) return;
                          // Use ScrollSmoother if available (handles normalizeScroll)
                          const smoother = ScrollSmoother.get();
                          if (smoother) {
                            smoother.scrollTo(target, true, 'top 100px');
                          } else {
                            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }}
                        className="group flex items-start gap-3 text-[13px] font-body text-safend-slate-grey hover:text-safend-ink transition-colors duration-200 text-left"
                      >
                        <span className="text-[11px] font-heading text-safend-red/70 pt-px shrink-0">
                          {pad(i)}
                        </span>
                        <span className="leading-[1.4]">{s.heading}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </nav>
            </aside>

            {/* ── Sections ── */}
            <div className="max-w-[760px]">
              {sections.map((s, i) => (
                <article
                  key={s.heading}
                  id={slugify(s.heading)}
                  className="legal-section scroll-mt-[120px] mb-14 lg:mb-16 last:mb-0"
                >
                  <div className="flex items-baseline gap-4 mb-5">
                    <span className="text-[12px] font-heading font-semibold text-safend-red">
                      {pad(i)}
                    </span>
                    <h2
                      className="font-display font-bold text-safend-ink leading-[1.05] tracking-[-0.02em]"
                      style={{ fontSize: 'clamp(1.4rem, 3vw, 2.1rem)' }}
                    >
                      {s.heading}
                    </h2>
                  </div>

                  {s.body?.map((p, pi) => (
                    <p
                      key={pi}
                      className="text-[15px] font-body text-safend-slate-grey leading-[1.75] mb-4 last:mb-0"
                    >
                      {p}
                    </p>
                  ))}

                  {s.list && (
                    <ul className="mt-4 space-y-3">
                      {s.list.map((item, li) => (
                        <li
                          key={li}
                          className="flex items-start gap-3 text-[15px] font-body text-safend-slate-grey leading-[1.7]"
                        >
                          <span
                            className="mt-[9px] h-[6px] w-[6px] rounded-full bg-safend-red shrink-0"
                            aria-hidden
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
