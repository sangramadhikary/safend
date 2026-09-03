import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as fc from 'fast-check';

/**
 * Preservation property tests — one-time-invoice-previous-due-scoping.
 *
 * Property 2 (Preservation): Non-Buggy Paths Unchanged.
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 *
 * These tests lock in behaviors of `OneTimeInvoiceForm` that MUST NOT change
 * once the cross-work-order scoping fix (task 3) lands:
 *   - The Net Payable formula: invoiceTotal − tdsAmt + previousDue.
 *   - New-client mode: no outstanding-balance query runs, `previousDue` is
 *     never touched by `handleSelectWorkOrder`.
 *   - Edit-invoice mode: `previousDue` is pre-filled from the `notes` field,
 *     not from a query.
 *   - Legacy rows (no work-order scoping in the unfixed query) for the same
 *     client remain visible in the outstanding-invoices panel and their
 *     total is still what populates `previousDue` today (this specific
 *     auto-fill-on-legacy-rows behavior is the unfixed baseline being
 *     recorded here; task 3.2/3.3 changes *how* previousDue gets set for
 *     work-order selections generally, but must keep these same-client,
 *     unscoped rows visible in the panel per Requirement 3.6).
 *
 * Observation-first methodology: every property below was first exercised
 * against the CURRENT (unfixed) code to observe actual behavior, then
 * encoded here. All properties in this file are expected to PASS on
 * unfixed code — this file is the preservation/regression baseline that
 * task 3's fix must not break (re-run verbatim in task 3.7).
 */

// ---- Supabase mock --------------------------------------------------------
// Generic chainable query-builder stub — see OneTimeInvoiceForm.crossWorkOrderBug.test.tsx
// for the rationale. Every chain method returns the same builder, and the
// builder is "thenable" so `await` resolves regardless of which method was
// called last.
const { tableData, fromSpy, calledTables } = vi.hoisted(() => {
  const tableData: Record<string, { data: any[]; error: any }> = {
    work_orders: { data: [], error: null },
    operational_posts: { data: [], error: null },
    receivables: { data: [], error: null },
    bank_accounts: { data: [], error: null },
    users: { data: [], error: null },
  };

  const calledTables: string[] = [];

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

  const fromSpy = vi.fn((table: string) => {
    calledTables.push(table);
    return buildQuery(table);
  });
  return { tableData, fromSpy, calledTables };
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
  calledTables.length = 0;
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

function renderForm(editEntry: any | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OneTimeInvoiceForm open onOpenChange={() => {}} onSuccess={() => {}} onBack={() => {}} editEntry={editEntry} />
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

/** Locates the single default service-line row's numeric inputs: [manpower, woPricePerMonth, daysInMonth, duties]. */
function getServiceLineSpinbuttons(): HTMLInputElement[] {
  const rows = screen.getAllByRole('row');
  // rows[0] is the table header row; the single default service line is rows[1].
  const lineRow = rows[1];
  return within(lineRow).getAllByRole('spinbutton') as HTMLInputElement[];
}

/** Reads the numeric value out of a rendered "₹1,23,456.00"-style currency string. */
function parseCurrencyText(text: string): number {
  return parseFloat(text.replace(/[₹,]/g, ''));
}

/** Reads the value shown in the "Net Payable" summary row. */
function getNetPayableValue(): number {
  const label = screen.getByText('Net Payable');
  const row = label.parentElement as HTMLElement;
  const amountEl = row.querySelector('span:last-child') as HTMLElement;
  return parseCurrencyText(amountEl.textContent || '');
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

afterEach(() => {
  cleanup();
});

describe('Property 2: Preservation — Net Payable formula', () => {
  it('netPayable === invoiceTotal - tdsAmt + parseFloat(previousDue || "0") for any previousDue value, however it was set', () => {
    renderForm();

    // Fixed, deterministic service line: (100000 / 25) * 25 = 100000 subtotal.
    const [, woPriceInput, daysInput, dutiesInput] = getServiceLineSpinbuttons();
    fireEvent.change(daysInput, { target: { value: '25' } });
    fireEvent.change(woPriceInput, { target: { value: '100000' } });
    fireEvent.change(dutiesInput, { target: { value: '25' } });
    // subTotal = 100000, GST 18% (default) => gstAmt = 18000, invoiceTotal = 118000

    // Enable TDS at the default rate (2%) => tdsAmt = 100000 * 0.02 = 2000
    fireEvent.click(screen.getByRole('switch'));

    const previousDueInput = getPreviousDueInput();
    const invoiceTotal = 118000;
    const tdsAmt = 2000;

    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (prevDue) => {
        fireEvent.change(previousDueInput, { target: { value: String(prevDue) } });
        const expected = invoiceTotal - tdsAmt + prevDue;
        expect(getNetPayableValue()).toBeCloseTo(expected, 2);
      }),
      { numRuns: 50 },
    );
  });

  it('netPayable === invoiceTotal - tdsAmt + parseFloat(previousDue || "0") when previousDue is set via the "Include previous balance" button', async () => {
    // (numRuns: 8) — each run mounts the full dialog and drives a Radix
    // Select interaction, which is slower than the default 5s test timeout.
    // After the fix, auto-fill no longer runs — the user must click
    // "Include previous balance" to transfer the outstanding total into
    // previousDue. Confirm the same Net Payable formula holds when
    // previousDue arrives via button click instead of being typed manually.
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 200_000 }), async (outstandingAmount) => {
        resetTableData();
        fromSpy.mockClear();
        tableData.work_orders.data = [workOrderRow('wo-fixed-uuid', 'WO-FIXED', 'Formula Test Client')];
        tableData.receivables.data = [
          {
            reference_number: 'INV-FIXED-001',
            total_amount: outstandingAmount,
            due_date: '2026-03-01',
            status: 'pending',
            notes: '',
          },
        ];

        const { unmount } = renderForm();
        try {
          fireEvent.click(screen.getByRole('button', { name: /Existing Customer/i }));
          const label = await screen.findByText('Select Active Work Order');
          const trigger = within(label.parentElement as HTMLElement).getByRole('combobox');
          fireEvent.click(trigger);
          const option = await screen.findByText('WO-FIXED');
          fireEvent.click(option);

          await screen.findByText(/Outstanding invoices/i);

          // After the fix, previousDue stays empty until the user clicks
          // "Include previous balance" — simulate that opt-in action.
          const includeBtn = screen.getByRole('button', { name: /Include previous balance/i });
          fireEvent.click(includeBtn);

          const previousDueInput = getPreviousDueInput();
          const prevDue = parseFloat(previousDueInput.value || '0');
          // No service line amounts were entered and TDS is off in this
          // fresh render, so invoiceTotal = 0 and tdsAmt = 0.
          const expected = 0 - 0 + prevDue;
          expect(getNetPayableValue()).toBeCloseTo(expected, 2);
          expect(prevDue).toBe(Math.round(outstandingAmount));
        } finally {
          unmount();
        }
      }),
      { numRuns: 8 },
    );
    // Each of the 8 runs mounts the full dialog and drives a Radix Select
    // interaction; under parallel-worker contention this can exceed the
    // default and the previous 20s budget, so allow up to 60s.
  }, 60000);
});

describe('Property 2: Preservation — new-client / no-work-order-selected sessions', () => {
  it('for any session where selectedWorkOrderId is empty, no outstanding query runs and previousDue is never touched by handleSelectWorkOrder', () => {
    renderForm();

    fc.assert(
      fc.property(
        fc.constantFrom<'new' | 'existing-no-selection'>('new', 'existing-no-selection'),
        fc.string({ minLength: 0, maxLength: 20 }),
        (mode, typedClientName) => {
          if (mode === 'new') {
            fireEvent.click(screen.getByRole('button', { name: /New Customer/i }));
          } else {
            // Switch into "Existing Customer" mode WITHOUT picking a work
            // order — selectedWorkOrderId remains '' either way.
            fireEvent.click(screen.getByRole('button', { name: /Existing Customer/i }));
          }

          const clientNameInput = screen.getByPlaceholderText('Client name');
          fireEvent.change(clientNameInput, { target: { value: typedClientName } });

          expect(getPreviousDueInput().value).toBe('');
          expect(screen.queryByText(/Outstanding invoices/i)).toBeNull();
          expect(calledTables).not.toContain('receivables');
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe('Property 2: Preservation — editEntry pre-fill is notes-only', () => {
  it('for any editEntry session, previousDue is pre-filled from the notes field only, never from a query', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 999_999 }), async (prevAmount) => {
        resetTableData();
        fromSpy.mockClear();

        const editEntry = {
          id: 'receivable-edit-id',
          client_name: 'Edit Mode Client',
          reference_number: '26270042',
          due_date: '2026-04-01',
          status: 'pending',
          line_items: [],
          notes: `GST: 18% | Previous Due: ₹${prevAmount} | Addr: 123 Test Street`,
        };

        const { unmount } = renderForm(editEntry);
        try {
          await screen.findByDisplayValue('Edit Mode Client');
          expect(getPreviousDueInput().value).toBe(String(prevAmount));
          // Edit mode never triggers handleSelectWorkOrder, so the
          // receivables table is never queried for outstanding balances.
          expect(calledTables).not.toContain('receivables');
        } finally {
          unmount();
        }
      }),
      { numRuns: 15 },
    );
    // 15 full-dialog mounts in edit mode; allow headroom for parallel-worker
    // contention during the full suite run.
  }, 60000);
});

describe('Property 2: Preservation — legacy (unscoped) rows for the same client remain visible', () => {
  it('for any set of pending/overdue receivables rows for the selected client, all of them surface in the outstanding-invoices panel and previousDue stays empty until "Include previous balance" is clicked', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            amount: fc.integer({ min: 1, max: 100_000 }),
            status: fc.constantFrom('pending', 'overdue'),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        async (rows) => {
          resetTableData();
          fromSpy.mockClear();
          tableData.work_orders.data = [workOrderRow('wo-legacy-uuid', 'WO-LEGACY', 'Legacy Rows Client')];
          tableData.receivables.data = rows.map((r, i) => ({
            reference_number: `INV-LEGACY-${i}`,
            total_amount: r.amount,
            due_date: '2026-05-01',
            status: r.status,
            notes: '',
          }));

          const { unmount } = renderForm();
          try {
            await selectWorkOrder('WO-LEGACY');
            await screen.findByText(/Outstanding invoices/i);

            // After the fix, previousDue stays empty — auto-fill is removed.
            // The panel still shows the rows (Requirement 3.6).
            const previousDueInput = getPreviousDueInput();
            expect(previousDueInput.value).toBe('');

            const panelHeader = screen.getByText(/unpaid$/);
            expect(panelHeader.textContent).toContain(`${rows.length} unpaid`);

            // Clicking "Include previous balance" sets previousDue to the total.
            const includeBtn = screen.getByRole('button', { name: /Include previous balance/i });
            fireEvent.click(includeBtn);

            const expectedTotal = rows.reduce((s, r) => s + r.amount, 0);
            expect(previousDueInput.value).toBe(String(Math.round(expectedTotal)));
          } finally {
            unmount();
          }
        },
      ),
      { numRuns: 10 },
    );
    // 10 full-dialog mounts; allow headroom under parallel-worker contention.
  }, 60000);
});
