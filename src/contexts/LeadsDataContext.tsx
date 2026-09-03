'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { subscribeToLeads, getAllLeads } from '@/services/supabase/LeadFirebaseService';
import { onDataRefresh } from '@/utils/dataRefresh';

interface Lead {
  id: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  source: string;
  status: string;
  assignedTo: string;
  budget: string;
  priority?: string;
  urgency?: string;
  createdAt: Date;
}

interface LeadsDataContextType {
  leads: Lead[];
  isLoading: boolean;
  error: Error | null;
  refreshLeads: () => Promise<void>;
}

const LeadsDataContext = createContext<LeadsDataContextType | undefined>(undefined);

export function LeadsDataProvider({ children }: { children: ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const formatLeads = useCallback((firebaseLeads: any[]) => {
    return firebaseLeads.map((lead: any) => ({
      ...lead,
      createdAt: lead.createdAt?.toDate ? lead.createdAt.toDate() : new Date(lead.createdAt || Date.now())
    }));
  }, []);

  const refreshLeads = useCallback(async () => {
    console.log('[LeadsDataContext] Manual refresh triggered');
    try {
      const freshLeads = await getAllLeads();
      setLeads(formatLeads(freshLeads));
      console.log('[LeadsDataContext] Refreshed leads:', freshLeads.length);
    } catch (err) {
      console.error('[LeadsDataContext] Refresh error:', err);
      setError(err as Error);
    }
  }, [formatLeads]);

  useEffect(() => {
    console.log('[LeadsDataContext] Subscribing to leads (single subscription)');
    setIsLoading(true);
    
    const unsubscribe = subscribeToLeads((firebaseLeads) => {
      try {
        const formattedLeads = formatLeads(firebaseLeads);
        setLeads(formattedLeads);
        setIsLoading(false);
        console.log('[LeadsDataContext] Loaded leads:', formattedLeads.length);
      } catch (err) {
        setError(err as Error);
        setIsLoading(false);
      }
    });

    // Listen for manual refresh events from centralized utility
    const unsubscribeRefresh = onDataRefresh('leads', () => {
      console.log('[LeadsDataContext] Refresh event received');
      refreshLeads();
    });

    return () => {
      console.log('[LeadsDataContext] Unsubscribing from leads');
      unsubscribe();
      unsubscribeRefresh();
    };
  }, [formatLeads, refreshLeads]);

  return (
    <LeadsDataContext.Provider value={{ leads, isLoading, error, refreshLeads }}>
      {children}
    </LeadsDataContext.Provider>
  );
}

export function useLeadsData() {
  const context = useContext(LeadsDataContext);
  if (context === undefined) {
    throw new Error('useLeadsData must be used within a LeadsDataProvider');
  }
  return context;
}
