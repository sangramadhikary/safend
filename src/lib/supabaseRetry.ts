'use client';

import { getSupabaseClient } from '@/integrations/supabase/client';

/**
 * Wraps a Supabase query function with automatic JWT refresh on expiry.
 * If the query fails with "JWT expired", refreshes the session and retries once.
 *
 * Usage:
 *   const { data, error } = await withAuthRetry(() =>
 *     supabaseClient.from('leads').select('*')
 *   );
 */
export async function withAuthRetry<T>(
  queryFn: () => PromiseLike<{ data: T; error: any }>
): Promise<{ data: T; error: any }> {
  const result = await queryFn();

  if (result.error && isJwtExpired(result.error)) {
    // Attempt to refresh the session
    const client = getSupabaseClient();
    const { error: refreshError } = await client.auth.refreshSession();

    if (!refreshError) {
      // Retry the original query with the fresh token
      return queryFn();
    }

    // Refresh failed — return original error (user needs to re-login)
  }

  return result;
}

function isJwtExpired(error: any): boolean {
  const msg = error?.message || error?.msg || '';
  return msg.includes('JWT expired') || msg.includes('token is expired');
}
