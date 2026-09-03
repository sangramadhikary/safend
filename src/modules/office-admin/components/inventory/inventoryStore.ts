'use client';

import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import {
  InventoryMasterItem,
  StockTransaction,
  InventoryDistribution,
  InventoryStats,
  InventoryCategory,
  StockTransactionType,
  DistributionTarget,
  DistributionStatus,
} from './types';

// Generate unique IDs
const generateId = () => crypto.randomUUID();
const generateCode = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}`;

// ==========================================
// DB <-> CLIENT MAPPING HELPERS
// ==========================================

function mapDbItemToClient(row: any): InventoryMasterItem {
  return {
    id: row.id,
    itemCode: row.item_code,
    name: row.name,
    category: row.category,
    subCategory: row.sub_category,
    description: row.description ?? undefined,
    size: row.size ?? undefined,
    color: row.color ?? undefined,
    brand: row.brand ?? undefined,
    model: row.model ?? undefined,
    serialNumber: row.serial_number ?? undefined,
    warrantyExpiry: row.warranty_expiry ?? undefined,
    unitOfMeasure: row.unit_of_measure,
    currentStock: row.current_stock,
    reorderLevel: row.reorder_level,
    maxStock: row.max_stock ?? undefined,
    purchasePrice: row.purchase_price ?? undefined,
    branch: row.branch,
    location: row.location ?? undefined,
    status: row.status,
    lastRestocked: row.last_restocked ?? undefined,
    capitalize: row.capitalize ?? undefined,
    linkedAssetId: row.linked_asset_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapClientItemToDb(item: Partial<InventoryMasterItem>): Record<string, any> {
  const map: Record<string, any> = {};
  if (item.id !== undefined) map.id = item.id;
  if (item.itemCode !== undefined) map.item_code = item.itemCode;
  if (item.name !== undefined) map.name = item.name;
  if (item.category !== undefined) map.category = item.category;
  if (item.subCategory !== undefined) map.sub_category = item.subCategory;
  if (item.description !== undefined) map.description = item.description || null;
  if (item.size !== undefined) map.size = item.size || null;
  if (item.color !== undefined) map.color = item.color || null;
  if (item.brand !== undefined) map.brand = item.brand || null;
  if (item.model !== undefined) map.model = item.model || null;
  if (item.serialNumber !== undefined) map.serial_number = item.serialNumber || null;
  if (item.warrantyExpiry !== undefined) map.warranty_expiry = item.warrantyExpiry || null;
  if (item.unitOfMeasure !== undefined) map.unit_of_measure = item.unitOfMeasure;
  if (item.currentStock !== undefined) map.current_stock = item.currentStock;
  if (item.reorderLevel !== undefined) map.reorder_level = item.reorderLevel;
  if (item.maxStock !== undefined) map.max_stock = item.maxStock || null;
  if (item.purchasePrice !== undefined) map.purchase_price = item.purchasePrice || null;
  if (item.branch !== undefined) map.branch = item.branch;
  if (item.location !== undefined) map.location = item.location || null;
  if (item.status !== undefined) map.status = item.status;
  if (item.lastRestocked !== undefined) map.last_restocked = item.lastRestocked || null;
  if (item.capitalize !== undefined) map.capitalize = item.capitalize;
  if (item.linkedAssetId !== undefined) map.linked_asset_id = item.linkedAssetId || null;
  if (item.createdAt !== undefined) map.created_at = item.createdAt;
  if (item.updatedAt !== undefined) map.updated_at = item.updatedAt;
  return map;
}

function mapDbTransactionToClient(row: any): StockTransaction {
  return {
    id: row.id,
    itemId: row.item_id,
    itemName: row.item_name,
    transactionType: row.transaction_type,
    quantity: row.quantity,
    previousStock: row.previous_stock,
    newStock: row.new_stock,
    reference: row.reference ?? undefined,
    performedBy: row.performed_by,
    notes: row.notes ?? undefined,
    branch: row.branch,
    timestamp: row.timestamp,
  };
}

function mapDbDistributionToClient(row: any): InventoryDistribution {
  return {
    id: row.id,
    distributionCode: row.distribution_code,
    itemId: row.item_id,
    itemName: row.item_name,
    itemCategory: row.item_category,
    quantity: row.quantity,
    targetType: row.target_type,
    targetId: row.target_id,
    targetName: row.target_name,
    supervisorId: row.supervisor_id ?? undefined,
    supervisorName: row.supervisor_name ?? undefined,
    eventName: row.event_name ?? undefined,
    eventStartDate: row.event_start_date ?? undefined,
    eventEndDate: row.event_end_date ?? undefined,
    status: row.status,
    condition: row.condition,
    issuedBy: row.issued_by,
    issuedDate: row.issued_date,
    returnedDate: row.returned_date ?? undefined,
    returnedCondition: row.returned_condition ?? undefined,
    expectedReturnDate: row.expected_return_date ?? undefined,
    notes: row.notes ?? undefined,
    branch: row.branch,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ==========================================
// STORE INTERFACE
// ==========================================

interface InventoryState {
  items: InventoryMasterItem[];
  transactions: StockTransaction[];
  distributions: InventoryDistribution[];
  isLoadingItems: boolean;
  isLoadingTransactions: boolean;
  isLoadingDistributions: boolean;
  error: string | null;

  fetchItems: (branch: string) => Promise<void>;
  fetchTransactions: (branch: string) => Promise<void>;
  fetchDistributions: (branch: string) => Promise<void>;

  getStats: (branch: string) => InventoryStats;
  getLowStockItems: (branch: string) => InventoryMasterItem[];
  getItemsByCategory: (branch: string, category: InventoryCategory) => InventoryMasterItem[];
  getDistributionsByTarget: (targetType: DistributionTarget, targetId: string) => InventoryDistribution[];
  getActiveDistributions: (branch: string) => InventoryDistribution[];
  getTransactionsForItem: (itemId: string) => StockTransaction[];

  addItem: (item: Omit<InventoryMasterItem, 'id' | 'itemCode' | 'createdAt' | 'updatedAt' | 'status'>) => Promise<{ success: boolean; error?: string }>;
  updateItem: (id: string, updates: Partial<InventoryMasterItem>) => Promise<{ success: boolean; error?: string }>;
  deleteItem: (id: string) => Promise<{ success: boolean; error?: string }>;

  addStock: (itemId: string, quantity: number, reference: string, performedBy: string, notes?: string) => Promise<{ success: boolean; error?: string }>;
  issueStock: (itemId: string, quantity: number, target: { type: DistributionTarget; id: string; name: string; supervisorId?: string; supervisorName?: string; eventName?: string; eventStartDate?: string; eventEndDate?: string }, performedBy: string, notes?: string) => Promise<{ success: boolean; error?: string }>;
  returnStock: (distributionId: string, quantity: number, condition: string, performedBy: string, notes?: string) => Promise<{ success: boolean; error?: string }>;

  clearError: () => void;
}

// ==========================================
// STORE IMPLEMENTATION
// ==========================================

export const useInventoryStore = create<InventoryState>((set, get) => ({
  items: [],
  transactions: [],
  distributions: [],
  isLoadingItems: false,
  isLoadingTransactions: false,
  isLoadingDistributions: false,
  error: null,

  clearError: () => set({ error: null }),

  fetchItems: async (branch: string) => {
    set({ isLoadingItems: true, error: null });
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('branch', branch)
        .order('created_at', { ascending: false });
      if (error) throw error;
      set({ items: (data || []).map(mapDbItemToClient), isLoadingItems: false });
    } catch (err: any) {
      console.error('Error fetching inventory items:', err);
      set({ error: err.message || 'Failed to fetch inventory items', isLoadingItems: false });
    }
  },

  fetchTransactions: async (branch: string) => {
    set({ isLoadingTransactions: true, error: null });
    try {
      const { data, error } = await supabase
        .from('stock_transactions')
        .select('*')
        .eq('branch', branch)
        .order('timestamp', { ascending: false });
      if (error) throw error;
      set({ transactions: (data || []).map(mapDbTransactionToClient), isLoadingTransactions: false });
    } catch (err: any) {
      console.error('Error fetching stock transactions:', err);
      set({ error: err.message || 'Failed to fetch transactions', isLoadingTransactions: false });
    }
  },

  fetchDistributions: async (branch: string) => {
    set({ isLoadingDistributions: true, error: null });
    try {
      const { data, error } = await supabase
        .from('inventory_distributions')
        .select('*')
        .eq('branch', branch)
        .order('created_at', { ascending: false });
      if (error) throw error;
      set({ distributions: (data || []).map(mapDbDistributionToClient), isLoadingDistributions: false });
    } catch (err: any) {
      console.error('Error fetching distributions:', err);
      set({ error: err.message || 'Failed to fetch distributions', isLoadingDistributions: false });
    }
  },

  getStats: (branch: string) => {
    const state = get();
    const branchItems = state.items.filter(i => i.branch === branch);
    const activeDistributions = state.distributions.filter(d => d.branch === branch && d.status === 'active');
    const eventDists = activeDistributions.filter(d => d.targetType === 'event');
    return {
      totalItems: branchItems.length,
      totalStock: branchItems.reduce((sum, i) => sum + i.currentStock, 0),
      lowStockItems: branchItems.filter(i => i.currentStock <= i.reorderLevel && i.currentStock > 0).length,
      outOfStockItems: branchItems.filter(i => i.currentStock === 0).length,
      totalDistributed: activeDistributions.reduce((sum, d) => sum + d.quantity, 0),
      pendingReturns: activeDistributions.filter(d => d.expectedReturnDate).length,
      activeEventKits: eventDists.length,
      totalValue: branchItems.reduce((sum, i) => sum + (i.currentStock * (i.purchasePrice || 0)), 0),
    };
  },

  getLowStockItems: (branch: string) => get().items.filter(i => i.branch === branch && i.currentStock <= i.reorderLevel),
  getItemsByCategory: (branch: string, category: InventoryCategory) => get().items.filter(i => i.branch === branch && i.category === category),
  getDistributionsByTarget: (targetType: DistributionTarget, targetId: string) => get().distributions.filter(d => d.targetType === targetType && d.targetId === targetId),
  getActiveDistributions: (branch: string) => get().distributions.filter(d => d.branch === branch && d.status === 'active'),
  getTransactionsForItem: (itemId: string) => get().transactions.filter(t => t.itemId === itemId),

  addItem: async (itemData) => {
    try {
      const prefix = itemData.category === 'uniforms' ? 'UNI' : itemData.category === 'tools' ? 'TL' : 'SP';
      const now = new Date().toISOString();
      const newItem: InventoryMasterItem = { ...itemData, id: generateId(), itemCode: generateCode(prefix), status: 'active', createdAt: now, updatedAt: now };
      const dbRow = mapClientItemToDb(newItem);
      const { data, error } = await supabase.from('inventory_items').insert(dbRow).select().single();
      if (error) throw error;
      set(state => ({ items: [mapDbItemToClient(data), ...state.items] }));
      return { success: true };
    } catch (err: any) {
      console.error('Error adding inventory item:', err);
      return { success: false, error: err.message };
    }
  },

  updateItem: async (id, updates) => {
    try {
      const dbUpdates = mapClientItemToDb({ ...updates, updatedAt: new Date().toISOString() });
      const { data, error } = await supabase.from('inventory_items').update(dbUpdates).eq('id', id).select().single();
      if (error) throw error;
      set(state => ({ items: state.items.map(item => item.id === id ? mapDbItemToClient(data) : item) }));
      return { success: true };
    } catch (err: any) {
      console.error('Error updating inventory item:', err);
      return { success: false, error: err.message };
    }
  },

  deleteItem: async (id) => {
    try {
      const item = get().items.find(i => i.id === id);
      if (item?.capitalize && item.linkedAssetId) {
        import('@/services/inventory/capitalizeAsset')
          .then(({ disposeLinkedAsset }) => disposeLinkedAsset(item.linkedAssetId!, 'Inventory item deleted'))
          .catch(() => {});
      }
      const { error } = await supabase.from('inventory_items').delete().eq('id', id);
      if (error) throw error;
      set(state => ({ items: state.items.filter(item => item.id !== id) }));
      return { success: true };
    } catch (err: any) {
      console.error('Error deleting inventory item:', err);
      return { success: false, error: err.message };
    }
  },

  addStock: async (itemId, quantity, reference, performedBy, notes) => {
    try {
      const item = get().items.find(i => i.id === itemId);
      if (!item) throw new Error('Item not found');
      const newStock = item.currentStock + quantity;
      const now = new Date().toISOString();

      const { error: updateError } = await supabase.from('inventory_items').update({ current_stock: newStock, last_restocked: now, updated_at: now }).eq('id', itemId);
      if (updateError) throw updateError;

      const txnRow = { id: generateId(), item_id: itemId, item_name: item.name, transaction_type: 'purchase', quantity, previous_stock: item.currentStock, new_stock: newStock, reference, performed_by: performedBy, notes: notes ?? null, branch: item.branch, timestamp: now };
      const { data: txnData, error: txnError } = await supabase.from('stock_transactions').insert(txnRow).select().single();
      if (txnError) throw txnError;

      set(state => ({
        items: state.items.map(i => i.id === itemId ? { ...i, currentStock: newStock, lastRestocked: now, updatedAt: now } : i),
        transactions: [mapDbTransactionToClient(txnData), ...state.transactions],
      }));
      return { success: true };
    } catch (err: any) {
      console.error('Error adding stock:', err);
      return { success: false, error: err.message };
    }
  },

  issueStock: async (itemId, quantity, target, performedBy, notes) => {
    try {
      const item = get().items.find(i => i.id === itemId);
      if (!item) throw new Error('Item not found');
      if (item.currentStock < quantity) throw new Error('Insufficient stock');
      const newStock = item.currentStock - quantity;
      const now = new Date().toISOString();
      const distCode = generateCode('DIST');
      const txnType: StockTransactionType = target.type === 'event' ? 'event_allocation' : 'issue';

      const { error: updateError } = await supabase.from('inventory_items').update({ current_stock: newStock, updated_at: now }).eq('id', itemId);
      if (updateError) throw updateError;

      const txnRow = { id: generateId(), item_id: itemId, item_name: item.name, transaction_type: txnType, quantity: -quantity, previous_stock: item.currentStock, new_stock: newStock, reference: distCode, performed_by: performedBy, notes: notes ?? null, branch: item.branch, timestamp: now };
      const { data: txnData, error: txnError } = await supabase.from('stock_transactions').insert(txnRow).select().single();
      if (txnError) throw txnError;

      const distRow = { id: generateId(), distribution_code: distCode, item_id: itemId, item_name: item.name, item_category: item.category, quantity, target_type: target.type, target_id: target.id, target_name: target.name, supervisor_id: target.supervisorId ?? null, supervisor_name: target.supervisorName ?? null, event_name: target.eventName ?? null, event_start_date: target.eventStartDate ?? null, event_end_date: target.eventEndDate ?? null, expected_return_date: target.eventEndDate ?? null, status: 'active', condition: 'new', issued_by: performedBy, issued_date: now.split('T')[0], notes: notes ?? null, branch: item.branch, created_at: now, updated_at: now };
      const { data: distData, error: distError } = await supabase.from('inventory_distributions').insert(distRow).select().single();
      if (distError) throw distError;

      set(state => ({
        items: state.items.map(i => i.id === itemId ? { ...i, currentStock: newStock, updatedAt: now } : i),
        transactions: [mapDbTransactionToClient(txnData), ...state.transactions],
        distributions: [mapDbDistributionToClient(distData), ...state.distributions],
      }));
      return { success: true };
    } catch (err: any) {
      console.error('Error issuing stock:', err);
      return { success: false, error: err.message };
    }
  },

  returnStock: async (distributionId, quantity, condition, performedBy, notes) => {
    try {
      const dist = get().distributions.find(d => d.id === distributionId);
      if (!dist) throw new Error('Distribution not found');
      const item = get().items.find(i => i.id === dist.itemId);
      if (!item) throw new Error('Item not found');
      const newStock = item.currentStock + quantity;
      const now = new Date().toISOString();
      const txnType: StockTransactionType = dist.targetType === 'event' ? 'event_recall' : 'return';

      const { error: updateError } = await supabase.from('inventory_items').update({ current_stock: newStock, updated_at: now }).eq('id', dist.itemId);
      if (updateError) throw updateError;

      const txnRow = { id: generateId(), item_id: dist.itemId, item_name: dist.itemName, transaction_type: txnType, quantity, previous_stock: item.currentStock, new_stock: newStock, reference: dist.distributionCode, performed_by: performedBy, notes: notes ?? null, branch: item.branch, timestamp: now };
      const { data: txnData, error: txnError } = await supabase.from('stock_transactions').insert(txnRow).select().single();
      if (txnError) throw txnError;

      const { data: distData, error: distError } = await supabase.from('inventory_distributions').update({ status: 'returned', returned_date: now.split('T')[0], returned_condition: condition, updated_at: now }).eq('id', distributionId).select().single();
      if (distError) throw distError;

      set(state => ({
        items: state.items.map(i => i.id === dist.itemId ? { ...i, currentStock: newStock, updatedAt: now } : i),
        transactions: [mapDbTransactionToClient(txnData), ...state.transactions],
        distributions: state.distributions.map(d => d.id === distributionId ? mapDbDistributionToClient(distData) : d),
      }));
      return { success: true };
    } catch (err: any) {
      console.error('Error returning stock:', err);
      return { success: false, error: err.message };
    }
  },
}));
