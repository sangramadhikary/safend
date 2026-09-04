-- Widen the receivables.status CHECK constraint to allow the invoice lifecycle
-- statuses introduced with Created -> Issued -> Open -> Overdue.
--
-- Background: invoices now start at 'created', become 'issued' when the PDF is
-- downloaded, and 'open'/'overdue' are derived at display time. The original
-- constraint only permitted the legacy set (pending/received/overdue/cancelled),
-- so saving an invoice with a new status failed with
-- "receivables_status_check" violations. 'pending' is retained for existing
-- rows and treated as an unpaid/created-equivalent state by the app.
--
-- This change is additive (it only widens the allowed set); no existing row
-- violates the new constraint.

ALTER TABLE receivables DROP CONSTRAINT IF EXISTS receivables_status_check;

ALTER TABLE receivables ADD CONSTRAINT receivables_status_check
  CHECK (status = ANY (ARRAY[
    'created'::text,
    'issued'::text,
    'open'::text,
    'pending'::text,
    'overdue'::text,
    'received'::text,
    'cancelled'::text
  ]));
