'use client';

import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import {
  queryClient,
  createCachePersister,
  persistOptions,
  clearPersistedQueryCache,
  relieveMemoryPressure,
} from '@/lib/queryCache';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AppDataProvider } from '@/contexts/AppDataContext';
import { BranchProvider } from '@/contexts/BranchContext';
import { LoadingProvider } from '@/contexts/LoadingContext';
import { SoundEffectsProvider } from '@/components/sound/SoundEffectsProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { SoundInitializer } from '@/components/sound/SoundInitializer';
import { onBranchScopeChange } from '@/utils/branchScope';
import { gcExpiredDrafts } from '@/utils/formDraft';
import { useEffect, useRef } from 'react';
import { requestNotificationPermission } from '@/utils/systemNotification';
import { ProfileModal } from '@/components/layout/ProfileModal';
import { LogoutOverlay } from '@/components/layout/LogoutOverlay';
import { SessionGuard } from '@/components/session/SessionGuard';
import dynamic from 'next/dynamic';

// Load SafendLoader client-only to prevent SSR/hydration mismatch
const SafendLoader = dynamic(
  () => import('@/components/SafendLoader').then((m) => ({ default: m.SafendLoader })),
  { ssr: false }
);

// Network status overlay — client-only (uses navigator.onLine / navigator.connection)
const NetworkStatusOverlay = dynamic(
  () => import('@/components/network/NetworkStatusOverlay').then((m) => ({ default: m.NetworkStatusOverlay })),
  { ssr: false }
);

// Create React Query client with better performance settings
// (client + persistence config live in src/lib/queryCache.ts)
const persister = createCachePersister();

/**
 * BranchScopeInvalidator — invalidates all caches when branch switches.
 * Also clears persisted (localStorage) cache so a refresh after switching
 * branches never restores the previous branch's data.
 */
function BranchScopeInvalidator() {
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  useEffect(() => {
    return onBranchScopeChange(() => {
      clearPersistedQueryCache();
      queryClientRef.current.invalidateQueries();
    });
  }, []);
  return null;
}

/**
 * CacheLifecycleManager — handles intelligent cache maintenance:
 * 1. GC expired form drafts on mount (lazy cleanup)
 * 2. Relieve memory pressure when tab is hidden >5 minutes
 * 3. Drop stale queries from memory when page becomes visible again
 * 4. Request browser notification permission on first user interaction
 *
 * Inspired by Chrome's tab freezing and Slack's memory management.
 */
function CacheLifecycleManager() {
  const hiddenSinceRef = useRef<number | null>(null);
  const HIDDEN_THRESHOLD = 5 * 60 * 1000; // 5 minutes

  useEffect(() => {
    // On mount: clean up expired form drafts (lazy GC, like Redis lazy expiry)
    gcExpiredDrafts();

    // Request notification permission on first user interaction.
    // This ensures the browser prompt only appears after the user has engaged
    // with the app (not on cold load, which browsers block anyway).
    const requestPermissionOnce = () => {
      requestNotificationPermission();
      // Remove all listeners after first interaction
      events.forEach(e => document.removeEventListener(e, requestPermissionOnce));
    };
    const events = ['click', 'keydown', 'touchstart'] as const;
    events.forEach(e => document.addEventListener(e, requestPermissionOnce, { once: true, passive: true }));

    // Visibility-based memory management
    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now();
      } else {
        // Tab became visible again
        const hiddenDuration = hiddenSinceRef.current
          ? Date.now() - hiddenSinceRef.current
          : 0;
        hiddenSinceRef.current = null;

        // If hidden for >5 min, relieve memory pressure by dropping stale/unobserved queries
        if (hiddenDuration > HIDDEN_THRESHOLD) {
          relieveMemoryPressure();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      events.forEach(e => document.removeEventListener(e, requestPermissionOnce));
    };
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // When a persister isn't available (SSR), fall back to a plain provider.
  if (!persister) {
    return (
      <QueryClientProvider client={queryClient}>
        <ProvidersInner>{children}</ProvidersInner>
      </QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, ...persistOptions }}
    >
      <ProvidersInner>{children}</ProvidersInner>
    </PersistQueryClientProvider>
  );
}

function ProvidersInner({ children }: { children: React.ReactNode }) {
  return (
    <LoadingProvider>
      <AppDataProvider>
        <BranchProvider>
          <ThemeProvider defaultTheme="light">
            <SoundEffectsProvider>
              <TooltipProvider>
                <BranchScopeInvalidator />
                <CacheLifecycleManager />
                <ProfileModal />
                <LogoutOverlay />
                <SessionGuard />
                <SafendLoader />
                <NetworkStatusOverlay />
                <Toaster />
                <Sonner />
                <SoundInitializer />
                {children}
              </TooltipProvider>
            </SoundEffectsProvider>
          </ThemeProvider>
        </BranchProvider>
      </AppDataProvider>
    </LoadingProvider>
  );
}
