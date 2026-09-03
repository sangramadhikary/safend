'use client';

import { supabaseClient } from '@/integrations/supabase/client';
import { recordRecovery } from './EmployeeAdvancesService';

// ── Types ────────────────────────────────────────────────────────────────
export type DeductionType = 'STATUTORY' | 'PENALTY' | 'MESS' | 'LOAN' | 'JOINING_DEPOSIT';

// Priority: lower is recovered first when net salary can't cover everything.
export const DEDUCTION_PRIORITY: Record<DeductionType, number> = {
  STATUTORY: 10,
  PENALTY: 20,
  MESS: 30,
  LOAN: 40,
  JOINING_DEPOSIT: 40,
};

export interface ScheduledDeduction {
  type: DeductionType;
  sourceRef?: string;          // advance id / mess log id / penalty id
  label: string;
  amount: number;              // amount due this cycle
  priority: number;
}

export interface AppliedDeduction extends ScheduledDeduction {
  recovered: number;
  carriedForward: number;
}

export interface DeductionResult {
  applied: AppliedDeduction[];
  totalRecovered: number;
  netAfter: number;            // never negative (₹0 floor)
  hasCarryForward: boolean;
}

/**
 * Apply scheduled deductions against available net salary in priority order.
 * Recovers what's possible, carries the shortfall forward. Net never goes below zero.
 */
export function applyDeductionsInPriority(
  availableNet: number,
  deductions: ScheduledDeduction[]
): DeductionResult {
  const ordered = [...deductions].sort((a, b) => a.priority - b.priority);
  let remaining = Math.max(0, availableNet);
  const applied: AppliedDeduction[] = [];

  for (const d of ordered) {
    const recover = Math.min(remaining, d.amount);
    remaining -= recover;
    applied.push({
      ...d,
      recovered: recover,
      carriedForward: Math.max(0, d.amount - recover),
    });
  }

  const totalRecovered = applied.reduce((s, a) => s + a.recovered, 0);
  return {
    applied,
    totalRecovered,
    netAfter: remaining,
    hasCarryForward: applied.some((a) => a.carriedForward > 0),
  };
}

// Mess is sourced from the existing monthly mess subsystem (mess_meal_records),
// which payroll reads by date range. The priority engine takes that mess charge
// as its MESS input — no separate reconciliation is needed here.

// ── Persist recoveries after a payroll run ──────────────────────────────────

/**
 * Persist recoveries when a payroll run is paid: decrement advance balances and write
 * an audit row per deduction. Distributes each employee's recovered totals across their
 * matching advances sequentially (handles the common single-advance case exactly).
 */
export async function persistPayrollRecoveries(
  employees: any[],
  payrollRunId: string,
  cycleMonth: string
) {
  for (const emp of employees) {
    const details: { type: string; amount: number; loanId: string }[] = emp.loanDetails || [];
    let loanRemaining = emp.loanEmi || 0;          // recovered LOAN total (priority-capped)
    let depositRemaining = emp.uniformCharges || 0; // recovered JOINING_DEPOSIT total

    for (const d of details) {
      const isDeposit = d.type === 'JOINING_DEPOSIT';
      const pool = isDeposit ? depositRemaining : loanRemaining;
      const rec = Math.min(pool, d.amount || 0);
      if (rec <= 0) continue;

      await recordRecovery(d.loanId, rec);
      await supabaseClient.from('payroll_deductions').insert({
        employee_id: emp.employeeId || emp.id,
        employee_name: emp.name,
        employee_code: emp.employeeId,
        cycle_month: cycleMonth,
        deduction_type: isDeposit ? 'JOINING_DEPOSIT' : 'LOAN',
        source_ref: d.loanId,
        priority: DEDUCTION_PRIORITY[isDeposit ? 'JOINING_DEPOSIT' : 'LOAN'],
        scheduled_amount: d.amount || 0,
        recovered_amount: rec,
        carried_forward: Math.max(0, (d.amount || 0) - rec),
        status: (d.amount || 0) - rec > 0 ? 'partial' : 'recovered',
        payroll_run_id: payrollRunId,
      });

      if (isDeposit) depositRemaining -= rec; else loanRemaining -= rec;
    }
  }
}
