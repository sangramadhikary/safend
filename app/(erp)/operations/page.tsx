'use client';

import dynamic from 'next/dynamic';
import { ProtectedRoute } from '@/components/ProtectedRoute';

const OperationsModule = dynamic(
  () => import('@/modules/operations/OperationsModule').then(mod => ({ default: mod.OperationsModule })),
  { ssr: false }
);

export default function OperationsPage() {
  return (
    <ProtectedRoute allowedRoles={['operations', 'admin', 'branch_admin']}>
      <OperationsModule />
    </ProtectedRoute>
  );
}
