'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { Eye, EyeOff, AlertCircle, ArrowRight, BarChart3, FileText, Users, AlertTriangle, CreditCard, Shield, Clock, MapPin } from 'lucide-react';
import { NavigationBar } from '@/components/marketing/NavigationBar';
import { Footer } from '@/components/marketing/Footer';
import { LeadCaptureModal } from '@/components/marketing/LeadCaptureModal';

const PORTAL_FEATURES = [
  {
    icon: BarChart3,
    title: 'See Everything Live',
    description: 'Know exactly where your guards are, right now. Live deployment maps, shift status, and site coverage — no waiting for reports.',
  },
  {
    icon: FileText,
    title: 'Invoices at Your Fingertips',
    description: 'Every invoice, every month — instantly available. Download, share, or dispute in two clicks. No more phone calls.',
  },
  {
    icon: Users,
    title: 'Who Showed Up Today?',
    description: 'GPS-verified attendance for every guard, every shift. You see the same data we see. No surprises at month-end.',
  },
  {
    icon: AlertTriangle,
    title: 'Report Issues Instantly',
    description: 'Something happened? Report it in 30 seconds. Attach photos, tag the location, and track resolution in real time.',
  },
  {
    icon: CreditCard,
    title: 'Track Every Payment',
    description: 'See what you paid, what is pending, and download receipts anytime. Complete financial transparency, always.',
  },
  {
    icon: Shield,
    title: 'Compliance, Sorted',
    description: 'PSARA licenses, insurance certificates, statutory documents — all current, all accessible. Your auditor will thank you.',
  },
];

const DIFFERENTIATORS = [
  { icon: Clock, text: 'Live updates, not monthly reports' },
  { icon: MapPin, text: 'GPS proof that guards are actually on site' },
  { icon: BarChart3, text: 'Every rupee accounted for, line by line' },
  { icon: Shield, text: 'Incidents reported with photos, not phone calls' },
];

export function ClientLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAssessment, setShowAssessment] = useState(false);
  const loginRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkExisting = async () => {
      try {
        const client = getSupabaseClient();
        const { data: { session } } = await client.auth.getSession();
        if (session?.user) {
          const { data } = await client
            .from('client_users')
            .select('id, status')
            .eq('auth_user_id', session.user.id)
            .single();
          if (data && data.status === 'active') {
            router.push('/client-portal');
          }
        }
      } catch {
        // Not authenticated — stay on login page
      }
    };
    checkExisting();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const client = getSupabaseClient();
      const { data, error: authErr } = await client.auth.signInWithPassword({ email, password });

      if (authErr) throw new Error(authErr.message);
      if (!data?.user) throw new Error('Login failed. Please try again.');

      const { data: clientUser, error: clientErr } = await client
        .from('client_users')
        .select('id, status')
        .eq('auth_user_id', data.user.id)
        .single();

      if (clientErr || !clientUser) {
        await client.auth.signOut();
        throw new Error('Access denied. This portal is for registered clients only.');
      }

      if (clientUser.status !== 'active') {
        await client.auth.signOut();
        throw new Error('Your account has been suspended. Please contact support.');
      }

      localStorage.setItem('clientAuthenticated', 'true');
      localStorage.setItem('userRole', 'client');
      router.push('/client-portal');
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-safend-canvas">
      {/* ════════════ NAV (same as marketing site) ════════════ */}
      <NavigationBar />

      {/* ════════════ HERO + LOGIN ════════════ */}
      <section ref={loginRef} className="w-full min-h-[calc(100vh-76px)] flex items-center pt-[100px] lg:pt-[76px] pb-[40px] lg:pb-[60px]">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px] w-full">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-16 items-center">

            {/* ─── Left: Login Form ─── */}
            <div className="w-full max-w-[420px]">
              {/* Header */}
              <div className="mb-7">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-safend-red/5 border border-safend-red/10 mb-5">
                  <div className="w-1.5 h-1.5 rounded-full bg-safend-red animate-pulse" />
                  <span className="text-[11px] font-heading font-semibold text-safend-red uppercase tracking-widest">
                    Client Portal
                  </span>
                </div>
                <h1 className="font-display font-bold text-[28px] lg:text-[32px] text-safend-ink leading-[1.1] tracking-[-0.02em] mb-2">
                  Your security, one login away<span className="text-safend-red">.</span>
                </h1>
                <p className="text-[14px] font-body text-safend-slate-grey leading-[1.6]">
                  Track guards, download invoices, report incidents — all in one place.
                </p>
              </div>

              {/* Form card */}
              <div className="bg-white rounded-[20px] border border-safend-mist/80 p-7 lg:p-9 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Email field */}
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-[13px] font-body font-medium text-safend-ink">
                      Email address
                    </label>
                    <input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isLoading}
                      className="w-full h-[50px] pl-4 pr-4 rounded-[12px] border border-safend-ink/10 bg-transparent text-[14px] font-body text-safend-ink placeholder:text-safend-ink/30 focus:outline-hidden focus:ring-2 focus:ring-safend-red/15 focus:border-safend-red/40 transition-all duration-200 disabled:opacity-50"
                    />
                  </div>

                  {/* Password field */}
                  <div className="space-y-2">
                    <label htmlFor="password" className="text-[13px] font-body font-medium text-safend-ink">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={isLoading}
                        className="w-full h-[50px] pl-4 pr-12 rounded-[12px] border border-safend-ink/10 bg-transparent text-[14px] font-body text-safend-ink placeholder:text-safend-ink/30 focus:outline-hidden focus:ring-2 focus:ring-safend-red/15 focus:border-safend-red/40 transition-all duration-200 disabled:opacity-50"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-[8px] text-safend-muted hover:text-safend-ink hover:bg-safend-light-grey transition-all duration-150"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                      </button>
                    </div>
                  </div>

                  {/* Error message */}
                  {error && (
                    <div className="flex items-start gap-2.5 text-[13px] text-red-700 bg-red-50 p-3.5 rounded-[12px] border border-red-100">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
                      <span className="font-body leading-[1.4]">{error}</span>
                    </div>
                  )}

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-[50px] rounded-[12px] bg-safend-ink text-white text-[14px] font-heading font-semibold tracking-[0.01em] transition-all duration-200 hover:bg-safend-ink/90 hover:shadow-lg hover:shadow-safend-ink/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 group"
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        Sign in to Portal
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" />
                      </>
                    )}
                  </button>
                </form>

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-safend-mist" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-3 text-[11px] font-body text-safend-muted uppercase tracking-[0.08em]">
                      Not a client yet?
                    </span>
                  </div>
                </div>

                {/* Secondary action */}
                <button
                  type="button"
                  onClick={() => setShowAssessment(true)}
                  className="w-full h-[46px] rounded-[12px] border border-safend-mist text-[13px] font-heading font-semibold text-safend-ink tracking-[0.01em] transition-all duration-200 hover:border-safend-ink/30 hover:bg-safend-light-grey flex items-center justify-center gap-2"
                >
                  Talk to us — we&apos;ll set you up
                </button>
              </div>
            </div>

            {/* ─── Right: Illustration + Quote ─── */}
            <div className="hidden lg:flex items-center justify-center">
              <div className="relative w-full flex flex-col items-center text-center px-8">
                {/* Illustration — large, centered */}
                <div className="relative mb-10">
                  <div className="absolute inset-0 -m-8 bg-linear-to-b from-safend-red/3 to-transparent rounded-full blur-3xl" />
                  <img
                    src="/guard.svg"
                    alt="Security guard illustration"
                    className="relative w-[340px] h-auto"
                  />
                </div>

                {/* Quote — centered below image */}
                <div className="max-w-[400px]">
                  <div className="w-10 h-[2px] bg-safend-red mx-auto mb-5" />
                  <blockquote className="text-[22px] font-display font-medium text-safend-ink leading-[1.4] tracking-[-0.015em] mb-6">
                    &ldquo;You shouldn&apos;t have to wonder if your guards showed up. Now you&apos;ll always know.&rdquo;
                  </blockquote>
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-safend-red/10 flex items-center justify-center">
                      <Shield className="w-4 h-4 text-safend-red" />
                    </div>
                    <div className="text-left">
                      <p className="text-[13px] font-heading font-semibold text-safend-ink">Safend Secure Solutions</p>
                      <p className="text-[11px] font-body text-safend-muted">260+ businesses trust us daily</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ════════════ DIFFERENTIATORS STRIP ════════════ */}
      <section className="w-full py-[40px] lg:py-[50px] border-y border-safend-mist bg-white overflow-hidden">
        {/* Scrolling marquee — right to left */}
        <div className="relative">
          <div className="flex animate-[marquee_25s_linear_infinite] gap-16 lg:gap-20 w-max">
            {[...DIFFERENTIATORS, ...DIFFERENTIATORS].map((d, i) => (
              <div key={i} className="flex items-center gap-4 shrink-0">
                <span className="w-12 h-12 rounded-full bg-safend-red/5 border border-safend-red/10 flex items-center justify-center shrink-0">
                  <d.icon className="w-5 h-5 text-safend-red" />
                </span>
                <p className="text-[17px] lg:text-[18px] font-body font-medium text-safend-ink leading-[1.3] whitespace-nowrap">{d.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════ PORTAL FEATURES ════════════ */}
      <section className="w-full py-[80px] lg:py-[120px]">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-14 lg:mb-20">
            <div>
              <p className="text-[11px] font-body text-safend-muted uppercase tracking-[0.15em] mb-5">
                What you get — {String(PORTAL_FEATURES.length).padStart(2, '0')} tools
              </p>
              <h2
                className="font-display font-bold text-safend-ink leading-[0.92] tracking-[-0.03em]"
                style={{ fontSize: 'clamp(1.75rem, 5vw, 3.5rem)' }}
              >
                One dashboard<span className="text-safend-red">,</span><br />
                complete control<span className="text-safend-red">.</span>
              </h2>
            </div>
            <p className="text-[15px] font-body text-safend-slate-grey leading-[1.6] max-w-[380px]">
              Everything you need to manage your security — from attendance to invoices — in one place.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-7">
            {PORTAL_FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div
                  key={i}
                  className="group relative rounded-[20px] bg-white border border-safend-mist/80 p-7 lg:p-8 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:border-safend-mist hover:-translate-y-1"
                >
                  {/* Number badge */}
                  <span className="absolute top-7 right-7 text-[11px] font-heading font-semibold text-safend-muted/40 uppercase tracking-widest">
                    {String(i + 1).padStart(2, '0')}
                  </span>

                  {/* Icon */}
                  <span className="inline-flex w-12 h-12 rounded-[14px] bg-safend-ink items-center justify-center text-white mb-6 transition-colors duration-300 group-hover:bg-safend-red">
                    <Icon className="w-5 h-5" />
                  </span>

                  {/* Title */}
                  <h3 className="font-display font-bold text-[18px] lg:text-[20px] text-safend-ink leading-[1.2] tracking-[-0.01em] mb-3">
                    {feature.title}
                  </h3>

                  {/* Description */}
                  <p className="text-[14px] font-body text-safend-slate-grey leading-[1.65]">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ════════════ SOCIAL PROOF ════════════ */}
      <section className="w-full py-[60px] lg:py-[80px] bg-safend-ink">
        <div className="max-w-editorial mx-auto px-6 sm:px-10 lg:px-[50px]">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-10">
            <div>
              <p className="text-[11px] font-body text-white/40 uppercase tracking-[0.18em] mb-5">
                The numbers speak
              </p>
              <h2
                className="font-display font-bold text-white leading-[0.92] tracking-[-0.03em]"
                style={{ fontSize: 'clamp(1.5rem, 4vw, 2.75rem)' }}
              >
                Businesses across India<br />
                count on us every single day<span className="text-safend-red">.</span>
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-8 lg:gap-12">
              <div className="text-center">
                <p className="font-display font-bold text-[2rem] lg:text-[2.5rem] text-white leading-none">260+</p>
                <p className="text-[11px] font-body text-white/50 mt-2 uppercase tracking-widest">Happy Clients</p>
              </div>
              <div className="text-center">
                <p className="font-display font-bold text-[2rem] lg:text-[2.5rem] text-white leading-none">2700+</p>
                <p className="text-[11px] font-body text-white/50 mt-2 uppercase tracking-widest">Guards on Duty</p>
              </div>
              <div className="text-center">
                <p className="font-display font-bold text-[2rem] lg:text-[2.5rem] text-white leading-none">14+</p>
                <p className="text-[11px] font-body text-white/50 mt-2 uppercase tracking-widest">Years Strong</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════ FOOTER (same as marketing site) ════════════ */}
      <Footer />

      {/* ════════════ Free Security Assessment Modal ════════════ */}
      <LeadCaptureModal open={showAssessment} onOpenChange={setShowAssessment} />
    </div>
  );
}
