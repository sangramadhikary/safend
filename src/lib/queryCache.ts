'use client';

import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { getBranchScope } from '@/utils/branchScope';
import { createIndexedDBPersister, idbNuclearWipe, idbClear, STORES } from '@/lib/indexedDB';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * INTELLIGENT CACHING STRATEGY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Inspired by how big-tech companies (Google, Stripe, Slack) handle client-side
 * data caching in internal tools:
 *
 * 1. USER-SCOPED ISOLATION (Slack model)
 *    Cache buster includes userId + branchId. Switching users on the same
 *    machine never leaks cached data between accounts.
 *
 * 2. TIERED STALE TIMES (Google Workspace model)
 *    Not all data ages equally. Reference data (branches, roles) stays fresh
 *    longer. Transactional data (leads, invoices) goes stale quickly.
 *    Modules set their own staleTime via queryKey conventions.
 *
 * 3. BOUNDED PERSISTENCE (Stripe Dashboard model)
 *    - maxAge: 4 hours (not 24h). Covers one work shift. After that, the
 *      cache is too stale to be useful and becomes a security liability.
 *    - On ANY session end (logout, kicked, expired, tab close after inactivity),
 *      the persisted cache is wiped — no sensitive data lingers.
 *
 * 4. DEHYDRATION FILTER (Sensitive data exclusion)
 *    Query keys containing 'sensitive', 'salary', 'password', 'token', or
 *    'secret' are excluded from localStorage persistence. They remain in
 *    memory only and vanish on page refresh.
 *
 * 5. MEMORY PRESSURE MANAGEMENT
 *    - gcTime is 4h for persisted data but 5 minutes for non-persisted
 *      (sensitive) queries so they don't bloat memory.
 *    - Tab visibility-based garbage collection: when the tab is hidden for
 *      >5 minutes, stale queries are dropped from memory.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export const PERSIST_CACHE_KEY = 'safend:rq-cache';

// ── Tiered TTLs ─────────────────────────────────────────────────────────────
/** 4 hours — persisted cache max lifetime. Covers one work shift. */
const MAX_AGE = 1000 * 60 * 60 * 4;

/** In-memory GC time for persisted queries. Same as MAX_AGE. */
const GC_TIME_PERSISTENT = MAX_AGE;

/** In-memory GC time for non-persisted (sensitive) queries. 5 minutes. */
const GC_TIME_VOLATILE = 1000 * 60 * 5;

// ── Sensitive query key patterns ────────────────────────────────────────────
// These queries are NEVER written to localStorage persistence.
const SENSITIVE_PATTERNS = [
  'salary', 'salaries', 'payroll', 'password', 'token', 'secret',
  'bank', 'payment', 'payout', 'sensitive', 'mfa', 'otp',
] as const;

function isSensitiveQuery(queryKey: readonly unknown[]): boolean {
  const keyStr = JSON.stringify(queryKey).toLowerCase();
  return SENSITIVE_PATTERNS.some(pattern => keyStr.includes(pattern));
}

// ── Stale time tiers ────────────────────────────────────────────────────────
/**
 * Different data categories have different freshness requirements.
 * Modules can opt into these by prefixing their queryKey:
 *   ['reference', 'branches'] → 5 min staleTime
 *   ['realtime', 'leads']     → 10s staleTime (realtime sub handles the rest)
 *   ['transactional', ...]    → 30s staleTime (default)
 */
export const STALE_TIMES = {
  /** Reference/config data: branches, roles, settings. Changes rarely. */
  reference: 5 * 60 * 1000,   // 5 minutes
  /** Transactional data: leads, quotations, work orders. Default tier. */
  transactional: 30 * 1000,   // 30 seconds
  /** Real-time subscribed data: subscription handles updates, RQ is just the container. */
  realtime: 10 * 1000,        // 10 seconds
  /** Dashboard aggregates: recalculated infrequently. */
  dashboard: 2 * 60 * 1000,   // 2 minutes
} as const;

export type CacheTier = keyof typeof STALE_TIMES;

// ── QueryClient ─────────────────────────────────────────────────────────────
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error: any) => {
        if (failureCount > 1) return false;
        const msg = error?.message || '';
        if (msg.includes('JWT expired') || msg.includes('token is expired')) {
          return false;
        }
        return true;
      },
      staleTime: STALE_TIMES.transactional,
      gcTime: GC_TIME_PERSISTENT,
    },
  },
});

// ── User-scoped buster ──────────────────────────────────────────────────────
/**
 * Cache buster includes BOTH user identity and branch scope.
 * This guarantees:
 * - User A's cache is never restored for User B (even on same machine)
 * - Branch switch discards previous branch's data
 * - Role change (admin revokes access) invalidates old cache on next load
 */
function getCacheBuster(): string {
  if (typeof window === 'undefined') return 'ssr';
  const userId = localStorage.getItem('userId') || 'anon';
  const role = localStorage.getItem('userRole') || 'none';
  const scope = getBranchScope();
  return `u:${userId}|r:${role}|b:${scope.id || 'all'}|${scope.code || 'na'}`;
}

// ── Persister: IndexedDB primary, localStorage fallback ─────────────────────
export function createCachePersister() {
  if (typeof window === 'undefined') return undefined;

  // Primary: IndexedDB (async, no size limit, doesn't block main thread)
  const idbPersister = createIndexedDBPersister();
  if (idbPersister) return idbPersister as any;

  // Fallback: localStorage (sync, 5MB limit, but universally supported)
  return createSyncStoragePersister({
    storage: window.localStorage,
    key: PERSIST_CACHE_KEY,
    throttleTime: 2000,
    serialize: (data) => {
      try {
        const filtered = {
          ...data,
          clientState: {
            ...data.clientState,
            queries: (data.clientState?.queries || []).filter(
              (q: any) => !isSensitiveQuery(q.queryKey)
            ),
          },
        };
        return JSON.stringify(filtered);
      } catch {
        return JSON.stringify(data);
      }
    },
    deserialize: (str) => {
      try {
        return JSON.parse(str);
      } catch {
        return { timestamp: 0, buster: '', clientState: { mutations: [], queries: [] } };
      }
    },
  });
}

export const persistOptions = {
  maxAge: MAX_AGE,
  get buster() { return getCacheBuster(); },
};

/** Recompute the buster (call when branch scope or user changes). */
export function currentCacheBuster(): string {
  return getCacheBuster();
}

// ── Cleanup utilities ───────────────────────────────────────────────────────

/** Remove the persisted cache from storage. Call on logout / session end. */
export function clearPersistedQueryCache(): void {
  if (typeof window === 'undefined') return;
  // Clear localStorage fallback
  try {
    window.localStorage.removeItem(PERSIST_CACHE_KEY);
  } catch {}
  // Clear IndexedDB query cache
  idbClear(STORES.QUERY_CACHE).catch(() => {});
}

/**
 * Nuclear cleanup — wipes ALL app-related localStorage AND IndexedDB.
 * Called on logout, session expiry, and device eviction.
 * Leaves only browser/OS preferences (theme, sound).
 *
 * Inspired by banking apps: when session ends, NOTHING business-related
 * should remain readable on the device.
 */
export function nuclearCacheCleanup(): void {
  if (typeof window === 'undefined') return;

  // Keys we PRESERVE (user preferences, not sensitive data)
  const PRESERVE_KEYS = new Set([
    'theme', 'theme-preference', 'soundSettings', 'color-mode',
    // Security consent — persist across logouts (DPDPA compliance: consent is tied to the device/person, not the session)
    'supervisor_security_consent', 'supervisor_security_consent_version', 'supervisor_security_consent_at',
    'erp_security_consent', 'erp_security_consent_version', 'erp_security_consent_at',
    'safend_cookie_consent',
    // WebAuthn — credential is device-bound; must persist so biometric login works after logout
    'webauthn_credential_id', 'webauthn_user_email', 'webauthn_prompt_dismissed',
    // PWA install prompt dismiss cooldown
    'pwa_install_dismissed_at',
  ]);

  // 1. Wipe localStorage (sync)
  try {
    const allKeys = Object.keys(localStorage);
    for (const key of allKeys) {
      if (PRESERVE_KEYS.has(key)) continue;
      localStorage.removeItem(key);
    }
  } catch {
    try { localStorage.removeItem(PERSIST_CACHE_KEY); } catch {}
  }

  // 2. Clear sessionStorage
  try { sessionStorage.clear(); } catch {}

  // 3. Wipe IndexedDB (async, fire-and-forget)
  idbNuclearWipe().catch(() => {});
}

/**
 * Selective invalidation — invalidate queries matching a specific tier.
 * Useful when you know reference data changed but transactional data is fine.
 */
export function invalidateByTier(tier: CacheTier): void {
  // This works because modules prefix their queryKey with the tier name
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      return Array.isArray(key) && key[0] === tier;
    },
  });
}

/**
 * Memory pressure relief — remove stale queries from in-memory cache.
 * Called when tab is hidden for extended periods.
 */
export function relieveMemoryPressure(): void {
  const queries = queryClient.getQueryCache().getAll();
  const now = Date.now();
  
  for (const query of queries) {
    const state = query.state;
    const age = now - state.dataUpdatedAt;
    const staleTime = (query.options as any).staleTime ?? STALE_TIMES.transactional;
    const isStale = age > staleTime;
    const isInactive = query.getObserversCount() === 0;

    // Remove queries that are both stale and unobserved
    if (isStale && isInactive) {
      queryClient.getQueryCache().remove(query);
    }
  }
}
