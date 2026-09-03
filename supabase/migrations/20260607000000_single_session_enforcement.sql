-- ============================================================
-- Single-session enforcement
-- Adds a per-session token + RPCs used by the client SessionGuard.
-- When a new login occurs, all previous sessions for that user are
-- removed, so only one active session exists at a time.
--
-- This migration is idempotent (IF NOT EXISTS / CREATE OR REPLACE) and
-- non-destructive to schema. It additionally GRANTs EXECUTE to the
-- `authenticated` role and pins a safe search_path — without the grant the
-- client RPC calls fail, which
-- caused false "logged in from another device" sign-outs.
-- ============================================================

-- Per-session token so the client can prove it owns the active session.
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS session_token TEXT;

-- Fast lookups by token.
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON public.user_sessions(session_token);

-- ── RPC: claim_single_session ─────────────────────────────────────────────────
-- Called at login. Deletes all previous sessions for the user, then inserts
-- the new active session.
CREATE OR REPLACE FUNCTION public.claim_single_session(
  p_user_id UUID,
  p_session_token TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_device_info TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Single-session policy: remove all existing sessions for this user.
  DELETE FROM public.user_sessions WHERE user_id = p_user_id;

  INSERT INTO public.user_sessions
    (user_id, session_token, ip_address, user_agent, device_info, location, is_current, last_active)
  VALUES
    (p_user_id, p_session_token, p_ip_address, p_user_agent, p_device_info, p_location, true, now());
END;
$$;

-- ── RPC: validate_session ─────────────────────────────────────────────────────
-- Returns true if the token matches the user's active session.
CREATE OR REPLACE FUNCTION public.validate_session(
  p_user_id UUID,
  p_session_token TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.user_sessions
    WHERE user_id = p_user_id AND session_token = p_session_token
  ) INTO v_exists;
  RETURN v_exists;
END;
$$;

-- ── RPC: heartbeat_session ────────────────────────────────────────────────────
-- Keeps the active session alive by updating last_active.
CREATE OR REPLACE FUNCTION public.heartbeat_session(
  p_user_id UUID,
  p_session_token TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_sessions
  SET last_active = now()
  WHERE user_id = p_user_id AND session_token = p_session_token;
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
-- The client calls these RPCs as the `authenticated` role. Without EXECUTE,
-- the calls error and the SessionGuard cannot validate the active session.
GRANT EXECUTE ON FUNCTION public.claim_single_session(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_session(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_session(UUID, TEXT) TO authenticated;
