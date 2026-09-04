-- Repair notification text that reads "Invoice #null".
--
-- Background: the delete-request notification message was built by interpolating
-- `receivables.reference_number` with no null guard. That column is legitimately
-- null for several categories (Event Letters always, Taxes / Other Income unless
-- the user typed a reference), so the template produced the literal text
-- "Invoice #null". The code is fixed, but `user_notifications.message` is
-- materialized at insert time, so rows written before the fix keep the bad text.
--
-- The original invoice number is not recoverable — there never was one. Instead
-- this reproduces the same fallback the fixed code now generates: the first 8
-- characters of the receivable id, which is available here because the
-- notification's `link` column stores '/accounts/<receivable_id>'. Rows without a
-- usable link get a neutral placeholder.
--
-- Idempotent: matches on the literal 'Invoice #null', which the replacements do
-- not reintroduce. Re-running affects zero rows.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Rows whose link carries the receivable id → reconstruct the id-slice label,
--    matching getInvoiceLabel() in ManageReceivables.tsx.
UPDATE public.user_notifications
   SET message = replace(
         message,
         'Invoice #null',
         'Invoice #' || left(split_part(link, '/', 3), 8)
       )
 WHERE message LIKE '%Invoice #null%'
   AND link LIKE '/accounts/%'
   AND length(split_part(link, '/', 3)) >= 8;

-- 2. Anything left (no link, or a link without an id) → neutral placeholder,
--    since no identifier is available to substitute.
UPDATE public.user_notifications
   SET message = replace(message, 'Invoice #null', 'Invoice #(no number)')
 WHERE message LIKE '%Invoice #null%';

-- 3. Same defect, different stringification — present if any caller ever passed
--    an undefined rather than a null.
UPDATE public.user_notifications
   SET message = replace(message, 'Invoice #undefined', 'Invoice #(no number)')
 WHERE message LIKE '%Invoice #undefined%';

DO $$
DECLARE remaining integer;
BEGIN
  SELECT count(*) INTO remaining
    FROM public.user_notifications
   WHERE message LIKE '%Invoice #null%'
      OR message LIKE '%Invoice #undefined%';
  RAISE NOTICE 'user_notifications: % row(s) still contain an unresolved invoice placeholder', remaining;
END $$;
