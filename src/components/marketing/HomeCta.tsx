'use client';

import { useRef, useState } from 'react';
import { ArrowRight, Phone } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { CONTACT_INFO } from '@/data/contact';
import { LeadCaptureModal } from './LeadCaptureModal';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * CTA section on Obsidian Panel (dark) with GSAP:
 * - Headline clips in on scroll
 * - Red glow blob pulses slowly
 * - CTA button scales up on entry
 * - Parallax on the entire section content
 */
export function HomeCta() {
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // ─── Headline clip reveal ───
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

      // ─── Body fade-in ───
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

      // ─── Glow blob pulsing ───
      if (glowRef.current) {
        gsap.to(glowRef.current, {
          scale: 1.15,
          opacity: 0.12,
          duration: 4,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        });
      }

      // ─── Parallax content shift ───
      if (sectionRef.current) {
        const content = sectionRef.current.querySelector('.cta-content');
        if (content) {
          gsap.to(content, {
            y: -40,
            ease: 'none',
            scrollTrigger: {
              trigger: sectionRef.current,
              start: 'top bottom',
              end: 'bottom top',
              scrub: 2,
            },
          });
        }
      }
    },
    { scope: sectionRef }
  );

  return (
    <>
      <section ref={sectionRef} className="w-full bg-safend-ink relative overflow-hidden">
        {/* Red glow blob */}
        <div
          ref={glowRef}
          className="absolute top-[-20%] right-[-10%] w-[50%] h-[60%] rounded-full bg-safend-red/8 blur-[150px]"
          aria-hidden
        />

        <div className="cta-content relative max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px] py-[60px] sm:py-[90px] lg:py-[190px]">
          <h2
            ref={headlineRef}
            className="font-display font-bold text-safend-canvas leading-[0.9] tracking-[-0.03em]"
            style={{ fontSize: 'clamp(3rem, 9vw, 7rem)' }}
          >
            Ready to stop<br />
            worrying<span className="text-safend-red">?</span>
          </h2>

          <div ref={bodyRef} className="mt-10 max-w-[520px]">
            <p className="text-[16px] font-body text-safend-canvas/60 leading-[1.6] tracking-[-0.02em]">
              Tell us what you need protected — a building, an event, a person.
              We&apos;ll come back with a clear plan and a honest quote. No
              pressure, no jargon, no surprises.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-6">
              <button
                type="button"
                onClick={() => setLeadModalOpen(true)}
                className="group inline-flex items-center gap-2 rounded-[10px] bg-safend-red px-7 sm:px-[50px] py-[20px] text-[14px] font-heading font-semibold tracking-[0.01em] uppercase text-white transition-all duration-300 hover:translate-y-[-2px]"
              >
                Get a Free Assessment
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </button>

              <a
                href={`tel:${CONTACT_INFO.phone}`}
                className="group inline-flex items-center gap-2 text-[14px] font-body text-safend-canvas/70 hover:text-safend-canvas transition-colors duration-200"
              >
                <Phone className="h-4 w-4" />
                Call Now →
              </a>
            </div>

            <div className="mt-14 h-[2px] w-[50px] bg-safend-red" aria-hidden />
          </div>
        </div>
      </section>

      <LeadCaptureModal open={leadModalOpen} onOpenChange={setLeadModalOpen} />
    </>
  );
}
