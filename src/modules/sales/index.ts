/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Sales Module — Public API
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This barrel export defines the PUBLIC surface of the Sales module.
 * Other modules should ONLY import from this file, never reach into
 * internal components/hooks/services directly.
 *
 * Owner: Sales team
 * Routes: /sales
 * BFF: /api/bff/sales-pipeline
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ── Main module component (lazy-loaded at page level) ─────────────────────────
export { SalesModule } from './SalesModule';
