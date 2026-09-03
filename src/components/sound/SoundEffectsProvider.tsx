'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSoundBus, SoundEvent } from '@/services/SoundService';
import { useSoundEffect } from '@/hooks/useSoundEffect';

interface SoundContextType {
  soundEffects: ReturnType<typeof useSoundEffect>;
  isSoundEnabled: boolean;
  toggleSound: () => void;
  setVolume: (volume: number) => void;
  getVolume: () => number;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

export function SoundEffectsProvider({ children }: { children: React.ReactNode }) {
  const [isSoundEnabled, setIsSoundEnabled] = useState(false);
  const soundEffects = useSoundEffect();
  
  // Initialize sound settings from SoundBus
  useEffect(() => {
    const soundBus = getSoundBus();
    if (soundBus) {
      setIsSoundEnabled(soundBus.isEnabled());
    }
  }, []);

  const toggleSound = () => {
    const soundBus = getSoundBus();
    if (!soundBus) return;
    
    const newState = !isSoundEnabled;
    soundBus.setEnabled(newState);
    setIsSoundEnabled(newState);
    
    // Play a sound when enabling sounds
    if (newState) {
      soundEffects.playClick();
    }
  };

  const setVolume = (volume: number) => {
    const soundBus = getSoundBus();
    if (soundBus) {
      soundBus.setVolume(volume);
    }
  };

  const getVolume = () => {
    const soundBus = getSoundBus();
    return soundBus ? soundBus.getVolume() : 0.4;
  };

  return (
    <SoundContext.Provider value={{ 
      soundEffects, 
      isSoundEnabled, 
      toggleSound, 
      setVolume, 
      getVolume 
    }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSoundContext() {
  const context = useContext(SoundContext);
  if (context === undefined) {
    throw new Error('useSoundContext must be used within a SoundEffectsProvider');
  }
  return context;
}
