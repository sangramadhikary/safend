'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { LoginForm } from "@/components/LoginForm";
import { Button } from "@/components/ui/button";
import { Users, Home } from "lucide-react";
import { ClientOnly } from "@/components/ClientOnly";
import { getRedirectPath } from "@/utils/roleRedirect";
import { useToastWithSound } from "@/hooks/use-toast-with-sound";
import { supabase, getSupabaseClient } from "@/integrations/supabase/client";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

// Lazy-load heavy modals/forms — they're only shown on user interaction
const EmployeeVerificationPage = dynamic(() => import("@/components/EmployeeVerificationPage"), { ssr: false });
const OnboardingForms = dynamic(() => import("@/components/OnboardingForms"), { ssr: false });

const Index = () => {
  const [formOpen, setFormOpen] = useState(false);
  const [formType, setFormType] = useState<"client" | "employee">("client");
  const [showEmployeeVerification, setShowEmployeeVerification] = useState(false);

  const router = useRouter();
  const { toast } = useToastWithSound();

  useEffect(() => {
    (async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession() as { data: { session: { user: any } | null }, error: any };

        if (error) {
          throw error;
        }

        if (session) {
          // Determine user's role
          let role: string | null = typeof window !== 'undefined' ? localStorage.getItem("userRole") : null;

          if (!role) {
            // No cached role — determine from DB
            const client = getSupabaseClient();
            const { data: clientUser } = await client
              .from('client_users')
              .select('id, status')
              .eq('auth_user_id', session.user.id)
              .single();

            if (clientUser && clientUser.status === 'active') {
              role = 'client';
              localStorage.setItem('userRole', 'client');
              localStorage.setItem('clientAuthenticated', 'true');
            } else {
              const { data: employeeUser } = await client
                .from('employee_users')
                .select('id, status')
                .eq('auth_user_id', session.user.id)
                .single();

              if (employeeUser && employeeUser.status === 'active') {
                role = 'supervisor';
                localStorage.setItem('userRole', 'supervisor');
              }
            }
          }

          // ── Portal boundary enforcement ────────────────────────────────────
          // If the user's role doesn't match the current subdomain, sign them
          // out instead of redirecting into a loop. This prevents the infinite
          // login/logout cycle when ERP creds are used on ops or vice versa.
          const host = window.location.hostname;
          const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'safend.in';
          const currentSubdomain = host.endsWith(`.${rootDomain}`)
            ? host.slice(0, -(rootDomain.length + 1))
            : null;

          const isSupervisorRole = role === 'supervisor' || role === 'employee_portal';
          const isClientRole = role === 'client';
          const isErpRole = role && !isSupervisorRole && !isClientRole;

          const portalMismatch =
            (currentSubdomain === 'ops' && !isSupervisorRole) ||
            (currentSubdomain === 'office' && !isErpRole) ||
            (currentSubdomain === 'client' && !isClientRole);

          if (portalMismatch) {
            // Wrong portal — sign out cleanly, stay on login page
            const { cleanupAuthState } = await import('@/utils/authCleanup');
            cleanupAuthState();
            try { await supabase.auth.signOut(); } catch {}
            return;
          }

          // Role matches subdomain — redirect to appropriate page
          if (role) {
            router.push(getRedirectPath(role));
          } else {
            router.push(getRedirectPath(null));
          }
        }
        // No session → stay on the login page (do nothing).
      } catch {
        toast.error({
          title: "Session verification failed",
          description: "We couldn't verify your session. Please sign in to continue.",
        });
      }
    })();
  }, [router, toast]);


  const handleClientOnboard = () => {
    setFormType("client");
    setFormOpen(true);
  };

  const handleEmployeeOnboard = () => {
    setFormType("employee");
    setFormOpen(true);
  };

  const ROOT_DOMAIN_CLIENT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'safend.in';
  const [isOpsPortal, setIsOpsPortal] = useState(false);
  const [isOfficePortal, setIsOfficePortal] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      setIsOpsPortal(host === `ops.${ROOT_DOMAIN_CLIENT}`);
      setIsOfficePortal(host === `office.${ROOT_DOMAIN_CLIENT}`);
    }
  }, []);

  // Portal-specific branding
  const portalLabel = isOpsPortal ? 'Supervisor Portal' : isOfficePortal ? 'Office Portal' : 'Operations Portal';
  const portalHeading = isOpsPortal ? 'Supervisor sign in' : 'Sign in to continue';
  const portalQuote = isOpsPortal
    ? '\u201CYour presence keeps people safe.\u201D'
    : '\u201CYour team is only as strong as the system behind it.\u201D';
  const portalQuoteAttrib = isOpsPortal ? 'Safend Field Operations' : 'Safend Operations Platform';
  const portalAccentClass = isOpsPortal ? 'bg-emerald-600' : 'bg-safend-red';
  const portalLabelClass = isOpsPortal ? 'text-emerald-600' : 'text-safend-red';

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-safend-canvas">
      {/* Home button — hidden on ops subdomain (users are restricted to portal only) */}
      {!isOpsPortal && (
        <ClientOnly>
          <Button
            variant="outline"
            onClick={() => router.push('/')}
            className="fixed top-4 left-4 z-100 flex items-center gap-2 text-sm bg-white/80 backdrop-blur-md border-safend-mist shadow-xs hover:shadow-md transition-shadow"
            aria-label="Go to Home"
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Home</span>
          </Button>
        </ClientOnly>
      )}

      {/* Verify Employee button */}
      <ClientOnly>
        <Button
          variant="outline"
          onClick={() => setShowEmployeeVerification(!showEmployeeVerification)}
          className="fixed top-4 right-4 z-100 flex items-center gap-2 text-sm bg-white/80 backdrop-blur-md border-safend-mist shadow-xs hover:shadow-md transition-shadow"
          aria-label="Verify Employee"
        >
          <Users className="h-4 w-4" />
          <span className="hidden sm:inline">Verify Employee</span>
        </Button>
      </ClientOnly>

      {/* ─── LEFT: Visual panel (hidden on mobile) ─── */}
      <div className={`hidden lg:flex flex-1 items-center justify-center relative overflow-hidden ${isOpsPortal ? 'bg-emerald-50' : 'bg-safend-canvas'}`}>
        <div className="relative z-10 text-center px-12 max-w-[520px]">
          {/* Guard illustration — large */}
          <img
            src="/guard.svg"
            alt="Security operations"
            className="w-[400px] h-auto mx-auto mb-10"
          />

          {/* Quote */}
          <div className={`w-10 h-[2px] ${portalAccentClass} mx-auto mb-5`} />
          <p className="text-[20px] font-display font-medium text-safend-ink leading-[1.4] tracking-[-0.01em] mb-5">
            {portalQuote}
          </p>
          <p className="text-[13px] font-body text-safend-muted">
            {portalQuoteAttrib}
          </p>
        </div>
      </div>

      {/* ─── RIGHT: Login form ─── */}
      <div className="flex-1 flex flex-col min-h-screen px-6 py-16 lg:py-12 relative bg-white">
        {/* Portal accent strip — visible on mobile as a top indicator */}
        <div className={`absolute top-0 left-0 right-0 h-1 ${portalAccentClass} lg:hidden`} />

        {/* Logo — prominent, centered */}
        <div className="w-full max-w-[380px] mx-auto pt-4 lg:pt-8">
          <img src="/logo.png" alt="Safend" className="h-16 lg:h-20 w-auto mx-auto" />
        </div>

        {/* Centered login content */}
        <div className="w-full max-w-[380px] mx-auto my-auto">
          {/* Header */}
          <div className="mb-6">
            <p className={`text-[11px] font-heading font-semibold ${portalLabelClass} uppercase tracking-widest mb-3`}>
              {portalLabel}
            </p>
            <h1 className="font-display font-bold text-[22px] lg:text-[26px] text-safend-ink leading-[1.2] tracking-[-0.02em]">
              {portalHeading}
            </h1>
          </div>

          {/* Form — no card wrapper, just fields */}
          <LoginForm showQrScanner />

          {/* Footer note */}
          <div className="mt-8 pt-6 border-t border-safend-mist">
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="w-full max-w-[380px] mx-auto">
          <p className="text-[11px] font-body text-safend-muted/60 text-center">
            &copy; 2026 Safend Secure Solutions Pvt. Ltd.
          </p>
        </div>
      </div>

      <ClientOnly>
        <EmployeeVerificationPage
          isOpen={showEmployeeVerification}
          onClose={() => setShowEmployeeVerification(false)}
          onEmployeeOnboard={handleEmployeeOnboard}
          onClientOnboard={handleClientOnboard}
        />
        <OnboardingForms
          open={formOpen}
          onOpenChange={setFormOpen}
          type={formType}
        />
      </ClientOnly>

      {/* PWA install prompt — one-tap install on Android (only on ops subdomain) */}
      {isOpsPortal && <InstallPrompt />}
    </div>
  );
};

export default Index;
