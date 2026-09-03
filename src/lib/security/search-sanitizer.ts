/**
 * Search-term sanitization control (Req 8.2, 12.3, 12.4).
 *
 * Free-text search terms are embedded into PostgREST `.or()` / `ilike` filter
 * strings on the employee-verification path. PostgREST treats commas,
 * parentheses, periods and colons as structural characters and `*`/`%` as
 * wildcards, so leaving them in user input would let an attacker break out of
 * the intended conditions and rewrite the query (filter injection).
 *
 * `sanitizeSearchTerm` therefore keeps only a safe, human-search charset —
 * alphanumerics, spaces, hyphens and apostrophes — collapses runs of
 * whitespace, and caps the length at 50 characters to bound query cost. It is
 * idempotent: `sanitizeSearchTerm(sanitizeSearchTerm(x)) === sanitizeSearchTerm(x)`.
 */

/** Maximum length of a sanitized search term, in characters. */
export const MAX_SEARCH_TERM_LENGTH = 50;

/** Minimum sanitized length required before a search query is issued. */
export const MIN_SEARCH_TERM_LENGTH = 2;

/**
 * Strip every character outside the safe human-search set (alphanumerics,
 * spaces, hyphens, apostrophes), collapse internal whitespace, and cap the
 * result at {@link MAX_SEARCH_TERM_LENGTH} characters.
 *
 * Structural/wildcard characters (`,` `(` `)` `.` `:` `*` `%` and any other
 * non-safe character) are removed. The operation is idempotent.
 */
export function sanitizeSearchTerm(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9 '-]/g, '') // drop structural/wildcard + any other unsafe chars
    .replace(/\s+/g, ' ') // collapse whitespace runs to a single space
    .slice(0, MAX_SEARCH_TERM_LENGTH) // bound length before trimming so the result is idempotent
    .trim();
}

/**
 * Query gate for the search path: sanitizes `raw` and yields the term to query
 * with, or the empty string when the sanitized term is shorter than
 * {@link MIN_SEARCH_TERM_LENGTH} characters. An empty result signals the caller
 * to short-circuit and perform no query (Req 12.4).
 */
export function gateSearchTerm(raw: string): string {
  const term = sanitizeSearchTerm(raw);
  return term.length < MIN_SEARCH_TERM_LENGTH ? '' : term;
}
