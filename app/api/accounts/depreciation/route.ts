import { NextRequest, NextResponse } from 'next/server';
import { requireAccountsAccess, writeAudit } from '@/lib/accounts/server';

/**
 * Depreciation run — server-side, auth-gated, audited. Encapsulates the same
 * correctness rules enforced in the UI (duplicate-run guard, salvage floor,
 * additive accumulation, land exclusion, 180-day pro-rata) so the ledger cannot
 * be corrupted by a crafted client request.
 *
 * Indian FY: 1 April – 31 March.
 */

const NON_DEPRECIABLE = ['land'];

export async function POST(request: NextRequest) {
  const auth = await requireAccountsAccess(request);
  if ('response' in auth) return auth.response;

  try {
    const now = new Date();
    const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const fy = `${fyStartYear}-${fyStartYear + 1}`;
    const h2CutOff = new Date(fyStartYear, 9, 1); // 1 October
    const today = now.toISOString().split('T')[0];

    // Load active, depreciable assets.
    const { data: assets, error: assetsErr } = await auth.admin
      .from('fixed_assets')
      .select('*')
      .eq('status', 'active')
      .gt('depreciation_rate', 0);
    if (assetsErr) return NextResponse.json({ error: assetsErr.message }, { status: 400 });

    const eligible = (assets || []).filter((a: any) => !NON_DEPRECIABLE.includes(a.category));
    if (eligible.length === 0) {
      return NextResponse.json({ success: true, processed: 0, skipped: 0, fy, message: 'No eligible assets.' });
    }

    // Duplicate-run guard: skip assets already depreciated this FY.
    const { data: existingLogs } = await auth.admin
      .from('depreciation_log')
      .select('asset_id')
      .eq('financial_year', fy);
    const done = new Set((existingLogs || []).map((r: any) => r.asset_id));
    const toProcess = eligible.filter((a: any) => !done.has(a.id));
    const skipped = eligible.length - toProcess.length;

    let processed = 0;
    for (const asset of toProcess) {
      const currentValue = Number(asset.current_value) || 0;
      const purchasePrice = Number(asset.purchase_price) || 0;
      const rate = Number(asset.depreciation_rate) || 0;
      const method = (asset.depreciation_method || 'wdv').toUpperCase();
      const salvage = Number(asset.salvage_value) || 0;
      const accumulated = Number(asset.accumulated_depreciation) || 0;

      const base = method === 'WDV' ? currentValue : purchasePrice;
      let depAmount = Math.round(base * (rate / 100));

      // 180-day pro-rata in the acquisition year.
      const isFirst = accumulated === 0 && !asset.last_depreciation_date;
      const acquiredInH2 = asset.purchase_date ? new Date(asset.purchase_date) >= h2CutOff : false;
      if (isFirst && acquiredInH2) depAmount = Math.round(depAmount / 2);

      // Salvage floor.
      const maxDepreciable = Math.max(0, currentValue - salvage);
      depAmount = Math.min(depAmount, maxDepreciable);
      if (depAmount <= 0) { processed++; continue; }

      const newValue = currentValue - depAmount;
      const newAccumulated = accumulated + depAmount;

      await auth.admin.from('fixed_assets').update({
        current_value: newValue,
        accumulated_depreciation: newAccumulated,
        last_depreciation_date: today,
        updated_at: now.toISOString(),
      }).eq('id', asset.id);

      await auth.admin.from('depreciation_log').insert({
        asset_id: asset.id,
        depreciation_date: today,
        opening_value: currentValue,
        depreciation_amount: depAmount,
        closing_value: newValue,
        method,
        rate,
        financial_year: fy,
      });
      processed++;
    }

    await writeAudit(auth.admin, auth, {
      action: 'depreciation.run',
      entity: 'fixed_assets',
      after: { financialYear: fy, processed, skipped },
    });

    return NextResponse.json({ success: true, processed, skipped, fy });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Depreciation run failed.' }, { status: 500 });
  }
}
