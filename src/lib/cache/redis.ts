import 'server-only';

import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>;
type RedisState = {
  client?: RedisClient;
  connecting?: Promise<RedisClient | null>;
  disabledUntil: number;
  warned: boolean;
};

const globalState = globalThis as typeof globalThis & {
  __safendRedisState?: RedisState;
};

const state = globalState.__safendRedisState ?? {
  disabledUntil: 0,
  warned: false,
};
globalState.__safendRedisState = state;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const CONNECT_TIMEOUT_MS = positiveInt(process.env.CACHE_REDIS_CONNECT_TIMEOUT_MS, 1_500);
const COMMAND_TIMEOUT_MS = positiveInt(process.env.CACHE_REDIS_COMMAND_TIMEOUT_MS, 500);
const CIRCUIT_BREAKER_MS = 30_000;

function markUnavailable(): void {
  state.disabledUntil = Date.now() + CIRCUIT_BREAKER_MS;
  if (!state.warned) {
    state.warned = true;
    console.warn('[server-cache] Redis unavailable; falling back to the database.');
  }
}

async function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Redis command timed out')), COMMAND_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function getClient(): Promise<RedisClient | null> {
  const url = process.env.REDIS_URL;
  if (!url || Date.now() < state.disabledUntil) return null;
  if (state.client?.isReady) return state.client;
  if (state.connecting) return state.connecting;

  state.connecting = (async () => {
    try {
      if (!state.client) {
        state.client = createClient({
          url,
          socket: {
            connectTimeout: CONNECT_TIMEOUT_MS,
            reconnectStrategy: false,
          },
        });
        state.client.on('error', () => {});
      }
      if (!state.client.isOpen) await state.client.connect();
      state.disabledUntil = 0;
      state.warned = false;
      return state.client;
    } catch {
      state.client = undefined;
      markUnavailable();
      return null;
    } finally {
      state.connecting = undefined;
    }
  })();

  return state.connecting;
}

export async function redisGet(key: string): Promise<string | null> {
  try {
    const client = await getClient();
    if (!client) return null;
    const result = await withTimeout(client.get(key));
    return typeof result === 'string' ? result : null;
  } catch {
    markUnavailable();
    return null;
  }
}

export async function redisSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    const client = await getClient();
    if (client) await withTimeout(client.set(key, value, { EX: ttlSeconds }));
  } catch {
    markUnavailable();
  }
}

export async function redisDelete(key: string): Promise<void> {
  try {
    const client = await getClient();
    if (client) await withTimeout(client.del(key));
  } catch {
    markUnavailable();
  }
}
