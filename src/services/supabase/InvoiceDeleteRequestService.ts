'use client';

import { supabaseClient } from '@/integrations/supabase/client';
import { reviewInvoiceDeleteRequest } from '@/services/invoiceLedgerService';
import { logAuditEvent } from '@/utils/auditLog';

/**
 * Review queue for non-admin requests to delete a receivable/invoice.
 *
 * The requests were previously write-only: `ManageReceivables` inserted rows and
 * notified admins by message text, but nothing read the table back, so a request
 * could never be approved or rejected. This service is the read/review half.
 *
 * The review itself runs in the database (review_invoice_delete_request in
 * supabase/migrations/20261029000000_invoice_ledger_integrity.sql), in one
 * transaction and for admins only. Approving deletes the invoice only when it
 * is a draft that was never issued or paid; an issued invoice is cancelled
 * instead and keeps its number, because tax invoices must stay on record.
 *
 * Deliberately separate from `DeletionRequestService`, which serves the sales
 * pipeline (`deletion_requests`: leads, quotations, agreements, work orders).
 * The two tables have different shapes and different approval side effects.
 */
export interface InvoiceDeleteRequest {
  id?: string;
  /** `receivables.id` — may point at a deleted draft once approved. */
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

/** What review_invoice_delete_request did with the request and its invoice. */
export type InvoiceDeleteReviewAction = 'deleted' | 'cancelled' | 'rejected' | 'missing' | 'already_cancelled';

export interface InvoiceDeleteReviewResult {
  success: boolean;
  /** Set when success is true. */
  action?: InvoiceDeleteReviewAction;
  error?: string;
}

/** Title and sentence describing a review outcome, for the admin's toast and the requester's notification. */
export const describeReviewOutcome = (
  action: InvoiceDeleteReviewAction,
  label: string
): { title: string; message: string } => {
  switch (action) {
    case 'deleted':
      return { title: 'Draft Invoice Deleted', message: `Invoice #${label} was a draft that was never issued, so it has been deleted.` };
    case 'cancelled':
      return {
        title: 'Invoice Cancelled',
        message: `Invoice #${label} had already been issued, so it was cancelled instead of deleted. Its number stays on record.`,
      };
    case 'already_cancelled':
      return { title: 'Already Cancelled', message: `Invoice #${label} was already cancelled, so nothing else was changed.` };
    case 'missing':
      return { title: 'Invoice Not Found', message: `Invoice #${label} no longer exists, so the request has been closed.` };
    case 'rejected':
      return { title: 'Request Rejected', message: `The request to delete Invoice #${label} was rejected. The invoice is unchanged.` };
  }
};

/**
 * Mark every pending request for a receivable as approved. Only updates the
 * request rows; it never deletes or changes an invoice.
 *
 * The database already does this when a request is reviewed from the queue
 * (review_invoice_delete_request) and when an admin deletes a draft directly
 * (delete_draft_invoice). Kept for callers that close requests after acting on
 * an invoice some other way.
 *
 * Best-effort and never throws: the action on the invoice has already happened
 * by the time this runs, so a failure here must not be reported as a failure of it.
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
 * Review a request in the database and record the outcome in the audit log.
 * On approval the database also closes every other pending request for the
 * same invoice, so two requests for one invoice are settled together.
 */
const review = async (
  request: InvoiceDeleteRequest,
  decision: 'approve' | 'reject',
  reviewedBy: string
): Promise<InvoiceDeleteReviewResult> => {
  if (!request.id) return { success: false, error: 'Request has no id' };

  let result: InvoiceDeleteReviewResult;
  try {
    const { action } = await reviewInvoiceDeleteRequest(request.id, decision, reviewedBy);
    result = { success: true, action };
  } catch (error: any) {
    console.error(`Error reviewing invoice delete request (${decision}):`, error?.message || error);
    result = { success: false, error: error?.message || 'Failed to review the delete request' };
  }

  // A deleted draft leaves no row behind, so this entry is the record of its
  // value, its client and the reason it was removed.
  void logAuditEvent({
    action: decision === 'approve' ? 'accounts.invoice.delete.approve' : 'accounts.invoice.delete.reject',
    target: invoiceRequestLabel(request),
    entityType: 'receivables',
    entityId: request.receivableId,
    entityLabel: `${invoiceRequestLabel(request)} — ${request.clientName || 'Unknown client'}`,
    outcome: result.success ? 'success' : 'failure',
    errorMessage: result.error,
    details: {
      requestId: request.id,
      result: result.action ?? null,
      invoiceNumber: request.invoiceNumber || null,
      clientName: request.clientName,
      totalAmount: request.amount,
      reason: request.reason,
      requestedBy: request.requestedByName || request.requestedBy,
      reviewedBy,
    },
  });

  return result;
};

/**
 * Approve a request. A draft that was never issued or paid is deleted; an issued
 * invoice is cancelled instead and keeps its number. `action` says which happened.
 */
export const approveInvoiceDeleteRequest = (request: InvoiceDeleteRequest, reviewedBy: string) =>
  review(request, 'approve', reviewedBy);

/** Reject a request. The invoice is left untouched. */
export const rejectInvoiceDeleteRequest = (request: InvoiceDeleteRequest, reviewedBy: string) =>
  review(request, 'reject', reviewedBy);
