'use client';

import { emitEvent, EVENT_TYPES } from '@/hooks/useEvent';
import { v4 as uuidv4 } from 'uuid';

// Define types
export type CashAdvanceStatus = 'pending' | 'requested' | 'approved' | 'disbursed' | 'partially_settled' | 'settled' | 'rejected';

export interface CashAdvance {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  balanceAmount?: number;
  requestDate: string;
  approvalDate?: string;
  disbursementDate?: string;
  settlementDueDate?: string;
  purpose: string;
  category: string;
  status: CashAdvanceStatus;
  approvedBy?: string;
  notes?: string;
  settlements?: CashAdvanceSettlement[];
  branchId?: string;
  branchName?: string;
  receiptsAttached?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CashAdvanceSettlement {
  id: string;
  advanceId: string;
  amount: number;
  settlementDate: string;
  settledBy: string;
  notes?: string;
  attachments?: string[];
  createdAt: string;
}

interface SettleAdvanceParams {
  amount: number;
  settlementDate: string;
  settledBy: string;
  notes?: string;
  attachments?: string[];
}

interface SettleAdvanceResult {
  settlement: CashAdvanceSettlement;
  advance: CashAdvance;
}

// Mock database
let cashAdvances: CashAdvance[] = [
  {
    id: 'adv-001',
    employeeId: 'emp1',
    employeeName: 'John Smith',
    amount: 5000,
    balanceAmount: 5000,
    requestDate: '2023-05-01T00:00:00Z',
    approvalDate: '2023-05-02T00:00:00Z',
    disbursementDate: '2023-05-03T00:00:00Z',
    settlementDueDate: '2023-05-15T00:00:00Z',
    purpose: 'Site visit transportation',
    category: 'travel',
    status: 'disbursed',
    approvedBy: 'Manager1',
    notes: '',
    branchId: 'branch-001',
    branchName: 'Main Branch',
    receiptsAttached: false,
    createdAt: '2023-05-01T00:00:00Z',
    updatedAt: '2023-05-03T00:00:00Z',
  },
  {
    id: 'adv-002',
    employeeId: 'emp2',
    employeeName: 'Emma Wilson',
    amount: 8000,
    balanceAmount: 3000,
    requestDate: '2023-05-05T00:00:00Z',
    approvalDate: '2023-05-06T00:00:00Z',
    disbursementDate: '2023-05-06T00:00:00Z',
    settlementDueDate: '2023-05-20T00:00:00Z',
    purpose: 'Equipment purchase',
    category: 'supplies',
    status: 'partially_settled',
    approvedBy: 'Manager2',
    notes: '',
    settlements: [
      {
        id: 'set-001',
        advanceId: 'adv-002',
        amount: 5000,
        settlementDate: '2023-05-10T00:00:00Z',
        settledBy: 'Emma Wilson',
        notes: 'Partial settlement',
        createdAt: '2023-05-10T00:00:00Z',
      }
    ],
    branchId: 'branch-001',
    branchName: 'Main Branch',
    receiptsAttached: true,
    createdAt: '2023-05-05T00:00:00Z',
    updatedAt: '2023-05-10T00:00:00Z',
  },
  {
    id: 'adv-003',
    employeeId: 'emp3',
    employeeName: 'Michael Davis',
    amount: 3000,
    balanceAmount: 0,
    requestDate: '2023-04-28T00:00:00Z',
    approvalDate: '2023-04-29T00:00:00Z',
    disbursementDate: '2023-04-30T00:00:00Z',
    settlementDueDate: '2023-05-10T00:00:00Z',
    purpose: 'Client meeting expenses',
    category: 'operational',
    status: 'settled',
    approvedBy: 'Manager1',
    notes: '',
    settlements: [
      {
        id: 'set-002',
        advanceId: 'adv-003',
        amount: 3000,
        settlementDate: '2023-05-08T00:00:00Z',
        settledBy: 'Michael Davis',
        notes: 'Full settlement',
        createdAt: '2023-05-08T00:00:00Z',
      }
    ],
    branchId: 'branch-002',
    branchName: 'Branch 2',
    receiptsAttached: true,
    createdAt: '2023-04-28T00:00:00Z',
    updatedAt: '2023-05-08T00:00:00Z',
  }
];

// Service functions
export async function getCashAdvances(filters?: any): Promise<CashAdvance[]> {
  // In a real app, this would fetch from an API
  return Promise.resolve([...cashAdvances]);
}

export async function getCashAdvanceById(id: string): Promise<CashAdvance | null> {
  const advance = cashAdvances.find(a => a.id === id);
  return Promise.resolve(advance || null);
}

export async function createCashAdvance(data: Partial<CashAdvance>): Promise<CashAdvance> {
  const now = new Date().toISOString();
  const newAdvance: CashAdvance = {
    id: `adv-${uuidv4().substring(0, 8)}`,
    employeeId: data.employeeId || '',
    employeeName: data.employeeName || '',
    amount: data.amount || 0,
    balanceAmount: data.amount || 0,
    requestDate: data.requestDate || now,
    settlementDueDate: data.settlementDueDate,
    purpose: data.purpose || '',
    category: data.category || 'operational',
    status: 'pending',
    notes: data.notes,
    branchId: data.branchId,
    branchName: data.branchName,
    receiptsAttached: false,
    createdAt: now,
    updatedAt: now,
  };

  cashAdvances.push(newAdvance);
  
  // Emit event
  emitEvent(EVENT_TYPES.FORM_SUBMITTED, { advance: newAdvance });
  
  return Promise.resolve(newAdvance);
}

export async function approveCashAdvance(id: string, approverName: string): Promise<CashAdvance | null> {
  const advanceIndex = cashAdvances.findIndex(a => a.id === id);
  if (advanceIndex === -1) return Promise.resolve(null);

  const advance = { ...cashAdvances[advanceIndex] };
  advance.status = 'approved';
  advance.approvalDate = new Date().toISOString();
  advance.approvedBy = approverName;
  advance.updatedAt = new Date().toISOString();

  cashAdvances[advanceIndex] = advance;
  return Promise.resolve(advance);
}

export async function disburseCashAdvance(id: string): Promise<CashAdvance | null> {
  const advanceIndex = cashAdvances.findIndex(a => a.id === id);
  if (advanceIndex === -1) return Promise.resolve(null);

  const advance = { ...cashAdvances[advanceIndex] };
  advance.status = 'disbursed';
  advance.disbursementDate = new Date().toISOString();
  advance.updatedAt = new Date().toISOString();

  cashAdvances[advanceIndex] = advance;
  return Promise.resolve(advance);
}

export async function settleAdvance(id: string, params: SettleAdvanceParams): Promise<SettleAdvanceResult | null> {
  const advanceIndex = cashAdvances.findIndex(a => a.id === id);
  if (advanceIndex === -1) return Promise.resolve(null);

  const advance = { ...cashAdvances[advanceIndex] };
  
  // Calculate remaining balance
  const currentBalance = advance.balanceAmount || advance.amount;
  const newBalance = Math.max(0, currentBalance - params.amount);
  
  // Create settlement record
  const settlement: CashAdvanceSettlement = {
    id: `set-${uuidv4().substring(0, 8)}`,
    advanceId: advance.id,
    amount: params.amount,
    settlementDate: params.settlementDate,
    settledBy: params.settledBy,
    notes: params.notes,
    attachments: params.attachments,
    createdAt: new Date().toISOString(),
  };

  // Update advance
  advance.balanceAmount = newBalance;
  advance.status = newBalance === 0 ? 'settled' : 'partially_settled';
  advance.updatedAt = new Date().toISOString();
  advance.settlements = [...(advance.settlements || []), settlement];

  cashAdvances[advanceIndex] = advance;
  
  // Emit event
  emitEvent(EVENT_TYPES.FORM_SUBMITTED, { 
    advance, 
    settlement 
  });
  
  return Promise.resolve({ advance, settlement });
}

export async function getCashAdvancesByEmployeeId(employeeId: string): Promise<CashAdvance[]> {
  return Promise.resolve(cashAdvances.filter(a => a.employeeId === employeeId));
}

export async function getCashAdvancesByBranch(branchId: string): Promise<CashAdvance[]> {
  return Promise.resolve(cashAdvances.filter(a => a.branchId === branchId));
}

export function getCategorySummary(advances: CashAdvance[]): Record<string, {
  count: number;
  totalAmount: number;
  settledAmount: number;
  outstandingAmount: number;
}> {
  const summary: Record<string, {
    count: number;
    totalAmount: number;
    settledAmount: number;
    outstandingAmount: number;
  }> = {};
  
  advances.forEach(advance => {
    const category = advance.category;
    
    if (!summary[category]) {
      summary[category] = {
        count: 0,
        totalAmount: 0,
        settledAmount: 0,
        outstandingAmount: 0
      };
    }
    
    summary[category].count += 1;
    summary[category].totalAmount += advance.amount;
    
    const settledAmount = advance.amount - (advance.balanceAmount || 0);
    summary[category].settledAmount += settledAmount;
    summary[category].outstandingAmount += (advance.balanceAmount || 0);
  });
  
  return summary;
}

export async function getAdvanceSummaryByCategory(
  startDate?: string,
  endDate?: string,
  branchId?: string
): Promise<Record<string, {
  count: number;
  totalAmount: number;
  settledAmount: number;
  outstandingAmount: number;
}>> {
  const filteredAdvances = cashAdvances.filter(advance => {
    if (branchId && advance.branchId !== branchId) return false;
    if (startDate && new Date(advance.requestDate) < new Date(startDate)) return false;
    if (endDate && new Date(advance.requestDate) > new Date(endDate)) return false;
    return true;
  });
  
  return Promise.resolve(getCategorySummary(filteredAdvances));
}
