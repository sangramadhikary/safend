/**
 * Submission retry policy for the Quick Attendance Scanner (pure, dependency-free).
 *
 * This module encodes the *decision logic* for the client-side submission
 * queue. It owns no timers, no network calls, and no UI: given the outcome of
 * a submission attempt and how many retries have already been performed, it
 * returns the next action the Scanner should take.
 *
 * The policy is:
 *   - Retry ONLY on network / timeout / no-connectivity conditions (R13.1).
 *   - Perform at most 3 retries, with each inter-attempt delay in the
 *     inclusive range 2-10 seconds (R13.1).
 *   - When all retryable attempts are exhausted, conclude with the fixed
 *     manual-fallback outcome — never a pending confirmation (R13.4).
 *   - Perform ZERO retries when the service returns a rejection; surface the
 *     rejection reason instead (R13.5).
 *
 * Requirements: 13.1, 13.4, 13.5
 */

/** Maximum number of retry attempts after the initial submission (R13.1). */
export const MAX_RETRIES = 3;

/** Minimum inter-attempt delay, in milliseconds (R13.1). */
export const MIN_RETRY_DELAY_MS = 2_000;

/** Maximum inter-attempt delay, in milliseconds (R13.1). */
export const MAX_RETRY_DELAY_MS = 10_000;

/**
 * The exact message shown to the field employee once all retries are
 * exhausted. This is the only message displayed in that case (R13.4).
 */
export const MANUAL_FALLBACK_MESSAGE =
  'Contact your Supervisor / Area Officer to mark your attendance manually.';

/**
 * The classified outcome of a single submission attempt.
 * - `success`   — the service accepted the submission (record is pending).
 * - `network`   — a retryable transport condition: no response within the
 *                 timeout, or the device reports no network connectivity.
 * - `rejection` — the service returned a terminal rejection (deployment,
 *                 geofence, duplicate, validation, or rate-limit). Not retried.
 */
export type AttemptOutcome =
  | { kind: 'success' }
  | { kind: 'network' }
  | { kind: 'rejection'; reason: string };

/**
 * The next action the Scanner should take after an attempt.
 * - `confirm`         — show the pending-approval confirmation (R13.3).
 * - `retry`           — schedule retry number `retryNumber` after `delayMs`.
 * - `manual_fallback` — retries exhausted; show `MANUAL_FALLBACK_MESSAGE` (R13.4).
 * - `reject`          — surface the service's rejection `reason`; no retry (R13.5).
 */
export type RetryDecision =
  | { action: 'confirm' }
  | { action: 'retry'; retryNumber: number; delayMs: number }
  | { action: 'manual_fallback'; message: string }
  | { action: 'reject'; reason: string };

/** Whether an outcome is a retryable (network/timeout) condition. */
export function isRetryable(outcome: AttemptOutcome): boolean {
  return outcome.kind === 'network';
}

/**
 * Compute the delay before the given retry, guaranteed to lie in the inclusive
 * range [MIN_RETRY_DELAY_MS, MAX_RETRY_DELAY_MS] (R13.1).
 *
 * Uses capped exponential backoff with full jitter: the base grows 2s -> 4s ->
 * 8s (capped at 10s) and jitter is applied between the minimum and that base,
 * so the returned value never leaves the allowed window regardless of `rng`.
 *
 * @param retryNumber 1-based index of the retry being scheduled (1, 2, or 3).
 * @param rng         Source of randomness in [0, 1); injectable for testing.
 */
export function computeRetryDelayMs(
  retryNumber: number,
  rng: () => number = Math.random,
): number {
  const step = Math.max(1, Math.floor(retryNumber));
  const base = Math.min(
    MAX_RETRY_DELAY_MS,
    MIN_RETRY_DELAY_MS * 2 ** (step - 1),
  );

  // Full jitter between the minimum and the (capped) exponential base. Because
  // both endpoints already lie within [MIN, MAX], the sampled delay does too.
  const raw = rng();
  const sample = Number.isFinite(raw) ? clamp(raw, 0, 1) : 0;
  const delay = MIN_RETRY_DELAY_MS + sample * (base - MIN_RETRY_DELAY_MS);

  return clamp(Math.round(delay), MIN_RETRY_DELAY_MS, MAX_RETRY_DELAY_MS);
}

/**
 * Decide the next action given an attempt outcome and the number of retries
 * already performed (0 immediately after the initial submission).
 *
 * @param outcome      classified outcome of the attempt just made.
 * @param retriesUsed  retries already performed before this outcome (0..MAX_RETRIES).
 * @param rng          randomness source forwarded to the delay computation.
 */
export function decideRetry(
  outcome: AttemptOutcome,
  retriesUsed: number,
  rng: () => number = Math.random,
): RetryDecision {
  if (outcome.kind === 'success') {
    return { action: 'confirm' };
  }

  // Service rejections are terminal: zero retries, surface the reason (R13.5).
  if (outcome.kind === 'rejection') {
    return { action: 'reject', reason: outcome.reason };
  }

  // Network / timeout condition: retry while the budget allows (R13.1),
  // otherwise conclude with the manual fallback (R13.4).
  const used = Math.max(0, Math.floor(retriesUsed));
  if (used < MAX_RETRIES) {
    const retryNumber = used + 1;
    return {
      action: 'retry',
      retryNumber,
      delayMs: computeRetryDelayMs(retryNumber, rng),
    };
  }

  return { action: 'manual_fallback', message: MANUAL_FALLBACK_MESSAGE };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
