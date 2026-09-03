import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/rateLimit';

/**
 * Client-IP resolver route.
 *
 * Returns the client's real IP address, approximate geolocation, and OS.
 * The real source client IP is only reliably known server-side (from the
 * `x-forwarded-for` / `x-real-ip` / `cf-connecting-ip` headers). The browser
 * cannot read its own egress IP. Audit logging is initiated client-side, so it
 * calls this endpoint to resolve the actual client IP rather than recording the
 * legacy `'client-side (see server logs for IP)'` sentinel.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  // Parse OS from user-agent
  const ua = request.headers.get('user-agent') || '';
  const os = parseOS(ua);

  // Resolve geolocation
  // Vercel provides geo headers automatically; Cloudflare provides cf-ipcountry.
  // For local dev, we fall back to an external service.
  let location: string | null = null;

  // Try Vercel geo headers first (free, no external call)
  const vercelCity = request.headers.get('x-vercel-ip-city');
  const vercelCountry = request.headers.get('x-vercel-ip-country');
  const vercelRegion = request.headers.get('x-vercel-ip-country-region');

  if (vercelCity || vercelCountry) {
    const parts = [vercelCity, vercelRegion, vercelCountry].filter(Boolean);
    location = parts.join(', ');
  } else {
    // Try Cloudflare header
    const cfCountry = request.headers.get('cf-ipcountry');
    if (cfCountry && cfCountry !== 'XX') {
      location = cfCountry;
    }
  }

  // If no platform headers (local dev), try a lightweight external lookup
  // but only for non-loopback IPs
  if (!location && ip !== '::1' && ip !== '127.0.0.1' && ip !== 'unknown') {
    try {
      const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(2000) });
      if (geoRes.ok) {
        const geo = await geoRes.json();
        const parts = [geo.city, geo.region, geo.country_name].filter(Boolean);
        if (parts.length > 0) location = parts.join(', ');
      }
    } catch {
      // Non-critical
    }
  }

  // Local dev fallback
  if (!location && (ip === '::1' || ip === '127.0.0.1')) {
    location = 'Localhost';
  }

  return NextResponse.json(
    { ip, location, os },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * Parse a human-friendly OS name from the user-agent string.
 */
function parseOS(ua: string): string {
  if (/Windows NT 10/i.test(ua)) return 'Windows 10/11';
  if (/Windows NT 6\.3/i.test(ua)) return 'Windows 8.1';
  if (/Windows NT 6\.2/i.test(ua)) return 'Windows 8';
  if (/Windows NT 6\.1/i.test(ua)) return 'Windows 7';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X.*?(\d+[._]\d+)/i.test(ua)) return `macOS ${ua.match(/Mac OS X.*?(\d+[._]\d+)/i)?.[1]?.replace(/_/g, '.')}`;
  if (/Macintosh|Mac OS/i.test(ua)) return 'macOS';
  if (/Android (\d+)/i.test(ua)) return `Android ${ua.match(/Android (\d+)/i)?.[1]}`;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Linux/i.test(ua)) return 'Linux';
  if (/CrOS/i.test(ua)) return 'Chrome OS';
  return 'Unknown OS';
}
