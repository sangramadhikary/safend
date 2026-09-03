'use client';

import dynamic from 'next/dynamic';

// Dynamically import client login to split it from the portal bundle.
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

export default function ClientLogin() {
  return <ClientLoginPage />;
}
