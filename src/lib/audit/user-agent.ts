/**
 * User-agent parsing for the audit trail.
 *
 * Parsing happens server-side, from the request's own `User-Agent` header,
 * rather than in the browser from `navigator.userAgent`. The two normally agree,
 * but only the server-side value is trustworthy: a client that wants to hide
 * which device performed an action can trivially rewrite what it sends in a
 * request body, whereas the header is attached by the browser itself.
 *
 * The previous UI parsed the stored UA string at render time into a terse
 * `Win/Edge`, recomputing it on every paint and discarding the detail. Parsing
 * once at write time and storing `os`, `browser`, and `device_type` in their own
 * columns makes each independently filterable and indexable.
 *
 * Pure and dependency-free.
 */

import type { DeviceType } from './types';

/** Structured device information derived from a user-agent string. */
export interface ParsedUserAgent {
  os: string;
  browser: string;
  deviceType: DeviceType;
  /** Compact form for the table's Device column, e.g. `Windows 11 · Edge 126`. */
  label: string;
}

/** Resolve a human-friendly OS name, including a version where detectable. */
export function parseOs(ua: string): string {
  // Windows 11 is indistinguishable from 10 in the UA string; both report
  // "Windows NT 10.0". Reporting the pair is accurate rather than guessing.
  if (/Windows NT 10\.0/i.test(ua)) return 'Windows 10/11';
  if (/Windows NT 6\.3/i.test(ua)) return 'Windows 8.1';
  if (/Windows NT 6\.2/i.test(ua)) return 'Windows 8';
  if (/Windows NT 6\.1/i.test(ua)) return 'Windows 7';
  if (/Windows Phone/i.test(ua)) return 'Windows Phone';
  if (/Windows/i.test(ua)) return 'Windows';

  // iOS MUST be tested before any macOS check. An iPhone's user-agent reads
  // "CPU iPhone OS 17_5 like Mac OS X", so it contains the literal string
  // "Mac OS X" — a generic Mac test placed first matches it and misreports every
  // iPhone and iPad as a desktop Mac.
  //
  // (iPadOS 13+ deliberately identifies itself as "Macintosh" and is genuinely
  // indistinguishable from a Mac by user-agent alone; nothing here can recover
  // that, and guessing would be worse than reporting what was sent.)
  if (/iPhone|iPad|iPod/i.test(ua)) {
    const ios = ua.match(/OS (\d+)[._](\d+)(?:[._](\d+))?/i);
    return ios ? `iOS ${ios[1]}.${ios[2]}` : 'iOS';
  }

  const mac = ua.match(/Mac OS X (\d+)[._](\d+)/i);
  if (mac) return `macOS ${mac[1]}.${mac[2]}`;
  if (/Macintosh|Mac OS/i.test(ua)) return 'macOS';

  const android = ua.match(/Android (\d+(?:\.\d+)?)/i);
  if (android) return `Android ${android[1]}`;
  if (/Android/i.test(ua)) return 'Android';

  if (/CrOS/i.test(ua)) return 'ChromeOS';
  if (/Ubuntu/i.test(ua)) return 'Ubuntu';
  if (/Linux/i.test(ua)) return 'Linux';

  return 'Unknown';
}

/**
 * Resolve the browser name and major version.
 *
 * Order matters throughout: Edge and Opera both include `Chrome` in their UA
 * strings, and Chrome includes `Safari`. Testing the most specific token first
 * is what keeps Edge from being reported as Chrome.
 */
export function parseBrowser(ua: string): string {
  const version = (re: RegExp): string => ua.match(re)?.[1]?.split('.')[0] ?? '';

  if (/Edg(?:e|A|iOS)?\//i.test(ua)) {
    const v = version(/Edg(?:e|A|iOS)?\/(\d+[\d.]*)/i);
    return v ? `Edge ${v}` : 'Edge';
  }
  if (/OPR\/|Opera/i.test(ua)) {
    const v = version(/(?:OPR|Opera)\/(\d+[\d.]*)/i);
    return v ? `Opera ${v}` : 'Opera';
  }
  if (/SamsungBrowser\//i.test(ua)) {
    const v = version(/SamsungBrowser\/(\d+[\d.]*)/i);
    return v ? `Samsung Internet ${v}` : 'Samsung Internet';
  }
  if (/Firefox\/|FxiOS\//i.test(ua)) {
    const v = version(/(?:Firefox|FxiOS)\/(\d+[\d.]*)/i);
    return v ? `Firefox ${v}` : 'Firefox';
  }
  if (/CriOS\//i.test(ua)) {
    const v = version(/CriOS\/(\d+[\d.]*)/i);
    return v ? `Chrome ${v}` : 'Chrome';
  }
  if (/Chrome\//i.test(ua)) {
    const v = version(/Chrome\/(\d+[\d.]*)/i);
    return v ? `Chrome ${v}` : 'Chrome';
  }
  if (/Safari\//i.test(ua)) {
    const v = version(/Version\/(\d+[\d.]*)/i);
    return v ? `Safari ${v}` : 'Safari';
  }
  if (/MSIE |Trident\//i.test(ua)) return 'Internet Explorer';

  return 'Unknown';
}

/** Classify the device form factor. */
export function parseDeviceType(ua: string): DeviceType {
  if (!ua) return 'unknown';
  // iPad must be tested before the generic mobile check, and modern iPadOS
  // reports itself as a Macintosh, so the touch-capable Mac case is included.
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet';
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini/i.test(ua)) return 'mobile';
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return 'desktop';
  return 'unknown';
}

/** Parse a user-agent string into all its audit-relevant components. */
export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const value = (ua ?? '').trim();

  if (!value) {
    return { os: 'Unknown', browser: 'Unknown', deviceType: 'unknown', label: 'Unknown device' };
  }

  const os = parseOs(value);
  const browser = parseBrowser(value);
  const deviceType = parseDeviceType(value);

  return { os, browser, deviceType, label: `${os} · ${browser}` };
}
