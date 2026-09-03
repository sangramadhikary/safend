'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { subscribeToQuotations, getQuotations } from '@/services/supabase/QuotationFirebaseService';
import { onDataRefresh } from '@/utils/dataRefresh';

interface Quotation {
  id: string;
  client: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  service: string;
  amount: string;
  status: string;
  validUntil: string;
  createdAt: Date;
  [key: string]: any;
}

interface QuotationsDataContextType {
  quotations: Quotation[];
  isLoading: boolean;
  error: Error | null;
  refreshQuotations: () => Promise<void>;
}

const QuotationsDataContext = createContext<QuotationsDataContextType | undefined>(undefined);

export function QuotationsDataProvider({ children }: { children: ReactNode }) {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refreshQuotations = useCallback(async () => {
    try {
      const result = await getQuotations();
      if (result.success) {
        const formattedQuotations = result.data.map((quotation: any) => ({
          ...quotation,
          createdAt: quotation.createdAt instanceof Date ? quotation.createdAt : new Date(quotation.createdAt || Date.now())
        }));
        setQuotations(formattedQuotations);
      }
    } catch (err) {
      console.error('[QuotationsDataContext] Refresh error:', err);
      setError(err as Error);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    
    const unsubscribe = subscribeToQuotations((firebaseQuotations) => {
      try {
        const formattedQuotations = firebaseQuotations.map((quotation: any) => ({
          ...quotation,
          createdAt: quotation.createdAt instanceof Date 
            ? quotation.createdAt 
            : new Date(quotation.createdAt || Date.now())
        }));
        setQuotations(formattedQuotations);
        setIsLoading(false);
      } catch (err) {
        setError(err as Error);
        setIsLoading(false);
      }
    });

    // Listen for manual refresh events
    const unsubscribeRefresh = onDataRefresh('quotations', () => {
      refreshQuotations();
    });

    return () => {
      unsubscribe();
      unsubscribeRefresh();
    };
  }, [refreshQuotations]);

  return (
    <QuotationsDataContext.Provider value={{ quotations, isLoading, error, refreshQuotations }}>
      {children}
    </QuotationsDataContext.Provider>
  );
}

export function useQuotationsData() {
  const context = useContext(QuotationsDataContext);
  if (context === undefined) {
    throw new Error('useQuotationsData must be used within a QuotationsDataProvider');
  }
  return context;
}
