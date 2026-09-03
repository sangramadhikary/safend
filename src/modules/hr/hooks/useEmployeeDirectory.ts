'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabaseClient } from '@/integrations/supabase/client';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { type HREmployee } from '@/services/supabase/HREmployeeService';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * useEmployeeDirectory — Performance-optimized hook for the HR Employee tab
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Instead of:
 * - subscribeToHREmployees (fetches ALL 1300+ rows for stats)
 * - getHREmployeeLetterCounts (fetches all names)
 * - getHREmployeesByLetter (fetches full rows)
 *
 * This hook:
 * 1. Calls a single BFF endpoint that returns stats + letter employees in one request
 * 2. Subscribes to realtime changes and applies granular updates (no full re-fetch)
 * 3. Only re-fetches stats on INSERT/DELETE (status changes handled locally)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

export interface EmployeeStats {
  total: number;
  statusCounts: Record<string, number>;
  departmentCounts: Record<string, number>;
  tenureBuckets: Record<string, number>;
  ageBuckets: Record<string, number>;
  letterCounts: Record<string, number>;
}

interface UseEmployeeDirectoryReturn {
  employees: HREmployee[];
  stats: EmployeeStats | null;
  isLoading: boolean;
  letterFilter: string;
  setLetterFilter: (letter: string) => void;
  searchResults: HREmployee[] | null;
  search: (term: string) => void;
  advancedSearch: (filters: AdvancedSearchFilters) => void;
  clearAdvancedSearch: () => void;
  refreshStats: () => void;
  refreshEmployees: () => void;
}

export interface AdvancedSearchFilters {
  department?: string;
  designation?: string;
  statuses?: string[];
  gender?: string;
  religion?: string;
  joinFrom?: string;
  joinTo?: string;
  ageFrom?: string;
  ageTo?: string;
  heightFrom?: string;
  heightTo?: string;
  weightFrom?: string;
  weightTo?: string;
  salaryFrom?: string;
  salaryTo?: string;
  photo?: 'with' | 'without' | '';
  contact?: 'phone' | 'email' | 'both' | '';
  birthday?: 'today' | 'month' | '';
  profile?: 'complete' | 'incomplete' | '';
  postedToday?: 'posted' | 'not_posted' | '';
  medical?: 'declared' | 'none' | '';
  education?: string;
}

// Map a DB row from the BFF (snake_case) to HREmployee (camelCase)
function mapBffRow(row: any): HREmployee {
  return {
    id: row.id,
    employeeId: row.employee_id || '',
    name: row.name || '',
    email: row.email || '',
    phone: row.phone || '',
    gender: row.gender || 'male',
    dateOfBirth: row.date_of_birth || undefined,
    department: row.department || '',
    designation: row.designation || '',
    joinDate: row.join_date || '',
    employmentType: 'Full-Time',
    status: row.status === 'active' ? 'Active'
      : row.status === 'inactive' ? 'Inactive'
      : row.status === 'on leave' ? 'On Leave'
      : row.status === 'terminated' ? 'Terminated'
      : row.status === 'absconded' ? 'Absconded'
      : row.status === 'suspended' ? 'Suspended'
      : row.status || 'Active',
    photoUrl: row.photo_url || undefined,
    avatar: row.photo_url || undefined,
    height: row.height || undefined,
    weight: row.weight || undefined,
    branchId: row.branch_id,
  };
}

export function useEmployeeDirectory(): UseEmployeeDirectoryReturn {
  const [employees, setEmployees] = useState<HREmployee[]>([]);
  const [stats, setStats] = useState<EmployeeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [letterFilter, setLetterFilter] = useState('A');
  const [searchResults, setSearchResults] = useState<HREmployee[] | null>(null);
  const { currentBranch } = useBranch();
  const abortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const branchId = currentBranch?.code || currentBranch?.id || null;

  // ─── Helper to get auth headers ─────────────────────────────────────────────
  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const client = getSupabaseClient();
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) return {};
    return { 'Authorization': `Bearer ${session.access_token}` };
  }, []);

  // ─── Fetch initial data from BFF ──────────────────────────────────────────
  const fetchData = useCallback(async (letter: string) => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    try {
      const params = new URLSearchParams({ letter });
      if (branchId) params.set('branchId', branchId);

      const headers = await getAuthHeaders();
      const res = await fetch(`/api/bff/hr-employees?${params.toString()}`, {
        signal: controller.signal,
        headers,
      });
      if (!res.ok) throw new Error(`BFF returned ${res.status}`);
      const data = await res.json();

      if (!controller.signal.aborted) {
        setStats(data.stats);
        setEmployees((data.employees || []).map(mapBffRow));
        setIsLoading(false);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('[useEmployeeDirectory] fetch error:', err);
        setIsLoading(false);
      }
    }
  }, [branchId, getAuthHeaders]);

  // ─── Search via BFF ────────────────────────────────────────────────────────
  const search = useCallback((term: string) => {
    // Clear previous timer
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!term.trim()) {
      setSearchResults(null);
      searchAbortRef.current?.abort();
      return;
    }

    // Debounce 300ms
    searchTimerRef.current = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      try {
        const params = new URLSearchParams({ search: term });
        if (branchId) params.set('branchId', branchId);

        const headers = await getAuthHeaders();
        const res = await fetch(`/api/bff/hr-employees?${params.toString()}`, {
          signal: controller.signal,
          headers,
        });
        if (!res.ok) throw new Error(`Search BFF returned ${res.status}`);
        const data = await res.json();

        if (!controller.signal.aborted) {
          setSearchResults((data.employees || []).map(mapBffRow));
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('[useEmployeeDirectory] search error:', err);
        }
      }
    }, 300);
  }, [branchId, getAuthHeaders]);

  // ─── Advanced Search via BFF ───────────────────────────────────────────────
  const advancedSearch = useCallback((filters: AdvancedSearchFilters) => {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    const params = new URLSearchParams();
    if (branchId) params.set('branchId', branchId);
    if (filters.department) params.set('adv_department', filters.department);
    if (filters.designation) params.set('adv_designation', filters.designation);
    if (filters.statuses?.length) params.set('adv_statuses', filters.statuses.join(','));
    if (filters.gender) params.set('adv_gender', filters.gender);
    if (filters.religion) params.set('adv_religion', filters.religion);
    if (filters.joinFrom) params.set('adv_join_from', filters.joinFrom);
    if (filters.joinTo) params.set('adv_join_to', filters.joinTo);
    if (filters.ageFrom) params.set('adv_age_from', filters.ageFrom);
    if (filters.ageTo) params.set('adv_age_to', filters.ageTo);
    if (filters.heightFrom) params.set('adv_height_from', filters.heightFrom);
    if (filters.heightTo) params.set('adv_height_to', filters.heightTo);
    if (filters.weightFrom) params.set('adv_weight_from', filters.weightFrom);
    if (filters.weightTo) params.set('adv_weight_to', filters.weightTo);
    if (filters.salaryFrom) params.set('adv_salary_from', filters.salaryFrom);
    if (filters.salaryTo) params.set('adv_salary_to', filters.salaryTo);
    if (filters.photo) params.set('adv_photo', filters.photo);
    if (filters.contact) params.set('adv_contact', filters.contact);
    if (filters.birthday) params.set('adv_birthday', filters.birthday);
    if (filters.profile) params.set('adv_profile', filters.profile);
    if (filters.postedToday) params.set('adv_posted_today', filters.postedToday);
    if (filters.medical) params.set('adv_medical', filters.medical);
    if (filters.education) params.set('adv_education', filters.education);

    getAuthHeaders().then(headers => {
      fetch(`/api/bff/hr-employees?${params.toString()}`, {
        signal: controller.signal,
        headers,
      })
        .then(res => {
          if (!res.ok) throw new Error(`Advanced search BFF returned ${res.status}`);
          return res.json();
        })
        .then(data => {
          if (!controller.signal.aborted) {
            setSearchResults((data.employees || []).map(mapBffRow));
          }
        })
        .catch((err: any) => {
          if (err.name !== 'AbortError') {
            console.error('[useEmployeeDirectory] advanced search error:', err);
          }
        });
    });
  }, [branchId, getAuthHeaders]);

  const clearAdvancedSearch = useCallback(() => {
    setSearchResults(null);
    searchAbortRef.current?.abort();
  }, []);

  // ─── Fetch on letter change ────────────────────────────────────────────────
  useEffect(() => {
    fetchData(letterFilter);
  }, [letterFilter, fetchData]);

  // ─── Realtime subscription (granular updates) ──────────────────────────────
  useEffect(() => {
    const channel = supabaseClient
      .channel('hr-emp-dir-' + Date.now())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'employees' }, (payload) => {
        const newEmp = mapBffRow(payload.new);
        // Add to current letter view if matches
        const firstChar = newEmp.name?.charAt(0)?.toUpperCase();
        if (firstChar === letterFilter.toUpperCase()) {
          setEmployees(prev => [...prev, newEmp].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        }
        // Refresh stats (cheap — just the aggregation endpoint)
        refreshStats();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'employees' }, (payload) => {
        const updated = mapBffRow(payload.new);
        setEmployees(prev => prev.map(e => e.id === updated.id ? updated : e));
        // If status changed, refresh stats
        if (payload.old?.status !== payload.new?.status) {
          refreshStats();
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'employees' }, (payload) => {
        const deletedId = payload.old?.id;
        if (deletedId) {
          setEmployees(prev => prev.filter(e => e.id !== deletedId));
        }
        refreshStats();
      })
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [letterFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Refresh helpers ───────────────────────────────────────────────────────
  const refreshStats = useCallback(() => {
    // Re-fetch just the stats portion
    const params = new URLSearchParams({ letter: letterFilter });
    if (branchId) params.set('branchId', branchId);

    getAuthHeaders().then(headers => {
      fetch(`/api/bff/hr-employees?${params.toString()}`, { headers })
        .then(res => res.json())
        .then(data => {
          if (data.stats) setStats(data.stats);
        })
        .catch(() => {});
    });
  }, [letterFilter, branchId, getAuthHeaders]);

  const refreshEmployees = useCallback(() => {
    fetchData(letterFilter);
  }, [letterFilter, fetchData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      searchAbortRef.current?.abort();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  return {
    employees,
    stats,
    isLoading,
    letterFilter,
    setLetterFilter,
    searchResults,
    search,
    advancedSearch,
    clearAdvancedSearch,
    refreshStats,
    refreshEmployees,
  };
}
