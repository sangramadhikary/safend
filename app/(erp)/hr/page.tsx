'use client';

import dynamic from 'next/dynamic';
import { ProtectedRoute } from '@/components/ProtectedRoute';

const HRModule = dynamic(
  () => import('@/modules/hr/HRModule').then(mod => ({ default: mod.HRModule })),
  { ssr: false }
);

export default function HRPage() {
  return (
    <ProtectedRoute allowedRoles={['hr', 'admin', 'branch_admin']}>
      <HRModule />
    </ProtectedRoute>
  );
}
