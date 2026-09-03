'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Client-only wrapper for the Leaflet map.
 *
 * Leaflet touches `window` at import time, so the map must never be part of the
 * server render. Importing it through this single wrapper keeps that decision in
 * one place rather than repeating a `dynamic()` call in every panel.
 */
export const MapCanvas = dynamic(() => import('./TrackMap'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});
