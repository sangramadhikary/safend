'use client';

import dynamic from 'next/dynamic';
import { ProtectedRoute } from '@/components/ProtectedRoute';

// Dynamic import: the AdminDashboardModule is large (~500KB+ with all lazy tabs).
// This lets loading.tsx show immediately while the module JS loads.
const AdminDashboardModule = dynamic(
  () => import('@/modules/admin/unified/AdminDashboardModule').then(mod => ({ default: mod.AdminDashboardModule })),
  { ssr: false }
);

export default function DashboardPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'branch_admin']}>
      <AdminDashboardModule />
    </ProtectedRoute>
  );
}
