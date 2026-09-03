'use client';

import { supabaseClient } from '@/integrations/supabase/client';
import { triggerWorkOrdersRefresh } from '@/utils/dataRefresh';
import { distributePerPostValues } from '@/modules/sales/utils/workOrderRows';

/**
 * Details captured against a single security post when the client issues a
 * separate signed work order for each post (clientApprovalMode = 'per-post').
 */
export interface PerPostWorkOrderDetail {
  startDate?: string;
  endDate?: string;
  value?: string;
  /** Quotation reference for this post (posts can come from different quotes) */
  quotationRef?: string;
  /** URL of the WO PDF generated for this post */
  documentUrl?: string;
}

export interface WorkOrder {
  id?: string;
  workOrderId?: string;
  /** FK to clients.id — the customer this work order belongs to */
  clientId?: string;
  /** Display Customer ID (SF<seq>-YYMMDD, e.g. SF01-260801), mirrored here for cheap reads */
  customerId?: string;
  /**
   * Marks the work orders raised together in one pass, one per security post.
   * A sibling tag only — there is no master work order row.
   */
  batchId?: string;
  clientWoRef?: string;
  clientGst?: string;
  linkedAgreementId: string;
  linkedQuoteId?: string;
  leadId?: string;
  clientName: string;
  companyName?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  serviceDetails: string;
  value: string;
  status: string;
  posts?: Array<any>;
  locations?: Array<any>;
  serviceInstances?: any;
  /** Per-post service instances keyed by post index ("0", "1", ...) */
  perPostServiceInstances?: Record<string, any>;
  gstPercentage?: number;
  /** How the monthly contract price converts to a per-duty rate when invoicing. */
  rateBasis?: 'calendar_month' | 'fixed_days' | 'per_duty' | null;
  /** Divisor when rateBasis is 'fixed_days' (commonly 26). */
  basisDays?: number | null;
  gstExempt?: boolean;
  documentUrl?: string;
  clientApproval?: string;
  clientApprovalMode?: 'unified' | 'per-post';
  clientApprovalPerPost?: Record<string, string>;
  /** WO reference numbers per post when mode = per-post */
  clientWoRefPerPost?: Record<string, string>;
  /**
   * Per-post Start Date / End Date / Contract Value / Quotation Ref and the
   * generated WO PDF for that post — per-post mode only.
   */
  perPostDetails?: Record<string, PerPostWorkOrderDetail>;
  /** Auto-generated Work Order IDs per post — per-post mode only */
  perPostWorkOrderIds?: Record<string, string>;
  createdAt?: Date;
  updatedAt?: Date;
  startDate?: Date | string;
  endDate?: Date | string;
  completionDate?: Date;
  pendingAgreementUpload?: boolean;
  terminationData?: any;
}

/**
 * Real work_orders table columns:
 *   id, work_order_id, client_id, batch_id, quotation_id, order_date,
 *   start_date, end_date, status, total_amount, description,
 *   assigned_to, created_at, updated_at
 *
 * All rich data (client info, posts, service details, etc.)
 * is stored as JSON in the `description` column.
 *
 * client_id / batch_id were added by
 * supabase/migrations/20260731000000_create_clients_customer_ids.sql.
 * client_id is the customer this work order belongs to; batch_id groups the
 * work orders raised together (one per post) without a parent row.
 */

// Normalize status for display
const normalizeWorkOrderStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    'draft': 'Draft',
    'pending': 'Pending',
    'scheduled': 'Scheduled',
    'active': 'Active',
    'in_progress': 'In Progress',
    'in progress': 'In Progress',
    'completed': 'Completed',
    'cancelled': 'Cancelled',
    'on_hold': 'On Hold',
    'on hold': 'On Hold',
    'terminated': 'Terminated',
    'termination_initiated': 'Termination Initiated',
  };
  return statusMap[status?.toLowerCase()] || status || 'Draft';
};

// Pack rich data into description JSON
const packDescription = (wo: Partial<WorkOrder>): string => JSON.stringify({
  clientName: wo.clientName || '',
  companyName: wo.companyName || wo.clientName || '',
  // Mirrored from clients.customer_id so lists can show the Customer ID
  // without a join (format: SF<seq>-YYMMDD, e.g. SF01-260801)
  customerId: wo.customerId || '',
  clientWoRef: wo.clientWoRef || '',
  clientGst: wo.clientGst || '',
  contactPerson: wo.contactPerson || '',
  contactEmail: wo.contactEmail || '',
  contactPhone: wo.contactPhone || '',
  address: wo.address || '',
  city: wo.city || '',
  state: wo.state || '',
  pincode: wo.pincode || '',
  serviceDetails: wo.serviceDetails || '',
  posts: wo.posts || [],
  locations: wo.locations || [],
  serviceInstances: wo.serviceInstances || {},
  perPostServiceInstances: wo.perPostServiceInstances || {},
  gstPercentage: wo.gstPercentage ?? 18,
  gstExempt: wo.gstExempt ?? false,
  // Contracted rate basis — how the monthly price converts to a per-duty rate on
  // invoices raised against this work order. Left undefined on purpose when
  // unset: invoicing blocks rather than guessing a divisor, because guessing is
  // a pricing error. Mirrored to work_orders.rate_basis/basis_days columns.
  rateBasis: wo.rateBasis ?? null,
  basisDays: wo.basisDays ?? null,
  documentUrl: wo.documentUrl || '',
  clientApproval: wo.clientApproval || '',
  clientApprovalMode: wo.clientApprovalMode || 'unified',
  clientApprovalPerPost: wo.clientApprovalPerPost || {},
  clientWoRefPerPost: wo.clientWoRefPerPost || {},
  perPostDetails: wo.perPostDetails || {},
  perPostWorkOrderIds: wo.perPostWorkOrderIds || {},
  linkedAgreementId: wo.linkedAgreementId || '',
  pendingAgreementUpload: wo.pendingAgreementUpload || false,
});

// Unpack description JSON
const unpackDescription = (desc: string | null): Partial<WorkOrder> => {
  if (!desc) return {};
  try {
    return JSON.parse(desc);
  } catch {
    // If it's plain text (not JSON), treat as serviceDetails
    return { serviceDetails: desc };
  }
};

const mapRowToWorkOrder = (row: any): WorkOrder => {
  const d = unpackDescription(row.description);
  return {
    id: row.id,
    workOrderId: row.work_order_id,
    clientId: row.client_id || '',
    customerId: d.customerId || '',
    batchId: row.batch_id || '',
    clientWoRef: d.clientWoRef || '',
    clientGst: d.clientGst || '',
    linkedAgreementId: d.linkedAgreementId || '',
    linkedQuoteId: row.quotation_id || '',
    clientName: d.clientName || '',
    companyName: d.companyName || '',
    contactPerson: d.contactPerson || '',
    contactEmail: d.contactEmail || '',
    contactPhone: d.contactPhone || '',
    address: d.address || '',
    city: d.city || '',
    state: d.state || '',
    pincode: d.pincode || '',
    serviceDetails: d.serviceDetails || '',
    value: row.total_amount != null ? `₹${row.total_amount}` : '₹0',
    status: normalizeWorkOrderStatus(row.status),
    posts: d.posts || [],
    locations: d.locations || [],
    serviceInstances: d.serviceInstances || {},
    perPostServiceInstances: d.perPostServiceInstances || {},
    gstPercentage: d.gstPercentage ?? 18,
    gstExempt: d.gstExempt ?? false,
    // Prefer the queryable columns, then fall back to the description JSON so
    // work orders saved before the columns existed still retain their basis.
    rateBasis: row.rate_basis ?? d.rateBasis ?? null,
    basisDays: row.basis_days ?? d.basisDays ?? null,
    documentUrl: d.documentUrl || '',
    clientApproval: d.clientApproval || '',
    clientApprovalMode: d.clientApprovalMode || 'unified',
    clientApprovalPerPost: d.clientApprovalPerPost || {},
    clientWoRefPerPost: d.clientWoRefPerPost || {},
    perPostDetails: d.perPostDetails || {},
    perPostWorkOrderIds: d.perPostWorkOrderIds || {},
    startDate: row.start_date,
    endDate: row.end_date,
    pendingAgreementUpload: d.pendingAgreementUpload || false,
    terminationData: (d as any).terminationData || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/** Random display ID in the WO-<year>-<4 digits> format */
const randomWorkOrderId = () =>
  `WO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

/**
 * True when another work order already uses this display ID.
 * A read failure resolves to `false` so ID generation is never blocked by a
 * transient network problem.
 */
export const isWorkOrderIdTaken = async (workOrderId: string): Promise<boolean> => {
  if (!workOrderId?.trim()) return false;
  const { data, error } = await supabaseClient
    .from('work_orders')
    .select('id')
    .eq('work_order_id', workOrderId.trim())
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
};

/**
 * Return a display WO ID that no existing work order is using. Keeps
 * `preferred` when it is still free, otherwise draws fresh random IDs.
 */
export const generateUniqueWorkOrderId = async (preferred?: string): Promise<string> => {
  let candidate = preferred?.trim() || randomWorkOrderId();
  for (let attempt = 0; attempt < 10; attempt++) {
    if (!(await isWorkOrderIdTaken(candidate))) return candidate;
    candidate = randomWorkOrderId();
  }
  // Last resort: timestamp suffix cannot realistically collide
  return `WO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
};

// Add a new work order
export const addWorkOrder = async (workOrder: Omit<WorkOrder, 'id'>) => {
  try {
    const workOrderId = workOrder.workOrderId || randomWorkOrderId();
    const totalAmount = parseFloat((workOrder.value || '0').replace(/[₹,]/g, '')) || 0;

    const insertData = {
      work_order_id: workOrderId,
      client_id: workOrder.clientId?.trim() ? workOrder.clientId.trim() : null,
      batch_id: workOrder.batchId?.trim() ? workOrder.batchId.trim() : null,
      quotation_id: (workOrder.linkedQuoteId && workOrder.linkedQuoteId.trim()) ? workOrder.linkedQuoteId.trim() : null,
      order_date: new Date().toISOString().split('T')[0],
      start_date: workOrder.startDate ? String(workOrder.startDate).split('T')[0] : null,
      end_date: workOrder.endDate ? String(workOrder.endDate).split('T')[0] : null,
      status: (workOrder.status || 'draft').toLowerCase().replace(/\s+/g, '_'),
      total_amount: totalAmount,
      description: packDescription(workOrder),
      assigned_to: localStorage.getItem('userName') || 'Admin',
      // Real columns as well as the description blob: the rate basis determines
      // what the client is billed, so it has to be queryable and constrained
      // rather than buried in JSON.
      rate_basis: workOrder.rateBasis ?? null,
      basis_days: workOrder.rateBasis === 'fixed_days' ? workOrder.basisDays ?? null : null,
    };

    // If quotation_id is provided, verify it exists before inserting to avoid FK violation
    if (insertData.quotation_id) {
      const { data: quotCheck } = await supabaseClient
        .from('quotations')
        .select('quotation_id')
        .eq('quotation_id', insertData.quotation_id)
        .maybeSingle();
      if (!quotCheck) {
        // Quotation doesn't exist — set to null to avoid FK constraint error
        insertData.quotation_id = null;
      }
    }

    const { data, error } = await supabaseClient
      .from('work_orders')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      const msg = error.message || (error as any).details || (error as any).hint || (error as any).code || 'Unknown error';
      console.error('Error adding work order:', msg, error);
      return { success: false, error: msg };
    }

    setTimeout(() => triggerWorkOrdersRefresh(), 100);
    return { success: true, id: data.id };
  } catch (error) {
    console.error('Error adding work order (exception):', error);
    return { success: false, error: (error as Error).message };
  }
};

// Update an existing work order
export const updateWorkOrder = async (id: string, workOrder: Partial<WorkOrder>) => {
  try {
    const updates: any = {};

    if (workOrder.workOrderId !== undefined) updates.work_order_id = workOrder.workOrderId;
    if (workOrder.clientId !== undefined) updates.client_id = workOrder.clientId?.trim() || null;
    if (workOrder.batchId !== undefined) updates.batch_id = workOrder.batchId?.trim() || null;
    if (workOrder.status !== undefined) updates.status = workOrder.status.toLowerCase().replace(/\s+/g, '_');
    if (workOrder.startDate !== undefined) {
      const sd = workOrder.startDate;
      updates.start_date = sd ? (sd instanceof Date ? sd.toISOString().split('T')[0] : String(sd).split('T')[0] || null) : null;
    }
    if (workOrder.endDate !== undefined) {
      const ed = workOrder.endDate;
      updates.end_date = ed ? (ed instanceof Date ? ed.toISOString().split('T')[0] : String(ed).split('T')[0] || null) : null;
    }
    if (workOrder.value !== undefined) {
      updates.total_amount = parseFloat((workOrder.value || '0').replace(/[₹,]/g, '')) || 0;
    }

    // Merge description: fetch current, overlay changed fields
    const detailFields: (keyof WorkOrder)[] = [
      'clientName', 'companyName', 'customerId', 'contactPerson', 'contactEmail', 'contactPhone',
      'address', 'city', 'state', 'pincode', 'serviceDetails', 'posts',
      'locations', 'serviceInstances', 'perPostServiceInstances', 'gstPercentage', 'gstExempt',
      'rateBasis', 'basisDays',
      'documentUrl', 'clientApproval', 'clientApprovalMode', 'clientApprovalPerPost',
      'clientWoRefPerPost', 'perPostDetails', 'perPostWorkOrderIds',
      'linkedAgreementId', 'pendingAgreementUpload',
    ];
    if (workOrder.rateBasis !== undefined) {
      updates.rate_basis = workOrder.rateBasis ?? null;
      // basis_days is only meaningful for fixed_days; the DB CHECK enforces this.
      updates.basis_days =
        workOrder.rateBasis === 'fixed_days' ? workOrder.basisDays ?? null : null;
    }

    if (detailFields.some(f => workOrder[f] !== undefined)) {
      const { data: current } = await supabaseClient
        .from('work_orders')
        .select('description')
        .eq('id', id)
        .maybeSingle();

      const existing = unpackDescription(current?.description);
      updates.description = packDescription({ ...existing, ...workOrder });
    }

    const { error } = await supabaseClient
      .from('work_orders')
      .update(updates)
      .eq('id', id);

    if (error) {
      const msg = error.message || (error as any).details || (error as any).hint || 'Unknown error';
      console.error('Error updating work order:', msg, error);
      return { success: false, error: msg };
    }

    setTimeout(() => triggerWorkOrdersRefresh(), 100);
    return { success: true };
  } catch (error) {
    console.error('Error updating work order (exception):', error);
    return { success: false, error: (error as Error).message };
  }
};

// Delete a work order
export const deleteWorkOrder = async (id: string) => {
  try {
    if (!id || id.trim() === '') {
      return { success: false, error: 'Invalid work order ID' };
    }

    const { error } = await supabaseClient
      .from('work_orders')
      .delete()
      .eq('id', id);

    if (error) {
      const msg = error.message || (error as any).details || (error as any).hint || 'Unknown error';
      console.error('Error deleting work order:', msg, error);
      return { success: false, error: msg };
    }

    setTimeout(() => triggerWorkOrdersRefresh(), 100);
    return { success: true };
  } catch (error) {
    console.error('Error deleting work order (exception):', error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Split a legacy per-post work order into one real work order per post.
 *
 * Records created before the per-post model changed hold every post inside a
 * single row, with the posts' own IDs, dates, values and signed documents
 * buried in the `perPost*` maps of the description JSON. That row shows up as
 * ONE work order in every list, even though it represents several.
 *
 * This turns each post into a work order in its own right, all linked to the
 * same customer and tagged with a shared batch id:
 *
 *   before:  WO-2026-5624  (7 posts inside one row)
 *   after:   WO-2026-5624  + 6 sibling rows, one post each
 *
 * The original row is kept and becomes the first post's work order, so its uuid
 * and display ID stay valid for anything already referencing it (operational
 * posts, invoices, agreements).
 */
export const splitPerPostWorkOrder = async (id: string) => {
  try {
    const { data: row, error: fetchError } = await supabaseClient
      .from('work_orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !row) {
      return { success: false, error: fetchError?.message || 'Work order not found' };
    }

    const wo = mapRowToWorkOrder(row);
    const posts = (wo.locations?.length ? wo.locations : wo.posts) || [];

    if (posts.length < 2) {
      return { success: false, error: 'This work order only covers one post' };
    }
    if (wo.terminationData || wo.status === 'Terminated' || wo.status === 'Termination Initiated') {
      return {
        success: false,
        error: 'Work orders under termination are not split — handle them manually',
      };
    }

    const perPostDetails = wo.perPostDetails || {};
    const perPostIds = wo.perPostWorkOrderIds || {};
    const perPostApprovals = wo.clientApprovalPerPost || {};
    const perPostRefs = wo.clientWoRefPerPost || {};

    // Keep the client's total intact. Same rule the list uses to display a
    // grouped record, so splitting never changes the numbers on screen.
    const parentTotal = parseFloat((wo.value || '0').replace(/[₹,]/g, '')) || 0;
    const postValues = distributePerPostValues(parentTotal, perPostDetails, posts.length);

    const batchId = wo.batchId || (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`);

    /** Everything a single post's work order needs, derived from the parent row */
    const payloadForPost = (idx: number): Partial<WorkOrder> => {
      const post = posts[idx];
      const detail = perPostDetails[String(idx)] || {};
      const postInstances = wo.perPostServiceInstances?.[String(idx)] || wo.serviceInstances || {};
      const value = String(postValues[idx] ?? 0);

      return {
        clientId: wo.clientId,
        customerId: wo.customerId,
        batchId,
        clientName: wo.clientName,
        companyName: wo.companyName,
        clientGst: wo.clientGst,
        contactPerson: wo.contactPerson,
        contactEmail: wo.contactEmail,
        contactPhone: wo.contactPhone,
        address: wo.address,
        city: wo.city,
        state: wo.state,
        pincode: wo.pincode,
        serviceDetails: wo.serviceDetails,
        gstPercentage: wo.gstPercentage,
        gstExempt: wo.gstExempt,
        rateBasis: wo.rateBasis,
        basisDays: wo.rateBasis === 'fixed_days' ? wo.basisDays : null,
        status: wo.status,
        value: `₹${value}`,
        startDate: detail.startDate || (wo.startDate as string) || '',
        endDate: detail.endDate || (wo.endDate as string) || '',
        clientWoRef: perPostRefs[String(idx)] || '',
        clientApproval: perPostApprovals[String(idx)] || '',
        documentUrl: detail.documentUrl || '',
        posts: [wo.posts?.[idx] || post],
        locations: [post],
        serviceInstances: postInstances,
        perPostServiceInstances: { '0': postInstances },
        // Each row now holds exactly one post, so the per-post maps no longer apply
        clientApprovalMode: 'unified' as const,
        clientApprovalPerPost: {},
        clientWoRefPerPost: {},
        perPostDetails: {},
        perPostWorkOrderIds: {},
      };
    };

    const created: Array<{ id: string; workOrderId: string; postName: string }> = [];

    // Posts 2..N become new work orders
    for (let idx = 1; idx < posts.length; idx++) {
      const postName = posts[idx]?.name?.trim() || `Post ${idx + 1}`;
      // Reuse the ID this post was already shown under, if it had one
      const workOrderId = perPostIds[String(idx)] || await generateUniqueWorkOrderId();

      const result = await addWorkOrder({
        ...payloadForPost(idx),
        workOrderId,
        linkedAgreementId: wo.linkedAgreementId || '',
        linkedQuoteId: wo.linkedQuoteId || '',
        clientName: wo.clientName,
        serviceDetails: wo.serviceDetails,
        value: `₹${postValues[idx] ?? 0}`,
        status: wo.status,
      } as Omit<WorkOrder, 'id'>);

      if (!result.success || !result.id) {
        return {
          success: false,
          error: `Created ${created.length} of ${posts.length - 1} new work orders, then failed on ${postName}: ${result.error || 'save failed'}`,
          created,
        };
      }

      created.push({ id: result.id, workOrderId, postName });

      // Move that post's deployment record onto its own work order
      await supabaseClient
        .from('operational_posts')
        .update({ work_order_id: result.id })
        .eq('work_order_id', id)
        .eq('post_name', postName);
    }

    // The original row keeps its ID and becomes the first post's work order
    const retained = await updateWorkOrder(id, payloadForPost(0));
    if (!retained.success) {
      return {
        success: false,
        error: `Sibling work orders were created, but updating ${wo.workOrderId} failed: ${retained.error}`,
        created,
      };
    }

    // Force an immediate refresh so the list stops showing the original
    // multi-post record alongside the new single-post rows.
    triggerWorkOrdersRefresh();

    return { success: true, created, retainedWorkOrderId: wo.workOrderId, batchId };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};

/**
 * The work orders raised together in one pass — i.e. the siblings created when
 * a client issued a separate work order per security post.
 */
export const getWorkOrdersByBatch = async (batchId: string) => {
  try {
    if (!batchId?.trim()) return { success: true, data: [] as WorkOrder[] };

    const { data, error } = await supabaseClient
      .from('work_orders')
      .select('*')
      .eq('batch_id', batchId.trim())
      .order('work_order_id', { ascending: true });

    if (error) {
      console.error('Error getting work order batch:', error.message);
      return { success: false, error: error.message, data: [] as WorkOrder[] };
    }
    return { success: true, data: (data || []).map(mapRowToWorkOrder) };
  } catch (error) {
    return { success: false, error: (error as Error).message, data: [] as WorkOrder[] };
  }
};

/** Every work order for one customer, newest first. */
export const getWorkOrdersByClient = async (clientId: string) => {
  try {
    if (!clientId?.trim()) return { success: true, data: [] as WorkOrder[] };

    const { data, error } = await supabaseClient
      .from('work_orders')
      .select('*')
      .eq('client_id', clientId.trim())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error getting work orders by client:', error.message);
      return { success: false, error: error.message, data: [] as WorkOrder[] };
    }
    return { success: true, data: (data || []).map(mapRowToWorkOrder) };
  } catch (error) {
    return { success: false, error: (error as Error).message, data: [] as WorkOrder[] };
  }
};

// Get all work orders
export const getWorkOrders = async () => {
  try {
    const { data, error } = await supabaseClient
      .from('work_orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      const msg = error.message || (error as any).details || (error as any).hint || 'Unknown error';
      console.error('Error getting work orders:', msg, error);
      return { success: false, error: msg, data: [] };
    }

    return { success: true, data: (data || []).map(mapRowToWorkOrder) };
  } catch (error) {
    console.error('Error getting work orders (exception):', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

// Subscribe to real-time work order updates
export const subscribeToWorkOrders = (callback: (workOrders: WorkOrder[]) => void) => {
  getWorkOrders().then(result => {
    if (result.success) callback(result.data);
  });

  const channel = supabaseClient
    .channel('work_orders-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => {
      getWorkOrders().then(result => {
        if (result.success) callback(result.data);
      });
    })
    .subscribe();

  return () => {
    supabaseClient.removeChannel(channel);
  };
};
