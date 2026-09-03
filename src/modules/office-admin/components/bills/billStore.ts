'use client';

import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import {
  RecurringBill,
  BillPayment,
  BillCategory,
  BillFrequency,
  BillStatus,
  PaymentStatus,
} from './types';
import { addMonths, addDays, format, isBefore, isToday, startOfDay } from 'date-fns';

interface BillStoreState {
  // Data
  bills: RecurringBill[];
  payments: BillPayment[];
  isLoadingBills: boolean;
  isLoadingPayments: boolean;
  error: string | null;

  // Bill actions
  fetchBills: (branchId: string) => Promise<void>;
  addBill: (bill: Omit<RecurringBill, 'id' | 'bill_code' | 'created_at' | 'updated_at'>) => Promise<{ success: boolean; error?: string }>;
  updateBill: (id: string, updates: Partial<RecurringBill>) => Promise<{ success: boolean; error?: string }>;
  deleteBill: (id: string) => Promise<{ success: boolean; error?: string }>;
  toggleBillStatus: (id: string, status: BillStatus) => Promise<{ success: boolean; error?: string }>;

  // Payment actions
  fetchPayments: (branchId: string) => Promise<void>;
  markAsPaid: (paymentId: string, data: {
    paid_amount: number;
    payment_date: string;
    payment_method: string;
    payment_reference?: string;
    marked_by: string;
    /** Additional columns to write to the bill_payments row (e.g. utility breakdown). */
    extra?: Record<string, unknown>;
  }) => Promise<{ success: boolean; error?: string }>;
  generateUpcomingPayments: (branchId: string) => Promise<{ success: boolean; count: number; error?: string }>;

  // Computed
  getOverdueBills: () => BillPayment[];
  getUpcomingPayments: (days?: number) => BillPayment[];
  getMonthlyTotal: () => number;
  getBillStats: () => { active: number; paused: number; totalMonthly: number; overdue: number; dueThisWeek: number };

  // Clear
  clearError: () => void;
}

const generateBillCode = () => `BILL-${Date.now().toString(36).toUpperCase()}`;
const generatePaymentCode = () => `PAY-${Date.now().toString(36).toUpperCase()}`;

function getNextDueDate(currentDue: string, frequency: BillFrequency): string {
  const date = new Date(currentDue);
  switch (frequency) {
    case 'monthly': return format(addMonths(date, 1), 'yyyy-MM-dd');
    case 'quarterly': return format(addMonths(date, 3), 'yyyy-MM-dd');
    case 'half_yearly': return format(addMonths(date, 6), 'yyyy-MM-dd');
    case 'yearly': return format(addMonths(date, 12), 'yyyy-MM-dd');
    default: return format(addMonths(date, 1), 'yyyy-MM-dd');
  }
}

function getPeriodLabel(dueDate: string, frequency: BillFrequency): string {
  const date = new Date(dueDate);
  switch (frequency) {
    case 'monthly': return format(date, 'MMMM yyyy');
    case 'quarterly': {
      const q = Math.ceil((date.getMonth() + 1) / 3);
      return `Q${q} ${date.getFullYear()}`;
    }
    case 'half_yearly': {
      const h = date.getMonth() < 6 ? 'H1' : 'H2';
      return `${h} ${date.getFullYear()}`;
    }
    case 'yearly': return `${date.getFullYear()}`;
    default: return format(date, 'MMMM yyyy');
  }
}

export const useBillStore = create<BillStoreState>((set, get) => ({
  bills: [],
  payments: [],
  isLoadingBills: false,
  isLoadingPayments: false,
  error: null,

  clearError: () => set({ error: null }),

  // ==========================================
  // BILL ACTIONS
  // ==========================================
  fetchBills: async (branchId: string) => {
    set({ isLoadingBills: true, error: null });
    try {
      const { data, error } = await supabase
        .from('recurring_bills')
        .select('*')
        .eq('branch_id', branchId)
        .order('next_due_date', { ascending: true });

      if (error) throw error;
      set({ bills: data || [], isLoadingBills: false });
    } catch (err: any) {
      console.error('Error fetching bills:', err);
      set({ error: err.message || 'Failed to fetch bills', isLoadingBills: false });
    }
  },

  addBill: async (billData) => {
    try {
      const newBill = {
        ...billData,
        bill_code: generateBillCode(),
      };

      const { data, error } = await supabase
        .from('recurring_bills')
        .insert(newBill)
        .select()
        .single();

      if (error) throw error;

      set(state => ({ bills: [...state.bills, data].sort((a, b) => 
        new Date(a.next_due_date).getTime() - new Date(b.next_due_date).getTime()
      )}));
      return { success: true };
    } catch (err: any) {
      console.error('Error adding bill:', err);
      return { success: false, error: err.message || 'Failed to add bill' };
    }
  },

  updateBill: async (id, updates) => {
    try {
      const { data, error } = await supabase
        .from('recurring_bills')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      set(state => ({
        bills: state.bills.map(b => b.id === id ? data : b),
      }));
      return { success: true };
    } catch (err: any) {
      console.error('Error updating bill:', err);
      return { success: false, error: err.message || 'Failed to update bill' };
    }
  },

  deleteBill: async (id) => {
    try {
      const { error } = await supabase
        .from('recurring_bills')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set(state => ({
        bills: state.bills.filter(b => b.id !== id),
        payments: state.payments.filter(p => p.bill_id !== id),
      }));
      return { success: true };
    } catch (err: any) {
      console.error('Error deleting bill:', err);
      return { success: false, error: err.message || 'Failed to delete bill' };
    }
  },

  toggleBillStatus: async (id, status) => {
    try {
      const { data, error } = await supabase
        .from('recurring_bills')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      set(state => ({
        bills: state.bills.map(b => b.id === id ? data : b),
      }));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update status' };
    }
  },

  // ==========================================
  // PAYMENT ACTIONS
  // ==========================================
  fetchPayments: async (branchId: string) => {
    set({ isLoadingPayments: true, error: null });
    try {
      const { data, error } = await supabase
        .from('bill_payments')
        .select('*')
        .eq('branch_id', branchId)
        .order('due_date', { ascending: true });

      if (error) throw error;
      set({ payments: data || [], isLoadingPayments: false });
    } catch (err: any) {
      console.error('Error fetching payments:', err);
      set({ error: err.message || 'Failed to fetch payments', isLoadingPayments: false });
    }
  },

  markAsPaid: async (paymentId, data) => {
    try {
      const payment = get().payments.find(p => p.id === paymentId);
      if (!payment) throw new Error('Payment not found');

      const isPaidFull = data.paid_amount >= payment.total_amount;

      const { data: updated, error } = await supabase
        .from('bill_payments')
        .update({
          paid_amount: data.paid_amount,
          payment_date: data.payment_date,
          payment_method: data.payment_method,
          payment_reference: data.payment_reference || null,
          marked_by: data.marked_by,
          status: isPaidFull ? 'paid' : 'partially_paid',
          updated_at: new Date().toISOString(),
          // Spread any additional columns (utility breakdown, property_id, etc.)
          ...(data.extra ?? {}),
        })
        .eq('id', paymentId)
        .select()
        .single();

      if (error) throw error;

      // If fully paid, advance the bill's next_due_date
      if (isPaidFull && payment.bill_id) {
        const bill = get().bills.find(b => b.id === payment.bill_id);
        if (bill && bill.status === 'active') {
          const nextDue = getNextDueDate(bill.next_due_date, bill.frequency);
          await supabase
            .from('recurring_bills')
            .update({ next_due_date: nextDue, updated_at: new Date().toISOString() })
            .eq('id', bill.id);

          set(state => ({
            bills: state.bills.map(b => b.id === bill.id ? { ...b, next_due_date: nextDue } : b),
          }));
        }
      }

      set(state => ({
        payments: state.payments.map(p => p.id === paymentId ? updated : p),
      }));
      return { success: true };
    } catch (err: any) {
      console.error('Error marking payment:', err);
      return { success: false, error: err.message || 'Failed to mark payment' };
    }
  },

  generateUpcomingPayments: async (branchId: string) => {
    try {
      const bills = get().bills.filter(b => b.status === 'active' && b.branch_id === branchId);
      const existingPayments = get().payments;
      let count = 0;

      for (const bill of bills) {
        // In-memory guard (fast path — avoids a DB round-trip when the store is warm)
        const existsInMemory = existingPayments.some(
          p => p.bill_id === bill.id && p.due_date === bill.next_due_date
        );
        if (existsInMemory) continue;

        // DB-level guard — covers the race where two components both call
        // generateUpcomingPayments before either has fetched the new row into
        // the store (e.g. ProcurementModule + FacilityBookingsList both mount
        // and call fetchBills independently, each triggering this function).
        const { data: existing } = await supabase
          .from('bill_payments')
          .select('id')
          .eq('bill_id', bill.id)
          .eq('due_date', bill.next_due_date)
          .maybeSingle();

        if (existing) {
          // Row already in DB but not in the store — add it without another insert
          if (!existingPayments.some(p => p.id === existing.id)) {
            const { data: row } = await supabase
              .from('bill_payments')
              .select('*')
              .eq('id', existing.id)
              .maybeSingle();
            if (row) set(state => ({ payments: [...state.payments, row] }));
          }
          continue;
        }

        const taxAmount = bill.amount * (bill.tax_percentage / 100);
        const totalAmount = bill.amount + taxAmount;

        const paymentRecord = {
          bill_id: bill.id,
          payment_code: generatePaymentCode(),
          period_label: getPeriodLabel(bill.next_due_date, bill.frequency),
          due_date: bill.next_due_date,
          amount: bill.amount,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          late_fee: 0,
          paid_amount: 0,
          status: 'upcoming' as PaymentStatus,
          branch_id: branchId,
        };

        const { data, error } = await supabase
          .from('bill_payments')
          .insert(paymentRecord)
          .select()
          .single();

        if (error) {
          // 23505 = unique_violation on bill_payments_bill_due_unique.
          //
          // The checks above narrow the window but cannot close it — the two rows
          // this constraint was added to prevent were inserted 400 microseconds
          // apart, well inside a network round-trip. Losing this race is the
          // correct outcome, not a failure: it means a concurrent caller already
          // created the row. Adopt theirs and move on.
          if (error.code === '23505') {
            const { data: winner } = await supabase
              .from('bill_payments')
              .select('*')
              .eq('bill_id', bill.id)
              .eq('due_date', bill.next_due_date)
              .maybeSingle();
            if (winner) {
              set(state => (
                state.payments.some(p => p.id === winner.id)
                  ? state
                  : { payments: [...state.payments, winner] }
              ));
            }
            continue;
          }
          console.error('Error generating payment for bill', bill.id, error.message);
          continue;
        }

        if (data) {
          set(state => ({ payments: [...state.payments, data] }));
          count++;
        }
      }

      return { success: true, count };
    } catch (err: any) {
      return { success: false, count: 0, error: err.message };
    }
  },

  // ==========================================
  // COMPUTED
  // ==========================================
  getOverdueBills: () => {
    const today = startOfDay(new Date());
    return get().payments.filter(p =>
      (p.status === 'upcoming' || p.status === 'due') &&
      isBefore(new Date(p.due_date), today)
    );
  },

  getUpcomingPayments: (days = 30) => {
    const today = startOfDay(new Date());
    const futureDate = addDays(today, days);
    return get().payments.filter(p =>
      (p.status === 'upcoming' || p.status === 'due') &&
      !isBefore(new Date(p.due_date), today) &&
      isBefore(new Date(p.due_date), futureDate)
    );
  },

  getMonthlyTotal: () => {
    const bills = get().bills.filter(b => b.status === 'active');
    return bills.reduce((sum, bill) => {
      switch (bill.frequency) {
        case 'monthly': return sum + bill.total_amount;
        case 'quarterly': return sum + (bill.total_amount / 3);
        case 'half_yearly': return sum + (bill.total_amount / 6);
        case 'yearly': return sum + (bill.total_amount / 12);
        default: return sum + bill.total_amount;
      }
    }, 0);
  },

  getBillStats: () => {
    const state = get();
    const today = startOfDay(new Date());
    const weekFromNow = addDays(today, 7);

    const activeBills = state.bills.filter(b => b.status === 'active');
    const pausedBills = state.bills.filter(b => b.status === 'paused');
    const overdue = state.payments.filter(p =>
      (p.status === 'upcoming' || p.status === 'due' || p.status === 'overdue') &&
      isBefore(new Date(p.due_date), today)
    );
    const dueThisWeek = state.payments.filter(p =>
      (p.status === 'upcoming' || p.status === 'due') &&
      !isBefore(new Date(p.due_date), today) &&
      isBefore(new Date(p.due_date), weekFromNow)
    );

    return {
      active: activeBills.length,
      paused: pausedBills.length,
      totalMonthly: state.getMonthlyTotal(),
      overdue: overdue.length,
      dueThisWeek: dueThisWeek.length,
    };
  },
}));
