'use client';

import { supabaseClient } from '@/integrations/supabase/client';
import { recordCancelledInvoiceNumber } from '@/services/invoiceNumberService';
import { logAuditEvent } from '@/utils/auditLog';

/**
 * Review queue for non-admin requests to delete a receivable/invoice.
 *
 * The requests were previously write-only: `ManageReceivables` inserted rows and
 * notified admins by message text, but nothing read the table back, so a request
 * could never be approved or rejected. This service is the read/review half.
 *
 * Deliberately separate from `DeletionRequestService`, which serves the sales
 * pipeline (`deletion_requests`: leads, quotations, agreements, work orders).
 * The two tables have different shapes and different approval side effects.
 */
export interface InvoiceDeleteRequest {
  id?: string;
  /** `receivables.id` — may point at an already-deleted row once approved. */
  receivableId: string;
  /** Empty string when the receivable had no invoice number. */
  invoiceNumber: string;
  clientName: string;
  amount: number;
  /** auth.users id of the requester, used directly as a notification target. */
  requestedBy: string;
  requestedByName: string;
  reason: string;
  requestedAt: Date;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: Date;
}

const TABLE = 'invoice_delete_requests';

const mapRow = (row: any): InvoiceDeleteRequest => ({
  id: row.id,
  receivableId: row.receivable_id,
  invoiceNumber: row.invoice_number || '',
  clientName: row.client_name || '',
  amount: Number(row.amount) || 0,
  requestedBy: row.requested_by || '',
  requestedByName: row.requested_by_name || '',
  reason: row.reason || '',
  requestedAt: row.created_at ? new Date(row.created_at) : new Date(),
  status: row.status || 'pending',
  reviewedBy: row.reviewed_by || undefined,
  reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
});

/**
 * Human-readable label for a request.
 *
 * `invoiceNumber` is blank for categories that carry no serial (Event Letters
 * always, Taxes / Other Income unless a reference was typed), so it must never be
 * rendered raw. Mirrors `getInvoiceLabel` in ManageReceivables.
 */
export const invoiceRequestLabel = (request: InvoiceDeleteRequest): string =>
  request.invoiceNumber || request.receivableId.slice(0, 8);

/** Subscribe to every invoice delete request, newest first. */
export const subscribeToInvoiceDeleteRequests = (
  callback: (requests: InvoiceDeleteRequest[]) => void
) => {
  const fetchAll = async () => {
    const { data, error } = await supabaseClient
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching invoice delete requests:', error.message);
      callback([]);
      return;
    }
    callback((data || []).map(mapRow));
  };

  fetchAll();

  const channel = supabaseClient
    .channel('invoice-delete-requests-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => {
      fetchAll();
    })
    .subscribe();

  return () => {
    supabaseClient.removeChannel(channel);
  };
};

/**
 * Stamp a request as reviewed.
 *
 * `reviewed_at` is left to the server-side trigger. The `reviewed_by` write is
 * retried without that column if the deployment has not yet had the
 * 20260904000000 migration applied — the review itself matters more than
 * recording who performed it, and failing the whole approval over a missing
 * audit column would leave the receivable deleted but the request still pending.
 */
const setReviewStatus = async (
  requestId: string,
  status: 'approved' | 'rejected',
  reviewedBy: string
) => {
  const { error } = await supabaseClient
    .from(TABLE)
    .update({ status, reviewed_by: reviewedBy })
    .eq('id', requestId);

  if (!error) return { success: true };

  const missingColumn =
    error.code === 'PGRST204' || /reviewed_by/i.test(error.message || '');

  if (missingColumn) {
    const { error: retryError } = await supabaseClient
      .from(TABLE)
      .update({ status })
      .eq('id', requestId);
    if (!retryError) return { success: true };
    console.error(`Error setting invoice delete request to ${status}:`, retryError.message);
    return { success: false, error: retryError.message };
  }

  console.error(`Error setting invoice delete request to ${status}:`, error.message);
  return { success: false, error: error.message };
};

/**
 * Mark every pending request for a receivable as approved.
 *
 * Used both when an admin approves a request from the queue (to close duplicate
 * requests for the same invoice) and when an admin deletes an invoice directly
 * from Accounts (which grants any outstanding request by definition). Either way
 * a pending row must not survive a receivable that no longer exists.
 *
 * Best-effort and never throws: the receivable is already gone by the time this
 * runs, so a failure here must not be reported as a failed approval.
 */
export const closePendingRequestsForReceivable = async (
  receivableId: string,
  reviewedBy: string
) => {
  try {
    const { error } = await supabaseClient
      .from(TABLE)
      .update({ status: 'approved', reviewed_by: reviewedBy })
      .eq('receivable_id', receivableId)
      .eq('status', 'pending');

    // PostgREST reports a missing column in the response rather than throwing,
    // so retry without it on deployments lacking the 20260904000000 migration.
    if (error && (error.code === 'PGRST204' || /reviewed_by/i.test(error.message || ''))) {
      await supabaseClient
        .from(TABLE)
        .update({ status: 'approved' })
        .eq('receivable_id', receivableId)
        .eq('status', 'pending');
    }
  } catch {
    /* non-critical */
  }
};

/**
 * Delete the receivable a request refers to.
 *
 * Mirrors the admin hard-delete in `ManageReceivables.deleteInvoice`, including
 * recording the serial as cancelled. That record is audit only — since the
 * Rule 46(b) work in 20260802000000, a cancelled invoice number is NOT returned
 * to circulation; the gap is intentional.
 */
export const deleteReceivableForRequest = async (request: InvoiceDeleteRequest) => {
  try {
    if (request.invoiceNumber) {
      await recordCancelledInvoiceNumber(
        request.invoiceNumber,
        `Delete request approved — requested by ${request.requestedByName || request.requestedBy}`
      );
    }

    // Payments reference the receivable; clear them first.
    try {
      await supabaseClient
        .from('receivable_payments')
        .delete()
        .eq('receivable_id', request.receivableId);
    } catch {
      /* may not have payments */
    }

    const { error } = await supabaseClient
      .from('receivables')
      .delete()
      .eq('id', request.receivableId);

    if (error) {
      console.error('Error deleting receivable for approved request:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting receivable for approved request:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Approve a request: delete the receivable, then mark the request approved.
 *
 * Ordered deliberately. If the delete fails the request stays pending so it can
 * be retried; marking it approved first would lose the request while leaving the
 * invoice in place.
 */
export const approveInvoiceDeleteRequest = async (
  request: InvoiceDeleteRequest,
  reviewedBy: string
) => {
  if (!request.id) return { success: false, error: 'Request has no id' };

  const deleted = await deleteReceivableForRequest(request);
  if (!deleted.success) {
    void logAuditEvent({
      action: 'accounts.invoice.delete.approve',
      target: invoiceRequestLabel(request),
      entityType: 'receivables',
      entityId: request.receivableId,
      entityLabel: `${invoiceRequestLabel(request)} — ${request.clientName || 'Unknown client'}`,
      outcome: 'failure',
      errorMessage: deleted.error,
      details: { requestId: request.id, reviewedBy },
    });
    return deleted;
  }

  const reviewed = await setReviewStatus(request.id, 'approved', reviewedBy);

  // Two people can request the same invoice. Their requests were satisfied by this
  // same deletion, so close them too — leaving them pending would point the queue
  // at a receivable that no longer exists.
  await closePendingRequestsForReceivable(request.receivableId, reviewedBy);

  // The receivable row is gone, so this audit entry is the only remaining record
  // of the invoice's value, its client, and the reason it was removed.
  void logAuditEvent({
    action: 'accounts.invoice.delete.approve',
    target: invoiceRequestLabel(request),
    entityType: 'receivables',
    entityId: request.receivableId,
    entityLabel: `${invoiceRequestLabel(request)} — ${request.clientName || 'Unknown client'}`,
    outcome: reviewed.success ? 'success' : 'failure',
    errorMessage: reviewed.success ? undefined : reviewed.error,
    details: {
      requestId: request.id,
      invoiceNumber: request.invoiceNumber || null,
      clientName: request.clientName,
      totalAmount: request.amount,
      reason: request.reason,
      requestedBy: request.requestedByName || request.requestedBy,
      reviewedBy,
    },
  });

  return reviewed;
};

/** Reject a request. The receivable is left untouched. */
export const rejectInvoiceDeleteRequest = async (
  request: InvoiceDeleteRequest,
  reviewedBy: string
) => {
  if (!request.id) return { success: false, error: 'Request has no id' };

  const reviewed = await setReviewStatus(request.id, 'rejected', reviewedBy);

  void logAuditEvent({
    action: 'accounts.invoice.delete.reject',
    target: invoiceRequestLabel(request),
    entityType: 'receivables',
    entityId: request.receivableId,
    entityLabel: `${invoiceRequestLabel(request)} — ${request.clientName || 'Unknown client'}`,
    outcome: reviewed.success ? 'success' : 'failure',
    errorMessage: reviewed.success ? undefined : reviewed.error,
    details: {
      requestId: request.id,
      clientName: request.clientName,
      totalAmount: request.amount,
      reason: request.reason,
      requestedBy: request.requestedByName || request.requestedBy,
      reviewedBy,
    },
  });

  return reviewed;
};
