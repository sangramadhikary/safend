/**
 * Path / object-key sanitization controls.
 *
 * These pure functions guard the file-upload object-key construction against
 * path traversal, absolute paths, and injection of separators. They replace the
 * inline `isAllowedFolder` and the `replace(/[^a-zA-Z0-9.-]/g, '_')` calls in
 * `app/api/upload/route.ts`.
 *
 * Design references:
 * - Property 10 (folder validation rejects traversal and out-of-allowlist paths) — Req 9.5
 * - Property 11 (object-key segment sanitization yields only safe characters) — Req 9.6
 */

/**
 * Allowed destination-folder prefixes for uploaded objects.
 *
 * Mirrors STORAGE_PATHS in `src/lib/r2-storage.ts` and the allowlist previously
 * inlined in `app/api/upload/route.ts`. A caller may append a single safe
 * sub-segment (e.g. `documents/policy`), which is accepted as a prefix match.
 */
export const ALLOWED_FOLDER_PREFIXES = [
  'profile-pictures',
  'signed-agreements',
  'documents',
  'visitors/photos',
  'visitors/agreements',
  'workorders',
  'licenses',
  'attachments',
  'reports',
  'uploads',
] as const;

/**
 * Sanitize a single client-supplied object-key segment (a key prefix or a
 * filename) for safe embedding in an R2 object key.
 *
 * Every character outside `[a-zA-Z0-9.-]` is replaced by a single underscore at
 * the same position, so the output length always equals the input length. The
 * operation is idempotent: underscore is itself a safe output character, so a
 * second pass changes nothing. (Req 9.6)
 */
export function sanitizeKeySegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9.-]/g, '_');
}

/**
 * Validate a destination-folder string against the allowlist.
 *
 * Returns `false` when the value is empty, contains a traversal sequence
 * (`..`), begins with `/`, contains a backslash, contains any character outside
 * `[a-zA-Z0-9_-/]`, or does not match an allowed prefix. Returns `true` only
 * for a safe path that exactly equals an allowed prefix or sits directly under
 * one (`<prefix>/...`). (Req 9.5)
 */
export function isAllowedFolder(folder: string): boolean {
  // Reject traversal, absolute paths, and backslashes outright.
  if (!folder || folder.includes('..') || folder.startsWith('/') || folder.includes('\\')) {
    return false;
  }
  // Reject any character outside the safe folder character set.
  if (!/^[a-zA-Z0-9_\-/]+$/.test(folder)) {
    return false;
  }
  // Require an exact match or a known prefix followed by a sub-path.
  return ALLOWED_FOLDER_PREFIXES.some(
    (prefix) => folder === prefix || folder.startsWith(`${prefix}/`)
  );
}
