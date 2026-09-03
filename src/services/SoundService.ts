'use client';

import { Howl } from 'howler';
import { playFallbackSound } from './DefaultSoundService';

// Define the possible sound events
export type SoundEvent =
  | 'welcome'
  | 'click'
  | 'success'
  | 'add'
  | 'delete'
  | 'error'
  | 'download'
  | 'notification'
  | 'create'
  | 'edit'
  | 'approve'
  | 'reject';

// Sound configuration
interface SoundConfig {
  src: string[];
  volume: number;
  preload: boolean;
}

// Singleton class to manage sounds across the application
class SoundBusService {
  private sounds: Record<string, Howl> = {};
  private enabled: boolean = true;
  private volume: number = 0.4;
  private baseVolumes: Record<string, number> = {};
  private soundsLoaded: Record<string, boolean> = {};

  constructor() {
    this.loadSettings();
    this.initializeSounds();
  }

  private loadSettings(): void {
    if (typeof window === 'undefined') {
      this.enabled = true;
      this.volume = 0.4;
      return;
    }

    try {
      const storedSettings = localStorage.getItem('soundSettings');
      if (storedSettings) {
        const { enabled, volume } = JSON.parse(storedSettings);
        this.enabled = enabled !== undefined ? enabled : true;
        this.volume = volume !== undefined ? volume : 0.4;
      }
    } catch {
      this.enabled = true;
      this.volume = 0.4;
    }
  }

  private saveSettings(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('soundSettings', JSON.stringify({
        enabled: this.enabled,
        volume: this.volume
      }));
    } catch { /* noop */ }
  }

  private initializeSounds(): void {
    // Sound configurations — only mp3 (ogg files don't exist; mp3 is universally supported)
    const soundConfigs: Record<SoundEvent, SoundConfig> = {
      welcome: { src: ['/sfx/welcome_chime.mp3'], volume: 0.5, preload: true },
      click: { src: ['/sfx/ui_click.mp3'], volume: 0.4, preload: true },
      success: { src: ['/sfx/positive_tick.mp3'], volume: 0.5, preload: true },
      add: { src: ['/sfx/positive_tick.mp3'], volume: 0.5, preload: true },
      create: { src: ['/sfx/create.mp3'], volume: 0.5, preload: true },
      edit: { src: ['/sfx/edit.mp3'], volume: 0.4, preload: true },
      approve: { src: ['/sfx/approve.mp3'], volume: 0.5, preload: true },
      reject: { src: ['/sfx/reject.mp3'], volume: 0.45, preload: true },
      delete: { src: ['/sfx/trash_swipe.mp3'], volume: 0.4, preload: true },
      error: { src: ['/sfx/error_buzz.mp3'], volume: 0.4, preload: true },
      download: { src: ['/sfx/download_done.mp3'], volume: 0.5, preload: false },
      notification: { src: ['/sfx/notification.mp3'], volume: 0.5, preload: false }
    };

    Object.entries(soundConfigs).forEach(([event, config]) => {
      const adjustedVolume = config.volume * this.volume;
      this.baseVolumes[event] = config.volume;
      this.soundsLoaded[event] = false;

      this.sounds[event] = new Howl({
        src: config.src,
        volume: adjustedVolume,
        preload: config.preload,
        html5: false, // Use Web Audio for lower latency
        onload: () => { this.soundsLoaded[event] = true; },
        onloaderror: () => { this.soundsLoaded[event] = false; }
      });
    });
  }

  // Public methods

  play(event: SoundEvent): void {
    if (!this.enabled) return;

    const sound = this.sounds[event];
    if (sound && this.soundsLoaded[event]) {
      sound.volume(this.baseVolumes[event] * this.volume);
      sound.play();
    } else {
      // Fallback to synthesized tone
      playFallbackSound(event as any);
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.saveSettings();
    if (enabled) this.play('click');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    Object.entries(this.sounds).forEach(([event, sound]) => {
      sound.volume(this.baseVolumes[event] * this.volume);
    });
    this.saveSettings();
    if (this.enabled && this.volume > 0) this.play('click');
  }

  getVolume(): number {
    return this.volume;
  }
}

// Lazy singleton — only create when accessed in the browser
let soundBusInstance: SoundBusService | null = null;

export const getSoundBus = (): SoundBusService | null => {
  if (typeof window === 'undefined') return null;
  if (!soundBusInstance) {
    soundBusInstance = new SoundBusService();
  }
  return soundBusInstance;
};

// Backward-compatible proxy: always delegates to the lazy singleton so it works
// even when the module is first imported during SSR.
export const SoundBus: SoundBusService = new Proxy({} as SoundBusService, {
  get(_target, prop) {
    const instance = getSoundBus();
    if (!instance) {
      // Return no-ops for SSR to prevent crashes
      if (prop === 'play' || prop === 'setEnabled' || prop === 'setVolume') return () => {};
      if (prop === 'isEnabled') return () => true;
      if (prop === 'getVolume') return () => 0.4;
      return undefined;
    }
    const val = (instance as any)[prop];
    return typeof val === 'function' ? val.bind(instance) : val;
  }
});
