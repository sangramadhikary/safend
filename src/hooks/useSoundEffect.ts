'use client';

import { getSoundBus, SoundEvent } from "@/services/SoundService";
import { useEffect, useCallback, useState } from "react";

/**
 * Hook for easily using sound effects across the application
 * Provides convenient methods for playing different sound types with enhanced functionality
 */
export function useSoundEffect() {
  const [soundsReady, setSoundsReady] = useState(false);
  
  // Initialize sounds on first use
  useEffect(() => {
    // Check if we're in browser
    if (typeof window === 'undefined') return;
    
    // Check if sound files are properly loaded
    const checkSounds = async () => {
      try {
        // Try loading a test sound to verify system works
        const audio = new Audio('/sfx/ui_click.mp3');
        audio.volume = 0.01; // Very low volume for the test
        
        // Promise to check if sound can be played
        const canPlay = await new Promise((resolve) => {
          audio.oncanplaythrough = () => resolve(true);
          audio.onerror = () => resolve(false);
          audio.load();
          
          // Set a timeout in case loading hangs
          setTimeout(() => resolve(false), 2000);
        });
        
        setSoundsReady(Boolean(canPlay));
        // Fallback tones will be used automatically if files aren't available
      } catch {
        setSoundsReady(false);
      }
    };
    
    checkSounds();
  }, []);
  
  // Method to play welcome sound
  const playWelcome = useCallback(() => {
    const soundBus = getSoundBus();
    if (soundBus) soundBus.play('welcome');
  }, []);

  // Method to play UI click sound
  const playClick = useCallback(() => {
    const soundBus = getSoundBus();
    if (soundBus) soundBus.play('click');
  }, []);

  // Method to play success sound
  const playSuccess = useCallback(() => {
    const soundBus = getSoundBus();
    if (soundBus) soundBus.play('success');
  }, []);

  // Method to play "add" sound
  const playAdd = useCallback(() => {
    const soundBus = getSoundBus();
    if (soundBus) soundBus.play('add');
  }, []);

  // Method to play delete sound
  const playDelete = useCallback(() => {
    const soundBus = getSoundBus();
    if (soundBus) soundBus.play('delete');
  }, []);

  // Method to play error sound
  const playError = useCallback(() => {
    const soundBus = getSoundBus();
    if (soundBus) soundBus.play('error');
  }, []);

  // Method to play download complete sound
  const playDownload = useCallback(() => {
    const soundBus = getSoundBus();
    if (soundBus) soundBus.play('download');
  }, []);

  // Method to play notification sound
  const playNotification = useCallback(() => {
    const soundBus = getSoundBus();
    if (soundBus) soundBus.play('notification');
  }, []);

  // Method to play create sound (when something is created)
  const playCreate = useCallback(() => {
    const soundBus = getSoundBus();
    if (soundBus) soundBus.play('create');
  }, []);

  // Method to play edit sound (when something is edited/updated)
  const playEdit = useCallback(() => {
    const soundBus = getSoundBus();
    if (soundBus) soundBus.play('edit');
  }, []);

  // Method to play approve sound (when something is approved)
  const playApprove = useCallback(() => {
    const soundBus = getSoundBus();
    if (soundBus) soundBus.play('approve');
  }, []);

  // Method to play reject sound (when something is rejected)
  const playReject = useCallback(() => {
    const soundBus = getSoundBus();
    if (soundBus) soundBus.play('reject');
  }, []);

  // Generic method to play any sound with volume control
  const playSound = useCallback((sound: SoundEvent, volume?: number) => {
    const soundBus = getSoundBus();
    if (!soundBus) return;
    
    if (volume !== undefined) {
      // Temporarily adjust volume for this sound
      const currentVolume = soundBus.getVolume();
      soundBus.setVolume(volume);
      soundBus.play(sound);
      // Reset to previous volume
      setTimeout(() => soundBus.setVolume(currentVolume), 100);
    } else {
      soundBus.play(sound);
    }
  }, []);

  return {
    playWelcome,
    playClick,
    playSuccess,
    playAdd,
    playCreate,
    playEdit,
    playApprove,
    playReject,
    playDelete,
    playError,
    playDownload,
    playNotification,
    playSound,
    soundsReady
  };
}
