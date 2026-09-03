/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * WebAuthn Client Utilities
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Handles browser-side WebAuthn (passkey/biometric) operations:
 * - Feature detection
 * - Credential registration (create)
 * - Credential authentication (get)
 *
 * Uses the Web Authentication API (navigator.credentials) which supports
 * fingerprint, face unlock, and device PIN on mobile devices.
 *
 * Security: The private key never leaves the device. Only a signed assertion
 * (cryptographic proof) is sent to the server for verification.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a base64url string to ArrayBuffer */
function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Convert an ArrayBuffer to base64url string */
function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Feature Detection ─────────────────────────────────────────────────────────

/** Check if WebAuthn is supported by the browser */
export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.PublicKeyCredential &&
    typeof window.PublicKeyCredential === 'function'
  );
}

/** Check if platform authenticator (fingerprint/face) is available */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Check if user has a registered credential stored locally */
export function hasStoredCredential(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('webauthn_credential_id');
}

/** Get the stored user email for biometric login */
export function getStoredBiometricEmail(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('webauthn_user_email');
}

// ── Registration (Credential Creation) ────────────────────────────────────────

export interface RegistrationOptions {
  challenge: string; // base64url
  rpId: string;
  rpName: string;
  userId: string; // base64url
  userName: string;
  userDisplayName: string;
  excludeCredentials?: Array<{ id: string; type: string }>;
}

export interface RegistrationResult {
  credentialId: string; // base64url
  rawId: string; // base64url
  attestationObject: string; // base64url
  clientDataJSON: string; // base64url
  publicKey: string | null; // base64url (if available)
  transports: string[];
}

/**
 * Register a new biometric credential (fingerprint/face).
 * Called after the user is already authenticated via password.
 */
export async function registerCredential(
  options: RegistrationOptions
): Promise<RegistrationResult> {
  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    challenge: base64urlToBuffer(options.challenge),
    rp: {
      id: options.rpId,
      name: options.rpName,
    },
    user: {
      id: base64urlToBuffer(options.userId),
      name: options.userName,
      displayName: options.userDisplayName,
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },   // ES256
      { alg: -257, type: 'public-key' }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform', // Force device biometric (not USB keys)
      userVerification: 'required',        // Must verify with fingerprint/face/PIN
      residentKey: 'preferred',            // Discoverable credential when possible
      requireResidentKey: false,
    },
    timeout: 60000,
    attestation: 'none', // We don't need attestation for our use case
    excludeCredentials: (options.excludeCredentials || []).map((cred) => ({
      id: base64urlToBuffer(cred.id),
      type: 'public-key' as const,
      transports: ['internal'] as AuthenticatorTransport[],
    })),
  };

  const credential = (await navigator.credentials.create({
    publicKey: publicKeyOptions,
  })) as PublicKeyCredential;

  if (!credential) {
    throw new Error('Credential creation was cancelled.');
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  const transports = response.getTransports?.() || ['internal'];

  // Try to get the public key (available in newer browsers)
  let publicKey: string | null = null;
  try {
    const pubKeyBuffer = response.getPublicKey?.();
    if (pubKeyBuffer) {
      publicKey = bufferToBase64url(pubKeyBuffer);
    }
  } catch { /* older browsers don't support getPublicKey */ }

  return {
    credentialId: bufferToBase64url(credential.rawId),
    rawId: bufferToBase64url(credential.rawId),
    attestationObject: bufferToBase64url(response.attestationObject),
    clientDataJSON: bufferToBase64url(response.clientDataJSON),
    publicKey,
    transports,
  };
}

// ── Authentication (Assertion) ────────────────────────────────────────────────

export interface AuthenticationOptions {
  challenge: string; // base64url
  rpId: string;
  allowCredentials?: Array<{ id: string; type: string; transports?: string[] }>;
  timeout?: number;
}

export interface AuthenticationResult {
  credentialId: string; // base64url
  rawId: string; // base64url
  authenticatorData: string; // base64url
  clientDataJSON: string; // base64url
  signature: string; // base64url
  userHandle: string | null; // base64url
}

/**
 * Authenticate using a stored biometric credential.
 * Triggers the device's fingerprint/face scanner.
 */
export async function authenticateCredential(
  options: AuthenticationOptions
): Promise<AuthenticationResult> {
  const publicKeyOptions: PublicKeyCredentialRequestOptions = {
    challenge: base64urlToBuffer(options.challenge),
    rpId: options.rpId,
    userVerification: 'required',
    timeout: options.timeout || 60000,
    allowCredentials: (options.allowCredentials || []).map((cred) => ({
      id: base64urlToBuffer(cred.id),
      type: 'public-key' as const,
      transports: (cred.transports || ['internal']) as AuthenticatorTransport[],
    })),
  };

  const credential = (await navigator.credentials.get({
    publicKey: publicKeyOptions,
  })) as PublicKeyCredential;

  if (!credential) {
    throw new Error('Authentication was cancelled.');
  }

  const response = credential.response as AuthenticatorAssertionResponse;

  return {
    credentialId: bufferToBase64url(credential.rawId),
    rawId: bufferToBase64url(credential.rawId),
    authenticatorData: bufferToBase64url(response.authenticatorData),
    clientDataJSON: bufferToBase64url(response.clientDataJSON),
    signature: bufferToBase64url(response.signature),
    userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : null,
  };
}

// ── Local Storage Management ──────────────────────────────────────────────────

/** Store credential info locally after successful registration */
export function storeCredentialLocally(credentialId: string, email: string) {
  localStorage.setItem('webauthn_credential_id', credentialId);
  localStorage.setItem('webauthn_user_email', email);
}

/** Clear stored credential info (e.g., when user removes biometric) */
export function clearStoredCredential() {
  localStorage.removeItem('webauthn_credential_id');
  localStorage.removeItem('webauthn_user_email');
}
