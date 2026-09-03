# Bugfix Requirements Document

## Introduction

When creating a new one-time invoice for an existing client by selecting a work order, the system automatically queries all pending/overdue invoices for that client across **all work orders** and pre-fills the "Previous Due Amount" field with the combined outstanding balance. This means an unpaid invoice belonging to Work Order A is silently added to a new invoice raised under Work Order B — without any user action or consent — inflating the Net Payable total and potentially causing billing disputes.

The fix has two parts:
1. Add a `work_order_id` column to the `receivables` table so invoices can be scoped to a specific work order going forward.
2. Change the UX from auto-applying the previous balance to an explicit opt-in: show an informational panel listing outstanding invoices but require the user to actively click "Include previous balance" before the amount is added to the new invoice.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user selects an existing work order (Work Order B) in the One-Time Invoice form THEN the system automatically queries all `pending` or `overdue` invoices in the `receivables` table filtered only by `client_name` and `category = 'Invoices'`, regardless of which work order those invoices belong to.

1.2 WHEN the outstanding balance query returns results (e.g., an unpaid invoice from Work Order A for the same client) THEN the system automatically sets the `previousDue` state to the summed balance, adding the cross-work-order amount to the Net Payable total without any explicit user action.

1.3 WHEN the `previousDue` value is auto-populated THEN the system includes it in the saved invoice's `notes` field and in the Net Payable calculation, permanently recording a balance that the user never intended to include.

### Expected Behavior (Correct)

2.1 WHEN a user selects a work order in the One-Time Invoice form THEN the system SHALL query outstanding invoices filtered by `work_order_id` matching the selected work order for rows that have a `work_order_id`, and additionally include rows where `work_order_id IS NULL` (legacy rows) filtered by `client_name` — so that pre-existing data is not silently dropped.

2.2 WHEN outstanding invoices are found for the selected work order THEN the system SHALL display an amber informational panel listing those invoices but SHALL NOT automatically pre-fill the `previousDue` input field.

2.3 WHEN the user explicitly clicks the "Include previous balance" button or toggle in the outstanding invoices panel THEN the system SHALL set the `previousDue` input to the total outstanding amount, adding it to the Net Payable.

2.4 WHEN a new invoice is saved (created or updated) THEN the system SHALL persist the `work_order_id` of the selected work order into the `receivables` row so that future outstanding-balance queries can scope correctly to that work order.

2.5 WHEN an invoice is saved without any work order selected (new client / manual entry) THEN the system SHALL save the receivable with `work_order_id = NULL`, preserving existing behavior for that path.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the user manually types a value into the `previousDue` input field THEN the system SHALL CONTINUE TO include that value in the Net Payable calculation and persist it in the invoice notes on save.

3.2 WHEN outstanding invoices exist and the user clicks "Include previous balance" THEN the system SHALL CONTINUE TO compute Net Payable as `Invoice Total − TDS + Previous Due`, identical to the current formula.

3.3 WHEN a user creates a one-time invoice for a new client (not selecting an existing work order) THEN the system SHALL CONTINUE TO function with no outstanding invoices query and no `previousDue` auto-fill.

3.4 WHEN editing an existing invoice (`editEntry` prop is supplied) THEN the system SHALL CONTINUE TO pre-fill all form fields including `previousDue` from the stored invoice data, unchanged.

3.5 WHEN the outstanding invoices panel is shown but the user does NOT click "Include previous balance" THEN the system SHALL CONTINUE TO save the invoice with `previousDue = 0` (not included), as if the panel were never shown.

3.6 WHEN the `receivables` table migration adds the `work_order_id` column THEN existing rows with no work order association SHALL CONTINUE TO have `work_order_id = NULL` and remain visible/queryable without disruption to other parts of the application.
