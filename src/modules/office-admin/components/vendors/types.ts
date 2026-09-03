// ==========================================
// VENDOR & PURCHASE MANAGEMENT TYPES
// ==========================================

export type VendorCategory =
  | 'digital_services'
  | 'inventory_restock'
  | 'property_owner'
  | 'equipment_supplier'
  | 'uniform_supplier'
  | 'maintenance_services'
  | 'transport'
  | 'food_catering'
  | 'stationery'
  | 'utilities'
  | 'other';

export type VendorStatus = 'active' | 'inactive' | 'blacklisted';

export type POStatus =
  | 'draft'
  | 'submitted'
  | 'pending_approval'
  | 'approved'
  | 'slip_generated'
  | 'funded'
  | 'ordered'
  | 'partially_received'
  | 'received'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export type POPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Vendor {
  id: string;
  vendor_code: string;
  name: string;
  category: VendorCategory;
  contact_person: string;
  phone: string;
  alt_phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gst_number?: string;
  pan_number?: string;
  bank_name?: string;
  bank_account?: string;
  ifsc_code?: string;
  // Property owner fields
  property_type?: string;
  rent_amount?: number;
  lease_start?: string;
  lease_end?: string;
  // Digital service fields
  service_type?: string;
  subscription_amount?: number;
  billing_cycle?: string;
  // Warehouse / pickup address
  warehouse_address?: string;
  warehouse_city?: string;
  warehouse_state?: string;
  warehouse_pincode?: string;
  warehouse_contact_person?: string;
  warehouse_phone?: string;
  // Common
  rating: number;
  status: VendorStatus;
  notes?: string;
  branch_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id?: string;
  po_id?: string;
  /**
   * Inventory item this line restocks, when it was picked from inventory.
   *
   * Without it, crediting stock on receipt has to fall back to matching the
   * composite `item_name` label, which breaks the moment an item is renamed or
   * two items share a label. Optional because the column is additive — see
   * supabase/migrations/20260808000000_purchase_order_items_inventory_link.sql.
   */
  inventory_item_id?: string | null;
  item_name: string;
  description?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  received_quantity?: number;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_id?: string;
  vendor_name: string;
  vendor_category: string;
  title: string;
  description?: string;
  items: PurchaseOrderItem[];
  total_amount: number;
  tax_amount: number;
  grand_total: number;
  currency: string;
  status: POStatus;
  // Workflow
  submitted_by?: string;
  submitted_at?: string;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  // Fund slip
  slip_number?: string;
  slip_generated_by?: string;
  slip_generated_at?: string;
  fund_received_at?: string;
  // Delivery
  expected_delivery?: string;
  actual_delivery?: string;
  delivery_notes?: string;
  // Invoice
  invoice_number?: string;
  invoice_date?: string;
  invoice_url?: string;
  // Goods received per line item is tracked via received_quantity on PurchaseOrderItem
  // Meta
  priority: POPriority;
  branch_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// Category display labels
export const VENDOR_CATEGORY_LABELS: Record<VendorCategory, string> = {
  digital_services: 'Digital Services',
  inventory_restock: 'Inventory Restock',
  property_owner: 'Property Owner',
  equipment_supplier: 'Equipment Supplier',
  uniform_supplier: 'Uniform Supplier',
  maintenance_services: 'Maintenance Services',
  transport: 'Transport',
  food_catering: 'Food & Catering',
  stationery: 'Stationery',
  utilities: 'Utilities',
  other: 'Other',
};

export const PO_STATUS_LABELS: Record<POStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  slip_generated: 'Slip Generated',
  funded: 'Funded',
  ordered: 'Ordered',
  partially_received: 'Partially Received',
  received: 'Received',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  blacklisted: 'Blacklisted',
};
