'use client';

import { Shield, ShieldAlert, UserCheck, Users, PawPrint, Camera, ArrowDown } from 'lucide-react';
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

function isValidEntry(entry: ServiceEntry): boolean {
  const name = entry.name?.trim() ?? '';
  const description = entry.description?.trim() ?? '';
  return (
    name.length >= 1 &&
    name.length <= 60 &&
    description.length >= 1 &&
    description.length <= 500
  );
}

export default function ServiceSection() {
  const reduceMotion = useReducedMotion();
  const validServices = SERVICES.filter(isValidEntry);

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduceMotion ? 0 : 0.1 } },
  };

  const card: Variants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
    },
  };

  return (
    <section id="services" className="relative overflow-hidden px-4 py-20 sm:px-6 lg:px-8">
      <MeshBackground tone="light" grid={false} />

      <div className="relative mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-14 text-center"
        >
          <span className="inline-block rounded-full border border-[#D71920]/20 bg-[#D71920]/5 px-4 py-1.5 text-sm font-medium text-[#D71920]">
            Our Expertise
          </span>
          <h2 className="mt-5 font-heading text-3xl font-bold text-safend-black md:text-h2">
            Our Services
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-safend-slate-grey">
            When it comes to your safety and security, you need a company you can
            trust. Our customized solutions are designed to meet your unique needs
            and provide peace of mind, so you can focus on what matters most.
          </p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {validServices.map((service) => {
            const Icon = service.icon ? ICON_MAP[service.icon] : null;

            return (
              <motion.div key={service.id} variants={card}>
                <a href={`#${service.id}`} className="block h-full">
                  <GlassCard
                    variant="light"
                    sheen
                    whileHover={{ y: -6 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="group flex h-full flex-col p-6"
                  >
                    {Icon && (
                      <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#D71920]/10 text-[#D71920]">
                        <Icon className="h-6 w-6" />
                      </span>
                    )}
                    <h3 className="text-lg font-semibold text-safend-black">
                      {service.name}
                    </h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-safend-slate-grey">
                      {service.description}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#D71920] transition-transform group-hover:translate-y-0.5">
                      Learn more
                      <ArrowDown className="h-3.5 w-3.5" />
                    </span>
                  </GlassCard>
                </a>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
