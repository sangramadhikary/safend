'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'safend.in';

// ERP / Supervisor login (unified)
const Index = dynamic(() => import('@/modules/Index'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen w-full flex items-center justify-center bg-linear-to-br from-[#1a1d2e] via-[#0f1219] to-[#0b0e18]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-white/20 border-t-[#D71920] rounded-full animate-spin" />
        <p className="text-sm text-white/40">Loading...</p>
      </div>
    </div>
  ),
});

// Client login
const ClientLoginPage = dynamic(
  () => import('@/modules/client-portal/components/ClientLoginPage').then(mod => ({ default: mod.ClientLoginPage })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen w-full flex items-center justify-center bg-linear-to-br from-slate-50 to-slate-100">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-slate-200 border-t-[#D71920] rounded-full animate-spin" />
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    ),
  }
);

/**
 * Universal login page — renders the appropriate login based on subdomain:
 * - client.safend.in/login → Client login
 * - office.safend.in/login → ERP login (unified)
 * - ops.safend.in/login → ERP login (unified, used by supervisor auth)
 *
 * On localhost in development, always shows ERP login (client portal is at /client-login).
 */
export default function LoginPage() {
  const [portal, setPortal] = useState<'client' | 'office'>('office');

  useEffect(() => {
    const host = window.location.hostname;
    // Only switch to client login on the production client subdomain
    if (host === `client.${ROOT_DOMAIN}`) {
      setPortal('client');
    }
  }, []);

  if (portal === 'client') {
    return <ClientLoginPage />;
  }

  return <Index />;
}
