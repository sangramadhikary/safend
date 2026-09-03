'use client';

import { InventoryMasterItem, SUB_CATEGORY_LABELS } from "./types";

/**
 * Stock health predicates. Defined once here so the header count, the filter
 * tabs, the per-category badges and the CSV status column can never drift
 * apart. `low` deliberately excludes zero stock — an item that is out is
 * reported as out, not double-counted as low.
 */
export const isOutOfStock = (i: InventoryMasterItem) => i.currentStock === 0;
export const isLowStock = (i: InventoryMasterItem) => i.currentStock > 0 && i.currentStock <= i.reorderLevel;
export const isHealthyStock = (i: InventoryMasterItem) => i.currentStock > i.reorderLevel;

export function stockStatusLabel(i: InventoryMasterItem): string {
  if (isOutOfStock(i)) return 'Out of Stock';
  if (isLowStock(i)) return 'Low Stock';
  return 'In Stock';
}

export function subCatLabel(s: string): string {
  return SUB_CATEGORY_LABELS[s] ?? s;
}

/** Escapes a value for CSV, quoting only when needed. */
function escapeCsv(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADERS = [
  'Item Code', 'Name', 'Category', 'Sub Category', 'Size', 'Model',
  'Color', 'Current Stock', 'Reorder Level', 'Status', 'Location',
  'Purchase Price', 'Stock Value', 'Fixed Asset',
] as const;

/**
 * Downloads the given items as a CSV file. A BOM is prepended so Excel opens
 * the rupee amounts and any non-ASCII item names in the right encoding.
 */
export function exportItemsCsv(
  items: InventoryMasterItem[],
  branch: string,
  filenamePrefix = 'inventory',
): void {
  const rows = items.map(i => [
    i.itemCode,
    i.name,
    i.category,
    subCatLabel(i.subCategory),
    i.size || '',
    i.model || '',
    i.color?.replace('_', ' ') || '',
    i.currentStock,
    i.reorderLevel,
    stockStatusLabel(i),
    i.location || '',
    i.purchasePrice ?? '',
    i.currentStock * (i.purchasePrice || 0),
    i.capitalize ? 'Yes' : 'No',
  ]);

  const csv = [HEADERS as readonly unknown[], ...rows]
    .map(r => r.map(escapeCsv).join(','))
    .join('\r\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}-${branch}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
