'use client';

import { UninformedLeave, AbscondCase } from "@/modules/hr/components";
import { HR_CONFIG } from "@/config";
import { emitEvent, EVENT_TYPES } from "./EventService";
import { supabaseClient } from "@/integrations/supabase/client";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: "Planned Leave" | "Urgent Leave" | "Abscond";
  subType: "Paid" | "Unpaid";
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  requestedBy: string;
  requestDate: string;
  approvedBy?: string;
  approvedOn?: string;
  rejectionReason?: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  leaveBalance: number;
  showCauseIssued?: boolean;
  showCauseDate?: string;
  terminationIssued?: boolean;
  terminationDate?: string;
}

// ─── In-memory caches (backed by Supabase `leave_requests` table) ─────────────
// UninformedLeave and AbscondCase are operational workflow objects
// that need to survive server restarts.
let _uninformedLeaves: UninformedLeave[] | null = null;
let _abscondCases: AbscondCase[] | null = null;

async function getUninformedLeavesFromDB(): Promise<UninformedLeave[]> {
  if (_uninformedLeaves !== null) return _uninformedLeaves;
  const { data, error } = await supabaseClient
    .from('leave_requests')
    .select('*')
    .eq('leave_type', 'uninformed')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[LeaveService] Failed to load uninformed leaves:', error.message);
    _uninformedLeaves = [];
    return _uninformedLeaves;
  }

  _uninformedLeaves = (data ?? []).map((row: any) => ({
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    date: row.from_date,
    detectedBy: row.requested_by ?? 'system',
    timestamp: row.created_at,
    postId: row.post_id ?? undefined,
    branchId: row.branch_id ?? undefined,
    resolution: row.resolution ?? undefined,
    resolvedBy: row.approved_by ?? undefined,
  }));
  return _uninformedLeaves;
}

async function getAbscondCasesFromDB(): Promise<AbscondCase[]> {
  if (_abscondCases !== null) return _abscondCases;
  const { data, error } = await supabaseClient
    .from('leave_requests')
    .select('*')
    .eq('leave_type', 'Abscond')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[LeaveService] Failed to load abscond cases:', error.message);
    _abscondCases = [];
    return _abscondCases;
  }

  _abscondCases = (data ?? []).map((row: any) => ({
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    startDate: row.from_date,
    lastContact: row.last_contact_date ?? row.from_date,
    status: row.status === 'Rejected' ? 'CLOSED' : 'PENDING',
    remarks: row.reason ?? '',
    createdAt: row.created_at,
    closedAt: row.approved_on ?? undefined,
    closedBy: row.approved_by ?? undefined,
    salaryCut: row.salary_cut ?? true,
  }));
  return _abscondCases;
}

function invalidateUninformedCache() { _uninformedLeaves = null; }
function invalidateAbscondCache() { _abscondCases = null; }

// ─── Validation helpers ────────────────────────────────────────────────────────

export const validatePlannedLeave = (fromDate: string): { valid: boolean; message: string } => {
  const from = new Date(fromDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const minDate = new Date(today);
  minDate.setDate(minDate.getDate() + HR_CONFIG.LEAVE.PLANNED_LEAVE_MIN_ADVANCE_DAYS);

  if (from < minDate) {
    return {
      valid: false,
      message: `Planned leave must be applied at least ${HR_CONFIG.LEAVE.PLANNED_LEAVE_MIN_ADVANCE_DAYS} days in advance.`
    };
  }
  return { valid: true, message: '' };
};

export const getPlannedLeaveSubType = (leaveBalance: number): 'Paid' | 'Unpaid' =>
  leaveBalance > 0 ? 'Paid' : 'Unpaid';

// ─── Uninformed leave detection ────────────────────────────────────────────────

export const detectUninformedLeave = async (attendanceEvent: {
  employeeId: string;
  employeeName: string;
  date: string;
  status: string;
  postId?: string;
  branchId?: string;
}): Promise<UninformedLeave | null> => {
  if (attendanceEvent.status !== 'Absent') return null;

  // Check if an approved leave already exists for this date
  const { data: approvedLeave } = await supabaseClient
    .from('leave_requests')
    .select('id')
    .eq('employee_id', attendanceEvent.employeeId)
    .eq('status', 'Approved')
    .lte('from_date', attendanceEvent.date)
    .gte('to_date', attendanceEvent.date)
    .limit(1);

  if (approvedLeave && approvedLeave.length > 0) return null;

  const newLeave: UninformedLeave = {
    id: `UL${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
    employeeId: attendanceEvent.employeeId,
    employeeName: attendanceEvent.employeeName,
    date: attendanceEvent.date,
    detectedBy: 'system',
    timestamp: new Date().toISOString(),
    postId: attendanceEvent.postId,
    branchId: attendanceEvent.branchId,
  };

  // Persist to leave_requests table so it survives restarts
  const { error } = await supabaseClient.from('leave_requests').insert({
    id: newLeave.id,
    employee_id: newLeave.employeeId,
    employee_name: newLeave.employeeName,
    leave_type: 'uninformed',
    sub_type: 'Unpaid',
    from_date: newLeave.date,
    to_date: newLeave.date,
    days: 1,
    reason: 'Uninformed absence — auto-detected',
    status: 'Pending',
    requested_by: 'system',
    post_id: newLeave.postId ?? null,
    branch_id: newLeave.branchId ?? null,
    leave_balance: 0,
  });

  if (error) console.error('[LeaveService] detectUninformedLeave insert error:', error.message);

  invalidateUninformedCache();

  // Check if this employee should be escalated to abscond
  await checkForAbscond(attendanceEvent.employeeId);

  return newLeave;
};

export const checkForAbscond = async (employeeId: string): Promise<boolean> => {
  const leaves = await getUninformedLeavesFromDB();
  const employeeLeaves = leaves
    .filter(l => l.employeeId === employeeId && !l.resolution)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (employeeLeaves.length < HR_CONFIG.LEAVE.ABSCOND_THRESHOLD) return false;

  const latest = new Date(employeeLeaves[employeeLeaves.length - 1].date);
  const hoursDiff = (Date.now() - latest.getTime()) / (1000 * 3600);

  if (hoursDiff >= 24) {
    await escalateAbscond(employeeId, employeeLeaves);
    return true;
  }
  return false;
};

export const escalateAbscond = async (employeeId: string, leaves: UninformedLeave[]): Promise<AbscondCase | null> => {
  const cases = await getAbscondCasesFromDB();
  const existing = cases.find(c => c.employeeId === employeeId && c.status === 'PENDING');
  if (existing) return existing;

  const employeeName = leaves[0]?.employeeName ?? 'Unknown Employee';
  const startDate = leaves[0]?.date ?? new Date().toISOString().split('T')[0];
  const lastContact = new Date(new Date(startDate).getTime() - 86400000).toISOString().split('T')[0];
  const id = `ABS${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

  const newCase: AbscondCase = {
    id,
    employeeId,
    employeeName,
    startDate,
    lastContact,
    status: 'PENDING',
    remarks: 'Auto-escalated: Employee absent 24+ hours without intimation. Show-cause notice required.',
    createdAt: new Date().toISOString(),
    salaryCut: true,
  };

  const { error } = await supabaseClient.from('leave_requests').insert({
    id,
    employee_id: employeeId,
    employee_name: employeeName,
    leave_type: 'Abscond',
    sub_type: 'Unpaid',
    from_date: startDate,
    to_date: startDate,
    days: leaves.length,
    reason: newCase.remarks,
    status: 'Pending',
    requested_by: 'system',
    leave_balance: 0,
    salary_cut: true,
  });

  if (error) console.error('[LeaveService] escalateAbscond insert error:', error.message);

  invalidateAbscondCache();
  emitEvent(EVENT_TYPES.ABSCOND_CASE_CREATED, newCase);
  return newCase;
};

export const resolveUninformedLeave = async (
  leaveId: string,
  resolution: 'Regularized' | 'Converted' | 'Marked Abscond',
  resolvedBy: string
): Promise<UninformedLeave | null> => {
  const leaves = await getUninformedLeavesFromDB();
  const leaf = leaves.find(l => l.id === leaveId);
  if (!leaf) return null;

  const { error } = await supabaseClient.from('leave_requests').update({
    resolution,
    approved_by: resolvedBy,
    approved_on: new Date().toISOString(),
    status: resolution === 'Regularized' ? 'Approved' : 'Rejected',
  }).eq('id', leaveId);

  if (error) console.error('[LeaveService] resolveUninformedLeave update error:', error.message);

  if (resolution === 'Marked Abscond') {
    await escalateAbscond(leaf.employeeId, [leaf]);
  }

  invalidateUninformedCache();
  return { ...leaf, resolution, resolvedBy };
};

export const closeAbscondCase = async (caseId: string, remarks: string, closedBy: string): Promise<AbscondCase | null> => {
  const cases = await getAbscondCasesFromDB();
  const c = cases.find(x => x.id === caseId);
  if (!c) return null;

  const updatedRemarks = `${c.remarks}\n${new Date().toLocaleDateString()}: ${remarks}`;

  const { error } = await supabaseClient.from('leave_requests').update({
    status: 'Rejected',
    approved_by: closedBy,
    approved_on: new Date().toISOString(),
    reason: updatedRemarks,
  }).eq('id', caseId);

  if (error) console.error('[LeaveService] closeAbscondCase update error:', error.message);

  invalidateAbscondCache();
  return { ...c, status: 'CLOSED', closedAt: new Date().toISOString(), closedBy, remarks: updatedRemarks };
};

// ─── Read helpers ──────────────────────────────────────────────────────────────

export const getUninformedLeaves = async (): Promise<UninformedLeave[]> =>
  getUninformedLeavesFromDB();

export const getAbscondCases = async (): Promise<AbscondCase[]> =>
  getAbscondCasesFromDB();
