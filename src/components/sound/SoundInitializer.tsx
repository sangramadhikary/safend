'use client';

import { useEffect, useState } from "react";
import { getSoundBus } from "@/services/SoundService";

export function SoundInitializer() {
  const [soundsReady, setSoundsReady] = useState(false);
  
  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return;
    
    // Create dummy audio elements to check if sound files exist
    const soundFiles = [
      '/sfx/ui_click.mp3',
      '/sfx/success.mp3',
      '/sfx/error_buzz.mp3',
      '/sfx/notification.mp3'
    ];
    
    // Create temp audio elements to check if sound files exist
    Promise.all(
      soundFiles.map(file => {
        return new Promise((resolve) => {
          const audio = new Audio(file);
          audio.addEventListener('canplaythrough', () => {
            resolve(true);
          });
          audio.addEventListener('error', () => {
            resolve(false);
          });
          // Just load metadata, don't play
          audio.load();
          // Set a timeout in case the file doesn't exist
          setTimeout(() => resolve(false), 2000);
        });
      })
    ).then((results) => {
      const allFilesExist = results.every(result => result === true);
      setSoundsReady(allFilesExist);
      
      if (allFilesExist) {
        // Initialize with a welcome sound (but delayed so it doesn't play immediately on page load)
        setTimeout(() => {
          const bus = getSoundBus();
          if (bus) bus.play('welcome');
        }, 1000);
      }
      // If files don't exist, fallback tones are used automatically — no warning needed
    });
  }, []);
  
  // This component doesn't render anything
  return null;
}
