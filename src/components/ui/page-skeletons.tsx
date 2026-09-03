'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/* ─── Primitives ─────────────────────────────────────────────────────────── */

/** A single stat-card skeleton matching StatCard dimensions */
export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('glass-card p-6 space-y-3', className)}>
      <div className="flex justify-between items-start">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-20 mt-2" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
      </div>
    </div>
  );
}

/** A row of 4 stat cards */
export function StatCardRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid gap-4 grid-cols-2 lg:grid-cols-${count}`}>
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** A generic chart / content-block skeleton */
export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('glass-card p-6 space-y-3', className)}>
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-3 w-48" />
      <Skeleton className="h-48 w-full rounded-lg mt-2" />
    </div>
  );
}

/** Tab bar skeleton */
export function TabBarSkeleton({ tabs = 5 }: { tabs?: number }) {
  return (
    <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
      {Array.from({ length: tabs }).map((_, i) => (
        <Skeleton key={i} className="h-9 flex-1 rounded-md" />
      ))}
    </div>
  );
}

/** A table skeleton with configurable rows / columns */
export function TableSkeleton({
  rows = 6,
  cols = 5,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {/* Header */}
      <div className="flex gap-4 px-4 py-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-4 py-3 border-t border-border/30">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-4 flex-1', c === 0 && 'w-8 flex-none')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Module header skeleton (title + description + optional action button) */
export function ModuleHeaderSkeleton({ hasAction = false }: { hasAction?: boolean }) {
  return (
    <div className="flex justify-between items-center mb-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      {hasAction && <Skeleton className="h-10 w-32 rounded-md" />}
    </div>
  );
}

/** A card with header + body skeleton */
export function CardSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border bg-card shadow-xs p-6 space-y-3', className)}>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-3 w-56" />
      <div className="pt-2 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

/** Filter chip row */
export function FilterChipsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-2 mt-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-20 rounded-lg" />
      ))}
    </div>
  );
}

/* ─── Page-level skeletons ───────────────────────────────────────────────── */

/** /dashboard — AdminDashboardModule skeleton */
export function DashboardPageSkeleton() {
  return (
    <div className="w-full space-y-6">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>

      {/* Main tab bar */}
      <TabBarSkeleton tabs={3} />

      {/* KPI cards */}
      <StatCardRowSkeleton count={4} />

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>

      {/* Wide chart */}
      <ChartSkeleton className="h-auto" />
    </div>
  );
}

/** /hr — HRModule skeleton */
export function HRPageSkeleton() {
  return (
    <div className="space-y-6">
      <ModuleHeaderSkeleton hasAction />

      {/* ModuleCard */}
      <div className="rounded-lg border bg-card/50 shadow-md overflow-hidden">
        {/* Tab bar */}
        <div className="p-6 border-b border-border/50">
          <TabBarSkeleton tabs={7} />
        </div>

        {/* Content area */}
        <div className="p-6 space-y-4">
          {/* Filter chips */}
          <FilterChipsSkeleton count={5} />
          {/* Table */}
          <TableSkeleton rows={7} cols={6} className="mt-4" />
        </div>
      </div>
    </div>
  );
}

/** /accounts — AccountsModule skeleton */
export function AccountsPageSkeleton() {
  return (
    <div className="space-y-6">
      <ModuleHeaderSkeleton hasAction />

      <div className="rounded-lg border bg-card/50 shadow-md overflow-hidden">
        {/* Tab bar + filters */}
        <div className="p-6 border-b border-border/50 space-y-4">
          <TabBarSkeleton tabs={6} />
          <FilterChipsSkeleton count={5} />
        </div>

        {/* Content area — table-based */}
        <div className="p-6 space-y-4">
          <TableSkeleton rows={8} cols={6} />
        </div>
      </div>
    </div>
  );
}

/** /sales — SalesModule skeleton */
export function SalesPageSkeleton() {
  return (
    <div className="space-y-6">
      <ModuleHeaderSkeleton />

      <div className="rounded-lg border bg-card/50 shadow-md overflow-hidden">
        {/* Tab bar + search + filters */}
        <div className="p-6 border-b border-border/50 space-y-4">
          <div className="flex gap-3 items-center">
            <Skeleton className="h-9 flex-1 rounded-md max-w-xs" />
            <TabBarSkeleton tabs={6} />
          </div>
          <FilterChipsSkeleton count={4} />
        </div>

        {/* Table content */}
        <div className="p-6">
          <TableSkeleton rows={8} cols={6} />
        </div>
      </div>
    </div>
  );
}

/** /operations — OperationsModule skeleton */
export function OperationsPageSkeleton() {
  return (
    <div className="space-y-6">
      <ModuleHeaderSkeleton hasAction />

      <div className="rounded-lg border bg-card/50 shadow-md overflow-hidden">
        {/* Tab bar */}
        <div className="p-6 border-b border-border/50">
          <TabBarSkeleton tabs={7} />
        </div>

        {/* Dashboard-style content */}
        <div className="p-6 space-y-4">
          <StatCardRowSkeleton count={4} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ChartSkeleton className="md:col-span-2" />
            <ChartSkeleton />
          </div>
          <TableSkeleton rows={5} cols={5} />
        </div>
      </div>
    </div>
  );
}

/** /office-admin — OfficeAdminModule skeleton */
export function OfficeAdminPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* Full-width tab bar matching OfficeAdmin's TabsList */}
      <div className="inline-flex w-full h-auto bg-card p-1 rounded-lg gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 flex-1 rounded-sm" />
        ))}
      </div>

      {/* Content — stat cards + chart + table */}
      <div className="space-y-4">
        <StatCardRowSkeleton count={4} />
        <ChartSkeleton />
        <TableSkeleton rows={5} cols={5} />
      </div>
    </div>
  );
}

/** /profile — UserProfile skeleton */
export function ProfilePageSkeleton() {
  return (
    <div className="container mx-auto max-w-4xl space-y-6">
      {/* Page title */}
      <div className="space-y-1">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Profile header card */}
      <div className="rounded-lg border p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Avatar */}
          <Skeleton className="h-24 w-24 rounded-full shrink-0" />

          {/* Info */}
          <div className="flex-1 space-y-3 text-center sm:text-left">
            <Skeleton className="h-6 w-48 mx-auto sm:mx-0" />
            <Skeleton className="h-4 w-40 mx-auto sm:mx-0" />
            <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
              {[80, 96, 72, 64].map((w, i) => (
                <Skeleton key={i} className={`h-5 w-${w / 4} rounded-full`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <TabBarSkeleton tabs={3} />

      {/* Form card */}
      <CardSkeleton lines={5} />
    </div>
  );
}

/** /client-portal — ClientPortalModule skeleton */
export function ClientPortalPageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Top Navbar skeleton */}
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-16" />
              <div className="hidden sm:block space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-4">
              <Skeleton className="h-7 w-28 rounded-lg" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-6">
          {/* Header */}
          <div>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-80 mt-2" />
          </div>

          {/* Tab bar - 6 tabs */}
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-lg">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 flex-1 rounded-md" />
            ))}
          </div>

          {/* Tab content - Dashboard cards */}
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-28 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
              ))}
            </div>
            <div className="h-64 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          </div>
        </div>
      </main>
    </div>
  );
}

/** /supervisor-portal — EmployeePortalModule skeleton */
export function EmployeePortalPageSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex">
      {/* Sidebar skeleton - Desktop */}
      <aside className="hidden lg:flex flex-col fixed top-0 left-0 h-screen z-40 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
        {/* Sidebar Header */}
        <div className="flex items-center justify-between h-16 border-b border-slate-100 dark:border-slate-800 px-4">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-7 w-14" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 overflow-hidden py-3 px-3 space-y-1">
          {/* Main group */}
          <Skeleton className="h-9 w-full rounded-lg" />
          {/* Work group */}
          <Skeleton className="h-3 w-12 mt-4 mb-1.5 ml-3" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={`work-${i}`} className="h-9 w-full rounded-lg" />
          ))}
          {/* Finance group */}
          <Skeleton className="h-3 w-14 mt-4 mb-1.5 ml-3" />
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={`fin-${i}`} className="h-9 w-full rounded-lg" />
          ))}
          {/* Reports group */}
          <Skeleton className="h-3 w-20 mt-4 mb-1.5 ml-3" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={`rep-${i}`} className="h-9 w-full rounded-lg" />
          ))}
          {/* Info group */}
          <Skeleton className="h-3 w-16 mt-4 mb-1.5 ml-3" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={`info-${i}`} className="h-9 w-full rounded-lg" />
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-slate-100 dark:border-slate-800 p-3">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-8 w-8 rounded-md shrink-0" />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div>
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-3 w-44 mt-1 hidden sm:block" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="hidden sm:flex items-center gap-2 ml-2 pl-3 border-l border-slate-200 dark:border-slate-700">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="hidden md:block space-y-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="space-y-6 animate-pulse">
            <Skeleton className="h-10 w-48 rounded-lg" />
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 rounded-xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
            <div className="h-72 rounded-xl bg-slate-100 dark:bg-slate-800" />
          </div>
        </main>
      </div>
    </div>
  );
}
