'use client';

import dynamic from 'next/dynamic';
import { ProtectedRoute } from '@/components/ProtectedRoute';

const UserProfile = dynamic(
  () => import('@/modules/UserProfile'),
  { ssr: false }
);

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <UserProfile />
    </ProtectedRoute>
  );
}
