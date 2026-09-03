'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * IndexedDB Storage Layer
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Professional-grade IndexedDB wrapper for offline data persistence.
 * Used instead of localStorage for:
 * - React Query cache (can exceed localStorage's 5MB limit)
 * - Form drafts (structured data, better performance)
 * - Offline queue (mutations to sync when back online)
 *
 * Advantages over localStorage:
 * - No 5MB size limit (typically 50MB-unlimited)
 * - Async operations (doesn't block the main thread)
 * - Structured data (no JSON.stringify overhead)
 * - Transaction support (atomic reads/writes)
 * - Doesn't leak into XSS as easily (not a simple key-value map)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const DB_NAME = 'safend-offline';
const DB_VERSION = 1;

// Store names
export const STORES = {
  QUERY_CACHE: 'query-cache',
  FORM_DRAFTS: 'form-drafts',
  OFFLINE_QUEUE: 'offline-queue',
  APP_STATE: 'app-state',
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open (or create) the IndexedDB database.
 * Reuses the same connection across the app lifecycle.
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // React Query cache store
      if (!db.objectStoreNames.contains(STORES.QUERY_CACHE)) {
        db.createObjectStore(STORES.QUERY_CACHE);
      }

      // Form drafts store (keyed by formId)
      if (!db.objectStoreNames.contains(STORES.FORM_DRAFTS)) {
        const store = db.createObjectStore(STORES.FORM_DRAFTS, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('savedAt', 'savedAt', { unique: false });
      }

      // Offline mutation queue
      if (!db.objectStoreNames.contains(STORES.OFFLINE_QUEUE)) {
        const store = db.createObjectStore(STORES.OFFLINE_QUEUE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Generic app state (session metadata, preferences)
      if (!db.objectStoreNames.contains(STORES.APP_STATE)) {
        db.createObjectStore(STORES.APP_STATE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

// ── Generic CRUD Operations ─────────────────────────────────────────────────

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export async function idbSet(store: StoreName, key: string, value: any): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently fail — IndexedDB is a best-effort cache
  }
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // no-op
  }
}

export async function idbClear(store: StoreName): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // no-op
  }
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

// ── Nuclear wipe (called on logout) ────────────────────────────────────────

/**
 * Destroys all IndexedDB data. Called on logout/session end.
 * This is the IndexedDB equivalent of nuclearCacheCleanup().
 */
export async function idbNuclearWipe(): Promise<void> {
  try {
    const db = await openDB();
    const storeNames = Array.from(db.objectStoreNames);
    const tx = db.transaction(storeNames, 'readwrite');
    for (const name of storeNames) {
      tx.objectStore(name).clear();
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // If transaction fails, try deleting the entire database
    try {
      dbPromise = null;
      indexedDB.deleteDatabase(DB_NAME);
    } catch {
      // nothing more we can do
    }
  }
}

// ── React Query Async Persister Adapter ─────────────────────────────────────

/**
 * Creates an async persister for @tanstack/react-query-persist-client
 * that stores the query cache in IndexedDB instead of localStorage.
 *
 * Benefits:
 * - Handles large caches (50MB+) without hitting localStorage limits
 * - Async I/O doesn't block the main thread on write
 * - Data is structured (no JSON stringify/parse overhead for the browser)
 */
export function createIndexedDBPersister() {
  if (typeof window === 'undefined' || !window.indexedDB) return undefined;

  const CACHE_KEY = 'rq-persisted-cache';
  const MAX_AGE = 4 * 60 * 60 * 1000; // 4 hours

  return {
    persistClient: async (client: any) => {
      try {
        // Wrap with metadata for stale/user validation on restore
        const userId = localStorage.getItem('userId') || 'anon';
        const envelope = {
          timestamp: Date.now(),
          userId,
          client,
        };
        await idbSet(STORES.QUERY_CACHE, CACHE_KEY, envelope);
      } catch {
        // Silently fail — persistence is best-effort
      }
    },
    restoreClient: async (): Promise<any> => {
      try {
        const envelope = await idbGet<{ timestamp: number; userId: string; client: any }>(
          STORES.QUERY_CACHE, CACHE_KEY
        );
        if (!envelope) return undefined;

        // Stale check: discard if older than MAX_AGE
        if (Date.now() - envelope.timestamp > MAX_AGE) {
          await idbDelete(STORES.QUERY_CACHE, CACHE_KEY);
          return undefined;
        }

        // User isolation: discard if belongs to a different user
        const currentUserId = localStorage.getItem('userId') || 'anon';
        if (envelope.userId !== currentUserId) {
          await idbDelete(STORES.QUERY_CACHE, CACHE_KEY);
          return undefined;
        }

        return envelope.client;
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await idbDelete(STORES.QUERY_CACHE, CACHE_KEY);
      } catch {
        // no-op
      }
    },
  };
}
