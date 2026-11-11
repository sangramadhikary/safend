-- Keep every invoice, carry-forward chain, receipt and bank posting within one
-- explicit work order. UI checks are helpful, but the database is authoritative.

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
  v_work_order_id uuid;
  v_breakdown jsonb := '[]'::jsonb;
  v_entry jsonb;
  v_entry_id uuid;
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_carried public.receivables%ROWTYPE;
  v_carried_due numeric;
  v_carried_total numeric := 0;
  v_opening_balance numeric := 0;
  v_previous_balance numeric := 0;
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

  v_opening_balance := coalesce(NULLIF(p_invoice->>'opening_balance', '')::numeric, 0);
  v_previous_balance := coalesce(NULLIF(p_invoice->>'previous_balance', '')::numeric, 0);
  IF v_opening_balance < 0 THEN
    RAISE EXCEPTION 'An opening balance cannot be negative.';
  END IF;

  BEGIN
    v_work_order_id := NULLIF(p_invoice->>'work_order_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'The selected work order is invalid.';
  END;
  IF v_work_order_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = v_work_order_id) THEN
    RAISE EXCEPTION 'The selected work order no longer exists.';
  END IF;

  IF p_invoice ? 'previous_balance_breakdown'
     AND jsonb_typeof(p_invoice->'previous_balance_breakdown') <> 'null' THEN
    IF jsonb_typeof(p_invoice->'previous_balance_breakdown') <> 'array' THEN
      RAISE EXCEPTION 'Previous-balance details must be a list of invoices.';
    END IF;
    v_breakdown := p_invoice->'previous_balance_breakdown';
  END IF;

  IF jsonb_array_length(v_breakdown) > 0 AND v_work_order_id IS NULL THEN
    RAISE EXCEPTION 'Carried invoices require a work order. Link this invoice to its work order first.';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_breakdown)
  LOOP
    BEGIN
      v_entry_id := NULLIF(v_entry->>'id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'A carried invoice has an invalid id.';
    END;
    IF v_entry_id IS NULL THEN
      RAISE EXCEPTION 'Every carried invoice must include its database id.';
    END IF;
    IF v_entry_id = ANY(v_seen_ids) THEN
      RAISE EXCEPTION 'A carried invoice was selected more than once.';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_entry_id);

    SELECT * INTO v_carried
      FROM public.receivables r
     WHERE r.id = v_entry_id
       AND r.category = 'Invoices'
     FOR UPDATE;
    IF NOT FOUND OR v_carried.status = 'cancelled' THEN
      RAISE EXCEPTION 'A carried invoice is missing or cancelled.';
    END IF;
    IF lower(btrim(coalesce(v_carried.client_name, ''))) <>
       lower(btrim(coalesce(p_invoice->>'client_name', ''))) THEN
      RAISE EXCEPTION 'Carried invoice % belongs to another client.', coalesce(v_carried.reference_number, v_entry_id::text);
    END IF;
    IF v_carried.work_order_id IS DISTINCT FROM v_work_order_id THEN
      RAISE EXCEPTION 'Carried invoice % belongs to another work order.', coalesce(v_carried.reference_number, v_entry_id::text);
    END IF;

    v_carried_due := CASE WHEN v_carried.status = 'received' THEN 0 ELSE
      greatest(0, round(coalesce(v_carried.total_amount, 0) + coalesce(v_carried.opening_balance, 0)
                           - coalesce(v_carried.paid_amount, 0), 2)) END;
    IF v_carried_due <= 0.01 THEN
      RAISE EXCEPTION 'Carried invoice % no longer has an outstanding balance.', coalesce(v_carried.reference_number, v_entry_id::text);
    END IF;
    IF abs(coalesce(NULLIF(v_entry->>'amount', '')::numeric, -1) - v_carried_due) > 0.01 THEN
      RAISE EXCEPTION 'The balance of carried invoice % changed. Reload previous dues before creating this invoice.',
        coalesce(v_carried.reference_number, v_entry_id::text);
    END IF;
    v_carried_total := round(v_carried_total + v_carried_due, 2);
  END LOOP;

  IF abs(v_previous_balance - round(v_carried_total + v_opening_balance, 2)) > 0.01 THEN
    RAISE EXCEPTION 'Previous due must equal the selected invoices plus the opening balance. Reload and try again.';
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

-- A bank register row represents one receipt instrument. Several allocation
-- rows may share it only when they also share the same receipt_id.
CREATE OR REPLACE FUNCTION public.receivable_payment_one_bank_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.bank_transaction_id IS NULL OR NEW.reversed_at IS NOT NULL
     OR current_setting('app.bypass_invoice_guards', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.receipt_id IS NULL THEN
    RAISE EXCEPTION 'A bank-backed payment allocation requires a receipt id.';
  END IF;
  -- Serialize ownership checks on the shared bank row. Without this lock,
  -- two concurrent receipts could both pass the EXISTS test.
  PERFORM 1 FROM public.bank_transactions WHERE id = NEW.bank_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The linked bank transaction does not exist.';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM public.receivable_payments p
     WHERE p.bank_transaction_id = NEW.bank_transaction_id
       AND p.id IS DISTINCT FROM NEW.id
       AND p.reversed_at IS NULL
       AND p.receipt_id IS DISTINCT FROM NEW.receipt_id
  ) THEN
    RAISE EXCEPTION 'A bank transaction may back only one receipt.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_receivable_payment_one_bank_receipt ON public.receivable_payments;
CREATE TRIGGER trg_receivable_payment_one_bank_receipt
  BEFORE INSERT OR UPDATE OF bank_transaction_id, receipt_id, reversed_at ON public.receivable_payments
  FOR EACH ROW EXECUTE FUNCTION public.receivable_payment_one_bank_receipt();

REVOKE ALL ON FUNCTION public.receivable_payment_one_bank_receipt() FROM PUBLIC, anon, authenticated;

-- Voiding a bank transaction must reverse its effect on bank_accounts. The
-- legacy trigger handled inserts only, so voided rows left current_balance
-- overstated permanently.
CREATE OR REPLACE FUNCTION public.fn_update_bank_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_balance numeric(14,2);
  v_new_balance numeric(14,2);
  v_effect numeric(14,2);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_void IS TRUE THEN RETURN NEW; END IF;
    v_effect := CASE WHEN NEW.type = 'credit' THEN NEW.amount ELSE -NEW.amount END;
  ELSIF OLD.is_void IS NOT DISTINCT FROM NEW.is_void THEN
    RETURN NEW;
  ELSIF NEW.is_void IS TRUE THEN
    v_effect := CASE WHEN OLD.type = 'credit' THEN -OLD.amount ELSE OLD.amount END;
  ELSE
    v_effect := CASE WHEN NEW.type = 'credit' THEN NEW.amount ELSE -NEW.amount END;
  END IF;

  SELECT current_balance INTO v_current_balance
    FROM public.bank_accounts
   WHERE id = NEW.account_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank account % not found', NEW.account_id;
  END IF;

  v_new_balance := coalesce(v_current_balance, 0) + v_effect;
  NEW.running_balance := v_new_balance;
  UPDATE public.bank_accounts
     SET current_balance = v_new_balance, updated_at = now()
   WHERE id = NEW.account_id;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.bank_transactions') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_update_bank_balance ON public.bank_transactions';
    EXECUTE 'CREATE TRIGGER trg_update_bank_balance BEFORE INSERT OR UPDATE OF is_void ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.fn_update_bank_balance()';
  END IF;
END;
$$;
