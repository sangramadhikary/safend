'use client';

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { getSupabaseClient } from '@/integrations/supabase/client';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BFF Client Utilities
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Helpers for calling Backend-For-Frontend endpoints with proper auth.
 * Every BFF call:
 * 1. Attaches the Supabase access token as Bearer header
 * 2. Returns typed data
 * 3. Integrates with React Query for caching/staleness
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Fetch from a BFF endpoint with the current user's auth token.
 * Throws on non-2xx responses.
 */
export async function bffFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const client = getSupabaseClient();
  const { data: { session } } = await client.auth.getSession();
  const token = session?.access_token;

  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `BFF request failed: ${res.status}`);
  }

  return res.json();
}

/**
 * React Query hook for BFF endpoints.
 * Handles auth token, typing, caching, and error states.
 *
 * Usage:
 *   const { data, isLoading } = useBFF<AdminOverview>(
 *     ['dashboard', 'admin-overview'],
 *     '/api/bff/admin-overview',
 *     { staleTime: 60_000 }
 *   );
 */
export function useBFF<T>(
  queryKey: readonly unknown[],
  path: string,
  options?: {
    params?: Record<string, string>;
    enabled?: boolean;
    staleTime?: number;
    gcTime?: number;
  }
) {
  return useQuery<T>({
    queryKey,
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 60_000,
    gcTime: options?.gcTime ?? 5 * 60_000,
    queryFn: () => bffFetch<T>(path, options?.params),
  });
}
