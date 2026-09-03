import { nuclearCacheCleanup } from '@/lib/queryCache';
import { clearAllFormDrafts } from '@/utils/formDraft';

/**
 * Nuclear auth cleanup — wipes ALL session/business data from browser storage.
 *
 * Modeled after banking apps and Stripe's approach: when a session ends,
 * zero business data should remain readable on the device. Only UI preferences
 * (theme, sound settings) survive.
 *
 * Called on:
 * - Explicit logout
 * - Session expiry (absolute timeout)
 * - Device eviction (another login exceeded limit)
 * - Inactivity timeout
 * - Before new login (prevents state leakage between users)
 */
export const cleanupAuthState = () => {
  try {
    // 1. Wipe all localStorage except UI preferences
    nuclearCacheCleanup();

    // 2. Clear form drafts (contains PII: names, addresses, salaries)
    clearAllFormDrafts();

    // 3. Clear sessionStorage entirely
    try { sessionStorage.clear(); } catch {}
  } catch (e) {
    // Last resort: try to clear the most critical items individually
    try { localStorage.removeItem('safend:rq-cache'); } catch {}
    try { localStorage.removeItem('session_token'); } catch {}
    try { localStorage.removeItem('userId'); } catch {}
  }
};
