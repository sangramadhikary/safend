/**
 * Audit redaction rules.
 *
 * The audit trail records before/after state for every mutation, which means it
 * will inevitably be handed values that must never be persisted in plaintext.
 * This module is the single place that decides what gets masked.
 *
 * The distinction that matters here is between *credentials* and *sensitive
 * business data*, because the correct treatment is opposite for each:
 *
 *   - Credentials and government identifiers (passwords, tokens, OTPs, Aadhaar,
 *     PAN, bank account numbers) have NO audit value. Knowing that a password
 *     changed is useful; knowing what it changed to is a liability. These are
 *     fully or partially masked.
 *
 *   - Sensitive business figures (salary, invoice amounts, penalty amounts,
 *     deductions) are precisely what an auditor needs to see. Masking them would
 *     defeat the purpose of the log. These are recorded verbatim, and access is
 *     controlled at the RLS layer instead — only administrators can read the
 *     trail at all.
 *
 * Every function here is pure so the rules can be unit-tested directly.
 */

/** Replacement written in place of a fully masked value. */
export const REDACTED = '[redacted]';

/**
 * Keys whose values carry no audit value and real disclosure risk. Matched
 * case-insensitively as a substring of the field path, so `user.passwordHash`
 * and `new_password` both match `password`.
 */
const FULLY_MASKED_PATTERNS: readonly RegExp[] = [
  /pass(word|wd|phrase)/i,
  /secret/i,
  /token/i,
  /api[-_]?key/i,
  /private[-_]?key/i,
  /credential/i,
  /session[-_]?key/i,
  /\botp\b/i,
  /\bpin\b/i,
  /\bcvv\b/i,
  /security[-_]?(question|answer)/i,
  /recovery[-_]?code/i,
  /authorization/i,
  /cookie/i,
  /bearer/i,
];

/**
 * Keys that identify a person or account strongly enough to be worth masking,
 * but where the trailing characters are needed to tell two records apart
 * ("which of his three bank accounts did she change?"). These keep the last 4
 * characters and mask the rest.
 */
const PARTIALLY_MASKED_PATTERNS: readonly RegExp[] = [
  /aadhaar|aadhar/i,
  /\bpan\b|pan[-_]?(no|number)/i,
  /passport/i,
  /account[-_]?(no|number)/i,
  /\bifsc\b/i,
  /\buan\b/i,
  /\besic\b/i,
  /\bpf[-_]?(no|number)/i,
  /\bssn\b/i,
  /card[-_]?(no|number)/i,
  /driving[-_]?licen[cs]e/i,
];

/**
 * Fields that change on every write without representing a user decision.
 * Including them would make every diff look like a change to `updated_at`,
 * burying the one field that actually matters.
 */
const NOISE_KEYS: ReadonlySet<string> = new Set([
  'updated_at',
  'updatedat',
  'modified_at',
  'modifiedat',
  'last_modified',
  'lastmodified',
  '_v',
  '__v',
  'etag',
  'revision',
  'sync_token',
  'synctoken',
]);

/** Longest string value retained verbatim in a diff before truncation. */
export const MAX_VALUE_LENGTH = 512;

/** Extract the final segment of a dotted field path (`a.b.c` -> `c`). */
function leafKey(path: string): string {
  const parts = path.split('.');
  return parts[parts.length - 1] ?? path;
}

/**
 * True when a field should be omitted from diffs entirely because it changes
 * mechanically rather than as the result of a user action.
 */
export function isNoiseField(path: string): boolean {
  return NOISE_KEYS.has(leafKey(path).toLowerCase());
}

/** How a given field path must be treated when recorded. */
export type RedactionMode = 'none' | 'partial' | 'full';

/** Classify a field path against the masking rules. */
export function classifyField(path: string): RedactionMode {
  if (FULLY_MASKED_PATTERNS.some((re) => re.test(path))) return 'full';
  if (PARTIALLY_MASKED_PATTERNS.some((re) => re.test(path))) return 'partial';
  return 'none';
}

/**
 * Mask all but the trailing `visible` characters of a value.
 *
 * Short values are masked completely rather than partially: revealing the last
 * 4 characters of a 5-character value discloses essentially all of it.
 */
export function maskPartial(value: string, visible = 4): string {
  if (value.length <= visible + 1) return REDACTED;
  const tail = value.slice(-visible);
  return `${'*'.repeat(Math.min(value.length - visible, 12))}${tail}`;
}

/** Truncate an over-long string, noting how many characters were dropped. */
export function truncateValue(value: string, max = MAX_VALUE_LENGTH): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}… [+${value.length - max} chars]`;
}

/**
 * Apply the redaction rules to a single value at a given field path.
 *
 * Non-string values are returned unchanged when the path is not sensitive,
 * preserving their JSON type so the UI can render numbers as numbers and
 * booleans as booleans rather than as quoted strings.
 */
export function redactValue(path: string, value: unknown): unknown {
  const mode = classifyField(path);

  if (mode === 'full') return REDACTED;

  if (mode === 'partial') {
    if (value === null || value === undefined) return value;
    return maskPartial(String(value));
  }

  if (typeof value === 'string') return truncateValue(value);
  return value;
}
