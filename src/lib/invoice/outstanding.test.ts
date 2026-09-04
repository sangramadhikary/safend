import { describe, expect, it, vi } from 'vitest';

import { fetchWorkOrderOutstandingInvoices, sumOutstanding } from './outstanding';

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

describe('fetchWorkOrderOutstandingInvoices', () => {
  it('scopes strictly to the work order and returns [] when no work order given', async () => {
    const { client, calls } = mockClient([
      { reference_number: 'A', total_amount: 1000, due_date: null, status: 'open', notes: null },
    ]);

    const result = await fetchWorkOrderOutstandingInvoices(client, WO);
    expect(calls['eq:work_order_id']).toBe(WO);
    expect(result).toHaveLength(1);

    // No work order → no scope → nothing carried forward.
    expect(await fetchWorkOrderOutstandingInvoices(client, null)).toEqual([]);
    expect(await fetchWorkOrderOutstandingInvoices(client, '   ')).toEqual([]);
  });

  it('sums the work order\'s unpaid invoices', async () => {
    const { client } = mockClient([
      { reference_number: '26270008', total_amount: 52500, previous_balance: 0, due_date: '2026-08-12', status: 'overdue', notes: null },
      { reference_number: '26270005', total_amount: 34500, previous_balance: 0, due_date: '2026-07-01', status: 'open', notes: null },
    ]);

    const result = await fetchWorkOrderOutstandingInvoices(client, WO);

    expect(result).toHaveLength(2);
    expect(sumOutstanding(result)).toBe(87000);
  });

  it("includes an invoice's carried-forward previous_balance in its owed amount", async () => {
    const { client } = mockClient([
      { reference_number: '26270008', total_amount: 52500, previous_balance: 34500, due_date: '2026-08-12', status: 'overdue', notes: null },
    ]);

    const result = await fetchWorkOrderOutstandingInvoices(client, WO);

    expect(result[0].ownAmount).toBe(52500);
    expect(result[0].previousBalance).toBe(34500);
    expect(result[0].amount).toBe(87000);
    expect(sumOutstanding(result)).toBe(87000);
  });

  it('nets out a recorded partial payment from the invoice balance', async () => {
    const { client } = mockClient([
      { reference_number: 'A', total_amount: 10000, previous_balance: 0, due_date: null, status: 'pending', notes: 'Mode: Cash | Amount: ₹4,000 | Balance: ₹6,000' },
    ]);

    const result = await fetchWorkOrderOutstandingInvoices(client, WO);

    expect(result[0].amount).toBe(6000);
  });

  it('excludes the invoice currently being edited', async () => {
    const { client } = mockClient([
      { reference_number: 'SELF', total_amount: 5000, previous_balance: 0, due_date: null, status: 'created', notes: null },
      { reference_number: 'OTHER', total_amount: 7000, previous_balance: 0, due_date: null, status: 'created', notes: null },
    ]);

    const result = await fetchWorkOrderOutstandingInvoices(client, WO, 'SELF');

    expect(result.map((r) => r.ref)).toEqual(['OTHER']);
  });

  it('drops an older invoice referenced via a legacy "Outstanding:" note (no double count)', async () => {
    const { client } = mockClient([
      { reference_number: '26270001', total_amount: 37760, previous_balance: 0, due_date: '2026-10-03', status: 'pending', notes: null },
      {
        reference_number: '26270015', total_amount: 20060, previous_balance: 6766,
        previous_balance_breakdown: null,
        due_date: '2026-09-10', status: 'pending',
        notes: 'GST: 18% | Previous Due: ₹6,766 | Outstanding: 26270001 (₹37,760)',
      },
    ]);

    const result = await fetchWorkOrderOutstandingInvoices(client, WO);

    expect(result.map((r) => r.ref)).toEqual(['26270015']);
    expect(sumOutstanding(result)).toBe(26826); // 20060 + 6766
  });

  it('drops an older invoice already rolled into a newer one via structured breakdown', async () => {
    const { client } = mockClient([
      { reference_number: 'A', total_amount: 10000, previous_balance: 0, due_date: '2026-01-01', status: 'overdue', notes: null },
      {
        reference_number: 'B', total_amount: 5000, previous_balance: 10000,
        previous_balance_breakdown: [{ referenceNumber: 'A', amount: 10000 }],
        due_date: '2026-02-01', status: 'open', notes: null,
      },
    ]);

    const result = await fetchWorkOrderOutstandingInvoices(client, WO);

    expect(result.map((r) => r.ref)).toEqual(['B']);
    expect(sumOutstanding(result)).toBe(15000);
  });

  it('drops zero-balance rows', async () => {
    const { client } = mockClient([
      { reference_number: 'Z', total_amount: 0, previous_balance: 0, due_date: null, status: 'open', notes: null },
    ]);

    expect(await fetchWorkOrderOutstandingInvoices(client, WO)).toHaveLength(0);
  });

  it('marks a past-due invoice overdue and a future one open', async () => {
    const { client } = mockClient([
      { reference_number: 'P', total_amount: 100, previous_balance: 0, due_date: '2000-01-01', status: 'issued', notes: null },
      { reference_number: 'F', total_amount: 100, previous_balance: 0, due_date: '2999-01-01', status: 'issued', notes: null },
    ]);

    const result = await fetchWorkOrderOutstandingInvoices(client, WO);

    expect(result.find((r) => r.ref === 'P')?.status).toBe('overdue');
    expect(result.find((r) => r.ref === 'F')?.status).toBe('open');
  });
});
