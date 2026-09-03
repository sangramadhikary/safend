import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { rateLimit } from '../rateLimit';

// Feature: security-hardening, Property 16: Rate limiter admits up to the cap then limits within a rolling window
//
// For any key, limit N, window W, and sequence of calls, the first N calls
// within the window are not limited and every subsequent call within the same
// window is limited with a `retryAfter` value greater than zero and not
// exceeding W (in seconds); the first call after the window's reset time
// begins a fresh allowance.
//
// Validates: Requirements 10.6, 13.1, 13.3

// The rate limiter keeps a module-level bucket map keyed by the supplied key.
// To keep each property run independent, every run uses a fresh, unique key.
let keyCounter = 0;
function uniqueKey(): string {
  keyCounter += 1;
  return `pbt-rate-limit:${keyCounter}:${Math.random().toString(36).slice(2)}`;
}

describe('rateLimit', () => {
  beforeEach(() => {
    // Control Date.now() so windows are deterministic. Anchor at a fixed epoch.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Property 16: admits up to the cap, then limits within the window with a bounded retryAfter', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }), // limit N
        fc.integer({ min: 1_000, max: 600_000 }), // window W (ms)
        fc.integer({ min: 0, max: 20 }), // number of extra calls beyond the cap
        (limit, windowMs, extra) => {
          const key = uniqueKey();
          const windowSeconds = Math.ceil(windowMs / 1000);

          // The first N calls within the window must NOT be limited.
          for (let i = 0; i < limit; i += 1) {
            const res = rateLimit(key, { limit, windowMs });
            expect(res.limited).toBe(false);
            expect(res.retryAfter).toBe(0);
          }

          // Every subsequent call within the SAME window must be limited,
          // with retryAfter in (0, W seconds].
          for (let j = 0; j < extra; j += 1) {
            const res = rateLimit(key, { limit, windowMs });
            expect(res.limited).toBe(true);
            expect(res.retryAfter).toBeGreaterThan(0);
            expect(res.retryAfter).toBeLessThanOrEqual(windowSeconds);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 16: the first call after the window reset begins a fresh allowance', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }), // limit N
        fc.integer({ min: 1_000, max: 600_000 }), // window W (ms)
        (limit, windowMs) => {
          const key = uniqueKey();

          // Exhaust the allowance within the window.
          for (let i = 0; i < limit; i += 1) {
            expect(rateLimit(key, { limit, windowMs }).limited).toBe(false);
          }
          // One more call within the window is limited.
          expect(rateLimit(key, { limit, windowMs }).limited).toBe(true);

          // Advance time to (and just past) the window reset.
          vi.advanceTimersByTime(windowMs);

          // The first call after the reset begins a fresh allowance.
          const afterReset = rateLimit(key, { limit, windowMs });
          expect(afterReset.limited).toBe(false);
          expect(afterReset.retryAfter).toBe(0);
          // Remaining reflects a brand-new window (limit - 1 consumed).
          expect(afterReset.remaining).toBe(limit - 1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
