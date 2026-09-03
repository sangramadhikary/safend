// Feature: security-hardening, Property 6: Search-term sanitization removes structural characters, is idempotent, and bounds length

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import {
  sanitizeSearchTerm,
  gateSearchTerm,
  MAX_SEARCH_TERM_LENGTH,
  MIN_SEARCH_TERM_LENGTH,
} from '../search-sanitizer';

/**
 * Property 6: Search-term sanitization removes structural characters, is
 * idempotent, and bounds length.
 *
 * For any input string, the sanitized search term:
 *  - contains none of the structural/wildcard characters
 *    (comma, parentheses, period, colon, asterisk, percent),
 *  - is composed only of the safe set (alphanumerics, spaces, hyphens, apostrophes),
 *  - is at most MAX_SEARCH_TERM_LENGTH (50) characters,
 *  - satisfies sanitize(sanitize(x)) === sanitize(x).
 * When the sanitized term is shorter than MIN_SEARCH_TERM_LENGTH (2) characters
 * the query gate yields the empty result without querying.
 *
 * Validates: Requirements 8.2, 12.3, 12.4
 */
describe('Property 6: search-term sanitizer', () => {
  // A generator that intentionally mixes structural/wildcard characters and
  // arbitrary unicode so the safe-set and structural-removal guarantees are
  // exercised across the full input space.
  const structuralChars = ',().:*%';
  const rawTermArb = fc.oneof(
    fc.string(),
    fc.string({ unit: 'grapheme' }),
    // strings biased toward structural/wildcard + safe chars
    fc
      .array(
        fc.constantFrom(
          ...`${structuralChars}abcABC123 -'\t\n#$&;<>"/\\`.split(''),
        ),
        { maxLength: 80 },
      )
      .map((chars) => chars.join('')),
  );

  it('removes structural/wildcard characters and keeps only the safe set', () => {
    fc.assert(
      fc.property(rawTermArb, (raw) => {
        const result = sanitizeSearchTerm(raw);
        // none of the structural/wildcard characters survive
        for (const ch of structuralChars) {
          expect(result.includes(ch)).toBe(false);
        }
        // result is composed only of the safe set
        expect(/^[a-zA-Z0-9 '-]*$/.test(result)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('bounds the length to MAX_SEARCH_TERM_LENGTH', () => {
    fc.assert(
      fc.property(rawTermArb, (raw) => {
        const result = sanitizeSearchTerm(raw);
        expect(result.length).toBeLessThanOrEqual(MAX_SEARCH_TERM_LENGTH);
      }),
      { numRuns: 100 },
    );
  });

  it('is idempotent: sanitize(sanitize(x)) === sanitize(x)', () => {
    fc.assert(
      fc.property(rawTermArb, (raw) => {
        const once = sanitizeSearchTerm(raw);
        const twice = sanitizeSearchTerm(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 100 },
    );
  });

  it('gate yields empty result when sanitized term is shorter than MIN_SEARCH_TERM_LENGTH', () => {
    fc.assert(
      fc.property(rawTermArb, (raw) => {
        const sanitized = sanitizeSearchTerm(raw);
        const gated = gateSearchTerm(raw);
        if (sanitized.length < MIN_SEARCH_TERM_LENGTH) {
          expect(gated).toBe('');
        } else {
          expect(gated).toBe(sanitized);
        }
      }),
      { numRuns: 100 },
    );
  });
});
