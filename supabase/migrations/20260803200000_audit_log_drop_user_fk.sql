-- ============================================================
-- Drop the FK constraint audit_log_user_id_fkey
-- ============================================================
-- audit_log.user_id is the Supabase Auth user UUID (from auth.users).
-- The FK referenced public.users instead, so any audit write for a user
-- whose profile row in public.users didn't exist yet would fail with:
--
--   insert or update on table "audit_log" violates foreign key constraint
--   "audit_log_user_id_fkey"
--
-- This broke audit logging for new logins, service accounts, and the
-- post-deploy window before a profile row is created.
--
-- The user_id is verified server-side from the Supabase JWT before the row
-- is written; the FK added no security value and was causing every audit
-- attempt to return a 500, routing events to the console fallback channel.

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey;
