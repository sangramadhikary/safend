-- ============================================================
-- Multi-session enforcement (max 2 devices)
-- Upgrades the single-session policy to allow up to 2 concurrent sessions.
-- When a 3rd login occurs, the OLDEST session is removed.
--
-- Replaces: claim_single_session → claim_session (keeps backward compat alias)
-- Updates: validate_session — unchanged logic (still checks token exists)
-- New: count_active_sessions — returns current session count for a user
-- New: get_user_sessions — returns all active sessions for a user
-- ============================================================

-- ── Config: max sessions per user ─────────────────────────────────────────────
-- Adjust this value to change the device limit globally.
-- We'll use it in the claim function below.

-- ── RPC: claim_session (max 2 devices) ───────────────────────────────────────
-- Called at login. If user already has 2 sessions, removes the oldest one.
-- Always inserts the new session.
CREATE OR REPLACE FUNCTION public.claim_session(
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
DECLARE
  v_max_sessions INT := 2;
  v_current_count INT;
BEGIN
  -- Count existing sessions for this user
  SELECT COUNT(*) INTO v_current_count
  FROM public.user_sessions
  WHERE user_id = p_user_id;

  -- If at or above limit, remove the oldest session(s) to make room for the new one
  IF v_current_count >= v_max_sessions THEN
    DELETE FROM public.user_sessions
    WHERE id IN (
      SELECT id FROM public.user_sessions
      WHERE user_id = p_user_id
      ORDER BY last_active ASC
      LIMIT (v_current_count - v_max_sessions + 1)
    );
  END IF;

  -- Mark all remaining sessions as not current
  UPDATE public.user_sessions
  SET is_current = false
  WHERE user_id = p_user_id;

  -- Insert the new session as current
  INSERT INTO public.user_sessions
    (user_id, session_token, ip_address, user_agent, device_info, location, is_current, last_active)
  VALUES
    (p_user_id, p_session_token, p_ip_address, p_user_agent, p_device_info, p_location, true, now());
END;
$$;

-- ── Backward-compat: keep claim_single_session as an alias ────────────────────
-- Existing code may still call this. It now delegates to claim_session.
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
  PERFORM public.claim_session(p_user_id, p_session_token, p_ip_address, p_user_agent, p_device_info, p_location);
END;
$$;

-- ── RPC: count_active_sessions ────────────────────────────────────────────────
-- Returns the number of active sessions a user currently has.
CREATE OR REPLACE FUNCTION public.count_active_sessions(
  p_user_id UUID
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.user_sessions
  WHERE user_id = p_user_id;
  RETURN v_count;
END;
$$;

-- ── RPC: get_user_sessions ────────────────────────────────────────────────────
-- Returns all active sessions for a user (for the "Active Sessions" UI).
CREATE OR REPLACE FUNCTION public.get_user_sessions(
  p_user_id UUID
) RETURNS TABLE(
  id UUID,
  session_token TEXT,
  device_info TEXT,
  ip_address TEXT,
  location TEXT,
  is_current BOOLEAN,
  last_active TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    us.id,
    us.session_token,
    us.device_info,
    us.ip_address,
    us.location,
    us.is_current,
    us.last_active,
    us.created_at
  FROM public.user_sessions us
  WHERE us.user_id = p_user_id
  ORDER BY us.last_active DESC;
END;
$$;

-- ── RPC: revoke_session ───────────────────────────────────────────────────────
-- Removes a specific session by ID (for "Log out this device" in profile).
CREATE OR REPLACE FUNCTION public.revoke_session(
  p_user_id UUID,
  p_session_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.user_sessions
  WHERE id = p_session_id AND user_id = p_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

-- ── RPC: revoke_all_other_sessions ────────────────────────────────────────────
-- Removes all sessions except the current one (for "Log out all other devices").
CREATE OR REPLACE FUNCTION public.revoke_all_other_sessions(
  p_user_id UUID,
  p_current_session_token TEXT
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.user_sessions
  WHERE user_id = p_user_id AND session_token != p_current_session_token;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.claim_session(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_single_session(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_active_sessions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_sessions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_session(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_all_other_sessions(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_session(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_session(UUID, TEXT) TO authenticated;
