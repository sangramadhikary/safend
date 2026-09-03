/**
 * Server-side Traccar connection settings.
 *
 * Values are sanitised before use. Secrets pulled from a hosting provider
 * (`vercel env pull`) can arrive with a trailing newline, and because dotenv
 * expands escapes inside double-quoted values, `TRACCAR_URL="https://host\r\n"`
 * ends up in `process.env` with a real CR/LF attached. `fetch()` happens to
 * tolerate that today (the URL parser strips control characters and header
 * values are trimmed), but the raw value breaks anything that treats it as a
 * plain string, so we normalise it once here instead of in eight route files.
 */

const DEFAULT_TRACCAR_URL = 'https://track.safend.in';

function sanitize(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/\\[rn]/g, '') // literal "\r" / "\n" escape sequences
    .replace(/[\r\n\t]/g, '') // real control characters
    .trim()
    .replace(/^['"]|['"]$/g, '') // stray surrounding quotes
    .trim();
}

/** Base URL of the Traccar server, without a trailing slash. */
export const TRACCAR_URL =
  sanitize(process.env.TRACCAR_URL).replace(/\/+$/, '') || DEFAULT_TRACCAR_URL;

/** Base64 `email:password` credential for Traccar HTTP Basic auth. */
export const TRACCAR_AUTH = sanitize(process.env.TRACCAR_AUTH);

/** Standard headers for a Traccar JSON API call. */
export function traccarJsonHeaders(): Record<string, string> {
  return {
    Authorization: `Basic ${TRACCAR_AUTH}`,
    Accept: 'application/json',
  };
}
