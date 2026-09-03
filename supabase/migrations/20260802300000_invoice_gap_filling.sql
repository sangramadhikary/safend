-- ─────────────────────────────────────────────────────────────────────────────
-- Invoice gap-filling: GST Rule 46(b) consecutive serial compliance.
--
-- Problem: The form was calling next_invoice_number() on form open rather than
-- save, burning serials for abandoned forms. After fixing the app to allocate
-- only at save time, the counter must be reset and the function rewritten to
-- fill gaps from deleted invoices rather than always incrementing.
--
-- Rule 46(b) requires a "consecutive serial number" — any gap must be filled
-- before the high-water mark advances. If invoice 26270002 is deleted and
-- 26270001 + 26270003 exist, the next allocation returns 26270002 (gap-fill).
-- Only when no gaps exist does the counter increment.
--
-- Idempotent. Run in the Supabase SQL Editor or via `supabase db push`.
-- ─────────────────────────────────────────────────────────────────────────────

-- Reset counter to match the highest ACTUAL invoice that exists per FY prefix.
-- This fixes counters inflated by the old "allocate on form open" bug.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT fy_prefix FROM invoice_number_counters LOOP
    UPDATE invoice_number_counters
       SET last_seq = (
             SELECT COALESCE(MAX(NULLIF(substring(reference_number FROM 5), '')::INTEGER), 0)
               FROM receivables
              WHERE category = 'Invoices'
                AND reference_number ~ ('^' || r.fy_prefix || '\d+$')
           ),
           updated_at = now()
     WHERE fy_prefix = r.fy_prefix;
  END LOOP;
END $$;

-- Replace next_invoice_number() with gap-filling version.
CREATE OR REPLACE FUNCTION next_invoice_number(p_fy_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq INTEGER;
  v_candidate INTEGER;
  v_max_seq INTEGER;
BEGIN
  IF p_fy_prefix IS NULL OR p_fy_prefix !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'next_invoice_number: fy_prefix must be 4 digits, got %', p_fy_prefix;
  END IF;

  -- Lock the counter row to serialise concurrent callers.
  SELECT last_seq INTO v_max_seq
    FROM invoice_number_counters
   WHERE fy_prefix = p_fy_prefix
     FOR UPDATE;

  IF NOT FOUND THEN
    -- First invoice for this FY: create the counter row.
    INSERT INTO invoice_number_counters (fy_prefix, last_seq)
    VALUES (p_fy_prefix, 1);
    RETURN p_fy_prefix || lpad('1', 4, '0');
  END IF;

  -- Find the lowest gap: a serial in [1..last_seq] that has no matching
  -- invoice in receivables. This handles deletions (GST Rule 46(b)).
  SELECT s.seq INTO v_candidate
    FROM generate_series(1, v_max_seq) AS s(seq)
   WHERE NOT EXISTS (
           SELECT 1 FROM receivables
            WHERE category = 'Invoices'
              AND reference_number = p_fy_prefix || lpad(s.seq::TEXT, 4, '0')
         )
   ORDER BY s.seq
   LIMIT 1;

  IF v_candidate IS NOT NULL THEN
    -- Fill the gap — counter stays the same (no new high-water mark).
    RETURN p_fy_prefix || lpad(v_candidate::TEXT, 4, '0');
  END IF;

  -- No gaps found: increment the counter (new high-water mark).
  v_seq := v_max_seq + 1;
  UPDATE invoice_number_counters
     SET last_seq = v_seq, updated_at = now()
   WHERE fy_prefix = p_fy_prefix;

  RETURN p_fy_prefix || lpad(v_seq::TEXT, 4, '0');
END $$;

COMMENT ON FUNCTION next_invoice_number(TEXT) IS
  'Atomically allocates the next invoice serial for a financial-year prefix. Fills gaps from deleted invoices first (GST Rule 46(b) requires consecutive serials with no blanks). Only increments the high-water counter when no gaps exist. Concurrent callers are serialised by row-level lock on invoice_number_counters.';

-- Verification:
--   SELECT * FROM invoice_number_counters;
--   SELECT next_invoice_number('2627');
