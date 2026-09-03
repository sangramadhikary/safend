# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Cross-Work-Order Auto-Fill Bug
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate `setPreviousDue` is called unconditionally with cross-WO balances
  - **Scoped PBT Approach**: Scope the property to the concrete failing cases: a work order is selected (`selectedWorkOrderId = WO-002`), and the mocked `receivables` query returns at least one invoice whose `work_order_id` differs from the selected work order (`work_order_id = WO-001`)
  - Mock the Supabase `receivables` query to return a pending invoice tagged to WO-001 (not the selected WO-002) for the same client name
  - Assert that after `handleSelectWorkOrder(WO-002)` completes, `previousDue` state equals `''` (empty) — cross-WO amount must NOT be auto-applied
  - Also cover multi-WO accumulation: mock two pending invoices from WO-001 and WO-002 when WO-003 is selected; assert `previousDue` stays `''`
  - Run test on UNFIXED code — the test will FAIL because `setPreviousDue(String(Math.round(total)))` is called unconditionally
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists)
  - Document counterexamples found (e.g., "handleSelectWorkOrder(WO-002) sets previousDue to ₹50,000 from WO-001 invoice instead of leaving it empty")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Buggy Paths Unchanged
  - **IMPORTANT**: Follow observation-first methodology — run UNFIXED code first, observe outputs, then encode as properties
  - **Observe on UNFIXED code**:
    - `handleSelectWorkOrder(WO-001)` with a mock returning a pending invoice for WO-001 → `outstandingInvoices` is populated, `previousDue` is auto-set to the total
    - `handleSelectWorkOrder` with `selectedWorkOrderId = ''` (new-client mode) → no query runs, `previousDue` stays `''`
    - Edit-invoice mode (`editEntry` supplied) → `previousDue` pre-filled from `notes` field, not from query
    - User types `5000` into `previousDue` directly → `netPayable === invoiceTotal - tdsAmt + 5000`
    - `receivables` rows with `work_order_id = NULL` and matching `client_name` → included in the outstanding query result
  - Write property-based tests capturing the observations above that must remain true after the fix:
    - For all `previousDue` values set manually or via the "Include previous balance" button, `netPayable === invoiceTotal − tdsAmt + parseFloat(previousDue || '0')` always holds
    - For all form sessions where `selectedWorkOrderId` is empty, no outstanding query runs and `previousDue` is not touched by `handleSelectWorkOrder`
    - For all `editEntry` sessions, `previousDue` is pre-filled from `notes` only, unchanged
    - For all `receivables` datasets where outstanding rows have `work_order_id = NULL` with matching `client_name`, the fixed query must still include them (legacy fallback)
  - Run these tests on UNFIXED code to confirm they all pass and establish the preservation baseline
  - **EXPECTED OUTCOME**: Tests PASS on unfixed code (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix cross-work-order outstanding balance scoping

  - [x] 3.1 Add `work_order_id` column to the `receivables` table
    - Create migration file `main/supabase/migrations/20260802200000_receivables_work_order_id.sql`
    - Add: `ALTER TABLE receivables ADD COLUMN IF NOT EXISTS work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL;`
    - Add: `CREATE INDEX IF NOT EXISTS idx_receivables_work_order_id ON receivables(work_order_id);`
    - Column is nullable with no NOT NULL constraint and no default — existing rows get `work_order_id = NULL` automatically
    - `ON DELETE SET NULL` ensures work order deletion orphans invoices gracefully rather than cascading
    - _Bug_Condition: isBugCondition(input) — the `work_order_id` column not existing makes work-order-level scoping impossible_
    - _Preservation: Existing rows with `work_order_id = NULL` remain queryable and visible across the application (Requirement 3.6)_
    - _Requirements: 2.1, 2.4, 3.6_

  - [x] 3.2 Update the outstanding-invoices query to scope by `work_order_id` with IS NULL fallback
    - In `handleSelectWorkOrder` in `OneTimeInvoiceForm.tsx`, replace the `.eq('client_name', wo.clientName)` filter with:
      `.or(\`work_order_id.eq.${woId},and(work_order_id.is.null,client_name.eq.${wo.clientName})\`)`
    - Also retain `.eq('category', 'Invoices')` and `.in('status', ['pending', 'overdue'])` filters unchanged
    - This ensures: rows scoped to the selected work order are included; legacy `NULL` rows for the same client are included; cross-WO rows for other work orders are excluded
    - _Bug_Condition: Query currently filters only by `client_name`, pulling in invoices from all work orders for that client_
    - _Expected_Behavior: Query returns only rows where `work_order_id = selectedWorkOrderId` OR (`work_order_id IS NULL` AND `client_name = clientName`)_
    - _Preservation: Legacy rows with `work_order_id = NULL` and matching `client_name` remain visible in the outstanding panel (Requirement 3.6)_
    - _Requirements: 2.1, 3.6_

  - [x] 3.3 Remove the unconditional `setPreviousDue` auto-fill call
    - In `handleSelectWorkOrder`, delete the line `setPreviousDue(String(Math.round(total)))` that was called unconditionally after the outstanding-invoices query
    - `setOutstandingInvoices(unpaid)` must still be called — the panel display is preserved
    - `previousDue` state must remain `''` (empty) after `handleSelectWorkOrder` completes, regardless of what the query returns
    - _Bug_Condition: `setPreviousDue(String(Math.round(total)))` is called with no guard for work-order membership, auto-applying cross-WO balances_
    - _Expected_Behavior: `previousDue` stays `''` after work order selection; user must explicitly opt in via "Include previous balance" button_
    - _Requirements: 2.2, 2.3_

  - [x] 3.4 Add "Include previous balance" opt-in button to the outstanding invoices amber panel
    - In the JSX amber outstanding invoices panel, update the header text from "auto-detected" to "detected" (remove "auto")
    - Add a button labeled "Include previous balance" inside the panel header row
    - On click: call `setPreviousDue(String(Math.round(total)))` where `total` is `outstandingInvoices.reduce((s, r) => s + r.amount, 0)` — the same value previously auto-applied
    - The button should be disabled (or hidden) when `previousDue` already equals the panel total to make the action idempotent
    - _Expected_Behavior: User explicitly clicks to transfer the outstanding total into `previousDue`; Net Payable updates accordingly_
    - _Preservation: Once `previousDue` is set (by button or manual entry), `netPayable = invoiceTotal − tdsAmt + prevDue` formula is unchanged (Requirement 3.2)_
    - _Requirements: 2.2, 2.3, 3.1, 3.2_

  - [x] 3.5 Include `work_order_id` in the `createInvoice` mutation payload
    - In the `createInvoice` mutation's `payload` object, add: `work_order_id: selectedWorkOrderId || null`
    - When a work order is selected, the new receivable row is scoped to that work order UUID
    - When no work order is selected (new-client / manual entry), `work_order_id` is saved as `null`
    - This applies to both INSERT (new invoice) and UPDATE (edit invoice) paths
    - _Bug_Condition: Without `work_order_id` on new inserts, future outstanding-balance queries would still pull cross-WO rows for newly created invoices_
    - _Expected_Behavior: New receivable rows carry `work_order_id` so future scoped queries work correctly_
    - _Preservation: New-client flow continues to save with `work_order_id = null` (Requirement 2.5, 3.3)_
    - _Requirements: 2.4, 2.5, 3.3_

  - [x] 3.6 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Cross-Work-Order Auto-Fill Bug
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior: after `handleSelectWorkOrder`, `previousDue` must be `''` when cross-WO invoices are present in the query result
    - Run bug condition exploration test from step 1 against the fixed code
    - **EXPECTED OUTCOME**: Test PASSES (confirms the unconditional `setPreviousDue` is removed and query scoping excludes cross-WO rows)
    - _Requirements: 2.2, 2.3_

  - [x] 3.7 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Buggy Paths Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run all preservation property tests from step 2 against the fixed code
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in Net Payable formula, new-client flow, edit-invoice pre-fill, and legacy NULL row handling)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint — Ensure all tests pass
  - Run the full test suite and confirm both the bug condition exploration test (task 1) and all preservation tests (task 2) pass
  - Verify the migration file is syntactically valid SQL and can be applied without errors
  - Verify the UI renders the amber panel with the "Include previous balance" button and that clicking it correctly populates `previousDue`
  - Verify that submitting an invoice with a selected work order saves `work_order_id` on the `receivables` row
  - Verify that submitting in new-client mode saves `work_order_id = null`
  - Ask the user if any questions arise before marking complete
