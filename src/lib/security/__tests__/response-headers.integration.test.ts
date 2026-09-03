// The Edge middleware reads the configured origin from the environment at
// module-load time, so the env var MUST be set before `middleware.ts` is
// imported. This assignment runs during module evaluation, before the dynamic
// import in `loadMiddleware()` executes.
const CONFIGURED_ORIGIN = 'https://app.safend.example';
process.env.NEXT_PUBLIC_SITE_URL = CONFIGURED_ORIGIN;
delete process.env.NEXT_PUBLIC_APP_URL;

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { resolveAllowOrigin, NO_ALLOW_ORIGIN } from '../cors';

/**
 * Integration/snapshot test for the application's security response headers
 * (Requirements 11.1, 11.2) and the CORS non-reflection behavior (11.3, 11.4).
 *
 * The CORS resolver is a pure function and is exercised directly. The
 * middleware module is loaded once (after the env var above is set) and invoked
 * to capture the headers it applies to a response.
 */

async function loadMiddleware() {
  const mod = await import('../../../../middleware');
  return mod.middleware as (req: NextRequest) => Response;
}

function runMiddleware(
  middleware: (req: NextRequest) => Response,
  url = 'https://app.safend.example/dashboard',
): Response {
  const request = new NextRequest(new URL(url));
  return middleware(request);
}

describe('security response headers (middleware)', () => {
  // Requirement 11.1: required defense-in-depth headers present with correct values.
  it('sets every required security header with a correct value (Req 11.1)', async () => {
    const middleware = await loadMiddleware();
    const headers = runMiddleware(middleware).headers;

    // X-Frame-Options must be DENY or SAMEORIGIN.
    expect(headers.get('X-Frame-Options')).toMatch(/^(DENY|SAMEORIGIN)$/);

    // X-Content-Type-Options must be nosniff.
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');

    // Strict-Transport-Security with max-age >= 31536000.
    const hsts = headers.get('Strict-Transport-Security');
    expect(hsts).toBeTruthy();
    const maxAge = Number(/max-age=(\d+)/.exec(hsts ?? '')?.[1] ?? '0');
    expect(maxAge).toBeGreaterThanOrEqual(31536000);

    // Referrer-Policy and Permissions-Policy must be present.
    expect(headers.get('Referrer-Policy')).toBeTruthy();
    expect(headers.get('Permissions-Policy')).toBeTruthy();
  });

  // Requirement 11.2: CSP with script-src/style-src/connect-src pinned to the
  // configured origin and containing no wildcard.
  it('sets a Content-Security-Policy pinned to the configured origin with no wildcard (Req 11.2)', async () => {
    const middleware = await loadMiddleware();
    const csp = runMiddleware(middleware).headers.get('Content-Security-Policy');
    expect(csp).toBeTruthy();

    const directives = Object.fromEntries(
      (csp ?? '')
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const [name, ...values] = d.split(/\s+/);
          return [name, values];
        }),
    ) as Record<string, string[]>;

    // The three required fetch directives must exist.
    for (const directive of ['script-src', 'style-src', 'connect-src']) {
      expect(directives[directive]).toBeDefined();
      // Pinned to the configured origin.
      expect(directives[directive]).toContain(CONFIGURED_ORIGIN);
      // No wildcard source anywhere in these directives.
      expect(directives[directive]).not.toContain('*');
      expect(directives[directive]).not.toContain('https:');
    }

    // The whole policy must never contain a bare wildcard source.
    expect(csp).not.toMatch(/(^|[\s;])\*([\s;]|$)/);
  });

  // Snapshot of the full header set for regression visibility.
  it('matches the security header snapshot', async () => {
    const middleware = await loadMiddleware();
    const headers = runMiddleware(middleware).headers;

    const snapshot = {
      'X-Frame-Options': headers.get('X-Frame-Options'),
      'X-Content-Type-Options': headers.get('X-Content-Type-Options'),
      'Referrer-Policy': headers.get('Referrer-Policy'),
      'Permissions-Policy': headers.get('Permissions-Policy'),
      'Strict-Transport-Security': headers.get('Strict-Transport-Security'),
      'Content-Security-Policy': headers.get('Content-Security-Policy'),
    };

    expect(snapshot).toMatchInlineSnapshot(`
      {
        "Content-Security-Policy": "default-src 'self'; script-src 'self' https://app.safend.example 'unsafe-inline'; style-src 'self' https://app.safend.example 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self' https://app.safend.example https://*.supabase.co https://*.supabase.in wss://*.supabase.co https://api.safend.in wss://api.safend.in https://*.googleapis.com https://*.firebaseio.com https://*.google-analytics.com https://*.analytics.google.com https://*.r2.dev https://*.wixstatic.com https://worldtimeapi.org https://timeapi.io; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; frame-src 'self' https://www.google.com https://maps.google.com; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), payment=()",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
      }
    `);
  });
});

describe('CORS allow-origin resolution (Req 11.3, 11.4)', () => {
  it('echoes the configured origin only on an exact match', () => {
    expect(resolveAllowOrigin(CONFIGURED_ORIGIN, CONFIGURED_ORIGIN)).toBe(CONFIGURED_ORIGIN);
  });

  it('does not reflect a non-matching origin and emits no wildcard (Req 11.4)', () => {
    const evil = 'https://evil.example';
    const resolved = resolveAllowOrigin(evil, CONFIGURED_ORIGIN);
    expect(resolved).toBe(NO_ALLOW_ORIGIN);
    expect(resolved).not.toBe(evil);
    expect(resolved).not.toBe('*');
  });

  it('emits no header when the request omits an origin', () => {
    expect(resolveAllowOrigin(null, CONFIGURED_ORIGIN)).toBe(NO_ALLOW_ORIGIN);
  });
});
