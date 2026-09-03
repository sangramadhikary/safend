'use client';

import { useRef, useState } from 'react';
import {
  Shield, ShieldAlert, Users, UserCheck,
  ArrowRight, Check, Info, PawPrint, Camera, MapPin,
} from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import {
  STATES,
  buildTiersForState,
  formatINR,
  PF_RATE,
  ESI_RATE,
  BONUS_RATE,
  SERVICE_CHARGE_RATE,
  WORKING_DAYS,
} from '@/data/pricing';
import { HomeCta } from './HomeCta';
import { LeadCaptureModal } from './LeadCaptureModal';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield, ShieldAlert, Users, UserCheck,
};

const pct = (rate: number) => `${(rate * 100).toFixed(rate * 100 % 1 === 0 ? 0 : 2)}%`;

/** Services that are always custom-quoted (equipment / specialist teams). */
const CUSTOM_QUOTE = [
  { icon: PawPrint, name: 'Dog Squads', note: 'K9 handler teams, priced per unit and deployment window.' },
  { icon: Camera, name: 'Electronic Security', note: 'CCTV, alarms and access control — quoted on site survey.' },
  { icon: Users, name: 'Event Guards & Bouncers', note: 'Crowd size and hours decide the team and the rate.' },
];

export default function PricingContent() {
  const pageRef = useRef<HTMLDivElement>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [stateId, setStateId] = useState(STATES[0].id);

  const activeState = STATES.find((s) => s.id === stateId) ?? STATES[0];
  const tiers = buildTiersForState(activeState);

  useGSAP(
    () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      /* Hero line reveal */
      gsap.utils.toArray<HTMLElement>('.pr-hero-line').forEach((line, i) => {
        gsap.from(line, { yPercent: 120, duration: 1.0, ease: 'power4.out', delay: 0.25 + i * 0.1 });
      });
      gsap.from('.pr-hero-meta', { opacity: 0, y: 20, duration: 0.8, ease: 'power2.out', delay: 0.9 });

      /* Section headlines clip reveal */
      gsap.utils.toArray<HTMLElement>('.section-head').forEach((el) => {
        gsap.from(el, {
          clipPath: 'inset(0 0 100% 0)', yPercent: 25, duration: 1.0, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' },
        });
      });

      /* Pricing bento tiles staggered reveal */
      gsap.utils.toArray<HTMLElement>('.bento-tile').forEach((tile, i) => {
        gsap.from(tile, {
          y: 50, opacity: 0, scale: 0.96, duration: 0.8, ease: 'power3.out', delay: i * 0.07,
          scrollTrigger: { trigger: '.pricing-bento', start: 'top 82%', toggleActions: 'play none none none' },
        });
      });

      /* Breakdown table rows reveal */
      if (!reduced) {
        gsap.utils.toArray<HTMLElement>('.breakdown-row').forEach((row, i) => {
          gsap.from(row, {
            opacity: 0, x: -20, duration: 0.6, ease: 'power2.out', delay: i * 0.05,
            scrollTrigger: { trigger: '.breakdown-table', start: 'top 80%', toggleActions: 'play none none none' },
          });
        });
      }

      /* Custom-quote cards */
      gsap.utils.toArray<HTMLElement>('.custom-card').forEach((card, i) => {
        gsap.from(card, {
          y: 40, opacity: 0, duration: 0.7, ease: 'power3.out', delay: i * 0.08,
          scrollTrigger: { trigger: '.custom-grid', start: 'top 85%', toggleActions: 'play none none none' },
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
          <p className="pr-hero-meta text-[11px] font-body text-safend-muted uppercase tracking-[0.18em] mb-8">
            Transparent Pricing
          </p>
          <h1
            className="font-display font-bold text-safend-ink leading-[0.86] tracking-[-0.04em]"
            style={{ fontSize: 'clamp(2.75rem, 9vw, 7.5rem)' }}
          >
            <span className="block overflow-hidden"><span className="pr-hero-line block">Clear rates.</span></span>
            <span className="block overflow-hidden"><span className="pr-hero-line block">No surprises<span className="text-safend-red">.</span></span></span>
          </h1>
          <div className="pr-hero-meta mt-10 flex items-center gap-5">
            <div className="h-[2px] w-[50px] bg-safend-red" aria-hidden />
            <p className="text-[15px] font-body text-safend-slate-grey leading-[1.6] max-w-[460px]">
              Every rate is built on the Odisha 2026 statutory minimum wage, the mandatory PF, ESI and bonus contributions, and a flat {pct(SERVICE_CHARGE_RATE)}{" "}service charge. Here&apos;s the per-guard price for a single 8-hour duty.
            </p>
          </div>
        </div>
      </section>

      {/* ════════════ 24-HOUR PRICE CARDS ════════════ */}
      <section className="w-full py-[40px] lg:py-[60px]">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <div className="section-head mb-12 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <p className="text-[11px] font-body text-safend-muted uppercase tracking-[0.15em] mb-5">
                Per 8-Hour Duty — {String(tiers.length).padStart(2, '0')} tiers
              </p>
              <h2
                className="font-display font-bold text-safend-ink leading-[0.92] tracking-[-0.03em]"
                style={{ fontSize: 'clamp(1.75rem, 5vw, 3.5rem)' }}
              >
                What a duty costs<span className="text-safend-red">.</span>
              </h2>
            </div>
            <p className="text-[14px] font-body text-safend-slate-grey leading-[1.6] max-w-[340px]">
              An 8-hour duty is one guard, one shift. Prices are all-in per guard, per shift. Need 24-hour cover? That&apos;s three duties.
            </p>
          </div>

          {/* ── State toggle ── */}
          <div className="mb-8 flex flex-wrap items-center gap-2">
            <MapPin className="w-4 h-4 text-safend-muted" aria-hidden />
            {STATES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStateId(s.id)}
                className={`rounded-full px-4 py-2 text-[12.5px] font-heading font-semibold transition-all duration-200 ${
                  stateId === s.id
                    ? 'bg-safend-ink text-white'
                    : 'bg-safend-light-grey text-safend-slate-grey hover:bg-safend-mist'
                }`}
              >
                {s.name}
              </button>
            ))}
            <span className="ml-3 text-[11px] font-body text-safend-muted">
              {activeState.zone} · w.e.f. {activeState.effectiveDate}
            </span>
          </div>

          <div className="pricing-bento grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 sm:gap-0 lg:gap-0 overflow-hidden rounded-[22px] border border-safend-mist">
            {tiers.map((t, i) => {
              const Icon = ICON_MAP[t.icon] ?? Shield;
              const p = t.pricing;
              return (
                <div
                  key={t.id}
                  className="bento-tile group relative flex flex-col p-6 lg:p-7 border-b sm:border-b lg:border-b-0 border-safend-mist sm:odd:border-r lg:border-r last:border-r-0 bg-white transition-colors duration-300 hover:bg-safend-light-grey"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <span className="w-11 h-11 rounded-[12px] bg-safend-light-grey flex items-center justify-center text-safend-ink transition-colors duration-300 group-hover:bg-safend-red group-hover:text-white">
                      <Icon className="w-5 h-5" />
                    </span>
                    <span className="text-[10px] font-heading font-semibold uppercase tracking-[0.14em] text-safend-muted">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>

                  {/* Category */}
                  <p className="text-[10px] font-heading font-semibold uppercase tracking-[0.16em] text-safend-red">
                    {t.category}
                  </p>

                  {/* Title */}
                  <h3 className="mt-2 font-display font-bold leading-[1.1] tracking-[-0.02em] text-[18px] lg:text-[20px] text-safend-ink">
                    {t.serviceName}
                  </h3>

                  {/* Blurb */}
                  <p className="mt-3 text-[12.5px] font-body leading-[1.55] text-safend-slate-grey">
                    {t.blurb}
                  </p>

                  {/* Price block */}
                  <div className="mt-auto pt-6 border-t border-safend-mist">
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className="font-display font-bold tabular-nums leading-none text-safend-ink"
                        style={{ fontSize: 'clamp(2.1rem, 4.5vw, 2.7rem)' }}
                      >
                        {formatINR(p.per8hTotal)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12px] font-body text-safend-muted">
                      per 8-hour duty
                    </p>

                    {/* Breakdown lines */}
                    <div className="mt-4 space-y-1 text-[11.5px] font-body tabular-nums text-safend-muted">
                      <div className="flex justify-between">
                        <span>Wage + statutory</span>
                        <span>{formatINR(p.dailyCTC)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Service charge ({pct(SERVICE_CHARGE_RATE)})</span>
                        <span>{formatINR(p.serviceCharge)}</span>
                      </div>
                      {p.additionalCharges > 0 && (
                        <div className="flex justify-between text-safend-red">
                          <span>{t.additionalChargesLabel ?? 'Additional charges'}</span>
                          <span>{formatINR(p.additionalCharges)}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-2 border-t border-safend-mist/70 text-safend-slate-grey">
                        <span>Monthly</span>
                        <span>≈ {formatINR(p.monthly8h)}</span>
                      </div>
                    </div>
                  </div>

                  {/* CTA */}
                  <button
                    type="button"
                    onClick={() => setQuoteOpen(true)}
                    className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-safend-ink px-5 py-3.5 text-[12.5px] font-heading font-semibold uppercase tracking-[0.01em] text-white transition-all duration-300 hover:bg-safend-red"
                  >
                    Get a Quote
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                  </button>
                </div>
              );
            })}
          </div>

          <p className="mt-6 flex items-start gap-2 text-[12px] font-body text-safend-muted leading-[1.6] max-w-[720px]">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-safend-red" aria-hidden />
            Rates are indicative and based on the current statutory minimum wage. GST (18%) is billed
            separately. Final pricing depends on shift pattern, location, and contract duration.
          </p>
        </div>
      </section>

      {/* ════════════ MINIMUM WAGE BREAKDOWN ════════════ */}
      <section className="w-full bg-safend-ink py-[90px] lg:py-[130px]">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <div className="flex items-center gap-4 mb-14">
            <span className="h-2 w-2 rounded-full bg-safend-red" aria-hidden />
            <p className="text-[11px] font-body text-safend-canvas/40 uppercase tracking-[0.18em]">
              How the rate is built
            </p>
          </div>
          <h2
            className="section-head font-display font-bold text-safend-canvas leading-[0.92] tracking-[-0.03em] max-w-3xl mb-6"
            style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)' }}
          >
            Minimum wage,<br />fully loaded<span className="text-safend-red">.</span>
          </h2>
          <p className="text-[15px] font-body text-safend-canvas/70 leading-[1.7] max-w-[560px] mb-10">
            Nothing hidden. Each rate starts at the {activeState.name} minimum wage, adds the statutory
            employer contributions we&apos;re legally required to pay, and a flat {pct(SERVICE_CHARGE_RATE)} service
            charge. This is the per-guard, per-8-hour-duty maths.
          </p>

          {/* State toggle (dark variant) */}
          <div className="mb-8 flex flex-wrap items-center gap-2">
            <MapPin className="w-4 h-4 text-safend-canvas/40" aria-hidden />
            {STATES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStateId(s.id)}
                className={`rounded-full px-4 py-2 text-[12px] font-heading font-semibold transition-all duration-200 ${
                  stateId === s.id
                    ? 'bg-white text-safend-ink'
                    : 'bg-white/10 text-safend-canvas/60 hover:bg-white/20 hover:text-safend-canvas'
                }`}
              >
                {s.name}
              </button>
            ))}
            <span className="ml-3 text-[11px] font-body text-safend-canvas/40">
              {activeState.zone} · w.e.f. {activeState.effectiveDate}
            </span>
          </div>

          <div className="breakdown-table overflow-x-auto rounded-[18px] border border-white/15 bg-white/2.5">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/15 bg-white/4">
                  <th className="px-6 py-5 text-[11px] font-body font-semibold text-safend-canvas/60 uppercase tracking-[0.14em]">
                    Cost breakdown
                  </th>
                  {tiers.map((t) => {
                    const Icon = ICON_MAP[t.icon] ?? Shield;
                    return (
                      <th key={t.id} className="px-5 py-5 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <Icon className="w-4 h-4 text-safend-canvas/50" />
                          <span className="text-[12px] font-heading font-semibold text-safend-canvas leading-tight">
                            {t.serviceName.split(' ').slice(0, 2).join(' ')}
                          </span>
                          <span className="text-[9px] font-body text-safend-red uppercase tracking-[0.12em]">
                            {t.category}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="text-[14px] font-body tabular-nums">
                {/* ─ Base wage ─ */}
                <tr className="breakdown-row border-b border-white/10">
                  <td className="px-6 py-4 font-heading font-medium text-safend-canvas">
                    Base minimum wage
                  </td>
                  {tiers.map((t) => (
                    <td key={t.id} className="px-5 py-4 text-center font-medium text-safend-canvas">
                      {formatINR(t.pricing.dailyWage)}
                    </td>
                  ))}
                </tr>

                {/* ─ Statutory contributions (grouped visually) ─ */}
                {[
                  { label: `PF (${pct(PF_RATE)})`, key: 'pf' as const },
                  { label: `ESI (${pct(ESI_RATE)})`, key: 'esi' as const },
                  { label: `Bonus (${pct(BONUS_RATE)})`, key: 'bonus' as const },
                ].map((row, idx) => (
                  <tr key={row.label} className={`breakdown-row border-b border-white/6 ${idx === 0 ? 'border-t border-white/6' : ''}`}>
                    <td className="px-6 py-3 pl-9 text-[13px] text-safend-canvas/55">
                      <span className="text-safend-canvas/30 mr-1.5">+</span>
                      {row.label}
                    </td>
                    {tiers.map((t) => (
                      <td key={t.id} className="px-5 py-3 text-center text-[13px] text-safend-canvas/60">
                        {formatINR(t.pricing[row.key])}
                      </td>
                    ))}
                  </tr>
                ))}

                {/* ─ Subtotal: wage cost ─ */}
                <tr className="breakdown-row border-y border-white/15 bg-white/5">
                  <td className="px-6 py-4 font-heading font-semibold text-safend-canvas">
                    Wage cost
                    <span className="block text-[10px] font-body font-normal text-safend-canvas/40 mt-0.5">per 8-hour duty</span>
                  </td>
                  {tiers.map((t) => (
                    <td key={t.id} className="px-5 py-4 text-center font-heading font-semibold text-safend-canvas text-[15px]">
                      {formatINR(t.pricing.dailyCTC)}
                    </td>
                  ))}
                </tr>

                {/* ─ Service charge ─ */}
                <tr className="breakdown-row border-b border-white/10">
                  <td className="px-6 py-4 text-[#FF6167] font-medium">
                    + Service charge ({pct(SERVICE_CHARGE_RATE)})
                  </td>
                  {tiers.map((t) => (
                    <td key={t.id} className="px-5 py-4 text-center font-medium text-[#FF6167]">
                      {formatINR(t.pricing.serviceCharge)}
                    </td>
                  ))}
                </tr>

                {/* ─ Gun charges ─ */}
                <tr className="breakdown-row border-b border-white/10">
                  <td className="px-6 py-4 text-safend-canvas/60 font-medium">
                    + Gun charges
                  </td>
                  {tiers.map((t) => (
                    <td key={t.id} className="px-5 py-4 text-center font-medium text-safend-canvas/60">
                      {t.pricing.additionalCharges > 0 ? formatINR(t.pricing.additionalCharges) : '—'}
                    </td>
                  ))}
                </tr>

                {/* ─ Grand total ─ */}
                <tr className="breakdown-row bg-safend-red/15">
                  <td className="px-6 py-5 font-display font-bold text-safend-canvas text-[15px]">
                    Total / 8-hour duty
                  </td>
                  {tiers.map((t) => (
                    <td key={t.id} className="px-5 py-5 text-center font-display font-bold text-safend-canvas tabular-nums text-[18px]">
                      {formatINR(t.pricing.per8hTotal)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-5 text-[12.5px] font-body text-safend-canvas/50 leading-[1.6] max-w-[720px]">
            Based on {WORKING_DAYS} working days per month. Figures are rounded to the nearest rupee.
            GST is charged separately as applicable.
          </p>
        </div>
      </section>

      {/* ════════════ CUSTOM-QUOTE SERVICES ════════════ */}
      <section className="w-full py-[90px] lg:py-[130px]">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <div className="section-head mb-12">
            <p className="text-[11px] font-body text-safend-muted uppercase tracking-[0.15em] mb-5">
              Quoted on request
            </p>
            <h2
              className="font-display font-bold text-safend-ink leading-[0.92] tracking-[-0.03em]"
              style={{ fontSize: 'clamp(1.75rem, 5vw, 3.5rem)' }}
            >
              Specialist work<span className="text-safend-red">.</span>
            </h2>
            <p className="mt-5 text-[14px] font-body text-safend-slate-grey leading-[1.6] max-w-[520px]">
              Some services don&apos;t fit a flat post rate. We scope these on the ground and give you a clear
              quote — same transparent maths, no guesswork.
            </p>
          </div>

          <div className="custom-grid grid grid-cols-1 md:grid-cols-3 gap-3 lg:gap-5">
            {CUSTOM_QUOTE.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.name}
                  className="custom-card group relative rounded-[16px] lg:rounded-[18px] border border-safend-mist bg-white p-7 transition-all duration-500 hover:border-safend-red/40 hover:-translate-y-1"
                >
                  <span className="w-12 h-12 rounded-[12px] bg-safend-red/10 flex items-center justify-center text-safend-red transition-colors duration-300 group-hover:bg-safend-red group-hover:text-white">
                    <Icon className="w-6 h-6" />
                  </span>
                  <h3 className="mt-6 font-display font-bold text-safend-ink text-[20px] leading-[1.1] tracking-[-0.02em]">
                    {c.name}
                  </h3>
                  <p className="mt-3 text-[13.5px] font-body text-safend-slate-grey leading-[1.6]">
                    {c.note}
                  </p>
                  <button
                    type="button"
                    onClick={() => setQuoteOpen(true)}
                    className="mt-6 inline-flex items-center gap-1.5 text-[12.5px] font-heading font-semibold uppercase tracking-[0.02em] text-safend-red"
                  >
                    Request a quote
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Reassurance strip */}
          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3">
            {[
              'PSARA-licensed personnel',
              'Statutory compliance guaranteed',
              'No hidden charges',
            ].map((item) => (
              <span key={item} className="inline-flex items-center gap-2 text-[13px] font-body text-safend-slate-grey">
                <Check className="w-4 h-4 text-safend-red" aria-hidden />
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════ CTA ════════════ */}
      <HomeCta />

      <LeadCaptureModal open={quoteOpen} onOpenChange={setQuoteOpen} />
    </div>
  );
}
