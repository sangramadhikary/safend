'use client';

import { supabaseClient } from '@/integrations/supabase/client';
import { applyBranchScope } from '@/utils/branchScope';
import { HR_CONFIG } from '@/config';

/**
 * Salary columns that actually exist on `employees`.
 *
 * The advances feature previously selected a non-existent `base_salary` column.
 * PostgREST rejects the whole request in that case, so the employee list came
 * back empty and every salary-derived guard silently no-opped. Payroll reads
 * `monthly_salary || salary`, so we mirror that here.
 */
export const EMPLOYEE_SALARY_COLUMNS = 'salary, monthly_salary';

/** Effective monthly salary for an employee row, mirroring payroll's precedence. */
export function effectiveMonthlySalary(emp: { monthly_salary?: number | null; salary?: number | null } | null | undefined): number {
  if (!emp) return 0;
  const value = Number(emp.monthly_salary) || Number(emp.salary) || 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// ── Types ────────────────────────────────────────────────────────────────
export type AdvanceType = 'LOAN' | 'JOINING_DEPOSIT' | 'SALARY_ADVANCE';
export type RecoveryMode = 'ONE_TIME' | 'EMI';
export type AdvanceStatus =
  | 'pending_approval' | 'active' | 'cleared' | 'written_off' | 'on_hold' | 'rejected';

export interface EmployeeAdvance {
  id: string;
  employee_id: string;
  employee_name: string | null;
  employee_code: string | null;
  advance_type: AdvanceType;
  principal: number;
  interest_pct: number;
  interest_amount: number;
  total_recoverable: number;
  recovery_mode: RecoveryMode;
  emi_months: number;
  installment_amount: number;
  amount_recovered: number;
  balance_outstanding: number;
  status: AdvanceStatus;
  reason: string | null;
  invoice_id: string | null;
  upfront_paid: number;
  start_date: string | null;
  expected_close_date: string | null;
  approved_by: string | null;
  approved_at: string | null;
  is_flagged: boolean;
  flag_reason: string | null;
  branch_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAdvanceInput {
  employeeId: string;
  employeeName?: string;
  employeeCode?: string;
  advanceType: AdvanceType;
  principal: number;
  interestPct?: number;        // flat rate; LOAN only
  recoveryMode: RecoveryMode;
  emiMonths?: number;
  upfrontPaid?: number;        // JOINING_DEPOSIT partial paid at joining
  reason?: string;
  branchId?: string | null;
  createdBy?: string;
  notes?: string;
}

// ── Pure calculations ──────────────────────────────────────────────────────

/** Flat interest = principal x rate% (charged once over the whole tenure, not reducing balance). */
export function computeFlatInterest(principal: number, interestPct: number): number {
  return Math.round((principal * (interestPct || 0)) / 100);
}

/**
 * Derive the recoverable schedule for an advance.
 * Deposits recover only the balance after any upfront payment. Loans recover principal + flat interest.
 */
export const MAX_EMI_MONTHS = HR_CONFIG.LOANS.ADVANCE_SALARY.MAX_EMI_MONTHS;

/** Only loans carry interest; deposits and salary advances are always 0%. */
export function interestAppliesTo(advanceType: AdvanceType): boolean {
  return advanceType === 'LOAN';
}

/** Only joining deposits can be partly settled upfront at joining. */
export function upfrontAppliesTo(advanceType: AdvanceType): boolean {
  return advanceType === 'JOINING_DEPOSIT';
}

export function deriveSchedule(input: CreateAdvanceInput) {
  const principal = Number.isFinite(input.principal) ? Math.max(0, input.principal) : 0;
  const interestAmount = interestAppliesTo(input.advanceType)
    ? computeFlatInterest(principal, input.interestPct || 0)
    : 0;
  const gross = principal + interestAmount;
  // Upfront can never exceed the gross, otherwise totalRecoverable collapses to 0
  // and the advance is created already "fully recovered".
  const upfront = upfrontAppliesTo(input.advanceType)
    ? Math.min(Math.max(0, input.upfrontPaid || 0), gross)
    : 0;
  const totalRecoverable = Math.max(0, gross - upfront);

  const requestedMonths = Number.isFinite(input.emiMonths as number) ? Number(input.emiMonths) : 1;
  const months = input.recoveryMode === 'ONE_TIME'
    ? 1
    : Math.min(MAX_EMI_MONTHS, Math.max(1, Math.floor(requestedMonths) || 1));

  // Round per-installment down and push the rounding remainder into the final
  // installment so the schedule sums exactly to totalRecoverable. Rounding every
  // installment left a few rupees stranded, keeping the advance 'active' forever.
  const installmentAmount = Math.floor(totalRecoverable / months);
  const lastInstallmentAmount = totalRecoverable - installmentAmount * (months - 1);

  return { interestAmount, totalRecoverable, months, installmentAmount, lastInstallmentAmount };
}

// ── Validation ─────────────────────────────────────────────────────────────

export type AdvanceField = 'employee' | 'principal' | 'interestPct' | 'emiMonths' | 'upfrontPaid';
export type AdvanceFieldErrors = Partial<Record<AdvanceField, string>>;

export interface ValidateAdvanceInput {
  hasEmployee: boolean;
  advanceType: AdvanceType;
  principal: number;
  interestPct: number;
  recoveryMode: RecoveryMode;
  emiMonths: number;
  upfrontPaid: number;
  /** Effective monthly salary, when known, used for exposure caps. */
  monthlySalary?: number;
}

/**
 * Validate a new advance. Pure so it can be unit-tested and reused by the form
 * to drive inline field errors and the submit-disabled state.
 */
export function validateAdvance(input: ValidateAdvanceInput): AdvanceFieldErrors {
  const errors: AdvanceFieldErrors = {};

  if (!input.hasEmployee) errors.employee = 'Select an employee.';

  if (!Number.isFinite(input.principal) || input.principal <= 0) {
    errors.principal = 'Enter an amount greater than ₹0.';
  } else if (input.monthlySalary && input.monthlySalary > 0) {
    const maxMonths = HR_CONFIG.LOANS.ADVANCE_SALARY.MAX_AMOUNT_MONTHS;
    const cap = input.monthlySalary * maxMonths;
    if (input.advanceType !== 'JOINING_DEPOSIT' && input.principal > cap) {
      errors.principal = `Exceeds ${maxMonths}x monthly salary (max ₹${Math.floor(cap).toLocaleString('en-IN')}).`;
    }
  }

  if (interestAppliesTo(input.advanceType)) {
    if (!Number.isFinite(input.interestPct) || input.interestPct < 0) {
      errors.interestPct = 'Interest cannot be negative.';
    } else if (input.interestPct > 100) {
      errors.interestPct = 'Interest cannot exceed 100%.';
    }
  }

  if (input.recoveryMode === 'EMI') {
    if (!Number.isFinite(input.emiMonths) || input.emiMonths < 1) {
      errors.emiMonths = 'Enter at least 1 month.';
    } else if (!Number.isInteger(input.emiMonths)) {
      errors.emiMonths = 'Months must be a whole number.';
    } else if (input.emiMonths > MAX_EMI_MONTHS) {
      errors.emiMonths = `Maximum ${MAX_EMI_MONTHS} months.`;
    }
  }

  if (upfrontAppliesTo(input.advanceType)) {
    if (!Number.isFinite(input.upfrontPaid) || input.upfrontPaid < 0) {
      errors.upfrontPaid = 'Cannot be negative.';
    } else if (Number.isFinite(input.principal) && input.upfrontPaid > input.principal) {
      errors.upfrontPaid = 'Cannot exceed the deposit amount.';
    }
  }

  return errors;
}

// ── CRUD ────────────────────────────────────────────────────────────────

export async function listAdvances(filters?: { status?: AdvanceStatus; type?: AdvanceType; employeeId?: string }) {
  let q = supabaseClient.from('employee_advances').select('*').order('created_at', { ascending: false });
  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.type) q = q.eq('advance_type', filters.type);
  if (filters?.employeeId) q = q.eq('employee_id', filters.employeeId);
  q = applyBranchScope(q);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as EmployeeAdvance[];
}

export async function createAdvance(input: CreateAdvanceInput) {
  const { interestAmount, totalRecoverable, months, installmentAmount } = deriveSchedule(input);
  const row = {
    employee_id: input.employeeId,
    employee_name: input.employeeName ?? null,
    employee_code: input.employeeCode ?? null,
    advance_type: input.advanceType,
    principal: input.principal,
    interest_pct: input.interestPct || 0,
    interest_amount: interestAmount,
    total_recoverable: totalRecoverable,
    recovery_mode: input.recoveryMode,
    emi_months: months,
    installment_amount: installmentAmount,
    amount_recovered: 0,
    balance_outstanding: totalRecoverable,
    status: 'pending_approval' as AdvanceStatus,
    reason: input.reason ?? null,
    upfront_paid: input.upfrontPaid || 0,
    branch_id: input.branchId ?? null,
    notes: input.notes ?? null,
    created_by: input.createdBy ?? null,
  };
  const { data, error } = await supabaseClient.from('employee_advances').insert(row).select().single();
  if (error) throw new Error(error.message);
  return data as EmployeeAdvance;
}

export async function approveAdvance(id: string, approver: string) {
  const start = new Date();
  const { data: current, error: fetchErr } = await supabaseClient
    .from('employee_advances').select('emi_months').eq('id', id).single();
  if (fetchErr) throw new Error(fetchErr.message);
  const expectedClose = new Date(start);
  expectedClose.setMonth(expectedClose.getMonth() + (current?.emi_months || 1));

  const { data, error } = await supabaseClient
    .from('employee_advances')
    .update({
      status: 'active',
      approved_by: approver,
      approved_at: start.toISOString(),
      start_date: start.toISOString().split('T')[0],
      expected_close_date: expectedClose.toISOString().split('T')[0],
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as EmployeeAdvance;
}

export async function rejectAdvance(id: string, reason: string, rejectedBy: string) {
  const { data, error } = await supabaseClient
    .from('employee_advances')
    .update({ status: 'rejected', notes: `Rejected by ${rejectedBy}: ${reason}` })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as EmployeeAdvance;
}

/**
 * Record a recovery against an advance; decrements balance and closes it when cleared.
 *
 * The recovery is clamped to the outstanding balance so a caller passing more than
 * is owed cannot inflate `amount_recovered` past `total_recoverable`. The status is
 * only advanced to 'cleared'; a non-active advance (on_hold / pending_approval) is
 * never silently flipped to 'active' by a recovery.
 */
export async function recordRecovery(id: string, amount: number) {
  const { data: adv, error: fetchErr } = await supabaseClient
    .from('employee_advances')
    .select('amount_recovered, balance_outstanding, status')
    .eq('id', id)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);

  const outstanding = adv.balance_outstanding || 0;
  const applied = Math.max(0, Math.min(Number(amount) || 0, outstanding));

  const recovered = (adv.amount_recovered || 0) + applied;
  const balance = Math.max(0, outstanding - applied);
  const status: AdvanceStatus = balance <= 0 ? 'cleared' : (adv.status as AdvanceStatus);

  const { error } = await supabaseClient
    .from('employee_advances')
    .update({ amount_recovered: recovered, balance_outstanding: balance, status })
    .eq('id', id);
  if (error) throw new Error(error.message);
  return { recovered, balance, status, applied };
}

export async function writeOffAdvance(id: string, amount: number, approver: string) {
  const { error } = await supabaseClient
    .from('employee_advances')
    .update({
      status: 'written_off',
      balance_outstanding: 0,
      notes: `Written off ₹${amount.toLocaleString()} by ${approver} (F&F shortfall)`,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Total outstanding across all active advances for an employee. */
export async function getEmployeeOutstanding(employeeId: string): Promise<number> {
  const { data, error } = await supabaseClient
    .from('employee_advances')
    .select('balance_outstanding')
    .eq('employee_id', employeeId)
    .eq('status', 'active');
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s, r) => s + (r.balance_outstanding || 0), 0);
}

/**
 * Outstanding balance plus in-flight request count per employee, for the advances
 * the current branch scope can see. Used by the create form to warn about stacking
 * a new advance on top of existing exposure.
 */
export function summariseExposure(advances: EmployeeAdvance[]) {
  const map = new Map<string, { outstanding: number; activeCount: number; pendingCount: number }>();
  for (const a of advances) {
    const entry = map.get(a.employee_id) ?? { outstanding: 0, activeCount: 0, pendingCount: 0 };
    if (a.status === 'active') {
      entry.outstanding += a.balance_outstanding || 0;
      entry.activeCount += 1;
    } else if (a.status === 'pending_approval') {
      entry.pendingCount += 1;
    }
    map.set(a.employee_id, entry);
  }
  return map;
}

/**
 * Red-flag an employee whose outstanding exceeds what their salary can realistically recover.
 * projectedRecoverable = monthly recoverable capacity x remaining EMI window.
 */
export async function evaluateFlag(id: string, outstanding: number, projectedRecoverable: number) {
  const flagged = outstanding > projectedRecoverable && projectedRecoverable >= 0;
  const { error } = await supabaseClient
    .from('employee_advances')
    .update({
      is_flagged: flagged,
      flag_reason: flagged
        ? `Outstanding ₹${outstanding.toLocaleString()} exceeds projected recoverable ₹${projectedRecoverable.toLocaleString()}`
        : null,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  return flagged;
}

/**
 * Batch risk-flag evaluation over all active advances. An advance is flagged when either:
 *  - the employee has left (terminated/inactive) with a balance still outstanding, or
 *  - the total recoverable exceeds what salary can realistically cover over the tenure
 *    (Payment of Wages Act caps recovery at 50% of monthly wages).
 * Returns the number of advances flagged.
 */
export async function reevaluateAllFlags(): Promise<number> {
  const { data: active, error } = await supabaseClient
    .from('employee_advances')
    .select('id, employee_id, balance_outstanding, emi_months')
    .eq('status', 'active');
  if (error) throw new Error(error.message);
  if (!active || active.length === 0) return 0;

  // Pull employee salary + status for the involved employees.
  const empIds = Array.from(new Set(active.map((a) => a.employee_id)));
  const { data: emps, error: empErr } = await supabaseClient
    .from('employees')
    .select(`id, status, ${EMPLOYEE_SALARY_COLUMNS}`)
    .in('id', empIds);
  // Surface the failure instead of silently treating every salary as 0, which
  // made the whole risk evaluation a no-op.
  if (empErr) throw new Error(empErr.message);
  const empMap = new Map((emps ?? []).map((e: any) => [e.id, e]));

  let flaggedCount = 0;
  for (const a of active) {
    const emp: any = empMap.get(a.employee_id);
    const salary = effectiveMonthlySalary(emp);
    const left = ['terminated', 'inactive', 'absconded'].includes((emp?.status || '').toLowerCase());
    const outstanding = a.balance_outstanding || 0;

    // Max the salary can recover over the remaining tenure at the statutory wage cap.
    const wageCapFraction = HR_CONFIG.LOANS.MAX_DEDUCTION_PCT / 100;
    const projectedRecoverable = salary > 0 ? salary * wageCapFraction * (a.emi_months || 1) : 0;
    const overExposed = salary > 0 && outstanding > projectedRecoverable;
    const flagged = outstanding > 0 && (left || overExposed);

    const reason = !flagged ? null
      : left ? `Employee has exited with ₹${outstanding.toLocaleString()} outstanding`
      : `Outstanding ₹${outstanding.toLocaleString()} exceeds recoverable capacity ₹${Math.round(projectedRecoverable).toLocaleString()}`;

    await supabaseClient
      .from('employee_advances')
      .update({ is_flagged: flagged, flag_reason: reason })
      .eq('id', a.id);
    if (flagged) flaggedCount++;
  }
  return flaggedCount;
}
