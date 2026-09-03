'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Providers } from '../providers';
import { PersistentLayout } from '@/components/layout/PersistentLayout';
import { ContentProtection } from '@/components/security/ContentProtection';
import { SecurityConsent } from '@/components/security/SecurityConsent';

/**
 * ERP Layout — wraps all /dashboard, /sales, /operations, /hr, /accounts,
 * /office-admin, /profile routes in the shared provider tree.
 *
 * Content protection: Admin users can copy/screenshot/print freely.
 * All other roles have protections enabled + must accept security consent.
 * Login page is always rendered without any protection/consent gates.
 */
export default function ErpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(true);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  useEffect(() => {
    const role = localStorage.getItem('userRole') || '';
    const name = localStorage.getItem('userName') || '';
    const email = localStorage.getItem('userEmail') || '';
    const empId = localStorage.getItem('employeeId') || localStorage.getItem('userId') || '';
    setIsAdmin(role === 'admin');
    setUserName(name);
    setUserEmail(email);
    setEmployeeId(empId);
  }, []);

  // Login page — no consent, no protection, just render directly
  const isLoginPage = pathname === '/login';
  if (isLoginPage) {
    return (
      <Providers>
        <PersistentLayout>
          {children}
        </PersistentLayout>
      </Providers>
    );
  }

  // Admin gets everything directly — no consent, no protection
  if (isAdmin) {
    return (
      <Providers>
        <PersistentLayout>
          {children}
        </PersistentLayout>
      </Providers>
    );
  }

  return (
    <Providers>
      <SecurityConsent storageKey="erp_security_consent">
        <ContentProtection userName={userName} userEmail={userEmail} employeeId={employeeId}>
          <PersistentLayout>
            {children}
          </PersistentLayout>
        </ContentProtection>
      </SecurityConsent>
    </Providers>
  );
}
