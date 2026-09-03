'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { useEvent, EVENT_TYPES } from '@/hooks/useEvent';
import { PAYABLE_FILTERS } from '@/modules/accounts/constants/payableCategories';

// Define section types for the Accounts module
export type AccountsSection = 
  | 'dashboard' 
  | 'payables' 
  | 'receivables' 
  | 'compliance' 
  | 'assets-liabilities'
  | 'banking';

// Define filter types for various sections
export type FilterType = {
  [key in AccountsSection]?: string[];
};

// Extended context interface with additional properties
interface AccountsContextProps {
  selectedBranch: string | null;
  setSelectedBranch: (branchId: string | null) => void;
  activeSection: AccountsSection;
  setActiveSection: (section: AccountsSection) => void;
  refreshTrigger: number;
  triggerRefresh: () => void;
  isDataLoading: boolean;
  setIsDataLoading: (loading: boolean) => void;
  currentFilter: string;
  setCurrentFilter: (filter: string) => void;
  dateRange: { startDate: Date; endDate: Date } | null;
  setDateRange: (range: { startDate: Date; endDate: Date } | null) => void;
  error: Error | null;
  setError: (error: Error | null) => void;
  clearError: () => void;
  filters: FilterType;
  branchName: string | null;
  setBranchName: (name: string | null) => void;
}

const AccountsContext = createContext<AccountsContextProps | undefined>(undefined);

interface AccountsProviderProps {
  children: ReactNode;
}

// Default filters for each section
const defaultFilters: FilterType = {
  dashboard: [],
  payables: [...PAYABLE_FILTERS],
  receivables: ['All Receivables', 'Invoices', 'Invoice Adjustments', 'Event Letters', 'Payroll Receivables', 'Taxes (ITC/TDS)', 'Other Income'],
  compliance: ['GST', 'TDS', 'EPF / ESIC / PT', 'Ledger Book'],
  'assets-liabilities': [],
  banking: []
};

// Get the current date and calculate the first day of the month
const getCurrentMonthDateRange = () => {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return { startDate: firstDay, endDate: today };
};

export function AccountsProvider({ children }: AccountsProviderProps) {
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [branchName, setBranchName] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [isDataLoading, setIsDataLoading] = useState<boolean>(false);
  const [currentFilter, setCurrentFilter] = useState<string>("Overview");
  const [dateRange, setDateRange] = useState<{ startDate: Date; endDate: Date } | null>(getCurrentMonthDateRange());
  const [error, setError] = useState<Error | null>(null);
  const [filters] = useState<FilterType>(defaultFilters);

  // Sync activeSection with URL ?tab= param (set by ModuleHeaderBar) or legacy hash
  const getInitialSection = (): AccountsSection => {
    if (typeof window === 'undefined') return 'dashboard';
    // Prefer ?tab= param (set by ModuleHeaderBar)
    const sp = new URLSearchParams(window.location.search);
    const tabParam = sp.get('tab');
    const validSections: AccountsSection[] = ['dashboard', 'payables', 'receivables', 'compliance', 'assets-liabilities', 'banking'];
    if (tabParam && validSections.includes(tabParam as AccountsSection)) return tabParam as AccountsSection;
    // Fall back to legacy hash
    const hash = window.location.hash.replace('#', '');
    const parts = hash.split('/');
    if (validSections.includes(parts[0] as AccountsSection)) return parts[0] as AccountsSection;
    return 'dashboard';
  };

  const getInitialFilter = (): string => {
    if (typeof window === 'undefined') return '';
    const hash = window.location.hash.replace('#', '');
    const parts = hash.split('/');
    return parts[1] ? decodeURIComponent(parts[1]) : '';
  };

  const [activeSection, setActiveSectionState] = useState<AccountsSection>(getInitialSection());

  // Re-sync activeSection whenever the URL ?tab= param changes (e.g. from ModuleHeaderBar)
  useEffect(() => {
    const validSections: AccountsSection[] = ['dashboard', 'payables', 'receivables', 'compliance', 'assets-liabilities', 'banking'];

    const syncFromUrl = () => {
      const sp = new URLSearchParams(window.location.search);
      const tab = sp.get('tab');
      const next: AccountsSection = (tab && validSections.includes(tab as AccountsSection))
        ? (tab as AccountsSection)
        : 'dashboard';
      setActiveSectionState(prev => prev !== next ? next : prev);
    };

    const onModuleTabChanged = (e: Event) => {
      const tab = (e as CustomEvent<{ tab: string }>).detail?.tab;
      if (!tab) return;
      const next: AccountsSection = validSections.includes(tab as AccountsSection)
        ? (tab as AccountsSection)
        : 'dashboard';
      setActiveSectionState(prev => prev !== next ? next : prev);
    };

    // Next.js router.replace triggers popstate on client navigation
    window.addEventListener('popstate', syncFromUrl);
    // Custom event dispatched by ModuleHeaderBar on tab click
    window.addEventListener('moduleTabChanged', onModuleTabChanged);
    // Also sync on initial mount in case URL already has a tab
    syncFromUrl();

    return () => {
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('moduleTabChanged', onModuleTabChanged);
    };
  }, []);

  const setActiveSection = (section: AccountsSection) => {
    setActiveSectionState(section);
    if (typeof window !== 'undefined') {
      // Update ?tab= param (read by ModuleHeaderBar) — keep existing params
      const sp = new URLSearchParams(window.location.search);
      if (section === 'dashboard') {
        sp.delete('tab');
      } else {
        sp.set('tab', section);
      }
      const qs = sp.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
      // Clear legacy hash
      if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  };

  // Set initial filter from URL on mount
  useEffect(() => {
    const urlFilter = getInitialFilter();
    if (urlFilter) setCurrentFilter(urlFilter);
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Subscribe to branch change events
  useEvent(EVENT_TYPES.BRANCH_CHANGED, (payload) => {
    if (payload?.branchId) {
      setSelectedBranch(payload.branchId);
      setBranchName(payload.branchName || null);
      // Trigger data refresh when branch changes
      triggerRefresh();
    }
  }, [triggerRefresh]);

  // Subscribe to relevant accounts module events
  useEvent([
    EVENT_TYPES.ACCOUNTS_TRANSACTION_CREATED,
    EVENT_TYPES.ACCOUNTS_EXPENSE_CREATED,
    EVENT_TYPES.ACCOUNTS_INVOICE_CREATED
  ], () => {
    // When any accounts-related data changes, refresh the data
    triggerRefresh();
  }, [triggerRefresh]);

  return (
    <AccountsContext.Provider
      value={{
        selectedBranch,
        setSelectedBranch,
        activeSection,
        setActiveSection,
        refreshTrigger,
        triggerRefresh,
        isDataLoading,
        setIsDataLoading,
        currentFilter,
        setCurrentFilter,
        dateRange,
        setDateRange,
        error,
        setError,
        clearError,
        filters,
        branchName,
        setBranchName
      }}
    >
      {children}
    </AccountsContext.Provider>
  );
}

export function useAccountsContext() {
  const context = useContext(AccountsContext);
  if (context === undefined) {
    throw new Error('useAccountsContext must be used within an AccountsProvider');
  }
  return context;
}
