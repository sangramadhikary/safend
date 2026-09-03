'use client';

import { supabaseClient } from '@/integrations/supabase/client';
import type { Branch } from '@/contexts/BranchContext';

/**
 * Resolve the set of branch_id values that identify the given branch.
 * branch_id is stored as a UUID on some tables and as the branch code
 * (e.g. BR001) on others, so we return both forms to match either.
 */
export function branchIdVariants(branch: Branch | null | undefined): string[] {
  if (!branch) return [];
  const out = new Set<string>();
  if (branch.id) out.add(branch.id);
  if (branch.code) out.add(branch.code);
  return Array.from(out);
}

/**
 * Should the dashboard show ALL branches' data?
 * True only when a main/HQ user has the main branch selected.
 * When a main user selects a specific sub-branch, we scope to it.
 */
export function shouldShowAllBranches(
  currentBranch: Branch | null | undefined,
  isMainBranchUser: boolean,
): boolean {
  return isMainBranchUser && (currentBranch?.type === 'main' || !currentBranch);
}

/**
 * Apply a branch filter to a Supabase query builder based on the selected
 * branch. Returns the query unchanged when all branches should be shown.
 *
 * Note: RLS already restricts sub-branch users at the database level. This
 * client-side filter is what makes the main user's header dropdown actually
 * change the data they see.
 */
export function applyBranchFilter<T>(
  query: T,
  currentBranch: Branch | null | undefined,
  isMainBranchUser: boolean,
): T {
  if (shouldShowAllBranches(currentBranch, isMainBranchUser)) {
    return query;
  }
  const variants = branchIdVariants(currentBranch);
  if (variants.length === 0) return query;
  // @ts-expect-error - supabase query builder supports .in()
  return query.in('branch_id', variants);
}

/** Convenience: a scoped select for a table with the branch filter applied. */
export function branchScopedSelect(
  table: string,
  columns: string,
  currentBranch: Branch | null | undefined,
  isMainBranchUser: boolean,
) {
  const q = supabaseClient.from(table).select(columns);
  return applyBranchFilter(q, currentBranch, isMainBranchUser);
}
