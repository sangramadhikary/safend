'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface LoadingContextType {
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  hasShownLoader: boolean;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasShownLoader, setHasShownLoader] = useState(false);

  const handleSetIsLoading = (loading: boolean) => {
    setIsLoading(loading);
    if (!loading) {
      setHasShownLoader(true);
    }
  };

  return (
    <LoadingContext.Provider value={{ 
      isLoading, 
      setIsLoading: handleSetIsLoading, 
      hasShownLoader 
    }}>
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
}
