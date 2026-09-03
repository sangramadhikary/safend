'use client';

import dynamic from 'next/dynamic';
import { ProtectedRoute } from '@/components/ProtectedRoute';

const SalesModule = dynamic(
  () => import('@/modules/sales/SalesModule').then(mod => ({ default: mod.SalesModule })),
  { ssr: false }
);

export default function SalesPage() {
  return (
    <ProtectedRoute allowedRoles={['sales', 'admin', 'branch_admin']}>
      <SalesModule />
    </ProtectedRoute>
  );
}
