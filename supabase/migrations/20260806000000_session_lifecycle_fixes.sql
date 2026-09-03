-- ============================================================
-- Session lifecycle fixes
--
-- Fixes three defects in the multi-device session limit:
--
-- 1. STALE ROWS SURVIVED LOGOUT.
--    No logout path ever removed the `user_sessions` row, so every
--    login/logout cycle left a permanent ghost row behind. After two
--    cycles the user hit the device limit against their own dead
--    sessions. Fixes: `release_session` (explicit logout) and
--    `prune_stale_sessions` (crash / tab-close safety net driven by the
--    60s client heartbeat).
--
-- 2. ROLE LIMIT WAS IGNORED SERVER-SIDE.
--    `claim_session` hardcoded max = 2, but the client enforces 1 for
--    supervisor / employee_portal / client roles. For those roles the
--    login screen demanded confirmation and then evicted nothing,
--    leaving 2 rows for a 1-device role — i.e. the other device was
--    never actually signed out. The cap is now a parameter.
--
-- 3. EVICTION WAS UNDETECTABLE IN REAL TIME.
--    The evicted device only noticed via 30s polling. Enabling replica
--    identity + realtime on `user_sessions` lets the evicted device see
--    its own row disappear and sign out immediately.
-- ============================================================

-- Supports the prune / "oldest first" scans below.
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_last_active
  ON public.user_sessions(user_id, last_active);

-- ── RPC: prune_stale_sessions ────────────────────────────────────────────────
-- Deletes sessions whose heartbeat stopped. The client heartbeats every 60s
-- while a tab is open, so anything idle beyond the threshold belongs to a
-- closed tab, a crashed browser, or a machine that went to sleep.
--
-- The default (30 min) is deliberately generous: it matches the ERP
-- inactivity timeout, so a session pruned here would have been force-logged
-- out by SessionGuard anyway.
CREATE OR REPLACE FUNCTION public.prune_stale_sessions(
  p_user_id UUID,
  p_max_idle_minutes INT DEFAULT 30
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.user_sessions
  WHERE user_id = p_user_id
    AND last_active IS NOT NULL
    AND last_active < now() - make_interval(mins => GREATEST(p_max_idle_minutes, 1));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ── RPC: release_session ─────────────────────────────────────────────────────
-- Called on explicit logout to give the device slot back. Must run BEFORE
-- supabase.auth.signOut(), while the caller still holds a valid JWT.
CREATE OR REPLACE FUNCTION public.release_session(
  p_user_id UUID,
  p_session_token TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  IF p_session_token IS NULL OR p_session_token = '' THEN
    RETURN false;
  END IF;

  DELETE FROM public.user_sessions
  WHERE user_id = p_user_id AND session_token = p_session_token;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

-- ── RPC: claim_session (role-aware cap) ──────────────────────────────────────
-- Dropped rather than replaced: the signature gains p_max_sessions, and
-- leaving the 6-arg version in place would create an ambiguous overload
-- against the new defaulted parameter.
DROP FUNCTION IF EXISTS public.claim_session(UUID, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE FUNCTION public.claim_session(
  p_user_id UUID,
  p_session_token TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_device_info TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_max_sessions INT DEFAULT 2
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_sessions INT := GREATEST(COALESCE(p_max_sessions, 2), 1);
  v_current_count INT;
BEGIN
  -- Drop ghost rows first so a dead session never costs the user a slot.
  PERFORM public.prune_stale_sessions(p_user_id);

  SELECT COUNT(*) INTO v_current_count
  FROM public.user_sessions
  WHERE user_id = p_user_id;

  -- At or above the cap: evict the least-recently-active session(s) to make
  -- room for this login. Deleting the row is what signs the other device out.
  IF v_current_count >= v_max_sessions THEN
    DELETE FROM public.user_sessions
    WHERE id IN (
      SELECT id FROM public.user_sessions
      WHERE user_id = p_user_id
      ORDER BY last_active ASC NULLS FIRST
      LIMIT (v_current_count - v_max_sessions + 1)
    );
  END IF;

  UPDATE public.user_sessions
  SET is_current = false
  WHERE user_id = p_user_id;

  INSERT INTO public.user_sessions
    (user_id, session_token, ip_address, user_agent, device_info, location, is_current, last_active)
  VALUES
    (p_user_id, p_session_token, p_ip_address, p_user_agent, p_device_info, p_location, true, now());
END;
$$;

-- Backward-compat alias. The 6-arg call resolves via p_max_sessions' default.
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
  PERFORM public.claim_session(
    p_user_id, p_session_token, p_ip_address, p_user_agent, p_device_info, p_location
  );
END;
$$;

-- ── Counting / listing now ignores ghost rows ────────────────────────────────
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
  PERFORM public.prune_stale_sessions(p_user_id);

  SELECT COUNT(*) INTO v_count
  FROM public.user_sessions
  WHERE user_id = p_user_id;
  RETURN v_count;
END;
$$;

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
  PERFORM public.prune_stale_sessions(p_user_id);

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

-- ── Realtime: let an evicted device notice instantly ─────────────────────────
-- DELETE payloads only carry the replica identity. Default (primary key) would
-- give the evicted client just an id it never stored, so it could not tell
-- whether the deleted row was its own. FULL includes session_token.
-- user_sessions holds at most a couple of rows per user, so the extra WAL
-- volume is negligible.
ALTER TABLE public.user_sessions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'user_sessions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_sessions;
    END IF;
  END IF;
END;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.prune_stale_sessions(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_session(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_session(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_single_session(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_active_sessions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_sessions(UUID) TO authenticated;
