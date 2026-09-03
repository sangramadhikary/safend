'use client';

import {
  Shield,
  ShieldAlert,
  UserCheck,
  Users,
  PawPrint,
  Camera,
  CheckCircle2,
  Briefcase,
} from 'lucide-react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { SERVICES } from '@/data/services';
import { ServiceEntry } from '@/types/marketing';
import { GlassCard } from './GlassCard';
import { MeshBackground } from './MeshBackground';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield,
  ShieldAlert,
  UserCheck,
  Users,
  PawPrint,
  Camera,
};

function ServiceBlock({
  service,
  index,
}: {
  service: ServiceEntry;
  index: number;
}) {
  const reduceMotion = useReducedMotion();
  const isReversed = index % 2 !== 0;
  const Icon = service.icon ? ICON_MAP[service.icon] : null;

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduceMotion ? 0 : 0.08 } },
  };

  const item: Variants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 16 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
    },
  };

  return (
    <section
      id={service.id}
      className="relative overflow-hidden px-4 py-20 sm:px-6 lg:px-8"
    >
      {index % 2 === 0 && <MeshBackground tone="light" grid={false} />}

      <div className="relative mx-auto max-w-7xl">
        <div
          className={`grid gap-10 lg:grid-cols-2 lg:items-center ${
            isReversed ? 'lg:direction-rtl' : ''
          }`}
        >
          {/* Left / Main content */}
          <motion.div
            initial={{ opacity: 0, x: isReversed ? 30 : -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={isReversed ? 'lg:order-2' : ''}
          >
            {/* Icon + Badge */}
            <div className="mb-5 flex items-center gap-3">
              {Icon && (
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#D71920]/10 text-[#D71920]">
                  <Icon className="h-6 w-6" />
                </span>
              )}
              <span className="rounded-full border border-[#D71920]/20 bg-[#D71920]/5 px-3 py-1 text-xs font-medium text-[#D71920]">
                {service.tagline}
              </span>
            </div>

            <h2 className="font-heading text-2xl font-bold text-safend-black sm:text-3xl">
              {service.name}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-safend-slate-grey sm:text-lg">
              {service.description}
            </p>

            {/* Highlight stats */}
            {service.highlights && service.highlights.length > 0 && (
              <div className="mt-6 grid grid-cols-3 gap-4">
                {service.highlights.map((h) => (
                  <div key={h.label} className="text-center">
                    <p className="font-heading text-xl font-bold text-[#D71920] sm:text-2xl">
                      {h.value}
                    </p>
                    <p className="mt-1 text-xs text-safend-slate-grey">
                      {h.label}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Right / Features + Use Cases cards */}
          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
            className={`space-y-5 ${isReversed ? 'lg:order-1' : ''}`}
          >
            {/* Features */}
            {service.features && service.features.length > 0 && (
              <motion.div variants={item}>
                <GlassCard variant="light" className="p-6">
                  <h3 className="mb-4 flex items-center gap-2 font-heading text-base font-semibold text-safend-black">
                    <CheckCircle2 className="h-5 w-5 text-[#D71920]" />
                    What We Deliver
                  </h3>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {service.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2 text-sm text-safend-slate-grey"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#D71920]" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              </motion.div>
            )}

            {/* Use Cases */}
            {service.useCases && service.useCases.length > 0 && (
              <motion.div variants={item}>
                <GlassCard variant="light" className="p-6">
                  <h3 className="mb-4 flex items-center gap-2 font-heading text-base font-semibold text-safend-black">
                    <Briefcase className="h-5 w-5 text-[#D71920]" />
                    Ideal For
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {service.useCases.map((uc) => (
                      <span
                        key={uc}
                        className="rounded-full border border-gray-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-safend-black"
                      >
                        {uc}
                      </span>
                    ))}
                  </div>
                </GlassCard>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export default function ServiceDetailSection() {
  return (
    <>
      {SERVICES.map((service, index) => (
        <ServiceBlock key={service.id} service={service} index={index} />
      ))}
    </>
  );
}
