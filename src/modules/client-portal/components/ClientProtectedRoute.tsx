'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/integrations/supabase/client';

interface ClientProtectedRouteProps {
  children: React.ReactNode;
}

export function ClientProtectedRoute({ children }: ClientProtectedRouteProps) {
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

        // Verify this user exists in client_users
        const { data: clientUser, error } = await client
          .from('client_users')
          .select('id, status')
          .eq('auth_user_id', session.user.id)
          .single();

        if (error || !clientUser || clientUser.status !== 'active') {
          if (mounted) router.push('/login');
          return;
        }

        if (mounted) {
          setAuthorized(true);
          setLoading(false);
        }
      } catch {
        if (mounted) router.push('/login');
      }
    };

    checkAuth();

    // Listen for sign-out events
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
