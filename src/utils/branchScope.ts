'use client';

/**
 * Global branch scope helper.
 *
 * RLS already isolates SUB-BRANCH users at the database level. This utility
 * handles the other half: letting a MAIN/HQ user switch branches via the header
 * dropdown and have every module's data follow the selection.
 *
 * The selected branch is persisted to localStorage by BranchContext, and a
 * 'branchscope:changed' event is emitted on every switch. Shared data services
 * read getBranchScopeFilter() to scope their queries and listen via
 * onBranchScopeChange() to re-fetch when the selection changes.
 */

const EVENT = 'branchscope:changed';

export interface BranchScope {
  // Branch identifiers — branch_id is stored as UUID on some tables and as the
  // legacy code (e.g. BR001) on others, so we keep both.
  id: string | null;
  code: string | null;
  type: 'main' | 'sub' | null;
  isMainUser: boolean;
}

export function setBranchScope(scope: BranchScope) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('selectedBranchId', scope.id || '');
  localStorage.setItem('selectedBranchCode', scope.code || '');
  localStorage.setItem('selectedBranchType', scope.type || '');
  localStorage.setItem('isMainBranchUser', scope.isMainUser ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getBranchScope(): BranchScope {
  if (typeof window === 'undefined') {
    return { id: null, code: null, type: null, isMainUser: false };
  }
  return {
    id: localStorage.getItem('selectedBranchId') || null,
    code: localStorage.getItem('selectedBranchCode') || null,
    type: (localStorage.getItem('selectedBranchType') as 'main' | 'sub' | null) || null,
    isMainUser: localStorage.getItem('isMainBranchUser') === 'true',
  };
}

/**
 * Returns the branch_id values to filter by, or null to mean "no filter / show all".
 *
 * - Main user viewing the MAIN/HQ branch  -> null (see everything)
 * - Main user viewing a specific sub-branch -> [uuid, code]
 * - Sub-branch user -> [uuid, code] (redundant with RLS but keeps UI consistent)
 */
export function getBranchScopeFilter(): string[] | null {
  const s = getBranchScope();
  if (s.isMainUser && (s.type === 'main' || (!s.id && !s.code))) {
    return null; // show all branches
  }
  const variants = [s.id, s.code].filter(Boolean) as string[];
  return variants.length > 0 ? variants : null;
}

/**
 * Apply the current branch scope to a Supabase query builder.
 * Returns the query unchanged when all branches should be shown.
 */
export function applyBranchScope<T extends { in: (col: string, vals: any[]) => T }>(query: T): T {
  const filter = getBranchScopeFilter();
  if (!filter) return query;
  return query.in('branch_id', filter);
}

/** Subscribe to branch-switch events. Returns an unsubscribe function. */
export function onBranchScopeChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
