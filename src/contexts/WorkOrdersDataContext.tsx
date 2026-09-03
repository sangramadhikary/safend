'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { subscribeToWorkOrders, getWorkOrders, WorkOrder as ServiceWorkOrder } from '@/services/supabase/WorkOrderFirebaseService';
import { onDataRefresh } from '@/utils/dataRefresh';

// Use the service's WorkOrder type but ensure id is present for UI
interface WorkOrder extends Omit<ServiceWorkOrder, 'id'> {
  id: string;
  [key: string]: any;
}

interface WorkOrdersDataContextType {
  workOrders: WorkOrder[];
  isLoading: boolean;
  error: Error | null;
  refreshWorkOrders: () => Promise<void>;
}

const WorkOrdersDataContext = createContext<WorkOrdersDataContextType | undefined>(undefined);

export function WorkOrdersDataProvider({ children }: { children: ReactNode }) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refreshWorkOrders = useCallback(async () => {
    try {
      const result = await getWorkOrders();
      if (result.success) {
        // Filter out any work orders without id
        const validWorkOrders = result.data.filter((wo): wo is ServiceWorkOrder & { id: string } => !!wo.id);
        setWorkOrders(validWorkOrders);
      }
    } catch (err) {
      console.error('[WorkOrdersDataContext] Refresh error:', err);
      setError(err as Error);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    
    const unsubscribe = subscribeToWorkOrders((firebaseWorkOrders) => {
      try {
        // Filter out any work orders without id and format dates
        const formattedWorkOrders = firebaseWorkOrders
          .filter((wo): wo is ServiceWorkOrder & { id: string } => !!wo.id)
          .map((wo) => ({
            ...wo,
            createdAt: wo.createdAt instanceof Date ? wo.createdAt : new Date(wo.createdAt || Date.now())
          }));
        setWorkOrders(formattedWorkOrders);
        setIsLoading(false);
      } catch (err) {
        setError(err as Error);
        setIsLoading(false);
      }
    });

    // Listen for manual refresh events
    const unsubscribeRefresh = onDataRefresh('workorders', () => {
      refreshWorkOrders();
    });

    return () => {
      unsubscribe();
      unsubscribeRefresh();
    };
  }, [refreshWorkOrders]);

  return (
    <WorkOrdersDataContext.Provider value={{ workOrders, isLoading, error, refreshWorkOrders }}>
      {children}
    </WorkOrdersDataContext.Provider>
  );
}

export function useWorkOrdersData() {
  const context = useContext(WorkOrdersDataContext);
  if (context === undefined) {
    throw new Error('useWorkOrdersData must be used within a WorkOrdersDataProvider');
  }
  return context;
}
