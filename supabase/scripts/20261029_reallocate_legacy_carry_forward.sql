-- ─────────────────────────────────────────────────────────────────────────────
-- Re-attribute legacy carried-forward receipts. Run AFTER migration
-- 20261029000000_invoice_ledger_integrity.sql. NOT a migration: review first.
--
-- Before that migration, a payment that covered an invoice plus dues carried
-- from older invoices was stored as ONE payment row on the newer invoice, and
-- the older invoices were only flagged 'received'. With balances now derived
-- from payment rows, the newer invoice shows as overpaid and the older ones
-- still owe money (audit scenario S1).
--
-- For every overpaid invoice this script moves the excess onto the carried
-- invoices named in its previous_balance_breakdown (or legacy "Outstanding:"
-- notes), oldest first, by splitting the payer's most recent payment rows. The
-- split rows share one receipt_id, so Undo still reverses the whole receipt.
-- TDS stays on the invoice it was withheld against.
--
-- Usage (Supabase SQL editor, as postgres):
--   1. Run as is. Nothing is written; the plan and the leftovers are listed.
--   2. Review both result sets.
--   3. Set v_apply to true below, run again, and keep the output.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS pg_temp.cf_plan;
DROP TABLE IF EXISTS pg_temp.cf_due;

CREATE TEMP TABLE cf_plan (
  payer_ref           text,
  payer_id            uuid,
  carried_ref         text,
  carried_id          uuid,
  moved               numeric,
  payer_excess_before numeric,
  carried_due_before  numeric,
  applied             boolean
);

-- Live balance of every invoice, adjusted as moves are planned.
CREATE TEMP TABLE cf_due AS
  SELECT id, round(coalesce(total_amount, 0) + coalesce(opening_balance, 0) - coalesce(paid_amount, 0), 2) AS due
    FROM public.receivables
   WHERE category = 'Invoices' AND status IS DISTINCT FROM 'cancelled';

DO $$
DECLARE
  v_apply constant boolean := false;  -- set to true only after reviewing the dry run
  o record;
  c record;
  p record;
  v_excess numeric;
  v_due numeric;
  v_move numeric;
  v_left numeric;
  v_take numeric;
  v_receipt uuid;
BEGIN
  FOR o IN
    SELECT r.id, r.reference_number, r.client_name, r.notes, r.previous_balance_breakdown,
           round(r.paid_amount - coalesce(r.total_amount, 0) - coalesce(r.opening_balance, 0), 2) AS excess
      FROM public.receivables r
     WHERE r.category = 'Invoices' AND r.status IS DISTINCT FROM 'cancelled'
       AND r.paid_amount - coalesce(r.total_amount, 0) - coalesce(r.opening_balance, 0) > 0.01
     ORDER BY r.created_at, r.reference_number
  LOOP
    v_excess := o.excess;
    FOR c IN
      SELECT s.* FROM (
        SELECT DISTINCT x.id, x.reference_number, x.created_at
          FROM public.receivables x
         WHERE x.category = 'Invoices' AND x.id <> o.id AND x.status IS DISTINCT FROM 'cancelled'
           AND lower(btrim(coalesce(x.client_name, ''))) = lower(btrim(coalesce(o.client_name, '')))
           AND x.reference_number IN (
             SELECT coalesce(e->>'referenceNumber', e->>'reference_number')
               FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.previous_balance_breakdown::jsonb) = 'array'
                                              THEN o.previous_balance_breakdown::jsonb ELSE '[]'::jsonb END) e
             UNION
             SELECT m[1]
               FROM regexp_matches(coalesce(substring(o.notes FROM 'Outstanding:\s*([^|]+)'), ''),
                                   '([0-9A-Za-z/-]{5,})\s*\(₹([0-9,]+(?:\.[0-9]+)?)\)', 'g') AS m)
      ) s
      ORDER BY s.created_at, s.reference_number
    LOOP
      EXIT WHEN v_excess <= 0.005;
      SELECT due INTO v_due FROM cf_due WHERE id = c.id;
      v_move := least(coalesce(v_due, 0), v_excess);
      CONTINUE WHEN v_move <= 0.005;

      INSERT INTO cf_plan VALUES (o.reference_number, o.id, c.reference_number, c.id, v_move, v_excess, v_due, v_apply);
      UPDATE cf_due SET due = round(due - v_move, 2) WHERE id = c.id;
      UPDATE cf_due SET due = round(due + v_move, 2) WHERE id = o.id;
      v_excess := round(v_excess - v_move, 2);

      IF v_apply THEN
        -- Take the cash from the payer's most recent receipts first.
        v_left := v_move;
        FOR p IN SELECT * FROM public.receivable_payments
                  WHERE receivable_id = o.id AND reversed_at IS NULL AND coalesce(mode, '') <> 'Credit Note'
                  ORDER BY created_at DESC, id DESC
        LOOP
          EXIT WHEN v_left <= 0.005;
          v_take := least(v_left, round(p.amount - coalesce(p.tds_amount, 0), 2));
          CONTINUE WHEN v_take <= 0;
          v_receipt := coalesce(p.receipt_id, gen_random_uuid());
          UPDATE public.receivable_payments
             SET amount = round(amount - v_take, 2), receipt_id = v_receipt
           WHERE id = p.id;
          INSERT INTO public.receivable_payments (
            receivable_id, amount, tds_amount, mode, received_by, cheque_number, cheque_date, bank_account_id,
            transaction_number, transaction_datetime, is_partial, receipt_id, payment_date, allocation_source,
            notes, created_by, created_at)
          VALUES (
            c.id, v_take, 0, p.mode, p.received_by, p.cheque_number, p.cheque_date, p.bank_account_id,
            p.transaction_number, p.transaction_datetime, false, v_receipt,
            coalesce(p.payment_date, p.created_at::date), 'reallocated-legacy',
            'Carried due paid through invoice ' || coalesce(o.reference_number, '') || ' (re-attributed by the 2026-10-29 ledger script)',
            p.created_by, p.created_at);
          v_left := round(v_left - v_take, 2);
        END LOOP;
        IF v_left > 0.005 THEN
          RAISE EXCEPTION 'Invoice %: only part of the ₹% to move to % was found in its payment rows; nothing was changed.',
            o.reference_number, v_move, c.reference_number;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Result 1: the moves (applied = false on a dry run).
SELECT payer_ref, carried_ref, moved, payer_excess_before, carried_due_before, applied
  FROM cf_plan
 ORDER BY payer_ref, carried_ref;

-- Result 2: left for manual review after the moves above. Negative balance =
-- money received beyond everything this invoice and its carried invoices owe
-- (a genuine overpayment or advance). Positive balance on a 'received' invoice
-- = flagged paid without a payment on file; the app treats it as settled until
-- Accounts records the missing receipt or raises a credit note.
SELECT r.reference_number, r.client_name, r.status, r.total_amount, r.opening_balance, r.paid_amount,
       d.due AS balance_after_plan
  FROM cf_due d
  JOIN public.receivables r ON r.id = d.id
 WHERE d.due < -0.01 OR (r.status = 'received' AND d.due > 0.01)
 ORDER BY r.client_name, r.created_at;
