'use client';

import { emitEvent, EVENT_TYPES } from "./EventService";
import { supabaseClient } from "@/integrations/supabase/client";
import { auditActions } from "@/utils/auditLog";

export type RequestStatus = 'DRAFT' | 'SENT_TO_ACCOUNTS' | 'APPROVED_BY_ACCOUNTS' | 'REJECTED_BY_ACCOUNTS' | 'PROCESSING' | 'COMPLETED';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface SalaryPaymentRequest {
  id: string;
  employeeIds: string[];
  department?: string;
  totalAmount: number;
  requestDate: string;
  requestedBy: string;
  description: string;
  month: string;
  year: string;
  status: RequestStatus;
  sentToAccountsOn?: string;
  accountsApprovedOn?: string;
  accountsApprovedBy?: string;
  accountsRejectedOn?: string;
  accountsRejectedBy?: string;
  rejectionReason?: string;
  processedOn?: string;
  paymentReference?: string;
  employeeDetails?: EmployeeSalaryDetail[];
  heldSalaries?: HeldSalaryRecord[];
}

export interface EmployeeSalaryDetail {
  employeeId: string;
  employeeName: string;
  amount: number;
  attendedShifts: number;
  totalShifts: number;
  deductions: SalaryDeduction[];
  netSalary: number;
  status: 'READY_TO_PAY' | 'HELD' | 'PAID';
  holdReason?: string;
}

export interface SalaryDeduction {
  type: 'PF' | 'ESI' | 'PT' | 'TDS' | 'LOAN' | 'MESS' | 'OTHER';
  description: string;
  amount: number;
  reference?: string;
}

export interface HeldSalaryRecord {
  employeeId: string;
  employeeName: string;
  amount: number;
  reason: string;
  heldBy: string;
  heldOn: string;
  resolved?: boolean;
  resolvedOn?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
}

// ─── In-memory cache (populated from Supabase on first read) ─────────────────
// This avoids a full DB round-trip on every function call while ensuring
// data survives server restarts (primary source of truth is payroll_requests table).
let _cache: SalaryPaymentRequest[] | null = null;

async function getCache(): Promise<SalaryPaymentRequest[]> {
  if (_cache !== null) return _cache;
  const { data, error } = await supabaseClient
    .from('payroll_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[PayrollService] Failed to load from DB, using empty cache:', error.message);
    _cache = [];
    return _cache;
  }

  // Map snake_case DB columns back to camelCase TS interface
  _cache = (data ?? []).map(row => ({
    id: row.id,
    employeeIds: row.employee_ids ?? [],
    department: row.department ?? undefined,
    totalAmount: Number(row.total_amount),
    requestDate: row.request_date,
    requestedBy: row.requested_by,
    description: row.description ?? '',
    month: row.month,
    year: row.year,
    status: row.status as RequestStatus,
    sentToAccountsOn: row.sent_to_accounts_on ?? undefined,
    accountsApprovedOn: row.accounts_approved_on ?? undefined,
    accountsApprovedBy: row.accounts_approved_by ?? undefined,
    accountsRejectedOn: row.accounts_rejected_on ?? undefined,
    accountsRejectedBy: row.accounts_rejected_by ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    processedOn: row.processed_on ?? undefined,
    paymentReference: row.payment_reference ?? undefined,
    employeeDetails: row.employee_details ?? undefined,
  }));
  return _cache;
}

function invalidateCache() {
  _cache = null;
}

// ─── ID generator ─────────────────────────────────────────────────────────────
const generateRequestId = () =>
  `SALARY-REQ-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

// ─── CRUD operations ──────────────────────────────────────────────────────────

export const createSalaryPaymentRequest = async (
  requestData: Omit<SalaryPaymentRequest, 'id' | 'status' | 'requestDate'>
): Promise<SalaryPaymentRequest> => {
  const newRequest: SalaryPaymentRequest = {
    id: generateRequestId(),
    status: 'DRAFT',
    requestDate: new Date().toISOString(), // UI display only; DB uses server-side created_at
    ...requestData,
  };

  const { error } = await supabaseClient.from('payroll_requests').insert({
    id: newRequest.id,
    employee_ids: newRequest.employeeIds,
    department: newRequest.department ?? null,
    total_amount: newRequest.totalAmount,
    // request_date uses DB default now() — not client time
    requested_by: newRequest.requestedBy,
    description: newRequest.description,
    month: newRequest.month,
    year: newRequest.year,
    status: newRequest.status,
    employee_details: newRequest.employeeDetails ?? null,
  });

  if (error) {
    console.error('[PayrollService] createSalaryPaymentRequest DB error:', error.message);
  }

  // Every payroll mutation in this service already holds both the prior request
  // and the updated one, so the audit diff comes free — no extra read needed.
  void auditActions.payrollGenerated(
    `${newRequest.month} ${newRequest.year}`,
    newRequest.employeeIds?.length ?? 0,
    {
      requestId: newRequest.id,
      totalAmount: newRequest.totalAmount,
      department: newRequest.department,
      requestedBy: newRequest.requestedBy,
    }
  );

  invalidateCache();
  emitEvent(EVENT_TYPES.SALARY_PAYMENT_REQUESTED, newRequest);
  return newRequest;
};

export const submitSalaryRequestToAccounts = async (requestId: string): Promise<SalaryPaymentRequest | null> => {
  const cache = await getCache();
  const req = cache.find(r => r.id === requestId);
  if (!req || req.status !== 'DRAFT') return null;

  const updated: SalaryPaymentRequest = {
    ...req,
    status: 'SENT_TO_ACCOUNTS',
    sentToAccountsOn: new Date().toISOString(), // UI display; DB trigger sets authoritative value
  };

  const { error } = await supabaseClient.from('payroll_requests').update({
    status: updated.status,
    // sent_to_accounts_on set by DB trigger (trg_payroll_requests_updated_at)
  }).eq('id', requestId);

  if (error) console.error('[PayrollService] submitSalaryRequestToAccounts DB error:', error.message);

  void auditActions.payrollTransition('hr.payroll.submit', requestId, req, updated, {
    totalAmount: updated.totalAmount,
    employeeCount: updated.employeeIds?.length ?? 0,
    period: `${updated.month} ${updated.year}`,
  });

  invalidateCache();
  return updated;
};

export const approveSalaryRequestByAccounts = async (requestId: string, approver: string): Promise<SalaryPaymentRequest | null> => {
  const cache = await getCache();
  const req = cache.find(r => r.id === requestId);
  if (!req || req.status !== 'SENT_TO_ACCOUNTS') return null;

  const updated: SalaryPaymentRequest = {
    ...req,
    status: 'APPROVED_BY_ACCOUNTS',
    accountsApprovedOn: new Date().toISOString(), // UI display; DB trigger sets authoritative value
    accountsApprovedBy: approver,
  };

  const { error } = await supabaseClient.from('payroll_requests').update({
    status: updated.status,
    // accounts_approved_on set by DB trigger
    accounts_approved_by: updated.accountsApprovedBy,
  }).eq('id', requestId);

  if (error) console.error('[PayrollService] approveSalaryRequest DB error:', error.message);

  void auditActions.payrollTransition('hr.payroll.approve', requestId, req, updated, {
    approver,
    totalAmount: updated.totalAmount,
    employeeCount: updated.employeeIds?.length ?? 0,
    period: `${updated.month} ${updated.year}`,
  });

  invalidateCache();
  emitEvent(EVENT_TYPES.SALARY_PAYMENT_APPROVED, updated);
  return updated;
};

export const rejectSalaryRequestByAccounts = async (requestId: string, reason: string, rejectedBy: string): Promise<SalaryPaymentRequest | null> => {
  const cache = await getCache();
  const req = cache.find(r => r.id === requestId);
  if (!req || req.status !== 'SENT_TO_ACCOUNTS') return null;

  const updated: SalaryPaymentRequest = {
    ...req,
    status: 'REJECTED_BY_ACCOUNTS',
    accountsRejectedOn: new Date().toISOString(), // UI display; DB trigger sets authoritative value
    accountsRejectedBy: rejectedBy,
    rejectionReason: reason,
  };

  const { error } = await supabaseClient.from('payroll_requests').update({
    status: updated.status,
    // accounts_rejected_on set by DB trigger
    accounts_rejected_by: updated.accountsRejectedBy,
    rejection_reason: updated.rejectionReason,
  }).eq('id', requestId);

  if (error) console.error('[PayrollService] rejectSalaryRequest DB error:', error.message);

  void auditActions.payrollTransition('hr.payroll.reject', requestId, req, updated, {
    rejectedBy,
    reason,
    totalAmount: updated.totalAmount,
    period: `${updated.month} ${updated.year}`,
  });

  invalidateCache();
  emitEvent(EVENT_TYPES.SALARY_PAYMENT_REJECTED, updated);
  return updated;
};

export const markSalaryPaymentAsProcessed = async (requestId: string, paymentReference: string): Promise<SalaryPaymentRequest | null> => {
  const cache = await getCache();
  const req = cache.find(r => r.id === requestId);
  if (!req || req.status !== 'APPROVED_BY_ACCOUNTS') return null;

  const updated: SalaryPaymentRequest = {
    ...req,
    status: 'COMPLETED',
    processedOn: new Date().toISOString(), // UI display; DB trigger sets authoritative value
    paymentReference,
  };

  const { error } = await supabaseClient.from('payroll_requests').update({
    status: updated.status,
    // processed_on set by DB trigger
    payment_reference: updated.paymentReference,
  }).eq('id', requestId);

  if (error) console.error('[PayrollService] markProcessed DB error:', error.message);

  void auditActions.payrollTransition('hr.payroll.process', requestId, req, updated, {
    paymentReference,
    totalAmount: updated.totalAmount,
    employeeCount: updated.employeeIds?.length ?? 0,
    period: `${updated.month} ${updated.year}`,
  });

  invalidateCache();
  return updated;
};

export const holdEmployeeSalary = async (requestId: string, employeeId: string, reason: string, heldBy: string): Promise<SalaryPaymentRequest | null> => {
  const cache = await getCache();
  const req = cache.find(r => r.id === requestId);
  if (!req?.employeeDetails) return null;

  const empIdx = req.employeeDetails.findIndex(e => e.employeeId === employeeId);
  if (empIdx === -1) return null;

  const emp = req.employeeDetails[empIdx];
  const heldRecord: HeldSalaryRecord = {
    employeeId,
    employeeName: emp.employeeName,
    amount: emp.netSalary,
    reason,
    heldBy,
    heldOn: new Date().toISOString(),
    resolved: false,
  };

  const updatedDetails = [...req.employeeDetails];
  updatedDetails[empIdx] = { ...emp, status: 'HELD', holdReason: reason };

  const updatedHeld = [...(req.heldSalaries ?? []), heldRecord];
  const updated: SalaryPaymentRequest = {
    ...req,
    employeeDetails: updatedDetails,
    heldSalaries: updatedHeld,
  };

  // Persist the updated employee_details JSONB and insert into held_salaries table
  const [updateRes, insertRes] = await Promise.all([
    supabaseClient.from('payroll_requests').update({
      employee_details: updatedDetails,
    }).eq('id', requestId),
    supabaseClient.from('held_salaries').insert({
      employee_id: employeeId,
      employee_name: emp.employeeName,
      amount: emp.netSalary,
      reason,
      held_by: heldBy,
      held_on: heldRecord.heldOn,
    }),
  ]);

  if (updateRes.error) console.error('[PayrollService] holdEmployee update error:', updateRes.error.message);
  if (insertRes.error) console.error('[PayrollService] holdEmployee insert error:', insertRes.error.message);

  // Diffed at the single employee's detail record rather than the whole request:
  // the request object carries every employee in the run, so diffing it wholesale
  // would bury the one person whose pay was withheld among dozens of unchanged
  // entries.
  void auditActions.payrollTransition(
    'hr.salary.hold',
    requestId,
    { employee: emp },
    { employee: updatedDetails[empIdx] },
    { employeeId, employeeName: emp.employeeName, amount: emp.netSalary, reason, heldBy }
  );

  invalidateCache();
  return updated;
};

export const resolveHeldSalary = async (requestId: string, employeeId: string, resolutionNotes: string, resolvedBy: string): Promise<SalaryPaymentRequest | null> => {
  const cache = await getCache();
  const req = cache.find(r => r.id === requestId);
  if (!req?.heldSalaries || !req.employeeDetails) return null;

  const heldIdx = req.heldSalaries.findIndex(h => h.employeeId === employeeId && !h.resolved);
  if (heldIdx === -1) return null;

  const updatedHeld = [...req.heldSalaries];
  updatedHeld[heldIdx] = {
    ...updatedHeld[heldIdx],
    resolved: true,
    resolvedOn: new Date().toISOString(),
    resolvedBy,
    resolutionNotes,
  };

  const empIdx = req.employeeDetails.findIndex(e => e.employeeId === employeeId);
  const updatedDetails = [...req.employeeDetails];
  if (empIdx !== -1) {
    updatedDetails[empIdx] = { ...updatedDetails[empIdx], status: 'READY_TO_PAY', holdReason: undefined };
  }

  const updated: SalaryPaymentRequest = { ...req, heldSalaries: updatedHeld, employeeDetails: updatedDetails };

  const { error } = await supabaseClient.from('payroll_requests').update({
    employee_details: updatedDetails,
  }).eq('id', requestId);

  if (error) console.error('[PayrollService] resolveHeld DB error:', error.message);

  void auditActions.payrollTransition(
    'hr.salary.hold.release',
    requestId,
    { held: req.heldSalaries[heldIdx] },
    { held: updatedHeld[heldIdx] },
    {
      employeeId,
      employeeName: updatedHeld[heldIdx].employeeName,
      amount: updatedHeld[heldIdx].amount,
      resolutionNotes,
      resolvedBy,
    }
  );

  invalidateCache();
  return updated;
};

// ─── Calculation (pure, no DB) ────────────────────────────────────────────────

export const calculateSalary = (
  _employeeId: string,
  baseSalary: number,
  attendedShifts: number,
  totalShifts: number,
  deductions: SalaryDeduction[]
) => {
  const attendanceMultiplier = totalShifts > 0 ? attendedShifts / totalShifts : 0;
  const salaryAfterAttendance = baseSalary * attendanceMultiplier;
  const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
  const netSalary = Math.max(0, salaryAfterAttendance - totalDeductions);
  return { baseSalary, attendedShifts, totalShifts, attendanceMultiplier, salaryAfterAttendance, deductions, totalDeductions, netSalary };
};

// ─── Read helpers ─────────────────────────────────────────────────────────────

export const getAllSalaryPaymentRequests = async (): Promise<SalaryPaymentRequest[]> => {
  return getCache();
};

export const getSalaryPaymentRequestById = async (id: string): Promise<SalaryPaymentRequest | null> => {
  const cache = await getCache();
  return cache.find(r => r.id === id) ?? null;
};

export const getSalaryPaymentRequestsByStatus = async (status: RequestStatus): Promise<SalaryPaymentRequest[]> => {
  const cache = await getCache();
  return cache.filter(r => r.status === status);
};

export const getAllHeldSalaries = async (): Promise<HeldSalaryRecord[]> => {
  const cache = await getCache();
  return cache.flatMap(r => (r.heldSalaries ?? []).filter(h => !h.resolved));
};
