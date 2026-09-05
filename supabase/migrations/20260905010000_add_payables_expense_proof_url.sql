-- ─────────────────────────────────────────────────────────────────────────────
-- Add payables.expense_proof_url — proof-of-EXPENSE document for a payable
-- (the bill/receipt being claimed), distinct from voucher_url which is the
-- proof-of-PAYMENT (payout receipt).
--
-- First used by Reimbursements: e.g. a Fuel claim stores the fuel bill here.
-- Nullable — most rows have none. Idempotent: safe to run more than once.
-- Run in the Supabase SQL Editor or via `supabase db push`.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.payables') IS NULL THEN
    RAISE NOTICE 'payables table not present — nothing to do';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'public.payables'::regclass
       AND attname  = 'expense_proof_url'
       AND NOT attisdropped
  ) THEN
    ALTER TABLE public.payables ADD COLUMN expense_proof_url TEXT;
    RAISE NOTICE 'Added payables.expense_proof_url';
  ELSE
    RAISE NOTICE 'payables.expense_proof_url already present — nothing to do';
  END IF;
END $$;
