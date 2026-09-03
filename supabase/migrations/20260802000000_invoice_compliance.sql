-- ─────────────────────────────────────────────────────────────────────────────
-- Invoice compliance: contracted rate basis, document snapshotting,
-- and Rule 46(b)-safe invoice numbering.
--
-- Four independent problems addressed here, in order:
--
--   1. RATE BASIS (work_orders)
--      The divisor that turns a monthly contract price into a per-duty rate was
--      guessed in two places and the guesses disagreed: the invoice form
--      inferred a monthly price as `dayRate * 26`, then the calculation engine
--      divided it by calendar days (30/31). A 26-day contract was billed on a
--      31-day divisor. The divisor is a commercial term, so it now lives on the
--      work order. Deliberately NOT backfilled — assigning a basis by guesswork
--      changes what a live contract bills. Unset rows are reported below.
--
--   2. SNAPSHOTTING (receivables)
--      An invoice was recomputed from scratch on every print, and its
--      "previous balance" was summed live from currently-open receivables. So
--      reprinting an issued invoice showed different figures than the client
--      received, and any change to the engine silently rewrote history. Issued
--      documents now carry their own computed values.
--
--   3. STATUTORY FIELDS (receivables)
--      Service period, client GSTIN/address, TDS rate and previous-balance
--      composition were held in a free-text `notes` blob and regex-extracted.
--      Tax-determining data becomes real columns, backfilled from notes.
--
--   4. NUMBERING (invoice_number_counters + next_invoice_number)
--      Issuance was a read-then-write with no locking, so two concurrent users
--      received the same number, and cancelled numbers were recycled out of
--      `deleted_invoice_numbers` — meaning two documents shared a serial, which
--      Rule 46(b) forbids. Replaced with an atomic counter, and reuse is
--      retired (cancelled numbers now leave a gap; value is reversed by credit
--      note instead).
--
-- Idempotent. Run in the Supabase SQL Editor or via `supabase db push`.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══ 1. Contracted rate basis on work orders ═════════════════════════════════

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS rate_basis TEXT;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS basis_days INTEGER;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.work_orders'::regclass
       AND conname  = 'work_orders_rate_basis_check'
  ) THEN
    ALTER TABLE work_orders
      ADD CONSTRAINT work_orders_rate_basis_check
      CHECK (rate_basis IS NULL OR rate_basis IN ('calendar_month', 'fixed_days', 'per_duty'));
  END IF;
END $$;

-- fixed_days is meaningless without a divisor, and a divisor above 31 cannot be
-- a days-per-month figure.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.work_orders'::regclass
       AND conname  = 'work_orders_basis_days_check'
  ) THEN
    ALTER TABLE work_orders
      ADD CONSTRAINT work_orders_basis_days_check
      CHECK (
        (rate_basis = 'fixed_days' AND basis_days IS NOT NULL AND basis_days BETWEEN 1 AND 31)
        OR (rate_basis IS DISTINCT FROM 'fixed_days')
      );
  END IF;
END $$;

COMMENT ON COLUMN work_orders.rate_basis IS
  'How the monthly contract price converts to a per-duty rate: calendar_month (÷ actual days in billed month), fixed_days (÷ basis_days, commonly 26), per_duty (price IS the per-duty rate). Duties above the basis bill at the same rate — no cap.';
COMMENT ON COLUMN work_orders.basis_days IS
  'Divisor when rate_basis = fixed_days. Required in that case, otherwise NULL.';

-- ═══ 2 & 3. Invoice snapshot + statutory fields on receivables ═══════════════

-- Service period being billed (Rule 46 does not name it, but a duty-based
-- monthly service invoice is unintelligible without it).
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS service_period_start DATE;
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS service_period_end   DATE;

-- Promoted out of the `notes` blob.
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS client_gstin   TEXT;
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS client_address TEXT;
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS tds_rate       NUMERIC;

-- Previous outstanding, and WHICH invoices it comprises. A bare figure is what
-- clients and auditors dispute; the breakdown lets them reconcile it.
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS previous_balance NUMERIC DEFAULT 0;
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS previous_balance_breakdown JSONB;

-- The computed document, frozen at issue. Reprints render this, never a
-- recalculation, so engine changes cannot alter an issued invoice.
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS invoice_snapshot JSONB;
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ;

-- e-Invoicing (Rule 48(4)). Columns exist now so switching e-invoicing on later
-- needs no schema change; they stay NULL while the feature flag is off.
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS irn          TEXT;
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS irn_qr       TEXT;
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS irn_ack_no   TEXT;
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS irn_ack_date TIMESTAMPTZ;

COMMENT ON COLUMN receivables.invoice_snapshot IS
  'Computed invoice frozen at issue: line rates/amounts, each tax head, taxable value, round-off, totals, rate basis and previous-balance composition. Reprints MUST render this rather than recomputing.';
COMMENT ON COLUMN receivables.previous_balance_breakdown IS
  'Array of {reference_number, date, amount} making up previous_balance, snapshotted at issue.';
COMMENT ON COLUMN receivables.irn_qr IS
  'Signed QR payload returned by the IRP. Printed on the invoice when e-invoicing is enabled.';

CREATE INDEX IF NOT EXISTS idx_receivables_service_period
  ON receivables (service_period_start, service_period_end);

-- ── Backfill the promoted fields out of `notes` ──────────────────────────────
-- Only fills NULLs, so re-running is a no-op and manual corrections survive.

-- "GSTIN: 21AOCS5321F1ZM"
UPDATE receivables
   SET client_gstin = upper(substring(notes FROM 'GSTIN:\s*([0-9A-Za-z]{15})'))
 WHERE client_gstin IS NULL
   AND notes ~ 'GSTIN:\s*[0-9A-Za-z]{15}';

-- "TDS: 2%"
UPDATE receivables
   SET tds_rate = NULLIF(substring(notes FROM 'TDS:\s*([0-9]+(?:\.[0-9]+)?)\s*%'), '')::NUMERIC
 WHERE tds_rate IS NULL
   AND notes ~ 'TDS:\s*[0-9]';

-- "Previous Due: ₹2,060" — strip the Indian digit grouping before casting.
UPDATE receivables
   SET previous_balance = NULLIF(replace(substring(notes FROM 'Previous Due:\s*\u20B9?\s*([0-9,]+(?:\.[0-9]+)?)'), ',', ''), '')::NUMERIC
 WHERE COALESCE(previous_balance, 0) = 0
   AND notes ~ 'Previous Due:';

-- "Addr: 5th Floor, Unit - 516, ..." — runs to the next " | " delimiter.
UPDATE receivables
   SET client_address = btrim(substring(notes FROM 'Addr:\s*([^|]+)'))
 WHERE client_address IS NULL
   AND notes ~ 'Addr:\s*[^|]';

-- "Billing Period: 2026-07-01 to 2026-07-31" — was parsed by the UI and then
-- dropped before render, so it never reached the invoice.
UPDATE receivables
   SET service_period_start = NULLIF(substring(notes FROM 'Billing Period:\s*(\d{4}-\d{2}-\d{2})'), '')::DATE,
       service_period_end   = NULLIF(substring(notes FROM 'Billing Period:\s*\d{4}-\d{2}-\d{2}\s*(?:to|–|-)\s*(\d{4}-\d{2}-\d{2})'), '')::DATE
 WHERE service_period_start IS NULL
   AND notes ~ 'Billing Period:\s*\d{4}-\d{2}-\d{2}';

-- ═══ 4. Rule 46(b)-safe invoice numbering ════════════════════════════════════

-- Atomic per-financial-year counter. Replaces "read the highest, add one",
-- which handed the same number to concurrent users.
CREATE TABLE IF NOT EXISTS invoice_number_counters (
  fy_prefix  TEXT PRIMARY KEY,
  last_seq   INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE invoice_number_counters ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'invoice_number_counters'
       AND policyname = 'Allow all access invoice_number_counters'
  ) THEN
    CREATE POLICY "Allow all access invoice_number_counters"
      ON public.invoice_number_counters FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed each prefix from the highest serial already issued, so the counter can
-- never re-hand out a number that exists.
INSERT INTO invoice_number_counters (fy_prefix, last_seq)
SELECT substring(reference_number FROM 1 FOR 4) AS fy_prefix,
       MAX(COALESCE(NULLIF(substring(reference_number FROM 5), '')::INTEGER, 0))
  FROM receivables
 WHERE category = 'Invoices'
   AND reference_number ~ '^\d{4}\d+$'
 GROUP BY 1
    ON CONFLICT (fy_prefix) DO UPDATE
   SET last_seq = GREATEST(invoice_number_counters.last_seq, EXCLUDED.last_seq);

-- Single atomic allocation. The UPSERT ... RETURNING increments and reads under
-- one row lock, so concurrent callers are serialised by Postgres.
CREATE OR REPLACE FUNCTION next_invoice_number(p_fy_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_seq INTEGER;
BEGIN
  IF p_fy_prefix IS NULL OR p_fy_prefix !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'next_invoice_number: fy_prefix must be 4 digits, got %', p_fy_prefix;
  END IF;

  INSERT INTO invoice_number_counters AS c (fy_prefix, last_seq)
  VALUES (p_fy_prefix, 1)
      ON CONFLICT (fy_prefix) DO UPDATE
     SET last_seq = c.last_seq + 1, updated_at = now()
  RETURNING c.last_seq INTO v_seq;

  RETURN p_fy_prefix || lpad(v_seq::TEXT, 4, '0');
END $$;

COMMENT ON FUNCTION next_invoice_number(TEXT) IS
  'Atomically allocates the next invoice serial for a financial-year prefix. Numbers are never reused: a cancelled invoice leaves a gap and is reversed by credit note, per Rule 46(b).';

-- Serials must be unique within a financial year. Added guarded: if duplicates
-- already exist (the old racy allocator could produce them) the migration
-- reports them instead of aborting, so they can be corrected by credit note.
DO $$
DECLARE dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT reference_number
      FROM receivables
     WHERE category = 'Invoices' AND reference_number IS NOT NULL
     GROUP BY reference_number HAVING COUNT(*) > 1
  ) d;

  IF dup_count > 0 THEN
    RAISE NOTICE 'Skipped unique index: % duplicated invoice number(s) already exist. List them with: SELECT reference_number, COUNT(*) FROM receivables WHERE category = ''Invoices'' GROUP BY 1 HAVING COUNT(*) > 1;', dup_count;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_receivables_invoice_number
      ON receivables (reference_number)
      WHERE category = 'Invoices' AND reference_number IS NOT NULL;
    RAISE NOTICE 'Unique index on invoice numbers created';
  END IF;
END $$;

-- Retire number recycling. The table is kept as an audit trail of cancelled
-- serials, but nothing may reissue them, so every remaining row is closed off.
DO $$ BEGIN
  IF to_regclass('public.deleted_invoice_numbers') IS NOT NULL THEN
    UPDATE deleted_invoice_numbers SET is_used = TRUE WHERE is_used = FALSE;
    RAISE NOTICE 'deleted_invoice_numbers: all unused rows retired — cancelled serials are no longer reissued';
  END IF;
END $$;

COMMENT ON TABLE deleted_invoice_numbers IS
  'Audit trail of cancelled invoice serials. RETIRED as a source of reusable numbers — reissuing a cancelled serial breaks Rule 46(b) uniqueness. Reverse value with a credit note instead.';

-- ─── Post-apply review ───────────────────────────────────────────────────────
-- Work orders still needing a rate basis before they can be invoiced. These are
-- deliberately unset: pick the basis each contract actually agreed.
DO $$
DECLARE unset_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unset_count FROM work_orders WHERE rate_basis IS NULL;
  IF unset_count > 0 THEN
    RAISE NOTICE '% work order(s) have no rate_basis set. Review with: SELECT id, work_order_number, client_name FROM work_orders WHERE rate_basis IS NULL;', unset_count;
  END IF;
END $$;

-- Verification:
--   SELECT rate_basis, basis_days, COUNT(*) FROM work_orders GROUP BY 1,2;
--   SELECT fy_prefix, last_seq FROM invoice_number_counters;
--   SELECT next_invoice_number('2627');  -- consumes a serial; use on staging only
