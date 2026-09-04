-- Invoice delete requests: bring an untracked table into the migration set and
-- give it the review columns the approval flow needs.
--
-- Background: `invoice_delete_requests` was created outside the migration set.
-- The app inserted rows into it (ManageReceivables "Request Delete") but nothing
-- ever read them back, so requests could never be approved or rejected and the
-- rows accumulated in 'pending' forever. The admin surface added alongside this
-- migration reads and reviews them, which requires `reviewed_by` / `reviewed_at`
-- and realtime to exist.
--
-- Shape mirrors `deletion_requests` (20260607100000) so the two review queues
-- behave the same way.
--
-- Idempotent. Run in the Supabase SQL Editor or via `supabase db push`.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══ 1. Table ════════════════════════════════════════════════════════════════

-- Deliberately no FK to receivables: approving a request deletes the receivable,
-- and the request row must outlive it as the record of who asked and why.
CREATE TABLE IF NOT EXISTS public.invoice_delete_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id     uuid NOT NULL,
  invoice_number    text DEFAULT '',
  client_name       text DEFAULT '',
  amount            numeric DEFAULT 0,
  requested_by      uuid NOT NULL,
  requested_by_name text DEFAULT '',
  reason            text DEFAULT '',
  status            text NOT NULL DEFAULT 'pending',
  reviewed_by       text,
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ═══ 2. Columns the review flow needs on pre-existing installs ═══════════════
-- The live table predates this migration and may lack the review columns.
-- CREATE TABLE IF NOT EXISTS above is a no-op there, so add them explicitly.

ALTER TABLE public.invoice_delete_requests ADD COLUMN IF NOT EXISTS reviewed_by  text;
ALTER TABLE public.invoice_delete_requests ADD COLUMN IF NOT EXISTS reviewed_at  timestamptz;
ALTER TABLE public.invoice_delete_requests ADD COLUMN IF NOT EXISTS created_at   timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.invoice_delete_requests ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'pending';

-- Only the three states the UI can produce. Added as NOT VALID so historical
-- rows with unexpected values cannot block the migration; new writes are checked.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.invoice_delete_requests'::regclass
       AND conname  = 'invoice_delete_requests_status_check'
  ) THEN
    ALTER TABLE public.invoice_delete_requests
      ADD CONSTRAINT invoice_delete_requests_status_check
      CHECK (status IN ('pending', 'approved', 'rejected')) NOT VALID;
  END IF;
END $$;

-- The admin queue reads pending rows newest-first on every realtime change.
CREATE INDEX IF NOT EXISTS invoice_delete_requests_pending_idx
  ON public.invoice_delete_requests (status, created_at DESC);

-- ═══ 3. Server-side review timestamp ════════════════════════════════════════
-- Same function the deletion_requests queue uses (20260704000000), so the
-- reviewed_at value is the server's clock rather than the admin's browser.

DROP TRIGGER IF EXISTS trg_invoice_delete_requests_reviewed_at ON public.invoice_delete_requests;
CREATE TRIGGER trg_invoice_delete_requests_reviewed_at
  BEFORE UPDATE ON public.invoice_delete_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_reviewed_at_on_review();

-- ═══ 4. RLS ══════════════════════════════════════════════════════════════════
-- Matches the deletion_requests policy: authenticated access, role checks in
-- app code. This table is listed in the security assessment's permissive set
-- (findings.md Appendix A) and is superseded by the RLS hardening migration —
-- this block only ensures RLS is on and a policy exists, it does not widen it.

ALTER TABLE public.invoice_delete_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename  = 'invoice_delete_requests'
       AND policyname = 'Allow all invoice_delete_requests'
  ) THEN
    CREATE POLICY "Allow all invoice_delete_requests"
      ON public.invoice_delete_requests
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ═══ 5. Realtime ═════════════════════════════════════════════════════════════
-- The admin queue subscribes to postgres_changes on this table.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname     = 'supabase_realtime'
       AND schemaname  = 'public'
       AND tablename   = 'invoice_delete_requests'
  ) THEN
    ALTER publication supabase_realtime ADD TABLE public.invoice_delete_requests;
  END IF;
END $$;

COMMENT ON TABLE public.invoice_delete_requests IS
  'Non-admin requests to delete a receivable/invoice. Reviewed by admins in the notification panel Deletions tab. Rows outlive the receivable they refer to: on approval the receivable is deleted and this row remains as the record of who requested it and why.';
