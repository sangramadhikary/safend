import { NextRequest, NextResponse } from 'next/server';
import { requireAccountsAccess, writeAudit } from '@/lib/accounts/server';
import { rateLimit } from '@/lib/rateLimit';

/**
 * Fixed-asset mutations (create / update / dispose) — server-side, auth-gated,
 * and audited. Reads remain client-side (RLS-protected); only writes are
 * centralized here so every ledger change is authorized and recorded.
 */

const VALID_CATEGORIES = ['building', 'land', 'equipment', 'vehicle', 'it_asset', 'furniture', 'other'];
const VALID_METHODS = ['wdv', 'slm'];

/** POST — create a new fixed asset. */
export async function POST(request: NextRequest) {
  const auth = await requireAccountsAccess(request);
  if ('response' in auth) return auth.response;

  const { limited, retryAfter } = rateLimit(`assets:create:${auth.userId}`, { limit: 60, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  }

  try {
    const body = await request.json();
    const name = (body.name || '').toString().trim();
    const price = Number(body.purchasePrice);
    const purchaseDate = body.purchaseDate;

    if (!name || !purchaseDate || !(price >= 0)) {
      return NextResponse.json({ error: 'Name, purchase date, and a valid purchase price are required.' }, { status: 400 });
    }
    const category = VALID_CATEGORIES.includes(body.category) ? body.category : 'other';
    const method = VALID_METHODS.includes((body.depreciationMethod || '').toLowerCase()) ? body.depreciationMethod.toLowerCase() : 'wdv';
    const rate = Math.min(100, Math.max(0, Number(body.depreciationRate) || 0));
    const salvage = Math.max(0, Number(body.salvageValue) || 0);

    const insertRow = {
      name,
      category,
      purchase_date: purchaseDate,
      purchase_price: price,
      current_value: price,
      depreciation_rate: rate,
      depreciation_method: method,
      accumulated_depreciation: 0,
      salvage_value: salvage,
      description: (body.description || '').toString().trim() || null,
      serial_number: body.serialNumber || null,
      vendor: body.vendor || null,
      status: 'active',
      branch_id: body.branchId || null,
    };

    const { data, error } = await auth.admin.from('fixed_assets').insert(insertRow).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await writeAudit(auth.admin, auth, { action: 'asset.create', entity: 'fixed_assets', entityId: data.id, after: data });
    return NextResponse.json({ success: true, asset: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create asset.' }, { status: 500 });
  }
}

/** PATCH — update or dispose an existing asset. Body: { id, updates }. */
export async function PATCH(request: NextRequest) {
  const auth = await requireAccountsAccess(request);
  if ('response' in auth) return auth.response;

  try {
    const body = await request.json();
    const id = body.id;
    const updates = body.updates || {};
    if (!id) return NextResponse.json({ error: 'Asset id is required.' }, { status: 400 });

    // Capture the prior state for the audit trail.
    const { data: before } = await auth.admin.from('fixed_assets').select('*').eq('id', id).single();

    // Whitelist mutable columns to prevent arbitrary field injection.
    const ALLOWED = ['name', 'category', 'description', 'depreciation_rate', 'depreciation_method',
      'salvage_value', 'status', 'sold_date', 'sold_price', 'notes', 'location', 'assigned_to',
      'serial_number', 'vendor', 'current_value'];
    const clean: Record<string, unknown> = {};
    for (const k of ALLOWED) if (k in updates) clean[k] = updates[k];
    clean.updated_at = new Date().toISOString();

    const { data, error } = await auth.admin.from('fixed_assets').update(clean).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const action = updates.status === 'sold' || updates.status === 'scrapped' ? 'asset.dispose' : 'asset.update';
    await writeAudit(auth.admin, auth, { action, entity: 'fixed_assets', entityId: id, before, after: data });
    return NextResponse.json({ success: true, asset: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update asset.' }, { status: 500 });
  }
}
