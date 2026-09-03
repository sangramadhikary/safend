/**
 * Exact-version validator (Requirement 14.4).
 *
 * Added or updated dependencies must be pinned to a single exact version.
 * Range specifiers — caret (`^`), tilde (`~`), wildcard (`*` / `x`), and
 * comparator ranges (`>`, `<`, `>=`, `<=`, `=`), hyphen ranges (`1.0.0 - 2.0.0`),
 * and OR-combined ranges (`||`) — must be rejected. This validator returns true
 * if and only if the specifier denotes a single exact semantic version with no
 * range operator.
 */

/**
 * Exact semantic-version pattern: `MAJOR.MINOR.PATCH` with optional prerelease
 * and build-metadata segments, anchored so the entire string must match.
 *
 * - Numeric identifiers have no leading zeros (except a literal `0`).
 * - A prerelease (`-...`) is a dot-separated set of alphanumeric/hyphen
 *   identifiers; numeric prerelease identifiers carry no leading zeros.
 * - Build metadata (`+...`) is a dot-separated set of alphanumeric/hyphen
 *   identifiers.
 *
 * This is the official SemVer recommended regular expression.
 */
const EXACT_SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * Determine whether a dependency version specifier denotes a single exact
 * version with no range operator.
 *
 * Returns `true` only for a fully-pinned semantic version such as `1.2.3`,
 * `0.0.1`, `1.2.3-beta.1`, or `1.2.3+build.5`. Any range operator or wildcard
 * (`^1.2.3`, `~1.2.3`, `1.x`, `*`, `>=1.0.0`, `1.0.0 - 2.0.0`, `1 || 2`) and any
 * malformed or non-string input yields `false`.
 *
 * @param specifier - the dependency version specifier to validate
 * @returns true if the specifier is a single exact version, false otherwise
 */
export function isExactVersion(specifier: unknown): boolean {
  if (typeof specifier !== 'string') {
    return false;
  }
  // No surrounding whitespace is permitted for an exact pin.
  if (specifier !== specifier.trim() || specifier.length === 0) {
    return false;
  }
  return EXACT_SEMVER.test(specifier);
}
