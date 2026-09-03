'use client';

// ==========================================
// INVENTORY TYPES FOR SECURITY SERVICE COMPANY
// ==========================================

// Main inventory categories
export type InventoryCategory = 'uniforms' | 'tools' | 'special_items';

// Sub-categories for uniforms
export type UniformType =
  | 'shirt' | 'pant' | 'safari' | 't-shirt' | 'sweater'
  | 'jacket' | 'raincoat' | 'cap' | 'shoes' | 'belt'
  | 'whistle' | 'lanyard' | 'id_card_holder' | 'id_card_lanyard';

// Sub-categories for tools
export type ToolType = 
  | 'walkie_talkie' | 'torch' | 'lathi' | 'pepper_spray' 
  | 'metal_detector' | 'uvs' | 'baton' | 'handcuffs' | 'other_tool';

// Sub-categories for special items
export type SpecialItemType = 
  | 'event_uniform' | 'decoration_kit' | 'event_kit' | 'ceremonial_item' | 'other_special';

// Sizes for uniforms. Values cover apparel, safari/pant waists, shoe sizes,
// accessory sizes, and the free-size option used by non-garment items.
export type UniformSize =
  | 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'XXXL'
  | '4XL' | '5XL' | '6XL' | '7XL' | '8XL' | '9XL'
  | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13'
  | '26' | '28' | '30' | '32' | '34' | '36' | '38' | '40' | '42'
  | '44' | '46' | '48' | '50' | '52' | '54' | '56' | '58' | '60'
  | 'FREE';

// Named real-world colours commonly used for security uniforms and accessories.
export type UniformColor =
  | 'white' | 'black' | 'navy_blue' | 'royal_blue' | 'sky_blue'
  | 'khaki' | 'beige' | 'grey' | 'olive_green' | 'dark_green'
  | 'maroon' | 'brown' | 'red' | 'orange' | 'yellow';

// Item condition
export type ItemCondition = 'new' | 'good' | 'fair' | 'worn' | 'damaged' | 'discarded';

// Distribution target type
export type DistributionTarget = 'employee' | 'post' | 'event';

// Distribution status
export type DistributionStatus = 'issued' | 'active' | 'returned' | 'lost' | 'damaged' | 'recalled';

// Stock transaction type
export type StockTransactionType = 'purchase' | 'issue' | 'return' | 'damage' | 'adjustment' | 'transfer' | 'event_allocation' | 'event_recall';

// ==========================================
// INTERFACES
// ==========================================

// Master inventory item (defines what items exist)
export interface InventoryMasterItem {
  id: string;
  itemCode: string;
  name: string;
  category: InventoryCategory;
  subCategory: UniformType | ToolType | SpecialItemType;
  description?: string;
  // Uniform-specific fields
  size?: UniformSize;
  color?: UniformColor;
  // Tool-specific fields
  brand?: string;
  model?: string;
  serialNumber?: string;
  warrantyExpiry?: string;
  // Common fields
  unitOfMeasure: string;
  currentStock: number;
  reorderLevel: number;
  maxStock?: number;
  purchasePrice?: number;
  branch: string;
  location?: string; // storage location within branch
  status: 'active' | 'discontinued' | 'out_of_stock';
  lastRestocked?: string;
  createdAt: string;
  updatedAt: string;
  /** Set true when this durable item has been capitalized to the fixed-asset register */
  capitalize?: boolean;
  /** Id of the linked fixed_assets row when capitalized (null/undefined if not) */
  linkedAssetId?: string;
}

// Stock transaction record
export interface StockTransaction {
  id: string;
  itemId: string;
  itemName: string;
  transactionType: StockTransactionType;
  quantity: number; // positive for in, negative for out
  previousStock: number;
  newStock: number;
  reference?: string; // PO number, distribution ID, etc.
  performedBy: string;
  notes?: string;
  branch: string;
  timestamp: string;
}

// Distribution record (tracking who has what)
export interface InventoryDistribution {
  id: string;
  distributionCode: string;
  itemId: string;
  itemName: string;
  itemCategory: InventoryCategory;
  quantity: number;
  // Target info
  targetType: DistributionTarget;
  targetId: string;
  targetName: string;
  // For post distributions
  supervisorId?: string;
  supervisorName?: string;
  // For event distributions
  eventName?: string;
  eventStartDate?: string;
  eventEndDate?: string;
  // Status tracking
  status: DistributionStatus;
  condition: ItemCondition;
  issuedBy: string;
  issuedDate: string;
  returnedDate?: string;
  returnedCondition?: ItemCondition;
  expectedReturnDate?: string;
  // Additional
  notes?: string;
  branch: string;
  createdAt: string;
  updatedAt: string;
}

// Purchase order
export interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendorId?: string;
  vendorName: string;
  items: PurchaseOrderItem[];
  totalAmount: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'ordered' | 'partially_received' | 'received' | 'cancelled';
  orderDate: string;
  expectedDelivery?: string;
  receivedDate?: string;
  notes?: string;
  branch: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  receivedQuantity?: number;
}

// Employee inventory summary
export interface EmployeeInventorySummary {
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  designation?: string;
  post?: string;
  totalItemsIssued: number;
  activeItems: InventoryDistribution[];
  returnedItems: InventoryDistribution[];
  lostItems: InventoryDistribution[];
}

// Post inventory summary
export interface PostInventorySummary {
  postId: string;
  postName: string;
  clientName?: string;
  supervisorId: string;
  supervisorName: string;
  totalItemsAssigned: number;
  activeItems: InventoryDistribution[];
  returnedItems: InventoryDistribution[];
}

// Event kit allocation
export interface EventKitAllocation {
  id: string;
  eventName: string;
  eventDate: string;
  eventEndDate: string;
  allocatedTo: string; // employee name
  allocatedToId: string;
  items: InventoryDistribution[];
  status: 'allocated' | 'active' | 'recalled' | 'partially_returned';
  recallDate?: string;
  notes?: string;
}

// Dashboard stats
export interface InventoryStats {
  totalItems: number;
  totalStock: number;
  lowStockItems: number;
  outOfStockItems: number;
  totalDistributed: number;
  pendingReturns: number;
  activeEventKits: number;
  totalValue: number;
}

// Category display info
export const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  uniforms: 'Uniforms',
  tools: 'Tools & Equipment',
  special_items: 'Special Items'
};

export const SUB_CATEGORY_LABELS: Record<string, string> = {
  // Uniforms
  shirt: 'Shirt',
  pant: 'Pant',
  safari: 'Safari Suit',
  't-shirt': 'T-Shirt',
  sweater: 'Sweater',
  jacket: 'Jacket',
  raincoat: 'Rain Coat',
  cap: 'Cap',
  shoes: 'Shoes',
  belt: 'Belt',
  whistle: 'Whistle',
  lanyard: 'Lanyard',
  id_card_holder: 'ID Card Holder',
  id_card_lanyard: 'ID Card Lanyard',
  // Tools
  walkie_talkie: 'Walkie Talkie',
  torch: 'Torch',
  lathi: 'Lathi/Baton',
  pepper_spray: 'Pepper Spray',
  metal_detector: 'Metal Detector',
  uvs: 'UVS Machine',
  baton: 'Baton',
  handcuffs: 'Handcuffs',
  other_tool: 'Other Tool',
  // Special Items
  event_uniform: 'Event Uniform',
  decoration_kit: 'Decoration Kit',
  event_kit: 'Event Kit',
  ceremonial_item: 'Ceremonial Item',
  other_special: 'Other Special Item'
};

export const UNIFORM_TYPES: UniformType[] = [
  'shirt', 'pant', 'safari', 't-shirt', 'sweater', 'jacket',
  'raincoat', 'cap', 'shoes', 'belt', 'whistle', 'lanyard',
  'id_card_holder', 'id_card_lanyard',
];

export type UniformSizeOption = { value: UniformSize; label: string };

const APPAREL_SIZE_OPTIONS: UniformSizeOption[] = [
  { value: 'XXS', label: 'XXS (30 chest)' },
  { value: '32', label: '32 (chest)' },
  { value: '34', label: '34 (chest)' },
  { value: 'XS', label: 'XS (36 chest)' },
  { value: 'S', label: 'S (38 chest)' },
  { value: 'M', label: 'M (40 chest)' },
  { value: 'L', label: 'L (42 chest)' },
  { value: 'XL', label: 'XL (44 chest)' },
  { value: 'XXL', label: 'XXL (46 chest)' },
  { value: 'XXXL', label: 'XXXL (48 chest)' },
  { value: '4XL', label: '4XL (50 chest)' },
  { value: '5XL', label: '5XL (52 chest)' },
  { value: '6XL', label: '6XL (54 chest)' },
  { value: '7XL', label: '7XL (56 chest)' },
  { value: '8XL', label: '8XL (58 chest)' },
  { value: '9XL', label: '9XL (60 chest)' },
];

const WAIST_SIZE_OPTIONS: UniformSizeOption[] = [
  '26', '28', '30', '32', '34', '36', '38', '40', '42', '44', '46',
  '48', '50', '52', '54', '56', '58', '60',
].map(value => ({ value: value as UniformSize, label: value }));

const SHOE_SIZE_OPTIONS: UniformSizeOption[] = [
  '4', '5', '6', '7', '8', '9', '10', '11', '12', '13',
].map(value => ({ value: value as UniformSize, label: `UK ${value}` }));

/** Size choices tailored to each uniform type, reused by Add and Edit forms. */
export function getUniformSizeOptions(type: string): UniformSizeOption[] {
  switch (type) {
    case 'shirt':
    case 't-shirt':
    case 'sweater':
    case 'jacket':
    case 'raincoat':
      return APPAREL_SIZE_OPTIONS;
    case 'safari':
    case 'pant':
      // Safari suits are commonly ordered by numeric suit/waist size. This
      // deliberately includes 32, which was previously unavailable.
      return WAIST_SIZE_OPTIONS;
    case 'shoes':
      return SHOE_SIZE_OPTIONS;
    case 'cap':
      return [
        { value: 'S', label: 'Small (54 cm)' }, { value: 'M', label: 'Medium (56 cm)' },
        { value: 'L', label: 'Large (58 cm)' }, { value: 'XL', label: 'XL (60 cm)' },
        { value: 'XXL', label: 'XXL (62 cm)' }, { value: 'FREE', label: 'Adjustable / free size' },
      ];
    case 'belt':
      return [
        ...WAIST_SIZE_OPTIONS.filter(option => Number(option.value) <= 52),
        { value: 'FREE', label: 'Adjustable / free size' },
      ];
    case 'whistle':
    case 'lanyard':
    case 'id_card_holder':
    case 'id_card_lanyard':
      return [{ value: 'FREE', label: 'Free size' }];
    default:
      return APPAREL_SIZE_OPTIONS;
  }
}

// Kept for consumers that need a flat list rather than type-specific sizes.
export const SIZE_OPTIONS: UniformSize[] = [
  'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL', '5XL', '6XL', '7XL', '8XL', '9XL',
  '4', '5', '6', '7', '8', '9', '10', '11', '12', '13',
  '26', '28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56', '58', '60', 'FREE',
];

export const COLOR_OPTIONS: { value: UniformColor; label: string; hex: string }[] = [
  { value: 'white', label: 'White', hex: '#FFFFFF' },
  { value: 'black', label: 'Black', hex: '#111827' },
  { value: 'navy_blue', label: 'Navy Blue', hex: '#1E3A8A' },
  { value: 'royal_blue', label: 'Royal Blue', hex: '#2563EB' },
  { value: 'sky_blue', label: 'Sky Blue', hex: '#38BDF8' },
  { value: 'khaki', label: 'Khaki', hex: '#C3B091' },
  { value: 'beige', label: 'Beige', hex: '#E8D7B9' },
  { value: 'grey', label: 'Grey', hex: '#6B7280' },
  { value: 'olive_green', label: 'Olive Green', hex: '#556B2F' },
  { value: 'dark_green', label: 'Dark Green', hex: '#166534' },
  { value: 'maroon', label: 'Maroon', hex: '#800020' },
  { value: 'brown', label: 'Brown', hex: '#7C3F00' },
  { value: 'red', label: 'Red', hex: '#DC2626' },
  { value: 'orange', label: 'Orange', hex: '#EA580C' },
  { value: 'yellow', label: 'Yellow', hex: '#EAB308' },
];
