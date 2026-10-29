-- Credit and debit notes raised by hand, numbered and linked (CGST s.34, Rule 53).
--
-- Before: the Add form took a typed number, linked the note to no invoice, and a
-- credit note never reduced what the invoice owed. create_adjustment_note:
--   * numbers credit notes CN/<fy>/<seq> (shared with record_receipt's credit
--     notes) and debit notes DN/<fy>/<seq>, in the same transaction;
--   * links the note to its original tax invoice (credit_note_against_id) and
--     copies the recipient, place of supply, GST type and work order from it;
--   * computes GST at the original invoice's rate;
--   * applies a credit note against the invoice as a 'Credit Note' allocation,
--     so the balance drops (undo_last_receipt reverses it and cancels the note);
--   * raises a debit note as its own receivable on the same work order, due by
--     the given date, payable through Record Payment like an invoice.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.debit_note_number_counters (
  fy_prefix  text PRIMARY KEY,
  last_seq   integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.debit_note_number_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS debit_note_number_counters_select_staff ON public.debit_note_number_counters;
CREATE POLICY debit_note_number_counters_select_staff ON public.debit_note_number_counters
  FOR SELECT TO authenticated USING ((SELECT public.app_is_staff(auth.uid())));

CREATE OR REPLACE FUNCTION public.next_debit_note_number(p_fy_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq integer;
BEGIN
  IF p_fy_prefix IS NULL OR p_fy_prefix !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'next_debit_note_number: fy_prefix must be 4 digits, got %', p_fy_prefix;
  END IF;
  INSERT INTO public.debit_note_number_counters AS c (fy_prefix, last_seq)
  VALUES (p_fy_prefix, 1)
  ON CONFLICT (fy_prefix) DO UPDATE SET last_seq = c.last_seq + 1, updated_at = now()
  RETURNING c.last_seq INTO v_seq;
  RETURN 'DN/' || p_fy_prefix || '/' || CASE WHEN v_seq > 9999 THEN v_seq::text ELSE lpad(v_seq::text, 4, '0') END;
END;
$$;
REVOKE ALL ON FUNCTION public.next_debit_note_number(text) FROM PUBLIC, anon, authenticated;

-- p: { against_id, type: 'credit' | 'debit', taxable_value (> 0, before GST),
--      reason, due_date (debit notes; default: 7 days from today) }
CREATE OR REPLACE FUNCTION public.create_adjustment_note(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.receivables%ROWTYPE;
  v_type text := lower(coalesce(NULLIF(btrim(p->>'type'), ''), ''));
  v_taxable numeric := round(coalesce(NULLIF(p->>'taxable_value', '')::numeric, 0), 2);
  v_reason text := NULLIF(btrim(coalesce(p->>'reason', '')), '');
  v_rate numeric;
  v_gst numeric;
  v_total numeric;
  v_due numeric;
  v_credited numeric;
  v_number text;
  v_id uuid;
  v_fy text := public.fy_prefix_for(public.ist_today());
BEGIN
  IF NOT public.is_receivables_writer(v_uid) THEN
    RAISE EXCEPTION 'Only Accounts staff can raise credit or debit notes.' USING ERRCODE = '42501';
  END IF;
  IF v_type NOT IN ('credit', 'debit') THEN
    RAISE EXCEPTION 'Choose a credit note or a debit note.';
  END IF;
  IF v_taxable <= 0 THEN
    RAISE EXCEPTION 'Enter the taxable value (before GST), greater than zero.';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required on a credit or debit note.';
  END IF;

  SELECT * INTO v_inv FROM public.receivables WHERE id = NULLIF(p->>'against_id', '')::uuid FOR UPDATE;
  IF NOT FOUND OR v_inv.category <> 'Invoices' THEN
    RAISE EXCEPTION 'Select the tax invoice this note adjusts.';
  END IF;
  IF v_inv.status = 'cancelled' THEN
    RAISE EXCEPTION 'Invoice % is cancelled.', v_inv.reference_number;
  END IF;
  IF v_inv.status = 'created' AND v_inv.issued_at IS NULL AND coalesce(v_inv.paid_amount, 0) = 0 THEN
    RAISE EXCEPTION 'Invoice % is still a draft; edit it instead of raising a note.', v_inv.reference_number;
  END IF;

  -- GST at the original invoice's rate (exempt / zero-rated invoices: none).
  v_rate := CASE WHEN coalesce(v_inv.amount, 0) > 0 AND coalesce(v_inv.gst_amount, 0) > 0
                 THEN round(v_inv.gst_amount / v_inv.amount * 100, 2) ELSE 0 END;
  v_gst := round(v_taxable * v_rate / 100, 2);
  v_total := v_taxable + v_gst;

  IF v_type = 'credit' THEN
    -- A credit note reduces what the invoice owes; it cannot exceed it (a refund
    -- of money already received is not handled here), nor the invoice value
    -- less credit notes already issued against it.
    v_due := round(coalesce(v_inv.total_amount, 0) + coalesce(v_inv.opening_balance, 0) - coalesce(v_inv.paid_amount, 0), 2);
    SELECT coalesce(sum(-total_amount), 0) INTO v_credited FROM public.receivables
     WHERE category = 'Invoice Adjustments' AND credit_note_against_id = v_inv.id
       AND adjustment_type = 'credit' AND status <> 'cancelled';
    IF v_inv.status = 'received' OR v_due <= 0.01 THEN
      RAISE EXCEPTION 'Invoice % is fully paid, so a credit note would mean a refund. Record the refund separately.', v_inv.reference_number;
    END IF;
    IF v_total > v_due + 0.005 THEN
      RAISE EXCEPTION 'The credit note (₹% with GST) is more than invoice % still owes (₹%).', v_total, v_inv.reference_number, v_due;
    END IF;
    IF v_total > coalesce(v_inv.total_amount, 0) - v_credited + 0.005 THEN
      RAISE EXCEPTION 'Credit notes on invoice % would exceed its value.', v_inv.reference_number;
    END IF;
    v_number := public.next_credit_note_number(v_fy);
  ELSE
    v_number := public.next_debit_note_number(v_fy);
  END IF;

  INSERT INTO public.receivables (
    category, adjustment_type, description, client_name, client_gstin, client_address,
    place_of_supply, gst_type, gst_treatment, amount, gst_amount, total_amount, status,
    due_date, reference_number, notes, credit_note_against_id, work_order_id, branch_id, source, issued_at)
  VALUES (
    'Invoice Adjustments', v_type,
    initcap(v_type) || ' Note against Invoice ' || coalesce(v_inv.reference_number, '') || ': ' || v_reason,
    v_inv.client_name, v_inv.client_gstin, v_inv.client_address,
    v_inv.place_of_supply, v_inv.gst_type, v_inv.gst_treatment,
    CASE WHEN v_type = 'credit' THEN -v_taxable ELSE v_taxable END,
    CASE WHEN v_type = 'credit' THEN -v_gst ELSE v_gst END,
    CASE WHEN v_type = 'credit' THEN -v_total ELSE v_total END,
    CASE WHEN v_type = 'credit' THEN 'received' ELSE 'issued' END,
    CASE WHEN v_type = 'debit' THEN coalesce(NULLIF(p->>'due_date', '')::date, public.ist_today() + 7) END,
    v_number,
    'Against Invoice: ' || coalesce(v_inv.reference_number, '') || ' | Reason: ' || v_reason,
    v_inv.id, v_inv.work_order_id, v_inv.branch_id, 'app', now())
  RETURNING id INTO v_id;

  IF v_type = 'credit' THEN
    INSERT INTO public.receivable_payments (
      receivable_id, amount, tds_amount, mode, receipt_id, payment_date, credit_note_id,
      allocation_source, is_partial, balance_amount, notes, created_by, created_at)
    VALUES (v_inv.id, v_total, 0, 'Credit Note', gen_random_uuid(), public.ist_today(), v_id,
            'credit-note', v_due - v_total > 0.01, round(v_due - v_total, 2), 'Credit note ' || v_number, v_uid, now());
  END IF;

  RETURN (SELECT to_jsonb(x) FROM public.receivables x WHERE x.id = v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_adjustment_note(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_adjustment_note(jsonb) TO authenticated;

-- Notes are created only by the functions above and by record_receipt (which
-- run as their owner), never by a direct insert from the app, so every note is
-- numbered in sequence and linked to its invoice. Same guard as before plus
-- that rule.
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
  IF NEW.category = 'Invoice Adjustments' AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Credit and debit notes are raised against an invoice (Credit / Debit Note), so they are numbered in sequence and applied to it.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
