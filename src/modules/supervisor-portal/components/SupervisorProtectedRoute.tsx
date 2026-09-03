'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/integrations/supabase/client';

interface SupervisorProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Protects the supervisor portal — verifies user has an active supervisor_users record.
 * Falls back to checking employee_users for backward compatibility.
 * If the user is authenticated but not a supervisor/employee, signs them out on this
 * subdomain to prevent redirect loops rather than just pushing to /login.
 */
export function SupervisorProtectedRoute({ children }: SupervisorProtectedRouteProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkAuth = async () => {
      try {
        const client = getSupabaseClient();
        const { data: { session } } = await client.auth.getSession();

        if (!session?.user) {
          if (mounted) router.push('/login');
          return;
        }

        // Check supervisor_users first
        const { data: supervisor } = await client
          .from('supervisor_users')
          .select('id, status')
          .eq('auth_user_id', session.user.id)
          .single();

        if (supervisor && supervisor.status === 'active') {
          if (mounted) {
            setAuthorized(true);
            setLoading(false);
          }
          return;
        }

        // Fallback: check legacy employee_users
        const { data: empUser } = await client
          .from('employee_users')
          .select('id, status')
          .eq('auth_user_id', session.user.id)
          .single();

        if (empUser && empUser.status === 'active') {
          if (mounted) {
            setAuthorized(true);
            setLoading(false);
          }
          return;
        }

        // User is authenticated but NOT a supervisor/employee — they don't
        // belong on this portal. Sign them out to prevent a redirect loop
        // (middleware would send them back to /login where the session auto-
        // redirect would push them right back here).
        if (mounted) {
          try {
            const { cleanupAuthState } = await import('@/utils/authCleanup');
            cleanupAuthState();
            await client.auth.signOut();
          } catch {}
          router.push('/login');
        }
      } catch {
        if (mounted) router.push('/login');
      }
    };

    checkAuth();

    const client = getSupabaseClient();
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && mounted) {
        setAuthorized(false);
        router.push('/login');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-[#D71920]" />
          <p className="text-sm text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!authorized) return null;

  return <>{children}</>;
}
