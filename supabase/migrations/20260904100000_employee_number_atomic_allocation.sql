-- Employee number: atomic, race-free server-side allocation.
--
-- Problem: employee_id (format EMP####) was allocated from the client by
-- reading every existing id, taking the numeric max and adding one, then
-- inserting in a SEPARATE round trip. Two concurrent onboardings (or a manual
-- directory add racing an onboarding finalize) computed the same next id; the
-- unique constraint rejected the second insert and the client re-minted a
-- DIFFERENT number. When the number had already been printed on the signed
-- employment agreement, the contract and the directory no longer matched.
--
-- Fix: allocate through a single atomic database function, mirroring the
-- proven next_invoice_number() pattern. An UPSERT ... RETURNING increments and
-- reads a counter row under one row lock, so concurrent callers are serialised
-- by Postgres instead of racing.
--
-- See src/services/supabase/HREmployeeService.ts (generateEmployeeId).

-- ── 1. Counter table ─────────────────────────────────────────────────────────
-- Single-row high-water mark for the EMP#### sequence. Kept as a table (rather
-- than a bare Postgres SEQUENCE) so the value is visible for previews/audit and
-- can be reseeded, and so the allocator can skip ids that already exist.
CREATE TABLE IF NOT EXISTS employee_number_counters (
  prefix     TEXT PRIMARY KEY,
  last_seq   INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Seed from existing data ───────────────────────────────────────────────
-- Start the counter at the highest numeric suffix currently in employees, so
-- the first allocation lands just past the existing sequence. Only ids that
-- match ^EMP\d+$ are considered; any legacy timestamp-style ids are ignored for
-- the max (they cannot collide with the zero-padded format).
INSERT INTO employee_number_counters AS c (prefix, last_seq)
SELECT 'EMP',
       COALESCE(MAX((substring(employee_id FROM '^EMP0*([0-9]+)$'))::INTEGER), 0)
  FROM employees
 WHERE employee_id ~* '^EMP[0-9]+$'
    ON CONFLICT (prefix) DO UPDATE
   SET last_seq = GREATEST(c.last_seq, EXCLUDED.last_seq),
       updated_at = now();

-- ── 3. Atomic allocator ──────────────────────────────────────────────────────
-- Increments the counter under a row lock and returns the formatted id. If the
-- resulting id somehow already exists (e.g. rows inserted out of band before
-- this migration), it keeps advancing the counter until a free id is found, so
-- the returned value is always safe to insert.
CREATE OR REPLACE FUNCTION next_employee_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq INTEGER;
  v_id  TEXT;
BEGIN
  LOOP
    INSERT INTO employee_number_counters AS c (prefix, last_seq)
    VALUES ('EMP', 1)
        ON CONFLICT (prefix) DO UPDATE
       SET last_seq = c.last_seq + 1, updated_at = now()
    RETURNING c.last_seq INTO v_seq;

    v_id := 'EMP' || lpad(v_seq::TEXT, 4, '0');

    -- Skip any id that already exists (case-insensitively, matching the app's
    -- normalisation). The counter has already advanced, so the loop simply tries
    -- the next value; it terminates because employees is finite.
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM employees WHERE upper(employee_id) = upper(v_id)
    );
  END LOOP;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION next_employee_number() IS
  'Atomically allocates the next employee id (EMP####). The UPSERT ... RETURNING increments and reads the counter under one row lock, so concurrent onboardings are serialised by Postgres rather than racing on a client-side max+1. Skips ids that already exist.';

COMMENT ON TABLE employee_number_counters IS
  'High-water mark for the EMP#### employee id sequence. Seeded from the max existing employees.employee_id and advanced only through next_employee_number().';

-- ── 4. Guard the unique constraint ───────────────────────────────────────────
-- The atomic allocator is the primary defence; the unique index is the backstop.
-- Report duplicates rather than aborting, so an operator can reconcile them.
DO $$
DECLARE dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT upper(employee_id) AS k
      FROM employees
     WHERE employee_id IS NOT NULL AND employee_id <> ''
     GROUP BY upper(employee_id) HAVING COUNT(*) > 1
  ) d;

  IF dup_count > 0 THEN
    RAISE NOTICE 'Skipped case-insensitive unique index: % duplicated employee id(s) already exist. List them with: SELECT upper(employee_id), COUNT(*) FROM employees GROUP BY 1 HAVING COUNT(*) > 1;', dup_count;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_employee_id_ci
      ON employees (upper(employee_id))
      WHERE employee_id IS NOT NULL AND employee_id <> '';
    RAISE NOTICE 'Case-insensitive unique index on employee_id created';
  END IF;
END $$;

-- ── 5. API access ────────────────────────────────────────────────────────────
-- The app calls this through PostgREST (supabaseClient.rpc('next_employee_number')),
-- so the API roles need EXECUTE. Reload the PostgREST schema cache so the
-- function is callable immediately without restarting the API container.
GRANT EXECUTE ON FUNCTION public.next_employee_number() TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';

-- Verification:
--   SELECT prefix, last_seq FROM employee_number_counters;
--   SELECT next_employee_number();  -- consumes a number; use on staging only
