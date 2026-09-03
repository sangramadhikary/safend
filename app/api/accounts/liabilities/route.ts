import { NextRequest, NextResponse } from 'next/server';
import { requireAccountsAccess, writeAudit } from '@/lib/accounts/server';
import { rateLimit } from '@/lib/rateLimit';

/**
 * Liability creation — server-side, auth-gated, audited. Captures loan terms
 * (interest rate, EMI, installments) needed for amortization and interest
 * accrual.
 */

const VALID_TYPES = ['loan', 'security_deposit', 'inter_branch', 'advance', 'vendor_credit', 'other'];

export async function POST(request: NextRequest) {
  const auth = await requireAccountsAccess(request);
  if ('response' in auth) return auth.response;

  const { limited, retryAfter } = rateLimit(`liabilities:create:${auth.userId}`, { limit: 60, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  }

  try {
    const body = await request.json();
    const name = (body.name || '').toString().trim();
    const amount = Number(body.amount);
    const startDate = body.startDate;

    if (!name || !startDate || !(amount >= 0)) {
      return NextResponse.json({ error: 'Name, start date, and a valid amount are required.' }, { status: 400 });
    }
    const type = VALID_TYPES.includes(body.type) ? body.type : 'other';

    const insertRow: Record<string, unknown> = {
      name,
      type,
      original_amount: amount,
      remaining_amount: amount,
      start_date: startDate,
      due_date: body.dueDate || null,
      creditor_name: body.creditorName || null,
      description: (body.description || '').toString().trim() || null,
      interest_rate: Math.max(0, Number(body.interestRate) || 0),
      emi_amount: body.emiAmount ? Math.max(0, Number(body.emiAmount)) : null,
      emi_day: body.emiDay ? Math.min(31, Math.max(1, Number(body.emiDay))) : null,
      total_installments: body.totalInstallments ? Math.max(0, Number(body.totalInstallments)) : null,
      paid_installments: 0,
      status: 'active',
      branch_id: body.branchId || null,
    };

    const { data, error } = await auth.admin.from('liabilities').insert(insertRow).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await writeAudit(auth.admin, auth, { action: 'liability.create', entity: 'liabilities', entityId: data.id, after: data });
    return NextResponse.json({ success: true, liability: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create liability.' }, { status: 500 });
  }
}
