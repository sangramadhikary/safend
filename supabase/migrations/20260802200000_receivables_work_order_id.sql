-- ─────────────────────────────────────────────────────────────────────────────
-- Cross-work-order outstanding balance scoping: `work_order_id` on receivables.
--
-- The One-Time Invoice form auto-filled "Previous Due Amount" by querying
-- pending/overdue invoices for a client filtered by `client_name` alone. A
-- client with unpaid invoices across multiple work orders had that entire
-- cross-work-order balance silently inherited by every new invoice, regardless
-- of which work order it was actually for.
--
-- This migration adds the column needed to scope that query per work order.
-- It does NOT change any query or UI behavior by itself — see the accompanying
-- application changes in OneTimeInvoiceForm.tsx (outstanding-invoices query
-- scoping, opt-in "Include previous balance" button, and work_order_id on new
-- invoice inserts).
--
-- Nullable, no default, no backfill: existing `receivables` rows get
-- `work_order_id = NULL` and remain queryable via the legacy fallback path
-- (matched by `client_name` when `work_order_id IS NULL`).
--
-- Idempotent. Run in the Supabase SQL Editor or via `supabase db push`.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE receivables
  ADD COLUMN IF NOT EXISTS work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_receivables_work_order_id ON receivables(work_order_id);

COMMENT ON COLUMN receivables.work_order_id IS
  'Work order this invoice/receivable row was raised for. NULL for legacy rows and for invoices created outside a work-order context (e.g. new-client manual entry). Used to scope the outstanding-balance query so unpaid invoices from a different work order are not auto-applied to a new invoice for the same client. ON DELETE SET NULL: deleting a work order orphans its invoices rather than deleting them.';

-- Verification:
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'receivables' AND column_name = 'work_order_id';
--   SELECT COUNT(*) FILTER (WHERE work_order_id IS NULL) AS legacy_rows,
--          COUNT(*) FILTER (WHERE work_order_id IS NOT NULL) AS scoped_rows
--     FROM receivables;
