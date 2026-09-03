'use client';

/**
 * Data hook for the audit log view.
 *
 * Owns filter state, request lifecycle, and the live-tail poll, keeping all of it
 * out of the presentation component.
 *
 * Two behaviours here fix concrete defects in the previous implementation:
 *
 *   REQUEST CANCELLATION. Filters were re-fetched on every change with no
 *   cancellation, so a fast sequence of toggles could land out of order and leave
 *   the table showing the result of a filter the operator had already changed. In-
 *   flight requests are now aborted when superseded.
 *
 *   DEBOUNCED SEARCH. Search previously ran client-side over a fixed 500-row
 *   window, which was instant but wrong. Moving it server-side makes it correct
 *   but means a request per keystroke, so the term is debounced and kept separate
 *   from the committed filter state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchAuditLog } from '@/utils/auditLog';
import type {
  AuditFacets, AuditQuery, AuditRecord, AuditOutcome,
} from '@/lib/audit/types';
import type { ActionCategory, AuditSeverity } from '@/lib/audit/actions';

/** Named relative windows offered in the date filter. */
export type DatePreset =
  | 'all' | 'today' | 'yesterday' | '7days' | '30days' | '90days'
  | 'thisMonth' | 'lastMonth' | 'custom';

export const DATE_PRESETS: ReadonlyArray<{ value: DatePreset; label: string }> = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7days', label: 'Last 7 days' },
  { value: '30days', label: 'Last 30 days' },
  { value: '90days', label: 'Last 90 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'custom', label: 'Custom range…' },
];

/**
 * Resolve a preset into an absolute window.
 *
 * Boundaries are computed in local time and inclusive of the whole end day, which
 * is what an operator selecting "yesterday" means. Sending a bare date would
 * cut the range at midnight and silently omit the entire day's activity.
 */
export function resolveDatePreset(
  preset: DatePreset,
  custom?: { from?: string; to?: string }
): { from?: string; to?: string } {
  if (preset === 'all') return {};
  if (preset === 'custom') {
    return {
      from: custom?.from ? new Date(custom.from).toISOString() : undefined,
      to: custom?.to ? new Date(custom.to).toISOString() : undefined,
    };
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (preset) {
    case 'today':
      return { from: startOfToday.toISOString(), to: endOfToday.toISOString() };
    case 'yesterday': {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 1);
      const end = new Date(endOfToday);
      end.setDate(end.getDate() - 1);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    case '7days':
    case '30days':
    case '90days': {
      const days = preset === '7days' ? 7 : preset === '30days' ? 30 : 90;
      const start = new Date(startOfToday);
      // Inclusive of today, so "last 7 days" spans 7 calendar days rather than 8.
      start.setDate(start.getDate() - (days - 1));
      return { from: start.toISOString(), to: endOfToday.toISOString() };
    }
    case 'thisMonth': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { from: start.toISOString(), to: endOfToday.toISOString() };
    }
    case 'lastMonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    default:
      return {};
  }
}

/** The complete filter state owned by the view. */
export interface AuditFilterState {
  search: string;
  actors: string[];
  actions: string[];
  modules: string[];
  severities: AuditSeverity[];
  categories: ActionCategory[];
  outcomes: AuditOutcome[];
  datePreset: DatePreset;
  customFrom: string;
  customTo: string;
  entityType: string;
  entityId: string;
  sessionId: string;
  changedField: string;
  hasSnapshot: boolean | null;
  sortBy: NonNullable<AuditQuery['sortBy']>;
  sortDir: NonNullable<AuditQuery['sortDir']>;
  page: number;
  pageSize: number;
}

export const INITIAL_FILTERS: AuditFilterState = {
  search: '',
  actors: [],
  actions: [],
  modules: [],
  severities: [],
  categories: [],
  outcomes: [],
  datePreset: 'all',
  customFrom: '',
  customTo: '',
  entityType: '',
  entityId: '',
  sessionId: '',
  changedField: '',
  hasSnapshot: null,
  sortBy: 'timestamp',
  sortDir: 'desc',
  page: 1,
  pageSize: 50,
};

const SEARCH_DEBOUNCE_MS = 350;
const LIVE_TAIL_INTERVAL_MS = 15_000;

/** Build the wire query from filter state. */
export function buildQuery(filters: AuditFilterState): AuditQuery {
  const { from, to } = resolveDatePreset(filters.datePreset, {
    from: filters.customFrom,
    to: filters.customTo,
  });

  return {
    search: filters.search || undefined,
    actors: filters.actors.length > 0 ? filters.actors : undefined,
    actions: filters.actions.length > 0 ? filters.actions : undefined,
    modules: filters.modules.length > 0 ? filters.modules : undefined,
    severities: filters.severities.length > 0 ? filters.severities : undefined,
    categories: filters.categories.length > 0 ? filters.categories : undefined,
    outcomes: filters.outcomes.length > 0 ? filters.outcomes : undefined,
    from,
    to,
    entityType: filters.entityType || undefined,
    entityId: filters.entityId || undefined,
    sessionId: filters.sessionId || undefined,
    changedField: filters.changedField || undefined,
    hasSnapshot: filters.hasSnapshot ?? undefined,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

/** Count how many filter dimensions are currently narrowing the result. */
export function countActiveFilters(filters: AuditFilterState): number {
  let n = 0;
  if (filters.search) n += 1;
  if (filters.actors.length > 0) n += 1;
  if (filters.actions.length > 0) n += 1;
  if (filters.modules.length > 0) n += 1;
  if (filters.severities.length > 0) n += 1;
  if (filters.categories.length > 0) n += 1;
  if (filters.outcomes.length > 0) n += 1;
  if (filters.datePreset !== 'all') n += 1;
  if (filters.entityType || filters.entityId) n += 1;
  if (filters.sessionId) n += 1;
  if (filters.changedField) n += 1;
  if (filters.hasSnapshot !== null) n += 1;
  return n;
}

const EMPTY_FACETS: AuditFacets = {
  total: 0,
  byOutcome: {},
  bySeverity: {},
  byCategory: {},
  byModule: {},
  uniqueActors: 0,
  actors: [],
};

export interface UseAuditLogResult {
  filters: AuditFilterState;
  /** Committed search term; mirrors `searchInput` after the debounce. */
  searchInput: string;
  setSearchInput: (value: string) => void;
  patchFilters: (patch: Partial<AuditFilterState>) => void;
  resetFilters: () => void;
  activeFilterCount: number;

  records: AuditRecord[];
  facets: AuditFacets;
  totalPages: number;

  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  lastUpdated: Date | null;

  liveTail: boolean;
  setLiveTail: (on: boolean) => void;

  refresh: () => void;
  query: AuditQuery;
}

export function useAuditLog(): UseAuditLogResult {
  const [filters, setFilters] = useState<AuditFilterState>(INITIAL_FILTERS);
  const [searchInput, setSearchInput] = useState('');

  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [facets, setFacets] = useState<AuditFacets>(EMPTY_FACETS);
  const [totalPages, setTotalPages] = useState(1);

  // `isLoading` drives the skeleton on first load and filter changes;
  // `isRefreshing` drives a subtler indicator for the live-tail poll, which must
  // not blank the table the operator is reading.
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveTail, setLiveTail] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  // Commit the search term after the user stops typing, and return to page 1 —
  // staying on page 7 of a new, smaller result set would show an empty table.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) =>
        prev.search === searchInput ? prev : { ...prev, search: searchInput, page: 1 }
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = useMemo(() => buildQuery(filters), [filters]);

  const load = useCallback(
    async (mode: 'full' | 'background') => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (mode === 'full') setIsLoading(true);
      else setIsRefreshing(true);
      setError(null);

      try {
        const result = await fetchAuditLog(query, controller.signal);
        if (controller.signal.aborted) return;

        setRecords(result.records);
        setFacets(result.facets);
        setTotalPages(result.totalPages);
        setLastUpdated(new Date());
      } catch (err: any) {
        // An abort is the expected outcome of superseding a request, not a failure
        // to report to the operator.
        if (err?.name === 'AbortError' || controller.signal.aborted) return;
        setError(err?.message ?? 'Failed to load the audit log.');
        setRecords([]);
        setFacets(EMPTY_FACETS);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [query]
  );

  useEffect(() => {
    void load('full');
  }, [load, reloadToken]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Live tail polls in the background, and only while the tab is visible — a
  // hidden tab polling every 15 seconds is pure waste.
  useEffect(() => {
    if (!liveTail) return;

    const tick = () => {
      if (document.visibilityState === 'visible') void load('background');
    };
    const interval = setInterval(tick, LIVE_TAIL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [liveTail, load]);

  const patchFilters = useCallback((patch: Partial<AuditFilterState>) => {
    setFilters((prev) => {
      // Any change other than paging returns to page 1: applying a filter while
      // on page 4 otherwise lands on a page the new result set may not have.
      const resetsPage = !('page' in patch) || Object.keys(patch).length > 1;
      return { ...prev, ...patch, ...(resetsPage && !('page' in patch) ? { page: 1 } : {}) };
    });
  }, []);

  const resetFilters = useCallback(() => {
    setSearchInput('');
    setFilters(INITIAL_FILTERS);
  }, []);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  return {
    filters,
    searchInput,
    setSearchInput,
    patchFilters,
    resetFilters,
    activeFilterCount: countActiveFilters(filters),

    records,
    facets,
    totalPages,

    isLoading,
    isRefreshing,
    error,
    lastUpdated,

    liveTail,
    setLiveTail,

    refresh,
    query,
  };
}
