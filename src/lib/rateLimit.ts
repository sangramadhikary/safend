/**
 * Lightweight in-memory rate limiter for public API routes.
 *
 * This is a best-effort, per-instance limiter intended to blunt casual abuse
 * (spam submissions, cheap DoS) of unauthenticated endpoints. It is NOT a
 * substitute for an edge/CDN rate limit or a shared store (Redis/Upstash) in a
 * multi-instance deployment — counters are per-process and reset on restart.
 *
 * Usage:
 *   const { limited, retryAfter } = rateLimit(`enquiry:${ip}`, { limit: 5, windowMs: 60_000 });
 *   if (limited) return tooManyRequests(retryAfter);
 */

interface Bucket {
  count: number;
  resetAt: number; // epoch ms when the window resets
}

const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so the map does not grow unbounded.
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitOptions {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  limited: boolean;
  /** Seconds until the window resets (for Retry-After), only meaningful when limited. */
  retryAfter: number;
  remaining: number;
}

export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { limited: false, retryAfter: 0, remaining: opts.limit - 1 };
  }

  existing.count += 1;
  if (existing.count > opts.limit) {
    return {
      limited: true,
      retryAfter: Math.ceil((existing.resetAt - now) / 1000),
      remaining: 0,
    };
  }

  return { limited: false, retryAfter: 0, remaining: opts.limit - existing.count };
}

/**
 * Derive a best-effort client identifier from the request headers. Falls back
 * to a constant when no forwarded IP is present so the limiter still applies a
 * shared global budget rather than failing open per-request.
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    // The first entry is the original client.
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}
