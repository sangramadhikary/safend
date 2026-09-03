'use client';

/**
 * Centralized data refresh utility
 * Allows services to trigger UI refreshes after CRUD operations
 */

type RefreshCallback = () => void;

interface RefreshStore {
  [key: string]: RefreshCallback[];
}

const refreshStore: RefreshStore = {};

/**
 * Register a callback to be called when data of a specific type is refreshed
 */
export const onDataRefresh = (dataType: string, callback: RefreshCallback): (() => void) => {
  if (!refreshStore[dataType]) {
    refreshStore[dataType] = [];
  }
  refreshStore[dataType].push(callback);
  
  // Return unsubscribe function
  return () => {
    const index = refreshStore[dataType].indexOf(callback);
    if (index > -1) {
      refreshStore[dataType].splice(index, 1);
    }
  };
};

/**
 * Trigger refresh for a specific data type
 */
export const triggerDataRefresh = (dataType: string): void => {
  const callbacks = refreshStore[dataType] || [];
  callbacks.forEach(cb => {
    try {
      cb();
    } catch (error) {
      console.error(`[DataRefresh] Error in callback for ${dataType}:`, error);
    }
  });
};

// Convenience functions for common data types
export const triggerLeadsRefresh = () => triggerDataRefresh('leads');
export const triggerQuotationsRefresh = () => triggerDataRefresh('quotations');
export const triggerAgreementsRefresh = () => triggerDataRefresh('agreements');
export const triggerWorkOrdersRefresh = () => triggerDataRefresh('workorders');
export const triggerFollowupsRefresh = () => triggerDataRefresh('followups');
export const triggerEmployeesRefresh = () => triggerDataRefresh('employees');
export const triggerPostsRefresh = () => triggerDataRefresh('posts');
