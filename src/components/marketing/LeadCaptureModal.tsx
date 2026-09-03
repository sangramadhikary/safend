'use client';

import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { TurnstileWidget, type TurnstileHandle } from '@/components/TurnstileWidget';
import {
  leadSchema,
  SECURITY_NEED_OPTIONS,
  SITE_TYPE_OPTIONS,
  SHIFT_OPTIONS,
  CONTRACT_DURATION_OPTIONS,
  BUDGET_OPTIONS,
  SOURCE_OPTIONS,
  type LeadInput,
} from '@/lib/leadSchema';
import { ShieldCheck, CheckCircle2, Loader2, Send, X } from 'lucide-react';

interface LeadCaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FieldErrors = Partial<Record<keyof LeadInput, string>>;
type Status = 'idle' | 'submitting' | 'success' | 'error';

const initialData: LeadInput = {
  name: '',
  phone: '',
  email: '',
  securityNeed: '',
  siteType: '',
  companyName: '',
  designation: '',
  city: '',
  state: '',
  siteAddress: '',
  numberOfSites: '',
  numberOfGuards: '',
  shiftType: '',
  startDate: '',
  contractDuration: '',
  currentProvider: '',
  budget: '',
  howDidYouHear: '',
  message: '',
  turnstileToken: '',
  website: '',
};

export function LeadCaptureModal({ open, onOpenChange }: LeadCaptureModalProps) {
  const [data, setData] = useState<LeadInput>(initialData);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>('idle');
  const turnstileRef = useRef<TurnstileHandle>(null);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = e.target;
    setData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setStatus('submitting');

    const result = leadSchema.safeParse(data);
    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof LeadInput;
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      setStatus('idle');
      return;
    }

    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        setStatus('success');
        setData(initialData);
      } else {
        // Consume-once token: reset so the next attempt gets a fresh one.
        turnstileRef.current?.reset();
        setData((prev) => ({ ...prev, turnstileToken: '' }));
        setStatus('error');
      }
    } catch {
      turnstileRef.current?.reset();
      setData((prev) => ({ ...prev, turnstileToken: '' }));
      setStatus('error');
    }
  }

  function handleClose() {
    if (status === 'success') setStatus('idle');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl w-[96vw] max-h-[96vh] flex flex-col rounded-2xl border-0 shadow-2xl bg-white dark:bg-slate-900 p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-8 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-lg font-bold text-slate-900 dark:text-white">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-red-50 dark:bg-red-950/30">
                <ShieldCheck className="h-4 w-4 text-[#D71920]" />
              </div>
              Free Security Assessment
            </DialogTitle>
            <DialogDescription className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              Tell us about your security needs. We&apos;ll design a PSARA Act 2005
              compliant, customised plan — no obligation.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {status === 'success' ? (
            <div className="flex flex-col items-center gap-5 py-14 text-center">
              <div className="h-16 w-16 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  We&apos;ve received your request!
                </p>
                <p className="max-w-md text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  Our operations team will review your requirements and contact you
                  within 24 hours with a tailored security assessment.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="mt-3 rounded-lg bg-[#D71920] px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#b8151b]"
              >
                Done
              </button>
            </div>
          ) : (
            <form id="lead-form" onSubmit={handleSubmit} noValidate>
              {status === 'error' && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800/30 p-2.5 flex items-center gap-2.5 mb-4">
                  <span className="text-red-600 text-sm font-bold">!</span>
                  <p className="text-sm text-red-700 dark:text-red-400">
                    Something went wrong. Please try again.
                  </p>
                </div>
              )}

              {/* ═══ Three-column dense grid ═══ */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-5">
                {/* ─── Column 1: Contact + Location ─── */}
                <div className="space-y-4">
                  <SectionHeading title="Contact Information" />
                  <Field label="Full name" name="name" required value={data.name} onChange={handleChange} error={errors.name} placeholder="e.g. Rahul Sharma" />
                  <Field label="Phone" name="phone" type="tel" required value={data.phone} onChange={handleChange} error={errors.phone} placeholder="+91 98765 43210" />
                  <Field label="Email" name="email" type="email" required value={data.email} onChange={handleChange} error={errors.email} placeholder="you@company.com" />
                  <Field label="Company" name="companyName" value={data.companyName ?? ''} onChange={handleChange} placeholder="Acme Corp Pvt. Ltd." />
                  <Field label="Designation" name="designation" value={data.designation ?? ''} onChange={handleChange} placeholder="e.g. Admin Manager" />
                  <SectionHeading title="Site & Location" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="City" name="city" value={data.city ?? ''} onChange={handleChange} placeholder="Bhubaneswar" />
                    <Field label="State" name="state" value={data.state ?? ''} onChange={handleChange} placeholder="Odisha" />
                  </div>
                  <Field label="Start date" name="startDate" type="date" value={data.startDate ?? ''} onChange={handleChange} />
                </div>

                {/* ─── Column 2: Security Requirement ─── */}
                <div className="space-y-4">
                  <SectionHeading title="Security Requirement" />
                  <SelectField label="What do you need?" name="securityNeed" required value={data.securityNeed} onChange={handleChange} error={errors.securityNeed} placeholder="Select…" options={SECURITY_NEED_OPTIONS} />
                  <SelectField label="Site / premises type" name="siteType" required value={data.siteType} onChange={handleChange} error={errors.siteType} placeholder="Select…" options={SITE_TYPE_OPTIONS} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Guards needed" name="numberOfGuards" value={data.numberOfGuards ?? ''} onChange={handleChange} placeholder="e.g. 5–10" />
                    <Field label="No. of sites" name="numberOfSites" value={data.numberOfSites ?? ''} onChange={handleChange} placeholder="e.g. 2" />
                  </div>
                  <SelectField label="Shift coverage" name="shiftType" value={data.shiftType ?? ''} onChange={handleChange} placeholder="Select…" options={SHIFT_OPTIONS} />
                  <Field label="Site address" name="siteAddress" value={data.siteAddress ?? ''} onChange={handleChange} placeholder="Plot No. 123, Industrial Estate" />
                  <Field label="Current provider" name="currentProvider" value={data.currentProvider ?? ''} onChange={handleChange} placeholder="None / Self-managed" />
                </div>

                {/* ─── Column 3: Budget + Additional ─── */}
                <div className="space-y-4">
                  <SectionHeading title="Budget & Timeline" />
                  <SelectField label="Contract duration" name="contractDuration" value={data.contractDuration ?? ''} onChange={handleChange} placeholder="Select…" options={CONTRACT_DURATION_OPTIONS} />
                  <SelectField label="Estimated budget" name="budget" value={data.budget ?? ''} onChange={handleChange} placeholder="Select…" options={BUDGET_OPTIONS} />
                  <SectionHeading title="Additional" />
                  <SelectField label="How did you hear about us?" name="howDidYouHear" value={data.howDidYouHear ?? ''} onChange={handleChange} placeholder="Select…" options={SOURCE_OPTIONS} />
                  <div>
                    <label htmlFor="lead-message" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Special requirements or notes
                    </label>
                    <textarea
                      id="lead-message"
                      name="message"
                      value={data.message ?? ''}
                      onChange={handleChange}
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#D71920]/20 focus:border-[#D71920] transition-all resize-none"
                      placeholder="Armed response, female guards, equipment, shift timings, etc."
                    />
                  </div>
                </div>
              </div>

              {/* Honeypot — hidden from users, bots auto-fill it */}
              <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, overflow: 'hidden' }}>
                <label htmlFor="lead-website">Website</label>
                <input
                  type="text"
                  id="lead-website"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={data.website ?? ''}
                  onChange={handleChange}
                />
              </div>
            </form>
          )}
        </div>

        {/* Sticky Footer with Turnstile + Cancel + Submit */}
        {status !== 'success' && (
          <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-xs px-8 py-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 justify-between">
            <TurnstileWidget
              ref={turnstileRef}
              onVerify={(token) =>
                setData((prev) => ({ ...prev, turnstileToken: token }))
              }
              onExpire={() => setData((prev) => ({ ...prev, turnstileToken: '' }))}
              className="shrink-0"
            />
            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <button
                type="submit"
                form="lead-form"
                disabled={status === 'submitting' || !data.turnstileToken}
                className="inline-flex items-center gap-2 rounded-lg bg-[#D71920] px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#b8151b] hover:shadow-md hover:shadow-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === 'submitting' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Section heading (minimal) ───────────────────────────────────────────── */

function SectionHeading({ title }: { title: string }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-2">
      {title}
    </h4>
  );
}

/* ─── Shared field components ─────────────────────────────────────────────── */

interface FieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}

function Field({ label, name, value, onChange, error, type = 'text', required, placeholder }: FieldProps) {
  const id = `lead-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-0.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
        {label}{required && <span className="text-[#D71920] ml-0.5">*</span>}
      </label>
      <input
        type={type}
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full rounded-lg border bg-white dark:bg-slate-800/50 px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#D71920]/20 focus:border-[#D71920] transition-all ${
          error ? 'border-red-400 ring-1 ring-red-400/20' : 'border-slate-200 dark:border-slate-700'
        }`}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} className="mt-0.5 text-[11px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

interface SelectFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: readonly string[];
  error?: string;
  required?: boolean;
  placeholder?: string;
}

function SelectField({ label, name, value, onChange, options, error, required, placeholder }: SelectFieldProps) {
  const id = `lead-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-0.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
        {label}{required && <span className="text-[#D71920] ml-0.5">*</span>}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        className={`w-full rounded-lg border bg-white dark:bg-slate-800/50 px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#D71920]/20 focus:border-[#D71920] transition-all ${
          error ? 'border-red-400 ring-1 ring-red-400/20' : 'border-slate-200 dark:border-slate-700'
        }`}
        aria-invalid={!!error}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      {error && (
        <p id={`${id}-error`} className="mt-0.5 text-[11px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
