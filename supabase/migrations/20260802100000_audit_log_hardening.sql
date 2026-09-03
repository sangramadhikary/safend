-- ═══════════════════════════════════════════════════════════════════════════════
-- Activity & Audit Log — Schema Definition, Detail Expansion, and Hardening
-- Date: 2026-08-02
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- CONTEXT
-- -------
-- The `audit_log` table has been in production use since the earliest releases
-- but was NEVER defined by a migration — it exists only in the live database and
-- is referenced from application code (`src/utils/auditLog.ts`). That means:
--
--   * A fresh environment (local, preview, DR restore) has no audit table at all.
--   * The live table has no RLS policy in version control, so audit records were
--     readable by ANY authenticated user, not just administrators.
--   * The table was mutable — rows could be silently UPDATEd or DELETEd by any
--     caller that could reach it, which defeats the purpose of an audit trail.
--
-- This migration is written to be idempotent and safe against BOTH cases: a
-- fresh database (where it creates the table) and the live database (where it
-- only adds the missing columns, indexes, and policies). Every statement uses
-- IF NOT EXISTS / IF EXISTS or a DO-block guard, so it can be re-run safely.
--
-- WHAT THIS ADDS
-- --------------
-- 1. Canonical `public.audit_log` definition (created only if absent).
-- 2. ~24 new columns that raise the captured detail from "an action string" to a
--    full forensic record: field-level before/after state, the changed-field
--    list, actor roles at time of action, session/request correlation IDs,
--    resolved geolocation, parsed OS/browser/device, route + HTTP context,
--    operation duration, and a pointer to an optional UI snapshot.
-- 3. Indexes matching the query shapes the admin UI actually issues.
-- 4. Append-only RLS: administrators may SELECT, authenticated users may INSERT
--    only rows attributed to themselves, and NOBODY may UPDATE or DELETE.
--    Retention purges run through the service role, which bypasses RLS.
-- 5. A per-row SHA-256 `entry_hash` set by a BEFORE trigger, so post-hoc
--    tampering with a row's material fields is detectable.
-- 6. A private `audit-snapshots` storage bucket for UI snapshots.
-- 7. A retention purge function for the scheduled cleanup job.
--
-- VERIFIED AGAINST THE LIVE TABLE BEFORE WRITING
-- ----------------------------------------------
-- The live `public.audit_log` was inspected first, and three facts differ from
-- what the application code assumed. Each is handled below rather than papered
-- over:
--
--  1. `user_id` is UUID (nullable, no default) — not TEXT. The RLS INSERT check
--     therefore compares `user_id = auth.uid()` directly; casting `auth.uid()` to
--     text would raise a type error and block every audit write. A consequence
--     worth stating plainly: because the column is UUID, a pre-authentication
--     event (a failed login, where no user id exists yet) cannot be attributed to
--     a row here. Those events are recorded with the attempted email in
--     `details`, and the actor id of the session that observed them.
--
--  2. `old_data` and `new_data` JSONB columns ALREADY EXIST and are entirely
--     unused (0 of 1318 rows populated). The application's field-level diff is
--     therefore written into those existing columns instead of adding a parallel
--     `before_data`/`after_data` pair. Two sets of columns meaning the same thing
--     is how a schema rots.
--
--  3. RLS is already enabled, but the five live policies include
--     `auth_read_audit` (SELECT TO authenticated USING true) and
--     `Allow all audit_log` (FOR ALL USING true WITH CHECK true). Together those
--     let ANY authenticated user read the entire trail and UPDATE or DELETE any
--     row in it. All five are dropped and replaced below.
-- ═══════════════════════════════════════════════════════════════════════════════

-- pgcrypto supplies digest() for the tamper-evidence row hash.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────────────────────────
-- 1. BASE TABLE — created only when absent, so the live table is left untouched.
-- ────────────────────────────────────────────────────────────────────────────────
-- Mirrors the live table's shape exactly, so a fresh environment matches
-- production rather than diverging from it.
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz DEFAULT now(),
  user_id     uuid,
  user_email  text,
  action      text        NOT NULL,
  target      text,
  module      text,
  ip_address  text,
  user_agent  text,
  outcome     text        DEFAULT 'success',
  details     jsonb       DEFAULT '{}'::jsonb,
  table_name  text,
  record_id   text,
  -- The field-level diff. Present on the live table already; the application
  -- writes its computed diff here.
  old_data    jsonb,
  new_data    jsonb
);

-- Ensure the diff columns exist even on an older environment that predates them.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS old_data jsonb;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS new_data jsonb;

-- ────────────────────────────────────────────────────────────────────────────────
-- 2. DETAIL EXPANSION — every column added defensively.
-- ────────────────────────────────────────────────────────────────────────────────

-- Classification -------------------------------------------------------------
-- severity lets the UI surface "show me only the dangerous things" without
-- pattern-matching on free-text action strings.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info';
-- action_category groups the ~45 distinct actions into stable buckets
-- (auth, read, create, update, delete, export, permission, system).
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS action_category text;

-- Field-level change capture -------------------------------------------------
-- The single biggest detail gap: previously an "Employee Updated" row recorded
-- only the employee's name, never which field moved.
--
-- The before/after values go into the pre-existing `old_data` / `new_data`
-- columns (see the header note) rather than into a new pair. Only the changed-key
-- list is genuinely new: denormalizing it into a `text[]` is what makes
-- "who has ever modified a salary field" an indexed lookup instead of a full scan
-- over JSONB.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS changed_fields text[];

-- Entity addressing ----------------------------------------------------------
-- Supersedes the ambiguous table_name/record_id pair, which the old logger
-- filled with the module name and the target string respectively.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS entity_id   text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS entity_label text;

-- Actor context --------------------------------------------------------------
-- Roles are snapshotted at time of action. Reading them from user_roles at
-- display time would be wrong: it shows today's roles, not the privilege the
-- actor actually held when they performed the action.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS actor_roles text[];
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS actor_name  text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS branch_id   text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS branch_name text;
-- True when an admin performed the action while acting as another user.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS is_impersonated boolean NOT NULL DEFAULT false;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS impersonated_by text;

-- Correlation ----------------------------------------------------------------
-- session_id reconstructs a full "what did she do in this sitting" timeline.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS session_id     text;
-- request_id ties a UI event to the corresponding server log line.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS request_id     text;
-- correlation_id groups a multi-step operation (e.g. a payroll run that emits
-- one row per employee) so the UI can collapse it into a single tree.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS correlation_id text;

-- Request / navigation context -----------------------------------------------
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS route       text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS referrer    text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS http_method text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS status_code integer;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS duration_ms integer;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS error_message text;

-- Device & location ----------------------------------------------------------
-- /api/client-ip already computes `location` and `os` but the old logger threw
-- both away and kept only the raw IP. These columns capture them.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS location    text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS os          text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS browser     text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS device_type text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS viewport    text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS tz_offset_minutes integer;

-- UI snapshot ----------------------------------------------------------------
-- snapshot_path is a path into the PRIVATE `audit-snapshots` bucket, never a
-- public URL — reads go through a short-lived server-generated signed URL.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS snapshot_path text;
-- Structured, searchable record of what was on screen: heading text, visible
-- table row count, active tab, and redacted form field values. More useful than
-- an image for querying, and it survives CSS drift.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS ui_state jsonb;

-- Retention & integrity ------------------------------------------------------
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS retention_until timestamptz;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS entry_hash text;

-- ────────────────────────────────────────────────────────────────────────────────
-- 3. CONSTRAINTS — added via guards so a re-run does not error.
-- ────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_severity_check'
  ) THEN
    ALTER TABLE public.audit_log
      ADD CONSTRAINT audit_log_severity_check
      CHECK (severity IN ('info', 'notice', 'warning', 'critical'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_outcome_check'
  ) THEN
    ALTER TABLE public.audit_log
      ADD CONSTRAINT audit_log_outcome_check
      CHECK (outcome IN ('success', 'failure', 'denied'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_device_type_check'
  ) THEN
    ALTER TABLE public.audit_log
      ADD CONSTRAINT audit_log_device_type_check
      CHECK (device_type IS NULL OR device_type IN ('desktop', 'mobile', 'tablet', 'unknown'));
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────────
-- 4. INDEXES — one per query shape the admin UI issues.
-- ────────────────────────────────────────────────────────────────────────────────

-- Remove the three pre-existing single-column indexes that the composite indexes
-- below fully supersede. Leaving them would mean maintaining two indexes per
-- write on the hottest insert path in the application for no read benefit:
--
--   idx_audit_created (created_at)   -> superseded by audit_log_created_at_desc_idx
--                                       (Postgres scans a b-tree in either
--                                        direction, so ASC vs DESC is immaterial)
--   idx_audit_email   (user_email)   -> superseded by the (user_email, created_at)
--                                       composite, which serves the same equality
--                                       lookup via its leading column
--   idx_audit_module  (module)       -> superseded by the (module, created_at)
--                                       composite, same reasoning
DROP INDEX IF EXISTS public.idx_audit_created;
DROP INDEX IF EXISTS public.idx_audit_email;
DROP INDEX IF EXISTS public.idx_audit_module;

-- Default listing: newest first.
CREATE INDEX IF NOT EXISTS audit_log_created_at_desc_idx
  ON public.audit_log (created_at DESC);

-- Per-actor timeline ("everything Ankita did"), newest first.
CREATE INDEX IF NOT EXISTS audit_log_user_email_created_at_idx
  ON public.audit_log (user_email, created_at DESC);

-- Module filter combined with the default sort.
CREATE INDEX IF NOT EXISTS audit_log_module_created_at_idx
  ON public.audit_log (module, created_at DESC);

-- Action filter combined with the default sort.
CREATE INDEX IF NOT EXISTS audit_log_action_created_at_idx
  ON public.audit_log (action, created_at DESC);

-- Partial indexes: failures and denials are rare but are the rows an auditor
-- reaches for first, so indexing only those keeps them cheap to find.
CREATE INDEX IF NOT EXISTS audit_log_failures_idx
  ON public.audit_log (created_at DESC)
  WHERE outcome IN ('failure', 'denied');

CREATE INDEX IF NOT EXISTS audit_log_critical_idx
  ON public.audit_log (created_at DESC)
  WHERE severity = 'critical';

-- Session reconstruction.
CREATE INDEX IF NOT EXISTS audit_log_session_id_idx
  ON public.audit_log (session_id)
  WHERE session_id IS NOT NULL;

-- Multi-step operation grouping.
CREATE INDEX IF NOT EXISTS audit_log_correlation_id_idx
  ON public.audit_log (correlation_id)
  WHERE correlation_id IS NOT NULL;

-- Entity history ("every change ever made to invoice INV-042").
CREATE INDEX IF NOT EXISTS audit_log_entity_idx
  ON public.audit_log (entity_type, entity_id, created_at DESC)
  WHERE entity_type IS NOT NULL;

-- "Who touched this field" — array containment needs GIN.
CREATE INDEX IF NOT EXISTS audit_log_changed_fields_gin
  ON public.audit_log USING gin (changed_fields);

-- Arbitrary key lookups inside the free-form details payload.
CREATE INDEX IF NOT EXISTS audit_log_details_gin
  ON public.audit_log USING gin (details jsonb_path_ops);

-- Rows eligible for retention purge.
CREATE INDEX IF NOT EXISTS audit_log_retention_until_idx
  ON public.audit_log (retention_until)
  WHERE retention_until IS NOT NULL;

-- Free-text search across the operator-visible columns, so the UI search box
-- can be served by the database instead of filtering 500 client-side rows.
CREATE INDEX IF NOT EXISTS audit_log_search_gin
  ON public.audit_log USING gin (
    to_tsvector(
      'simple',
      coalesce(actor_name, '') || ' ' ||
      coalesce(user_email, '') || ' ' ||
      coalesce(action, '')     || ' ' ||
      coalesce(target, '')     || ' ' ||
      coalesce(module, '')     || ' ' ||
      coalesce(entity_label, '')
    )
  );

-- ────────────────────────────────────────────────────────────────────────────────
-- 5. TAMPER EVIDENCE — per-row SHA-256 over the material fields.
-- ────────────────────────────────────────────────────────────────────────────────
-- A per-row hash (rather than a chained hash) is used deliberately: a hash chain
-- requires a serialized read of the preceding row, which under concurrent
-- inserts either races or forces a table-level lock on the hottest write path in
-- the system. A per-row digest still detects after-the-fact edits to any
-- material field, which is the realistic threat here, without that cost.
CREATE OR REPLACE FUNCTION public.set_audit_log_entry_hash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Every value is cast to text BEFORE coalesce. `user_id` is a uuid, and
  -- `coalesce(uuid, '')` makes Postgres try to parse '' as a uuid, which raises
  -- "invalid input syntax for type uuid" and — because this is a BEFORE INSERT
  -- trigger — would reject every single audit write.
  NEW.entry_hash := encode(
    digest(
      coalesce(NEW.user_id::text, '')             || '|' ||
      coalesce(NEW.user_email, '')               || '|' ||
      coalesce(NEW.action, '')                   || '|' ||
      coalesce(NEW.target, '')                   || '|' ||
      coalesce(NEW.module, '')                   || '|' ||
      coalesce(NEW.outcome, '')                  || '|' ||
      coalesce(NEW.severity, '')                 || '|' ||
      coalesce(NEW.ip_address, '')               || '|' ||
      coalesce(NEW.old_data::text, '')           || '|' ||
      coalesce(NEW.new_data::text, '')           || '|' ||
      coalesce(NEW.details::text, '')            || '|' ||
      coalesce(NEW.created_at::text, ''),
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_entry_hash ON public.audit_log;
CREATE TRIGGER trg_audit_log_entry_hash
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.set_audit_log_entry_hash();

-- ────────────────────────────────────────────────────────────────────────────────
-- 6. APPEND-ONLY RLS
-- ────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Drop every prior policy. The five named first are the ones actually present on
-- the live database and never committed to version control. Two of them are the
-- reason this migration exists:
--
--   auth_read_audit      SELECT TO authenticated USING (true)
--                        -> every employee could read the entire audit trail,
--                           including colleagues' IP addresses and locations.
--   Allow all audit_log  FOR ALL USING (true) WITH CHECK (true)
--                        -> any caller could UPDATE or DELETE any audit row,
--                           which makes the trail worthless as evidence.
DROP POLICY IF EXISTS "System can insert audit logs"     ON public.audit_log;
DROP POLICY IF EXISTS "Admins can view audit logs"       ON public.audit_log;
DROP POLICY IF EXISTS "Allow all audit_log"              ON public.audit_log;
DROP POLICY IF EXISTS "auth_insert_audit"                ON public.audit_log;
DROP POLICY IF EXISTS "auth_read_audit"                  ON public.audit_log;
-- Defensive: other names seen across environments.
DROP POLICY IF EXISTS "Allow all access audit_log"       ON public.audit_log;
DROP POLICY IF EXISTS "Allow all for authenticated"      ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_allow_all"              ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_anon_all"               ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_authenticated_all"      ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_select_admin"           ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_insert_self"            ON public.audit_log;

-- READ: administrators only. Reuses the existing SECURITY DEFINER helper from
-- 20260630000000_fix_rbac_bugs.sql, which reads user_roles without triggering
-- RLS recursion.
CREATE POLICY "audit_log_select_admin" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin_or_branch_admin(auth.uid()));

-- WRITE: any authenticated user may append, but ONLY a row attributed to
-- themselves. This stops a logged-in user from forging audit entries in a
-- colleague's name. The server-side ingest route uses the service role and so
-- bypasses this check, which is what lets it record pre-authentication events
-- such as failed logins.
-- `user_id` is UUID on the live table, so this compares UUID to UUID. Casting
-- auth.uid() to text here would raise a type error and block every audit write.
CREATE POLICY "audit_log_insert_self" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- NO UPDATE POLICY and NO DELETE POLICY are defined, by design. With RLS
-- enabled, the absence of a policy is a denial: the table is append-only for
-- every client, including administrators. Retention deletion is performed by
-- purge_audit_log() below, which runs as the table owner and bypasses RLS.

-- ────────────────────────────────────────────────────────────────────────────────
-- 7. PRIVATE SNAPSHOT BUCKET
-- ────────────────────────────────────────────────────────────────────────────────
-- UI snapshots can contain personal data displayed on screen at the moment of
-- the action, so the bucket MUST NOT be public. Objects are reached only via
-- short-lived signed URLs generated server-side for administrators.
--
-- Path convention:  audit/{YYYY-MM-DD}/{audit_log_id}.png
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audit-snapshots',
  'audit-snapshots',
  false,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No storage.objects policies are created, so the bucket is unreachable from
-- any browser client. All uploads and reads are mediated by service-role routes.

-- ────────────────────────────────────────────────────────────────────────────────
-- 8. RETENTION PURGE
-- ────────────────────────────────────────────────────────────────────────────────
-- Screen snapshots are the most privacy-sensitive artifact in the system, so
-- they expire well before the textual trail: the textual record is what an
-- auditor needs long-term, while an image of an employee's screen has a much
-- shorter legitimate life. Callers pass explicit windows; the defaults below
-- (snapshots 90 days, entries 730 days) are the intended policy.
--
-- Snapshot OBJECTS are removed from storage by the calling job, which reads the
-- returned paths first — Postgres cannot delete storage objects itself.
CREATE OR REPLACE FUNCTION public.purge_audit_log(
  snapshot_retention_days integer DEFAULT 90,
  entry_retention_days    integer DEFAULT 730
)
RETURNS TABLE (purged_snapshot_paths text[], purged_entry_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  paths text[];
  deleted bigint;
BEGIN
  -- Collect snapshot paths that are past the snapshot window so the caller can
  -- delete the underlying storage objects, then clear the pointers.
  SELECT coalesce(array_agg(snapshot_path), ARRAY[]::text[])
    INTO paths
    FROM public.audit_log
   WHERE snapshot_path IS NOT NULL
     AND created_at < now() - make_interval(days => snapshot_retention_days);

  UPDATE public.audit_log
     SET snapshot_path = NULL,
         ui_state      = NULL
   WHERE snapshot_path IS NOT NULL
     AND created_at < now() - make_interval(days => snapshot_retention_days);

  -- Remove textual entries past the (much longer) entry window.
  WITH removed AS (
    DELETE FROM public.audit_log
     WHERE created_at < now() - make_interval(days => entry_retention_days)
    RETURNING 1
  )
  SELECT count(*) INTO deleted FROM removed;

  RETURN QUERY SELECT paths, deleted;
END;
$$;

-- Deliberately NOT granted to `authenticated`. Only the service role may purge.
REVOKE ALL ON FUNCTION public.purge_audit_log(integer, integer) FROM PUBLIC;

-- ────────────────────────────────────────────────────────────────────────────────
-- 9. BACKFILL — give pre-existing rows sane values for the new columns.
-- ────────────────────────────────────────────────────────────────────────────────
-- Historical rows predate severity/category capture. Derive both from the
-- action text once, here, so the UI never has to pattern-match at read time.
UPDATE public.audit_log
   SET action_category = CASE
         WHEN action ILIKE '%logged in%'    OR action ILIKE '%logged out%'
           OR action ILIKE '%login%'        OR action ILIKE '%session%'
           OR action ILIKE '%authoriz%'                              THEN 'auth'
         WHEN action ILIKE '%page viewed%'  OR action ILIKE '%viewed%' THEN 'read'
         WHEN action ILIKE '%created%'      OR action ILIKE '%imported%' THEN 'create'
         WHEN action ILIKE '%updated%'      OR action ILIKE '%changed%'
           OR action ILIKE '%marked%'       OR action ILIKE '%approved%'
           OR action ILIKE '%rejected%'                              THEN 'update'
         WHEN action ILIKE '%deleted%'                               THEN 'delete'
         WHEN action ILIKE '%exported%'     OR action ILIKE '%downloaded%' THEN 'export'
         WHEN action ILIKE '%permission%'   OR action ILIKE '%role%'  THEN 'permission'
         ELSE 'system'
       END
 WHERE action_category IS NULL;

UPDATE public.audit_log
   SET severity = CASE
         WHEN outcome IN ('failure', 'denied')                       THEN 'warning'
         WHEN action ILIKE '%deleted%'   OR action ILIKE '%permission%'
           OR action ILIKE '%role%'                                  THEN 'critical'
         WHEN action ILIKE '%page viewed%'                           THEN 'info'
         ELSE 'notice'
       END
 WHERE severity = 'info'
   AND action NOT ILIKE '%page viewed%';

-- Mirror the legacy addressing columns into the new entity columns.
UPDATE public.audit_log
   SET entity_type  = coalesce(entity_type, table_name),
       entity_id    = coalesce(entity_id, record_id),
       entity_label = coalesce(entity_label, target)
 WHERE entity_type IS NULL OR entity_id IS NULL OR entity_label IS NULL;

-- Apply the default retention window to rows that predate the column.
UPDATE public.audit_log
   SET retention_until = created_at + interval '730 days'
 WHERE retention_until IS NULL;

COMMENT ON TABLE public.audit_log IS
  'Append-only forensic activity trail. Admin-read-only via RLS; no UPDATE or '
  'DELETE policy exists for any client. Rows carry a SHA-256 entry_hash for '
  'tamper detection. Retention is enforced by purge_audit_log().';

-- ────────────────────────────────────────────────────────────────────────────────
-- 10. FACET AGGREGATION RPC
-- ────────────────────────────────────────────────────────────────────────────────
-- The admin UI shows summary counts (total, unique actors, per-severity,
-- per-outcome, per-module) alongside each page of results, and populates its
-- filter dropdowns from the actors actually present in the filtered set.
--
-- Computing those in the application would mean fetching every matching row into
-- Node just to count it — the previous UI did exactly that, pulling a hard-capped
-- 500 rows and deriving its statistics client-side, which is why its "Total
-- Activities" card silently reported 500 whenever the real total was larger.
--
-- Doing it in one round trip here keeps the counts honest at any table size. The
-- filter arguments deliberately mirror the read route's query parameters; NULL
-- means "no filter on this dimension".
CREATE OR REPLACE FUNCTION public.audit_log_facets(
  p_search        text        DEFAULT NULL,
  p_actors        text[]      DEFAULT NULL,
  p_actions       text[]      DEFAULT NULL,
  p_modules       text[]      DEFAULT NULL,
  p_outcomes      text[]      DEFAULT NULL,
  p_severities    text[]      DEFAULT NULL,
  p_categories    text[]      DEFAULT NULL,
  p_from          timestamptz DEFAULT NULL,
  p_to            timestamptz DEFAULT NULL,
  p_entity_type   text        DEFAULT NULL,
  p_entity_id     text        DEFAULT NULL,
  p_session_id    text        DEFAULT NULL,
  p_changed_field text        DEFAULT NULL,
  p_has_snapshot  boolean     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- SECURITY DEFINER is required so the function can aggregate across all rows,
  -- but that makes the caller's own privilege irrelevant — so the admin check is
  -- re-asserted here explicitly. Without this, any authenticated user could call
  -- the RPC directly and read aggregate audit statistics that RLS denies them.
  IF NOT public.is_admin_or_branch_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: audit facets require administrator privileges';
  END IF;

  WITH filtered AS (
    SELECT *
      FROM public.audit_log
     WHERE (p_from        IS NULL OR created_at >= p_from)
       AND (p_to          IS NULL OR created_at <= p_to)
       AND (p_actors      IS NULL OR user_email      = ANY(p_actors))
       AND (p_actions     IS NULL OR action          = ANY(p_actions))
       AND (p_modules     IS NULL OR module          = ANY(p_modules))
       AND (p_outcomes    IS NULL OR outcome         = ANY(p_outcomes))
       AND (p_severities  IS NULL OR severity        = ANY(p_severities))
       AND (p_categories  IS NULL OR action_category = ANY(p_categories))
       AND (p_entity_type IS NULL OR entity_type     = p_entity_type)
       AND (p_entity_id   IS NULL OR entity_id       = p_entity_id)
       AND (p_session_id  IS NULL OR session_id      = p_session_id)
       AND (p_changed_field IS NULL OR changed_fields @> ARRAY[p_changed_field])
       AND (p_has_snapshot IS NULL
            OR (p_has_snapshot AND snapshot_path IS NOT NULL)
            OR (NOT p_has_snapshot AND snapshot_path IS NULL))
       AND (
         p_search IS NULL OR p_search = '' OR
         to_tsvector(
           'simple',
           coalesce(actor_name, '')   || ' ' || coalesce(user_email, '') || ' ' ||
           coalesce(action, '')       || ' ' || coalesce(target, '')     || ' ' ||
           coalesce(module, '')       || ' ' || coalesce(entity_label, '')
         ) @@ plainto_tsquery('simple', p_search)
         -- Substring fallback so partial tokens ("ank") still match, which
         -- full-text search alone would not do. The UI search box is used for
         -- incremental typing, not for query syntax.
         OR actor_name  ILIKE '%' || p_search || '%'
         OR user_email  ILIKE '%' || p_search || '%'
         OR target      ILIKE '%' || p_search || '%'
         OR ip_address  ILIKE '%' || p_search || '%'
       )
  )
  SELECT jsonb_build_object(
    'total',        (SELECT count(*) FROM filtered),
    'uniqueActors', (SELECT count(DISTINCT user_email) FROM filtered),
    'byOutcome',    (SELECT coalesce(jsonb_object_agg(outcome, c), '{}'::jsonb)
                       FROM (SELECT outcome, count(*) c FROM filtered
                              WHERE outcome IS NOT NULL GROUP BY outcome) t),
    'bySeverity',   (SELECT coalesce(jsonb_object_agg(severity, c), '{}'::jsonb)
                       FROM (SELECT severity, count(*) c FROM filtered
                              WHERE severity IS NOT NULL GROUP BY severity) t),
    'byCategory',   (SELECT coalesce(jsonb_object_agg(action_category, c), '{}'::jsonb)
                       FROM (SELECT action_category, count(*) c FROM filtered
                              WHERE action_category IS NOT NULL GROUP BY action_category) t),
    'byModule',     (SELECT coalesce(jsonb_object_agg(module, c), '{}'::jsonb)
                       FROM (SELECT module, count(*) c FROM filtered
                              WHERE module IS NOT NULL GROUP BY module) t),
    -- Capped at 200 actors: the dropdown is unusable beyond that, and an
    -- unbounded aggregate here would be the function's only unbounded output.
    'actors',       (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                'email', email, 'name', name, 'count', c
                            ) ORDER BY c DESC), '[]'::jsonb)
                       FROM (SELECT user_email AS email,
                                    coalesce(max(actor_name), user_email) AS name,
                                    count(*) AS c
                               FROM filtered
                              WHERE user_email IS NOT NULL
                              GROUP BY user_email
                              ORDER BY count(*) DESC
                              LIMIT 200) t)
  )
  INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_log_facets(
  text, text[], text[], text[], text[], text[], text[],
  timestamptz, timestamptz, text, text, text, text, boolean
) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────────
-- 11. INTEGRITY VERIFICATION RPC
-- ────────────────────────────────────────────────────────────────────────────────
-- Recomputes each row's hash from its current field values and reports any row
-- whose stored entry_hash no longer matches — i.e. a row that was modified after
-- insertion by something with direct database access, bypassing the append-only
-- RLS policies. Surfaced in the admin UI as an integrity check.
CREATE OR REPLACE FUNCTION public.verify_audit_log_integrity(
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL
)
RETURNS TABLE (id uuid, created_at timestamptz, action text, user_email text, stored_hash text, computed_hash text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_branch_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: integrity verification requires administrator privileges';
  END IF;

  RETURN QUERY
  SELECT a.id, a.created_at, a.action, a.user_email, a.entry_hash,
         encode(digest(
           coalesce(a.user_id::text, '')            || '|' ||
           coalesce(a.user_email, '')         || '|' ||
           coalesce(a.action, '')             || '|' ||
           coalesce(a.target, '')             || '|' ||
           coalesce(a.module, '')             || '|' ||
           coalesce(a.outcome, '')            || '|' ||
           coalesce(a.severity, '')           || '|' ||
           coalesce(a.ip_address, '')         || '|' ||
           coalesce(a.old_data::text, '')  || '|' ||
           coalesce(a.new_data::text, '')   || '|' ||
           coalesce(a.details::text, '')      || '|' ||
           coalesce(a.created_at::text, ''),
           'sha256'
         ), 'hex')
    FROM public.audit_log a
   WHERE a.entry_hash IS NOT NULL
     AND (p_from IS NULL OR a.created_at >= p_from)
     AND (p_to   IS NULL OR a.created_at <= p_to)
     AND a.entry_hash <> encode(digest(
           coalesce(a.user_id::text, '')            || '|' ||
           coalesce(a.user_email, '')         || '|' ||
           coalesce(a.action, '')             || '|' ||
           coalesce(a.target, '')             || '|' ||
           coalesce(a.module, '')             || '|' ||
           coalesce(a.outcome, '')            || '|' ||
           coalesce(a.severity, '')           || '|' ||
           coalesce(a.ip_address, '')         || '|' ||
           coalesce(a.old_data::text, '')  || '|' ||
           coalesce(a.new_data::text, '')   || '|' ||
           coalesce(a.details::text, '')      || '|' ||
           coalesce(a.created_at::text, ''),
           'sha256'
         ), 'hex');
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_audit_log_integrity(timestamptz, timestamptz) TO authenticated;
