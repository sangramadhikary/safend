'use client';

import dynamic from 'next/dynamic';
import { ProtectedRoute } from '@/components/ProtectedRoute';

const AccountsModule = dynamic(
  () => import('@/modules/accounts/AccountsModule').then(mod => ({ default: mod.AccountsModule })),
  { ssr: false }
);

export default function AccountsPage() {
  return (
    <ProtectedRoute allowedRoles={['accounts', 'admin', 'branch_admin']}>
      <AccountsModule />
    </ProtectedRoute>
  );
}
