/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Operations Module — Public API
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Public surface of the Operations module.
 * Other modules should ONLY import from this file.
 *
 * Owner: Operations team
 * Routes: /operations
 * BFF: /api/bff/operations-dashboard
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ── Main module component ─────────────────────────────────────────────────────
export { OperationsModule } from './OperationsModule';

// ── Shared hooks (explicitly exported for cross-module use) ───────────────────
export { useMessFundRequests } from './hooks/useMessFundRequests';
export type { MessFundRequestWithWeek } from './hooks/useMessFundRequests';
