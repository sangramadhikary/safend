'use client';

import { getSupabaseClient } from '@/integrations/supabase/client';

/**
 * Thin client for the server-side Accounts API routes. Attaches the Supabase
 * access token so the server can verify the session and authorize the caller.
 * All ledger mutations (asset create/update/dispose, depreciation, liability
 * create, payment) go through these helpers instead of direct Supabase writes.
 */

async function authedFetch<T>(path: string, body: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<T> {
  const { data: { session } } = await getSupabaseClient().auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('You must be signed in to perform this action.');

  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status}).`);
  return json as T;
}

export interface CreateAssetInput {
  name: string;
  category: string;
  purchaseDate: string;
  purchasePrice: number;
  depreciationRate: number;
  depreciationMethod: string;
  salvageValue?: number;
  description?: string;
  branchId?: string | null;
}

export const accountsApi = {
  createAsset: (input: CreateAssetInput) =>
    authedFetch<{ success: boolean; asset: any }>('/api/accounts/assets', input, 'POST'),

  updateAsset: (id: string, updates: Record<string, unknown>) =>
    authedFetch<{ success: boolean; asset: any }>('/api/accounts/assets', { id, updates }, 'PATCH'),

  runDepreciation: () =>
    authedFetch<{ success: boolean; processed: number; skipped: number; fy: string }>('/api/accounts/depreciation', {}, 'POST'),

  createLiability: (input: Record<string, unknown>) =>
    authedFetch<{ success: boolean; liability: any }>('/api/accounts/liabilities', input, 'POST'),

  recordPayment: (input: Record<string, unknown>) =>
    authedFetch<{ success: boolean; principalComponent: number; interestComponent: number; newRemaining: number; closed: boolean }>(
      '/api/accounts/liabilities/payment', input, 'POST'),
};
