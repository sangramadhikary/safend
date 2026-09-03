'use client';

import dynamic from 'next/dynamic';
import { ProtectedRoute } from '@/components/ProtectedRoute';

const OfficeAdminModule = dynamic(
  () => import('@/modules/office-admin/OfficeAdminModule').then(mod => ({ default: mod.OfficeAdminModule })),
  { ssr: false }
);

export default function OfficeAdminPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'branch_admin', 'office-admin']}>
      <OfficeAdminModule />
    </ProtectedRoute>
  );
}
