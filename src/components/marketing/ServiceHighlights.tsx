'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, Shield, ShieldAlert, UserCheck, Users, PawPrint, Camera } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { SERVICES } from '@/data/services';
import { ServiceEntry } from '@/types/marketing';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield, ShieldAlert, UserCheck, Users, PawPrint, Camera,
};

/**
 * Service highlights — capability preview with horizontally stacking cards.
 * On desktop, the stage pins and each card flies in from alternating sides
 * (left, right, left) settling into a fanned horizontal stack. On mobile and
 * with reduced motion, cards stack vertically with a simple fade-in.
 */

function isValidEntry(entry: ServiceEntry): boolean {
  const name = entry.name?.trim() ?? '';
  const description = entry.description?.trim() ?? '';
  return name.length >= 1 && name.length <= 60 && description.length >= 1 && description.length <= 500;
}

export default function ServiceHighlights() {
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const previewServices = SERVICES.filter(isValidEntry).slice(0, 3);
  const totalServices = SERVICES.filter(isValidEntry).length;
  const moreCount = Math.max(totalServices - previewServices.length, 0);

  useGSAP(
    () => {
      // ─── Header reveal ───
      const headerChars = headerRef.current?.querySelectorAll('.svc-char');
      if (headerChars && headerChars.length) {
        gsap.from(headerChars, {
          y: '100%',
          opacity: 0,
          duration: 0.7,
          ease: 'power3.out',
          stagger: 0.02,
          scrollTrigger: {
            trigger: headerRef.current,
            start: 'top 80%',
            toggleActions: 'play none none none',
          },
        });
      }

      const mm = gsap.matchMedia();

      // ─── Desktop: cards fly in from alternating sides and STACK on top ───
      mm.add(
        {
          isDesktop: '(min-width: 1024px) and (prefers-reduced-motion: no-preference)',
        },
        (ctx) => {
          if (!ctx.conditions?.isDesktop || !stageRef.current) return;
          const cards = gsap.utils.toArray<HTMLElement>('.svc-stack-card');
          if (!cards.length) return;

          // Where a card sits once it is `depth` levels below the top of the stack.
          // depth 0 = active card: dead-centre, full size, fully readable.
          // depth >= 1 = receded behind, peeking out a touch on alternating sides.
          const behind = (depth: number, leansLeft: boolean) => ({
            xPercent: (leansLeft ? -1 : 1) * depth * 4,
            yPercent: -depth * 2.5,
            rotation: (leansLeft ? -1 : 1) * depth * 1.5,
            scale: 1 - depth * 0.05,
          });

          // Later cards render above earlier ones.
          cards.forEach((card, i) => gsap.set(card, { zIndex: i + 1 }));

          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: stageRef.current,
              start: 'top top',
              end: () => `+=${cards.length * 560}`,
              scrub: 0.6,
              pin: true,
              pinType: 'transform',
              anticipatePin: 1,
              invalidateOnRefresh: true,
            },
          });

          cards.forEach((card, i) => {
            const fromLeft = i % 2 === 0; // 0:left, 1:right, 2:left ...
            const img = card.querySelector<HTMLElement>('.svc-stack-img');
            const dim = card.querySelector<HTMLElement>('.svc-stack-dim');
            const start = i;

            // This card flies in from its side and lands centred on top (depth 0).
            tl.fromTo(
              card,
              {
                xPercent: fromLeft ? -120 : 120,
                yPercent: 0,
                rotation: fromLeft ? -8 : 8,
                scale: 0.92,
                opacity: 0,
              },
              {
                xPercent: 0,
                yPercent: 0,
                rotation: 0,
                scale: 1,
                opacity: 1,
                ease: 'power3.out',
                duration: 1,
              },
              start
            );
            if (img) {
              tl.fromTo(
                img,
                { filter: 'grayscale(100%)' },
                { filter: 'grayscale(0%)', ease: 'none', duration: 1 },
                start
              );
            }

            // Every card already placed recedes one level deeper behind this one.
            for (let j = 0; j < i; j++) {
              const depth = i - j;
              const jLeansLeft = j % 2 === 0;
              tl.to(
                cards[j],
                { ...behind(depth, jLeansLeft), ease: 'power3.out', duration: 1 },
                start
              );
              const jDim = cards[j].querySelector<HTMLElement>('.svc-stack-dim');
              if (jDim) {
                tl.to(jDim, { opacity: Math.min(0.12 * depth, 0.45), duration: 1 }, start);
              }
            }
          });

          // Hold the settled stack for a beat before the pin releases.
          tl.to({}, { duration: 0.6 });
        }
      );

      // ─── Mobile: pin section, hijack vertical scroll → horizontal card drag ───
      mm.add(
        '(max-width: 1023px) and (prefers-reduced-motion: no-preference)',
        () => {
          const track = sectionRef.current?.querySelector<HTMLElement>('.svc-mobile-track');
          const container = sectionRef.current?.querySelector<HTMLElement>('.svc-mobile-scroll');
          if (!track || !container) return;

          // Total distance to scroll = total track width minus one viewport width
          const getScrollWidth = () => track.scrollWidth - container.offsetWidth;

          gsap.to(track, {
            x: () => -getScrollWidth(),
            ease: 'none',
            scrollTrigger: {
              trigger: container,
              start: 'top top',
              end: () => `+=${getScrollWidth()}`,
              scrub: 0.8,
              pin: true,
              pinType: 'transform',
              anticipatePin: 1,
              invalidateOnRefresh: true,
            },
          });
        }
      );

      // ─── Reduced motion: simple fade-in (mobile + desktop) ───
      mm.add(
        '(prefers-reduced-motion: reduce)',
        () => {
          gsap.utils.toArray<HTMLElement>('.svc-stack-card').forEach((card) => {
            const img = card.querySelector<HTMLElement>('.svc-stack-img');
            gsap.from(card, {
              y: 40,
              opacity: 0,
              duration: 0.7,
              ease: 'power3.out',
              scrollTrigger: {
                trigger: card,
                start: 'top 85%',
                toggleActions: 'play none none none',
              },
            });
            if (img) {
              gsap.to(img, {
                filter: 'grayscale(0%)',
                ease: 'none',
                scrollTrigger: {
                  trigger: card,
                  start: 'top 90%',
                  end: 'top 40%',
                  scrub: true,
                },
              });
            }
          });
        }
      );
    },
    { scope: sectionRef }
  );

  // Character split helper for header reveal
  function splitText(text: string) {
    return text.split('').map((char, i) => (
      <span key={i} className="svc-char inline-block">
        {char === ' ' ? '\u00A0' : char}
      </span>
    ));
  }

  return (
    <section ref={sectionRef} className="w-full bg-safend-canvas overflow-hidden">
      <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px] pt-[60px] sm:pt-[90px] lg:pt-[160px]">
        {/* Section header */}
        <div ref={headerRef} className="mb-12 sm:mb-20 lg:mb-[80px]">
          <p className="text-[11px] font-body text-safend-muted uppercase tracking-[0.08em] mb-6">
            Our Capabilities
          </p>
          <h2
            className="font-display font-bold text-safend-ink leading-[0.9] tracking-[-0.03em] overflow-hidden"
            style={{ fontSize: 'clamp(2.2rem, 9vw, 7rem)' }}
          >
            <span className="block overflow-hidden">{splitText('Here is what')}</span>
            <span className="block overflow-hidden">
              {splitText('we can do for you')}
              <span className="text-safend-red">.</span>
            </span>
          </h2>
        </div>
      </div>

      {/* ─── Card stage ─── */}
      <div
        ref={stageRef}
        className="svc-stage relative w-full lg:block lg:px-0 lg:pb-0 lg:h-screen"
      >
        {/* Mobile: scroll-hijacked horizontal carousel */}
        <div
          className="svc-mobile-scroll lg:hidden w-full overflow-hidden"
          style={{ height: '88vh' }}
        >
          {/* Track — GSAP moves this left */}
          <div
            className="svc-mobile-track flex flex-row items-center gap-4 px-6 pt-10 h-full will-change-transform"
            style={{ width: 'max-content' }}
          >
            {previewServices.map((service, index) => (
              <MobileServiceCard key={service.id} service={service} index={index} />
            ))}
            {/* Trailing spacer */}
            <div className="shrink-0 w-4" aria-hidden />
          </div>
        </div>

        {/* Desktop: pinned stacking cards */}
        <div className="hidden lg:block relative h-full">
          {previewServices.map((service, index) => (
            <PreviewServiceBlock key={service.id} service={service} index={index} />
          ))}
        </div>
      </div>

      {/* View all CTA */}
      <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px] pt-[28px] sm:pt-[50px] lg:pt-[100px] pb-[60px] sm:pb-[90px] lg:pb-[160px]">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-4 sm:gap-6">
          <Link
            href="/services"
            className="group inline-flex items-center justify-center gap-2 rounded-[10px] bg-safend-red px-7 py-[16px] sm:py-[20px] text-[14px] font-heading font-semibold tracking-[0.01em] uppercase text-white transition-all duration-300 hover:translate-y-[-2px]"
          >
            View All Services
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
          {moreCount > 0 && (
            <p className="text-[14px] font-body text-safend-muted">
              Plus {moreCount} more specialist services
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─── Mobile horizontal scroll card ────────────────────────────────────── */
function MobileServiceCard({ service, index }: { service: ServiceEntry; index: number }) {
  const Icon = service.icon ? ICON_MAP[service.icon] : Shield;
  return (
    <div
      className="snap-center shrink-0 group w-[78vw] max-w-[320px] h-[68vh] max-h-[560px] rounded-[18px] overflow-hidden border border-safend-mist bg-safend-canvas shadow-[0_8px_32px_-8px_rgba(20,20,20,0.18)] flex flex-col"
    >
      {/* Image */}
      <div className="relative w-full overflow-hidden" style={{ height: '40%', minHeight: '160px' }}>
        <img
          src={service.image || '/guards-team.png'}
          alt={service.name}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-[filter] duration-700 ease-out grayscale group-hover:grayscale-0"
          style={{ objectPosition: service.imagePosition ?? 'center' }}
        />
        <span
          className="absolute top-3 left-4 font-display font-bold text-white leading-none mix-blend-difference"
          style={{ fontSize: 'clamp(1.5rem, 6vw, 2rem)' }}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 px-4 pt-4 pb-5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-7 h-7 rounded-[7px] bg-safend-red/10 flex items-center justify-center text-safend-red">
            <Icon className="w-3.5 h-3.5" />
          </span>
          <span className="text-[9px] font-body text-safend-red uppercase tracking-[0.12em]">
            0{index + 1}
          </span>
        </div>
        <h3
          className="font-display font-bold text-safend-ink leading-[0.95] tracking-[-0.02em]"
          style={{ fontSize: 'clamp(1.1rem, 4.5vw, 1.4rem)' }}
        >
          {service.name}
        </h3>
        {service.tagline && (
          <p className="mt-1 text-[11px] font-body italic text-safend-muted">{service.tagline}</p>
        )}
        <p className="mt-2 text-[12px] font-body text-safend-slate-grey leading-normal line-clamp-3">
          {service.description}
        </p>
        <div className="mt-auto pt-3 flex items-center gap-2">
          <Link
            href={`/services#${service.id}`}
            className="inline-flex items-center gap-1 rounded-[7px] bg-safend-red px-3 py-[8px] text-[11px] font-heading font-semibold tracking-[0.01em] uppercase text-white"
          >
            Learn More
            <ArrowRight className="h-3 w-3" />
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center rounded-[7px] border border-safend-mist px-3 py-[8px] text-[11px] font-heading font-semibold tracking-[0.01em] uppercase text-safend-ink"
          >
            Get a Quote
          </Link>
        </div>
        <div className="mt-3 h-[2px] w-[24px] bg-safend-red" />
      </div>
    </div>
  );
}

/* ─── Desktop stacking preview card ─────────────────────────────────────── */
function PreviewServiceBlock({ service, index }: { service: ServiceEntry; index: number }) {
  const Icon = service.icon ? ICON_MAP[service.icon] : Shield;

  return (
    <div
      className="svc-stack-card scroll-mt-16 absolute inset-0 flex items-center justify-center px-[40px] xl:px-[50px] 2xl:px-[80px] will-change-transform"
      style={{ zIndex: index + 1 }}
    >
      <div
        className="svc-stack-inner relative overflow-hidden rounded-[24px] border border-safend-mist bg-safend-canvas shadow-[0_30px_80px_-30px_rgba(20,20,20,0.35)] w-full max-w-[1240px] max-h-[960px] px-[72px] py-[80px]"
      >
        {/* Dim overlay */}
        <div
          className="svc-stack-dim pointer-events-none absolute inset-0 z-30 bg-safend-ink opacity-0"
          aria-hidden
        />

        <div className="grid grid-cols-2 gap-14 items-stretch">
          {/* Image */}
          <div className="flex flex-col">
            <div className="relative rounded-[14px] overflow-hidden flex-1 min-h-[560px]">
              <img
                src={service.image || '/guards-team.png'}
                alt={service.name}
                loading="lazy"
                className="svc-stack-img absolute inset-0 w-full h-full object-cover"
                style={{ filter: 'grayscale(100%)', objectPosition: service.imagePosition ?? 'center' }}
              />
              <span
                className="absolute top-4 left-5 font-display font-bold text-white leading-none mix-blend-difference"
                style={{ fontSize: 'clamp(2.25rem, 4.5vw, 3.5rem)' }}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
            </div>
            {service.tagline && (
              <p className="mt-3 text-[14px] font-body italic text-safend-muted">
                {service.tagline}
              </p>
            )}
          </div>

          {/* Content */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <span className="w-10 h-10 rounded-[10px] bg-safend-red/10 flex items-center justify-center text-safend-red">
                <Icon className="w-5 h-5" />
              </span>
              <span className="text-[11px] font-body text-safend-red uppercase tracking-[0.12em]">
                0{index + 1}
              </span>
            </div>
            <h3
              className="font-display font-bold text-safend-ink leading-[0.95] tracking-[-0.02em]"
              style={{ fontSize: 'clamp(1.75rem, 4.5vw, 3.5rem)' }}
            >
              {service.name}
            </h3>
            <p className="mt-5 text-[18px] font-body text-safend-slate-grey leading-[1.6] tracking-[-0.02em] max-w-[500px]">
              {service.description}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href={`/services#${service.id}`}
                className="group inline-flex items-center gap-2 rounded-[10px] bg-safend-red px-6 py-[14px] text-[13px] font-heading font-semibold tracking-[0.01em] uppercase text-white transition-all duration-300 hover:translate-y-[-2px]"
              >
                Learn More
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-[10px] border border-safend-mist bg-transparent px-6 py-[14px] text-[13px] font-heading font-semibold tracking-[0.01em] uppercase text-safend-ink transition-all duration-300 hover:border-safend-red hover:text-safend-red"
              >
                Get a Quote
              </Link>
            </div>
            <div className="mt-8 h-[2px] w-[40px] bg-safend-red" />
          </div>
        </div>
      </div>
    </div>
  );
}
