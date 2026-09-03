/**
 * Server-side resolution of the audit context that clients must not supply.
 *
 * The dividing line this module enforces: a browser may tell us WHAT it did, but
 * never WHO or WHERE it did it from. Identity, roles, IP, geolocation, device,
 * and time all come from the request itself or from the database, so a
 * compromised or merely curious client cannot write a misleading audit entry.
 *
 * Geolocation reuses the platform edge headers Vercel and Cloudflare already
 * attach, which costs nothing per request. The existing `/api/client-ip` route
 * computed the same values but the logger discarded everything except the raw IP,
 * so location was available and simply thrown away on every write.
 */

import 'server-only';
import { getClientIp } from '@/lib/rateLimit';
import { parseUserAgent, type ParsedUserAgent } from './user-agent';

/** Everything the server derives about an incoming audited request. */
export interface AuditRequestContext {
  ip: string;
  location: string | null;
  userAgent: string;
  device: ParsedUserAgent;
  requestId: string;
  httpMethod: string;
  /** Server-authoritative event time, ISO-8601 UTC. */
  timestamp: string;
}

/**
 * Resolve approximate geolocation from platform edge headers.
 *
 * Header-only by design. The previous implementation fell back to an outbound
 * `ipapi.co` lookup, which on the audit write path would mean a third-party
 * network call — and a disclosure of user IPs to that third party — on every
 * logged action. City-level precision is not worth either cost, so an
 * unresolvable location is simply recorded as unknown.
 */
export function resolveLocation(request: Request): string | null {
  const city = request.headers.get('x-vercel-ip-city');
  const region = request.headers.get('x-vercel-ip-country-region');
  const country = request.headers.get('x-vercel-ip-country');

  if (city || country) {
    const parts = [city, region, country]
      .filter((p): p is string => Boolean(p))
      // Vercel percent-encodes city names containing spaces.
      .map((p) => {
        try {
          return decodeURIComponent(p);
        } catch {
          return p;
        }
      });
    if (parts.length > 0) return parts.join(', ');
  }

  const cfCity = request.headers.get('cf-ipcity');
  const cfCountry = request.headers.get('cf-ipcountry');
  if (cfCity || (cfCountry && cfCountry !== 'XX')) {
    return [cfCity, cfCountry].filter(Boolean).join(', ');
  }

  const ip = getClientIp(request);
  if (ip === '::1' || ip === '127.0.0.1') return 'Localhost';

  return null;
}

/**
 * Build the full server-resolved context for an audited request.
 *
 * `requestId` prefers the platform-assigned request identifier so an audit row
 * can be joined against the corresponding platform log line during an incident;
 * it falls back to a generated UUID when running outside Vercel.
 */
export function resolveAuditRequestContext(request: Request): AuditRequestContext {
  const userAgent = request.headers.get('user-agent') ?? '';

  const requestId =
    request.headers.get('x-vercel-id') ??
    request.headers.get('x-request-id') ??
    request.headers.get('cf-ray') ??
    crypto.randomUUID();

  return {
    ip: getClientIp(request),
    location: resolveLocation(request),
    userAgent,
    device: parseUserAgent(userAgent),
    requestId,
    httpMethod: request.method,
    timestamp: new Date().toISOString(),
  };
}
