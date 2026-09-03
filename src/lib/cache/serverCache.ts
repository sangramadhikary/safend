import 'server-only';

import { redisDelete, redisGet, redisSet } from './redis';

type CacheEntry = { value: unknown; expiresAt: number };
type CacheEnvelope<T> = { version: 1; expiresAt: number; value: T };
type CacheState = {
  entries: Map<string, CacheEntry>;
  inFlight: Map<string, Promise<unknown>>;
};

export type ServerCacheOptions<T> = {
  key: string;
  loader: () => Promise<T>;
  l1TtlMs?: number;
  l2TtlSeconds?: number;
};

const globalState = globalThis as typeof globalThis & {
  __safendServerCache?: CacheState;
};

const state = globalState.__safendServerCache ?? {
  entries: new Map<string, CacheEntry>(),
  inFlight: new Map<string, Promise<unknown>>(),
};
globalState.__safendServerCache = state;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_L1_ENTRIES = positiveInt(process.env.CACHE_L1_MAX_ENTRIES, 250);
const MAX_PAYLOAD_BYTES = positiveInt(process.env.CACHE_MAX_PAYLOAD_BYTES, 1_000_000);
const namespace = (process.env.CACHE_NAMESPACE || 'safend:v1').replace(/[^a-zA-Z0-9:_-]/g, '_');

function fullKey(key: string): string {
  if (!key || key.length > 300) throw new Error('Invalid server cache key');
  return `${namespace}:${key}`;
}

function readL1<T>(key: string): T | undefined {
  const entry = state.entries.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    state.entries.delete(key);
    return undefined;
  }
  state.entries.delete(key);
  state.entries.set(key, entry);
  return entry.value as T;
}
function writeL1<T>(key: string, value: T, expiresAt: number): void {
  state.entries.delete(key);
  state.entries.set(key, { value, expiresAt });
  while (state.entries.size > MAX_L1_ENTRIES) {
    const oldestKey = state.entries.keys().next().value as string | undefined;
    if (!oldestKey) break;
    state.entries.delete(oldestKey);
  }
}

async function readL2<T>(key: string, l1TtlMs: number): Promise<T | undefined> {
  const raw = await redisGet(key);
  if (!raw) return undefined;

  try {
    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    if (envelope.version !== 1 || envelope.expiresAt <= Date.now()) {
      await redisDelete(key);
      return undefined;
    }
    writeL1(key, envelope.value, Math.min(envelope.expiresAt, Date.now() + l1TtlMs));
    return envelope.value;
  } catch {
    await redisDelete(key);
    return undefined;
  }
}

async function writeLayers<T>(
  key: string,
  value: T,
  l1TtlMs: number,
  l2TtlSeconds: number,
): Promise<void> {
  const expiresAt = Date.now() + l2TtlSeconds * 1_000;
  writeL1(key, value, Math.min(expiresAt, Date.now() + l1TtlMs));

  try {
    const serialized = JSON.stringify({ version: 1, expiresAt, value } satisfies CacheEnvelope<T>);
    if (Buffer.byteLength(serialized, 'utf8') <= MAX_PAYLOAD_BYTES) {
      await redisSet(key, serialized, l2TtlSeconds);
    }
  } catch {
    // Serialization or Redis failures must never block the database response.
  }
}

export async function getOrLoad<T>({
  key,
  loader,
  l1TtlMs = 5_000,
  l2TtlSeconds = 30,
}: ServerCacheOptions<T>): Promise<T> {
  const cacheKey = fullKey(key);
  const l1Value = readL1<T>(cacheKey);
  if (l1Value !== undefined) return l1Value;

  const existing = state.inFlight.get(cacheKey);
  if (existing) return existing as Promise<T>;

  const operation = (async () => {
    const l2Value = await readL2<T>(cacheKey, l1TtlMs);
    if (l2Value !== undefined) return l2Value;

    const value = await loader();
    await writeLayers(cacheKey, value, l1TtlMs, l2TtlSeconds);
    return value;
  })();

  state.inFlight.set(cacheKey, operation);
  try {
    return await operation;
  } finally {
    state.inFlight.delete(cacheKey);
  }
}

export async function invalidateServerCache(key: string): Promise<void> {
  const cacheKey = fullKey(key);
  state.entries.delete(cacheKey);
  await redisDelete(cacheKey);
}
