'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

/**
 * Client-side route guard that re-validates the caller's session
 * server-side on every evaluation (Req 5.7).
 *
 * Authentication is confirmed by calling `supabase.auth.getUser()`, which
 * validates the access token against the Supabase auth server rather than
 * trusting a `localStorage` flag. The authorized role is read from the
 * `user_roles` table for the validated user — never from a cached
 * `localStorage` value — so a tampered or stale cache cannot grant access
 * (Req 5.8). When validation fails, the session is absent, or the auth state
 * transitions to signed-out/revoked, the guard redirects to `/login` instead
 * of rendering protected content (Req 5.5).
 */
export function ProtectedRoute({ children, allowedRoles = [] }: ProtectedRouteProps) {
  const router = useRouter();

  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const allowedRolesRef = useRef(allowedRoles);

  useEffect(() => {
    let mounted = true;

    // Server-side re-validation of the session. `getUser()` contacts the
    // Supabase auth server to verify the access token, so a forged or stale
    // localStorage entry cannot satisfy this check (Req 5.7).
    const validateSession = async () => {
      let user: { id: string; email?: string | null } | null = null;
      try {
        const result = (await Promise.race([
          supabase.auth.getUser(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('getUser timeout')), 5000)
          ),
        ])) as { data: { user: { id: string; email?: string | null } | null }; error: any };
        user = result?.data?.user ?? null;
      } catch (err) {
        console.warn('getUser failed or timed out:', err);
        user = null;
      }

      if (!mounted) return;

      // No server-confirmed user — deny access and clear any stale cache.
      // Never fall back to a localStorage flag or a default role (Req 5.8).
      if (!user) {
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('userRole');
        setIsAuthenticated(false);
        setUserRole(null);
        setLoading(false);
        return;
      }

      // Session confirmed. Resolve the authorized role from the database for
      // this validated user rather than trusting any cached value.
      let role: string | null = null;
      let allRoles: string[] = [];
      try {
        const { data: userRoles, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        if (!mounted) return;
        if (error) throw error;

        allRoles = (userRoles as any[])?.map((r) => r.role) || [];
        role = allRoles.includes('admin') ? 'admin' : allRoles[0] || null;
      } catch (err) {
        console.error('Error fetching roles', err);
        role = null;
        allRoles = [];
      }

      if (!mounted) return;

      // Refresh the cache so other parts of the app stay consistent, but the
      // authorization decision below relies only on the server-resolved role.
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('userEmail', user.email || '');
      if (role) {
        localStorage.setItem('userRole', role);
      } else {
        localStorage.removeItem('userRole');
      }

      // Fetch user profile (name, photo) for sidebar display
      try {
        const { supabaseClient } = await import('@/integrations/supabase/client');
        const { data: profile } = await supabaseClient.from('users').select('name, photo_url').eq('id', user.id).single();
        localStorage.setItem('userName', profile?.name || user.email || 'User');
        if (profile?.photo_url) localStorage.setItem('userPhotoURL', profile.photo_url);
        else localStorage.removeItem('userPhotoURL');
      } catch {
        // Fallback: use email
        const currentName = localStorage.getItem('userName');
        if (!currentName || currentName === user.email) {
          localStorage.setItem('userName', user.email || 'User');
        }
      }

      // Store all roles so the sidebar and authorization check can use them
      if (typeof window !== 'undefined' && allRoles.length > 0) {
        localStorage.setItem('userRoles', allRoles.join(','));
      }

      setIsAuthenticated(true);
      setUserRole(role);
      setLoading(false);
    };

    // React to sign-out / token-revocation events: re-evaluate the guard so a
    // revoked session redirects to login on the next evaluation (Req 5.5).
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (!session || event === 'SIGNED_OUT') {
        setUserRole(null);
        setIsAuthenticated(false);
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('userRole');
        setShouldRedirect(true);
      }
    });

    validateSession();

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Determine if redirect is needed once validation has completed.
  useEffect(() => {
    if (loading) return;

    const roles = allowedRolesRef.current;
    // Check against all user roles (not just the primary one) to support
    // multi-role users and branch_admin universal access.
    let allUserRoles: string[] = [];
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('userRoles') : null;
      // Support both comma-separated (new) and JSON array (legacy)
      if (stored) {
        try { allUserRoles = JSON.parse(stored); } catch {
          allUserRoles = stored.split(',').map(r => r.trim()).filter(Boolean);
        }
      }
    } catch { allUserRoles = []; }
    // Ensure the primary role is always in the list
    if (userRole && !allUserRoles.includes(userRole)) {
      allUserRoles.push(userRole);
    }

    const allowed =
      roles.length === 0 ||
      allUserRoles.includes('admin') ||
      allUserRoles.includes('branch_admin') ||
      allUserRoles.some(r => roles.includes(r));

    if (!isAuthenticated || !allowed) {
      setShouldRedirect(true);
    }
  }, [loading, isAuthenticated, userRole]);

  // Perform redirect in a separate effect to avoid render-cycle conflicts.
  useEffect(() => {
    if (shouldRedirect) {
      router.push('/login');
    }
  }, [shouldRedirect, router]);

  // While loading OR if a redirect is pending, never render children.
  if (loading || shouldRedirect) {
    return (
      <div className="flex h-screen w-full">
        {/* Sidebar skeleton */}
        <div className="hidden md:flex w-64 flex-col gap-4 border-r p-4">
          <Skeleton className="h-8 w-32" />
          <div className="space-y-2 mt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
        {/* Main content skeleton */}
        <div className="flex-1 flex flex-col gap-6 p-6">
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
          {/* Content area */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  // Authorization already determined by the useEffect — if we reach here,
  // isAuthenticated is true and the role check passed (otherwise shouldRedirect
  // would be true and we'd return the skeleton above).
  return <>{children}</>;
}

export default ProtectedRoute;
