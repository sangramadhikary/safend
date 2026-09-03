'use client';

import { SUB_CATEGORY_LABELS } from './types';

/**
 * Human-readable label for an inventory item, e.g. "Shoes · 7 · black".
 *
 * Purchase order lines store this string in `purchase_order_items.item_name`,
 * and — for orders raised before the line/item link existed — it is the ONLY way
 * to work out which inventory item a received line should credit. It therefore
 * has to be generated from one place: a second copy that formatted the parts
 * differently would silently stop matching and stock would never post.
 */
export interface LabelledInventoryItem {
  subCategory?: string | null;
  size?: string | null;
  color?: string | null;
  model?: string | null;
  brand?: string | null;
}

export function inventoryDisplayLabel(item: LabelledInventoryItem): string {
  const parts: string[] = [
    SUB_CATEGORY_LABELS[item.subCategory ?? ''] ?? item.subCategory ?? '',
  ];
  if (item.size) parts.push(String(item.size));
  if (item.color) parts.push(String(item.color).replace(/_/g, ' '));
  if (item.model) parts.push(String(item.model));
  if (item.brand) parts.push(`(${item.brand})`);
  return parts.filter(Boolean).join(' · ');
}

/** Same label, built from a raw `inventory_items` DB row (snake_case columns). */
export function inventoryDisplayLabelFromRow(row: any): string {
  return inventoryDisplayLabel({
    subCategory: row?.sub_category,
    size: row?.size,
    color: row?.color,
    model: row?.model,
    brand: row?.brand,
  });
}

/** Normalised form used for comparing labels — tolerates spacing/case drift. */
export function normaliseItemLabel(label: unknown): string {
  return String(label ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
