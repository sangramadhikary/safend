'use client';

import { useRef, useState, useEffect } from 'react';
import {
  Shield, ShieldAlert, Users, UserCheck, Briefcase, MapPin,
  ArrowRight, Check, Send, Loader2,
} from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { JOB_POSTINGS, type JobPosting } from '@/data/careers';
import { EXPERIENCE_OPTIONS, type CareerApplicationInput } from '@/lib/careerSchema';
import { TurnstileWidget, type TurnstileHandle } from '@/components/TurnstileWidget';
import { HomeCta } from './HomeCta';

gsap.registerPlugin(ScrollTrigger, useGSAP);

type Status = 'idle' | 'submitting' | 'success' | 'error';
type FieldErrors = Partial<Record<keyof CareerApplicationInput, string>>;

export default function CareersContent() {
  const pageRef = useRef<HTMLDivElement>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [turnstileToken, setTurnstileToken] = useState('');
  const [formLoadedAt, setFormLoadedAt] = useState(0);

  useEffect(() => {
    setFormLoadedAt(Date.now());
  }, []);

  useGSAP(
    () => {
      /* Hero line reveal */
      gsap.utils.toArray<HTMLElement>('.cr-hero-line').forEach((line, i) => {
        gsap.from(line, { yPercent: 120, duration: 1.0, ease: 'power4.out', delay: 0.25 + i * 0.1 });
      });
      gsap.from('.cr-hero-meta', { opacity: 0, y: 20, duration: 0.8, ease: 'power2.out', delay: 0.9 });

      /* Job cards staggered */
      gsap.utils.toArray<HTMLElement>('.job-card').forEach((card, i) => {
        gsap.from(card, {
          y: 40, opacity: 0, duration: 0.7, ease: 'power3.out', delay: i * 0.06,
          scrollTrigger: { trigger: '.jobs-grid', start: 'top 85%', toggleActions: 'play none none none' },
        });
      });

      /* Form reveal */
      gsap.from('.apply-form', {
        y: 50, opacity: 0, duration: 0.8, ease: 'power3.out',
        scrollTrigger: { trigger: '.apply-form', start: 'top 85%', toggleActions: 'play none none none' },
      });
    },
    { scope: pageRef }
  );

  const handleApply = (jobId: string) => {
    setSelectedJob(jobId);
    // Scroll to form
    document.getElementById('apply-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFieldErrors({});
    setErrorMsg('');

    if (!turnstileToken) {
      setErrorMsg('Please complete the verification.');
      return;
    }

    setStatus('submitting');

    const form = e.currentTarget;
    const formData = new FormData();
    formData.append('name', (form.elements.namedItem('name') as HTMLInputElement).value.trim());
    formData.append('email', (form.elements.namedItem('email') as HTMLInputElement).value.trim());
    formData.append('phone', (form.elements.namedItem('phone') as HTMLInputElement).value.trim());
    formData.append('jobId', (form.elements.namedItem('jobId') as HTMLSelectElement).value);
    formData.append('experience', (form.elements.namedItem('experience') as HTMLSelectElement).value);
    formData.append('currentLocation', (form.elements.namedItem('currentLocation') as HTMLInputElement).value.trim());
    formData.append('message', (form.elements.namedItem('message') as HTMLTextAreaElement).value.trim());
    formData.append('turnstileToken', turnstileToken);
    formData.append('website', (form.elements.namedItem('website') as HTMLInputElement).value);
    formData.append('_formLoadedAt', String(formLoadedAt));

    // Resume file
    const resumeInput = form.elements.namedItem('resume') as HTMLInputElement;
    if (resumeInput.files && resumeInput.files[0]) {
      formData.append('resume', resumeInput.files[0]);
    }

    try {
      const res = await fetch('/api/career-apply', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.fieldErrors) setFieldErrors(json.fieldErrors);
        setErrorMsg(json.error || 'Something went wrong.');
        setStatus('error');
        turnstileRef.current?.reset();
        setTurnstileToken('');
        return;
      }

      setStatus('success');
    } catch {
      setErrorMsg('Network error. Please try again.');
      setStatus('error');
      turnstileRef.current?.reset();
      setTurnstileToken('');
    }
  };

  return (
    <div ref={pageRef} className="bg-safend-canvas">
      {/* ════════════ HERO ════════════ */}
      <section className="w-full pt-[120px] lg:pt-[150px] pb-[50px] lg:pb-[70px]">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <p className="cr-hero-meta text-[11px] font-body text-safend-muted uppercase tracking-[0.18em] mb-8">
            Join the Team
          </p>
          <h1
            className="font-display font-bold text-safend-ink leading-[0.86] tracking-[-0.04em]"
            style={{ fontSize: 'clamp(2.75rem, 9vw, 7.5rem)' }}
          >
            <span className="block overflow-hidden"><span className="cr-hero-line block">Build a career</span></span>
            <span className="block overflow-hidden"><span className="cr-hero-line block">in security<span className="text-safend-red">.</span></span></span>
          </h1>
          <div className="cr-hero-meta mt-10 flex items-center gap-5">
            <div className="h-[2px] w-[50px] bg-safend-red" aria-hidden />
            <p className="text-[15px] font-body text-safend-slate-grey leading-[1.6] max-w-[460px]">
              We&apos;re hiring across Odisha, Telangana, and West Bengal. Competitive pay, statutory benefits,
              and real growth opportunities — from guard to area manager.
            </p>
          </div>
        </div>
      </section>

      {/* ════════════ OPEN POSITIONS ════════════ */}
      <section className="w-full py-[40px] lg:py-[60px]">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <div className="section-head mb-10">
            <p className="text-[11px] font-body text-safend-muted uppercase tracking-[0.15em] mb-5">
              Open Positions — {String(JOB_POSTINGS.length).padStart(2, '0')}
            </p>
            <h2
              className="font-display font-bold text-safend-ink leading-[0.92] tracking-[-0.03em]"
              style={{ fontSize: 'clamp(1.75rem, 5vw, 3.5rem)' }}
            >
              Current openings<span className="text-safend-red">.</span>
            </h2>
          </div>

          <div className="jobs-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {JOB_POSTINGS.map((job) => (
              <JobCard key={job.id} job={job} onApply={handleApply} />
            ))}
          </div>
        </div>
      </section>

      {/* ════════════ APPLICATION FORM ════════════ */}
      <section id="apply-section" className="w-full bg-safend-ink py-[90px] lg:py-[130px]">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <div className="flex items-center gap-4 mb-14">
            <span className="h-2 w-2 rounded-full bg-safend-red" aria-hidden />
            <p className="text-[11px] font-body text-safend-canvas/40 uppercase tracking-[0.18em]">
              Apply now
            </p>
          </div>
          <h2
            className="section-head font-display font-bold text-safend-canvas leading-[0.92] tracking-[-0.03em] max-w-3xl mb-6"
            style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)' }}
          >
            Ready to start<span className="text-safend-red">?</span>
          </h2>
          <p className="text-[15px] font-body text-safend-canvas/70 leading-[1.7] max-w-[560px] mb-12">
            Fill in the form below and our HR team will get back to you within 48 hours.
            No account needed — just your details and which role interests you.
          </p>

          {status === 'success' ? (
            <div className="apply-form max-w-2xl rounded-[20px] border border-white/15 bg-white/3 p-8 lg:p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-safend-red/15 flex items-center justify-center mx-auto mb-6">
                <Check className="w-8 h-8 text-safend-red" />
              </div>
              <h3 className="font-display font-bold text-safend-canvas text-[22px]">Application sent</h3>
              <p className="mt-3 text-[14px] font-body text-safend-canvas/60 leading-[1.6] max-w-[400px] mx-auto">
                Thank you for applying. Our HR team at hr@safends.com will review your application and
                reach out within 48 hours.
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="apply-form max-w-2xl rounded-[20px] border border-white/15 bg-white/3 p-7 lg:p-10 space-y-5"
            >
              {/* Honeypot */}
              <input
                type="text"
                name="website"
                autoComplete="off"
                tabIndex={-1}
                className="absolute opacity-0 w-0 h-0 pointer-events-none"
                aria-hidden="true"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Full name" name="name" type="text" required error={fieldErrors.name} />
                <Field label="Email" name="email" type="email" required error={fieldErrors.email} />
                <Field label="Phone" name="phone" type="tel" required error={fieldErrors.phone} />
                <Field label="Current location" name="currentLocation" type="text" required error={fieldErrors.currentLocation} />

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="jobId" className="text-[12px] font-heading font-semibold uppercase tracking-widest text-safend-canvas/60">
                    Position <span className="text-safend-red">*</span>
                  </label>
                  <select
                    id="jobId"
                    name="jobId"
                    required
                    defaultValue={selectedJob ?? ''}
                    className="rounded-[10px] border border-white/15 bg-white/5 px-4 py-3 text-[14px] font-body text-safend-canvas placeholder:text-safend-canvas/30 focus:outline-hidden focus:border-safend-red/60 transition-colors"
                  >
                    <option value="" disabled>Select a role…</option>
                    {JOB_POSTINGS.map((j) => (
                      <option key={j.id} value={j.id} className="text-safend-ink">{j.title}</option>
                    ))}
                  </select>
                  {fieldErrors.jobId && <span className="text-[11px] text-safend-red">{fieldErrors.jobId}</span>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="experience" className="text-[12px] font-heading font-semibold uppercase tracking-widest text-safend-canvas/60">
                    Experience <span className="text-safend-red">*</span>
                  </label>
                  <select
                    id="experience"
                    name="experience"
                    required
                    defaultValue=""
                    className="rounded-[10px] border border-white/15 bg-white/5 px-4 py-3 text-[14px] font-body text-safend-canvas placeholder:text-safend-canvas/30 focus:outline-hidden focus:border-safend-red/60 transition-colors"
                  >
                    <option value="" disabled>Select…</option>
                    {EXPERIENCE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} className="text-safend-ink">{opt}</option>
                    ))}
                  </select>
                  {fieldErrors.experience && <span className="text-[11px] text-safend-red">{fieldErrors.experience}</span>}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="message" className="text-[12px] font-heading font-semibold uppercase tracking-widest text-safend-canvas/60">
                  Anything else? <span className="text-safend-canvas/30">(optional)</span>
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={3}
                  maxLength={2000}
                  placeholder="Ex-service background, certifications, preferred shift…"
                  className="rounded-[10px] border border-white/15 bg-white/5 px-4 py-3 text-[14px] font-body text-safend-canvas placeholder:text-safend-canvas/30 focus:outline-hidden focus:border-safend-red/60 transition-colors resize-none"
                />
              </div>

              {/* Resume upload */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="resume" className="text-[12px] font-heading font-semibold uppercase tracking-widest text-safend-canvas/60">
                  Upload resume <span className="text-safend-canvas/30">(PDF or Word, max 5 MB)</span>
                </label>
                <input
                  id="resume"
                  name="resume"
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="rounded-[10px] border border-white/15 bg-white/5 px-4 py-3 text-[13px] font-body text-safend-canvas/70 file:mr-4 file:rounded-full file:border-0 file:bg-safend-red/15 file:px-4 file:py-1.5 file:text-[11px] file:font-heading file:font-semibold file:uppercase file:text-safend-red file:cursor-pointer hover:file:bg-safend-red/25 transition-colors"
                />
              </div>

              {/* Turnstile */}
              <TurnstileWidget
                ref={turnstileRef}
                onVerify={setTurnstileToken}
                onExpire={() => setTurnstileToken('')}
                theme="dark"
                size="normal"
                className="mt-2"
              />

              {errorMsg && (
                <p className="text-[13px] font-body text-safend-red">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={status === 'submitting'}
                className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-safend-red px-7 py-4 text-[13px] font-heading font-semibold uppercase tracking-[0.01em] text-white transition-all duration-300 hover:bg-[#b8151b] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {status === 'submitting' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                ) : (
                  <><Send className="w-4 h-4" /> Submit Application</>
                )}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ════════════ CTA ════════════ */}
      <HomeCta />
    </div>
  );
}

/* ─── Reusable text input field ─────────────────────────────────────────── */
function Field({ label, name, type, required, error }: {
  label: string; name: string; type: string; required?: boolean; error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-[12px] font-heading font-semibold uppercase tracking-widest text-safend-canvas/60">
        {label} {required && <span className="text-safend-red">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        className="rounded-[10px] border border-white/15 bg-white/5 px-4 py-3 text-[14px] font-body text-safend-canvas placeholder:text-safend-canvas/30 focus:outline-hidden focus:border-safend-red/60 transition-colors"
      />
      {error && <span className="text-[11px] text-safend-red">{error}</span>}
    </div>
  );
}

/* ─── Job card ──────────────────────────────────────────────────────────── */
function JobCard({ job, onApply }: { job: JobPosting; onApply: (id: string) => void }) {
  return (
    <div className="job-card group relative flex flex-col rounded-[18px] border border-safend-mist bg-white p-6 transition-all duration-500 hover:border-safend-red/40 hover:-translate-y-1">
      {/* Department badge */}
      <div className="flex items-center justify-between mb-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-safend-light-grey px-3 py-1.5 text-[10px] font-heading font-semibold uppercase tracking-[0.12em] text-safend-slate-grey">
          <Briefcase className="w-3 h-3" />
          {job.department}
        </span>
        <span className="text-[10px] font-body text-safend-muted uppercase tracking-widest">
          {job.type}
        </span>
      </div>

      <h3 className="font-display font-bold text-safend-ink text-[18px] leading-[1.12] tracking-[-0.02em]">
        {job.title}
      </h3>

      <p className="mt-2 flex items-center gap-1.5 text-[12px] font-body text-safend-muted">
        <MapPin className="w-3.5 h-3.5" /> {job.location}
      </p>

      <p className="mt-3 text-[12.5px] font-body text-safend-slate-grey leading-[1.55]">
        {job.description}
      </p>

      {/* Requirements */}
      <ul className="mt-4 space-y-1.5 text-[11.5px] font-body text-safend-muted">
        {job.requirements.slice(0, 3).map((req) => (
          <li key={req} className="flex items-start gap-2">
            <Check className="w-3 h-3 text-safend-red mt-0.5 shrink-0" />
            <span>{req}</span>
          </li>
        ))}
        {job.requirements.length > 3 && (
          <li className="text-safend-muted/60">+ {job.requirements.length - 3} more</li>
        )}
      </ul>

      <button
        type="button"
        onClick={() => onApply(job.id)}
        className="mt-auto pt-5 inline-flex items-center gap-1.5 text-[12px] font-heading font-semibold uppercase tracking-[0.02em] text-safend-ink transition-colors duration-300 group-hover:text-safend-red"
      >
        Apply Now
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
      </button>
    </div>
  );
}
