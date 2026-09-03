'use client';

/**
 * Operational Post Service - Supabase
 * Syncs posts from Quotations to Operations module
 */

import { supabaseClient } from '@/integrations/supabase/client';
import { triggerPostsRefresh } from '@/utils/dataRefresh';
import { applyBranchScope, onBranchScopeChange } from '@/utils/branchScope';
import { generatePostCodeFromLocation } from '@/utils/generatePostCode';
import {
  resolvePostServiceInstances,
  copyServiceInstancesForPost,
  countGuardsForInstances,
  deriveShiftTypeForInstances,
  hasStaffedInstances,
  buildPostConfigFingerprint,
  derivePostConfig,
} from '@/modules/shared/workOrderPostConfig';

// Re-exported so existing importers keep working and there is still exactly one
// implementation behind them.
export {
  resolvePostServiceInstances,
  copyServiceInstancesForPost,
  countGuardsForInstances,
  deriveShiftTypeForInstances,
  hasStaffedInstances,
  buildPostConfigFingerprint,
  derivePostConfig,
};

export interface SecurityService {
  serviceType: string;
  shiftType: '8H' | '12H';
  shifts: {
    day: { enabled: boolean; quantity: number; rate: number };
    afternoon: { enabled: boolean; quantity: number; rate: number };
    night: { enabled: boolean; quantity: number; rate: number };
  };
}

export type ServiceDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface ServiceInstance {
  id: string;
  shiftType: '8H' | '12H';
  /**
   * Only meaningful for the `manpower` service type. Distinguishes Driver / Cook /
   * Electrician instances that all share the single `manpower` key. Dropping this
   * collapses every manpower role into one generic designation, so it must survive
   * the work-order â†’ post sync.
   */
  manpowerRole?: string;
  shifts: {
    day: { enabled: boolean; quantity: number; rate: number };
    afternoon: { enabled: boolean; quantity: number; rate: number };
    night: { enabled: boolean; quantity: number; rate: number };
  };
  /** Calendar days this instance is active. All days assumed active when absent (backward compat). */
  serviceDays?: Record<ServiceDay, boolean>;
  assignedEmployeeId?: string; // For Operations module employee assignment
}

/** Returns the ServiceDay key ('mon'â€“'sun') for a given Date */
export function getServiceDayKey(date: Date): ServiceDay {
  return (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as ServiceDay[])[date.getDay()];
}

/** Returns true if an instance is active on the given date (defaults true when serviceDays missing) */
export function isInstanceActiveOnDate(inst: ServiceInstance, date: Date): boolean {
  if (!inst.serviceDays) return true;
  return inst.serviceDays[getServiceDayKey(date)] !== false;
}

export interface ServiceInstances {
  unarmedGuards: ServiceInstance[];
  armedGuards: ServiceInstance[];
  supervisors: ServiceInstance[];
  patrolOfficers: ServiceInstance[];
  pso: ServiceInstance[];
  bouncers: ServiceInstance[];
  manpower: ServiceInstance[];
  eventSecurity: ServiceInstance[];
  personalSecurity: ServiceInstance[];
}

export interface OperationalPost {
  id?: string;
  quotationId: string;
  workOrderId?: string;
  workOrderStatus?: string;
  postCode: string;
  postName: string;
  clientName: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  location: {
    address: string;
    city?: string;
    state?: string;
    pincode?: string;
    latitude?: number;
    longitude?: number;
  };
  totalGuards: number;
  shiftType: '8H' | '12H';
  securityServices: {
    unarmedGuards?: SecurityService;
    armedGuards?: SecurityService;
    supervisors?: SecurityService;
    patrolOfficers?: SecurityService;
    pso?: SecurityService;
    bouncers?: SecurityService;
    manpower?: SecurityService;
    eventSecurity?: SecurityService;
    personalSecurity?: SecurityService;
  };
  serviceInstances?: ServiceInstances;
  gstNumber?: string;
  gstPercentage?: number;
  gstExempt?: boolean;
  totalAmount?: string;
  status: 'active' | 'inactive' | 'pending';
  createdAt?: Date;
  updatedAt?: Date;
}

// Helper to map DB row to OperationalPost
const mapRowToPost = (row: any): OperationalPost => ({
  id: row.id,
  quotationId: row.quotation_id || '',
  workOrderId: row.work_order_id,
  workOrderStatus: row.work_order_status,
  postCode: row.post_code || '',
  postName: row.post_name || '',
  clientName: row.client_name || '',
  contactPerson: row.contact_person,
  contactEmail: row.contact_email,
  contactPhone: row.contact_phone,
  location: row.location || {},
  totalGuards: row.total_guards || 0,
  shiftType: row.shift_type || '8H',
  securityServices: row.security_services || {},
  serviceInstances: row.service_instances,
  gstNumber: row.gst_number,
  gstPercentage: row.gst_percentage,
  gstExempt: row.gst_exempt,
  totalAmount: row.total_amount,
  status: row.status || 'active',
  createdAt: row.created_at ? new Date(row.created_at) : undefined,
  updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
});

// Helper to map OperationalPost to DB row
const mapPostToRow = (post: Partial<OperationalPost>): any => {
  const row: any = {};
  if (post.quotationId !== undefined) row.quotation_id = post.quotationId;
  if (post.workOrderId !== undefined) row.work_order_id = post.workOrderId;
  if (post.workOrderStatus !== undefined) row.work_order_status = post.workOrderStatus;
  if (post.postCode !== undefined) row.post_code = post.postCode;
  if (post.postName !== undefined) row.post_name = post.postName;
  if (post.clientName !== undefined) row.client_name = post.clientName;
  if (post.contactPerson !== undefined) row.contact_person = post.contactPerson;
  if (post.contactEmail !== undefined) row.contact_email = post.contactEmail;
  if (post.contactPhone !== undefined) row.contact_phone = post.contactPhone;
  if (post.location !== undefined) row.location = post.location;
  if (post.totalGuards !== undefined) row.total_guards = post.totalGuards;
  if (post.shiftType !== undefined) row.shift_type = post.shiftType;
  if (post.securityServices !== undefined) row.security_services = post.securityServices;
  if (post.serviceInstances !== undefined) row.service_instances = post.serviceInstances;
  if (post.gstNumber !== undefined) row.gst_number = post.gstNumber;
  if (post.gstPercentage !== undefined) row.gst_percentage = post.gstPercentage;
  if (post.gstExempt !== undefined) row.gst_exempt = post.gstExempt;
  if (post.totalAmount !== undefined) row.total_amount = post.totalAmount;
  if (post.status !== undefined) row.status = post.status;
  return row;
};

export const createOperationalPost = async (post: Omit<OperationalPost, 'id'>) => {
  try {
    const row = mapPostToRow(post);
    row.status = post.status || 'active';
    
    const { data, error } = await supabaseClient
      .from('operational_posts')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      console.error('createOperationalPost: Error:', error);
      return { success: false, error: error.message };
    }
    // Trigger manual refresh with small delay to ensure DB has committed
    setTimeout(() => triggerPostsRefresh(), 100);
    return { success: true, id: data.id };
  } catch (error) {
    console.error('createOperationalPost: Error:', error);
    return { success: false, error: (error as Error).message };
  }
};

export const updateOperationalPost = async (id: string, post: Partial<OperationalPost>) => {
  try {
    const row = mapPostToRow(post);
    const { error } = await supabaseClient
      .from('operational_posts')
      .update(row)
      .eq('id', id);

    if (error) {
      console.error('Error updating operational post:', error);
      return { success: false, error: error.message };
    }
    // Trigger manual refresh with small delay to ensure DB has committed
    setTimeout(() => triggerPostsRefresh(), 100);
    return { success: true };
  } catch (error) {
    console.error('Error updating operational post:', error);
    return { success: false, error: (error as Error).message };
  }
};

export const deleteOperationalPost = async (id: string) => {
  try {
    const { error } = await supabaseClient
      .from('operational_posts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting operational post:', error);
      return { success: false, error: error.message };
    }
    // Trigger manual refresh with small delay to ensure DB has committed
    setTimeout(() => triggerPostsRefresh(), 100);
    return { success: true };
  } catch (error) {
    console.error('Error deleting operational post:', error);
    return { success: false, error: (error as Error).message };
  }
};

export const deletePostsByQuotation = async (quotationId: string) => {
  try {
    const { error } = await supabaseClient
      .from('operational_posts')
      .delete()
      .eq('quotation_id', quotationId);

    if (error) {
      console.error('Error deleting posts by quotation:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    console.error('Error deleting posts by quotation:', error);
    return { success: false, error: (error as Error).message };
  }
};

export const deletePostsByWorkOrder = async (workOrderId: string) => {
  try {
    const { error } = await supabaseClient
      .from('operational_posts')
      .delete()
      .eq('work_order_id', workOrderId);

    if (error) {
      console.error('Error deleting posts by work order:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    console.error('Error deleting posts by work order:', error);
    return { success: false, error: (error as Error).message };
  }
};

export const getOperationalPosts = async () => {
  try {
    let query = supabaseClient
      .from('operational_posts')
      .select('*')
      .order('created_at', { ascending: false });
    query = applyBranchScope(query);

    const { data, error } = await query;

    if (error) {
      const msg = error.message || (error as any).details || (error as any).hint || (error as any).code || 'Unknown error';
      console.error('Error getting operational posts:', msg);
      return { success: false, error: msg, data: [] };
    }
    return { success: true, data: (data || []).map(mapRowToPost) };
  } catch (error) {
    console.error('Error getting operational posts:', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

export const getPostsByQuotation = async (quotationId: string) => {
  try {
    const { data, error } = await supabaseClient
      .from('operational_posts')
      .select('*')
      .eq('quotation_id', quotationId);

    if (error) {
      console.error('Error getting posts by quotation:', error);
      return { success: false, error: error.message, data: [] };
    }
    return { success: true, data: (data || []).map(mapRowToPost) };
  } catch (error) {
    console.error('Error getting posts by quotation:', error);
    return { success: false, error: (error as Error).message, data: [] };
  }
};

export const subscribeToOperationalPosts = (callback: (posts: OperationalPost[]) => void) => {
  // Initial fetch
  getOperationalPosts().then(result => {
    callback(result.data || []);
  });

  // Real-time subscription
  const channel = supabaseClient
    .channel('operational-posts-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'operational_posts' }, () => {
      getOperationalPosts().then(result => {
        callback(result.data || []);
      });
    })
    .subscribe();

  // Re-fetch when the active branch changes (main user switching branches)
  const offBranch = onBranchScopeChange(() => {
    getOperationalPosts().then(result => callback(result.data || []));
  });

  return () => {
    supabaseClient.removeChannel(channel);
    offBranch();
  };
};

// Work Order -> Post configuration resolution now lives in one dependency-free
// module: src/modules/shared/workOrderPostConfig.ts (re-exported at the top of
// this file). It previously existed as divergent copies here, in invoicing and in
// the payroll salary screen -- and the copy used by this sync was the one that
// ignored perPostServiceInstances, which is what made Operations display services
// the work order never ordered.


export const syncPostsFromQuotation = async (quotation: any) => {
  return { success: true, message: 'Posts will be synced when work order is started' };
};

// NEW: Sync posts when work order is STARTED (In Progress)
/**
 * FIX #4: Added idempotency guard to prevent race conditions from double-clicks
 * or duplicate realtime events. Checks if posts already exist before delete+recreate.
 */
const _syncInProgress = new Set<string>();

export const syncPostsFromStartedWorkOrder = async (workOrder: any, quotation: any) => {
  try {
    const { id: workOrderId, linkedQuoteId, clientName, status } = workOrder;
    
    if (!workOrderId) return { success: false, error: 'Work Order ID is required' };
    if (!quotation) return { success: false, error: 'Quotation data is required' };

    // FIX #4: Idempotency guard â€” prevent concurrent executions for the same work order
    if (_syncInProgress.has(workOrderId)) {
      return { success: true, message: 'Sync already in progress for this work order' };
    }
    _syncInProgress.add(workOrderId);

    try {
      const { id: quotationId, locations: quotLocations, securityServices,
              contactPerson, contactEmail, contactPhone } = quotation;

      // Prefer work order locations (may have pinpointed lat/lng from map) over quotation locations
      const woLocations = workOrder.locations || [];
      const locations = woLocations.length > 0 ? woLocations : quotLocations;

      if (!locations || locations.length === 0) {
        return { success: true, message: 'No posts to sync' };
      }

      // Resolve each post's own configuration up front so the fingerprint below
      // compares real content rather than just how many posts exist.
      const desired = locations.map((loc: any, i: number) => {
        const postName = loc.name || `Post ${i + 1}`;
        // Single shared derivation. The fingerprint covers the NORMALISED form
        // that actually gets stored — comparing a raw resolved map against the
        // stored copy would never match, so every sync would delete and recreate
        // posts and wipe their rota assignments.
        const config = derivePostConfig(workOrder, quotation, i, postName, loc);
        return {
          loc,
          postName,
          instances: config.serviceInstances,
          totalGuards: config.totalGuards,
          shiftType: config.shiftType,
          fingerprint: config.fingerprint,
        };
      });

      // Skip only when the existing posts already match the desired configuration.
      // A count-only check meant later work-order edits never reached Operations.
      const { data: existingPosts } = await supabaseClient
        .from('operational_posts')
        .select('id, post_name, total_guards, shift_type, service_instances')
        .eq('work_order_id', workOrderId);

      if (existingPosts && existingPosts.length === locations.length) {
        const existingPrints = existingPosts
          .map((p: any) => buildPostConfigFingerprint(
            p.post_name || '', p.total_guards || 0, p.shift_type || '8H', p.service_instances || {}
          ))
          .sort();
        const desiredPrints = desired.map((d) => d.fingerprint).sort();
        if (existingPrints.join('~') === desiredPrints.join('~')) {
          return { success: true, message: 'Posts already synced' };
        }
      }

      // Delete existing posts for this work order first
      await deletePostsByWorkOrder(workOrderId);

    // Keep rates for display in Operations (read-only)
    const stripFinancialData = (services: any) => {
      if (!services) return {};
      const stripped: any = {};
      Object.entries(services).forEach(([key, service]: [string, any]) => {
        if (service && service.shifts) {
          stripped[key] = {
            serviceType: service.serviceType || key,
            shiftType: service.shiftType || '8H',
            shifts: {
              day: { 
                enabled: service.shifts.day?.enabled || false, 
                quantity: service.shifts.day?.quantity || 0,
                rate: service.shifts.day?.rate || 0  // KEEP RATES for display
              },
              afternoon: { 
                enabled: service.shifts.afternoon?.enabled || false, 
                quantity: service.shifts.afternoon?.quantity || 0,
                rate: service.shifts.afternoon?.rate || 0  // KEEP RATES for display
              },
              night: { 
                enabled: service.shifts.night?.enabled || false, 
                quantity: service.shifts.night?.quantity || 0,
                rate: service.shifts.night?.rate || 0  // KEEP RATES for display
              }
            }
          };
        }
      });
      return stripped;
    };

    for (let i = 0; i < desired.length; i++) {
      const { loc, instances, postName, totalGuards, shiftType } = desired[i];
      const postLocation = {
        address: loc.address || '',
        city: loc.city || '',
        state: loc.state || '',
        pincode: loc.pincode || '',
        latitude: loc.lat ? parseFloat(loc.lat) : undefined,
        longitude: loc.lng ? parseFloat(loc.lng) : undefined,
      };
      const operationalPost: any = {
        quotationId: quotationId || linkedQuoteId,
        workOrderId,
        workOrderStatus: status || 'In Progress',
        postCode: generatePostCodeFromLocation(i + 1, postLocation),
        postName,
        clientName: clientName || quotation.client || 'Unknown Client',
        contactPerson: contactPerson || '',
        contactEmail: contactEmail || '',
        contactPhone: contactPhone || '',
        location: postLocation,
        // This post's own requirement, not the whole contract's total.
        totalGuards,
        // Derived per post â€” a 12H post no longer inherits an 8H contract default.
        shiftType,
        status: 'active'
      };

      // `instances` is already the normalised copy used for the fingerprint.
      if (Object.keys(instances).length > 0) {
        operationalPost.serviceInstances = instances;
        operationalPost.securityServices = {};
      } else {
        operationalPost.securityServices = stripFinancialData(securityServices);
      }

      await createOperationalPost(operationalPost);
    }

    return { success: true, message: `${desired.length} post(s) synced successfully` };
    } finally {
      // FIX #4: Always release the lock
      _syncInProgress.delete(workOrderId);
    }
  } catch (error) {
    console.error('Error syncing posts from started work order:', error);
    return { success: false, error: (error as Error).message };
  }
};

export const syncPostsFromCompletedWorkOrder = async (workOrder: any, quotation: any) => {
  try {
    const { id: workOrderId, linkedQuoteId, clientName, status } = workOrder;
    
    if (!workOrderId) return { success: false, error: 'Work Order ID is required' };
    if (status !== 'Completed') return { success: false, error: 'Work order must be completed to sync posts' };
    if (!quotation) return { success: false, error: 'Quotation data is required' };
    
    const { id: quotationId, locations: quotLocations, securityServices,
            contactPerson, contactEmail, contactPhone, gstNumber, gstPercentage, 
            gstExempt, amount } = quotation;

    // Prefer work order locations (may have pinpointed lat/lng from map) over quotation locations
    const woLocations = workOrder.locations || [];
    const locations = woLocations.length > 0 ? woLocations : quotLocations;
    
    if (!locations || locations.length === 0) {
      return { success: true, message: 'No posts to sync' };
    }

    await deletePostsByWorkOrder(workOrderId);

    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      // Same per-post resolution as the in-progress sync, so a work order's
      // configuration does not change shape when it moves to Completed.
      const postName = loc.name || `Post ${i + 1}`;
      // Same shared derivation as the in-progress sync, so a work order's
      // configuration does not change shape when it moves to Completed.
      const config = derivePostConfig(workOrder, quotation, i, postName, loc);
      const instances = config.serviceInstances;
      const postLocation = {
        address: loc.address || '',
        city: loc.city || '',
        state: loc.state || '',
        pincode: loc.pincode || '',
        latitude: loc.lat ? parseFloat(loc.lat) : undefined,
        longitude: loc.lng ? parseFloat(loc.lng) : undefined,
      };
      const operationalPost: any = {
        quotationId: quotationId || linkedQuoteId,
        workOrderId,
        workOrderStatus: 'Completed',
        postCode: generatePostCodeFromLocation(i + 1, postLocation),
        postName,
        clientName: clientName || quotation.client || 'Unknown Client',
        contactPerson: contactPerson || '',
        contactEmail: contactEmail || '',
        contactPhone: contactPhone || '',
        location: postLocation,
        totalGuards: config.totalGuards,
        shiftType: config.shiftType,
        gstNumber: gstNumber || '',
        gstPercentage: gstPercentage || 18,
        gstExempt: gstExempt || false,
        totalAmount: amount || '',
        status: 'active'
      };
      
      if (instances && Object.keys(instances).length > 0) {
        operationalPost.serviceInstances = copyServiceInstancesForPost(instances);
        operationalPost.securityServices = {};
      } else {
        operationalPost.securityServices = securityServices || {};
      }

      await createOperationalPost(operationalPost);
    }

    return { success: true, message: `${locations.length} post(s) synced successfully` };
  } catch (error) {
    console.error('Error syncing posts from completed work order:', error);
    return { success: false, error: (error as Error).message };
  }
};

export const removePostsForWorkOrder = async (workOrderId: string) => {
  try {
    await deletePostsByWorkOrder(workOrderId);
    return { success: true, message: 'Posts removed successfully' };
  } catch (error) {
    console.error('Error removing posts for work order:', error);
    return { success: false, error: (error as Error).message };
  }
};
