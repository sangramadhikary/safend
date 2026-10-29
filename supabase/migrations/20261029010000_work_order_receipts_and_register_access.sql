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

-- ═══ 3. record_receipt: carried invoices must be on the target's work order ═══
-- Same function as in 20261029000000 plus that check, so a receipt can never pay
-- an invoice of another work order (even when the target itself takes nothing).
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
    IF v_inv.work_order_id IS DISTINCT FROM v_target.work_order_id THEN
      RAISE EXCEPTION 'Invoices % and % belong to different work orders. A receipt is applied within one work order; record a separate receipt for each.',
        coalesce(v_inv.reference_number, '?'), coalesce(v_target.reference_number, '?') USING ERRCODE = 'P0001';
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
