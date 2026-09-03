/**
 * Header-value sanitizer (Requirement 8.5).
 *
 * HTTP header values must never carry control characters (which enable header
 * injection / response-splitting via CR/LF and other C0 codes) or path
 * separators (which can be abused when a header value is reflected into a path
 * or filename, e.g. `Content-Disposition`). This sanitizer strips both classes
 * of character, leaving the remaining characters untouched.
 */

/**
 * Strip control characters (code points below 0x20) and path separators
 * (`/` and `\`) from a value destined for an HTTP response header.
 *
 * The result contains no code point below 0x20 and no forward or back slash.
 *
 * @param value - the raw value to sanitize
 * @returns the sanitized header-safe value
 */
export function sanitizeHeaderValue(value: string): string {
  let result = '';
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code < 0x20) {
      continue;
    }
    if (char === '/' || char === '\\') {
      continue;
    }
    result += char;
  }
  return result;
}
