'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { Phone, Mail, MapPin, Building2 } from 'lucide-react';
import { CONTACT_INFO } from '@/data/contact';
import { enquirySchema } from '@/lib/enquirySchema';
import type { EnquiryFormData, EnquiryFormState } from '@/types/marketing';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const TURNSTILE_SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAADxGKr1E4QYNNF5q').trim();

const initialData: EnquiryFormData = { name: '', contactMethod: '', message: '', website: '' };

const CONTACT_CHANNELS = [
  { icon: Phone, label: 'Call us', value: CONTACT_INFO.phone, href: `tel:${CONTACT_INFO.phone}` },
  { icon: Mail, label: 'Email us', value: CONTACT_INFO.email, href: `mailto:${CONTACT_INFO.email}` },
  { icon: MapPin, label: 'Visit us', value: CONTACT_INFO.address, href: undefined },
  { icon: Building2, label: 'Registered office', value: CONTACT_INFO.registeredAddress, href: undefined },
] as const;

export function ContactContent() {
  const pageRef = useRef<HTMLDivElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);

  const [formState, setFormState] = useState<EnquiryFormState>({
    data: initialData,
    errors: { name: null, contactMethod: null, message: null, website: null },
    status: 'idle',
  });

  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [formLoadedAt, setFormLoadedAt] = useState<number>(0);

  // Set the form load timestamp on mount (avoids Date.now() during prerender).
  useEffect(() => {
    setFormLoadedAt(Date.now());
  }, []);

  // Load the Turnstile script and render the widget.
  const resetTurnstile = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).turnstile && turnstileRef.current) {
      // Reset the widget for re-submission
      (window as any).turnstile.reset(turnstileRef.current);
      setTurnstileToken('');
    }
  }, []);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;

    const renderWidget = () => {
      if (turnstileRef.current && (window as any).turnstile) {
        (window as any).turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => setTurnstileToken(token),
          'expired-callback': () => setTurnstileToken(''),
          theme: 'light',
        });
      }
    };

    // If Turnstile is already loaded (e.g. navigated back), render immediately.
    if ((window as any).turnstile) {
      renderWidget();
      return;
    }

    // Inject script if not already present.
    const existing = document.getElementById('cf-turnstile-script');
    if (existing) {
      // Script tag exists but turnstile not ready yet — wait for it.
      existing.addEventListener('load', renderWidget);
      return;
    }

    const script = document.createElement('script');
    script.id = 'cf-turnstile-script';
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = renderWidget;
    document.head.appendChild(script);
  }, []);

  useGSAP(
    () => {
      // Hero line-mask reveal
      gsap.utils.toArray<HTMLElement>('.contact-hero-line').forEach((line, i) => {
        gsap.from(line, { yPercent: 120, duration: 1.0, ease: 'power4.out', delay: 0.25 + i * 0.1 });
      });
      gsap.from('.contact-hero-meta', { opacity: 0, y: 20, duration: 0.8, ease: 'power2.out', delay: 0.9 });

      // Form fields stagger
      gsap.from('.form-field', {
        opacity: 0, y: 24, duration: 0.7, ease: 'power3.out', stagger: 0.08,
        scrollTrigger: { trigger: '.contact-form', start: 'top 80%', toggleActions: 'play none none none' },
      });

      // Channels stagger
      gsap.from('.channel-item', {
        opacity: 0, y: 30, duration: 0.7, ease: 'power2.out', stagger: 0.1,
        scrollTrigger: { trigger: '.channels', start: 'top 85%', toggleActions: 'play none none none' },
      });
    },
    { scope: pageRef }
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setFormState((prev) => ({
      ...prev,
      data: { ...prev.data, [name]: value },
      errors: { ...prev.errors, [name]: null },
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormState((prev) => ({
      ...prev,
      errors: { name: null, contactMethod: null, message: null, website: null },
      status: 'submitting',
    }));

    const submissionData = {
      ...formState.data,
      turnstileToken,
      _formLoadedAt: formLoadedAt,
    };

    const result = enquirySchema.safeParse(submissionData);
    if (!result.success) {
      const fieldErrors: Record<keyof EnquiryFormData, string | null> = {
        name: null, contactMethod: null, message: null, website: null,
      };
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof EnquiryFormData;
        if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      // If turnstile token is missing, show a generic error.
      const turnstileError = result.error.issues.find(i => i.path[0] === 'turnstileToken');
      if (turnstileError) {
        setFormState((prev) => ({ ...prev, errors: fieldErrors, status: 'error' }));
      } else {
        setFormState((prev) => ({ ...prev, errors: fieldErrors, status: 'idle' }));
      }
      return;
    }

    try {
      const response = await fetch('/api/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionData),
      });
      if (response.ok) {
        setFormState({
          data: initialData,
          errors: { name: null, contactMethod: null, message: null, website: null },
          status: 'success',
        });
      } else {
        resetTurnstile();
        setFormState((prev) => ({ ...prev, status: 'error' }));
      }
    } catch {
      resetTurnstile();
      setFormState((prev) => ({ ...prev, status: 'error' }));
    }
  }

  const inputBase =
    'w-full rounded-[10px] border border-safend-mist bg-safend-ink/2 px-4 py-3.5 text-[15px] font-body text-safend-ink placeholder:text-safend-muted/50 focus:outline-hidden focus:border-safend-red focus:bg-safend-canvas focus:ring-2 focus:ring-safend-red/10 transition-all duration-300';

  return (
    <div ref={pageRef} className="bg-safend-canvas">
      {/* ════════════════════ HERO ════════════════════ */}
      <section className="w-full pt-[96px] sm:pt-[90px] lg:pt-[150px] pb-[36px] sm:pb-[60px] lg:pb-[80px]">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <p className="contact-hero-meta text-[11px] font-body text-safend-muted uppercase tracking-[0.18em] mb-5 sm:mb-8">
            Get in touch
          </p>
          <h1
            className="font-display font-bold text-safend-ink leading-[0.86] tracking-[-0.04em]"
            style={{ fontSize: 'clamp(2.4rem, 9vw, 7.5rem)' }}
          >
            <span className="block overflow-hidden"><span className="contact-hero-line block">Let&apos;s talk</span></span>
            <span className="block overflow-hidden pb-[0.12em]"><span className="contact-hero-line block">security<span className="text-safend-red">.</span></span></span>
          </h1>
          <div className="contact-hero-meta mt-6 sm:mt-10 flex items-center gap-4 sm:gap-5">
            <div className="h-[2px] w-[36px] sm:w-[50px] bg-safend-red shrink-0" aria-hidden />
            <p className="text-[14px] sm:text-[15px] font-body text-safend-slate-grey leading-[1.6] max-w-[420px]">
              Tell us what you need protected. We&apos;ll respond within 24 hours.
            </p>
          </div>
        </div>
      </section>

      {/* ════════════════════ CHANNELS STRIP (mobile only) ════════════════════ */}
      <div className="lg:hidden overflow-x-auto scrollbar-none pb-1" style={{ scrollbarWidth: 'none' }}>
        <div className="channels flex flex-row gap-3 px-6 pb-2" style={{ width: 'max-content' }}>
          {CONTACT_CHANNELS.map((ch) => {
            const Icon = ch.icon;
            const inner = (
              <div className="channel-item flex items-center gap-3 bg-safend-ink rounded-[14px] px-4 py-3.5 min-w-[200px] max-w-[240px]">
                <span className="shrink-0 w-9 h-9 rounded-[10px] bg-safend-red/15 flex items-center justify-center text-safend-red">
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-body text-safend-canvas/50 uppercase tracking-[0.08em]">
                    {ch.label}
                  </p>
                  <p className="mt-0.5 text-[13px] font-body text-safend-canvas leading-[1.4] truncate">
                    {ch.value}
                  </p>
                </div>
              </div>
            );
            return ch.href ? (
              <a key={ch.label} href={ch.href} className="shrink-0 block">{inner}</a>
            ) : (
              <div key={ch.label} className="shrink-0">{inner}</div>
            );
          })}
        </div>
      </div>

      {/* ════════════════════ FORM + CHANNELS ════════════════════ */}
      <section className="w-full pt-8 sm:pt-0 pb-[70px] sm:pb-[100px] lg:pb-[160px]">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-8 lg:gap-20 items-start">
            {/* ── Form ── */}
            <div className="contact-form rounded-[16px] sm:rounded-[14px] border border-safend-mist bg-safend-canvas p-6 sm:p-8 lg:p-12">
              {formState.status === 'success' ? (
                <div className="py-12 sm:py-16 text-center">
                  <div className="mx-auto w-14 h-14 rounded-full bg-safend-red/10 flex items-center justify-center mb-6">
                    <svg className="w-6 h-6 text-safend-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="font-display font-bold text-safend-ink text-[28px] leading-none">
                    Message received<span className="text-safend-red">.</span>
                  </h3>
                  <p className="mt-4 text-[15px] font-body text-safend-slate-grey max-w-sm mx-auto leading-[1.6]">
                    Thank you for reaching out. Our team will review your enquiry and get back to you within 24 hours.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate className="space-y-6 sm:space-y-8">
                  <div>
                    <p className="text-[11px] font-body text-safend-muted uppercase tracking-[0.12em] mb-1">
                      Send an enquiry
                    </p>
                    <h2 className="font-display font-bold text-safend-ink text-[24px] sm:text-[28px] lg:text-[32px] leading-none">
                      Hi there — how can we help?
                    </h2>
                    <p className="mt-3 text-[14px] font-body text-safend-slate-grey leading-[1.6] max-w-[420px]">
                      A few quick details and we&apos;ll take it from here. No forms-within-forms, promise.
                    </p>
                  </div>

                  {formState.status === 'error' && (
                    <div className="rounded-[10px] border border-safend-red/30 bg-safend-red/5 px-4 py-3">
                      <p className="text-[13px] font-body text-safend-red">
                        Your enquiry could not be sent. Please try again.
                      </p>
                    </div>
                  )}

                  {/* Name */}
                  <div className="form-field">
                    <label htmlFor="c-name" className="block text-[11px] font-body text-safend-muted uppercase tracking-widest mb-1">
                      First things first — what&apos;s your name?
                    </label>
                    <input
                      type="text" id="c-name" name="name"
                      value={formState.data.name} onChange={handleChange}
                      placeholder="e.g. Rahul Sharma"
                      className={`${inputBase} ${formState.errors.name ? 'border-safend-red' : ''}`}
                      aria-invalid={!!formState.errors.name}
                    />
                    {formState.errors.name && (
                      <p className="mt-2 text-[12px] text-safend-red">{formState.errors.name}</p>
                    )}
                  </div>

                  {/* Contact method */}
                  <div className="form-field">
                    <label htmlFor="c-contact" className="block text-[11px] font-body text-safend-muted uppercase tracking-widest mb-1">
                      Where can we reach you back?
                    </label>
                    <input
                      type="text" id="c-contact" name="contactMethod"
                      value={formState.data.contactMethod} onChange={handleChange}
                      placeholder="Drop an email or phone number"
                      className={`${inputBase} ${formState.errors.contactMethod ? 'border-safend-red' : ''}`}
                      aria-invalid={!!formState.errors.contactMethod}
                    />
                    {formState.errors.contactMethod && (
                      <p className="mt-2 text-[12px] text-safend-red">{formState.errors.contactMethod}</p>
                    )}
                  </div>

                  {/* Message */}
                  <div className="form-field">
                    <label htmlFor="c-message" className="block text-[11px] font-body text-safend-muted uppercase tracking-widest mb-1">
                      So, what&apos;s on your mind?
                    </label>
                    <textarea
                      id="c-message" name="message" rows={4}
                      value={formState.data.message} onChange={handleChange}
                      placeholder="Tell us about the site, event, or whatever you need protected — the more, the better."
                      className={`${inputBase} resize-none ${formState.errors.message ? 'border-safend-red' : ''}`}
                      aria-invalid={!!formState.errors.message}
                    />
                    {formState.errors.message && (
                      <p className="mt-2 text-[12px] text-safend-red">{formState.errors.message}</p>
                    )}
                  </div>

                  {/* Honeypot — hidden from real users, bots auto-fill it */}
                  <div aria-hidden="true" className="absolute opacity-0 h-0 w-0 overflow-hidden pointer-events-none" style={{ position: 'absolute', left: '-9999px' }}>
                    <label htmlFor="c-website">Website</label>
                    <input
                      type="text" id="c-website" name="website"
                      tabIndex={-1} autoComplete="off"
                      value={formState.data.website || ''}
                      onChange={(e) => setFormState((prev) => ({
                        ...prev, data: { ...prev.data, website: e.target.value }
                      }))}
                    />
                  </div>

                  {/* Cloudflare Turnstile widget */}
                  <div className="form-field">
                    <div ref={turnstileRef} />
                    {formState.status === 'error' && !turnstileToken && (
                      <p className="mt-2 text-[12px] text-safend-red">
                        Please complete the verification check above.
                      </p>
                    )}
                  </div>

                  {/* Submit */}
                  <div className="form-field pt-1">
                    <button
                      type="submit"
                      disabled={formState.status === 'submitting'}
                      className="group w-full inline-flex items-center justify-center gap-2 rounded-[10px] bg-safend-red px-[40px] py-[16px] sm:py-[18px] text-[14px] font-heading font-semibold tracking-[0.01em] uppercase text-white transition-all duration-300 hover:bg-[#b8151b] disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {formState.status === 'submitting' ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Sending…
                        </>
                      ) : (
                        <>
                          Send it over
                          <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                        </>
                      )}
                    </button>
                    <p className="mt-3 text-center text-[12px] font-body text-safend-muted">
                      We usually reply within 24 hours — and your details stay just between us.
                    </p>
                  </div>
                </form>
              )}
            </div>

            {/* ── Channels (desktop only) ── */}
            <div className="channels hidden lg:block">
              <p className="text-[11px] font-body text-safend-muted uppercase tracking-[0.12em] mb-8">
                Other ways to reach us
              </p>
              <div className="space-y-px bg-safend-mist rounded-[14px] overflow-hidden border border-safend-mist">
                {CONTACT_CHANNELS.map((ch) => {
                  const Icon = ch.icon;
                  const inner = (
                    <div className="channel-item group flex items-start gap-4 bg-safend-canvas p-6 transition-colors duration-300 hover:bg-safend-ink/2">
                      <span className="shrink-0 w-10 h-10 rounded-[10px] bg-safend-red/10 flex items-center justify-center text-safend-red transition-colors duration-300 group-hover:bg-safend-red group-hover:text-white">
                        <Icon className="w-5 h-5" />
                      </span>
                      <div>
                        <p className="text-[11px] font-body text-safend-muted uppercase tracking-[0.08em]">
                          {ch.label}
                        </p>
                        <p className="mt-1 text-[15px] font-body text-safend-ink leading-normal">
                          {ch.value}
                        </p>
                      </div>
                    </div>
                  );
                  return ch.href ? (
                    <a key={ch.label} href={ch.href} className="block">{inner}</a>
                  ) : (
                    <div key={ch.label}>{inner}</div>
                  );
                })}
              </div>

              {/* Map */}
              <div className="mt-6">
                <div className="relative rounded-[14px] overflow-hidden aspect-16/10 border border-safend-mist group">
                  <iframe
                    title="Safend Secure Solutions — Cuttack office location"
                    src="https://maps.google.com/maps?width=600&height=400&hl=en&q=Sai+Balaji+Complex+Pratap+Nagari+Cuttack+Odisha+753011&t=&z=15&ie=UTF8&iwloc=B&output=embed"
                    className="absolute inset-0 w-full h-full grayscale group-hover:grayscale-0 transition-[filter] duration-700"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                    style={{ border: 0 }}
                  />
                  <span className="pointer-events-none absolute bottom-0 left-0 h-[3px] w-0 bg-safend-red group-hover:w-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] z-10" />
                </div>
                <a
                  href="https://www.google.com/maps/search/?api=1&query=Sai+Balaji+Complex+Pratap+Nagari+Cuttack+Odisha+753011"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 text-[13px] font-body text-safend-ink/60 hover:text-safend-red transition-colors duration-200"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  Open in Google Maps
                  <span className="transition-transform duration-300">↗</span>
                </a>
              </div>
            </div>
          </div>

          {/* Map (mobile only) */}
          <div className="lg:hidden mt-8">
            <div className="relative rounded-[14px] overflow-hidden border border-safend-mist group" style={{ aspectRatio: '16/9' }}>
              <iframe
                title="Safend Secure Solutions — Cuttack office location"
                src="https://maps.google.com/maps?width=600&height=400&hl=en&q=Sai+Balaji+Complex+Pratap+Nagari+Cuttack+Odisha+753011&t=&z=15&ie=UTF8&iwloc=B&output=embed"
                className="absolute inset-0 w-full h-full grayscale"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                style={{ border: 0 }}
              />
            </div>
            <a
              href="https://www.google.com/maps/search/?api=1&query=Sai+Balaji+Complex+Pratap+Nagari+Cuttack+Odisha+753011"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 text-[13px] font-body text-safend-ink/60 hover:text-safend-red transition-colors duration-200"
            >
              <MapPin className="w-3.5 h-3.5" />
              Open in Google Maps
              <span>↗</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
