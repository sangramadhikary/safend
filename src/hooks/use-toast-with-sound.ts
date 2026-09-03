'use client';

import { toast } from "@/hooks/use-toast";
import { getSoundBus, SoundEvent } from "@/services/SoundService";
import type { ToastActionElement } from "@/hooks/use-toast";
import { useCallback } from "react";
import { isModalOpen, sendSystemNotification, hasNotificationPermission, requestNotificationPermission } from "@/utils/systemNotification";

// Define our own ToastProps based on what's used
type ToastProps = {
  title?: string;
  description?: string;
  action?: ToastActionElement;
  variant?: "default" | "destructive";
  duration?: number;
};

type SoundToastOptions = ToastProps & {
  sound?: SoundEvent;
};

// Define the return type for the toast function with its methods
interface SoundToast {
  (options: SoundToastOptions): { id: string; dismiss: () => void; update: (props: any) => void };
  success: (options: Omit<SoundToastOptions, 'sound' | 'variant'>) => { id: string; dismiss: () => void; update: (props: any) => void };
  error: (options: Omit<SoundToastOptions, 'sound' | 'variant'>) => { id: string; dismiss: () => void; update: (props: any) => void };
  warning: (options: Omit<SoundToastOptions, 'sound' | 'variant'>) => { id: string; dismiss: () => void; update: (props: any) => void };
  info: (options: Omit<SoundToastOptions, 'sound'>) => { id: string; dismiss: () => void; update: (props: any) => void };
  create: (options: Omit<SoundToastOptions, 'sound' | 'variant'>) => { id: string; dismiss: () => void; update: (props: any) => void };
  edit: (options: Omit<SoundToastOptions, 'sound' | 'variant'>) => { id: string; dismiss: () => void; update: (props: any) => void };
  approve: (options: Omit<SoundToastOptions, 'sound' | 'variant'>) => { id: string; dismiss: () => void; update: (props: any) => void };
  reject: (options: Omit<SoundToastOptions, 'sound' | 'variant'>) => { id: string; dismiss: () => void; update: (props: any) => void };
}

/**
 * Maps our toast variant to a system notification variant.
 */
function toNotificationVariant(variant?: 'default' | 'destructive'): 'default' | 'destructive' | 'success' | 'warning' {
  if (variant === 'destructive') return 'destructive';
  return 'default';
}

export function useToastWithSound() {
  const soundToast = useCallback((options: SoundToastOptions) => {
    // Play sound if specified (default to 'notification')
    const sound = options.sound || 'notification';
    const bus = getSoundBus();
    if (bus) bus.play(sound);

    // If a modal is open, route to system notification
    const modalVisible = isModalOpen();
    if (modalVisible) {
      if (hasNotificationPermission()) {
        const title = typeof options.title === 'string' ? options.title : 'Safend';
        const body = typeof options.description === 'string' ? options.description : undefined;
        sendSystemNotification({
          title,
          body,
          variant: toNotificationVariant(options.variant),
        });
      } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        // Permission not yet requested — ask now (user is interacting)
        requestNotificationPermission();
      }
    }

    // Always fire the in-app toast too (it'll be visible once modal closes)
    return toast(options);
  }, []);

  // Create a toast object with helper methods
  const soundToastWithHelpers: SoundToast = Object.assign(
    soundToast,
    {
      success: (options: Omit<SoundToastOptions, 'sound' | 'variant'>) => 
        soundToast({ ...options, sound: 'success', variant: 'default' }),
      error: (options: Omit<SoundToastOptions, 'sound' | 'variant'>) => 
        soundToast({ ...options, sound: 'error', variant: 'destructive' }),
      warning: (options: Omit<SoundToastOptions, 'sound' | 'variant'>) => 
        soundToast({ ...options, sound: 'notification', variant: 'default' }),
      info: (options: Omit<SoundToastOptions, 'sound'>) => 
        soundToast({ ...options, sound: 'notification' }),
      create: (options: Omit<SoundToastOptions, 'sound' | 'variant'>) =>
        soundToast({ ...options, sound: 'create', variant: 'default' }),
      edit: (options: Omit<SoundToastOptions, 'sound' | 'variant'>) =>
        soundToast({ ...options, sound: 'edit', variant: 'default' }),
      approve: (options: Omit<SoundToastOptions, 'sound' | 'variant'>) =>
        soundToast({ ...options, sound: 'approve', variant: 'default' }),
      reject: (options: Omit<SoundToastOptions, 'sound' | 'variant'>) =>
        soundToast({ ...options, sound: 'reject', variant: 'destructive' }),
    }
  );

  return {
    toast: soundToastWithHelpers
  };
}
