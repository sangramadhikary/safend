'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Inbox, MousePointerClick } from 'lucide-react';

/** Shared loading / error / empty states so every panel behaves the same way. */

export function PanelLoading({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function PanelError({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>{error.message}</span>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function PanelEmpty({
  title,
  hint,
  icon: Icon = Inbox,
}: {
  title: string;
  hint?: string;
  icon?: typeof Inbox;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-14 text-center">
      <Icon className="mb-3 h-10 w-10 text-gray-200" />
      <p className="font-medium text-muted-foreground">{title}</p>
      {hint && <p className="mt-1 max-w-md text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function NoSelection() {
  return (
    <PanelEmpty
      icon={MousePointerClick}
      title="No devices selected"
      hint="Pick one or more devices in the filter above to load their tracking data."
    />
  );
}
