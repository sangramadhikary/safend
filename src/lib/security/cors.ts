/**
 * CORS origin resolver (Requirements 11.3, 11.4).
 *
 * Cross-origin responses must never advertise a wildcard
 * `Access-Control-Allow-Origin` and must never reflect an arbitrary,
 * caller-supplied origin back to the client. Reflecting an untrusted origin is
 * functionally equivalent to a wildcard for the attacker that sent it, so the
 * only safe behavior is to echo the application's own configured origin and
 * only when the incoming request origin is an exact match for it.
 *
 * This is a pure decision function with no I/O: route handlers call it to
 * decide whether to emit an `Access-Control-Allow-Origin` header and, if so,
 * with what value.
 */

/**
 * Sentinel returned by {@link resolveAllowOrigin} when no
 * `Access-Control-Allow-Origin` header should be emitted at all. Callers MUST
 * treat this value as "do not set the header" rather than as a header value.
 */
export const NO_ALLOW_ORIGIN = 'no allow-origin header' as const;

export type AllowOriginResolution = string | typeof NO_ALLOW_ORIGIN;

/**
 * Resolve the value for the `Access-Control-Allow-Origin` response header.
 *
 * Returns the `configuredOrigin` only when `requestOrigin` is exactly equal to
 * it; in every other case (missing, mismatched, or wildcard request origin)
 * returns {@link NO_ALLOW_ORIGIN}, signalling that no allow-origin header must
 * be set. The function never returns a wildcard (`*`) and never reflects a
 * non-matching request origin.
 *
 * @param requestOrigin - the `Origin` header from the incoming request, or null/undefined when absent
 * @param configuredOrigin - the application's configured origin, or null/undefined/empty when unconfigured
 * @returns the configured origin to echo, or {@link NO_ALLOW_ORIGIN} when no header should be set
 */
export function resolveAllowOrigin(
  requestOrigin: string | null | undefined,
  configuredOrigin: string | null | undefined,
): AllowOriginResolution {
  // No configured origin means we cannot safely echo anything.
  if (!configuredOrigin) {
    return NO_ALLOW_ORIGIN;
  }
  // Never reflect a wildcard, and only echo on an exact match of a present origin.
  if (!requestOrigin || requestOrigin !== configuredOrigin) {
    return NO_ALLOW_ORIGIN;
  }
  return configuredOrigin;
}
