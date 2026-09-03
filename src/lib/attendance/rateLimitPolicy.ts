/**
 * Rate-limit budget + Retry-After derivation for the public attendance routes
 * (pure orchestration over the shared limiter).
 *
 * The unauthenticated verify (`POST /api/attendance/checkin/verify`) and
 * check-in (`POST /api/attendance/checkin`) routes must apply the request
 * budget *before* any deployment lookup or check-in insert (design "3.
 * Verification Service" rate-limit step). This module centralises that budget
 * so both routes share one source of truth:
 *
 *   - at most 5 requests per client identifier within a rolling 60-second
 *     window (R14.2), and
 *   - for a limited request, a whole-second `Retry-After` until the window
 *     resets, rounded up with a minimum of 1 (R14.3).
 *
 * It wraps the existing `rateLimit` from `src/lib/rateLimit.ts` and reuses
 * `deriveClientId` (which itself wraps `getClientIp`) from `./clientId`, so the
 * client-id derivation and the underlying counter stay consistent with the
 * other public routes.
 *
 * Requirements: 14.2, 14.3
 */

import { rateLimit } from '@/lib/rateLimit';
import { deriveClientId } from './clientId';

/** Maximum number of requests allowed per client id within the window (R14.2). */
export const ATTENDANCE_RATE_LIMIT = 5;

/** Rolling window length, in milliseconds — 60 seconds (R14.2). */
export const ATTENDANCE_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * The rate-limit scope for each public attendance route. The scope prefixes the
 * client id so the verify and check-in budgets are tracked independently.
 */
export type RateLimitScope = 'att-verify' | 'att-checkin';

/** The outcome of applying the attendance rate-limit budget to a request. */
export interface RateLimitDecision {
  /** True when the request exceeds the budget and must be rejected (R14.3). */
  limited: boolean;
  /**
   * Whole seconds until the window resets, for the `Retry-After` header. Rounded
   * up with a minimum of 1 (R14.3). Only meaningful when `limited` is true;
   * `0` when the request is allowed.
   */
  retryAfter: number;
  /** The client identifier the budget was keyed on. */
  clientId: string;
}

/**
 * Build the limiter key for a scope + client id, e.g. `att-verify:1.2.3.4`.
 * Kept explicit so it matches the `\`att-verify:${getClientIp(req)}\`` shape
 * described in the design.
 */
export function rateLimitKey(scope: RateLimitScope, clientId: string): string {
  return `${scope}:${clientId}`;
}

/**
 * Normalise the limiter's raw `retryAfter` to satisfy R14.3: a whole number of
 * seconds rounded up, with a minimum of 1. `rateLimit` already rounds up via
 * `Math.ceil`, but a sub-second remainder or a boundary condition could yield
 * `0`; this guarantees the header is always at least 1 for a limited request.
 */
export function retryAfterSeconds(rawRetryAfter: number): number {
  const seconds = Number.isFinite(rawRetryAfter) ? Math.ceil(rawRetryAfter) : 1;
  return Math.max(1, seconds);
}

/**
 * Apply the attendance rate-limit budget for a request under the given scope.
 *
 * Derives the client id by the shared header precedence, consumes one unit of
 * the client's budget, and returns whether the request is limited along with a
 * spec-compliant `Retry-After` value. The caller must short-circuit (429, set
 * `Retry-After`) before performing any lookup or insert when `limited` is true.
 */
export function enforceRateLimit(
  request: Request,
  scope: RateLimitScope,
): RateLimitDecision {
  const clientId = deriveClientId(request);
  const result = rateLimit(rateLimitKey(scope, clientId), {
    limit: ATTENDANCE_RATE_LIMIT,
    windowMs: ATTENDANCE_RATE_LIMIT_WINDOW_MS,
  });

  return {
    limited: result.limited,
    retryAfter: result.limited ? retryAfterSeconds(result.retryAfter) : 0,
    clientId,
  };
}
