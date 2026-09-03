import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { sanitizeHeaderValue } from '../header-sanitizer';

// Feature: security-hardening, Property 7: Header-value sanitization strips control characters and path separators
//
// For any input string written into an HTTP response header, the sanitized
// output contains no code point below 0x20 and no forward slash or backslash.
//
// Validates: Requirements 8.5
describe('sanitizeHeaderValue', () => {
  it('Property 7: output contains no control characters (code point < 0x20) and no path separators', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme' }), (raw) => {
        const sanitized = sanitizeHeaderValue(raw);

        for (const char of sanitized) {
          const code = char.codePointAt(0)!;
          // No control characters below 0x20.
          expect(code).toBeGreaterThanOrEqual(0x20);
          // No forward slash or backslash.
          expect(char).not.toBe('/');
          expect(char).not.toBe('\\');
        }
      }),
      { numRuns: 100 },
    );
  });
});
