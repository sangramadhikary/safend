/**
 * Work order list rows.
 *
 * A work order record is not always one work order. When a client issues a
 * separate work order per security post, newer records store exactly that — one
 * row per post. Older records packed every post into a single row, with each
 * post's ID, dates, value, reference and signed document hidden inside the
 * `perPost*` maps.
 *
 * Listing raw records therefore under-reports reality: a client with 7 per-post
 * work orders appears once. This module flattens records into the work orders
 * they actually represent, so the list is accurate no matter how a record is
 * stored, and marks the rows that are still sharing a record so they can be
 * split into real ones.
 */

export interface WorkOrderRow {
  /** Stable React key */
  key: string;
  /** The underlying work order record (what modals and actions operate on) */
  source: any;
  /** True when this row is one post of a record that holds several */
  isGrouped: boolean;
  /** Post index within the record — only meaningful when isGrouped */
  postIndex: number;
  /** How many rows this record produced */
  siblingCount: number;

  workOrderId: string;
  customerId: string;
  clientName: string;
  /** Post name for a single-post row; blank when the row covers several posts */
  postName: string;
  /** Posts this row covers */
  postCount: number;
  guards: number;

  startDate: string;
  endDate: string;
  /** Contract value in rupees */
  value: number;
  clientWoRef: string;
  quotationRef: string;
  /** Signed work order received from the client */
  signedDocUrl: string;
  /** Work order PDF generated for the client to sign */
  generatedDocUrl: string;

  status: string;
  isTerminating: boolean;
  batchId: string;
}

const toAmount = (value: any): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = parseFloat(String(value ?? '0').replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const postsOf = (wo: any): any[] => {
  const locations = wo?.locations;
  if (Array.isArray(locations) && locations.length) return locations;
  return Array.isArray(wo?.posts) ? wo.posts : [];
};

const guardsOf = (post: any): number => Number(post?.guards ?? post?.totalGuards ?? 0) || 0;

const dateOnly = (value: any): string => {
  if (!value) return '';
  const raw = String(value);
  return raw.includes('T') ? raw.split('T')[0] : raw;
};

/**
 * Split a record's total across its posts.
 *
 * Posts that captured their own contract value keep it; whatever is left of the
 * record total is shared evenly by the posts that didn't. The sum always matches
 * the record, so a grouped record and its split-out work orders report the same
 * money.
 */
export const distributePerPostValues = (
  recordTotal: number,
  perPostDetails: Record<string, { value?: string }> | undefined,
  postCount: number
): number[] => {
  const details = perPostDetails || {};
  const known: (number | null)[] = [];

  for (let i = 0; i < postCount; i++) {
    const raw = details[String(i)]?.value;
    const parsed = raw ? toAmount(raw) : null;
    known.push(parsed && parsed > 0 ? parsed : null);
  }

  const knownTotal = known.reduce((sum, v) => sum + (v ?? 0), 0);
  const missing = known.filter(v => v === null).length;
  if (missing === 0) return known.map(v => v ?? 0);

  const remainder = Math.max(0, recordTotal - knownTotal);
  const share = Math.floor(remainder / missing);
  // The last post without a value absorbs the rounding difference
  let leftover = remainder - share * missing;

  return known.map(v => {
    if (v !== null) return v;
    const extra = leftover > 0 ? leftover : 0;
    leftover = 0;
    return share + extra;
  });
};

/**
 * True when a record still packs several posts into one work order, i.e. it
 * predates one-work-order-per-post and can be split into real records.
 */
export const isGroupedPerPostRecord = (wo: any): boolean =>
  wo?.clientApprovalMode === 'per-post' && postsOf(wo).length > 1;

/** Flatten work order records into the work orders they actually represent. */
export const toWorkOrderRows = (workOrders: any[]): WorkOrderRow[] => {
  const rows: WorkOrderRow[] = [];

  for (const wo of workOrders || []) {
    const posts = postsOf(wo);
    const recordId = wo.id || wo.workOrderId || 'wo';
    const isTerminating = !!(
      wo.terminationData?.status &&
      wo.terminationData.status !== 'completed' &&
      wo.status !== 'Terminated'
    );

    const base = {
      source: wo,
      customerId: wo.customerId || '',
      clientName: wo.clientName || wo.companyName || '',
      status: wo.status || 'Draft',
      isTerminating,
      batchId: wo.batchId || '',
    };

    // One work order per post, but all inside one record — surface each post
    if (isGroupedPerPostRecord(wo)) {
      const perPostDetails = wo.perPostDetails || {};
      const perPostIds = wo.perPostWorkOrderIds || {};
      const perPostRefs = wo.clientWoRefPerPost || {};
      const perPostDocs = wo.clientApprovalPerPost || {};
      const values = distributePerPostValues(toAmount(wo.value), perPostDetails, posts.length);

      posts.forEach((post: any, idx: number) => {
        const detail = perPostDetails[String(idx)] || {};
        rows.push({
          ...base,
          key: `${recordId}:${idx}`,
          isGrouped: true,
          postIndex: idx,
          siblingCount: posts.length,
          workOrderId: perPostIds[String(idx)] || `${wo.workOrderId || ''}`,
          postName: post?.name?.trim() || post?.postName?.trim() || `Post ${idx + 1}`,
          postCount: 1,
          guards: guardsOf(post),
          startDate: dateOnly(detail.startDate || wo.startDate),
          endDate: dateOnly(detail.endDate || wo.endDate),
          value: values[idx] ?? 0,
          clientWoRef: perPostRefs[String(idx)] || '',
          quotationRef: detail.quotationRef || wo.linkedQuoteId || '',
          signedDocUrl: perPostDocs[String(idx)] || '',
          generatedDocUrl: detail.documentUrl || '',
        });
      });
      continue;
    }

    // A single work order — covering one post, or all of them
    rows.push({
      ...base,
      key: recordId,
      isGrouped: false,
      postIndex: 0,
      siblingCount: 1,
      workOrderId: wo.workOrderId || wo.id || '',
      postName: posts.length === 1
        ? (posts[0]?.name?.trim() || posts[0]?.postName?.trim() || 'Post 1')
        : '',
      postCount: posts.length,
      guards: posts.reduce((sum: number, p: any) => sum + guardsOf(p), 0),
      startDate: dateOnly(wo.startDate),
      endDate: dateOnly(wo.endDate),
      value: toAmount(wo.value),
      clientWoRef: wo.clientWoRef || '',
      quotationRef: wo.linkedQuoteId || '',
      signedDocUrl: wo.clientApproval || '',
      generatedDocUrl: wo.documentUrl || '',
    });
  }

  return rows;
};

/** Fields a row can be searched on. */
export const searchTextOf = (row: WorkOrderRow): string =>
  [
    row.clientName,
    row.customerId,
    row.workOrderId,
    row.postName,
    row.clientWoRef,
    row.quotationRef,
    row.status,
    String(row.value),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
