/**
 * Client identifier derivation for QR field-attendance public endpoints.
 *
 * This is a pure, dependency-free module. It derives the identifier used to
 * key the rate limiter on the unauthenticated verify/check-in routes
 * (see design "Rate limiting" + Requirement 14.1).
 *
 * The identifier is resolved by header precedence:
 *   1. the first entry of `x-forwarded-for`, else
 *   2. `x-real-ip`, else
 *   3. `cf-connecting-ip`, else
 *   4. the constant `"unknown"`.
 *
 * This wraps the existing `getClientIp` from `src/lib/rateLimit.ts`, which
 * already implements exactly this precedence, so the attendance routes share a
 * single source of truth for client-id derivation.
 *
 * Requirements: 14.1
 */

import { getClientIp } from '@/lib/rateLimit';

/** Fallback client identifier when no forwarded IP header is present. */
export const UNKNOWN_CLIENT_ID = 'unknown';

/**
 * Derive a best-effort client identifier from a request's headers, following
 * the precedence `x-forwarded-for` (first entry) → `x-real-ip` →
 * `cf-connecting-ip` → `"unknown"`.
 *
 * Delegates to {@link getClientIp} so the derivation stays consistent with the
 * other public routes that use the shared rate limiter.
 */
export function deriveClientId(request: Request): string {
  return getClientIp(request);
}
