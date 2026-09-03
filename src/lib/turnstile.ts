/**
 * Server-side Cloudflare Turnstile token verification.
 *
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// Trim to guard against trailing whitespace/newlines in the env var value,
// which otherwise causes Cloudflare's siteverify to reject the secret.
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY?.trim();

export interface TurnstileVerifyResult {
  success: boolean;
  /** Error codes returned by Cloudflare (empty on success). */
  errorCodes: string[];
}

/**
 * Verify a Turnstile response token with Cloudflare's siteverify endpoint.
 * Returns { success: true } if the token is valid.
 */
export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string
): Promise<TurnstileVerifyResult> {
  if (!TURNSTILE_SECRET_KEY) {
    console.error('[turnstile] TURNSTILE_SECRET_KEY is not set — rejecting by default.');
    return { success: false, errorCodes: ['missing-secret-key'] };
  }

  try {
    const body: Record<string, string> = {
      secret: TURNSTILE_SECRET_KEY,
      response: token,
    };
    if (remoteIp) body.remoteip = remoteIp;

    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error('[turnstile] Verification endpoint returned', res.status);
      return { success: false, errorCodes: ['endpoint-error'] };
    }

    const data = await res.json();
    return {
      success: !!data.success,
      errorCodes: data['error-codes'] || [],
    };
  } catch (err: any) {
    console.error('[turnstile] Verification failed:', err?.message ?? err);
    return { success: false, errorCodes: ['network-error'] };
  }
}
