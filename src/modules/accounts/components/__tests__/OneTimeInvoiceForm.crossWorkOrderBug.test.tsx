import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Bug condition exploration test — one-time-invoice-previous-due-scoping.
 *
 * Property 1 (Bug Condition): Cross-Work-Order Auto-Fill Bug.
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * THIS TEST IS EXPECTED TO FAIL ON UNFIXED CODE. `handleSelectWorkOrder` in
 * OneTimeInvoiceForm.tsx currently queries `receivables` filtered only by
 * `client_name` (no work-order scoping — the `work_order_id` column does not
 * exist yet) and unconditionally calls
 * `setPreviousDue(String(Math.round(total)))` with whatever balance the
 * query returns. A failure here CONFIRMS the bug: an outstanding invoice
 * belonging to a different work order gets silently folded into the new
 * invoice's Previous Due amount.
 *
 * Do not "fix" this test or the component when it fails — a failure is the
 * expected/successful outcome for this exploratory step. It will start
 * passing once the fix (removing the unconditional setPreviousDue call and
 * scoping the query by work_order_id) is implemented in a later task.
 */

// ---- Supabase mock --------------------------------------------------------
// Generic chainable query-builder stub. Every chain method returns the same
// builder so arbitrarily long Supabase call chains resolve, and the builder
// itself is "thenable" so `await` works no matter which method was called
// last (mirrors how PostgrestFilterBuilder behaves in the real client).
const { tableData, buildQuery, fromSpy } = vi.hoisted(() => {
  const tableData: Record<string, { data: any[]; error: any }> = {
    work_orders: { data: [], error: null },
    operational_posts: { data: [], error: null },
    receivables: { data: [], error: null },
    bank_accounts: { data: [], error: null },
    users: { data: [], error: null },
  };

  function buildQuery(table: string) {
    const result = tableData[table] ?? { data: [], error: null };
    const builder: any = {};
    const chain = () => builder;
    builder.select = chain;
    builder.eq = chain;
    builder.in = chain;
    builder.not = chain;
    builder.order = chain;
    builder.or = chain;
    builder.limit = chain;
    builder.single = () => Promise.resolve({ data: result.data?.[0] ?? null, error: result.error });
    builder.maybeSingle = () =>
      Promise.resolve({ data: result.data?.[0] ?? null, error: result.error });
    builder.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
    return builder;
  }

  const fromSpy = vi.fn((table: string) => buildQuery(table));
  return { tableData, buildQuery, fromSpy };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabaseClient: {
    from: fromSpy,
    rpc: vi.fn(async () => ({ data: '26270001', error: null })),
  },
}));

import { OneTimeInvoiceForm } from '../OneTimeInvoiceForm';

function resetTableData() {
  tableData.work_orders = { data: [], error: null };
  tableData.operational_posts = { data: [], error: null };
  tableData.receivables = { data: [], error: null };
  tableData.bank_accounts = { data: [], error: null };
  tableData.users = { data: [], error: null };
}

function workOrderRow(id: string, workOrderId: string, clientName: string) {
  return {
    id,
    work_order_id: workOrderId,
    description: JSON.stringify({ clientName }),
    total_amount: 100000,
    status: 'active',
  };
}

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OneTimeInvoiceForm open onOpenChange={() => {}} onSuccess={() => {}} onBack={() => {}} />
    </QueryClientProvider>
  );
}

/** Switches to "Existing Customer" mode, opens the work-order picker, and selects `workOrderId`. */
async function selectWorkOrder(workOrderId: string) {
  fireEvent.click(screen.getByRole('button', { name: /Existing Customer/i }));

  const label = await screen.findByText('Select Active Work Order');
  const pickerContainer = label.parentElement as HTMLElement;
  const trigger = within(pickerContainer).getByRole('combobox');
  fireEvent.click(trigger);

  const option = await screen.findByText(workOrderId);
  fireEvent.click(option);
}

/** Locates the "Previous Due Amount" number input by its section label. */
function getPreviousDueInput(): HTMLInputElement {
  const label = screen.getByText('Previous Due Amount (₹)');
  const row = label.closest('div')!.parentElement as HTMLElement;
  return within(row).getByRole('spinbutton') as HTMLInputElement;
}

beforeAll(() => {
  // jsdom doesn't implement these — Radix Select's focus/positioning logic
  // calls them unconditionally while the dropdown opens.
  Element.prototype.scrollIntoView = vi.fn();
  // @ts-expect-error — not part of jsdom's Element typings
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  // @ts-expect-error — not part of jsdom's Element typings
  Element.prototype.releasePointerCapture = vi.fn();
});

beforeEach(() => {
  fromSpy.mockClear();
  resetTableData();
});

describe('Property 1: Bug Condition — Cross-Work-Order Auto-Fill Bug', () => {
  it('does NOT auto-apply an outstanding balance from a different work order (WO-001) when WO-002 is selected', async () => {
    tableData.work_orders.data = [workOrderRow('wo-002-uuid', 'WO-002', 'ABC Security Ltd')];
    // Only invoice on file belongs to WO-001 — a different work order for the same client.
    tableData.receivables.data = [
      {
        reference_number: 'INV-WO1-001',
        total_amount: 50000,
        due_date: '2026-01-15',
        status: 'pending',
        notes: 'Work Order: WO-001',
      },
    ];

    renderForm();
    await selectWorkOrder('WO-002');

    // Confirm the outstanding-invoices query actually resolved before asserting.
    await screen.findByText(/Outstanding invoices/i);

    const previousDueInput = getPreviousDueInput();
    // EXPECTED (post-fix) behavior: previousDue stays empty — the WO-001 balance
    // must not be auto-applied to an invoice being raised under WO-002.
    // On unfixed code this fails because setPreviousDue('50000') is called
    // unconditionally, regardless of which work order the invoice belongs to.
    expect(previousDueInput.value).toBe('');
  });

  it('does NOT accumulate outstanding balances from WO-001 and WO-002 when WO-003 is selected', async () => {
    tableData.work_orders.data = [workOrderRow('wo-003-uuid', 'WO-003', 'ABC Security Ltd')];
    tableData.receivables.data = [
      {
        reference_number: 'INV-WO1-001',
        total_amount: 50000,
        due_date: '2026-01-15',
        status: 'pending',
        notes: 'Work Order: WO-001',
      },
      {
        reference_number: 'INV-WO2-001',
        total_amount: 30000,
        due_date: '2026-02-15',
        status: 'pending',
        notes: 'Work Order: WO-002',
      },
    ];

    renderForm();
    await selectWorkOrder('WO-003');

    await screen.findByText(/Outstanding invoices/i);

    const previousDueInput = getPreviousDueInput();
    // On unfixed code this fails because previousDue is set to "80000"
    // (₹50,000 + ₹30,000), the sum of two unrelated work orders' balances.
    expect(previousDueInput.value).toBe('');
  });
});
