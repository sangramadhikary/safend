-- ─────────────────────────────────────────────────────────────────────────────
-- Follow-up to 20261029000000_invoice_ledger_integrity.sql.
--
-- 1. A receipt is applied within ONE work order. Billing is per work order, so
--    one receipt (receipt_id) may not pay invoices of different work orders
--    (an invoice without a work order only pairs with others without one).
-- 2. Bank, cash and cheque registers and bank accounts: the policies only
--    checked branch access, so any signed-in user (sales, HR, operations,
--    client-portal users, users with no branch) could read every bank and cash
--    entry and post new ones. Reading is now limited to Accounts roles (and
--    Reports, read-only); writing to Accounts roles; branch scoping is kept.
--    The receipt functions are SECURITY DEFINER and are not affected.
-- Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══ 1. One work order per receipt ═══════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.receivable_payments_same_work_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wo uuid;
  v_ref text;
  v_other text;
BEGIN
  IF NEW.receipt_id IS NULL OR current_setting('app.bypass_invoice_guards', true) = 'on' THEN
    RETURN NEW;
  END IF;
  SELECT work_order_id, reference_number INTO v_wo, v_ref FROM public.receivables WHERE id = NEW.receivable_id;
  SELECT r.reference_number INTO v_other
    FROM public.receivable_payments p
    JOIN public.receivables r ON r.id = p.receivable_id
   WHERE p.receipt_id = NEW.receipt_id
     AND p.id IS DISTINCT FROM NEW.id
     AND r.id <> NEW.receivable_id
     AND r.work_order_id IS DISTINCT FROM v_wo
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Invoices % and % belong to different work orders. A receipt is applied within one work order; record a separate receipt for each.',
      coalesce(v_other, '?'), coalesce(v_ref, '?') USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_receivable_payments_same_work_order ON public.receivable_payments;
CREATE TRIGGER trg_receivable_payments_same_work_order
  BEFORE INSERT OR UPDATE OF receivable_id, receipt_id ON public.receivable_payments
  FOR EACH ROW EXECUTE FUNCTION public.receivable_payments_same_work_order();

REVOKE ALL ON FUNCTION public.receivable_payments_same_work_order() FROM PUBLIC, anon, authenticated;

-- ═══ 2. Register access ═════════════════════════════════════════════════════

-- Reads the registers: Accounts roles, plus Reports (read-only).
CREATE OR REPLACE FUNCTION public.is_register_reader(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_has_any_role(p_uid, ARRAY['admin', 'branch_admin', 'accounts', 'reports']);
$$;
REVOKE ALL ON FUNCTION public.is_register_reader(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_register_reader(uuid) TO authenticated;

-- Branch scoping from the existing helper when present; open otherwise.
CREATE OR REPLACE FUNCTION public.register_branch_ok(p_branch_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean := true;
BEGIN
  IF to_regprocedure('public.user_has_branch_access(text)') IS NOT NULL THEN
    EXECUTE 'SELECT public.user_has_branch_access($1)' INTO v_ok USING p_branch_id;
  END IF;
  RETURN coalesce(v_ok, false);
END;
$$;
REVOKE ALL ON FUNCTION public.register_branch_ok(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_branch_ok(text) TO authenticated;

DO $$
DECLARE
  v_table text;
  v_policy record;
  v_has_branch boolean;
  v_branch text;
  v_extra text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['bank_accounts', 'bank_transactions', 'cash_register', 'cheque_register'] LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    FOR v_policy IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = v_table LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', v_policy.policyname, v_table);
    END LOOP;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'branch_id')
      INTO v_has_branch;
    v_branch := CASE WHEN v_has_branch THEN ' AND (SELECT public.register_branch_ok(branch_id::text))' ELSE '' END;
    v_extra := CASE WHEN v_table = 'bank_accounts' AND EXISTS (
                      SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = 'bank_accounts' AND column_name = 'is_deleted')
                    THEN ' AND is_deleted IS NOT TRUE' ELSE '' END;

    -- bank_accounts: any staff member may read active accounts (the account
    -- printed on invoices); the registers are Accounts / Reports only.
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s%s%s)',
      v_table || '_select', v_table,
      CASE WHEN v_table = 'bank_accounts' THEN '(SELECT public.app_is_staff(auth.uid()))'
           ELSE '(SELECT public.is_register_reader(auth.uid()))' END,
      v_branch, v_extra);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_receivables_writer(auth.uid()))%s)',
      v_table || '_insert', v_table, v_branch);
    -- No UPDATE policy for the cash register (entries are voided through approved flows only).
    IF v_table <> 'cash_register' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((SELECT public.is_receivables_writer(auth.uid()))%s) WITH CHECK ((SELECT public.is_receivables_writer(auth.uid()))%s)',
        v_table || '_update', v_table, v_branch, v_branch);
    END IF;
  END LOOP;
END $$;

-- get_bank_transactions_paginated (used by Banking) runs as its owner, so it
-- skips the policies above, and it was executable by anon with no role check:
-- anyone with the public API key could list every bank transaction. Same
-- signature and result, now limited to register readers and branch scope.
DO $$ BEGIN
  IF to_regprocedure('public.get_bank_transactions_paginated(uuid, text, date, date, text, text, text, integer, integer)') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE $fn$
CREATE OR REPLACE FUNCTION public.get_bank_transactions_paginated(
  p_account_id uuid DEFAULT NULL, p_branch_id text DEFAULT NULL, p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL, p_type text DEFAULT NULL, p_category text DEFAULT NULL,
  p_search text DEFAULT NULL, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
RETURNS TABLE(id uuid, account_id uuid, transaction_date date, type text, amount numeric, running_balance numeric,
  category text, description text, reference_number text, payment_mode text, party_name text,
  is_reconciled boolean, is_void boolean, approval_status text, created_by uuid, created_at timestamptz,
  total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  IF NOT public.is_register_reader(auth.uid()) THEN
    RAISE EXCEPTION 'Not permitted.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT bt.id, bt.account_id, bt.transaction_date, bt.type, bt.amount,
         bt.running_balance, bt.category, bt.description, bt.reference_number,
         bt.payment_mode, bt.party_name, bt.is_reconciled, bt.is_void,
         bt.approval_status, bt.created_by, bt.created_at,
         COUNT(*) OVER() AS total_count
    FROM public.bank_transactions bt
   WHERE public.register_branch_ok(bt.branch_id)
     AND (p_account_id IS NULL OR bt.account_id = p_account_id)
     AND (p_branch_id IS NULL OR bt.branch_id = p_branch_id)
     AND (p_start_date IS NULL OR bt.transaction_date >= p_start_date)
     AND (p_end_date IS NULL OR bt.transaction_date <= p_end_date)
     AND (p_type IS NULL OR bt.type = p_type)
     AND (p_category IS NULL OR bt.category = p_category)
     AND (p_search IS NULL OR bt.description ILIKE '%' || p_search || '%'
          OR bt.party_name ILIKE '%' || p_search || '%'
          OR bt.reference_number ILIKE '%' || p_search || '%')
   ORDER BY bt.transaction_date DESC, bt.created_at DESC
   LIMIT greatest(least(coalesce(p_page_size, 50), 500), 1)
  OFFSET (greatest(coalesce(p_page, 1), 1) - 1) * greatest(least(coalesce(p_page_size, 50), 500), 1);
END;
$body$
  $fn$;
  REVOKE ALL ON FUNCTION public.get_bank_transactions_paginated(uuid, text, date, date, text, text, text, integer, integer) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_bank_transactions_paginated(uuid, text, date, date, text, text, text, integer, integer) TO authenticated;
END $$;

-- Voiding runs with the caller's rights (the policies above apply); anon has no use for it.
DO $$
DECLARE v_fn regprocedure;
BEGIN
  FOR v_fn IN SELECT p.oid::regprocedure FROM pg_proc p
               WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'fn_void_transaction' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn);
  END LOOP;
END $$;
