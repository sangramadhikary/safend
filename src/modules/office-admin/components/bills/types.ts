// ==========================================
// BILLS & SUBSCRIPTIONS TYPES
// ==========================================

export type BillCategory =
  | 'rent'
  | 'utility'
  | 'subscription'
  | 'equipment_rental'
  | 'service'
  | 'insurance'
  | 'license'
  | 'maintenance'
  | 'other';

export type BillFrequency = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';

export type BillStatus = 'active' | 'paused' | 'expired' | 'cancelled';

export type PaymentStatus = 'upcoming' | 'due' | 'overdue' | 'paid' | 'partially_paid' | 'waived';

export interface RecurringBill {
  id: string;
  bill_code: string;
  name: string;
  description?: string;
  category: BillCategory;
  vendor_id?: string;
  vendor_name: string;
  frequency: BillFrequency;
  amount: number;
  tax_percentage: number;
  total_amount: number;
  currency: string;
  billing_day?: number;
  start_date: string;
  end_date?: string;
  next_due_date: string;
  payment_method?: string;
  account_head?: string;
  status: BillStatus;
  auto_remind: boolean;
  remind_days_before: number;
  notes?: string;
  branch_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BillPayment {
  id: string;
  bill_id: string;
  payment_code: string;
  period_label: string;
  due_date: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  late_fee: number;
  paid_amount: number;
  payment_date?: string;
  payment_method?: string;
  payment_reference?: string;
  status: PaymentStatus;
  notes?: string;
  receipt_url?: string;
  branch_id: string;
  marked_by?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  bill_name?: string;
  bill_category?: string;
  vendor_name?: string;
}

// Display labels
export const BILL_CATEGORY_LABELS: Record<BillCategory, string> = {
  rent: 'Rent',
  utility: 'Utility',
  subscription: 'Subscription',
  equipment_rental: 'Equipment Rental',
  service: 'Service',
  insurance: 'Insurance',
  license: 'License/Permit',
  maintenance: 'Maintenance',
  other: 'Other',
};

export const BILL_FREQUENCY_LABELS: Record<BillFrequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half Yearly (6 months)',
  yearly: 'Yearly',
};

export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  upcoming: 'Upcoming',
  due: 'Due',
  overdue: 'Overdue',
  paid: 'Paid',
  partially_paid: 'Partially Paid',
  waived: 'Waived',
};

export const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer (NEFT/RTGS)' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'auto_debit', label: 'Auto Debit' },
  { value: 'card', label: 'Credit/Debit Card' },
];
