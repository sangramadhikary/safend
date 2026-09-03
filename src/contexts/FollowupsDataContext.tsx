'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { subscribeToFollowups, getFollowups, Followup as ServiceFollowup } from '@/services/supabase/FollowupFirebaseService';
import { onDataRefresh } from '@/utils/dataRefresh';

// Use the service's Followup type but ensure id is present for UI
interface Followup extends Omit<ServiceFollowup, 'id'> {
  id: string;
  [key: string]: any;
}

interface FollowupsDataContextType {
  followups: Followup[];
  isLoading: boolean;
  error: Error | null;
  refreshFollowups: () => Promise<void>;
}

const FollowupsDataContext = createContext<FollowupsDataContextType | undefined>(undefined);

export function FollowupsDataProvider({ children }: { children: ReactNode }) {
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refreshFollowups = useCallback(async () => {
    try {
      const result = await getFollowups();
      if (result.success) {
        // Filter out any followups without id and cast to our Followup type
        const validFollowups = result.data.filter((f): f is ServiceFollowup & { id: string } => !!f.id);
        setFollowups(validFollowups);
      }
    } catch (err) {
      console.error('[FollowupsDataContext] Refresh error:', err);
      setError(err as Error);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    
    const unsubscribe = subscribeToFollowups((firebaseFollowups) => {
      try {
        // Filter out any followups without id and format dates
        const formattedFollowups = firebaseFollowups
          .filter((f): f is ServiceFollowup & { id: string } => !!f.id)
          .map((f) => ({
            ...f,
            createdAt: f.createdAt instanceof Date ? f.createdAt : new Date(f.createdAt || Date.now())
          }));
        setFollowups(formattedFollowups);
        setIsLoading(false);
      } catch (err) {
        setError(err as Error);
        setIsLoading(false);
      }
    });

    // Listen for manual refresh events
    const unsubscribeRefresh = onDataRefresh('followups', () => {
      refreshFollowups();
    });

    return () => {
      unsubscribe();
      unsubscribeRefresh();
    };
  }, [refreshFollowups]);

  return (
    <FollowupsDataContext.Provider value={{ followups, isLoading, error, refreshFollowups }}>
      {children}
    </FollowupsDataContext.Provider>
  );
}

export function useFollowupsData() {
  const context = useContext(FollowupsDataContext);
  if (context === undefined) {
    throw new Error('useFollowupsData must be used within a FollowupsDataProvider');
  }
  return context;
}
