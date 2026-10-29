# Invoice Carry-Forward / Previous Balance — Findings Report

**Investigated:** `H H ENTERPRISES` — Invoice 26270038 (04 Sep 2026, Partial) and Invoice 26270008 (05 Aug 2026, Overdue 91d), each ₹52,500.

---

## Summary Answer

**There is a confirmed double-counting bug specific to the partial-payment path, and a second issue with `work_order_id` scoping that may affect H H ENTERPRISES specifically.**

### Bug 1 — CONFIRMED (Critical): Partial payment does NOT update the old invoice's "Balance" note when the payment comes from the Receive Amount dialog on the NEWER invoice

When Invoice 26270008 (Aug) has a partial payment recorded against it:
- The payment metadata writes `Balance: ₹X` into the notes of **26270008 only**.
- Invoice 26270038 (Sep) was created BEFORE any partial payment was recorded on 26270008. Its `previous_balance` and `previous_balance_breakdown` were snapshotted at creation time with the FULL unpaid amount of 26270008.
- When `computeOutstandingFromRows` later runs to calculate what still shows on the Sep invoice's payment advice, it reads 26270008's notes to find a `Balance: ₹X` note, and uses that reduced figure. BUT 26270008's full amount (₹52,500) is also listed in 26270038's `previous_balance_breakdown`.
- `collectRolledForwardRefs` suppresses 26270008 from appearing as a standalone invoice — **but 26270038's stored `previous_balance` still contains the original full amount (₹52,500 or more), not the post-payment residual.** The payment advice for 26270038 therefore still shows the old, larger previous balance.

In other words: **the `previous_balance` column on invoice 26270038 is stale**. It was set at creation time to the full unpaid amount of 26270008, but partial payments on 26270008 recorded afterward do not retroactively update 26270038's `previous_balance`.

### Bug 2 — LIKELY: Older invoices may have `work_order_id = NULL`

The `work_order_id` column was added in migration `20260802200000_receivables_work_order_id.sql` with no backfill. Invoices created before that date have `work_order_id = NULL`. In `fetchWorkOrderOutstandingInvoices` a null/blank work order ID returns `[]` immediately — so if 26270008 was created without a `work_order_id`, the Sep invoice's creation-time carry-forward fetch returned nothing, and **no previous balance was set at all**. The scenario the user sees (both invoices marked separately as Overdue/Partial without a coherent carry-forward) is consistent with this.

### Bug 3 — DESIGN GAP: `computeSettlement` uses `previousDue` from the invoice's own column

When `recordReceivedAmount` is called to record a partial payment on invoice 26270038 (which carries a `previous_balance` from 26270008), the `computeSettlement` call uses `entry.total_amount + previousDue` as `totalPayable`. The balance it writes back (`Balance: ₹X`) therefore includes the previous balance in the residual — **which is correct**. But the NEXT invoice raised for this client will re-read the old raw `previous_balance` column from 26270038, not the reduced post-payment balance, potentially re-adding an amount the client already partially cleared.

---

## Evidence with File/Symbol References

### 1. Where `previous_balance` is set when creating a new invoice

**`src/modules/accounts/components/GenerateInvoiceDialog.tsx`, line ~421-427:**
```ts
previous_balance: previousDue > 0 ? previousDue : null,
previous_balance_breakdown:
  previousDue > 0 && outstandingInvoices.length > 0
    ? outstandingInvoices.map(i => ({
        referenceNumber: i.ref,
        date: i.due_date || null,
        amount: i.amount,
      }))
    : null,
```
`previousDue` = `sumOutstanding(outstandingInvoices)` — fetched at the moment of invoice generation, not dynamically tracked afterward.

**`src/modules/accounts/components/OneTimeInvoiceForm.tsx`, line ~825-836:**  
Identical pattern — `prevDue` is the value from `fetchWorkOrderOutstandingInvoices` at form-open time, frozen into the new invoice row.

**Key fact:** `previous_balance` is written ONCE at invoice creation and **never updated** when payments are subsequently recorded on the older invoices it references.

---

### 2. `fetchWorkOrderOutstandingInvoices` and `computeOutstandingFromRows`

**`src/lib/invoice/outstanding.ts`:**

```ts
export async function fetchWorkOrderOutstandingInvoices(
  supabase, workOrderId, excludeRef
): Promise<OutstandingInvoice[]> {
  const woId = (workOrderId || '').trim();
  if (!woId) return [];   // ← returns [] when work_order_id is null/blank
  ...
}
```

If 26270008 has `work_order_id = NULL`, then when 26270038 was created, `fetchWorkOrderOutstandingInvoices` returned `[]`, `previousDue` was 0, and 26270038 was created with `previous_balance = NULL`. **Neither invoice references the other**, and the system shows them as fully independent, which explains the screenshot — both show their own full ₹52,500 amount with no cross-reference.

`computeOutstandingFromRows` (`src/lib/invoice/outstanding.ts`, function starting at line ~124):
- Calls `collectRolledForwardRefs` to build a set of refs already rolled into newer invoices' `previous_balance_breakdown`.
- If 26270008 is listed in 26270038's breakdown, it is suppressed from double-counting.
- **BUT** if `previous_balance_breakdown` was never set (due to the `work_order_id = NULL` path), 26270008 is NOT in the rolled-forward set, and appears as a standalone unpaid invoice.

`toOutstanding` (`src/lib/invoice/outstanding.ts`, line ~100):
```ts
function toOutstanding(r: any, now: Date): OutstandingInvoice {
  const notesBalance = parseBalanceFromNotes(r.notes);
  const previousBalance = Number(r.previous_balance) || 0;
  if (notesBalance != null) {
    // balance is already net of previous_balance — do NOT add again
    amount = notesBalance;
    ownAmount = notesBalance;
  } else {
    ownAmount = Number(r.total_amount) || 0;
    amount = ownAmount + previousBalance;   // ← includes carry-forward in the total
  }
}
```

This logic is **correct in isolation**: the `Balance: ₹X` note from a partial payment is expected to have already absorbed the previous balance (because `computeSettlement` includes `previousDue` in `totalPayable`). The problem is the note is only written to the invoice being paid — not to the newer invoice that carries it forward.

---

### 3. `computeSettlement` — `src/lib/invoice/payment-settlement.ts`

```ts
const totalPayable = round2(Math.max(0, totalAmount + previousDue));
```

This is arithmetically correct: when paying invoice 26270038 (Sep), `totalPayable = 52500 + previous_balance`. If `previous_balance` was set (not null), the balance note written to 26270038's notes DOES include the previous balance in the residual. The balance is therefore correct for 26270038's own payment tracking. The stale-snapshot problem is upstream, in invoice creation.

---

### 4. `buildPaymentAdvice` — `src/lib/invoice/calculations.ts`, line ~220

```ts
export function buildPaymentAdvice(totals, invoiceNo, previousEntries, dueDate): PaymentAdvice {
  const itemised = round2(previousEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const previousBalance = previousEntries.length > 0 ? itemised : totals.previousBalance;
  return {
    ...
    totalPayable: round2(totals.invoiceTotal - totals.tds - totals.received + previousBalance),
  };
}
```

**Important:** When `previousEntries` (from `previous_balance_breakdown`) is non-empty, the `itemised` sum from the breakdown array overrides `totals.previousBalance`. This means:
- If the breakdown entries sum to the original (stale) amounts, `totalPayable` overstates what is owed.
- If no breakdown is present (`previous_balance_breakdown = null`), it falls back to `totals.previousBalance`, which is also stale.

Both paths report the **original pre-payment carried-forward amount**, not the post-payment residual.

---

### 5. `recordReceivedAmount` — `src/modules/accounts/components/ManageReceivables.tsx`, line ~587

When recording a partial payment:
```ts
if (entry.previous_balance && entry.previous_balance > 0) {
  previousDue = entry.previous_balance;
}
// ...
const { totalPayable, newTotalPaid, balanceAmount, fullyPaid } = computeSettlement({
  totalAmount: entry.total_amount,
  previousDue,
  alreadyPaid,
  amount,
  tds,
});
```

After the payment, the mutation updates the receivable:
```ts
const updateData: any = {
  status: fullyPaid ? 'received' : 'pending',
  notes: fullNotes,   // appends PAYMENT: ... Balance: ₹X ...
};
```

**`previous_balance` is NEVER updated** — it keeps the creation-time value. Only the `notes` field gets a `Balance: ₹X` annotation. When `computeOutstandingFromRows` later reads this row, it finds `notesBalance != null` and uses that reduced amount — which is correct for the row itself. But 26270038's `previous_balance` column still holds the original amount. There is no mechanism to propagate the reduced balance back up to 26270038.

---

### 6. DB Schema (`supabase/migrations/20260802000000_invoice_compliance.sql`, lines 92-110)

```sql
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS previous_balance NUMERIC DEFAULT 0;
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS previous_balance_breakdown JSONB;
```

No trigger, no foreign-key cascade, and no recalculation mechanism. The columns are written at create time and never updated in response to downstream payment events.

---

## Concrete Reproduction of the Bug

Given the H H ENTERPRISES scenario:

1. **26270008** raised Aug 2026, ₹52,500. `work_order_id = NULL` (raised before the column migration, or via a path that didn't set it).
2. **26270038** raised Sep 2026, ₹52,500. `fetchWorkOrderOutstandingInvoices(supabase, null)` returns `[]` → `previous_balance = NULL`, no breakdown.
3. Both invoices are fully independent. Neither knows about the other.
4. A partial payment is recorded on 26270008. Its status becomes `'pending'` and notes get `Balance: ₹X`.
5. 26270038's status is `'issued'` or derived-`'open'`. If a partial payment is also recorded on it, it becomes `'pending'` — shown as `'Partial'` in the UI.
6. **What the user sees:** 26270008 is `Overdue` for its full ₹52,500; 26270038 is `Partial` for ₹52,500 (partially paid from its own column). No carry-forward between them. There is no column linking them, so the "partial payment on Aug invoice should reduce what's shown on Sep invoice" relationship doesn't exist.

**Net result:** The carry-forward system never engaged — the two invoices are siloed, and the `Partial` status on 26270038 means it had its OWN partial payment recorded against it, not a carry-forward from 26270008.

---

## Is there Double-Counting?

**In the H H ENTERPRISES case: No double-counting** — but also **no carry-forward at all**. The two invoices are independent because `work_order_id` was null at creation of 26270008, causing the outstanding-invoice fetch to return empty.

**In a correctly linked case (work_order_id set on both):** The double-counting protection works correctly — `collectRolledForwardRefs` suppresses 26270008 once it appears in 26270038's breakdown. Tests confirm this at `src/lib/invoice/outstanding.test.ts`, the "WO-2026-6689 scenario" test case.

**The stale-snapshot problem IS present** but only surfaces if a payment is recorded on an older invoice AFTER a newer invoice has already been raised carrying that older invoice's balance forward. The Sep invoice's payment advice will then overstate the previous balance.

---

## Summary of Bugs Found

| # | Severity | Description | File/Line |
|---|----------|-------------|-----------|
| 1 | **High** | `previous_balance` on the newer invoice is never updated when a partial payment is recorded on an older linked invoice. Stale column causes payment advice to overstate what was owed. | `ManageReceivables.tsx` ~line 700 (update missing `previous_balance`) |
| 2 | **High** | Invoices with `work_order_id = NULL` are excluded from carry-forward fetch (returns `[]`). Old invoices before the `20260802200000` migration have no `work_order_id`, so carry-forward never activates for them. | `outstanding.ts` line ~14-16 |
| 3 | **Medium** | `buildPaymentAdvice` uses the stored `previous_balance_breakdown` entries directly — if they contain pre-payment amounts, the payment advice total overstates what is currently owed. | `calculations.ts` line ~222-232 |
| 4 | **Low** | `undoLastPayment` restores status to `'issued'` but does not recalculate `previous_balance` on any linked newer invoice. | `ManageReceivables.tsx` undoLastPayment mutation |

---

## Recommended Fixes (Do NOT implement — report only)

### Fix 1 — Backfill `work_order_id` on legacy invoices
Run a SQL update linking old receivables rows to their work order by matching on `client_name` and the `Work Order No:` stored in the notes column. This is the fastest way to re-enable carry-forward for old invoices.

```sql
-- Sketch only — exact regex depends on your notes format
UPDATE receivables r
SET work_order_id = wo.id
FROM work_orders wo
WHERE r.work_order_id IS NULL
  AND r.category = 'Invoices'
  AND r.notes LIKE '%Work Order No:%'
  AND wo.work_order_id = regexp_replace(
      substring(r.notes FROM 'Work Order No:\s*([^\s|]+)'), '\s', '', 'g');
```

### Fix 2 — When a partial payment is recorded on invoice A that is referenced in invoice B's `previous_balance_breakdown`, recompute and update B's `previous_balance`

In `recordReceivedAmount`, after computing `balanceAmount`:
1. Find all invoices whose `previous_balance_breakdown` contain `entry.reference_number`.
2. For each such invoice B: recompute its `previous_balance` as the sum of each breakdown entry's remaining balance (fetching `Balance: ₹X` notes or falling back to `total_amount` per entry).
3. Update B's `previous_balance` and `previous_balance_breakdown` with the corrected figures.

This is the cleanest fix but requires a Supabase query inside the payment mutation. An alternative is to compute the previous-balance figure dynamically (from live outstanding queries) at invoice view time rather than relying on the frozen column — but that changes the payment advice for already-issued invoices, which has statutory implications.

### Fix 3 — In `buildPaymentAdvice`, accept an optional "override" breakdown where amounts are the current remaining balances, not the original creation-time amounts

The function signature is `buildPaymentAdvice(totals, invoiceNo, previousEntries, dueDate)`. Callers that know the real-time residuals (ManageReceivables invoice view) could pass updated entries. The PDF route (`app/api/invoice-pdf/route.ts`) would still use the frozen snapshot for a reprint, preserving the issued document.

### Fix 4 — Surface "Status: Partial" information in the carry-forward breakdown UI

When the payment advice shows "Previous outstanding: 26270008 — ₹52,500", it should instead show the remaining balance on 26270008 after any partial payments: "26270008 — ₹X (₹52,500 partially paid)". This requires a live query per entry, not just the snapshot.

---

## File Reference Summary

| File | Role |
|------|------|
| `src/lib/invoice/calculations.ts` | `computeInvoiceTotals`, `buildPaymentAdvice` — the arithmetic engine |
| `src/lib/invoice/outstanding.ts` | `fetchWorkOrderOutstandingInvoices`, `computeOutstandingFromRows` — carry-forward detection |
| `src/lib/invoice/payment-settlement.ts` | `computeSettlement` — settlement arithmetic (correct) |
| `src/modules/accounts/components/GenerateInvoiceDialog.tsx` | Sets `previous_balance` at invoice generation |
| `src/modules/accounts/components/OneTimeInvoiceForm.tsx` | Sets `previous_balance` at invoice creation |
| `src/modules/accounts/components/ManageReceivables.tsx` | `recordReceivedAmount` — does NOT update `previous_balance` after payment |
| `src/modules/accounts/components/invoice/InvoiceDocument.tsx` | Renders the payment advice block in the screen view |
| `app/api/invoice-pdf/route.ts` | Loads `previous_balance` and `previous_balance_breakdown` for PDF |
| `supabase/migrations/20260802000000_invoice_compliance.sql` | Adds `previous_balance`, `previous_balance_breakdown` columns |
| `supabase/migrations/20260802200000_receivables_work_order_id.sql` | Adds `work_order_id` (no backfill → legacy rows have NULL) |
