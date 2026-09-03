import { NextRequest, NextResponse } from 'next/server';
import { requireAccountsAccess, writeAudit } from '@/lib/accounts/server';

/**
 * Record a liability payment — server-side, auth-gated, audited, with proper
 * loan amortization (Phase 3.5).
 *
 * Each payment is split into an INTEREST component (accrued on the outstanding
 * principal for one month at the annual rate) and a PRINCIPAL component. Only
 * the principal reduces the outstanding balance; the interest is recorded as a
 * finance expense so the P&L is correct. For zero-interest liabilities the whole
 * payment is principal.
 */

const VALID_MODES = ['bank_transfer', 'cheque', 'cash', 'upi', 'neft', 'rtgs'];

export async function POST(request: NextRequest) {
  const auth = await requireAccountsAccess(request);
  if ('response' in auth) return auth.response;

  try {
    const body = await request.json();
    const liabilityId = body.liabilityId;
    const amount = Number(body.amount);
    const paymentDate = body.paymentDate;

    if (!liabilityId || !paymentDate) {
      return NextResponse.json({ error: 'Liability and payment date are required.' }, { status: 400 });
    }
    if (!(amount > 0)) {
      return NextResponse.json({ error: 'Payment amount must be greater than zero.' }, { status: 400 });
    }

    const { data: liability, error: fetchErr } = await auth.admin
      .from('liabilities').select('*').eq('id', liabilityId).single();
    if (fetchErr || !liability) {
      return NextResponse.json({ error: 'Liability not found.' }, { status: 404 });
    }

    const remaining = Number(liability.remaining_amount) || 0;
    const annualRate = Number(liability.interest_rate) || 0;

    // One month's interest on the outstanding principal.
    const interestFull = annualRate > 0 ? Math.round(remaining * (annualRate / 100) / 12) : 0;
    const interestComponent = Math.min(interestFull, amount);
    const principalComponent = amount - interestComponent;

    // Overpayment guard: principal cannot exceed the outstanding balance.
    if (principalComponent > remaining) {
      return NextResponse.json({
        error: `Payment exceeds payoff amount. Outstanding principal ₹${remaining.toLocaleString('en-IN')} + interest ₹${interestComponent.toLocaleString('en-IN')}.`,
      }, { status: 400 });
    }

    const mode = VALID_MODES.includes(body.paymentMode) ? body.paymentMode : 'bank_transfer';
    const newRemaining = Math.max(0, remaining - principalComponent);
    const paidInstallments = (Number(liability.paid_installments) || 0) + 1;

    // Next payment date: same EMI day next month, if configured.
    let nextPaymentDate: string | null = null;
    if (liability.emi_day) {
      const d = new Date(paymentDate);
      d.setMonth(d.getMonth() + 1);
      d.setDate(Math.min(Number(liability.emi_day), 28));
      nextPaymentDate = d.toISOString().split('T')[0];
    }

    const { error: payErr } = await auth.admin.from('liability_payments').insert({
      liability_id: liabilityId,
      amount,
      principal_component: principalComponent,
      interest_component: interestComponent,
      payment_date: paymentDate,
      payment_mode: mode,
      reference_number: body.reference || null,
      notes: body.remarks || null,
    });
    if (payErr) return NextResponse.json({ error: payErr.message }, { status: 400 });

    const update: Record<string, unknown> = {
      remaining_amount: newRemaining,
      last_payment_date: paymentDate,
      paid_installments: paidInstallments,
      next_payment_date: nextPaymentDate,
      updated_at: new Date().toISOString(),
    };
    if (newRemaining === 0) update.status = 'closed';

    const { error: updErr } = await auth.admin.from('liabilities').update(update).eq('id', liabilityId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

    await writeAudit(auth.admin, auth, {
      action: 'liability.payment',
      entity: 'liabilities',
      entityId: liabilityId,
      before: { remaining_amount: remaining },
      after: { remaining_amount: newRemaining, principalComponent, interestComponent },
    });

    return NextResponse.json({
      success: true,
      principalComponent,
      interestComponent,
      newRemaining,
      closed: newRemaining === 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to record payment.' }, { status: 500 });
  }
}
