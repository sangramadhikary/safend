'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { subscribeToAgreements, getAgreements } from '@/services/supabase/AgreementFirebaseService';
import { onDataRefresh } from '@/utils/dataRefresh';

interface Agreement {
  id: string;
  clientName: string;
  contactPerson: string;
  clientEmail: string;
  clientPhone: string;
  serviceDetails: string;
  value: string;
  status: string;
  createdAt: Date;
  [key: string]: any;
}

interface AgreementsDataContextType {
  agreements: Agreement[];
  isLoading: boolean;
  error: Error | null;
  refreshAgreements: () => Promise<void>;
}

const AgreementsDataContext = createContext<AgreementsDataContextType | undefined>(undefined);

export function AgreementsDataProvider({ children }: { children: ReactNode }) {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refreshAgreements = useCallback(async () => {
    try {
      const result = await getAgreements();
      if (result.success) {
        const formattedAgreements = result.data.map((agreement: any) => ({
          ...agreement,
          createdAt: agreement.createdAt instanceof Date ? agreement.createdAt : new Date(agreement.createdAt || Date.now())
        }));
        setAgreements(formattedAgreements);
      }
    } catch (err) {
      console.error('[AgreementsDataContext] Refresh error:', err);
      setError(err as Error);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    
    const unsubscribe = subscribeToAgreements((firebaseAgreements) => {
      try {
        const formattedAgreements = firebaseAgreements.map((agreement: any) => ({
          ...agreement,
          createdAt: agreement.createdAt?.toDate ? agreement.createdAt.toDate() : new Date()
        }));
        setAgreements(formattedAgreements);
        setIsLoading(false);
      } catch (err) {
        setError(err as Error);
        setIsLoading(false);
      }
    });

    // Listen for manual refresh events
    const unsubscribeRefresh = onDataRefresh('agreements', () => {
      refreshAgreements();
    });

    return () => {
      unsubscribe();
      unsubscribeRefresh();
    };
  }, [refreshAgreements]);

  return (
    <AgreementsDataContext.Provider value={{ agreements, isLoading, error, refreshAgreements }}>
      {children}
    </AgreementsDataContext.Provider>
  );
}

export function useAgreementsData() {
  const context = useContext(AgreementsDataContext);
  if (context === undefined) {
    throw new Error('useAgreementsData must be used within a AgreementsDataProvider');
  }
  return context;
}
