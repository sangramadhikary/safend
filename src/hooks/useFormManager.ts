'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { emitEvent } from '@/hooks/useEvent';
import { SoundBus } from '@/services/SoundService';

export interface FormManagerOptions {
  successMessage?: string;
  errorMessage?: string;
  successEventType?: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  resetAfterSubmit?: boolean;
  playSounds?: boolean;
}

export function useFormManager<T = any>(options: FormManagerOptions = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentData, setCurrentData] = useState<T | null>(null);
  const { toast } = useToast();
  
  // Default options
  const defaultOptions: FormManagerOptions = {
    successMessage: "Operation completed successfully",
    errorMessage: "An error occurred while processing your request",
    resetAfterSubmit: true,
    playSounds: true,
    ...options
  };

  const open = useCallback((data: T | null = null) => {
    setCurrentData(data);
    setIsOpen(true);
    if (defaultOptions.playSounds) {
      SoundBus.play('notification');
    }
  }, [defaultOptions.playSounds]);

  const close = useCallback(() => {
    setIsOpen(false);
    if (defaultOptions.playSounds) {
      SoundBus.play('click');
    }
    if (defaultOptions.resetAfterSubmit) {
      setCurrentData(null);
    }
  }, [defaultOptions.playSounds, defaultOptions.resetAfterSubmit]);

  const handleSubmit = useCallback(async (
    submitFn: (data: any) => Promise<any>,
    data: any
  ) => {
    setIsSubmitting(true);
    try {
      const result = await submitFn(data);
      
      if (defaultOptions.successMessage) {
        toast({
          title: "Success",
          description: defaultOptions.successMessage,
        });
      }
      
      if (defaultOptions.playSounds) {
        SoundBus.play('success');
      }
      
      if (defaultOptions.successEventType) {
        emitEvent(defaultOptions.successEventType, { data: result });
      }
      
      if (defaultOptions.onSuccess) {
        defaultOptions.onSuccess();
      }
      
      if (defaultOptions.resetAfterSubmit) {
        close();
      }
      
      return result;
    } catch (error) {
      console.error("Form submission error:", error);
      
      toast({
        title: "Error",
        description: defaultOptions.errorMessage || "An error occurred while submitting the form",
        variant: "destructive",
      });
      
      if (defaultOptions.playSounds) {
        SoundBus.play('error');
      }
      
      if (defaultOptions.onError && error instanceof Error) {
        defaultOptions.onError(error);
      }
      
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [close, defaultOptions, toast]);

  return {
    isOpen,
    isSubmitting,
    currentData,
    open,
    close,
    handleSubmit
  };
}
