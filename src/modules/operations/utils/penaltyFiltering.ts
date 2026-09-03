import { PenaltyRecord, PenaltyStatus } from '../schemas/penaltySchema';

/**
 * Determines the filter options for the usePenalties hook based on the active tab.
 */
export function getFilterOptionsForTab(activeTab: string): {
  status?: PenaltyStatus | 'all';
  sourceOfInformation?: string;
} {
  if (activeTab === 'patrol') {
    return { sourceOfInformation: 'Patrol' };
  }
  return {
    status: activeTab === 'all' ? 'all' as const : activeTab as PenaltyStatus,
  };
}

/**
 * Filters an array of penalty records based on the active tab criteria.
 */
export function filterPenaltiesByTab(penalties: PenaltyRecord[], activeTab: string): PenaltyRecord[] {
  const options = getFilterOptionsForTab(activeTab);

  let filtered = penalties;

  // Apply status filter
  if (options.status && options.status !== 'all') {
    filtered = filtered.filter(p => p.status === options.status);
  }

  // Apply source of information filter (for patrol tab)
  if (options.sourceOfInformation) {
    filtered = filtered.filter(p => p.source_of_information === options.sourceOfInformation);
  }

  return filtered;
}

/**
 * Filters penalty records by a search term.
 * Matches against staff_name, post_name, offense, offense_type, or description (case-insensitive).
 */
export function searchPenalties(penalties: PenaltyRecord[], searchTerm: string): PenaltyRecord[] {
  if (!searchTerm) return penalties;
  const searchLower = searchTerm.toLowerCase();
  return penalties.filter(penalty =>
    penalty.staff_name.toLowerCase().includes(searchLower) ||
    penalty.post_name.toLowerCase().includes(searchLower) ||
    penalty.offense.toLowerCase().includes(searchLower) ||
    penalty.offense_type.toLowerCase().includes(searchLower) ||
    penalty.description.toLowerCase().includes(searchLower)
  );
}
