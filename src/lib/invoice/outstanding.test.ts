import { describe, expect, it, vi } from 'vitest';

import { fetchWorkOrderOutstandingInvoices, computeOutstandingFromRows, sumOutstanding } from './outstanding';

/**
 * Builds a mock Supabase query surface that records the filters applied and
 * resolves to the supplied rows. The chain is thenable so `await query` works.
 */
function mockClient(rows: any[]) {
  const calls: Record<string, any> = {};
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((col: string, val: any) => { calls[`eq:${col}`] = val; return builder; }),
    in: vi.fn((col: string, val: any) => { calls[`in:${col}`] = val; return builder; }),
    order: vi.fn(() => builder),
    then: (resolve: any) => resolve({ data: rows, error: null }),
  };
  const client = { from: vi.fn(() => builder) };
  return { client, builder, calls };
}

const WO = 'wo-123';
const row = (over: Record<string, any>) => ({
  category: 'Invoices', status: 'issued', total_amount: 0, opening_balance: 0, paid_amount: 0,
  due_date: null, created_at: '2026-08-01T00:00:00+00:00', notes: null, ...over,
});

describe('computeOutstandingFromRows (live balances)', () => {
  it('counts each invoice once at its own balance (WO-2026-6689 chain)', () => {
    // 26270008 carries ₹34,500 with no invoice on file (opening balance); the
    // newer invoice lists 26270008 but does not take over its debt.
    const rows = [
      row({ reference_number: '26270008', status: 'overdue', total_amount: 52500, opening_balance: 34500,
        due_date: '2026-08-12', created_at: '2026-07-12T00:00:00+00:00' }),
      row({ reference_number: '26270038', total_amount: 52500, previous_balance: 87000,
        previous_balance_breakdown: [{ referenceNumber: '26270008', amount: 87000 }], due_date: '2026-09-12' }),
    ];

    const result = computeOutstandingFromRows(rows);

    expect(result.map((r) => r.ref)).toEqual(['26270008', '26270038']);
    expect(sumOutstanding(result)).toBe(139500);
  });

  it('nets payments from paid_amount and ignores balances written in notes', () => {
    const rows = [
      row({ reference_number: '26270004', status: 'pending', total_amount: 37760, paid_amount: 31330,
        notes: 'Balance: ₹1 | Total Paid: ₹99', created_at: '2026-08-10T00:00:00+00:00' }),
      row({ reference_number: '26270040', status: 'created', total_amount: 37760, previous_balance: 6430,
        previous_balance_breakdown: [{ referenceNumber: '26270004', amount: 6430 }], created_at: '2026-09-10T00:00:00+00:00' }),
    ];

    const result = computeOutstandingFromRows(rows);

    expect(result.map((r) => [r.ref, r.amount])).toEqual([['26270004', 6430], ['26270040', 37760]]);
    expect(sumOutstanding(result)).toBe(44190);
  });

  it('splits what is owed into the opening balance (paid first) and own charges', () => {
    const [r] = computeOutstandingFromRows([
      row({ reference_number: 'A', total_amount: 52500, opening_balance: 34500, paid_amount: 10000 }),
    ]);

    expect(r.amount).toBe(77000);
    expect(r.previousBalance).toBe(24500);
    expect(r.ownAmount).toBe(52500);
  });

  it('drops settled, cancelled and non-invoice rows', () => {
    const result = computeOutstandingFromRows([
      row({ reference_number: 'PAID', status: 'received', total_amount: 1000, paid_amount: 1000 }),
      row({ reference_number: 'GONE', status: 'cancelled', total_amount: 1000 }),
      row({ reference_number: 'ZERO', total_amount: 500, paid_amount: 500 }),
      row({ reference_number: 'CN', category: 'Invoice Adjustments', total_amount: -500 }),
      row({ reference_number: 'OPEN', total_amount: 700 }),
    ]);

    expect(result.map((r) => r.ref)).toEqual(['OPEN']);
  });

  it('sums to the paisa', () => {
    const result = computeOutstandingFromRows([
      row({ reference_number: 'A', total_amount: 100.1 }),
      row({ reference_number: 'B', total_amount: 200.2 }),
    ]);

    expect(sumOutstanding(result)).toBe(300.3);
  });
});

describe('fetchWorkOrderOutstandingInvoices', () => {
  it('scopes strictly to the work order', async () => {
    const { client, calls } = mockClient([row({ reference_number: 'A', total_amount: 1000 })]);

    const result = await fetchWorkOrderOutstandingInvoices(client, WO);

    expect(calls['eq:work_order_id']).toBe(WO);
    expect(calls['eq:category']).toBe('Invoices');
    expect(result).toHaveLength(1);
  });

  it('carries nothing forward and does not query when there is no work order', async () => {
    const { client } = mockClient([row({ reference_number: 'A', total_amount: 1000 })]);

    expect(await fetchWorkOrderOutstandingInvoices(client, null)).toEqual([]);
    expect(await fetchWorkOrderOutstandingInvoices(client, '   ')).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("sums the work order's unpaid invoices", async () => {
    const { client } = mockClient([
      row({ reference_number: '26270005', status: 'overdue', total_amount: 34500, due_date: '2026-07-01' }),
      row({ reference_number: '26270008', total_amount: 52500, paid_amount: 2500, due_date: '2026-08-12' }),
    ]);

    const result = await fetchWorkOrderOutstandingInvoices(client, WO);

    expect(sumOutstanding(result)).toBe(84500);
  });

  it('excludes the invoice currently being edited', async () => {
    const { client } = mockClient([
      row({ reference_number: 'SELF', status: 'created', total_amount: 5000 }),
      row({ reference_number: 'OTHER', status: 'created', total_amount: 7000 }),
    ]);

    const result = await fetchWorkOrderOutstandingInvoices(client, WO, 'SELF');

    expect(result.map((r) => r.ref)).toEqual(['OTHER']);
  });

  it('marks a past-due invoice overdue and a future one open', async () => {
    const { client } = mockClient([
      row({ reference_number: 'P', total_amount: 100, due_date: '2000-01-01' }),
      row({ reference_number: 'F', total_amount: 100, due_date: '2999-01-01' }),
    ]);

    const result = await fetchWorkOrderOutstandingInvoices(client, WO);

    expect(result.find((r) => r.ref === 'P')?.status).toBe('overdue');
    expect(result.find((r) => r.ref === 'F')?.status).toBe('open');
  });
});
