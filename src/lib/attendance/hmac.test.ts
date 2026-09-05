import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Verifies the HMAC signing secret fails CLOSED. Previously an unconfigured
 * environment fell back to a hardcoded literal, letting anyone forge valid
 * attendance QR codes. Signing must now throw when no secret is set, and
 * verification must reject rather than accept an unverifiable code.
 *
 * Env is mutated per-test, so the module is re-imported with vi.resetModules()
 * to pick up the current process.env (the secret is resolved lazily, but the
 * import graph is reset for isolation).
 */
const REAL_SECRET = 'test-attendance-secret-abc123';

describe('attendance HMAC signing (fail closed)', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    delete process.env.ATTENDANCE_QR_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('throws when no signing secret is configured', async () => {
    const { signAttendanceCode } = await import('./hmac');
    expect(() => signAttendanceCode('post-1', 1_700_000_000)).toThrow(/secret is not configured/i);
  });

  it('does not silently use a hardcoded fallback secret', async () => {
    // With no env secret, signing must fail rather than produce a signature.
    const { signAttendanceCode } = await import('./hmac');
    let signed: string | null = null;
    try {
      signed = signAttendanceCode('post-1', 1_700_000_000);
    } catch {
      signed = null;
    }
    expect(signed).toBeNull();
  });

  it('signs deterministically when a secret is configured', async () => {
    process.env.ATTENDANCE_QR_SECRET = REAL_SECRET;
    const { signAttendanceCode } = await import('./hmac');
    const a = signAttendanceCode('post-1', 1_700_000_000);
    const b = signAttendanceCode('post-1', 1_700_000_000);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it('round-trips generate -> verify with a configured secret', async () => {
    process.env.ATTENDANCE_QR_SECRET = REAL_SECRET;
    const { generateSignedAttendanceCode, verifyAttendanceCode } = await import('./hmac');
    const postId = '11111111-2222-4333-8444-555555555555';
    const code = generateSignedAttendanceCode(postId);
    const result = verifyAttendanceCode(code);
    expect(result).toEqual({ valid: true, postId });
  });

  it('verification fails closed (does not accept) when no secret is configured', async () => {
    // Build a code with a secret, then verify in an environment with no secret.
    process.env.ATTENDANCE_QR_SECRET = REAL_SECRET;
    let code: string;
    {
      const mod = await import('./hmac');
      code = mod.generateSignedAttendanceCode('11111111-2222-4333-8444-555555555555');
    }

    vi.resetModules();
    delete process.env.ATTENDANCE_QR_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { verifyAttendanceCode } = await import('./hmac');
    const result = verifyAttendanceCode(code);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe('signing_unavailable');
    }
  });
});
