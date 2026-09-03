'use client';

import { useState, useEffect, useCallback } from 'react';

export type NetworkQuality = 'online' | 'slow' | 'offline';

export interface NetworkStatus {
  quality: NetworkQuality;
  isOnline: boolean;
  isSlow: boolean;
  effectiveType: string | null; // '4g' | '3g' | '2g' | 'slow-2g'
  downlink: number | null;      // Mbps estimate
  rtt: number | null;           // round-trip time in ms
}

// navigator.connection is not in standard TS types
interface NetworkInformation extends EventTarget {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

function getConnection(): NetworkInformation | null {
  if (typeof navigator === 'undefined') return null;
  return (
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection ||
    null
  );
}

function deriveQuality(online: boolean, conn: NetworkInformation | null): NetworkQuality {
  if (!online) return 'offline';
  if (!conn) return 'online';
  const type = conn.effectiveType;
  const downlink = conn.downlink ?? null;
  const rtt = conn.rtt ?? null;
  // Considered slow if: 2g / slow-2g, or downlink < 0.5 Mbps, or rtt > 700ms
  const slowType = type === 'slow-2g' || type === '2g';
  const slowDownlink = downlink !== null && downlink < 0.5;
  const slowRtt = rtt !== null && rtt > 700;
  if (slowType || slowDownlink || slowRtt) return 'slow';
  return 'online';
}

function buildStatus(): NetworkStatus {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const conn = getConnection();
  return {
    quality: deriveQuality(online, conn),
    isOnline: online,
    isSlow: deriveQuality(online, conn) === 'slow',
    effectiveType: conn?.effectiveType ?? null,
    downlink: conn?.downlink ?? null,
    rtt: conn?.rtt ?? null,
  };
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(() => ({
    quality: 'online',
    isOnline: true,
    isSlow: false,
    effectiveType: null,
    downlink: null,
    rtt: null,
  }));

  const update = useCallback(() => setStatus(buildStatus()), []);

  useEffect(() => {
    // Initial read
    update();

    window.addEventListener('online', update);
    window.addEventListener('offline', update);

    const conn = getConnection();
    if (conn) conn.addEventListener('change', update);

    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      if (conn) conn.removeEventListener('change', update);
    };
  }, [update]);

  return status;
}
