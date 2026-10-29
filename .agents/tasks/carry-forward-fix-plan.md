# Implementation Plan — Invoice Carry-Forward Bugs

Two confirmed bugs. Both are self-contained; FEAT-001 and FEAT-002 can be implemented independently.

---

## Bug 1 — `fetchWorkOrderOutstandingInvoices` siloes null-`work_order_id` invoices

**Root cause:** `outstanding.ts` returns `[]` immediately when `workOrderId` is null/blank (line ~14). Invoices created before migration `20260802200000` have `work_order_id = NULL` and are never included in carry-forward.

**Fix decision:** Add a client-name fallback path inside the same function. When `workOrderId` is blank but `clientName` is supplied, fall back to a `client_name`-scoped query. The work_order_id path is unchanged.

---

- [ ] 1. **Add `clientName` parameter and fallback query to `fetchWorkOrderOutstandingInvoices`**

  Replace the early-return guard so that a blank `workOrderId` with a non-blank `clientName` triggers a client-name query instead of returning `[]`.

  **Files:** `src/lib/invoice/outstanding.ts`

  **Exact change — function signature:**
  ```ts
  export async function fetchWorkOrderOutstandingInvoices(
    supabase: QueryableClient,
    workOrderId: string | null | undefined,
    excludeRef: string | null = null,
    clientName?: string | null,   // ← NEW optional param
  ): Promise<OutstandingInvoice[]>
  ```

  **Exact change — replace the early-return guard:**
  ```ts
  // Before:
  const woId = (workOrderId || '').trim();
  if (!woId) return [];

  // After:
  const woId = (workOrderId || '').trim();
  if (!woId) {
    const cName = (clientName || '').trim();
    if (!cName) return [];
    // Fallback: client-name scope for legacy invoices with work_order_id = NULL
    const { data, error } = await supabase
      .from('receivables')
      .select('reference_number, total_amount, previous_balance, previous_balance_breakdown, due_date, status, notes')
      .eq('category', 'Invoices')
      .in('status', UNPAID_STATUSES)
      .eq('client_name', cName)
      .order('due_date', { ascending: true });
    if (error || !data) return [];
    return computeOutstandingFromRows(data, excludeRef);
  }
  // existing work_order_id path continues unchanged below
  ```

  **Verify:** `npx tsc --noEmit` exits 0.

---

- [ ] 2. **Update caller in `GenerateInvoiceDialog.tsx`**

  Pass `selectedClientName` as the fourth argument. The state variable already exists (line ~119).

  **Files:** `src/modules/accounts/components/GenerateInvoiceDialog.tsx`

  **Exact change (line ~224):**
  ```ts
  // Before:
  const unpaid = await fetchWorkOrderOutstandingInvoices(supabaseClient, reviewWorkOrderId);
  // After:
  const unpaid = await fetchWorkOrderOutstandingInvoices(supabaseClient, reviewWorkOrderId, null, selectedClientName);
  ```

  **Verify:** `npx tsc --noEmit` exits 0.

---

- [ ] 3. **Update callers in `OneTimeInvoiceForm.tsx`**

  Two call sites. Both pass `clientName` state which is already set at the point of each call.

  **Files:** `src/modules/accounts/components/OneTimeInvoiceForm.tsx`

  **Call site 1 — edit-mode effect (line ~353–356):**
  ```ts
  // Before:
  const unpaid = await fetchWorkOrderOutstandingInvoices(
    supabaseClient,
    editEntry.work_order_id,
    editEntry.reference_number || null,
  );
  // After:
  const unpaid = await fetchWorkOrderOutstandingInvoices(
    supabaseClient,
    editEntry.work_order_id,
    editEntry.reference_number || null,
    editEntry.client_name || null,
  );
  ```

  **Call site 2 — `handleSelectWorkOrder` (line ~679–683):**
  ```ts
  // Before:
  const unpaid = await fetchWorkOrderOutstandingInvoices(
    supabaseClient,
    woId,
    editEntry?.reference_number || null,
  );
  // After:
  const unpaid = await fetchWorkOrderOutstandingInvoices(
    supabaseClient,
    woId,
    editEntry?.reference_number || null,
    clientName,  // state is set earlier in the same function (line ~553)
  );
  ```

  **Verify:** `npx tsc --noEmit` exits 0.

---

- [ ] 4. **Add unit tests for the client-name fallback path**

  Add a new `describe` block in `src/lib/invoice/outstanding.test.ts` using the existing `mockClient` helper.

  **Files:** `src/lib/invoice/outstanding.test.ts`

  **Tests to add:**
  ```ts
  describe('fetchWorkOrderOutstandingInvoices (client-name fallback)', () => {
    it('queries by client_name when workOrderId is null and clientName is supplied', async () => {
      const { client, calls } = mockClient([
        { reference_number: '26270008', total_amount: 52500, previous_balance: 0,
          due_date: '2026-08-12', status: 'overdue', notes: null },
      ]);

      const result = await fetchWorkOrderOutstandingInvoices(client, null, null, 'H H ENTERPRISES');
      expect(calls['eq:client_name']).toBe('H H ENTERPRISES');
      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(52500);
    });

    it('returns [] when workOrderId is null and clientName is blank', async () => {
      const { client } = mockClient([
        { reference_number: '26270008', total_amount: 52500, previous_balance: 0,
          due_date: '2026-08-12', status: 'overdue', notes: null },
      ]);

      expect(await fetchWorkOrderOutstandingInvoices(client, null, null, '')).toEqual([]);
      expect(await fetchWorkOrderOutstandingInvoices(client, null, null, null)).toEqual([]);
    });

    it('uses work_order_id path (not client_name) when workOrderId is present', async () => {
      const { client, calls } = mockClient([
        { reference_number: 'A', total_amount: 1000, previous_balance: 0,
          due_date: null, status: 'open', notes: null },
      ]);

      await fetchWorkOrderOutstandingInvoices(client, 'wo-456', null, 'SomeClient');
      expect(calls['eq:work_order_id']).toBe('wo-456');
      expect(calls['eq:client_name']).toBeUndefined();
    });
  });
  ```

  **Verify:** `npm run test` — all tests pass including the three new ones.

---

## Bug 2 — `previous_balance` is stale after partial payments

**Root cause:** `recordReceivedAmount` in `ManageReceivables.tsx` updates the paid invoice's `notes` with `Balance: ₹X` but never updates `previous_balance` on any newer invoice that carried this invoice's balance forward in its `previous_balance_breakdown`. Same problem applies when `undoLastPayment` restores a balance.

**Fix decision:** Add a module-level `propagateBalanceUpdate` helper that runs after the primary payment write. It finds all invoices referencing the paid invoice's ref, recomputes their `previous_balance` from live data, and updates them. Entire function is try/catch-wrapped — it NEVER blocks the payment.

---

- [ ] 5. **Add `propagateBalanceUpdate` helper function in `ManageReceivables.tsx`**

  Add this function at module level (after imports, before the component). Uses `supabaseClient` passed as a parameter.

  **Files:** `src/modules/accounts/components/ManageReceivables.tsx`

  **Type for parameter:** `typeof supabaseClient` (the imported constant from `@/integrations/supabase/client`)

  **Complete function:**
  ```ts
  /**
   * Best-effort: after recording or undoing a payment on invoice A, find all
   * newer invoices B that carry A forward in their previous_balance_breakdown,
   * and update B's previous_balance to reflect A's current remaining balance.
   *
   * Never throws — this is additive. The primary payment flow is unaffected.
   */
  async function propagateBalanceUpdate(
    supabase: typeof supabaseClient,
    paidRefNumber: string,
    newBalanceForPaidInvoice: number,
  ): Promise<void> {
    try {
      // Query for both key-name variants that appear in the JSONB breakdown.
      // Either or both may be present depending on which form created the invoice.
      const [q1, q2] = await Promise.all([
        supabase
          .from('receivables')
          .select('id, previous_balance, previous_balance_breakdown, reference_number')
          .filter('previous_balance_breakdown', 'cs', JSON.stringify([{ referenceNumber: paidRefNumber }])),
        supabase
          .from('receivables')
          .select('id, previous_balance, previous_balance_breakdown, reference_number')
          .filter('previous_balance_breakdown', 'cs', JSON.stringify([{ reference_number: paidRefNumber }])),
      ]);

      // Deduplicate by id
      const byId = new Map<string, any>();
      for (const row of [...(q1.data ?? []), ...(q2.data ?? [])]) {
        byId.set(row.id, row);
      }
      if (byId.size === 0) return;

      // For each invoice B, recompute its previous_balance from live data
      for (const invoiceB of byId.values()) {
        try {
          const breakdown: Array<any> = Array.isArray(invoiceB.previous_balance_breakdown)
            ? invoiceB.previous_balance_breakdown
            : [];

          // Collect the current remaining balance for each referenced invoice
          const updatedBreakdown: Array<any> = [];
          let newPreviousBalance = 0;

          for (const entry of breakdown) {
            const ref: string | undefined = entry?.referenceNumber ?? entry?.reference_number;
            if (!ref) {
              updatedBreakdown.push(entry);
              newPreviousBalance += Number(entry?.amount) || 0;
              continue;
            }

            // Fetch the referenced invoice's current state
            let remainingBalance: number;
            if (ref === paidRefNumber) {
              // We already know this one's new balance
              remainingBalance = newBalanceForPaidInvoice;
            } else {
              const { data: origRows } = await supabase
                .from('receivables')
                .select('total_amount, notes')
                .eq('reference_number', ref)
                .limit(1);
              const orig = origRows?.[0];
              if (!orig) {
                // Can't find the invoice — keep existing amount
                updatedBreakdown.push(entry);
                newPreviousBalance += Number(entry?.amount) || 0;
                continue;
              }
              // Parse balance note (same regex as parseBalanceFromNotes in outstanding.ts)
              const m = (orig.notes || '').match(/Balance:\s*₹?([\d,]+(?:\.\d+)?)/);
              if (m) {
                const parsed = parseFloat(m[1].replace(/,/g, ''));
                remainingBalance = Number.isFinite(parsed) ? parsed : Number(orig.total_amount) || 0;
              } else {
                remainingBalance = Number(orig.total_amount) || 0;
              }
            }

            // Preserve all existing entry fields; only update amount
            updatedBreakdown.push({ ...entry, amount: remainingBalance });
            newPreviousBalance += remainingBalance;
          }

          // Round to 2dp to match the rest of the codebase
          const rounded = Math.round(newPreviousBalance * 100) / 100;

          await supabase
            .from('receivables')
            .update({
              previous_balance: rounded,
              previous_balance_breakdown: updatedBreakdown,
            })
            .eq('id', invoiceB.id);
        } catch {
          // Per-invoice failure: log but continue
          console.warn(`[propagateBalanceUpdate] Failed to update invoice ${invoiceB.reference_number}`);
        }
      }
    } catch {
      // Outer failure: silently swallow. Payment flow must not be affected.
    }
  }
  ```

  **Verify:** `npx tsc --noEmit` exits 0 (especially: `typeof supabaseClient` resolves correctly).

---

- [ ] 6. **Call `propagateBalanceUpdate` after successful primary payment update in `recordReceivedAmount`**

  In the `recordReceivedAmount` mutationFn, after this block (line ~767–769):
  ```ts
  const { error } = await supabaseClient.from('receivables').update(updateData).eq('id', entry.id);
  if (error) throw new Error(error.message);
  ```

  Insert the propagation call BEFORE the `logChange` call:
  ```ts
  // Propagate the updated balance to any newer invoice that carries this
  // invoice forward in its previous_balance_breakdown. Best-effort — never
  // blocks the primary payment flow.
  if (entry.reference_number) {
    try {
      await propagateBalanceUpdate(supabaseClient, entry.reference_number, balanceAmount);
    } catch { /* best-effort: payment already recorded */ }
  }
  ```

  **Files:** `src/modules/accounts/components/ManageReceivables.tsx`

  **Verify:** `npx tsc --noEmit` exits 0.

---

- [ ] 7. **Call `propagateBalanceUpdate` after successful undo in `undoLastPayment`**

  The `undoLastPayment` mutationFn has two update paths — the main branch and a legacy fallback `else`. Add the propagation call after EACH primary update succeeds.

  **Files:** `src/modules/accounts/components/ManageReceivables.tsx`

  **Main branch (line ~422–425) — after `if (error) throw error;`:**
  ```ts
  // Propagate restored balance to any invoice carrying this one forward
  if (entry.reference_number) {
    try {
      await propagateBalanceUpdate(supabaseClient, entry.reference_number, entry.total_amount);
    } catch { /* best-effort */ }
  }
  ```
  When a payment is undone, the invoice's balance is restored to `entry.total_amount` (full amount, as if never paid).

  **Fallback `else` branch (line ~435–439) — after its `if (error) throw error;`:**
  ```ts
  if (entry.reference_number) {
    try {
      await propagateBalanceUpdate(supabaseClient, entry.reference_number, entry.total_amount);
    } catch { /* best-effort */ }
  }
  ```

  **Verify:** `npx tsc --noEmit` exits 0; `npm run test` all pass.

---

## Final Verification

After both bugs are implemented, run:

```
npx tsc --noEmit
npm run test
```

Both must exit cleanly. The test suite verifies FEAT-001's new fallback tests. TypeScript type-checks verify FEAT-002 (no unit tests exist for ManageReceivables).
