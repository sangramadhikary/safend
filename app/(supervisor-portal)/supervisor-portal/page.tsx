'use client';

import dynamic from 'next/dynamic';
import { SupervisorProtectedRoute } from '@/modules/supervisor-portal/components/SupervisorProtectedRoute';
import { PermissionGate } from '@/modules/supervisor-portal/components/PermissionGate';
import { ContentProtection } from '@/components/security/ContentProtection';
import { SecurityConsent } from '@/components/security/SecurityConsent';
import { BiometricRegistration } from '@/components/auth/BiometricRegistration';

const SupervisorPortalModule = dynamic(
  () => import('@/modules/supervisor-portal/SupervisorPortalModule').then(mod => ({ default: mod.SupervisorPortalModule })),
  { ssr: false }
);

export default function SupervisorPortalPage() {
  const userName = typeof window !== 'undefined' ? localStorage.getItem('userName') || '' : '';
  const userEmail = typeof window !== 'undefined' ? localStorage.getItem('userEmail') || '' : '';
  const employeeId = typeof window !== 'undefined' ? localStorage.getItem('employeeId') || localStorage.getItem('userId') || '' : '';

  return (
    <SupervisorProtectedRoute>
      <SecurityConsent storageKey="supervisor_security_consent">
        <PermissionGate>
          <ContentProtection userName={userName} userEmail={userEmail} employeeId={employeeId}>
            <SupervisorPortalModule />
            {/* Biometric registration prompt — shows once if fingerprint not yet set up */}
            <BiometricRegistration />
          </ContentProtection>
        </PermissionGate>
      </SecurityConsent>
    </SupervisorProtectedRoute>
  );
}
