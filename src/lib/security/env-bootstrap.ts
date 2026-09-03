/**
 * Required-secret bootstrap validator (Requirement 4.3).
 *
 * Every server-side secret must be sourced from the environment with no
 * hardcoded fallback. At startup the application must fail fast when any
 * required secret is absent or empty rather than silently substituting a
 * placeholder (e.g. `?? ''` or `'https://placeholder.supabase.co'`). This
 * module provides a pure, testable validator over an env-like record plus a
 * thin throwing wrapper for use at server module load.
 */

/**
 * The default set of server-side secret variables that must be present and
 * non-empty for the application to serve requests. Mirrors the server-only and
 * client-exposed credential names in `.env.example` that the route handlers and
 * Supabase/R2 clients read from `process.env`.
 */
export const REQUIRED_SERVER_SECRETS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

/** An environment-like record mapping variable names to their values. */
export type EnvRecord = Record<string, string | undefined>;

/** The outcome of validating an env record against a set of required keys. */
export interface SecretValidationResult {
  /** True only when every required key is present and non-empty after trimming. */
  ok: boolean;
  /** The required keys that are genuinely absent or empty (after trimming). */
  missing: string[];
}

/**
 * Determine whether a single value counts as a present, non-empty secret.
 * A value is considered missing when it is `undefined`, not a string, or
 * becomes empty after trimming surrounding whitespace.
 */
function isMissing(value: string | undefined): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

/**
 * Validate that every required secret variable in `env` is present and
 * non-empty after trimming.
 *
 * This is a pure function: it performs no I/O, does not read `process.env`
 * directly, and does not mutate its inputs. The returned `missing` array lists
 * exactly the required keys that are genuinely absent or empty, so callers can
 * report a real offending variable rather than a guessed one.
 *
 * @param env - the environment-like record to inspect
 * @param requiredKeys - the secret variable names that must be present
 * @returns the validation result with `ok` and the `missing` keys
 */
export function validateRequiredSecrets(
  env: EnvRecord,
  requiredKeys: readonly string[] = REQUIRED_SERVER_SECRETS
): SecretValidationResult {
  const missing: string[] = [];
  for (const key of requiredKeys) {
    // Read each required key as an OWN property only. Reading `env[key]`
    // directly would resolve inherited Object.prototype members (e.g.
    // `__proto__`, `constructor`, `toString`) and misreport a present,
    // non-empty own value as missing. Confirm own-property presence first,
    // then read the value safely.
    const value = Object.prototype.hasOwnProperty.call(env, key)
      ? env[key]
      : undefined;
    if (isMissing(value)) {
      missing.push(key);
    }
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Assert that every required secret variable is present and non-empty,
 * throwing an error that names the missing variable(s) when validation fails.
 *
 * Intended to run at server module load so the application terminates startup
 * (and serves no request) when a required secret is absent or empty.
 *
 * @param env - the environment-like record to inspect (defaults to `process.env`)
 * @param requiredKeys - the secret variable names that must be present
 * @throws Error naming the genuinely missing/empty variable(s)
 */
export function assertRequiredSecrets(
  env: EnvRecord = process.env,
  requiredKeys: readonly string[] = REQUIRED_SERVER_SECRETS
): void {
  const { ok, missing } = validateRequiredSecrets(env, requiredKeys);
  if (!ok) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Set these before starting the server; no fallback value is permitted.'
    );
  }
}
