'use client';

import dynamic from 'next/dynamic';
import { ClientProtectedRoute } from '@/modules/client-portal/components/ClientProtectedRoute';

const ClientPortalModule = dynamic(
  () => import('@/modules/client-portal/ClientPortalModule').then(mod => ({ default: mod.ClientPortalModule })),
  { ssr: false }
);

export default function ClientPortalPage() {
  return (
    <ClientProtectedRoute>
      <ClientPortalModule />
    </ClientProtectedRoute>
  );
}
