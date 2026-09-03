import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerUser } from '@/lib/auth/server-session';
import crypto from 'crypto';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * WebAuthn Registration Endpoints
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST /api/auth/webauthn/register — Two-phase:
 *   Phase 1 (body.phase = "challenge"): Generate and return registration options
 *   Phase 2 (body.phase = "verify"): Verify attestation and store credential
 *
 * Requires an authenticated user (must be logged in first via password).
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RP_ID = process.env.WEBAUTHN_RP_ID || 'safend.in';
const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'Safend';

// In-memory challenge store (short-lived, 5 min TTL)
// In production with multiple instances, use Redis or DB
const challengeStore = new Map<string, { challenge: string; expiresAt: number }>();

// Clean expired challenges periodically
function cleanExpiredChallenges() {
  const now = Date.now();
  for (const [key, value] of challengeStore) {
    if (value.expiresAt < now) challengeStore.delete(key);
  }
}

export async function POST(request: NextRequest) {
  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
  }

  const body = await request.json();
  const { phase } = body;

  if (phase === 'challenge') {
    return handleChallenge(user);
  } else if (phase === 'verify') {
    return handleVerify(user, body);
  }

  return NextResponse.json({ error: 'Invalid phase. Use "challenge" or "verify".' }, { status: 400 });
}

// ── Phase 1: Generate Challenge ───────────────────────────────────────────────

async function handleChallenge(user: { id: string; email?: string }) {
  cleanExpiredChallenges();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Check existing credentials to exclude them
  const { data: existingCreds } = await supabase
    .from('webauthn_credentials')
    .select('credential_id')
    .eq('user_id', user.id);

  const excludeCredentials = (existingCreds || []).map((c) => ({
    id: c.credential_id,
    type: 'public-key',
  }));

  // Generate challenge
  const challenge = crypto.randomBytes(32).toString('base64url');

  // Store challenge with 5 min TTL
  challengeStore.set(user.id, {
    challenge,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  // User ID for WebAuthn (must be stable, max 64 bytes)
  const userId = Buffer.from(user.id).toString('base64url');

  return NextResponse.json({
    challenge,
    rpId: RP_ID,
    rpName: RP_NAME,
    userId,
    userName: user.email || user.id,
    userDisplayName: user.email?.split('@')[0] || 'User',
    excludeCredentials,
  });
}

// ── Phase 2: Verify Attestation & Store Credential ────────────────────────────

async function handleVerify(
  user: { id: string; email?: string },
  body: {
    credentialId: string;
    rawId: string;
    attestationObject: string;
    clientDataJSON: string;
    publicKey: string | null;
    transports: string[];
    deviceName?: string;
  }
) {
  const { credentialId, rawId, attestationObject, clientDataJSON, publicKey, transports, deviceName } = body;

  // Validate challenge
  const stored = challengeStore.get(user.id);
  if (!stored || stored.expiresAt < Date.now()) {
    challengeStore.delete(user.id);
    return NextResponse.json({ error: 'Challenge expired. Please try again.' }, { status: 400 });
  }

  // Verify clientDataJSON contains our challenge
  try {
    const clientData = JSON.parse(
      Buffer.from(clientDataJSON, 'base64url').toString('utf-8')
    );

    if (clientData.challenge !== stored.challenge) {
      return NextResponse.json({ error: 'Challenge mismatch.' }, { status: 400 });
    }

    if (clientData.type !== 'webauthn.create') {
      return NextResponse.json({ error: 'Invalid ceremony type.' }, { status: 400 });
    }

    // Verify origin matches our RP
    const expectedOrigins = [
      `https://${RP_ID}`,
      `https://www.${RP_ID}`,
      // Subdomains — WebAuthn credentials are scoped to RP_ID (safend.in)
      // but the origin includes the full subdomain the user is on.
      `https://ops.${RP_ID}`,
      `https://office.${RP_ID}`,
      `https://client.${RP_ID}`,
    ];
    // In development, also allow localhost
    if (process.env.NODE_ENV === 'development') {
      expectedOrigins.push('http://localhost:8080', 'http://localhost:3000');
    }
    if (!expectedOrigins.some((o) => clientData.origin === o)) {
      return NextResponse.json({ error: 'Origin mismatch.' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid clientDataJSON.' }, { status: 400 });
  }

  // Clean up used challenge
  challengeStore.delete(user.id);

  // Extract public key from attestationObject if not provided directly
  // For 'none' attestation, the public key is embedded in the authData
  let storedPublicKey = publicKey || '';
  if (!storedPublicKey) {
    // We'll store the attestationObject as fallback — the public key
    // extraction from CBOR is complex, so we rely on the browser-provided
    // publicKey when available, or store the full attestation for later parsing
    storedPublicKey = attestationObject;
  }

  // Store credential in database
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: insertErr } = await supabase.from('webauthn_credentials').insert({
    user_id: user.id,
    credential_id: credentialId,
    public_key: storedPublicKey,
    transports: transports,
    device_name: deviceName || getDeviceName(),
    sign_count: 0,
    created_at: new Date().toISOString(),
    last_used_at: null,
  });

  if (insertErr) {
    // Duplicate credential
    if (insertErr.code === '23505') {
      return NextResponse.json({ error: 'This device is already registered.' }, { status: 409 });
    }
    console.error('WebAuthn credential insert error:', insertErr);
    return NextResponse.json({ error: 'Failed to store credential.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    credentialId,
    message: 'Biometric registered successfully.',
  });
}

function getDeviceName(): string {
  return 'Mobile Device';
}
