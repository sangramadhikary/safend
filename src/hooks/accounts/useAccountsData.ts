'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAccountsContext } from '@/contexts/AccountsContext';
import { handleApiError } from '@/utils/errorHandler';

type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * Custom hook for fetching accounts data with error handling and loading states
 */
export function useAccountsData<T>(
  fetchFn: () => Promise<T>,
  dependencies: any[] = [],
  initialData: T | null = null,
  errorMessage = "Failed to fetch data"
) {
  const [data, setData] = useState<T | null>(initialData);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();
  const { setIsDataLoading, refreshTrigger, setError: setContextError } = useAccountsContext();

  const fetchData = useCallback(async () => {
    setStatus('loading');
    setIsDataLoading(true);
    setError(null);
    setContextError(null);
    
    try {
      const result = await fetchFn();
      setData(result);
      setStatus('success');
    } catch (err) {
      console.error('Error fetching data:', err);
      setStatus('error');
      const error = err as Error;
      setError(error);
      setContextError(error);
      handleApiError(error, errorMessage);
    } finally {
      setIsDataLoading(false);
    }
  }, [fetchFn, setIsDataLoading, setContextError, errorMessage]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, refreshTrigger]);

  return { 
    data, 
    status, 
    error, 
    isLoading: status === 'loading', 
    isError: status === 'error',
    refetch: fetchData 
  };
}

/**
 * Custom hook for account mutations with error handling and loading states
 */
export function useAccountsMutation<T, D>(
  mutationFn: (data: D) => Promise<T>,
  onSuccessMessage = "Operation completed successfully",
  onErrorMessage = "Operation failed"
) {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();
  const { setIsDataLoading, triggerRefresh, setError: setContextError } = useAccountsContext();

  const mutate = async (inputData: D) => {
    setStatus('loading');
    setIsDataLoading(true);
    setError(null);
    setContextError(null);
    
    try {
      const result = await mutationFn(inputData);
      setData(result);
      setStatus('success');
      
      toast({
        title: "Success",
        description: onSuccessMessage,
      });
      
      // Automatically trigger a refresh after successful mutation
      triggerRefresh();
      return result;
    } catch (err) {
      console.error('Operation error:', err);
      setStatus('error');
      const error = err as Error;
      setError(error);
      setContextError(error);
      handleApiError(error, onErrorMessage);
      throw err;
    } finally {
      setIsDataLoading(false);
    }
  };

  return {
    mutate,
    data,
    status,
    error,
    isLoading: status === 'loading',
    isError: status === 'error',
    isSuccess: status === 'success',
    reset: () => {
      setData(null);
      setStatus('idle');
      setError(null);
    }
  };
}

/**
 * Hook for batch mutations with a single status indicator
 */
export function useAccountsBatchMutation<T, D>(
  mutationFn: (data: D[]) => Promise<T>,
  onSuccessMessage = "Batch operation completed successfully",
  onErrorMessage = "Batch operation failed"
) {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();
  const { setIsDataLoading, triggerRefresh, setError: setContextError } = useAccountsContext();

  const mutateBatch = async (inputData: D[]) => {
    if (!inputData.length) return null;
    
    setStatus('loading');
    setIsDataLoading(true);
    setError(null);
    setContextError(null);
    
    try {
      const result = await mutationFn(inputData);
      setData(result);
      setStatus('success');
      
      toast({
        title: "Success",
        description: onSuccessMessage,
      });
      
      // Automatically trigger a refresh after successful mutation
      triggerRefresh();
      return result;
    } catch (err) {
      console.error('Batch operation error:', err);
      setStatus('error');
      const error = err as Error;
      setError(error);
      setContextError(error);
      handleApiError(error, onErrorMessage);
      throw err;
    } finally {
      setIsDataLoading(false);
    }
  };

  return {
    mutateBatch,
    data,
    status,
    error,
    isLoading: status === 'loading',
    isError: status === 'error',
    isSuccess: status === 'success',
    reset: () => {
      setData(null);
      setStatus('idle');
      setError(null);
    }
  };
}
