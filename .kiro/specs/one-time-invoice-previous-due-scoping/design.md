# One-Time Invoice Previous Due Scoping — Bugfix Design

## Overview

The One-Time Invoice form in the Accounts module auto-fills the "Previous Due Amount" field by querying all pending/overdue invoices for a client by `client_name` alone. When a client has unpaid invoices across multiple work orders, every new invoice for that client silently inherits the entire cross-work-order balance. The fix has two orthogonal parts:

1. **Database**: Add a nullable `work_order_id` column to `receivables` so invoices can be scoped to their originating work order going forward.
2. **UX / Query**: Change the outstanding-balance flow from auto-fill to explicit opt-in. The amber panel becomes informational; a user must click "Include previous balance" to transfer the amount into `previousDue`.

The query is also updated to scope by `work_order_id` for rows that carry one, with a `work_order_id IS NULL` fallback for legacy rows.

---

## Glossary

- **Bug_Condition (C)**: The condition under which the bug manifests — a work order is selected in the form, the resulting `receivables` query returns invoices from a **different** work order (because filtering is only by `client_name`), and those amounts are **automatically** written into `previousDue` state.
- **Property (P)**: The desired behavior when the bug condition holds — outstanding invoices for other work orders are displayed for information only; `previousDue` is NOT auto-populated; the user must opt in.
- **Preservation**: All behaviors that must remain unchanged by this fix — manual `previousDue` editing, Net Payable formula, new-client flow, edit-invoice pre-fill, and `work_order_id IS NULL` rows remaining queryable.
- **handleSelectWorkOrder**: The async function in `OneTimeInvoiceForm.tsx` triggered when the user picks a work order. It currently calls `setPreviousDue(String(Math.round(total)))` unconditionally.
- **receivables**: The Supabase table that stores all invoice and payment records. Currently has no `work_order_id` column.
- **selectedWorkOrderId**: React state that holds the UUID of the chosen work order at form time.
- **outstandingInvoices**: React state array holding the list of pending/overdue invoices fetched for the client.

---

## Bug Details

### Bug Condition

The bug manifests when a user selects an existing work order in the One-Time Invoice form for a client that has pending or overdue invoices belonging to a **different** work order. `handleSelectWorkOrder` queries `receivables` filtered only by `client_name` and `category = 'Invoices'`, then unconditionally calls `setPreviousDue(...)` with the summed total. There is no check for whether those invoices belong to the selected work order.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { selectedWorkOrderId: UUID, clientName: string }
  OUTPUT: boolean

  outstandingRows := query receivables
    WHERE client_name = input.clientName
      AND category = 'Invoices'
      AND status IN ('pending', 'overdue')

  crossWoRows := outstandingRows
    WHERE work_order_id IS NOT NULL
      AND work_order_id != input.selectedWorkOrderId

  RETURN crossWoRows.length > 0
         AND previousDue state is auto-set to sum(outstandingRows)
END FUNCTION
```

### Examples

- **Direct cross-WO bleed**: Client "ABC Security Ltd" has Work Order WO-001 (₹50,000 pending). User opens a new invoice for WO-002 for the same client. Bug: `previousDue` is set to ₹50,000 automatically; user sees inflated Net Payable and may not notice.
- **Multi-WO accumulation**: Same client has WO-001 (₹50,000) and WO-003 (₹30,000) both pending. New invoice for WO-004: bug sets `previousDue` to ₹80,000 — balances from two unrelated work orders.
- **New client (no bug)**: User selects "New Customer" mode and enters details manually. No work order is selected; the query is never run. `previousDue` stays empty. Correct behavior.
- **Only legacy rows (no bug under fix)**: All pending invoices for the client have `work_order_id IS NULL`. The fixed query includes them via the IS NULL fallback, so they still surface in the panel — but are not auto-applied.

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Manual edits to the `previousDue` input field must continue to affect Net Payable in real time.
- Net Payable formula must remain: `Invoice Total − TDS + previousDue` — no change to arithmetic.
- New-client flow (no work order selected) must remain unaffected: no outstanding query, no `previousDue` auto-fill.
- Edit-invoice flow (`editEntry` prop supplied) must continue to pre-fill `previousDue` from stored invoice notes, unchanged.
- Existing `receivables` rows with `work_order_id = NULL` must remain queryable and visible across the application — the column is nullable with no NOT NULL constraint and no backfill.
- The outstanding invoices amber panel must remain visible when relevant invoices are found.

**Scope:**
All inputs that do NOT involve selecting a work order for a client that has cross-work-order outstanding balances are completely unaffected. This includes:
- New-client manual entry
- Edit-invoice mode
- Clients with no outstanding invoices
- Clients whose only outstanding invoices belong to the same work order being invoiced

---

## Hypothesized Root Cause

Based on code review of `handleSelectWorkOrder` in `OneTimeInvoiceForm.tsx`:

1. **Missing work-order filter in the outstanding-invoices query**: The Supabase query at lines ~462–478 filters only on `client_name` and `category = 'Invoices'`. The `work_order_id` column does not exist on `receivables` today, making work-order-level scoping impossible without a schema change.

2. **Unconditional auto-fill of `previousDue`**: After the query, `setPreviousDue(String(Math.round(total)))` is called with no guard. There is no "did the user ask for this?" check. The UX design assumption is that any outstanding balance for the client name is relevant to the current invoice — which is false when the client has multiple active work orders.

3. **No `work_order_id` on new inserts**: The `payload` object in the `createInvoice` mutation does not include `work_order_id`. Even if the schema were extended, new invoices would still be saved without the association, perpetuating the problem for future queries.

4. **Legacy data gap**: Even after the migration, all historical `receivables` rows will have `work_order_id = NULL`. A strict `work_order_id = selectedWorkOrderId` filter would silently drop all legacy outstanding balances. The fix must handle this with an IS NULL fallback.

---

## Correctness Properties

Property 1: Bug Condition — Outstanding Balance Is Not Auto-Applied

_For any_ form state where `selectedWorkOrderId` is set and the outstanding-invoices query returns at least one row, the fixed `handleSelectWorkOrder` function SHALL set `outstandingInvoices` state to the fetched rows (for display) but SHALL NOT call `setPreviousDue` with any non-empty value. The `previousDue` input SHALL remain `''` (empty) until the user explicitly clicks "Include previous balance".

**Validates: Requirements 2.2, 2.3**

Property 2: Preservation — Manual previousDue and Net Payable Formula

_For any_ input where the user manually types into the `previousDue` field (or clicks "Include previous balance"), the fixed code SHALL produce exactly the same Net Payable calculation as the original code: `invoiceTotal − tdsAmt + prevDue`. No change to the arithmetic or persistence logic is introduced.

**Validates: Requirements 3.1, 3.2**

Property 3: Preservation — Non-Work-Order Paths Unchanged

_For any_ form session where `selectedWorkOrderId` is empty (new-client mode or edit-invoice mode), the fixed code SHALL produce exactly the same behavior as the original code — no outstanding query is run, `previousDue` is not touched by `handleSelectWorkOrder`, and `editEntry` pre-fill continues to work as before.

**Validates: Requirements 3.3, 3.4, 3.5**

Property 4: Query Scoping — Work Order ID Filter with Legacy Fallback

_For any_ work order selection where the `receivables` table contains rows with a `work_order_id`, the fixed query SHALL return only rows where `work_order_id = selectedWorkOrderId` OR `work_order_id IS NULL`, ensuring cross-work-order rows are excluded while legacy unscoped rows are preserved.

**Validates: Requirements 2.1, 3.6**

---

## Fix Implementation

### Changes Required

**File 1**: `main/supabase/migrations/20260802200000_receivables_work_order_id.sql`

**Purpose**: Add `work_order_id` to `receivables` to enable work-order-level scoping.

**Specific Changes:**
1. **ADD COLUMN**: `ALTER TABLE receivables ADD COLUMN IF NOT EXISTS work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL;`
   - Nullable — no NOT NULL constraint, no default.
   - `ON DELETE SET NULL` — if a work order is deleted, its invoices are orphaned gracefully rather than cascade-deleted.
   - No backfill: existing rows remain NULL and fall into the legacy fallback path.
2. **INDEX**: `CREATE INDEX IF NOT EXISTS idx_receivables_work_order_id ON receivables(work_order_id);` — supports the new filter efficiently.

---

**File 2**: `main/src/modules/accounts/components/OneTimeInvoiceForm.tsx`

**Function**: `handleSelectWorkOrder` — outstanding invoices query and state update

**Specific Changes:**

1. **Update the Supabase query** to filter by `work_order_id` with IS NULL fallback:
   ```
   // BEFORE (buggy):
   .eq('client_name', wo.clientName)
   .eq('category', 'Invoices')
   .in('status', ['pending', 'overdue'])

   // AFTER (fixed):
   .eq('category', 'Invoices')
   .in('status', ['pending', 'overdue'])
   .or(`work_order_id.eq.${woId},work_order_id.is.null`)
   // For the IS NULL fallback, also enforce client_name match so we don't
   // pull legacy rows for other clients:
   // Implemented as a two-query UNION or a PostgREST filter:
   //   (work_order_id = woId) OR (work_order_id IS NULL AND client_name = clientName)
   ```
   Since PostgREST's `.or()` supports column-level filters, the exact filter is:
   ```
   .or(`work_order_id.eq.${woId},and(work_order_id.is.null,client_name.eq.${wo.clientName})`)
   ```

2. **Remove the auto-fill of `previousDue`**: Delete `setPreviousDue(String(Math.round(total)))`. The `outstandingInvoices` state is still set (for panel display), but `previousDue` remains `''`.

3. **Add "Include previous balance" button** to the outstanding invoices amber panel in the JSX:
   - A button labeled "Include previous balance" inside the panel header row.
   - On click: `setPreviousDue(String(Math.round(total)))` — the same value that was previously auto-applied.
   - The button disappears or is disabled once `previousDue` already equals the panel total (idempotent).

4. **Update the amber panel header text** from "Outstanding invoices auto-detected" to "Outstanding invoices detected" (remove "auto" to accurately reflect the new opt-in behavior).

5. **Include `work_order_id` in the INSERT/UPDATE payload** in the `createInvoice` mutation:
   ```
   const payload = {
     ...existingFields,
     work_order_id: selectedWorkOrderId || null,
   };
   ```

---

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the auto-fill bug BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Plan**: Write tests that mock the Supabase `receivables` query to return invoices belonging to a different work order than the one selected, then assert what `previousDue` state becomes after `handleSelectWorkOrder` runs. Run on UNFIXED code to observe the auto-fill failure.

**Test Cases**:
1. **Cross-WO auto-fill**: Select WO-002; mock `receivables` to return a pending invoice tagged to WO-001 for the same client. Assert that `previousDue` is auto-set (will fail after fix — demonstrates the bug on unfixed code).
2. **Multi-WO accumulation**: Select WO-003; mock two pending invoices from WO-001 and WO-002. Assert `previousDue` is set to their sum (demonstrates the accumulation bug).
3. **Same-WO — should surface**: Select WO-001; mock a pending invoice from WO-001. Assert `previousDue` is auto-set (this should still work on unfixed code — establishes correct baseline).
4. **No outstanding**: Select any WO; mock empty query result. Assert `previousDue` remains `''` (should pass on both unfixed and fixed code — sanity check).

**Expected Counterexamples**:
- On unfixed code, tests 1 and 2 will show `previousDue` populated with cross-WO amounts.
- Confirms root cause: unconditional `setPreviousDue` call with no work-order filter.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior (panel shows, `previousDue` stays empty).

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := handleSelectWorkOrder_fixed(input.selectedWorkOrderId)
  ASSERT outstandingInvoices.length > 0        // panel is shown
  ASSERT previousDue === ''                    // NOT auto-applied
  
  // Now simulate user clicking "Include previous balance"
  click("Include previous balance")
  ASSERT previousDue === String(Math.round(sum(outstandingInvoices)))
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handleSelectWorkOrder_original(input) ≡ handleSelectWorkOrder_fixed(input)
  // i.e., outstandingInvoices state and previousDue state are identical
END FOR
```

**Testing Approach**: Property-based testing is used for preservation checking because:
- It generates many combinations of work order IDs and invoice states automatically.
- It catches edge cases (e.g., all-NULL work_order_id rows, empty client name, zero-amount invoices).
- It provides a strong guarantee that the non-buggy code path is unchanged across the full input domain.

**Test Plan**: Observe correct behavior on unfixed code for non-buggy paths (same-WO invoices, no outstanding, new-client mode), then write property-based tests capturing that behavior and run them against the fixed code.

**Test Cases**:
1. **Same-WO preservation**: Mock a pending invoice whose `work_order_id` matches the selected WO. Both unfixed and fixed code should populate `outstandingInvoices`. Fixed code should still NOT auto-fill `previousDue` (opt-in only).
2. **Legacy (NULL) rows**: Mock a pending invoice with `work_order_id = NULL` for the same client. Fixed query should include it; panel should show it; `previousDue` still not auto-filled.
3. **New-client mode**: `selectedWorkOrderId = ''`. No query runs. `previousDue` stays `''`. Identical in both versions.
4. **Edit-invoice mode**: `editEntry` supplied. `previousDue` is pre-filled from `notes` field, not from a query. Identical in both versions.
5. **Manual override**: User types `5000` into `previousDue` directly. Net Payable updates. Save persists it. Identical in both versions.

### Unit Tests

- Test `handleSelectWorkOrder` with mocked Supabase: cross-WO invoices → panel populated, `previousDue` empty.
- Test the "Include previous balance" button click: `previousDue` set to panel total.
- Test the PostgREST filter string construction for correct `work_order_id` scoping.
- Test `createInvoice` payload: assert `work_order_id` is included when `selectedWorkOrderId` is set, and is `null` when not set.
- Test edge cases: zero-balance invoices filtered out; partial-payment balance extraction from `notes` unchanged.

### Property-Based Tests

- **Property 1 (Bug Condition)**: For any mock `receivables` dataset containing invoices where `work_order_id !== selectedWorkOrderId`, after `handleSelectWorkOrder` runs on fixed code, `previousDue` is always `''`.
- **Property 2 (Preservation — Net Payable)**: For any `previousDue` value set manually or via button, `netPayable === invoiceTotal - tdsAmt + parseFloat(previousDue || '0')` always holds, regardless of how `previousDue` was set.
- **Property 3 (Legacy fallback)**: For any `receivables` dataset where all outstanding rows have `work_order_id = NULL` and `client_name` matches, the fixed query includes them (panel is non-empty).
- **Property 4 (Scoping exclusion)**: For any `receivables` dataset where a row has `work_order_id` set to a UUID that does not equal `selectedWorkOrderId`, that row is never included in `outstandingInvoices` after the fix.

### Integration Tests

- Full form flow: select WO with cross-WO outstanding balance → confirm panel shows but `previousDue` is empty → click "Include previous balance" → confirm `previousDue` fills → submit → confirm saved record has correct `work_order_id` and `notes`.
- Full form flow: select WO with only same-WO outstanding balance → panel shows → submit without including → confirm `previousDue` not in saved notes.
- Edit invoice flow: open existing invoice with `previousDue` in notes → confirm field pre-fills from notes, not from query → submit → confirm unchanged.
- New-client flow: enter client manually → confirm no outstanding panel, no `previousDue` auto-fill → submit → confirm `work_order_id = null` in saved record.
- Migration integration: confirm `receivables` rows inserted after migration carry `work_order_id`; rows inserted before have `work_order_id = NULL`; no RLS or constraint errors on either.
