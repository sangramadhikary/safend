-- Compliance fix: credit / debit note GST sign
--
-- The Invoice Adjustments unification (20260711030000) stored credit notes as contra
-- entries (negative amount + total_amount) but left gst_amount positive. That made
-- credit notes ADD to output GST in GSTR-1 / GSTR-3B instead of reducing it,
-- overstating the net GST payable.
--
-- This migration aligns the GST component with the same sign convention:
--   credit note  → gst_amount negative (reduces output tax)
--   debit note   → gst_amount positive (increases output tax)
--
-- Idempotent: uses abs() so re-running cannot double-flip the sign.

-- Credit notes → negative GST
UPDATE receivables
SET gst_amount = -abs(gst_amount)
WHERE category = 'Invoice Adjustments'
  AND adjustment_type = 'credit'
  AND gst_amount IS NOT NULL
  AND gst_amount <> 0;

-- Debit notes → positive GST (defensive; should already be positive)
UPDATE receivables
SET gst_amount = abs(gst_amount)
WHERE category = 'Invoice Adjustments'
  AND adjustment_type = 'debit'
  AND gst_amount IS NOT NULL
  AND gst_amount <> 0;

-- Verification (run manually after applying):
--   SELECT adjustment_type, count(*), sum(amount) AS net_taxable, sum(gst_amount) AS net_gst
--   FROM receivables
--   WHERE category = 'Invoice Adjustments'
--   GROUP BY adjustment_type;
