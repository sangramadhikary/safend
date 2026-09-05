/**
 * HMAC-SHA256 utilities for attendance code signing.
 *
 * The server signs each attendance code with a secret key. The scanner sends
 * the raw code to the server for verification — the client never holds the key.
 *
 * Code format: safend-attendance:v2:{postId}:{timestamp}:{signature}
 *
 * - postId: UUID of the operational post
 * - timestamp: Unix seconds when the code was generated
 * - signature: first 16 chars of HMAC-SHA256(secret, "postId:timestamp")
 *
 * The signature is truncated to 16 hex chars (64 bits) to keep the QR data
 * compact while maintaining collision resistance far beyond brute-force for
 * the time-bounded window.
 */

import crypto from 'crypto';

/**
 * Resolve the signing secret, failing CLOSED if none is configured.
 *
 * Previously this fell back to a hardcoded literal ('fallback-secret-change-me')
 * when no env secret was set. That literal is public (it lives in source), so
 * any deployment that reached the fallback would sign QR codes with a known
 * key — letting an attacker forge valid attendance codes. Rather than sign with
 * a guessable secret, we throw: an unconfigured signing key is an operational
 * error, not something to paper over with a constant.
 *
 * Resolved lazily (not at module load) so importing this module never throws;
 * only actual signing/verification requires the secret to be present.
 */
function getHmacSecret(): string {
  const secret = process.env.ATTENDANCE_QR_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error(
      'Attendance QR signing secret is not configured. Set ATTENDANCE_QR_SECRET ' +
        '(preferred) or SUPABASE_SERVICE_ROLE_KEY. Refusing to sign with a default secret.',
    );
  }
  return secret;
}

/** Sign a post attendance code. Server-only. Throws if no secret is configured. */
export function signAttendanceCode(postId: string, timestamp: number): string {
  const payload = `${postId}:${timestamp}`;
  const hmac = crypto.createHmac('sha256', getHmacSecret()).update(payload).digest('hex');
  return hmac.slice(0, 16); // 64-bit truncated signature
}

/** Verify a signed attendance code. Server-only. Returns the postId if valid. */
export function verifyAttendanceCode(
  code: string,
): { valid: true; postId: string } | { valid: false; reason: string } {
  // v2 format: safend-attendance:v2:{postId}:{timestamp}:{signature}
  const parts = code.split(':');
  if (parts.length !== 5) {
    return { valid: false, reason: 'invalid_format' };
  }

  const [scheme, version, postId, timestampStr, signature] = parts;

  if (scheme !== 'safend-attendance' || version !== 'v2') {
    return { valid: false, reason: 'invalid_scheme' };
  }

  const timestamp = parseInt(timestampStr, 10);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return { valid: false, reason: 'invalid_timestamp' };
  }

  // Expiry: codes expire on the 7th of the following month from generation.
  const generatedAt = new Date(timestamp * 1000);
  const expiryDate = new Date(generatedAt.getFullYear(), generatedAt.getMonth() + 1, 7, 23, 59, 59);
  if (new Date() > expiryDate) {
    return { valid: false, reason: 'expired' };
  }

  // Verify HMAC. If no signing secret is configured, signAttendanceCode throws;
  // treat that as a rejection (fail closed) rather than crashing the request —
  // a misconfigured server must never accept an unverifiable code.
  let expectedSig: string;
  try {
    expectedSig = signAttendanceCode(postId, timestamp);
  } catch {
    return { valid: false, reason: 'signing_unavailable' };
  }
  if (signature !== expectedSig) {
    return { valid: false, reason: 'invalid_signature' };
  }

  // Validate postId is a UUID
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(postId)) {
    return { valid: false, reason: 'invalid_post_id' };
  }

  return { valid: true, postId };
}

/** Generate a complete signed attendance code string. Server-only. */
export function generateSignedAttendanceCode(postId: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signAttendanceCode(postId, timestamp);
  return `safend-attendance:v2:${postId}:${timestamp}:${signature}`;
}
