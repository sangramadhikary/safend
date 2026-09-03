'use client';

import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { FAQ_ITEMS } from '@/data/faq';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * FAQ with GSAP:
 * - Left headline pins on scroll (sticky via ScrollTrigger)
 * - Accordion items reveal on scroll with stagger
 * - Open/close with height animation via GSAP
 * - Red accent line scales in on open
 */
export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const sectionRef = useRef<HTMLElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  const accordionRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // Headline clip reveal
      if (headlineRef.current) {
        gsap.from(headlineRef.current, {
          clipPath: 'inset(0 0 100% 0)',
          y: 40,
          duration: 1.0,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: headlineRef.current,
            start: 'top 80%',
            toggleActions: 'play none none none',
          },
        });
      }

      // Accordion items stagger
      const items = accordionRef.current?.querySelectorAll('.faq-item');
      if (items && items.length) {
        gsap.from(items, {
          y: 30,
          opacity: 0,
          duration: 0.7,
          ease: 'power2.out',
          stagger: 0.08,
          scrollTrigger: {
            trigger: accordionRef.current,
            start: 'top 80%',
            toggleActions: 'play none none none',
          },
        });
      }
    },
    { scope: sectionRef }
  );

  // Toggle with GSAP height animation
  function toggleItem(index: number) {
    const newIndex = openIndex === index ? null : index;

    // Close current
    if (openIndex !== null) {
      const currentAnswer = document.querySelector(`#faq-answer-${openIndex}`);
      if (currentAnswer) {
        gsap.to(currentAnswer, { height: 0, opacity: 0, duration: 0.35, ease: 'power2.inOut' });
      }
    }

    // Open new
    if (newIndex !== null) {
      const newAnswer = document.querySelector(`#faq-answer-${newIndex}`);
      if (newAnswer) {
        gsap.set(newAnswer, { height: 'auto', opacity: 1 });
        gsap.from(newAnswer, { height: 0, opacity: 0, duration: 0.4, ease: 'power2.out' });
      }
    }

    setOpenIndex(newIndex);
  }

  return (
    <section ref={sectionRef} className="w-full bg-safend-canvas">
      <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px] py-[60px] sm:py-[90px] lg:py-[190px]">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-10 sm:gap-16 lg:gap-24">
          {/* Left: Pinned headline */}
          <div ref={headlineRef} className="lg:sticky lg:top-[100px] lg:self-start">
            <p className="text-[11px] font-body text-safend-muted uppercase tracking-[0.08em] mb-6">
              Questions
            </p>
            <h2
              className="font-display font-bold text-safend-ink leading-[0.9] tracking-[-0.03em]"
              style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}
            >
              You asked<span className="text-safend-red">,</span><br />
              we<br />
              answered<span className="text-safend-red">.</span>
            </h2>
            <div className="mt-8 h-[2px] w-[50px] bg-safend-red" aria-hidden />
          </div>

          {/* Right: Accordion */}
          <div ref={accordionRef}>
            {FAQ_ITEMS.map((faq, index) => {
              const isOpen = openIndex === index;
              return (
                <div
                  key={index}
                  className="faq-item border-b border-safend-mist last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => toggleItem(index)}
                    className="flex w-full items-start justify-between gap-6 py-7 text-left group"
                    aria-expanded={isOpen}
                  >
                    <span className="text-[16px] font-heading font-medium text-safend-ink group-hover:text-safend-red transition-colors duration-200 leading-[1.4]">
                      {faq.question}
                    </span>
                    <span
                      className={`shrink-0 text-[24px] text-safend-red font-light leading-none mt-1 transition-transform duration-300 ${
                        isOpen ? 'rotate-45' : 'rotate-0'
                      }`}
                    >
                      +
                    </span>
                  </button>

                  <div
                    id={`faq-answer-${index}`}
                    className="overflow-hidden"
                    style={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
                  >
                    {/* Red accent line */}
                    <div
                      className={`h-px w-[30px] bg-safend-red mb-4 origin-left transition-transform duration-500 ${
                        isOpen ? 'scale-x-100' : 'scale-x-0'
                      }`}
                    />
                    <p className="pb-7 text-[14px] font-body text-safend-slate-grey leading-[1.6] max-w-[460px]">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
