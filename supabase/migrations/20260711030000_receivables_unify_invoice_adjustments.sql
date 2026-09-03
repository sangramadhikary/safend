-- Unify client Credit Notes + Debit Notes into a single "Invoice Adjustments" category,
-- preserving the GST-required credit/debit distinction in a new adjustment_type column.
--
-- Accounting correctness: a credit note REDUCES the receivable, so its amounts are stored
-- as negative (contra) — this makes the receivables total net correctly. Debit notes stay positive.
--
-- Idempotent: uses -abs(...) for credit sign and only remaps rows still on the old categories.

-- 1. Add the type column (nullable; only Invoice Adjustments rows use it)
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS adjustment_type TEXT
  CHECK (adjustment_type IS NULL OR adjustment_type IN ('credit', 'debit'));

-- 2. Credit Notes → Invoice Adjustments (credit, contra/negative)
UPDATE receivables
SET category = 'Invoice Adjustments',
    adjustment_type = 'credit',
    amount = -abs(amount),
    total_amount = -abs(total_amount)
WHERE category = 'Credit Notes';

-- 3. Debit Notes → Invoice Adjustments (debit, positive)
UPDATE receivables
SET category = 'Invoice Adjustments',
    adjustment_type = 'debit'
WHERE category = 'Debit Notes';

-- Verification (run manually after applying):
--   SELECT category, adjustment_type, count(*), sum(total_amount)
--   FROM receivables GROUP BY category, adjustment_type ORDER BY category;
