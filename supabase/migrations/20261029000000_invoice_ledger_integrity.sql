-- ─────────────────────────────────────────────────────────────────────────────
-- Invoice ledger integrity (invoicing audit, 2026-10-29).
--
-- Moves every money-changing invoice operation into the database, where it is
-- role-checked and runs in one transaction:
--
--   1. Payments become allocations: one receipt can settle several invoices,
--      each invoice's balance is derived from its own allocation rows, and
--      receivables.paid_amount / tds_credited / credit_applied are maintained
--      by trigger. Status 'received' can only be reached through payments.
--   2. Issued or paid invoices are frozen (guard trigger). Corrections go
--      through cancellation or credit/debit notes.
--   3. Invoice numbers are allocated inside the same transaction as the insert
--      (create_invoice), increment-only, never reused.
--   4. Money operations are SECURITY DEFINER functions: create_invoice,
--      record_receipt, undo_last_receipt, cancel_invoice, delete_draft_invoice,
--      review_invoice_delete_request, bounce_cheque, import_invoices,
--      mark_overdue_receivables, refresh_collection_tasks.
--   5. RLS: staff read, Accounts (admin, branch_admin, accounts) write, client
--      portal users read only their own invoices.
--
-- Deploy together with the application release that calls these functions.
-- Idempotent. Run via `supabase db push` or the SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══ 1. Role helpers ═════════════════════════════════════════════════════════

-- True when the user has a users row explicitly marked inactive.
CREATE OR REPLACE FUNCTION public.app_user_inactive(p_uid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inactive boolean := false;
BEGIN
  IF p_uid IS NULL OR to_regclass('public.users') IS NULL THEN
    RETURN false;
  END IF;
  BEGIN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.users WHERE id = $1
               AND lower(coalesce(status::text, ''active'')) <> ''active'')'
      INTO v_inactive USING p_uid;
  EXCEPTION WHEN undefined_column THEN
    v_inactive := false;
  END;
  RETURN coalesce(v_inactive, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.app_has_any_role(p_uid uuid, p_roles text[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_found boolean := false;
BEGIN
  IF p_uid IS NULL OR p_roles IS NULL OR public.app_user_inactive(p_uid) THEN
    RETURN false;
  END IF;

  IF to_regclass('public.user_roles') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role::text = ANY($2))'
      INTO v_found USING p_uid, p_roles;
    IF v_found THEN
      RETURN true;
    END IF;
  END IF;

  IF to_regclass('public.users') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.users WHERE id = $1 AND roles::text[] && $2)'
        INTO v_found USING p_uid, p_roles;
    EXCEPTION WHEN undefined_column OR datatype_mismatch OR cannot_coerce THEN
      v_found := false;
    END;
  END IF;

  RETURN coalesce(v_found, false);
END;
$$;

-- Any ERP staff member: a user_roles row, or a non-empty users.roles array.
CREATE OR REPLACE FUNCTION public.app_is_staff(p_uid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_found boolean := false;
BEGIN
  IF p_uid IS NULL THEN
    RETURN false;
  END IF;
  IF to_regclass('public.user_roles') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = $1)' INTO v_found USING p_uid;
  END IF;
  IF NOT v_found AND to_regclass('public.users') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.users WHERE id = $1 AND cardinality(roles::text[]) > 0)'
        INTO v_found USING p_uid;
    EXCEPTION WHEN undefined_column OR datatype_mismatch OR cannot_coerce THEN
      v_found := false;
    END;
  END IF;
  -- An inactive user keeps their role rows but loses access.
  RETURN v_found AND NOT public.app_user_inactive(p_uid);
END;
$$;

-- Accounts writers — mirrors ACCOUNTS_ALLOWED_ROLES in src/lib/accounts/server.ts.
CREATE OR REPLACE FUNCTION public.is_receivables_writer(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_has_any_role(p_uid, ARRAY['admin', 'branch_admin', 'accounts']);
$$;

-- Hard deletion of draft invoices and delete-request review are admin-only.
CREATE OR REPLACE FUNCTION public.is_receivables_admin(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_has_any_role(p_uid, ARRAY['admin', 'superadmin']);
$$;

-- The client a portal user belongs to (client_users.auth_user_id), or NULL.
CREATE OR REPLACE FUNCTION public.app_client_name(p_uid uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF p_uid IS NULL OR to_regclass('public.client_users') IS NULL THEN
    RETURN NULL;
  END IF;
  EXECUTE 'SELECT client_name FROM public.client_users
            WHERE auth_user_id = $1 AND lower(coalesce(status::text, ''active'')) = ''active''
            LIMIT 1'
    INTO v_name USING p_uid;
  RETURN v_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.ist_today()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date;
$$;

-- Indian financial year prefix (FY 2026-27 → '2627'); the year turns on 1 April.
CREATE OR REPLACE FUNCTION public.fy_prefix_for(p_date date)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lpad((s % 100)::text, 2, '0') || lpad(((s + 1) % 100)::text, 2, '0')
    FROM (SELECT CASE WHEN extract(month FROM p_date) < 4
                      THEN extract(year FROM p_date)::int - 1
                      ELSE extract(year FROM p_date)::int END AS s) y;
$$;

-- ═══ 2. Schema ═══════════════════════════════════════════════════════════════

-- receivable_payments predates the migration set; bring it in. On an existing
-- install CREATE TABLE is a no-op and the ADD COLUMNs fill any gaps.
CREATE TABLE IF NOT EXISTS public.receivable_payments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id        uuid NOT NULL,
  amount               numeric NOT NULL DEFAULT 0,
  mode                 text,
  received_by          text,
  cheque_number        text,
  cheque_date          date,
  bank_account_id      uuid,
  transaction_number   text,
  transaction_datetime timestamptz,
  is_partial           boolean DEFAULT false,
  balance_amount       numeric,
  balance_handling     text,
  balance_due_date     date,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS notes               text;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS is_partial          boolean DEFAULT false;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS balance_amount      numeric;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS balance_handling    text;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS balance_due_date    date;
-- TDS withheld on this allocation. NULL only on legacy rows where it is unknown.
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS tds_amount          numeric;
-- One receipt (one bank transfer, cheque or cash collection) can settle several invoices.
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS receipt_id          uuid;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS payment_date        date;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS bank_transaction_id uuid;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS cash_register_id    uuid;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS cheque_register_id  uuid;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS credit_note_id      uuid;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS allocation_source   text;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS reversed_at         timestamptz;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS reversal_reason     text;
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS created_by          uuid;

CREATE INDEX IF NOT EXISTS idx_receivable_payments_receivable ON public.receivable_payments (receivable_id);
CREATE INDEX IF NOT EXISTS idx_receivable_payments_receipt    ON public.receivable_payments (receipt_id);
CREATE INDEX IF NOT EXISTS idx_receivable_payments_cheque     ON public.receivable_payments (cheque_register_id);

COMMENT ON COLUMN public.receivable_payments.amount IS
  'Credit this row applies to the invoice = cash + tds_amount (or the credit-note amount when mode = ''Credit Note'').';
COMMENT ON COLUMN public.receivable_payments.receipt_id IS
  'Groups the allocation rows of one receipt. Undo and cheque bounce act on the whole receipt.';

-- Ledger columns on receivables, maintained only by trg_receivable_payments_ledger.
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS paid_amount            numeric NOT NULL DEFAULT 0;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS tds_credited           numeric NOT NULL DEFAULT 0;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS credit_applied         numeric NOT NULL DEFAULT 0;
-- Dues owed on THIS invoice that are not tracked as their own receivable rows
-- (typed opening balances, or carried amounts whose source invoice is gone).
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS opening_balance        numeric NOT NULL DEFAULT 0;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS cancelled_at           timestamptz;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS cancel_reason          text;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS source                 text;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS credit_note_against_id uuid;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS promised_payment_date  date;
-- Columns other migrations introduced; repeated so the functions below compile everywhere.
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS tds_rate               numeric;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS issued_at              timestamptz;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS invoice_snapshot       jsonb;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS previous_balance       numeric DEFAULT 0;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS previous_balance_breakdown jsonb;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS line_items             jsonb;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS adjustment_type        text;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS gst_treatment          text;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS gst_type               text;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS place_of_supply        text;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS client_gstin           text;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS client_address         text;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS service_period_start   date;
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS service_period_end     date;

COMMENT ON COLUMN public.receivables.paid_amount IS
  'Sum of non-reversed receivable_payments.amount (cash + TDS + credit notes). Trigger-maintained; never write directly.';
COMMENT ON COLUMN public.receivables.opening_balance IS
  'Previous dues owed on this invoice that have no receivable row of their own. Balance = total_amount + opening_balance - paid_amount.';

DO $$ BEGIN
  IF to_regclass('public.cheque_register') IS NOT NULL THEN
    ALTER TABLE public.cheque_register ADD COLUMN IF NOT EXISTS receipt_id uuid;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.credit_note_number_counters (
  fy_prefix  text PRIMARY KEY,
  last_seq   integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Invoice numbers must be unique. 20260802000000 skipped the index when
-- duplicates existed; try again and report what blocks it.
DO $$
DECLARE dup_count integer;
BEGIN
  IF to_regclass('public.uq_receivables_invoice_number') IS NOT NULL THEN
    RETURN;
  END IF;
  SELECT count(*) INTO dup_count FROM (
    SELECT reference_number FROM public.receivables
     WHERE category = 'Invoices' AND reference_number IS NOT NULL
     GROUP BY reference_number HAVING count(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE NOTICE 'uq_receivables_invoice_number NOT created: % duplicated invoice number(s). Resolve them by cancelling and re-issuing, then re-run this migration.', dup_count;
  ELSE
    CREATE UNIQUE INDEX uq_receivables_invoice_number
      ON public.receivables (reference_number)
      WHERE category = 'Invoices' AND reference_number IS NOT NULL;
  END IF;
END $$;

-- ═══ 3. Backfills (evidence-based and additive; run before the triggers exist) ══
-- Only on the first run: once the ledger trigger exists, payment rows are the
-- source of truth and must not be re-derived from notes.
SELECT set_config('app.ledger_backfill',
                  CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_receivable_payments_ledger'
                                       AND tgrelid = 'public.receivable_payments'::regclass)
                       THEN 'off' ELSE 'on' END, false);

-- 3a. Legacy receipts recorded only in notes ("|| PAYMENT: … Total Paid: ₹X").
INSERT INTO public.receivable_payments
  (receivable_id, amount, tds_amount, mode, is_partial, allocation_source, receipt_id, payment_date, created_at, notes)
SELECT r.id, v.total_paid, v.tds, coalesce(v.mode, 'Legacy'), r.status IS DISTINCT FROM 'received',
       'legacy-notes', gen_random_uuid(), r.created_at::date, coalesce(r.created_at, now()),
       'Reconstructed from invoice notes during the 2026-10-29 ledger migration'
  FROM public.receivables r
 CROSS JOIN LATERAL (
   SELECT NULLIF(replace(substring(r.notes FROM 'Total Paid:\s*₹?\s*([0-9,]+(?:\.[0-9]+)?)'), ',', ''), '')::numeric AS total_paid,
          NULLIF(replace(substring(r.notes FROM 'PAYMENT:.*?TDS:\s*₹\s*([0-9,]+(?:\.[0-9]+)?)'), ',', ''), '')::numeric AS tds,
          NULLIF(btrim(substring(r.notes FROM 'PAYMENT:\s*Mode:\s*([^|]+)')), '') AS mode
 ) v
 WHERE current_setting('app.ledger_backfill', true) = 'on'
   AND r.notes ~ 'Total Paid:'
   AND v.total_paid > 0
   AND NOT EXISTS (SELECT 1 FROM public.receivable_payments p WHERE p.receivable_id = r.id);

-- 3b. TDS on single-payment invoices, from the payment section of the notes.
UPDATE public.receivable_payments p
   SET tds_amount = v.tds
  FROM public.receivables r
 CROSS JOIN LATERAL (
   SELECT NULLIF(replace(substring(r.notes FROM 'PAYMENT:.*?TDS:\s*₹\s*([0-9,]+(?:\.[0-9]+)?)'), ',', ''), '')::numeric AS tds
 ) v
 WHERE current_setting('app.ledger_backfill', true) = 'on'
   AND p.receivable_id = r.id
   AND p.tds_amount IS NULL
   AND v.tds IS NOT NULL
   AND (SELECT count(*) FROM public.receivable_payments p2 WHERE p2.receivable_id = r.id) = 1;

-- 3c. Invoices that never mention TDS carry none.
UPDATE public.receivable_payments p
   SET tds_amount = 0
  FROM public.receivables r
 WHERE current_setting('app.ledger_backfill', true) = 'on'
   AND p.receivable_id = r.id
   AND p.tds_amount IS NULL
   AND coalesce(r.tds_rate, 0) = 0
   AND coalesce(r.notes, '') !~ 'TDS:';

-- 3d. TDS rate column for invoices created after 20260802000000 ("TDS: 2%").
UPDATE public.receivables
   SET tds_rate = NULLIF(substring(notes FROM 'TDS:\s*([0-9]+(?:\.[0-9]+)?)\s*%'), '')::numeric
 WHERE current_setting('app.ledger_backfill', true) = 'on'
   AND tds_rate IS NULL
   AND notes ~ 'TDS:\s*[0-9]+(\.[0-9]+)?\s*%';

-- 3e. Ledger totals from the payment rows.
UPDATE public.receivables r
   SET paid_amount    = s.paid,
       tds_credited   = s.tds,
       credit_applied = s.credit
  FROM (SELECT receivable_id,
               coalesce(sum(amount), 0)                                      AS paid,
               coalesce(sum(coalesce(tds_amount, 0)), 0)                     AS tds,
               coalesce(sum(amount) FILTER (WHERE mode = 'Credit Note'), 0)  AS credit
          FROM public.receivable_payments
         WHERE reversed_at IS NULL
         GROUP BY receivable_id) s
 WHERE current_setting('app.ledger_backfill', true) = 'on'
   AND r.id = s.receivable_id;

-- 3f. Opening balance = the part of a carried previous_balance that does not
-- point at an invoice of the same client still on file. The rest stays owed on
-- the older invoices themselves.
WITH carried AS (
  SELECT r.id, coalesce(r.previous_balance, 0) AS prev,
         coalesce((
           SELECT sum(coalesce(NULLIF(e->>'amount', '')::numeric, 0))
             FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.previous_balance_breakdown::jsonb) = 'array'
                                            THEN r.previous_balance_breakdown::jsonb ELSE '[]'::jsonb END) e
            WHERE EXISTS (SELECT 1 FROM public.receivables o
                           WHERE o.category = 'Invoices' AND o.id <> r.id
                             AND o.reference_number = coalesce(e->>'referenceNumber', e->>'reference_number')
                             AND lower(btrim(coalesce(o.client_name, ''))) = lower(btrim(coalesce(r.client_name, ''))))
         ), 0) AS backed_structured,
         coalesce((
           SELECT sum(NULLIF(replace(m[2], ',', ''), '')::numeric)
             FROM regexp_matches(coalesce(substring(r.notes FROM 'Outstanding:\s*([^|]+)'), ''),
                                 '([0-9A-Za-z/-]{5,})\s*\(₹([0-9,]+(?:\.[0-9]+)?)\)', 'g') AS m
            WHERE EXISTS (SELECT 1 FROM public.receivables o
                           WHERE o.category = 'Invoices' AND o.id <> r.id
                             AND o.reference_number = m[1]
                             AND lower(btrim(coalesce(o.client_name, ''))) = lower(btrim(coalesce(r.client_name, ''))))
         ), 0) AS backed_legacy,
         (jsonb_typeof(r.previous_balance_breakdown::jsonb) = 'array'
           AND jsonb_array_length(r.previous_balance_breakdown::jsonb) > 0) AS has_structured
    FROM public.receivables r
   WHERE r.category = 'Invoices' AND coalesce(r.previous_balance, 0) > 0
)
UPDATE public.receivables r
   SET opening_balance = greatest(0, round(c.prev - CASE WHEN coalesce(c.has_structured, false)
                                                         THEN c.backed_structured ELSE c.backed_legacy END, 2))
  FROM carried c
 WHERE current_setting('app.ledger_backfill', true) = 'on'
   AND r.id = c.id;

-- 3g. Work-order link for invoices raised before work_order_id existed, or
-- whose link was wiped by the old edit form. Exact UUID evidence first, then a
-- display number that identifies exactly one work order.
DO $$ BEGIN
  IF to_regclass('public.work_orders') IS NULL
     OR current_setting('app.ledger_backfill', true) IS DISTINCT FROM 'on' THEN
    RETURN;
  END IF;

  UPDATE public.receivables r
     SET work_order_id = w.id
    FROM public.work_orders w
   WHERE r.work_order_id IS NULL
     AND r.category = 'Invoices'
     AND w.id::text = lower(substring(r.notes FROM 'Work Order UUID:\s*([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'));

  WITH cand AS (
    SELECT r.id AS rid, btrim(substring(r.notes FROM 'Work Order No:\s*([^|]+)')) AS wo_no
      FROM public.receivables r
     WHERE r.work_order_id IS NULL AND r.category = 'Invoices' AND r.notes ~ 'Work Order No:'
  ), uniq AS (
    SELECT c.rid, min(w.id::text)::uuid AS wid, count(*) AS n
      FROM cand c JOIN public.work_orders w ON w.work_order_id::text = c.wo_no
     GROUP BY c.rid
  )
  UPDATE public.receivables r
     SET work_order_id = u.wid
    FROM uniq u
   WHERE r.id = u.rid AND u.n = 1;
END $$;

-- 3h. Rows created by the Vyapar import: GST-inclusive total, no line items.
UPDATE public.receivables
   SET source = 'import'
 WHERE current_setting('app.ledger_backfill', true) = 'on'
   AND source IS NULL
   AND category = 'Invoices'
   AND (line_items IS NULL
        OR jsonb_typeof(line_items::jsonb) <> 'array'
        OR jsonb_array_length(line_items::jsonb) = 0)
   AND coalesce(gst_amount, 0) = 0
   AND coalesce(amount, 0) = coalesce(total_amount, 0)
   AND coalesce(notes, '') ~ '(^|\|\s*)Status:';

SELECT set_config('app.ledger_backfill', 'off', false);

-- ═══ 4. Ledger: paid_amount and status follow the payment rows ════════════════

CREATE OR REPLACE FUNCTION public.receivables_apply_ledger(p_receivable_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        public.receivables%ROWTYPE;
  v_paid   numeric;
  v_tds    numeric;
  v_credit numeric;
  v_status text;
  v_balance numeric;
BEGIN
  IF p_receivable_id IS NULL THEN
    RETURN;
  END IF;
  SELECT * INTO r FROM public.receivables WHERE id = p_receivable_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT coalesce(sum(amount), 0),
         coalesce(sum(coalesce(tds_amount, 0)), 0),
         coalesce(sum(amount) FILTER (WHERE mode = 'Credit Note'), 0)
    INTO v_paid, v_tds, v_credit
    FROM public.receivable_payments
   WHERE receivable_id = p_receivable_id AND reversed_at IS NULL;

  v_status := r.status;
  IF r.status IS DISTINCT FROM 'cancelled' AND coalesce(r.total_amount, 0) > 0 THEN
    v_balance := coalesce(r.total_amount, 0) + coalesce(r.opening_balance, 0) - v_paid;
    IF v_balance <= 0.01 THEN
      v_status := 'received';
    ELSIF v_paid > 0 THEN
      v_status := CASE WHEN r.status = 'overdue' THEN 'overdue' ELSE 'pending' END;
    ELSIF r.status IN ('received', 'pending') THEN
      -- An invoice that has taken a payment was in the client's hands; it does
      -- not become an editable draft again when that payment is undone.
      v_status := 'issued';
    END IF;
  END IF;

  PERFORM set_config('app.ledger_update', 'on', true);
  UPDATE public.receivables
     SET paid_amount = v_paid, tds_credited = v_tds, credit_applied = v_credit, status = v_status
   WHERE id = p_receivable_id;
  PERFORM set_config('app.ledger_update', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.receivable_payments_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.receivables_apply_ledger(NEW.receivable_id);
  END IF;
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.receivable_id IS DISTINCT FROM NEW.receivable_id) THEN
    PERFORM public.receivables_apply_ledger(OLD.receivable_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_receivable_payments_ledger ON public.receivable_payments;
CREATE TRIGGER trg_receivable_payments_ledger
  AFTER INSERT OR UPDATE OR DELETE ON public.receivable_payments
  FOR EACH ROW EXECUTE FUNCTION public.receivable_payments_after_change();

-- ═══ 5. Guards on receivables ════════════════════════════════════════════════
-- app.ledger_update        set by receivables_apply_ledger only
-- app.invoice_insert       set by create_invoice / import_invoices only
-- app.invoice_delete       set by delete_draft_invoice only
-- app.bypass_invoice_guards for reviewed maintenance scripts only

CREATE OR REPLACE FUNCTION public.receivables_guard_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.bypass_invoice_guards', true) = 'on' THEN
    RETURN NEW;
  END IF;
  NEW.paid_amount := 0;
  NEW.tds_credited := 0;
  NEW.credit_applied := 0;
  IF NEW.category = 'Invoices' THEN
    IF current_setting('app.invoice_insert', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Tax invoices must be raised through the invoice form so the number is allocated in sequence.'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.status = 'received' THEN
      RAISE EXCEPTION 'An invoice becomes Received only when its payments are recorded.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.receivables_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
  v_frozen boolean;
  v_label text := coalesce(OLD.reference_number, left(OLD.id::text, 8));
  -- Columns that may still change after an invoice is issued or paid.
  v_mutable text[] := ARRAY['status', 'issued_at', 'invoice_snapshot', 'work_order_id',
                            'promised_payment_date', 'cancelled_at', 'cancel_reason',
                            'irn', 'irn_qr', 'irn_ack_no', 'irn_ack_date', 'branch_id',
                            'updated_at', 'paid_amount', 'tds_credited', 'credit_applied'];
BEGIN
  IF current_setting('app.bypass_invoice_guards', true) = 'on'
     OR current_setting('app.ledger_update', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Ledger columns follow the payment rows; direct writes are ignored.
  NEW.paid_amount := OLD.paid_amount;
  NEW.tds_credited := OLD.tds_credited;
  NEW.credit_applied := OLD.credit_applied;
  v_balance := coalesce(NEW.total_amount, 0) + coalesce(NEW.opening_balance, 0) - coalesce(NEW.paid_amount, 0);

  IF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'Invoice % is cancelled; cancellation cannot be reversed. Raise a new invoice instead.', v_label
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status = 'received' AND OLD.status IS DISTINCT FROM 'received'
     AND coalesce(NEW.total_amount, 0) > 0 AND v_balance > 0.01 THEN
    RAISE EXCEPTION 'Invoice % still has ₹% outstanding. Record the payment or a credit note; it cannot be marked received directly.',
      v_label, round(v_balance, 2) USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'received' AND NEW.status IS DISTINCT FROM 'received' THEN
    RAISE EXCEPTION 'Invoice % is paid. Undo its payments to reopen it.', v_label USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled'
     AND (coalesce(OLD.paid_amount, 0) <> 0
          OR EXISTS (SELECT 1 FROM public.receivable_payments p
                      WHERE p.receivable_id = OLD.id AND p.reversed_at IS NULL)) THEN
    RAISE EXCEPTION 'Invoice % has payments recorded. Undo them, or raise a credit note, before cancelling.', v_label
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.category IN ('Invoices', 'Invoice Adjustments') THEN
    IF OLD.category = 'Invoices' AND NEW.reference_number IS DISTINCT FROM OLD.reference_number THEN
      RAISE EXCEPTION 'Invoice numbers are allocated in sequence and cannot be changed (%).', v_label
        USING ERRCODE = 'P0001';
    END IF;
    IF OLD.status IS DISTINCT FROM 'created' AND NEW.status = 'created' THEN
      RAISE EXCEPTION 'Invoice % has been issued and cannot return to draft.', v_label USING ERRCODE = 'P0001';
    END IF;
    IF OLD.issued_at IS NOT NULL AND NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN
      RAISE EXCEPTION 'The issue date of invoice % cannot be changed.', v_label USING ERRCODE = 'P0001';
    END IF;
    IF OLD.invoice_snapshot IS NOT NULL AND NEW.invoice_snapshot IS DISTINCT FROM OLD.invoice_snapshot THEN
      RAISE EXCEPTION 'The issued copy of invoice % is frozen and cannot be replaced.', v_label USING ERRCODE = 'P0001';
    END IF;
    IF OLD.work_order_id IS NOT NULL AND NEW.work_order_id IS DISTINCT FROM OLD.work_order_id THEN
      -- ON DELETE SET NULL from work_orders arrives after the work order row is gone.
      IF NEW.work_order_id IS NULL
         AND to_regclass('public.work_orders') IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = OLD.work_order_id) THEN
        NULL;
      ELSIF NEW.work_order_id IS NULL THEN
        RAISE EXCEPTION 'Invoice % cannot be detached from its work order; carry-forward depends on that link.', v_label
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    v_frozen := OLD.status IS DISTINCT FROM 'created'
                OR OLD.issued_at IS NOT NULL
                OR coalesce(OLD.paid_amount, 0) <> 0;
    IF v_frozen THEN
      IF OLD.work_order_id IS NOT NULL AND NEW.work_order_id IS NOT NULL
         AND NEW.work_order_id IS DISTINCT FROM OLD.work_order_id THEN
        RAISE EXCEPTION 'Invoice % has been issued; its work order cannot be changed.', v_label USING ERRCODE = 'P0001';
      END IF;
      IF (to_jsonb(NEW) - v_mutable) IS DISTINCT FROM (to_jsonb(OLD) - v_mutable) THEN
        RAISE EXCEPTION 'Invoice % has been issued or paid and can no longer be edited. Cancel it, or raise a credit or debit note.',
          v_label USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.receivables_guard_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.bypass_invoice_guards', true) = 'on'
     OR current_setting('app.invoice_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  IF OLD.category IN ('Invoices', 'Invoice Adjustments') THEN
    RAISE EXCEPTION 'Invoices and credit/debit notes are statutory records and cannot be deleted directly. Cancel the invoice instead.'
      USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.receivable_payments p WHERE p.receivable_id = OLD.id) THEN
    RAISE EXCEPTION 'This entry has payments recorded; undo them before deleting it.' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

-- Settled or cancelled invoices close their open collection tasks.
CREATE OR REPLACE FUNCTION public.receivables_after_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('received', 'cancelled')
     AND OLD.status IS DISTINCT FROM NEW.status
     AND to_regclass('public.collection_tasks') IS NOT NULL THEN
    EXECUTE 'UPDATE public.collection_tasks
                SET status = ''resolved'', resolved_at = now(),
                    notes = btrim(coalesce(notes, '''') || '' [auto-closed: invoice '' || $2 || '']'')
              WHERE receivable_id = $1 AND status <> ''resolved'''
      USING NEW.id, NEW.status;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_receivables_guard_insert ON public.receivables;
CREATE TRIGGER trg_receivables_guard_insert
  BEFORE INSERT ON public.receivables
  FOR EACH ROW EXECUTE FUNCTION public.receivables_guard_insert();

DROP TRIGGER IF EXISTS trg_receivables_guard_update ON public.receivables;
CREATE TRIGGER trg_receivables_guard_update
  BEFORE UPDATE ON public.receivables
  FOR EACH ROW EXECUTE FUNCTION public.receivables_guard_update();

DROP TRIGGER IF EXISTS trg_receivables_guard_delete ON public.receivables;
CREATE TRIGGER trg_receivables_guard_delete
  BEFORE DELETE ON public.receivables
  FOR EACH ROW EXECUTE FUNCTION public.receivables_guard_delete();

DROP TRIGGER IF EXISTS trg_receivables_status_side_effects ON public.receivables;
CREATE TRIGGER trg_receivables_status_side_effects
  AFTER UPDATE OF status ON public.receivables
  FOR EACH ROW EXECUTE FUNCTION public.receivables_after_status_change();

-- ═══ 6. Numbering ════════════════════════════════════════════════════════════
-- Replaces the gap-filling version from 20260802300000. Gap filling reissued the
-- numbers of deleted invoices and, because the gap check reads receivables
-- before the caller's insert lands, handed the same number to two concurrent
-- callers. Numbers now only move forward and are allocated inside the same
-- transaction as the insert (create_invoice), so the counter lock is held until
-- the invoice row commits and a failed save rolls the counter back.

CREATE OR REPLACE FUNCTION public.format_document_serial(p_prefix text, p_seq integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_prefix || CASE WHEN p_seq > 9999 THEN p_seq::text ELSE lpad(p_seq::text, 4, '0') END;
$$;

CREATE OR REPLACE FUNCTION public.next_invoice_number(p_fy_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq integer;
  v_candidate text;
  v_tries integer := 0;
BEGIN
  IF p_fy_prefix IS NULL OR p_fy_prefix !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'next_invoice_number: fy_prefix must be 4 digits, got %', p_fy_prefix;
  END IF;

  INSERT INTO public.invoice_number_counters (fy_prefix, last_seq)
  VALUES (p_fy_prefix, 0)
  ON CONFLICT (fy_prefix) DO NOTHING;

  SELECT last_seq INTO v_seq
    FROM public.invoice_number_counters
   WHERE fy_prefix = p_fy_prefix
     FOR UPDATE;

  -- Skip numbers already present (e.g. imported from another billing system).
  LOOP
    v_seq := v_seq + 1;
    v_tries := v_tries + 1;
    v_candidate := public.format_document_serial(p_fy_prefix, v_seq);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.receivables
                           WHERE category = 'Invoices' AND reference_number = v_candidate);
    IF v_tries > 100000 THEN
      RAISE EXCEPTION 'next_invoice_number: no free serial found for %', p_fy_prefix;
    END IF;
  END LOOP;

  UPDATE public.invoice_number_counters
     SET last_seq = v_seq, updated_at = now()
   WHERE fy_prefix = p_fy_prefix;

  RETURN v_candidate;
END;
$$;

COMMENT ON FUNCTION public.next_invoice_number(text) IS
  'Allocates the next invoice serial for a financial-year prefix. Increment-only: numbers of cancelled or deleted invoices are never reissued. Call only inside create_invoice so the counter lock is held until the invoice row commits.';

CREATE OR REPLACE FUNCTION public.next_credit_note_number(p_fy_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq integer;
BEGIN
  IF p_fy_prefix IS NULL OR p_fy_prefix !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'next_credit_note_number: fy_prefix must be 4 digits, got %', p_fy_prefix;
  END IF;
  INSERT INTO public.credit_note_number_counters AS c (fy_prefix, last_seq)
  VALUES (p_fy_prefix, 1)
  ON CONFLICT (fy_prefix) DO UPDATE SET last_seq = c.last_seq + 1, updated_at = now()
  RETURNING c.last_seq INTO v_seq;
  RETURN 'CN/' || p_fy_prefix || '/' || CASE WHEN v_seq > 9999 THEN v_seq::text ELSE lpad(v_seq::text, 4, '0') END;
END;
$$;

-- ═══ 7. Money operations ═════════════════════════════════════════════════════

-- Raise a tax invoice. The number is allocated here, so '{{INVOICE_NO}}' in the
-- description or notes is replaced with it. An optional "payment" object
-- (record_receipt shape, without target_id) records a payment in the same
-- transaction, for invoices raised as already paid.
CREATE OR REPLACE FUNCTION public.create_invoice(p_invoice jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed text[] := ARRAY['description', 'client_name', 'amount', 'gst_amount', 'total_amount', 'due_date',
                            'line_items', 'client_gstin', 'client_address', 'place_of_supply', 'gst_type',
                            'gst_treatment', 'service_period_start', 'service_period_end', 'work_order_id',
                            'previous_balance', 'previous_balance_breakdown', 'opening_balance', 'tds_rate',
                            'notes', 'branch_id'];
  v_row jsonb;
  v_number text;
  v_cols text;
  v_id uuid;
  v_payment jsonb;
  v_result jsonb;
BEGIN
  IF NOT public.is_receivables_writer(auth.uid()) THEN
    RAISE EXCEPTION 'Only Accounts staff can raise invoices.' USING ERRCODE = '42501';
  END IF;
  IF p_invoice IS NULL OR jsonb_typeof(p_invoice) <> 'object' THEN
    RAISE EXCEPTION 'Invoice details are required.';
  END IF;
  IF coalesce(p_invoice->>'category', 'Invoices') <> 'Invoices' THEN
    RAISE EXCEPTION 'create_invoice raises tax invoices only.';
  END IF;
  IF coalesce(btrim(p_invoice->>'client_name'), '') = '' THEN
    RAISE EXCEPTION 'Client name is required.';
  END IF;
  IF coalesce(NULLIF(p_invoice->>'total_amount', '')::numeric, 0) <= 0 THEN
    RAISE EXCEPTION 'The invoice total must be greater than zero.';
  END IF;
  IF NULLIF(p_invoice->>'due_date', '') IS NULL THEN
    RAISE EXCEPTION 'A due date is required.';
  END IF;
  IF coalesce(NULLIF(p_invoice->>'opening_balance', '')::numeric, 0) < 0 THEN
    RAISE EXCEPTION 'An opening balance cannot be negative.';
  END IF;

  v_number := public.next_invoice_number(public.fy_prefix_for(public.ist_today()));

  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_row
    FROM jsonb_each(p_invoice)
   WHERE key = ANY(v_allowed)
     AND jsonb_typeof(value) <> 'null'
     AND NOT (jsonb_typeof(value) = 'string' AND value #>> '{}' = '');

  v_row := v_row || jsonb_build_object('category', 'Invoices', 'status', 'created',
                                       'reference_number', v_number, 'source', 'app');
  IF v_row ? 'description' THEN
    v_row := jsonb_set(v_row, '{description}', to_jsonb(replace(v_row->>'description', '{{INVOICE_NO}}', v_number)));
  END IF;
  IF v_row ? 'notes' AND jsonb_typeof(v_row->'notes') = 'string' THEN
    v_row := jsonb_set(v_row, '{notes}', to_jsonb(replace(v_row->>'notes', '{{INVOICE_NO}}', v_number)));
  END IF;

  SELECT string_agg(quote_ident(k), ', ') INTO v_cols FROM jsonb_object_keys(v_row) AS k;

  PERFORM set_config('app.invoice_insert', 'on', true);
  EXECUTE format('INSERT INTO public.receivables (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.receivables, $1) RETURNING id', v_cols)
    INTO v_id USING v_row;
  PERFORM set_config('app.invoice_insert', 'off', true);

  v_payment := p_invoice->'payment';
  IF v_payment IS NOT NULL AND jsonb_typeof(v_payment) = 'object' THEN
    -- The new invoice has no id yet on the client, so its TDS arrives as a
    -- scalar tds_amount and is keyed to the id here.
    IF coalesce(NULLIF(v_payment->>'tds_amount', '')::numeric, 0) <> 0 THEN
      v_payment := jsonb_set(v_payment, '{tds}',
        coalesce(CASE WHEN jsonb_typeof(v_payment->'tds') = 'object' THEN v_payment->'tds' END, '{}'::jsonb)
        || jsonb_build_object(v_id::text, v_payment->'tds_amount'));
    END IF;
    PERFORM public.record_receipt((v_payment - 'tds_amount') || jsonb_build_object('target_id', v_id));
  END IF;

  SELECT to_jsonb(r) INTO v_result FROM public.receivables r WHERE r.id = v_id;
  RETURN v_result;
END;
$$;

-- Insert into a ledger table (bank_transactions / cash_register / cheque_register)
-- without knowing its column types: values are passed as untyped literals.
CREATE OR REPLACE FUNCTION public.ledger_insert_row(p_table text, p_values jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cols text;
  v_vals text;
  v_id uuid;
BEGIN
  IF p_table NOT IN ('bank_transactions', 'cash_register', 'cheque_register') THEN
    RAISE EXCEPTION 'ledger_insert_row: unsupported table %', p_table;
  END IF;
  IF to_regclass('public.' || p_table) IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT string_agg(quote_ident(key), ', ' ORDER BY key),
         string_agg(CASE WHEN jsonb_typeof(value) = 'null' THEN 'NULL' ELSE quote_literal(value #>> '{}') END, ', ' ORDER BY key)
    INTO v_cols, v_vals
    FROM jsonb_each(p_values);
  EXECUTE format('INSERT INTO public.%I (%s) VALUES (%s) RETURNING id', p_table, v_cols, v_vals) INTO v_id;
  RETURN v_id;
END;
$$;

-- Record one receipt and allocate it across invoices of one client.
--
-- p: { target_id, carried_ids[], cash_amount, tds: { "<invoice id>": amount },
--      mode: Cash | Cheque | Bank Transfer | Imported | Adjustment,
--      received_by, cheque_number, cheque_date, deposit_account_id,
--      bank_account_id, transaction_number, transaction_datetime, payment_date,
--      balance_handling: keep | promise | credit_note, promise_date,
--      credit_note_reason, branch_id, ledger (default true for real money) }
--
-- Cash is applied oldest carried invoice first and the target invoice last.
-- Each invoice takes at most what it still owes after its TDS; anything left
-- over is rejected (no silent overpayment). TDS per invoice is capped at the
-- invoice's TDS rate (2% when none is set, the Sec 194C company rate) on its
-- taxable value, less TDS already credited.
CREATE OR REPLACE FUNCTION public.record_receipt(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target public.receivables%ROWTYPE;
  v_inv public.receivables%ROWTYPE;
  v_ids uuid[];
  v_requested integer;
  v_cash numeric;
  v_mode text;
  v_ledger boolean;
  v_receipt uuid := gen_random_uuid();
  v_payment_date date;
  v_tds_map jsonb;
  v_handling text;
  v_promise date;
  v_remaining numeric;
  v_out numeric;
  v_tds numeric;
  v_rate numeric;
  v_taxable numeric;
  v_max_tds numeric;
  v_alloc numeric;
  v_total numeric := 0;
  v_allocs jsonb := '[]'::jsonb;
  v_item jsonb;
  v_bank_txn uuid;
  v_cash_reg uuid;
  v_cheque_reg uuid;
  v_desc text;
  v_target_balance numeric;
  v_cn_id uuid;
  v_cn_number text;
  v_cn jsonb;
  v_gst_rate numeric;
  v_taxed numeric;
  v_cn_gst numeric;
  v_reason text;
BEGIN
  IF NOT public.is_receivables_writer(v_uid) THEN
    RAISE EXCEPTION 'Only Accounts staff can record payments.' USING ERRCODE = '42501';
  END IF;
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RAISE EXCEPTION 'Payment details are required.';
  END IF;

  v_cash := round(coalesce(NULLIF(p->>'cash_amount', '')::numeric, 0), 2);
  IF v_cash < 0 THEN
    RAISE EXCEPTION 'The amount received cannot be negative.';
  END IF;
  v_mode := coalesce(NULLIF(btrim(p->>'mode'), ''), 'Bank Transfer');
  IF v_mode NOT IN ('Cash', 'Cheque', 'Bank Transfer', 'Imported', 'Adjustment') THEN
    RAISE EXCEPTION 'Unsupported payment mode: %', v_mode;
  END IF;
  v_ledger := coalesce(NULLIF(p->>'ledger', '')::boolean, true) AND v_mode IN ('Cash', 'Cheque', 'Bank Transfer');
  v_payment_date := coalesce(NULLIF(p->>'payment_date', '')::date,
                             NULLIF(left(coalesce(p->>'transaction_datetime', ''), 10), '')::date,
                             public.ist_today());
  v_tds_map := CASE WHEN jsonb_typeof(p->'tds') = 'object' THEN p->'tds' ELSE '{}'::jsonb END;
  v_handling := coalesce(NULLIF(p->>'balance_handling', ''), 'keep');
  IF v_handling NOT IN ('keep', 'promise', 'credit_note') THEN
    RAISE EXCEPTION 'Unsupported balance handling: %', v_handling;
  END IF;
  v_promise := NULLIF(p->>'promise_date', '')::date;

  SELECT * INTO v_target FROM public.receivables WHERE id = NULLIF(p->>'target_id', '')::uuid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.';
  END IF;
  IF v_target.status = 'cancelled' THEN
    RAISE EXCEPTION 'Invoice % is cancelled.', coalesce(v_target.reference_number, '');
  END IF;
  IF coalesce(v_target.total_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Payments can only be recorded against an amount receivable.';
  END IF;

  -- Carried invoices: same client, oldest first, locked for the allocation.
  SELECT count(DISTINCT x) INTO v_requested
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p->'carried_ids') = 'array' THEN p->'carried_ids' ELSE '[]'::jsonb END) AS x
   WHERE x <> v_target.id::text;
  SELECT coalesce(array_agg(r.id ORDER BY r.created_at, r.reference_number), '{}') INTO v_ids
    FROM public.receivables r
   WHERE r.id::text IN (SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(p->'carried_ids') = 'array'
                                                              THEN p->'carried_ids' ELSE '[]'::jsonb END))
     AND r.id <> v_target.id;
  IF cardinality(v_ids) <> v_requested THEN
    RAISE EXCEPTION 'One of the selected invoices no longer exists. Reopen the payment dialog.';
  END IF;
  FOR v_inv IN SELECT * FROM public.receivables WHERE id = ANY(v_ids) ORDER BY created_at, reference_number FOR UPDATE LOOP
    IF lower(btrim(coalesce(v_inv.client_name, ''))) <> lower(btrim(coalesce(v_target.client_name, ''))) THEN
      RAISE EXCEPTION 'Invoice % belongs to a different client.', coalesce(v_inv.reference_number, '');
    END IF;
    IF v_inv.status = 'cancelled' OR coalesce(v_inv.total_amount, 0) <= 0
       OR v_inv.category NOT IN ('Invoices', 'Invoice Adjustments') THEN
      RAISE EXCEPTION 'Invoice % cannot take a payment.', coalesce(v_inv.reference_number, '');
    END IF;
  END LOOP;
  v_ids := v_ids || v_target.id;

  -- Allocation (same rule as planReceipt in src/lib/invoice/ledger.ts).
  v_remaining := v_cash;
  FOR i IN 1 .. cardinality(v_ids) LOOP
    SELECT * INTO v_inv FROM public.receivables WHERE id = v_ids[i];
    v_out := CASE WHEN v_inv.status = 'received' THEN 0
                  ELSE round(coalesce(v_inv.total_amount, 0) + coalesce(v_inv.opening_balance, 0)
                             - coalesce(v_inv.paid_amount, 0), 2) END;
    v_out := greatest(v_out, 0);
    v_tds := round(coalesce(NULLIF(v_tds_map->>(v_ids[i]::text), '')::numeric, 0), 2);
    IF v_tds < 0 THEN
      RAISE EXCEPTION 'TDS cannot be negative.';
    END IF;
    IF v_tds > 0 THEN
      v_rate := greatest(coalesce(v_inv.tds_rate, 0), 2);
      v_taxable := CASE WHEN coalesce(v_inv.amount, 0) > 0 THEN v_inv.amount ELSE v_inv.total_amount END;
      v_max_tds := round(v_taxable * v_rate / 100, 2) - coalesce(v_inv.tds_credited, 0) + 1;
      IF v_tds > greatest(v_max_tds, 0) THEN
        RAISE EXCEPTION 'TDS of ₹% on invoice % is more than can apply to it (at most ₹%).',
          v_tds, coalesce(v_inv.reference_number, ''), greatest(round(v_max_tds - 1, 2), 0);
      END IF;
      IF v_tds > v_out + 0.005 THEN
        RAISE EXCEPTION 'TDS of ₹% is more than invoice % still owes (₹%).', v_tds, coalesce(v_inv.reference_number, ''), v_out;
      END IF;
    END IF;
    v_alloc := least(v_remaining, greatest(v_out - v_tds, 0));
    v_remaining := round(v_remaining - v_alloc, 2);
    IF v_alloc > 0 OR v_tds > 0 THEN
      v_allocs := v_allocs || jsonb_build_object(
        'receivable_id', v_ids[i], 'reference_number', v_inv.reference_number,
        'cash', v_alloc, 'tds', v_tds, 'outstanding_before', v_out,
        'outstanding_after', round(v_out - v_alloc - v_tds, 2));
      v_total := v_total + v_alloc + v_tds;
    END IF;
  END LOOP;

  IF v_remaining > 0.005 THEN
    RAISE EXCEPTION 'OVERPAYMENT: ₹% is more than the selected invoices owe. Reduce the amount, or tick the older invoices this payment also covers.',
      v_remaining USING ERRCODE = 'P0001';
  END IF;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Nothing to record: enter the amount received.';
  END IF;

  -- Ledger side effects, linked by id so undo removes exactly these rows.
  IF v_ledger AND v_cash > 0 THEN
    v_desc := 'Receipt: ' || coalesce(v_target.reference_number, v_target.description, '')
              || ' (' || coalesce(v_target.client_name, '') || ')';
    IF v_mode = 'Bank Transfer' THEN
      IF NULLIF(p->>'bank_account_id', '') IS NULL OR NULLIF(btrim(p->>'transaction_number'), '') IS NULL THEN
        RAISE EXCEPTION 'Select the bank account and enter the transaction reference (UTR).';
      END IF;
      v_bank_txn := public.ledger_insert_row('bank_transactions', jsonb_build_object(
        'account_id', p->>'bank_account_id', 'transaction_date', v_payment_date, 'type', 'credit',
        'amount', v_cash, 'category', 'client_receipt', 'description', v_desc,
        'reference_number', btrim(p->>'transaction_number'), 'payment_mode', 'neft',
        'party_name', v_target.client_name));
    ELSIF v_mode = 'Cheque' THEN
      IF NULLIF(btrim(p->>'cheque_number'), '') IS NULL OR NULLIF(p->>'cheque_date', '') IS NULL THEN
        RAISE EXCEPTION 'Enter the cheque number and cheque date.';
      END IF;
      IF NULLIF(p->>'deposit_account_id', '') IS NULL THEN
        RAISE EXCEPTION 'Select the bank account the cheque will be deposited into.';
      END IF;
      v_cheque_reg := public.ledger_insert_row('cheque_register', jsonb_build_object(
        'account_id', p->>'deposit_account_id', 'cheque_number', btrim(p->>'cheque_number'),
        'type', 'received', 'amount', v_cash, 'issue_date', p->>'cheque_date',
        'party_name', coalesce(v_target.client_name, 'Unknown'), 'purpose', v_desc,
        'status', 'pending', 'branch_id', NULLIF(p->>'branch_id', ''), 'receipt_id', v_receipt));
    ELSIF v_mode = 'Cash' THEN
      IF NULLIF(btrim(p->>'received_by'), '') IS NULL THEN
        RAISE EXCEPTION 'Select who received the cash.';
      END IF;
      v_cash_reg := public.ledger_insert_row('cash_register', jsonb_build_object(
        'transaction_date', v_payment_date, 'type', 'cash_in', 'amount', v_cash,
        'category', 'client_receipt', 'description', v_desc,
        'received_from', coalesce(v_target.client_name, 'Client'), 'voucher_number', NULL,
        'branch_id', NULLIF(p->>'branch_id', '')));
    END IF;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_allocs) LOOP
    INSERT INTO public.receivable_payments (
      receivable_id, amount, tds_amount, mode, received_by, cheque_number, cheque_date,
      bank_account_id, transaction_number, transaction_datetime, is_partial, balance_amount,
      balance_handling, balance_due_date, receipt_id, payment_date, bank_transaction_id,
      cash_register_id, cheque_register_id, allocation_source, created_by, created_at)
    VALUES (
      (v_item->>'receivable_id')::uuid,
      round((v_item->>'cash')::numeric + (v_item->>'tds')::numeric, 2),
      (v_item->>'tds')::numeric,
      v_mode,
      NULLIF(btrim(p->>'received_by'), ''),
      NULLIF(btrim(p->>'cheque_number'), ''),
      NULLIF(p->>'cheque_date', '')::date,
      NULLIF(coalesce(NULLIF(p->>'bank_account_id', ''), NULLIF(p->>'deposit_account_id', '')), '')::uuid,
      NULLIF(btrim(p->>'transaction_number'), ''),
      NULLIF(p->>'transaction_datetime', '')::timestamptz,
      (v_item->>'outstanding_after')::numeric > 0.01,
      (v_item->>'outstanding_after')::numeric,
      CASE WHEN (v_item->>'outstanding_after')::numeric > 0.01 THEN v_handling END,
      CASE WHEN (v_item->>'outstanding_after')::numeric > 0.01 AND v_handling = 'promise' THEN v_promise END,
      v_receipt, v_payment_date, v_bank_txn, v_cash_reg, v_cheque_reg,
      CASE WHEN v_mode = 'Imported' THEN 'import' ELSE 'receipt' END,
      v_uid, now());
  END LOOP;

  -- What is left on the target invoice after this receipt.
  SELECT * INTO v_target FROM public.receivables WHERE id = v_target.id;
  v_target_balance := round(coalesce(v_target.total_amount, 0) + coalesce(v_target.opening_balance, 0)
                            - coalesce(v_target.paid_amount, 0), 2);

  IF v_target_balance > 0.01 AND v_handling = 'promise' THEN
    IF v_promise IS NULL THEN
      RAISE EXCEPTION 'Enter the date the client promised to pay the balance.';
    END IF;
    UPDATE public.receivables SET promised_payment_date = v_promise WHERE id = v_target.id;
  END IF;

  -- Write the remaining balance off with a numbered credit note that reverses
  -- its GST and is applied against the invoice, so the balance actually closes.
  IF v_target_balance > 0.01 AND v_handling = 'credit_note' THEN
    v_reason := coalesce(NULLIF(btrim(p->>'credit_note_reason'), ''), 'Short payment written off');
    v_cn_number := public.next_credit_note_number(public.fy_prefix_for(public.ist_today()));
    v_gst_rate := CASE WHEN coalesce(v_target.amount, 0) > 0 AND coalesce(v_target.gst_amount, 0) > 0
                       THEN v_target.gst_amount / v_target.amount * 100 ELSE 0 END;
    v_taxed := least(v_target_balance, coalesce(v_target.total_amount, 0));
    v_cn_gst := round(v_taxed * v_gst_rate / (100 + v_gst_rate), 2);
    INSERT INTO public.receivables (
      category, adjustment_type, description, client_name, client_gstin, client_address,
      place_of_supply, gst_type, gst_treatment, amount, gst_amount, total_amount, status,
      reference_number, notes, credit_note_against_id, work_order_id, branch_id, source)
    VALUES (
      'Invoice Adjustments', 'credit',
      'Credit Note against Invoice ' || coalesce(v_target.reference_number, '') || ': ' || v_reason,
      v_target.client_name, v_target.client_gstin, v_target.client_address,
      v_target.place_of_supply, v_target.gst_type, v_target.gst_treatment,
      -(v_target_balance - v_cn_gst), -v_cn_gst, -v_target_balance, 'received',
      v_cn_number,
      'Against Invoice: ' || coalesce(v_target.reference_number, '') || ' | Reason: ' || v_reason,
      v_target.id, v_target.work_order_id, v_target.branch_id, 'app')
    RETURNING id INTO v_cn_id;

    INSERT INTO public.receivable_payments (
      receivable_id, amount, tds_amount, mode, receipt_id, payment_date, credit_note_id,
      allocation_source, is_partial, balance_amount, notes, created_by, created_at)
    VALUES (v_target.id, v_target_balance, 0, 'Credit Note', v_receipt, v_payment_date, v_cn_id,
            'credit-note', false, 0, 'Credit note ' || v_cn_number, v_uid, now());

    v_cn := jsonb_build_object('id', v_cn_id, 'reference_number', v_cn_number, 'amount', v_target_balance);
  END IF;

  RETURN jsonb_build_object(
    'receipt_id', v_receipt,
    'allocations', v_allocs,
    'credit_note', v_cn,
    'invoices', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'id', r.id, 'reference_number', r.reference_number, 'status', r.status,
                    'balance', round(coalesce(r.total_amount, 0) + coalesce(r.opening_balance, 0)
                                     - coalesce(r.paid_amount, 0), 2))), '[]'::jsonb)
                   FROM public.receivables r WHERE r.id = ANY(v_ids)));
END;
$$;

-- Undo the most recent receipt on an invoice. The whole receipt is reversed
-- (all invoices it paid), together with the exact bank, cash and cheque rows it
-- created. Credit notes the receipt raised are cancelled (their numbers stay).
CREATE OR REPLACE FUNCTION public.undo_last_receipt(p_receivable_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last public.receivable_payments%ROWTYPE;
  v_ids uuid[];
  v_bank uuid;
  v_cash uuid;
  v_cheque uuid;
  v_linked uuid;
  v_cn uuid;
  v_count integer := 0;
  v_matches uuid[];
  v_warnings text[] := '{}';
  v_receipt_cash numeric;
  v_legacy boolean;
BEGIN
  IF NOT public.is_receivables_writer(auth.uid()) THEN
    RAISE EXCEPTION 'Only Accounts staff can undo payments.' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.receivables WHERE id = p_receivable_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.';
  END IF;

  SELECT * INTO v_last FROM public.receivable_payments
   WHERE receivable_id = p_receivable_id AND reversed_at IS NULL
   ORDER BY created_at DESC, id DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'There is no recorded payment on this invoice to undo.';
  END IF;

  IF v_last.receipt_id IS NOT NULL THEN
    SELECT array_agg(id) INTO v_ids FROM public.receivable_payments
     WHERE receipt_id = v_last.receipt_id AND reversed_at IS NULL;
  ELSE
    v_ids := ARRAY[v_last.id];
  END IF;

  PERFORM 1 FROM public.receivables
   WHERE id IN (SELECT receivable_id FROM public.receivable_payments WHERE id = ANY(v_ids))
   FOR UPDATE;

  SELECT max(bank_transaction_id::text)::uuid, max(cash_register_id::text)::uuid, max(cheque_register_id::text)::uuid,
         round(sum(amount - coalesce(tds_amount, 0)), 2),
         bool_and(coalesce(allocation_source, '') IN ('', 'reallocated-legacy'))
    INTO v_bank, v_cash, v_cheque, v_receipt_cash, v_legacy
    FROM public.receivable_payments WHERE id = ANY(v_ids);

  FOR v_cn IN SELECT credit_note_id FROM public.receivable_payments
               WHERE id = ANY(v_ids) AND credit_note_id IS NOT NULL LOOP
    PERFORM set_config('app.bypass_invoice_guards', 'on', true);
    UPDATE public.receivables
       SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Receipt undone'
     WHERE id = v_cn;
    PERFORM set_config('app.bypass_invoice_guards', 'off', true);
  END LOOP;

  DELETE FROM public.receivable_payments WHERE id = ANY(v_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_bank IS NOT NULL AND to_regclass('public.bank_transactions') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.bank_transactions WHERE id = $1' USING v_bank;
  END IF;
  IF v_cash IS NOT NULL AND to_regclass('public.cash_register') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.cash_register WHERE id = $1' USING v_cash;
  END IF;
  IF v_cheque IS NOT NULL AND to_regclass('public.cheque_register') IS NOT NULL THEN
    EXECUTE 'SELECT linked_transaction_id FROM public.cheque_register WHERE id = $1' INTO v_linked USING v_cheque;
    IF v_linked IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.bank_transactions WHERE id = $1' USING v_linked;
    END IF;
    EXECUTE 'DELETE FROM public.cheque_register WHERE id = $1' USING v_cheque;
  END IF;

  -- Rows recorded before this migration carry no ledger link. Remove the
  -- matching entry only when exactly one candidate exists; otherwise report it.
  IF v_bank IS NULL AND v_cash IS NULL AND v_cheque IS NULL AND coalesce(v_legacy, false) THEN
    IF v_last.mode = 'Bank Transfer' AND v_last.transaction_number IS NOT NULL
       AND to_regclass('public.bank_transactions') IS NOT NULL THEN
      EXECUTE 'SELECT array_agg(id) FROM public.bank_transactions
                WHERE reference_number = $1 AND type = ''credit'' AND round(amount::numeric, 2) = $2'
        INTO v_matches USING v_last.transaction_number, v_receipt_cash;
      IF cardinality(v_matches) = 1 THEN
        EXECUTE 'DELETE FROM public.bank_transactions WHERE id = $1' USING v_matches[1];
      ELSE
        v_warnings := v_warnings || format('The bank entry for UTR %s was not removed automatically; check Banking.', v_last.transaction_number);
      END IF;
    ELSIF v_last.mode = 'Cash' AND to_regclass('public.cash_register') IS NOT NULL THEN
      EXECUTE 'SELECT array_agg(id) FROM public.cash_register
                WHERE type = ''cash_in'' AND round(amount::numeric, 2) = $1
                  AND transaction_date::date = $2 AND description LIKE ''Receipt:%'''
        INTO v_matches USING v_receipt_cash, v_last.created_at::date;
      IF cardinality(v_matches) = 1 THEN
        EXECUTE 'DELETE FROM public.cash_register WHERE id = $1' USING v_matches[1];
      ELSE
        v_warnings := v_warnings || 'The cash register entry was not removed automatically; check the cash register.'::text;
      END IF;
    ELSIF v_last.mode = 'Cheque' AND v_last.cheque_number IS NOT NULL
          AND to_regclass('public.cheque_register') IS NOT NULL THEN
      EXECUTE 'SELECT array_agg(id) FROM public.cheque_register
                WHERE cheque_number = $1 AND type = ''received'' AND round(amount::numeric, 2) = $2'
        INTO v_matches USING v_last.cheque_number, v_receipt_cash;
      IF cardinality(v_matches) = 1 THEN
        EXECUTE 'DELETE FROM public.cheque_register WHERE id = $1' USING v_matches[1];
      ELSE
        v_warnings := v_warnings || format('Cheque %s was not removed from the cheque register automatically.', v_last.cheque_number);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('removed', v_count, 'warnings', to_jsonb(v_warnings));
END;
$$;

-- Cancel an invoice that has no payments. The row and its number stay on file.
CREATE OR REPLACE FUNCTION public.cancel_invoice(p_receivable_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.receivables%ROWTYPE;
  v_reason text := NULLIF(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT public.is_receivables_writer(auth.uid()) THEN
    RAISE EXCEPTION 'Only Accounts staff can cancel invoices.' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required to cancel an invoice.';
  END IF;
  SELECT * INTO r FROM public.receivables WHERE id = p_receivable_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.';
  END IF;
  IF r.status = 'cancelled' THEN
    RAISE EXCEPTION 'Invoice % is already cancelled.', coalesce(r.reference_number, '');
  END IF;
  IF r.status = 'received' AND coalesce(r.total_amount, 0) > 0 THEN
    RAISE EXCEPTION 'Invoice % is paid. Undo its payments or raise a credit note instead of cancelling.', coalesce(r.reference_number, '');
  END IF;
  IF EXISTS (SELECT 1 FROM public.receivable_payments p WHERE p.receivable_id = r.id AND p.reversed_at IS NULL) THEN
    RAISE EXCEPTION 'Invoice % has payments recorded. Undo them before cancelling.', coalesce(r.reference_number, '');
  END IF;

  UPDATE public.receivables
     SET status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason
   WHERE id = r.id;

  IF r.category = 'Invoices' AND r.reference_number IS NOT NULL
     AND to_regclass('public.deleted_invoice_numbers') IS NOT NULL THEN
    EXECUTE 'INSERT INTO public.deleted_invoice_numbers (invoice_number, fy_prefix, is_used, notes)
             VALUES ($1, left($1, 4), true, $2)'
      USING r.reference_number, 'Cancelled: ' || v_reason;
  END IF;

  RETURN (SELECT to_jsonb(x) FROM public.receivables x WHERE x.id = r.id);
END;
$$;

-- Hard-delete an invoice that was never issued and never paid (admin only).
-- Anything issued or paid must be cancelled instead.
CREATE OR REPLACE FUNCTION public.delete_draft_invoice(p_receivable_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.receivables%ROWTYPE;
BEGIN
  IF NOT public.is_receivables_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only an admin can delete an invoice.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.receivables WHERE id = p_receivable_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.receivable_payments p WHERE p.receivable_id = r.id) THEN
    RAISE EXCEPTION 'Invoice % has payment history and cannot be deleted. Undo the payments and cancel it instead.',
      coalesce(r.reference_number, '');
  END IF;
  IF r.category IN ('Invoices', 'Invoice Adjustments')
     AND (r.status IS DISTINCT FROM 'created' OR r.issued_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Invoice % has been issued and must be cancelled, not deleted.', coalesce(r.reference_number, '');
  END IF;

  IF r.category = 'Invoices' AND r.reference_number IS NOT NULL
     AND to_regclass('public.deleted_invoice_numbers') IS NOT NULL THEN
    EXECUTE 'INSERT INTO public.deleted_invoice_numbers (invoice_number, fy_prefix, is_used, notes)
             VALUES ($1, left($1, 4), true, $2)'
      USING r.reference_number, 'Draft deleted: ' || coalesce(NULLIF(btrim(p_reason), ''), 'no reason given');
  END IF;

  PERFORM set_config('app.invoice_delete', 'on', true);
  DELETE FROM public.receivables WHERE id = r.id;
  PERFORM set_config('app.invoice_delete', 'off', true);

  IF to_regclass('public.invoice_delete_requests') IS NOT NULL THEN
    EXECUTE 'UPDATE public.invoice_delete_requests SET status = ''approved'', reviewed_by = coalesce(reviewed_by, ''Admin (direct delete)'')
              WHERE receivable_id = $1 AND status = ''pending'''
      USING r.id;
  END IF;

  RETURN jsonb_build_object('deleted', true, 'reference_number', r.reference_number);
END;
$$;

-- Approve or reject a non-admin's delete request (admin only). Approval deletes
-- a never-issued draft; an issued invoice without payments is cancelled instead.
CREATE OR REPLACE FUNCTION public.review_invoice_delete_request(p_request_id uuid, p_decision text, p_reviewer text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  r public.receivables%ROWTYPE;
  v_action text;
  v_reviewer text := coalesce(NULLIF(btrim(p_reviewer), ''), 'Admin');
BEGIN
  IF NOT public.is_receivables_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only an admin can review delete requests.' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Decision must be approve or reject.';
  END IF;
  SELECT * INTO v_req FROM public.invoice_delete_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delete request not found.';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been reviewed.';
  END IF;

  IF p_decision = 'reject' THEN
    UPDATE public.invoice_delete_requests SET status = 'rejected', reviewed_by = v_reviewer WHERE id = p_request_id;
    RETURN jsonb_build_object('action', 'rejected');
  END IF;

  -- Close every pending request for this receivable first, so the action below
  -- does not overwrite the reviewer's name.
  UPDATE public.invoice_delete_requests
     SET status = 'approved', reviewed_by = v_reviewer
   WHERE receivable_id = v_req.receivable_id AND status = 'pending';

  SELECT * INTO r FROM public.receivables WHERE id = v_req.receivable_id FOR UPDATE;
  IF NOT FOUND THEN
    v_action := 'missing';
  ELSIF NOT EXISTS (SELECT 1 FROM public.receivable_payments p WHERE p.receivable_id = r.id)
        AND (r.category NOT IN ('Invoices', 'Invoice Adjustments')
             OR (r.status = 'created' AND r.issued_at IS NULL)) THEN
    PERFORM public.delete_draft_invoice(r.id, 'Delete request approved: ' || coalesce(v_req.reason, ''));
    v_action := 'deleted';
  ELSIF r.status = 'cancelled' THEN
    v_action := 'already_cancelled';
  ELSE
    PERFORM public.cancel_invoice(r.id, 'Delete request approved: ' || coalesce(NULLIF(v_req.reason, ''), 'no reason given'));
    v_action := 'cancelled';
  END IF;

  RETURN jsonb_build_object('action', v_action);
END;
$$;

-- A bounced cheque reverses the receipt it paid; the invoice reopens. The
-- allocation rows are kept (reversed_at set) so the bounce stays on record.
CREATE OR REPLACE FUNCTION public.bounce_cheque(p_cheque_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cheque record;
  v_count integer := 0;
  v_groups uuid[];
  v_reason text := coalesce(NULLIF(btrim(p_reason), ''), 'Cheque bounced');
BEGIN
  IF NOT public.is_receivables_writer(auth.uid()) THEN
    RAISE EXCEPTION 'Only Accounts staff can mark a cheque as bounced.' USING ERRCODE = '42501';
  END IF;
  IF to_regclass('public.cheque_register') IS NULL THEN
    RAISE EXCEPTION 'Cheque register is not available.';
  END IF;
  EXECUTE 'SELECT id, cheque_number, amount, status, type FROM public.cheque_register WHERE id = $1 FOR UPDATE'
    INTO v_cheque USING p_cheque_id;
  IF v_cheque.id IS NULL THEN
    RAISE EXCEPTION 'Cheque not found.';
  END IF;
  IF v_cheque.status IN ('bounced', 'cancelled') THEN
    RAISE EXCEPTION 'Cheque % is already %.', v_cheque.cheque_number, v_cheque.status;
  END IF;

  UPDATE public.receivable_payments
     SET reversed_at = now(), reversal_reason = v_reason
   WHERE cheque_register_id = p_cheque_id AND reversed_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Cheque receipts recorded before receipts were linked to the register.
  -- A receipt is one group of rows (receipt_id, or the row itself); reverse it
  -- only when exactly one group with this cheque number adds up to the cheque.
  IF v_count = 0 AND v_cheque.type = 'received' THEN
    SELECT array_agg(g.k) INTO v_groups
      FROM (SELECT coalesce(receipt_id, id) AS k
              FROM public.receivable_payments
             WHERE reversed_at IS NULL AND mode = 'Cheque' AND cheque_number = v_cheque.cheque_number::text
             GROUP BY coalesce(receipt_id, id)
            HAVING round(sum(amount - coalesce(tds_amount, 0)), 2) = round(v_cheque.amount::numeric, 2)) g;
    IF cardinality(v_groups) = 1 THEN
      UPDATE public.receivable_payments
         SET reversed_at = now(), reversal_reason = v_reason
       WHERE reversed_at IS NULL AND mode = 'Cheque' AND cheque_number = v_cheque.cheque_number::text
         AND coalesce(receipt_id, id) = v_groups[1];
      GET DIAGNOSTICS v_count = ROW_COUNT;
    END IF;
  END IF;

  EXECUTE 'UPDATE public.cheque_register SET status = ''bounced'', bounce_reason = $2 WHERE id = $1'
    USING p_cheque_id, v_reason;

  RETURN jsonb_build_object('reversed', v_count);
END;
$$;

-- Import invoices issued by another billing system (Vyapar Sale Report). Each
-- row keeps its own number, and the amount already received becomes a payment
-- so the balance and status are derived like any other invoice. Rows fail
-- individually; the rest still import.
CREATE OR REPLACE FUNCTION public.import_invoices(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_idx integer := 0;
  v_ok integer := 0;
  v_failed jsonb := '[]'::jsonb;
  v_ref text;
  v_total numeric;
  v_received numeric;
  v_date date;
  v_status text;
  v_id uuid;
  v_created timestamptz;
BEGIN
  IF NOT public.is_receivables_writer(auth.uid()) THEN
    RAISE EXCEPTION 'Only Accounts staff can import invoices.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Expected an array of invoices.';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_idx := v_idx + 1;
    BEGIN
      v_ref := NULLIF(btrim(v_row->>'reference_number'), '');
      v_total := round(coalesce(NULLIF(v_row->>'total_amount', '')::numeric, 0), 2);
      v_date := coalesce(NULLIF(v_row->>'invoice_date', '')::date, public.ist_today());
      v_status := lower(coalesce(v_row->>'status', 'pending'));
      IF v_ref IS NULL THEN
        RAISE EXCEPTION 'Invoice number is missing.';
      END IF;
      IF coalesce(btrim(v_row->>'client_name'), '') = '' THEN
        RAISE EXCEPTION 'Party name is missing.';
      END IF;
      IF v_total <= 0 THEN
        RAISE EXCEPTION 'Total amount must be greater than zero.';
      END IF;
      IF EXISTS (SELECT 1 FROM public.receivables WHERE category = 'Invoices' AND reference_number = v_ref) THEN
        RAISE EXCEPTION 'Invoice number % already exists.', v_ref;
      END IF;

      v_created := (v_date::timestamp AT TIME ZONE 'Asia/Kolkata');
      PERFORM set_config('app.invoice_insert', 'on', true);
      INSERT INTO public.receivables (
        category, description, client_name, client_gstin, amount, gst_amount, total_amount,
        due_date, reference_number, notes, status, issued_at, created_at, source, work_order_id)
      VALUES (
        'Invoices',
        coalesce(NULLIF(btrim(v_row->>'description'), ''), 'Imported invoice — ' || btrim(v_row->>'client_name')),
        btrim(v_row->>'client_name'),
        NULLIF(upper(btrim(coalesce(v_row->>'client_gstin', ''))), ''),
        v_total, 0, v_total,
        coalesce(NULLIF(v_row->>'due_date', '')::date, v_date),
        v_ref,
        NULLIF(v_row->>'notes', ''),
        CASE WHEN v_status LIKE 'cancel%' THEN 'cancelled' ELSE 'issued' END,
        v_created, v_created, 'import',
        NULLIF(v_row->>'work_order_id', '')::uuid)
      RETURNING id INTO v_id;
      PERFORM set_config('app.invoice_insert', 'off', true);
      -- branch_id is text on some installs and uuid on others; let the literal adapt.
      IF NULLIF(v_row->>'branch_id', '') IS NOT NULL THEN
        EXECUTE format('UPDATE public.receivables SET branch_id = %L WHERE id = $1', v_row->>'branch_id') USING v_id;
      END IF;

      v_received := round(coalesce(NULLIF(v_row->>'received_amount', '')::numeric, 0), 2);
      IF v_status = 'received' AND v_received <= 0 THEN
        v_received := v_total;  -- "Paid" with no received column
      END IF;
      v_received := least(greatest(v_received, 0), v_total);
      IF v_received > 0 AND v_status NOT LIKE 'cancel%' THEN
        INSERT INTO public.receivable_payments (
          receivable_id, amount, tds_amount, mode, is_partial, balance_amount, receipt_id,
          payment_date, allocation_source, notes, created_by, created_at)
        VALUES (v_id, v_received, 0, 'Imported', v_received < v_total, round(v_total - v_received, 2),
                gen_random_uuid(), v_date, 'import', 'Received before import (per source system)',
                auth.uid(), v_created);
      END IF;
      v_ok := v_ok + 1;
    EXCEPTION WHEN others THEN
      PERFORM set_config('app.invoice_insert', 'off', true);
      v_failed := v_failed || jsonb_build_object('row', v_idx, 'reference_number', v_ref, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('imported', v_ok, 'failed', v_failed);
END;
$$;

-- ═══ 8. Collections ═════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.collection_priority(p_days integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_days <= 7 THEN 'low'
              WHEN p_days <= 30 THEN 'medium'
              WHEN p_days <= 60 THEN 'high'
              ELSE 'critical' END;
$$;

-- Flags overdue invoices (and positive debit notes) and opens one collection
-- task per overdue item, for the amount still owed. Credit notes, event
-- letters, tax refunds and other categories are never sent to collections.
-- Runs nightly via pg_cron when available; pages also call it.
CREATE OR REPLACE FUNCTION public.mark_overdue_receivables()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := public.ist_today();
  v_sales uuid[] := '{}';
  v_i integer := 0;
  v_tasks jsonb := '[]'::jsonb;
  v_marked integer := 0;
  r record;
  v_assignee uuid;
  v_task_id uuid;
  v_days integer;
  v_balance numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.app_is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not permitted.' USING ERRCODE = '42501';
  END IF;
  -- One sweep at a time, so two pages opening together cannot double-assign.
  PERFORM pg_advisory_xact_lock(hashtext('public.mark_overdue_receivables'));

  UPDATE public.receivables x
     SET status = 'overdue'
   WHERE x.status IN ('created', 'issued', 'open', 'pending')
     AND x.due_date IS NOT NULL AND x.due_date < v_today
     AND (x.category = 'Invoices'
          OR (x.category = 'Invoice Adjustments' AND x.adjustment_type = 'debit' AND x.total_amount > 0))
     AND coalesce(x.total_amount, 0) + coalesce(x.opening_balance, 0) - coalesce(x.paid_amount, 0) > 0.01;
  GET DIAGNOSTICS v_marked = ROW_COUNT;

  IF to_regclass('public.collection_tasks') IS NULL THEN
    RETURN jsonb_build_object('overdue_marked', v_marked, 'tasks', v_tasks);
  END IF;

  IF to_regclass('public.user_roles') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(array_agg(DISTINCT user_id ORDER BY user_id), ''{}'') FROM public.user_roles WHERE role::text = ''sales'''
      INTO v_sales;
  END IF;

  FOR r IN
    SELECT x.* FROM public.receivables x
     WHERE x.status = 'overdue'
       AND x.due_date IS NOT NULL
       AND (x.category = 'Invoices'
            OR (x.category = 'Invoice Adjustments' AND x.adjustment_type = 'debit' AND x.total_amount > 0))
       AND coalesce(x.total_amount, 0) + coalesce(x.opening_balance, 0) - coalesce(x.paid_amount, 0) > 0.01
       AND NOT EXISTS (SELECT 1 FROM public.collection_tasks t
                        WHERE t.receivable_id = x.id AND t.status <> 'resolved')
     ORDER BY x.due_date, x.created_at
  LOOP
    v_balance := round(coalesce(r.total_amount, 0) + coalesce(r.opening_balance, 0) - coalesce(r.paid_amount, 0), 2);
    v_days := greatest(v_today - r.due_date, 0);
    v_assignee := CASE WHEN cardinality(v_sales) > 0 THEN v_sales[(v_i % cardinality(v_sales)) + 1] END;
    v_i := v_i + 1;
    INSERT INTO public.collection_tasks
      (receivable_id, assigned_to, client_name, invoice_description, amount, due_date, days_overdue, priority, status)
    VALUES
      (r.id, v_assignee, r.client_name, coalesce(r.reference_number || ' · ', '') || coalesce(r.description, ''),
       v_balance, r.due_date, v_days, public.collection_priority(v_days), 'pending')
    RETURNING id INTO v_task_id;
    v_tasks := v_tasks || jsonb_build_object(
      'id', v_task_id, 'receivable_id', r.id, 'assigned_to', v_assignee, 'client_name', r.client_name,
      'reference_number', r.reference_number, 'amount', v_balance, 'days_overdue', v_days);
  END LOOP;

  RETURN jsonb_build_object('overdue_marked', v_marked, 'tasks', v_tasks);
END;
$$;

-- Closes tasks whose invoice is settled or cancelled; refreshes the amount,
-- days overdue and priority of the rest from the invoice itself.
CREATE OR REPLACE FUNCTION public.refresh_collection_tasks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := public.ist_today();
  v_closed integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.app_is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not permitted.' USING ERRCODE = '42501';
  END IF;
  IF to_regclass('public.collection_tasks') IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.collection_tasks t
     SET status = 'resolved', resolved_at = now(),
         notes = btrim(coalesce(t.notes, '') || ' [auto-closed: invoice settled or cancelled]')
    FROM public.receivables r
   WHERE r.id = t.receivable_id
     AND t.status <> 'resolved'
     AND (r.status IN ('received', 'cancelled')
          OR coalesce(r.total_amount, 0) + coalesce(r.opening_balance, 0) - coalesce(r.paid_amount, 0) <= 0.01);
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  UPDATE public.collection_tasks t
     SET amount = round(coalesce(r.total_amount, 0) + coalesce(r.opening_balance, 0) - coalesce(r.paid_amount, 0), 2),
         due_date = coalesce(r.due_date, t.due_date),
         days_overdue = greatest(v_today - coalesce(r.due_date, t.due_date), 0),
         priority = public.collection_priority(greatest(v_today - coalesce(r.due_date, t.due_date), 0))
    FROM public.receivables r
   WHERE r.id = t.receivable_id
     AND t.status <> 'resolved';

  RETURN v_closed;
END;
$$;

-- ═══ 9. Row-level security ═══════════════════════════════════════════════════
-- Replaces whatever policies these tables carried (the security assessment
-- found USING (true) on all of them). Writes that move money go through the
-- SECURITY DEFINER functions above; direct table writes are limited to Accounts.

DO $$
DECLARE
  v_table text;
  v_policy record;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['receivables', 'receivable_payments', 'invoice_number_counters',
                                 'credit_note_number_counters', 'invoice_delete_requests',
                                 'deleted_invoice_numbers', 'collection_tasks'] LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    FOR v_policy IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = v_table LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', v_policy.policyname, v_table);
    END LOOP;
  END LOOP;
END $$;

-- receivables
CREATE POLICY receivables_select_staff ON public.receivables
  FOR SELECT TO authenticated
  USING ((SELECT public.app_is_staff(auth.uid())));

CREATE POLICY receivables_select_client ON public.receivables
  FOR SELECT TO authenticated
  USING (category IN ('Invoices', 'Invoice Adjustments')
         AND lower(btrim(coalesce(client_name, ''))) = lower(btrim(coalesce((SELECT public.app_client_name(auth.uid())), '#none#'))));

CREATE POLICY receivables_insert_accounts ON public.receivables
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_receivables_writer(auth.uid()))
              OR ((SELECT public.app_has_any_role(auth.uid(), ARRAY['hr']))
                  AND coalesce(category, 'Payroll Receivables') = 'Payroll Receivables'));

CREATE POLICY receivables_update_accounts ON public.receivables
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_receivables_writer(auth.uid())))
  WITH CHECK ((SELECT public.is_receivables_writer(auth.uid())));

CREATE POLICY receivables_delete_accounts ON public.receivables
  FOR DELETE TO authenticated
  USING ((SELECT public.is_receivables_writer(auth.uid())));

-- receivable_payments: read-only for users; written by the functions above.
CREATE POLICY receivable_payments_select_staff ON public.receivable_payments
  FOR SELECT TO authenticated
  USING ((SELECT public.app_is_staff(auth.uid())));

CREATE POLICY receivable_payments_select_client ON public.receivable_payments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.receivables r
                  WHERE r.id = receivable_payments.receivable_id
                    AND r.category IN ('Invoices', 'Invoice Adjustments')
                    AND lower(btrim(coalesce(r.client_name, '')))
                        = lower(btrim(coalesce((SELECT public.app_client_name(auth.uid())), '#none#')))));

-- Number counters: readable for previews, written only by the allocators.
CREATE POLICY invoice_number_counters_select_staff ON public.invoice_number_counters
  FOR SELECT TO authenticated
  USING ((SELECT public.app_is_staff(auth.uid())));

CREATE POLICY credit_note_number_counters_select_staff ON public.credit_note_number_counters
  FOR SELECT TO authenticated
  USING ((SELECT public.app_is_staff(auth.uid())));

DO $$ BEGIN
  IF to_regclass('public.invoice_delete_requests') IS NOT NULL THEN
    CREATE POLICY invoice_delete_requests_select ON public.invoice_delete_requests
      FOR SELECT TO authenticated
      USING (requested_by = auth.uid() OR (SELECT public.is_receivables_admin(auth.uid())));
    CREATE POLICY invoice_delete_requests_insert_own ON public.invoice_delete_requests
      FOR INSERT TO authenticated
      WITH CHECK (requested_by = auth.uid() AND (SELECT public.app_is_staff(auth.uid())));
    CREATE POLICY invoice_delete_requests_review_admin ON public.invoice_delete_requests
      FOR UPDATE TO authenticated
      USING ((SELECT public.is_receivables_admin(auth.uid())))
      WITH CHECK ((SELECT public.is_receivables_admin(auth.uid())));
    CREATE POLICY invoice_delete_requests_delete_admin ON public.invoice_delete_requests
      FOR DELETE TO authenticated
      USING ((SELECT public.is_receivables_admin(auth.uid())));
  END IF;

  IF to_regclass('public.deleted_invoice_numbers') IS NOT NULL THEN
    CREATE POLICY deleted_invoice_numbers_select_staff ON public.deleted_invoice_numbers
      FOR SELECT TO authenticated
      USING ((SELECT public.app_is_staff(auth.uid())));
    CREATE POLICY deleted_invoice_numbers_insert_accounts ON public.deleted_invoice_numbers
      FOR INSERT TO authenticated
      WITH CHECK ((SELECT public.is_receivables_writer(auth.uid())));
  END IF;

  IF to_regclass('public.collection_tasks') IS NOT NULL THEN
    CREATE POLICY collection_tasks_select_staff ON public.collection_tasks
      FOR SELECT TO authenticated
      USING ((SELECT public.app_is_staff(auth.uid())));
    CREATE POLICY collection_tasks_update_staff ON public.collection_tasks
      FOR UPDATE TO authenticated
      USING ((SELECT public.app_is_staff(auth.uid())))
      WITH CHECK ((SELECT public.app_is_staff(auth.uid())));
    CREATE POLICY collection_tasks_delete_admin ON public.collection_tasks
      FOR DELETE TO authenticated
      USING ((SELECT public.is_receivables_admin(auth.uid())));
  END IF;
END $$;

-- ═══ 10. Function privileges ═════════════════════════════════════════════════

-- Internal: callable only from the functions above.
REVOKE ALL ON FUNCTION public.next_invoice_number(text)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_credit_note_number(text)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.receivables_apply_ledger(uuid)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ledger_insert_row(text, jsonb)     FROM PUBLIC, anon, authenticated;

-- Used inside RLS policies, so the invoking role needs EXECUTE.
REVOKE ALL ON FUNCTION public.app_user_inactive(uuid)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_has_any_role(uuid, text[])     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_is_staff(uuid)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_receivables_writer(uuid)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_receivables_admin(uuid)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_client_name(uuid)              FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_user_inactive(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_has_any_role(uuid, text[])  TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_is_staff(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_receivables_writer(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_receivables_admin(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_client_name(uuid)           TO authenticated;

-- RPCs. Each checks the caller's role itself.
REVOKE ALL ON FUNCTION public.create_invoice(jsonb)                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_receipt(jsonb)                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.undo_last_receipt(uuid)                            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_invoice(uuid, text)                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_draft_invoice(uuid, text)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_invoice_delete_request(uuid, text, text)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bounce_cheque(uuid, text)                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.import_invoices(jsonb)                             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_overdue_receivables()                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.refresh_collection_tasks()                         FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice(jsonb)                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_receipt(jsonb)                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_last_receipt(uuid)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(uuid, text)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_draft_invoice(uuid, text)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_invoice_delete_request(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bounce_cheque(uuid, text)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_invoices(jsonb)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_overdue_receivables()                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_collection_tasks()                      TO authenticated;

-- ═══ 11. Nightly overdue sweep (01:00 IST) when pg_cron is installed ════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'receivables-overdue-sweep';
      PERFORM cron.schedule('receivables-overdue-sweep', '30 19 * * *',
                            'SELECT public.mark_overdue_receivables(); SELECT public.refresh_collection_tasks();');
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'pg_cron is not installed; overdue status still refreshes when Accounts or Sales pages load.';
  END IF;
END $$;

-- ─── Verification ────────────────────────────────────────────────────────────
--   SELECT id, reference_number, total_amount, paid_amount, opening_balance, status
--     FROM receivables WHERE category = 'Invoices' ORDER BY created_at DESC LIMIT 20;
--   SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE tablename IN ('receivables', 'receivable_payments') ORDER BY 1, 2;
--   Legacy receipts that paid older carried invoices through a newer one are
--   re-attributed by supabase/scripts/20261029_reallocate_legacy_carry_forward.sql
--   (review its dry run first).
