-- Receivables cleanup: retire the rarely-used "Rental Income" category and fold any
-- existing rows into "Other Income". Client credit notes (auto-created by the invoice
-- balance-handling flow) now have a dedicated tab in the UI — no data change needed for those.
--
-- Idempotent: only touches rows still tagged 'Rental Income'.

UPDATE receivables
SET category = 'Other Income',
    notes = COALESCE(NULLIF(notes, '') || ' | ', '') || 'Reclassified from Rental Income'
WHERE category = 'Rental Income';

-- Verification (run manually after applying):
--   SELECT category, COUNT(*) FROM receivables GROUP BY category ORDER BY category;
