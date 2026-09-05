/**
 * Indian-number-system currency and number formatting helpers.
 *
 * Two styles are provided:
 *
 *  - {@link formatINR}       exact value, Indian digit grouping (lakh/crore
 *                            comma placement): 1036870 -> "₹10,36,870".
 *  - {@link formatINRShort}  abbreviated for compact info/stat cards using the
 *                            Indian scale K (thousand) / L (lakh) / Cr (crore):
 *                              999        -> "₹999"
 *                              12,345     -> "₹12.35 K"
 *                              10,36,870  -> "₹10.37 L"
 *                              1,23,45,678-> "₹1.23 Cr"
 *
 * Info/summary cards should show the abbreviated label and expose the exact
 * value (via {@link formatINR}) as a tooltip so precision is never lost.
 */

/** Exact rupee amount with Indian digit grouping. e.g. 1036870 -> "₹10,36,870". */
export function formatINR(value: number): string {
  const n = Math.round(value || 0);
  const sign = n < 0 ? '-' : '';
  return `${sign}₹${Math.abs(n).toLocaleString('en-IN')}`;
}

/** Exact number (no currency symbol) with Indian digit grouping. */
export function formatIndianNumber(value: number): string {
  const n = Math.round(value || 0);
  return n.toLocaleString('en-IN');
}

/**
 * Format a rupee amount in the Indian abbreviated style used across finance UIs:
 *   ₹1,234        -> ₹1,234        (below a thousand, exact)
 *   ₹12,345       -> ₹12.35 K      (thousand)
 *   ₹1,23,456     -> ₹1.23 L       (lakh)
 *   ₹1,23,45,678  -> ₹1.23 Cr      (crore)
 * The exact value can still be shown as a tooltip alongside this label.
 */
export function formatINRShort(value: number): string {
  const n = Math.round(value || 0);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)} L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(2)} K`;
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
}
