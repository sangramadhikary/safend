'use client';

/**
 * ApprovalQueue — the shared pending check-in queue rendered by both the
 * Supervisor portal and the Operations portal.
 *
 * It reads the branch/role-scoped pending records through `useApprovalQueue`
 * (which derives the per-record display view-models) and renders one
 * `CheckInCard` per record. Approve/reject actions are wired to the resolve
 * route (`POST /api/attendance/checkin/{id}/resolve`) with a body of
 * `{ action: 'approve' | 'reject', notes? }` (R11.1, R11.3); on success the
 * queue refetches so the resolved record drops out. When no pending records
 * exist within the current user's scope, an empty-state message is shown
 * (R10.6). Role gating is enforced by the mounting portal, per the design.
 *
 * Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 11.1
 */

import { useState } from 'react';
import { Loader2, Inbox, AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useApprovalQueue } from './useApprovalQueue';
import { CheckInCard } from './CheckInCard';
import type { PendingCheckInQuery } from '@/services/supabase/QrCheckInService';

export interface ApprovalQueueProps {
  /**
   * Branch/post scope for the queue. Browser portal callers can omit this and
   * rely on the ambient branch scope; server-scoped callers pass explicit
   * branch ids.
   */
  scope?: PendingCheckInQuery;
  /** Optional heading rendered above the list. */
  title?: string;
}

/** Build the resolve-route URL for a given check-in id. */
function resolveUrl(id: string): string {
  return `/api/attendance/checkin/${id}/resolve`;
}

export function ApprovalQueue({ scope = {}, title }: ApprovalQueueProps) {
  const { items, isLoading, isError, error, refetch } = useApprovalQueue(scope);
  const { toast } = useToast();

  // Track which record currently has a resolve action in flight so its card can
  // show a spinner and disable its buttons.
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const resolve = async (
    id: string,
    action: 'approve' | 'reject',
    notes?: string,
  ) => {
    setResolvingId(id);
    try {
      const res = await fetch(resolveUrl(id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes }),
      });

      if (!res.ok) {
        let message = 'Failed to resolve the check-in.';
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          /* non-JSON error body — keep the default message */
        }
        toast({
          title: action === 'approve' ? 'Approval failed' : 'Rejection failed',
          description: message,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: action === 'approve' ? 'Check-in approved' : 'Check-in rejected',
        description:
          action === 'approve'
            ? 'Attendance has been marked present for this slot.'
            : 'The check-in has been rejected.',
      });
      // Drop the resolved record from the queue.
      refetch();
    } catch {
      toast({
        title: 'Network error',
        description: 'Could not reach the server. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setResolvingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading pending check-ins…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">
          {error?.message || 'Failed to load the approval queue.'}
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <RotateCcw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  // Empty state (R10.6).
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground opacity-60" />
        <p className="text-sm font-medium">No pending check-ins</p>
        <p className="text-xs text-muted-foreground">
          There are no check-ins waiting for your review right now.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {title && (
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <span className="text-xs text-muted-foreground">
            {items.length} pending
          </span>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <CheckInCard
            key={item.id}
            item={item}
            isResolving={resolvingId === item.id}
            onApprove={(id) => resolve(id, 'approve')}
            onReject={(id, notes) => resolve(id, 'reject', notes)}
          />
        ))}
      </div>
    </div>
  );
}

export default ApprovalQueue;
