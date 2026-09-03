'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Form Draft Persistence — Google Docs-style auto-save with security TTL
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Saves form data to localStorage to prevent data loss on accidental navigation
 * or browser crash. Unlike the naive approach of storing indefinitely:
 *
 * - Drafts expire after MAX_DRAFT_AGE (4 hours). Stale PII doesn't linger.
 * - Drafts are user-scoped: prefixed with userId to prevent cross-user leakage.
 * - loadFormDraft auto-cleans expired drafts on read (lazy expiry).
 * - clearAllFormDrafts is called on logout (nuclear cleanup).
 *
 * This is the same pattern Google Docs uses: auto-save locally for resilience,
 * but with a bounded lifetime so abandoned drafts don't become a data leak.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const DRAFT_PREFIX = 'safend_form_draft_';

/** Maximum draft age before auto-expiry. 4 hours = one work shift. */
const MAX_DRAFT_AGE_MS = 4 * 60 * 60 * 1000;

/** Get current user ID for scoping (returns 'anon' if not logged in). */
function getUserScope(): string {
  if (typeof window === 'undefined') return 'anon';
  return localStorage.getItem('userId') || 'anon';
}

/** Build the full localStorage key, scoped to the current user. */
function buildKey(formId: string): string {
  return `${DRAFT_PREFIX}${getUserScope()}_${formId}`;
}

interface DraftEnvelope {
  data: unknown;
  savedAt: string;
  userId: string;
}

/**
 * Save form draft to localStorage.
 * Automatically scoped to the current user.
 */
export const saveFormDraft = (formId: string, data: any): void => {
  try {
    const key = buildKey(formId);
    const envelope: DraftEnvelope = {
      data,
      savedAt: new Date().toISOString(),
      userId: getUserScope(),
    };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch (error) {
    console.error('[FormDraft] Error saving draft:', error);
  }
};

/**
 * Load form draft from localStorage.
 * Returns null if:
 * - No draft exists
 * - Draft is expired (older than MAX_DRAFT_AGE)
 * - Draft belongs to a different user
 */
export const loadFormDraft = <T>(formId: string): T | null => {
  try {
    const key = buildKey(formId);
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const envelope: DraftEnvelope = JSON.parse(stored);

    // Security: reject drafts from a different user
    if (envelope.userId && envelope.userId !== getUserScope()) {
      localStorage.removeItem(key);
      return null;
    }

    // TTL check: auto-expire stale drafts
    const savedAt = new Date(envelope.savedAt).getTime();
    const age = Date.now() - savedAt;
    if (age > MAX_DRAFT_AGE_MS) {
      localStorage.removeItem(key); // Lazy cleanup
      return null;
    }

    return envelope.data as T;
  } catch (error) {
    console.error('[FormDraft] Error loading draft:', error);
    return null;
  }
};

/**
 * Clear form draft from localStorage.
 */
export const clearFormDraft = (formId: string): void => {
  try {
    const key = buildKey(formId);
    localStorage.removeItem(key);
  } catch (error) {
    console.error('[FormDraft] Error clearing draft:', error);
  }
};

/**
 * Check if a valid (non-expired) form draft exists.
 */
export const hasFormDraft = (formId: string): boolean => {
  // loadFormDraft handles TTL check and user scope
  return loadFormDraft(formId) !== null;
};

/**
 * Get draft age in minutes. Returns null if no valid draft.
 */
export const getDraftAge = (formId: string): number | null => {
  try {
    const key = buildKey(formId);
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const envelope: DraftEnvelope = JSON.parse(stored);
    const savedAt = new Date(envelope.savedAt).getTime();
    const ageMs = Date.now() - savedAt;

    // If expired, clean up and return null
    if (ageMs > MAX_DRAFT_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }

    return Math.floor(ageMs / (1000 * 60));
  } catch (error) {
    return null;
  }
};

/**
 * Clear all form drafts (called on logout via nuclear cleanup).
 * Also opportunistically cleans up expired drafts from other users
 * that may have been left behind.
 */
export const clearAllFormDrafts = (): void => {
  try {
    const keys = Object.keys(localStorage).filter(key => key.startsWith(DRAFT_PREFIX));
    keys.forEach(key => localStorage.removeItem(key));
  } catch (error) {
    console.error('[FormDraft] Error clearing all drafts:', error);
  }
};

/**
 * Garbage-collect expired drafts. Call on app initialization.
 * Removes any draft older than MAX_DRAFT_AGE regardless of user.
 */
export const gcExpiredDrafts = (): void => {
  try {
    const keys = Object.keys(localStorage).filter(key => key.startsWith(DRAFT_PREFIX));
    const now = Date.now();

    for (const key of keys) {
      try {
        const stored = localStorage.getItem(key);
        if (!stored) continue;
        const envelope: DraftEnvelope = JSON.parse(stored);
        const savedAt = new Date(envelope.savedAt).getTime();
        if (now - savedAt > MAX_DRAFT_AGE_MS) {
          localStorage.removeItem(key);
        }
      } catch {
        // Corrupt entry — remove it
        localStorage.removeItem(key);
      }
    }
  } catch {
    // no-op
  }
};
