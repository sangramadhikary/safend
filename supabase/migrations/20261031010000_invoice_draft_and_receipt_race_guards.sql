-- Close update-time and concurrency gaps left by the initial work-order guard.

CREATE OR REPLACE FUNCTION public.receivables_validate_draft_carry_forward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_breakdown jsonb := '[]'::jsonb;
  v_entry jsonb;
  v_entry_id uuid;
  v_seen_ids uuid[] := ARRAY[]::uuid[];
  v_carried public.receivables%ROWTYPE;
  v_due numeric;
  v_carried_total numeric := 0;
BEGIN
  IF current_setting('app.bypass_invoice_guards', true) = 'on'
     OR OLD.category <> 'Invoices'
     OR OLD.status <> 'created'
     OR OLD.issued_at IS NOT NULL
     OR coalesce(OLD.paid_amount, 0) <> 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.work_order_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = NEW.work_order_id) THEN
    RAISE EXCEPTION 'The selected work order no longer exists.';
  END IF;
  IF coalesce(NEW.opening_balance, 0) < 0 THEN
    RAISE EXCEPTION 'An opening balance cannot be negative.';
  END IF;

  IF NEW.previous_balance_breakdown IS NOT NULL THEN
    IF jsonb_typeof(NEW.previous_balance_breakdown::jsonb) <> 'array' THEN
      RAISE EXCEPTION 'Previous-balance details must be a list of invoices.';
    END IF;
    v_breakdown := NEW.previous_balance_breakdown::jsonb;
  END IF;
  IF jsonb_array_length(v_breakdown) > 0 AND NEW.work_order_id IS NULL THEN
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
    IF v_entry_id = OLD.id THEN
      RAISE EXCEPTION 'An invoice cannot carry itself as a previous due.';
    END IF;
    IF v_entry_id = ANY(v_seen_ids) THEN
      RAISE EXCEPTION 'A carried invoice was selected more than once.';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_entry_id);

    SELECT * INTO v_carried FROM public.receivables r
     WHERE r.id = v_entry_id AND r.category = 'Invoices' FOR UPDATE;
    IF NOT FOUND OR v_carried.status = 'cancelled' THEN
      RAISE EXCEPTION 'A carried invoice is missing or cancelled.';
    END IF;
    IF lower(btrim(coalesce(v_carried.client_name, ''))) <>
       lower(btrim(coalesce(NEW.client_name, ''))) THEN
      RAISE EXCEPTION 'Carried invoice % belongs to another client.', coalesce(v_carried.reference_number, v_entry_id::text);
    END IF;
    IF v_carried.work_order_id IS DISTINCT FROM NEW.work_order_id THEN
      RAISE EXCEPTION 'Carried invoice % belongs to another work order.', coalesce(v_carried.reference_number, v_entry_id::text);
    END IF;

    v_due := CASE WHEN v_carried.status = 'received' THEN 0 ELSE
      greatest(0, round(coalesce(v_carried.total_amount, 0) + coalesce(v_carried.opening_balance, 0)
                           - coalesce(v_carried.paid_amount, 0), 2)) END;
    IF v_due <= 0.01 THEN
      RAISE EXCEPTION 'Carried invoice % no longer has an outstanding balance.', coalesce(v_carried.reference_number, v_entry_id::text);
    END IF;
    IF abs(coalesce(NULLIF(v_entry->>'amount', '')::numeric, -1) - v_due) > 0.01 THEN
      RAISE EXCEPTION 'The balance of carried invoice % changed. Reload previous dues before saving this draft.',
        coalesce(v_carried.reference_number, v_entry_id::text);
    END IF;
    v_carried_total := round(v_carried_total + v_due, 2);
  END LOOP;

  IF abs(coalesce(NEW.previous_balance, 0) - round(v_carried_total + coalesce(NEW.opening_balance, 0), 2)) > 0.01 THEN
    RAISE EXCEPTION 'Previous due must equal the selected invoices plus the opening balance. Reload and try again.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_receivables_validate_draft_carry_forward ON public.receivables;
CREATE TRIGGER trg_receivables_validate_draft_carry_forward
  BEFORE UPDATE OF client_name, work_order_id, previous_balance, previous_balance_breakdown, opening_balance
  ON public.receivables
  FOR EACH ROW EXECUTE FUNCTION public.receivables_validate_draft_carry_forward();

REVOKE ALL ON FUNCTION public.receivables_validate_draft_carry_forward() FROM PUBLIC, anon, authenticated;

-- Serialize ownership checks on the referenced bank row so concurrent receipts
-- cannot attach one bank transaction to different receipt IDs.
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

  PERFORM 1 FROM public.bank_transactions WHERE id = NEW.bank_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The linked bank transaction does not exist.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.receivable_payments p
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

REVOKE ALL ON FUNCTION public.receivable_payment_one_bank_receipt() FROM PUBLIC, anon, authenticated;
