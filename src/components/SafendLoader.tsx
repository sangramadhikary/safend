'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useLoading } from '@/contexts/LoadingContext';
import { Skeleton } from '@/components/ui/skeleton';

/** ERP paths where the dashboard skeleton should appear. */
const ERP_PATHS = ['/dashboard', '/accounts', '/hr', '/office-admin', '/operations', '/profile', '/sales'];

export function SafendLoader() {
  const { isLoading, setIsLoading } = useLoading();
  const pathname = usePathname();

  // Auto-dismiss after a short delay
  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => setIsLoading(false), 1500);
    return () => clearTimeout(timer);
  }, [isLoading, setIsLoading]);

  // Only show the ERP skeleton on ERP dashboard paths
  if (!isLoading || !ERP_PATHS.some((p) => pathname.startsWith(p))) return null;

  return (
    <div className="fixed inset-0 z-9999 bg-background flex">
      {/* Sidebar skeleton */}
      <div className="hidden md:flex w-64 flex-col gap-4 border-r p-4">
        <Skeleton className="h-10 w-36" />
        <div className="space-y-3 mt-6">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
      {/* Main content skeleton */}
      <div className="flex-1 flex flex-col gap-6 p-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-56" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        </div>
        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        {/* Main content area */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-72 w-full rounded-xl md:col-span-2" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}
