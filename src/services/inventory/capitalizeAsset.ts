'use client';

import { supabaseClient } from '@/integrations/supabase/client';

/**
 * Inventory → Fixed Asset capitalization bridge.
 *
 * Safend Secure Solutions Pvt Ltd is a body corporate that must capitalize
 * high-value durable equipment rather than expense it. Consumables (uniforms,
 * low-value tools) stay in the Office-Admin inventory and are expensed on
 * issue; durable tools above the capitalization threshold are additionally
 * recorded in the Accounts fixed-asset register so they can be depreciated.
 *
 * Policy: tools & equipment with a UNIT purchase price above ₹5,000 and a
 * useful life beyond one year are capitalized (Income Tax Act block "Plant &
 * Machinery", 15% WDV). Uniforms and special items are never capitalized.
 */

/** Unit-price threshold (₹) above which a durable tool is capitalized. */
export const CAPITALIZATION_THRESHOLD = 5000;

/**
 * Whether the given inventory line should prompt the user to capitalize it as
 * a fixed asset. Only durable "tools" above the unit-price threshold qualify.
 */
export function shouldPromptCapitalization(category: string, unitPrice: number): boolean {
  return category === 'tools' && (unitPrice || 0) > CAPITALIZATION_THRESHOLD;
}

export interface CapitalizeParams {
  name: string;
  /** Per-unit purchase price */
  unitPrice: number;
  /** Number of units being capitalized */
  quantity: number;
  branchId?: string | null;
  brand?: string;
  model?: string;
  serialNumber?: string;
  vendor?: string;
  /** ISO date; defaults to today */
  purchaseDate?: string;
}

/**
 * Creates a fixed-asset entry in the Accounts register from an inventory item.
 *
 * The capitalized value is unit price × quantity (the total capital cost
 * entering the books as a "block of assets"). Returns the new fixed-asset id,
 * or null if the insert failed (e.g. table not provisioned) so the caller can
 * continue adding the inventory item regardless.
 */
export async function capitalizeInventoryItemAsAsset(params: CapitalizeParams): Promise<string | null> {
  const qty = Math.max(1, Math.floor(params.quantity || 1));
  const totalValue = Math.max(0, (params.unitPrice || 0) * qty);
  const descBits = [params.brand, params.model].filter(Boolean).join(' ');

  try {
    const { data, error } = await supabaseClient
      .from('fixed_assets')
      .insert({
        name: qty > 1 ? `${params.name} (x${qty})` : params.name,
        category: 'equipment', // durable tools map to the Plant & Machinery block
        purchase_date: params.purchaseDate || new Date().toISOString().split('T')[0],
        purchase_price: totalValue,
        current_value: totalValue,
        depreciation_rate: 15, // IT Act WDV for Plant & Machinery
        depreciation_method: 'wdv',
        accumulated_depreciation: 0,
        serial_number: params.serialNumber || null,
        vendor: params.vendor || null,
        branch_id: params.branchId || null,
        status: 'active',
        notes: `Auto-capitalized from Office-Admin inventory${descBits ? ` — ${descBits}` : ''}. Unit price ₹${(params.unitPrice || 0).toLocaleString('en-IN')} × ${qty}.`,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('Capitalization failed (asset register unavailable):', error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.warn('Capitalization error:', err);
    return null;
  }
}

/**
 * Marks the linked fixed asset as scrapped when its source inventory item is
 * removed, lost, or damaged beyond use. Keeps the asset register in sync with
 * the physical inventory so disposed equipment stops accruing depreciation.
 * Best-effort: returns true on success, false if the update could not be made.
 */
export async function disposeLinkedAsset(assetId: string, reason?: string): Promise<boolean> {
  if (!assetId) return false;
  try {
    const { error } = await supabaseClient
      .from('fixed_assets')
      .update({
        status: 'scrapped',
        sold_date: new Date().toISOString().split('T')[0],
        notes: reason ? `Disposed: ${reason}` : 'Disposed via inventory removal.',
        updated_at: new Date().toISOString(),
      })
      .eq('id', assetId);
    if (error) {
      console.warn('Asset disposal failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Asset disposal error:', err);
    return false;
  }
}

