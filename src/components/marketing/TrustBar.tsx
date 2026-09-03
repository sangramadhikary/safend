'use client';

import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { TRUST_LOGOS } from '@/data/testimonials';

/**
 * Slim social-proof strip directly below the hero. Naming the segments Safend
 * protects ("trusted by") is a low-cost, high-impact trust signal.
 */
export function TrustBar() {
  return (
    <section className="relative border-y border-gray-200/70 bg-white/60 py-8 backdrop-blur-xs">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5 }}
          className="mb-6 text-center text-sm font-medium uppercase tracking-wider text-safend-slate-grey"
        >
          Trusted to protect organisations of every kind
        </motion.p>

        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 sm:gap-x-12">
          {TRUST_LOGOS.map((label, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="flex items-center gap-2 text-base font-heading font-semibold text-safend-black/70 transition-colors hover:text-safend-black"
            >
              <ShieldCheck className="h-5 w-5 text-[#D71920]/70" />
              {label}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
