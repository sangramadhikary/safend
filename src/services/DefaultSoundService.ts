'use client';

// Fallback sound service that generates tones using Web Audio API
// This will be used when actual sound files aren't available

type FallbackSoundType = 'welcome' | 'click' | 'success' | 'add' | 'delete' | 'error' | 'download' | 'notification' | 'create' | 'edit' | 'approve' | 'reject' | 'default';

// Sound configuration for fallback tones
interface ToneConfig {
  frequency: number;
  duration: number;
  volume: number;
  type: OscillatorType;
}

const soundConfigs: Record<FallbackSoundType, ToneConfig> = {
  welcome: { frequency: 440, duration: 700, volume: 0.2, type: 'sine' },
  click: { frequency: 800, duration: 120, volume: 0.1, type: 'sine' },
  success: { frequency: 600, duration: 250, volume: 0.2, type: 'sine' },
  add: { frequency: 500, duration: 200, volume: 0.2, type: 'sine' },
  create: { frequency: 520, duration: 300, volume: 0.2, type: 'sine' },
  edit: { frequency: 480, duration: 200, volume: 0.15, type: 'sine' },
  approve: { frequency: 700, duration: 350, volume: 0.2, type: 'sine' },
  reject: { frequency: 250, duration: 400, volume: 0.2, type: 'square' },
  delete: { frequency: 300, duration: 300, volume: 0.2, type: 'sine' },
  error: { frequency: 200, duration: 350, volume: 0.2, type: 'square' },
  download: { frequency: 440, duration: 500, volume: 0.2, type: 'sine' },
  notification: { frequency: 660, duration: 600, volume: 0.2, type: 'sine' },
  default: { frequency: 440, duration: 200, volume: 0.2, type: 'sine' }
};

let audioContext: AudioContext | null = null;

// Initialize audio context on first use (to comply with browser autoplay policies)
const initAudioContext = (): AudioContext => {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (error) {
      console.error("Web Audio API not supported:", error);
    }
  }
  return audioContext as AudioContext;
};

export const playFallbackSound = (type: FallbackSoundType = 'default') => {
  try {
    const ctx = initAudioContext();
    if (!ctx) return;

    // Get config for this sound type
    const config = soundConfigs[type] || soundConfigs.default;

    // Create oscillator and gain node
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    // Configure sound
    oscillator.type = config.type;
    oscillator.frequency.value = config.frequency;
    gainNode.gain.value = config.volume;

    // Connect nodes
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Add fade out
    gainNode.gain.exponentialRampToValueAtTime(
      0.001, ctx.currentTime + config.duration / 1000
    );

    // Play sound
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + config.duration / 1000);
  } catch (error) {
    console.warn("Error playing fallback sound:", error);
  }
};
