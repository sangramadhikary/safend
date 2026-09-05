-- ─────────────────────────────────────────────────────────────────────────────
-- Add payables.voucher_url — proof-of-payment document for a payable.
--
-- Used first by Reimbursements (Accounts → Payables → Reimbursements): the
-- uploaded payment voucher / bank-UPI receipt is stored in Supabase Storage and
-- its public URL is persisted here, so a payout can be verified without digging
-- through the free-text notes field. Nullable — most historic rows have none,
-- and non-reimbursement categories may leave it empty.
--
-- Idempotent: safe to run more than once.
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
       AND attname  = 'voucher_url'
       AND NOT attisdropped
  ) THEN
    ALTER TABLE public.payables ADD COLUMN voucher_url TEXT;
    RAISE NOTICE 'Added payables.voucher_url';
  ELSE
    RAISE NOTICE 'payables.voucher_url already present — nothing to do';
  END IF;
END $$;
