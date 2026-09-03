'use client';

import { supabase } from '@/integrations/supabase/client';
import { inventoryDisplayLabelFromRow, normaliseItemLabel } from './itemLabel';

/**
 * Post received purchase-order quantities into inventory stock.
 *
 * Why this exists
 * ---------------
 * Receiving a PO used to update `purchase_order_items.received_quantity` and the
 * PO status, and nothing else. `inventoryStore.addStock()` existed but had no
 * callers anywhere in the app, so goods could be marked fully received while
 * stock stayed exactly where it was — across the whole database there were zero
 * `stock_transactions` rows of type `purchase`.
 *
 * Idempotency
 * -----------
 * Receiving is not a one-shot event: a PO can be received partially and then
 * completed, and an operator can re-run a posting. Rather than tracking a
 * "posted" flag, the amount already credited is derived from the ledger itself —
 * the sum of `purchase` transactions carrying this PO number as their reference.
 * Only the difference is posted, so running this twice is a no-op and a top-up
 * delivery credits just the increment.
 *
 * Item resolution
 * ---------------
 * A line credits `inventory_item_id` when present. Orders raised before that
 * column existed fall back to matching the stored composite label
 * ("Shoes · 7 · black") against inventory, and only when exactly one item in the
 * branch matches — an ambiguous match is reported rather than guessed at, because
 * crediting the wrong size is worse than crediting nothing.
 */

export interface ReceiptLine {
  /** `purchase_order_items.id`, used only for reporting. */
  lineId?: string;
  /** Explicit link when the column is populated. */
  inventoryItemId?: string | null;
  /** Stored line label, used as the fallback resolution key. */
  itemName: string;
  /** Cumulative quantity received for this line (not the increment). */
  receivedQuantity: number;
}

export interface PostedLine {
  itemName: string;
  itemCode: string;
  quantity: number;
  previousStock: number;
  newStock: number;
}

export interface SkippedLine {
  itemName: string;
  reason: string;
}

export interface PostReceiptResult {
  success: boolean;
  posted: PostedLine[];
  skipped: SkippedLine[];
  error?: string;
}

export interface PostReceiptArgs {
  /** PO number — becomes the ledger reference and the idempotency key. */
  poNumber: string;
  /** Branch the PO belongs to; scopes label-based resolution. */
  branchId: string;
  lines: ReceiptLine[];
  performedBy: string;
  notes?: string;
}

export async function postPurchaseReceipt({
  poNumber,
  branchId,
  lines,
  performedBy,
  notes,
}: PostReceiptArgs): Promise<PostReceiptResult> {
  const posted: PostedLine[] = [];
  const skipped: SkippedLine[] = [];

  try {
    // ── Load candidate inventory items once ──
    const explicitIds = lines.map((l) => l.inventoryItemId).filter(Boolean) as string[];
    const { data: branchItems, error: itemsError } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('branch', branchId);
    if (itemsError) throw itemsError;

    const itemsById = new Map<string, any>((branchItems ?? []).map((i: any) => [i.id, i]));

    // An explicitly linked item may sit outside this branch; fetch those too so a
    // cross-branch link still posts rather than silently failing to resolve.
    const missingIds = explicitIds.filter((id) => !itemsById.has(id));
    if (missingIds.length > 0) {
      const { data: extra } = await supabase.from('inventory_items').select('*').in('id', missingIds);
      for (const i of extra ?? []) itemsById.set(i.id, i);
    }

    // Label index, only for lines with no explicit link. Labels that map to more
    // than one item are recorded as ambiguous and never auto-resolved.
    const byLabel = new Map<string, any[]>();
    for (const item of branchItems ?? []) {
      const key = normaliseItemLabel(inventoryDisplayLabelFromRow(item));
      if (!key) continue;
      const bucket = byLabel.get(key);
      if (bucket) bucket.push(item);
      else byLabel.set(key, [item]);
    }

    // ── Amount already credited for this PO, per item ──
    const { data: priorTxns, error: txnError } = await supabase
      .from('stock_transactions')
      .select('item_id, quantity')
      .eq('reference', poNumber)
      .eq('transaction_type', 'purchase');
    if (txnError) throw txnError;

    const alreadyPosted = new Map<string, number>();
    for (const t of priorTxns ?? []) {
      alreadyPosted.set(t.item_id, (alreadyPosted.get(t.item_id) ?? 0) + (Number(t.quantity) || 0));
    }

    // ── Post each line's outstanding increment ──
    for (const line of lines) {
      const received = Number(line.receivedQuantity) || 0;
      if (received <= 0) {
        skipped.push({ itemName: line.itemName, reason: 'nothing received yet' });
        continue;
      }

      let item = line.inventoryItemId ? itemsById.get(line.inventoryItemId) : undefined;

      if (!item) {
        const matches = byLabel.get(normaliseItemLabel(line.itemName)) ?? [];
        if (matches.length === 1) {
          item = matches[0];
        } else if (matches.length > 1) {
          skipped.push({
            itemName: line.itemName,
            reason: `matches ${matches.length} inventory items — link the line to one explicitly`,
          });
          continue;
        } else {
          skipped.push({
            itemName: line.itemName,
            reason: 'no matching inventory item in this branch',
          });
          continue;
        }
      }

      const credited = alreadyPosted.get(item.id) ?? 0;
      const delta = received - credited;
      if (delta <= 0) {
        skipped.push({ itemName: line.itemName, reason: `already posted (${credited})` });
        continue;
      }

      const previousStock = Number(item.current_stock) || 0;
      const newStock = previousStock + delta;
      const now = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('inventory_items')
        .update({ current_stock: newStock, last_restocked: now, updated_at: now })
        .eq('id', item.id);
      if (updateError) throw updateError;

      const { error: insertError } = await supabase.from('stock_transactions').insert({
        id: crypto.randomUUID(),
        item_id: item.id,
        item_name: item.name,
        transaction_type: 'purchase',
        quantity: delta,
        previous_stock: previousStock,
        new_stock: newStock,
        reference: poNumber,
        performed_by: performedBy,
        notes: notes ?? `Goods received against ${poNumber}`,
        branch: item.branch,
        timestamp: now,
      });
      if (insertError) {
        // The stock figure moved but the ledger row did not. Roll the stock back so
        // the two never disagree — a silent mismatch here is worse than a failure,
        // because the next posting derives its delta from the ledger.
        await supabase
          .from('inventory_items')
          .update({ current_stock: previousStock, updated_at: now })
          .eq('id', item.id);
        throw insertError;
      }

      // Keep the local index current so repeated lines for the same item accumulate.
      item.current_stock = newStock;
      alreadyPosted.set(item.id, credited + delta);

      posted.push({
        itemName: line.itemName,
        itemCode: item.item_code,
        quantity: delta,
        previousStock,
        newStock,
      });
    }

    return { success: true, posted, skipped };
  } catch (err: any) {
    console.error('[postPurchaseReceipt] failed:', {
      message: err?.message ?? String(err),
      code: err?.code,
      details: err?.details,
      hint: err?.hint,
    });
    return {
      success: false,
      posted,
      skipped,
      error: err?.message || 'Could not post received goods to inventory',
    };
  }
}
