import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Edge proxy — subdomain routing + security headers.
 *
 * ── Subdomain Routing ─────────────────────────────────────────────────────────
 * Routes requests based on the subdomain:
 *   • office.safend.in  → ERP panel (/login, /dashboard, /sales, etc.)
 *   • client.safend.in  → Client portal (/client-portal, /client-login)
 *   • ops.safend.in     → Supervisor/Operations portal (/supervisor-portal)
 *   • safend.in (bare)  → Marketing site (/, /about, /pricing, etc.)
 *
 * ── Why this does NOT enforce authentication ──────────────────────────────────
 * The Supabase browser client in this app is configured with
 * `persistSession: true`, which stores the access/refresh tokens in
 * `localStorage`, NOT in cookies. Edge proxy can only read cookies/headers,
 * so it cannot verify a user's session here. Per-route auth enforcement would
 * require migrating session storage to cookies (e.g. `@supabase/ssr`), which is
 * a larger refactor. Until then, route gating remains the responsibility of the
 * client-side guards (ProtectedRoute / ClientProtectedRoute / EmployeeProtectedRoute)
 * plus Supabase Row-Level Security on the data layer.
 *
 * What this proxy DOES provide is defense-in-depth via response headers —
 * notably reducing the blast radius of XSS (which matters because auth tokens
 * live in localStorage), clickjacking, and MIME-sniffing.
 */

// ── Subdomain → Portal mapping ───────────────────────────────────────────────
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'safend.in';

/**
 * ERP routes — accessible only from office.safend.in
 */
const ERP_ROUTES = ['/login', '/dashboard', '/sales', '/operations', '/hr', '/accounts', '/office-admin', '/profile'];

/**
 * Client portal routes — accessible only from client.safend.in
 */
const CLIENT_ROUTES = ['/client-portal', '/client-login', '/login'];

/**
 * Supervisor/Operations portal routes — accessible only from ops.safend.in
 */
const OPS_ROUTES = ['/supervisor-portal', '/login'];

/**
 * Extract the subdomain from a hostname.
 * e.g. "office.safend.in" → "office", "safend.in" → null, "localhost:3000" → null
 * Only returns recognized subdomains (office, client, ops) to avoid false matches
 * on preview deployments or other domains.
 */
function getSubdomain(hostname: string): string | null {
  // Remove port
  const host = hostname.split(':')[0];

  // Localhost handling for development
  if (host === 'localhost' || host === '127.0.0.1') {
    return null;
  }

  // Check if host ends with root domain (must be preceded by a dot)
  const rootDomain = ROOT_DOMAIN.split(':')[0];
  if (!host.endsWith(`.${rootDomain}`)) return null;

  // Extract subdomain part
  const subdomain = host.slice(0, -(rootDomain.length + 1)); // +1 for the dot

  // Only return recognized subdomains — ignore others (e.g. preview deploys)
  const KNOWN_SUBDOMAINS = ['office', 'client', 'ops'];
  if (subdomain && KNOWN_SUBDOMAINS.includes(subdomain)) {
    return subdomain;
  }

  return null;
}

/**
 * Check if a pathname starts with any of the given route prefixes.
 */
function matchesRoutes(pathname: string, routes: string[]): boolean {
  return routes.some(route => pathname === route || pathname.startsWith(route + '/'));
}

/**
 * Get the default landing page for a subdomain.
 */
function getDefaultPage(subdomain: string | null): string {
  switch (subdomain) {
    case 'office': return '/login';
    case 'client': return '/client-login';
    case 'ops': return '/login';
    default: return '/';
  }
}

/**
 * The application's configured origin, used to pin CSP fetch directives. Read
 * from the same variables the API CORS handlers use so the policy and CORS stay
 * consistent. When unconfigured, the directives fall back to `'self'` only —
 * never a wildcard (Requirement 11.2).
 *
 * With subdomains, we also whitelist the sibling subdomains so cross-portal API
 * calls (if any) are not blocked.
 */
// Trim any trailing whitespace/newlines that can appear in env var values
// stored on Vercel. A newline in a header value throws in the Edge Runtime.
const CONFIGURED_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || ''
).trim();

const SUBDOMAIN_ORIGINS = ROOT_DOMAIN
  ? `https://office.${ROOT_DOMAIN} https://client.${ROOT_DOMAIN} https://ops.${ROOT_DOMAIN} https://${ROOT_DOMAIN}`
  : '';

/**
 * Google Maps JS API origins.
 *
 * `@googlemaps/js-api-loader` injects a <script> from maps.googleapis.com, so
 * `script-src` has to allow it explicitly. Pinning script-src to our own origins
 * silently blocked every *interactive* map — the work order post picker, the
 * office-admin property location, fleet tracking — while the Maps *embed*
 * iframes kept working, because those are governed by `frame-src` instead.
 * That asymmetry is why some maps rendered and others did not.
 */
const GOOGLE_MAPS_SCRIPT_SRC = 'https://maps.googleapis.com https://maps.gstatic.com';

/**
 * Build the Content-Security-Policy header value with `script-src`,
 * `style-src`, and `connect-src` restricted to the configured origin (plus
 * `'self'`) and no wildcard. `'unsafe-inline'` is retained for styles because
 * the app relies on inline/injected styles; script execution stays pinned to
 * trusted origins.
 */
function buildContentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV === 'development';
  // Pin fetch directives to our own origin; add the configured origin and subdomains when set.
  const sourceList = CONFIGURED_ORIGIN
    ? `'self' ${CONFIGURED_ORIGIN} ${SUBDOMAIN_ORIGINS}`
    : `'self' ${SUBDOMAIN_ORIGINS}`;

  // In development, Next.js/Turbopack injects inline scripts and uses eval for
  // HMR/fast-refresh. Without these exceptions the page renders blank (white screen).
  // In production, Next.js still requires 'unsafe-inline' for hydration scripts
  // unless nonce-based CSP is configured (requires Next.js proxy nonce support).
  const scriptSrc = isDev
    ? `${sourceList} 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com ${GOOGLE_MAPS_SCRIPT_SRC}`
    : `${sourceList} 'unsafe-inline' https://challenges.cloudflare.com ${GOOGLE_MAPS_SCRIPT_SRC}`;

  // External services the app legitimately connects to at runtime.
  const externalConnectSrc = [
    'https://*.supabase.co',
    'https://*.supabase.in',
    'wss://*.supabase.co',
    'https://api.safend.in',
    'wss://api.safend.in',
    'https://*.googleapis.com',
    'https://*.firebaseio.com',
    'https://*.google-analytics.com',
    'https://*.analytics.google.com',
    'https://*.r2.dev',
    'https://*.wixstatic.com',
    'https://worldtimeapi.org',
    'https://timeapi.io',
    'https://challenges.cloudflare.com',
  ].join(' ');

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src ${sourceList} 'unsafe-inline' https://fonts.googleapis.com`,
    `connect-src ${sourceList} ${externalConnectSrc}${isDev ? ' ws: wss:' : ''}`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    // The Maps JS API and the PWA service worker both instantiate workers from
    // blob: URLs, which `default-src 'self'` would otherwise reject.
    `worker-src 'self' blob:`,
    // Only the Google Maps embed may be framed *by* this app; everything else
    // (and framing *of* this app) is denied.
    `frame-src 'self' https://www.google.com https://maps.google.com https://challenges.cloudflare.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `form-action 'self'`,
    // Force any stray http subresource/navigation to https.
    `upgrade-insecure-requests`,
  // Collapse any embedded newlines/extra whitespace — a newline in a header
  // value throws TypeError in the Next.js Edge Runtime (strict header validation).
  ].join('; ').replace(/[\r\n]+/g, ' ').replace(/  +/g, ' ');
}

export function proxy(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;
  const subdomain = getSubdomain(hostname);
  const isDev = process.env.NODE_ENV === 'development';

  // ── Subdomain root redirect ─────────────────────────────────────────────────
  // If user visits the root "/" on a subdomain, send them to the right page.
  // This runs FIRST before access control so "/" always lands correctly.
  if (subdomain && pathname === '/') {
    const defaultPage = getDefaultPage(subdomain);
    if (defaultPage !== '/') {
      return NextResponse.redirect(new URL(defaultPage, request.url));
    }
  }

  // ── Subdomain-based access control ──────────────────────────────────────────
  // Block cross-panel navigation.
  // e.g. someone on client.safend.in should not access /dashboard
  if (subdomain) {
    // office.safend.in — only ERP routes + API routes allowed
    if (subdomain === 'office') {
      if (!matchesRoutes(pathname, ERP_ROUTES) && !pathname.startsWith('/api')) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
    }

    // client.safend.in — only client portal routes + API routes allowed
    if (subdomain === 'client') {
      if (!matchesRoutes(pathname, CLIENT_ROUTES) && !pathname.startsWith('/api')) {
        return NextResponse.redirect(new URL('/client-login', request.url));
      }
    }

    // ops.safend.in — only supervisor/ops routes + API routes allowed
    if (subdomain === 'ops') {
      if (!matchesRoutes(pathname, OPS_ROUTES) && !pathname.startsWith('/api')) {
        return NextResponse.redirect(new URL('/supervisor-portal', request.url));
      }
    }
  }

  const response = NextResponse.next();

  // ── Geofence: Block non-India access for ERP and supervisor portal ──
  // Uses Vercel's geo headers (free, no external call)
  const country = request.headers.get('x-vercel-ip-country');
  const isProtectedRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/sales') ||
    pathname.startsWith('/operations') || pathname.startsWith('/hr') ||
    pathname.startsWith('/accounts') || pathname.startsWith('/office-admin') ||
    pathname.startsWith('/supervisor-portal') || pathname.startsWith('/profile');

  if (isProtectedRoute && country && country !== 'IN' && country !== 'XX') {
    // Check if admin (from session cookie)
    const sessionCookieGeo = request.cookies.get('safend_session')?.value;
    let isAdminUser = false;
    if (sessionCookieGeo) {
      try {
        const s = JSON.parse(sessionCookieGeo);
        isAdminUser = s.role === 'admin';
      } catch {}
    }
    if (!isAdminUser) {
      return new NextResponse(
        '<html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem"><div><h1>Access Restricted</h1><p>This application is only accessible from India.</p></div></body></html>',
        { status: 403, headers: { 'Content-Type': 'text/html' } }
      );
    }
  }

  // ── PWA redirect: if user has a session cookie and visits marketing homepage,
  // redirect to their portal (only on the bare domain, not subdomains). ──
  const sessionCookie = request.cookies.get('safend_session')?.value;

  if (pathname === '/' && !subdomain && sessionCookie) {
    try {
      const session = JSON.parse(sessionCookie);
      if (session.sessionToken) {
        const role = session.role || '';
        // In development (localhost) stay on the same origin — subdomains don't
        // work locally, so redirect to the equivalent path instead.
        if (isDev) {
          if (role === 'supervisor' || role === 'employee_portal') {
            return NextResponse.redirect(new URL('/supervisor-portal', request.url));
          }
          if (role === 'client') {
            return NextResponse.redirect(new URL('/client-portal', request.url));
          }
          return NextResponse.redirect(new URL('/dashboard', request.url));
        }
        // Production — redirect to the appropriate subdomain.
        if (role === 'supervisor' || role === 'employee_portal') {
          return NextResponse.redirect(new URL('/supervisor-portal', `https://ops.${ROOT_DOMAIN}`));
        }
        if (role === 'client') {
          return NextResponse.redirect(new URL('/client-portal', `https://client.${ROOT_DOMAIN}`));
        }
        return NextResponse.redirect(new URL('/dashboard', `https://office.${ROOT_DOMAIN}`));
      }
    } catch {
      // Invalid cookie — ignore, let them through to marketing
    }
  }

  // Prevent the page from being framed (clickjacking).
  response.headers.set('X-Frame-Options', 'DENY');
  // Disable MIME-type sniffing.
  response.headers.set('X-Content-Type-Options', 'nosniff');
  // Limit referrer leakage.
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Lock down powerful browser features by default.
  response.headers.set(
    'Permissions-Policy',
    'camera=(self), microphone=(), geolocation=(self), payment=()'
  );
  // Enforce HTTPS for the configured lifetime (only meaningful over HTTPS).
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  );
  // Isolate this browsing context from cross-origin windows it opens/that open
  // it, mitigating cross-window scripting & some token-leak side channels.
  // 'allow-popups' keeps any legitimate popup-based flows working.
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  // Block legacy Flash/PDF cross-domain policy files.
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  // Explicitly disable the legacy XSS auditor (it is itself a vuln surface);
  // CSP is the real XSS control.
  response.headers.set('X-XSS-Protection', '0');
  // Content-Security-Policy — only enforced in production. In development,
  // Turbopack/HMR scripts, WebSocket connections, and third-party service
  // calls (Firebase, Supabase, etc.) would all be blocked, causing a white
  // screen and cascading "Failed to fetch" errors.
  if (!isDev) {
    response.headers.set('Content-Security-Policy', buildContentSecurityPolicy());
  }

  return response;
}

export const config = {
  // Apply to all routes except Next.js internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|mp4|mp3|ico)$).*)'],
};
