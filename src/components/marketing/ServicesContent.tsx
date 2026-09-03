'use client';

import { useRef, useState } from 'react';
import {
  Shield, ShieldAlert, UserCheck, Users, PawPrint, Camera,
  Check, ArrowRight, ArrowUpRight, ScanSearch, Workflow, RadioTower,
} from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { SERVICES } from '@/data/services';
import { ServiceEntry } from '@/types/marketing';
import { HomeCta } from './HomeCta';
import { LeadCaptureModal } from './LeadCaptureModal';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield, ShieldAlert, UserCheck, Users, PawPrint, Camera,
};

// Fallback images (cycled) for any service without a dedicated image.
const SERVICE_IMAGES = ['/guards-team.png', '/guards-armed.jpg', '/guards-uniform.jpg'];

const PROCESS = [
  { icon: ScanSearch, step: 'Evaluation', desc: 'We start by walking your site and understanding what you actually need protected. No two places carry the same risk, so the plan starts with yours.' },
  { icon: Workflow, step: 'Execution', desc: 'Then we put the plan to work — the right guards, the right shifts, and the tech to back them up. You get one point of contact, not a phone tree.' },
  { icon: RadioTower, step: 'Threat Advisory', desc: 'We keep watching after we set up. If something changes on the ground or a new risk shows up, you hear it from us first.' },
] as const;

export default function ServicesContent() {
  const pageRef = useRef<HTMLDivElement>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);

  useGSAP(
    () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      /* Hero line reveal */
      gsap.utils.toArray<HTMLElement>('.svc-hero-line').forEach((line, i) => {
        gsap.from(line, { yPercent: 120, duration: 1.0, ease: 'power4.out', delay: 0.25 + i * 0.1 });
      });
      gsap.from('.svc-hero-meta', { opacity: 0, y: 20, duration: 0.8, ease: 'power2.out', delay: 0.9 });

      /* Marquee scrub */
      const marquee = pageRef.current?.querySelector('.svc-marquee-inner');
      if (marquee && !reduced) {
        gsap.to(marquee, {
          xPercent: -35, ease: 'none',
          scrollTrigger: { trigger: '.svc-marquee', start: 'top bottom', end: 'bottom top', scrub: 1 },
        });
      }

      /* Bento cards reveal */
      gsap.utils.toArray<HTMLElement>('.bento-card').forEach((card, i) => {
        gsap.from(card, {
          y: 50, opacity: 0, scale: 0.96, duration: 0.8, ease: 'power3.out', delay: (i % 3) * 0.08,
          scrollTrigger: { trigger: '.bento-grid', start: 'top 80%', toggleActions: 'play none none none' },
        });
      });

      /* Section headlines clip reveal */
      gsap.utils.toArray<HTMLElement>('.section-head').forEach((el) => {
        gsap.from(el, {
          clipPath: 'inset(0 0 100% 0)', yPercent: 25, duration: 1.0, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' },
        });
      });

      /* ── Detailed service blocks → sticky stacking cards ── */
      const mm = gsap.matchMedia();

      // All screen sizes: each card pins at navOffset. The next card (higher
      // z-index) scrolls up naturally and lands on top. Once it arrives, it also
      // pins. On scroll-up, cards unpin and slide back down one by one.
      // Mobile gets the same stacking experience as desktop.
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const cards = gsap.utils.toArray<HTMLElement>('.stack-card');
        const isMobile = window.matchMedia('(max-width: 1023px)').matches;
        const navOffset = isMobile ? 72 : 96;

        cards.forEach((card, i) => {
          const inner = card.querySelector<HTMLElement>('.stack-card-inner');
          const dim = card.querySelector<HTMLElement>('.stack-dim');
          const pimg = card.querySelector<HTMLElement>('.svc-parallax-img');
          const isLast = i === cards.length - 1;

          // Pin every card except the last one. The last card scrolls naturally
          // so it doesn't overlap the section below.
          if (!isLast) {
            ScrollTrigger.create({
              trigger: card,
              start: `top ${navOffset}`,
              endTrigger: cards[cards.length - 1],
              end: `top ${navOffset}`,
              pin: true,
              pinSpacing: false,
              invalidateOnRefresh: true,
            });
          }

          // ── Color in: when this card arrives at its pinned position,
          // transition from grayscale to full color.
          if (pimg) {
            gsap.fromTo(
              pimg,
              { filter: 'grayscale(100%)' },
              {
                filter: 'grayscale(0%)',
                ease: 'none',
                scrollTrigger: {
                  trigger: card,
                  start: 'top bottom',
                  end: `top ${navOffset}`,
                  scrub: true,
                  invalidateOnRefresh: true,
                },
              }
            );
          }

          // ── Color out: when the next card covers this one, fade back to grayscale.
          const next = cards[i + 1];
          if (next && inner) {
            const tl = gsap.timeline({
              scrollTrigger: {
                trigger: next,
                start: 'top bottom',
                end: `top ${navOffset}`,
                scrub: true,
                invalidateOnRefresh: true,
              },
            });
            tl.to(inner, { scale: 0.92, transformOrigin: 'center top', ease: 'none' }, 0);
            if (dim) tl.to(dim, { opacity: 0.3, ease: 'none' }, 0);
            if (pimg) tl.to(pimg, { filter: 'grayscale(100%)', ease: 'none' }, 0);
          }

          // Subtle parallax on the image as card enters from below.
          if (i > 0 && pimg) {
            gsap.fromTo(
              pimg,
              { scale: 1.1, yPercent: 5 },
              {
                scale: 1,
                yPercent: 0,
                ease: 'none',
                scrollTrigger: {
                  trigger: card,
                  start: 'top bottom',
                  end: `top ${navOffset}`,
                  scrub: true,
                  invalidateOnRefresh: true,
                },
              }
            );
          }
        });

        // Re-measure once images finish loading.
        const refresh = () => ScrollTrigger.refresh();
        window.addEventListener('load', refresh);
        return () => window.removeEventListener('load', refresh);
      });

      // Reduced motion only: simple fade-up, no pinning.
      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.utils.toArray<HTMLElement>('.stack-card').forEach((card) => {
          gsap.from(card, {
            y: 40, opacity: 0, duration: 0.7, ease: 'power3.out',
            scrollTrigger: { trigger: card, start: 'top 85%', toggleActions: 'play none none none' },
          });
        });
      });

      /* Process steps */
      gsap.utils.toArray<HTMLElement>('.process-step').forEach((step, i) => {
        gsap.from(step, {
          y: 50, opacity: 0, clipPath: 'inset(0 0 100% 0)', duration: 0.9, ease: 'power3.out', delay: i * 0.1,
          scrollTrigger: { trigger: '.process-grid', start: 'top 80%', toggleActions: 'play none none none' },
        });
      });
    },
    { scope: pageRef }
  );

  return (
    <div ref={pageRef} className="bg-safend-canvas">
      {/* ════════════ HERO ════════════ */}
      <section className="w-full pt-[120px] lg:pt-[150px] pb-[50px] lg:pb-[70px]">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <p className="svc-hero-meta text-[11px] font-body text-safend-muted uppercase tracking-[0.18em] mb-8">
            Our Services
          </p>
          <h1
            className="font-display font-bold text-safend-ink leading-[0.86] tracking-[-0.04em]"
            style={{ fontSize: 'clamp(2.75rem, 9vw, 7.5rem)' }}
          >
            <span className="block overflow-hidden"><span className="svc-hero-line block">Every threat.</span></span>
            <span className="block overflow-hidden"><span className="svc-hero-line block">One partner<span className="text-safend-red">.</span></span></span>
          </h1>
          <div className="svc-hero-meta mt-10 flex items-center gap-5">
            <div className="h-[2px] w-[50px] bg-safend-red" aria-hidden />
            <p className="text-[15px] font-body text-safend-slate-grey leading-[1.6] max-w-[440px]">
              One guard or a hundred. A camera or a K9 unit. Tell us the problem and we&apos;ll put the right people on it.
            </p>
          </div>

          {/* Hero banner image */}
          <div className="svc-hero-meta mt-10 lg:mt-16 relative rounded-[18px] overflow-hidden aspect-4/3 sm:aspect-video lg:aspect-2/1">
            <img
              src="/Images/all-guards.webp"
              alt="Safend security personnel on deployment"
              className="w-full h-full object-cover object-top lg:object-[center_20%]"
            />
            <div className="absolute inset-0 bg-linear-to-t from-safend-ink/40 to-transparent" aria-hidden />
          </div>
        </div>
      </section>

      {/* ════════════ MARQUEE ════════════ */}
      <div className="svc-marquee w-full py-8 border-y border-safend-mist overflow-hidden">
        <div className="svc-marquee-inner flex items-center gap-10 whitespace-nowrap">
          {[...SERVICES, ...SERVICES, ...SERVICES].map((s, i) => (
            <div key={`${s.id}-${i}`} className="flex items-center gap-10 shrink-0">
              <span
                className="font-display font-bold text-safend-ink/40 select-none"
                style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}
              >
                {s.name}
              </span>
              <span className="w-[6px] h-[6px] rounded-full bg-safend-red/30 shrink-0" aria-hidden />
            </div>
          ))}
        </div>
      </div>

      {/* ════════════ BENTO GRID ════════════ */}
      <section className="w-full py-[90px] lg:py-[130px]">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <div className="section-head mb-12 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <p className="text-[11px] font-body text-safend-muted uppercase tracking-[0.15em] mb-5">
                Capabilities — {String(SERVICES.length).padStart(2, '0')}
              </p>
              <h2
                className="font-display font-bold text-safend-ink leading-[0.92] tracking-[-0.03em]"
                style={{ fontSize: 'clamp(1.75rem, 5vw, 3.5rem)' }}
              >
                What we protect<span className="text-safend-red">.</span>
              </h2>
            </div>
            <p className="text-[14px] font-body text-safend-slate-grey leading-[1.6] max-w-[320px]">
              Six things we do. Tap any one to read the detail.
            </p>
          </div>

          {/* Service card grid — uniform, image-driven, modern */}
          <div className="bento-grid grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-5">
            {SERVICES.map((s, i) => {
              const Icon = s.icon ? ICON_MAP[s.icon] : Shield;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="bento-card group relative overflow-hidden rounded-[14px] lg:rounded-[18px] bg-safend-ink aspect-3/4 lg:aspect-square"
                >
                  {/* Background image */}
                  <img
                    src={s.image || SERVICE_IMAGES[i % SERVICE_IMAGES.length]}
                    alt={s.name}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover grayscale opacity-55 transition-all duration-700 group-hover:grayscale-0 group-hover:opacity-75 group-hover:scale-[1.05]"
                  />
                  {/* Dark gradient for legibility */}
                  <div className="absolute inset-0 bg-linear-to-t from-safend-ink via-safend-ink/40 to-transparent" />
                  {/* Red wash on hover */}
                  <div className="absolute inset-0 bg-safend-red/0 group-hover:bg-safend-red/10 transition-colors duration-500" />

                  {/* Top row — icon chip + number */}
                  <div className="relative z-10 flex items-start justify-between p-3 lg:p-6">
                    <span className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all duration-300 group-hover:bg-safend-red group-hover:border-safend-red">
                      <Icon className="w-[14px] h-[14px] lg:w-[18px] lg:h-[18px]" />
                    </span>
                    <span className="text-[10px] lg:text-[12px] font-body text-white/50 tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>

                  {/* Bottom — name + tagline + arrow */}
                  <div className="absolute bottom-0 inset-x-0 z-10 p-3 lg:p-6">
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <h3
                          className="font-display font-bold text-white leading-[1.05] tracking-[-0.02em]"
                          style={{ fontSize: 'clamp(0.85rem, 2.5vw, 1.6rem)' }}
                        >
                          {s.name}
                        </h3>
                        <p className="mt-1 text-[11px] font-body text-white/55 italic max-h-0 opacity-0 group-hover:max-h-12 group-hover:opacity-100 transition-all duration-500 overflow-hidden hidden lg:block">
                          {s.tagline}
                        </p>
                      </div>
                      <span className="shrink-0 w-7 h-7 lg:w-9 lg:h-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white transition-all duration-300 group-hover:bg-white group-hover:text-safend-ink">
                        <ArrowUpRight className="w-3.5 h-3.5 transition-transform duration-300 -rotate-45 group-hover:rotate-0" />
                      </span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════ DETAILED SERVICE BLOCKS — stacking cards ════════════ */}
      <section className="services-stack w-full px-6 sm:px-10 lg:px-[50px] pt-[50px] lg:pt-[80px] pb-[40px] lg:pb-[60px]">
        <div className="max-w-editorial mx-auto flex flex-col lg:gap-[60vh]">
          {SERVICES.map((service, index) => (
            <ServiceBlock
              key={service.id}
              service={service}
              index={index}
              total={SERVICES.length}
              onQuote={() => setQuoteOpen(true)}
            />
          ))}
        </div>
      </section>

      {/* ════════════ PROCESS ════════════ */}
      <section className="w-full bg-safend-ink py-[100px] lg:py-[150px]">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <div className="flex items-center gap-4 mb-14">
            <span className="h-2 w-2 rounded-full bg-safend-red" aria-hidden />
            <p className="text-[11px] font-body text-safend-canvas/40 uppercase tracking-[0.18em]">
              How we work
            </p>
          </div>
          <h2
            className="font-display font-bold text-safend-canvas leading-[0.92] tracking-[-0.03em] max-w-3xl mb-16"
            style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)' }}
          >
            Evaluate. Execute.<br />Advise<span className="text-safend-red">.</span>
          </h2>

          <div className="process-grid grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-5">
            {PROCESS.map((p, i) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.step}
                  className="process-step group relative rounded-[16px] md:rounded-[18px] border border-white/10 bg-white/3 overflow-hidden transition-all duration-500 hover:bg-white/6 hover:border-white/20"
                >
                  {/* Connecting number watermark — desktop only */}
                  <span
                    className="pointer-events-none absolute -top-4 -right-2 font-display font-bold text-white/4 leading-none select-none hidden md:block"
                    style={{ fontSize: 'clamp(5rem, 9vw, 8rem)' }}
                    aria-hidden
                  >
                    0{i + 1}
                  </span>

                  {/* Mobile: compact horizontal row */}
                  <div className="flex md:hidden items-center gap-4 px-5 py-4">
                    <span className="shrink-0 w-10 h-10 rounded-[10px] bg-safend-red/15 flex items-center justify-center text-safend-red">
                      <Icon className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-display font-bold text-safend-canvas text-[16px] leading-none">
                          {p.step}
                        </h3>
                        <span className="shrink-0 text-[10px] font-body text-safend-canvas/30 uppercase tracking-widest">
                          0{i + 1}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[13px] font-body text-safend-canvas/55 leading-normal">
                        {p.desc}
                      </p>
                    </div>
                  </div>

                  {/* Desktop: original card layout */}
                  <div className="hidden md:block p-8 lg:p-10">
                    <div className="relative flex items-center justify-between mb-8">
                      <span className="w-12 h-12 rounded-[12px] bg-safend-red/15 flex items-center justify-center text-safend-red transition-colors duration-500 group-hover:bg-safend-red group-hover:text-white">
                        <Icon className="w-6 h-6" />
                      </span>
                      <span className="text-[11px] font-body text-safend-canvas/30 uppercase tracking-[0.12em]">
                        Step 0{i + 1}
                      </span>
                    </div>
                    <h3 className="relative font-display font-bold text-safend-canvas text-[22px] lg:text-[26px] leading-none">
                      {p.step}
                    </h3>
                    <p className="relative mt-4 text-[14px] font-body text-safend-canvas/55 leading-[1.65]">
                      {p.desc}
                    </p>
                    <div className="relative mt-8 h-[2px] w-full bg-white/10 overflow-hidden">
                      <span className="absolute inset-0 bg-safend-red origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════ CTA ════════════ */}
      <HomeCta />

      <LeadCaptureModal open={quoteOpen} onOpenChange={setQuoteOpen} />
    </div>
  );
}

/* ─── Detailed alternating service block ─────────────────────────────────── */
function ServiceBlock({ service, index, total, onQuote }: { service: ServiceEntry; index: number; total: number; onQuote: () => void }) {
  const Icon = service.icon ? ICON_MAP[service.icon] : Shield;
  const isReversed = index % 2 !== 0;
  const image = service.image || SERVICE_IMAGES[index % SERVICE_IMAGES.length];

  return (
    <div
      id={service.id}
      className="service-block stack-card scroll-mt-28"
      style={{ zIndex: index + 1 }}
    >
      <div className="stack-card-inner relative overflow-hidden rounded-[18px] sm:rounded-[24px] border border-safend-mist bg-safend-canvas shadow-[0_-12px_50px_-18px_rgba(20,20,20,0.22)] px-5 sm:px-10 lg:px-[60px] py-[28px] sm:py-[44px] lg:py-[60px] min-h-auto sm:min-h-[calc(100vh-72px)] lg:min-h-[calc(100vh-96px)] flex flex-col justify-center">
        {/* Dim overlay — fades in as the next card covers this one */}
        <div className="stack-dim pointer-events-none absolute inset-0 z-20 bg-safend-ink opacity-0" aria-hidden />
        <div className={`relative grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-16 items-center ${isReversed ? 'lg:[direction:rtl]' : ''}`}>
          {/* Image */}
          <div className={`svc-img ${isReversed ? 'lg:[direction:ltr]' : ''}`}>
            <div className="relative rounded-[12px] sm:rounded-[14px] overflow-hidden max-h-[22vh] sm:max-h-[26vh] lg:max-h-none">
              <img src={image} alt={service.name} loading="lazy" className="svc-parallax-img block w-full h-full lg:h-auto object-cover transition-[filter] duration-700 will-change-transform" style={{ filter: 'grayscale(100%)' }} />
              {/* Big index overlaid */}
              <span
                className="absolute top-3 left-4 sm:top-4 sm:left-5 font-display font-bold text-white leading-none mix-blend-difference"
                style={{ fontSize: 'clamp(1.75rem, 5vw, 4rem)' }}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
            </div>
          </div>

          {/* Content */}
          <div className={`svc-content ${isReversed ? 'lg:[direction:ltr]' : ''}`}>
            <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-5">
              <span className="w-7 h-7 sm:w-10 sm:h-10 rounded-[8px] sm:rounded-[10px] bg-safend-red/10 flex items-center justify-center text-safend-red">
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
              </span>
              <span className="text-[9px] sm:text-[11px] font-body text-safend-red uppercase tracking-[0.12em]">
                {service.tagline}
              </span>
            </div>

            <h2
              className="font-display font-bold text-safend-ink leading-[0.95] tracking-[-0.02em]"
              style={{ fontSize: 'clamp(1.4rem, 4vw, 3rem)' }}
            >
              {service.name}
            </h2>

            <p className="mt-2 sm:mt-5 text-[12px] sm:text-[16px] font-body text-safend-slate-grey leading-normal sm:leading-[1.7] max-w-[460px]">
              {service.description}
            </p>

            {/* Features checklist */}
            {service.features && (
              <ul className="mt-4 sm:mt-8 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 sm:gap-y-3">
                {service.features.slice(0, 6).map((f) => (
                  <li key={f} className="svc-feature flex items-start gap-2 sm:gap-2.5 text-[11px] sm:text-[13px] font-body text-safend-ink/80 leading-[1.4]">
                    <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-safend-red shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            )}

            {/* Use cases as pills */}
            {service.useCases && (
              <div className="mt-4 sm:mt-8 flex flex-wrap gap-1.5 sm:gap-2">
                {service.useCases.map((uc) => (
                  <span key={uc} className="rounded-full border border-safend-mist px-2.5 py-1 sm:px-3.5 sm:py-1.5 text-[10px] sm:text-[12px] font-body text-safend-ink/60">
                    {uc}
                  </span>
                ))}
              </div>
            )}

            {/* Per-service CTA */}
            <button
              type="button"
              onClick={onQuote}
              className="group/cta mt-5 sm:mt-10 inline-flex items-center gap-2 rounded-[8px] sm:rounded-[10px] bg-safend-red px-5 py-2.5 sm:px-7 sm:py-3.5 text-[11px] sm:text-[13px] font-heading font-semibold tracking-[0.01em] uppercase text-white transition-all duration-300 hover:bg-[#b8151b]"
            >
              I want a quotation
              <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform duration-300 group-hover/cta:translate-x-1" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
