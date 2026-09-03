'use client';

import { motion, useReducedMotion } from 'framer-motion';

const CLIENTS = [
  'TATA MOTORS',
  'ABBA KABA',
  'INTAS PHARMA',
  'SUGUNA FOODS',
  'SPD CONSTRUCTION',
  'KUBOTA TRACTOR',
  'PRIME MASALA',
  'ADISUTRA AYURVEDA',
] as const;

/**
 * Client logos as a horizontal scrolling marquee — text wordmarks
 * with red dot separators. Clean, professional, no images needed.
 */
export function ClientLogos() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="w-full bg-safend-canvas py-[60px] overflow-hidden border-y border-safend-mist">
      {/* Label */}
      <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px] mb-8">
        <p className="text-[11px] font-body text-safend-muted uppercase tracking-[0.08em]">
          Trusted by leading brands across India
        </p>
      </div>

      {/* Scrolling strip */}
      <div className="relative overflow-hidden">
        <motion.div
          className="flex items-center gap-14 whitespace-nowrap"
          animate={reduceMotion ? undefined : { x: ['0%', '-50%'] }}
          transition={
            reduceMotion
              ? undefined
              : { x: { duration: 18.75, repeat: Infinity, ease: 'linear' } }
          }
        >
          {[...CLIENTS, ...CLIENTS].map((client, i) => (
            <div key={`${client}-${i}`} className="flex items-center gap-14 shrink-0">
              <span className="text-[clamp(1.4rem,3.5vw,2.2rem)] font-display font-bold tracking-[-0.02em] text-safend-ink/20 select-none">
                {client}
              </span>
              <span className="w-[6px] h-[6px] rounded-full bg-safend-red/40 shrink-0" aria-hidden />
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
