/**
 * Format a rupee amount in the Indian abbreviated style used across finance UIs:
 *   ₹1,234        -> ₹1,234        (small values stay exact, fully grouped)
 *   ₹1,23,456     -> ₹1.23 L       (abbreviated from a lakh upward)
 *   ₹1,23,45,678  -> ₹1.23 Cr
 * The exact value can still be shown as a tooltip alongside this label.
 */
export function formatINRShort(value: number): string {
  const n = Math.round(value || 0);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)} L`;
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
}
