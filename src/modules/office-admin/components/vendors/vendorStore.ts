'use client';

import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { getBranchScopeFilter } from '@/utils/branchScope';
import {
  Vendor,
  PurchaseOrder,
  PurchaseOrderItem,
  VendorCategory,
  VendorStatus,
  POStatus,
  POPriority,
} from './types';

interface VendorStoreState {
  // Data
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];
  isLoadingVendors: boolean;
  isLoadingPOs: boolean;
  error: string | null;

  // Vendor actions
  fetchVendors: (branchId: string) => Promise<void>;
  addVendor: (vendor: Omit<Vendor, 'id' | 'vendor_code' | 'created_at' | 'updated_at' | 'rating'>) => Promise<{ success: boolean; error?: string }>;
  updateVendor: (id: string, updates: Partial<Vendor>) => Promise<{ success: boolean; error?: string }>;
  deleteVendor: (id: string) => Promise<{ success: boolean; error?: string }>;

  // Purchase Order actions
  /**
   * Loads POs. Pass a branchId to scope explicitly (office-admin, which owns a
   * branch selector); omit it to fall back to the global branch scope, which is
   * what the Accounts screens use.
   */
  fetchPurchaseOrders: (branchId?: string | null) => Promise<void>;
  createPurchaseOrder: (po: {
    vendor_id?: string;
    vendor_name: string;
    vendor_category: string;
    title: string;
    description?: string;
    items: PurchaseOrderItem[];
    priority: POPriority;
    expected_delivery?: string;
    branch_id: string;
    created_by: string;
  }) => Promise<{ success: boolean; error?: string; data?: PurchaseOrder }>;
  updatePurchaseOrder: (id: string, po: {
    vendor_id?: string;
    vendor_name: string;
    vendor_category: string;
    description?: string;
    items: PurchaseOrderItem[];
    priority: POPriority;
    expected_delivery?: string;
  }) => Promise<{ success: boolean; error?: string; data?: PurchaseOrder }>;
  updatePOStatus: (id: string, status: POStatus, extra?: Record<string, any>) => Promise<{ success: boolean; error?: string }>;
  revokePOApproval: (id: string) => Promise<{ success: boolean; error?: string }>;
  updateReceivedQuantities: (poId: string, items: { id: string; received_quantity: number }[]) => Promise<{ success: boolean; error?: string }>;
  deletePurchaseOrder: (id: string) => Promise<{ success: boolean; error?: string }>;

  // Clear error
  clearError: () => void;
}

const generateVendorCode = () => `VEN-${Date.now().toString(36).toUpperCase()}`;
const generatePONumber = () => `PO-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;

/** Postgres "column does not exist" — raised by PostgREST as 42703. */
const isUndefinedColumn = (error: any) =>
  error?.code === '42703' || /column .* does not exist/i.test(error?.message ?? '');

/**
 * Insert purchase order line items, tolerating a database where the additive
 * `inventory_item_id` column has not been applied yet.
 *
 * Without the retry, a PO could not be saved at all until the migration ran —
 * a schema change should not be able to break order entry. Once the column
 * exists the first attempt succeeds and the fallback never runs.
 */
async function insertPOItems(rows: Record<string, any>[]) {
  const first = await supabase.from('purchase_order_items').insert(rows).select();
  if (!first.error || !isUndefinedColumn(first.error)) return first;

  console.warn(
    '[vendorStore] purchase_order_items.inventory_item_id is missing — saving without the inventory link. ' +
    'Apply supabase/migrations/20260808000000_purchase_order_items_inventory_link.sql to enable it.'
  );
  const withoutLink = rows.map(({ inventory_item_id, ...rest }) => rest);
  return supabase.from('purchase_order_items').insert(withoutLink).select();
}

export const useVendorStore = create<VendorStoreState>((set, get) => ({
  vendors: [],
  purchaseOrders: [],
  isLoadingVendors: false,
  isLoadingPOs: false,
  error: null,

  clearError: () => set({ error: null }),

  // ==========================================
  // VENDOR ACTIONS
  // ==========================================
  fetchVendors: async (branchId: string) => {
    set({ isLoadingVendors: true, error: null });
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      set({ vendors: data || [], isLoadingVendors: false });
    } catch (err: any) {
      console.error('Error fetching vendors:', err);
      set({ error: err.message || 'Failed to fetch vendors', isLoadingVendors: false });
    }
  },

  addVendor: async (vendorData) => {
    try {
      const newVendor = {
        ...vendorData,
        vendor_code: generateVendorCode(),
        rating: 0,
      };

      const { data, error } = await supabase
        .from('vendors')
        .insert(newVendor)
        .select()
        .single();

      if (error) throw error;

      set(state => ({ vendors: [data, ...state.vendors] }));
      return { success: true };
    } catch (err: any) {
      console.error('Error adding vendor:', err);
      return { success: false, error: err.message || 'Failed to add vendor' };
    }
  },

  updateVendor: async (id, updates) => {
    try {
      const { data, error } = await supabase
        .from('vendors')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      set(state => ({
        vendors: state.vendors.map(v => v.id === id ? data : v),
      }));
      return { success: true };
    } catch (err: any) {
      console.error('Error updating vendor:', err);
      return { success: false, error: err.message || 'Failed to update vendor' };
    }
  },

  deleteVendor: async (id) => {
    try {
      const { error } = await supabase
        .from('vendors')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set(state => ({
        vendors: state.vendors.filter(v => v.id !== id),
      }));
      return { success: true };
    } catch (err: any) {
      console.error('Error deleting vendor:', err);
      return { success: false, error: err.message || 'Failed to delete vendor' };
    }
  },

  // ==========================================
  // PURCHASE ORDER ACTIONS
  // ==========================================
  fetchPurchaseOrders: async (branchId) => {
    set({ isLoadingPOs: true, error: null });
    try {
      // An explicit branchId wins; otherwise use the global scope, where null
      // legitimately means "all branches" for a main/HQ user.
      const scope = branchId ? [branchId] : getBranchScopeFilter();

      let query = supabase.from('purchase_orders').select('*');
      if (scope) query = query.in('branch_id', scope);

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch items for each PO
      const poIds = (data || []).map(po => po.id);
      let allItems: any[] = [];
      
      if (poIds.length > 0) {
        const { data: items, error: itemsError } = await supabase
          .from('purchase_order_items')
          .select('*')
          .in('po_id', poIds);

        if (itemsError) throw itemsError;
        allItems = items || [];
      }

      // Merge items into POs
      const purchaseOrders = (data || []).map(po => ({
        ...po,
        items: allItems.filter(item => item.po_id === po.id),
      }));

      set({ purchaseOrders, isLoadingPOs: false });
    } catch (err: any) {
      console.error('Error fetching purchase orders:', err);
      set({ error: err.message || 'Failed to fetch purchase orders', isLoadingPOs: false });
    }
  },

  createPurchaseOrder: async (poData) => {
    try {
      const totalAmount = poData.items.reduce((sum, item) => sum + item.total_price, 0);
      const taxAmount = totalAmount * 0.18; // 18% GST
      const grandTotal = totalAmount + taxAmount;

      const poRecord = {
        po_number: generatePONumber(),
        vendor_id: poData.vendor_id || null,
        vendor_name: poData.vendor_name,
        vendor_category: poData.vendor_category,
        title: poData.title,
        description: poData.description || null,
        total_amount: totalAmount,
        tax_amount: taxAmount,
        grand_total: grandTotal,
        currency: 'INR',
        status: 'draft' as POStatus,
        priority: poData.priority,
        expected_delivery: poData.expected_delivery || null,
        branch_id: poData.branch_id,
        created_by: poData.created_by,
      };

      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert(poRecord)
        .select()
        .single();

      if (poError) throw poError;

      // Insert PO items
      const itemsToInsert = poData.items.map(item => ({
        po_id: po.id,
        inventory_item_id: item.inventory_item_id || null,
        item_name: item.item_name,
        description: item.description || null,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total_price: item.total_price,
      }));

      const { data: items, error: itemsError } = await insertPOItems(itemsToInsert);
      if (itemsError) throw itemsError;

      const fullPO: PurchaseOrder = { ...po, items: items || [] };
      set(state => ({ purchaseOrders: [fullPO, ...state.purchaseOrders] }));
      return { success: true, data: fullPO };
    } catch (err: any) {
      console.error('Error creating purchase order:', err);
      return { success: false, error: err.message || 'Failed to create purchase order' };
    }
  },

  updatePurchaseOrder: async (id, poData) => {
    try {
      // Totals are always recomputed from the submitted lines — never trusted from
      // the caller — so they cannot drift away from the line items.
      const totalAmount = poData.items.reduce((sum, item) => sum + item.total_price, 0);
      const taxAmount = totalAmount * 0.18; // 18% GST, same basis as create
      const grandTotal = totalAmount + taxAmount;

      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .update({
          vendor_id: poData.vendor_id || null,
          vendor_name: poData.vendor_name,
          vendor_category: poData.vendor_category,
          description: poData.description || null,
          total_amount: totalAmount,
          tax_amount: taxAmount,
          grand_total: grandTotal,
          priority: poData.priority,
          expected_delivery: poData.expected_delivery || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (poError) throw poError;

      // Line items are replaced wholesale rather than diffed: the form always
      // submits the complete set, and patching row-by-row would silently keep
      // lines the user deleted.
      //
      // This discards received_quantity, which is safe only because editing is
      // gated to statuses before goods can be received (draft / rejected). If
      // that gate ever widens, this must become a diff.
      const { error: deleteItemsError } = await supabase
        .from('purchase_order_items')
        .delete()
        .eq('po_id', id);

      if (deleteItemsError) throw deleteItemsError;

      const itemsToInsert = poData.items.map(item => ({
        po_id: id,
        inventory_item_id: item.inventory_item_id || null,
        item_name: item.item_name,
        description: item.description || null,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total_price: item.total_price,
      }));

      const { data: items, error: itemsError } = await insertPOItems(itemsToInsert);
      if (itemsError) throw itemsError;

      const fullPO: PurchaseOrder = { ...po, items: items || [] };
      set(state => ({
        purchaseOrders: state.purchaseOrders.map(p => (p.id === id ? fullPO : p)),
      }));
      return { success: true, data: fullPO };
    } catch (err: any) {
      console.error('Error updating purchase order:', err);
      return { success: false, error: err.message || 'Failed to update purchase order' };
    }
  },

  updatePOStatus: async (id, status, extra = {}) => {
    try {
      const updates: Record<string, any> = {
        status,
        updated_at: new Date().toISOString(),
        ...extra,
      };

      // Auto-set timestamps based on status
      if (status === 'submitted') {
        updates.submitted_at = new Date().toISOString();
      } else if (status === 'approved') {
        updates.approved_at = new Date().toISOString();
      } else if (status === 'slip_generated') {
        updates.slip_generated_at = new Date().toISOString();
        updates.slip_number = `SLIP-${Date.now().toString(36).toUpperCase()}`;
      } else if (status === 'funded') {
        updates.fund_received_at = new Date().toISOString();
      } else if (status === 'received' || status === 'partially_received') {
        updates.actual_delivery = new Date().toISOString().split('T')[0];
      }

      const { data, error } = await supabase
        .from('purchase_orders')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      set(state => ({
        purchaseOrders: state.purchaseOrders.map(po =>
          po.id === id ? { ...po, ...data } : po
        ),
      }));
      return { success: true };
    } catch (err: any) {
      console.error('Error updating PO status:', err);
      return { success: false, error: err.message || 'Failed to update purchase order' };
    }
  },

  /**
   * Sends an approved PO back to the Accounts approval queue.
   *
   * Deliberately NOT routed through updatePOStatus: that helper re-stamps
   * submitted_at whenever the target status is 'submitted', which would lose the
   * original submission date the approvals table displays.
   */
  revokePOApproval: async (id) => {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .update({
          status: 'submitted' as POStatus,
          // Clear the approval stamp — keeping it would assert an approval that
          // no longer stands.
          approved_by: null,
          approved_at: null,
          // A fund slip is only meaningful for an approved PO, so any slip raised
          // off this approval is void and must be regenerated after re-approval.
          slip_number: null,
          slip_generated_by: null,
          slip_generated_at: null,
          // submitted_at is left untouched on purpose: the PO is returning to a
          // queue it already entered.
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        // Race guard: only un-approve a PO that is still pre-payment. If someone
        // confirmed payment or received goods meanwhile, the approval is part of
        // the money trail and must not be rewound.
        .in('status', ['approved', 'slip_generated'])
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return {
          success: false,
          error: 'This PO is no longer awaiting payment — its status changed (payment may already be confirmed). Refresh and check before retrying.',
        };
      }

      set(state => ({
        purchaseOrders: state.purchaseOrders.map(po =>
          po.id === id ? { ...po, ...data } : po
        ),
      }));
      return { success: true };
    } catch (err: any) {
      console.error('Error revoking PO approval:', err);
      return { success: false, error: err.message || 'Failed to undo approval' };
    }
  },

  updateReceivedQuantities: async (poId, items) => {
    try {
      // Update each item's received_quantity individually
      await Promise.all(
        items.map(({ id, received_quantity }) =>
          supabase
            .from('purchase_order_items')
            .update({ received_quantity })
            .eq('id', id)
        )
      );
      // Refresh the items in local store
      set(state => ({
        purchaseOrders: state.purchaseOrders.map(po =>
          po.id === poId
            ? {
                ...po,
                items: po.items.map(item => {
                  const updated = items.find(i => i.id === item.id);
                  return updated ? { ...item, received_quantity: updated.received_quantity } : item;
                }),
              }
            : po
        ),
      }));
      return { success: true };
    } catch (err: any) {
      console.error('Error updating received quantities:', err);
      return { success: false, error: err.message };
    }
  },

  deletePurchaseOrder: async (id) => {
    try {
      // Remove the child line items first. If the FK is declared ON DELETE
      // CASCADE this is a harmless no-op; if it is not, skipping it would either
      // fail on the constraint or leave orphaned purchase_order_items rows.
      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .delete()
        .eq('po_id', id);

      if (itemsError) throw itemsError;

      const { error } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set(state => ({
        purchaseOrders: state.purchaseOrders.filter(po => po.id !== id),
      }));
      return { success: true };
    } catch (err: any) {
      console.error('Error deleting purchase order:', err);
      return { success: false, error: err.message || 'Failed to delete purchase order' };
    }
  },
}));
