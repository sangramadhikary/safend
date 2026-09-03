-- ============================================================
-- bill_payments: de-duplicate, then prevent recurrence
-- ============================================================
-- Two rows existed for the same (bill_id, due_date) — same bill, same period,
-- same amount — created 400 MICROSECONDS apart:
--
--   PAY-MSDFYBKF  2026-08-03 16:26:12.395852+00
--   PAY-MSDFYBKC  2026-08-03 16:26:12.396252+00
--
-- Cause: generateUpcomingPayments() is invoked independently by several mounting
-- components (ProcurementModule, BillManagement, FacilityBookingsList). Each
-- checked for an existing row before inserting, but on a cold store both checks
-- completed before either insert landed, so both proceeded.
--
-- The pre-existing UNIQUE (payment_code) did not catch it: payment_code is
-- derived from Date.now(), so the two rows got different codes.
--
-- Application-level guards narrow this window but cannot close it. A 400µs gap
-- is far inside a single network round-trip, so only the database can serialise
-- the decision correctly.

BEGIN;

-- 1. Collapse existing duplicates, keeping the earliest row per group.
--    Restricted to rows carrying no money so a genuine part-payment can never
--    be removed by this cleanup.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY bill_id, due_date
           ORDER BY created_at, id
         ) AS rn
  FROM bill_payments
  WHERE paid_amount = 0
    AND status IN ('upcoming', 'due', 'overdue')
)
DELETE FROM bill_payments
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. One payment row per bill per due date, enforced by the database.
--    The app now treats the resulting 23505 as "a concurrent caller won the
--    race" and adopts that row rather than surfacing an error.
ALTER TABLE bill_payments
  DROP CONSTRAINT IF EXISTS bill_payments_bill_due_unique;
ALTER TABLE bill_payments
  ADD CONSTRAINT bill_payments_bill_due_unique UNIQUE (bill_id, due_date);

COMMIT;
