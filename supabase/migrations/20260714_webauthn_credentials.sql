-- ═══════════════════════════════════════════════════════════════════════════════
-- WebAuthn Credentials Table
-- ═══════════════════════════════════════════════════════════════════════════════
-- Stores biometric/passkey credentials for passwordless login.
-- Each row represents one device's credential (fingerprint/face/PIN).
-- A user can have multiple credentials (e.g. phone + tablet).
--
-- Run this in the Supabase SQL Editor or via `supabase db push`.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  transports TEXT[] DEFAULT ARRAY['internal']::TEXT[],
  device_name TEXT DEFAULT 'Mobile Device',
  sign_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,

  -- Prevent duplicate credentials
  CONSTRAINT unique_credential UNIQUE (credential_id)
);

-- Index for fast lookups by user_id (registration check, list credentials)
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_id 
  ON public.webauthn_credentials(user_id);

-- Index for fast lookups by credential_id (authentication flow)
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_credential_id 
  ON public.webauthn_credentials(credential_id);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- Users can read their own credentials (for listing/managing)
CREATE POLICY "Users can view own credentials"
  ON public.webauthn_credentials
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can delete their own credentials (to remove a device)
CREATE POLICY "Users can delete own credentials"
  ON public.webauthn_credentials
  FOR DELETE
  USING (auth.uid() = user_id);

-- Only service role can insert/update (server-side API routes)
-- No INSERT/UPDATE policy for authenticated users — the API routes
-- use the service role key to manage credentials securely.

-- Grant access to authenticated users (RLS handles row filtering)
GRANT SELECT, DELETE ON public.webauthn_credentials TO authenticated;

-- Service role has full access (used by API routes)
GRANT ALL ON public.webauthn_credentials TO service_role;

COMMENT ON TABLE public.webauthn_credentials IS 
  'Stores WebAuthn/passkey credentials for biometric (fingerprint/face) login. One row per device per user.';
