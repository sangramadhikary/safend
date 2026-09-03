'use client';

import { supabaseClient } from '@/integrations/supabase/client';

// ── Types ────────────────────────────────────────────────────────────────

export interface AccumulatedSalaryResult {
  accumulatedSalary: number;
  totalWorkingDays: number;
  daysWorked: number;
  monthlySalary: number;
  dailyRate: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Get the first day of the given month as YYYY-MM-DD.
 */
function getMonthStart(month: Date): string {
  const y = month.getFullYear();
  const m = String(month.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/**
 * Get today's date (or end of month if we're past it) as YYYY-MM-DD,
 * clamped to the given month. Uses IST (Asia/Kolkata) to match the
 * application's time zone convention.
 */
function getEffectiveEndDate(month: Date): string {
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  );
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  // If current date is within the target month, use today.
  // Otherwise use the last day of the target month.
  const effective = now <= monthEnd && now.getMonth() === month.getMonth() && now.getFullYear() === month.getFullYear()
    ? now
    : monthEnd;

  const y = effective.getFullYear();
  const m = String(effective.getMonth() + 1).padStart(2, '0');
  const d = String(effective.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Count total calendar days in the given month (used as working days denominator).
 * Security industry operates 7 days/week, so all days are working days.
 */
function getTotalDaysInMonth(month: Date): number {
  return new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
}

// ── Core Function ────────────────────────────────────────────────────────

/**
 * Calculate the accumulated salary for an employee in a given month.
 *
 * Formula: (daysWorked / totalDaysInMonth) × monthlySalary
 *
 * Days worked is derived from shift_attendance records where the employee
 * was marked present (status = 'present') or half-day (status = 'half_day',
 * counted as 0.5). The calculation runs from the 1st of the month up to
 * the current date (IST).
 *
 * @param employeeId - The employee's UUID (employees.id)
 * @param month - A Date representing the target month (day is ignored)
 * @returns The accumulated salary details including breakdown
 */
export async function calculateAccumulatedSalary(
  employeeId: string,
  month: Date
): Promise<number> {
  // 1. Fetch employee's monthly salary
  const { data: employee, error: empError } = await supabaseClient
    .from('employees')
    .select('monthly_salary, salary')
    .eq('id', employeeId)
    .single();

  if (empError || !employee) {
    throw new Error(`Employee not found: ${empError?.message || 'no data'}`);
  }

  const monthlySalary = employee.monthly_salary || employee.salary || 0;
  if (monthlySalary <= 0) {
    return 0;
  }

  // 2. Determine the date range: 1st of month → today (or end of month)
  const startDate = getMonthStart(month);
  const endDate = getEffectiveEndDate(month);

  // 3. Query attendance records for this employee within the date range
  const { data: attendance, error: attError } = await supabaseClient
    .from('shift_attendance')
    .select('attendance_date, status')
    .eq('employee_id', employeeId)
    .gte('attendance_date', startDate)
    .lte('attendance_date', endDate)
    .in('status', ['present', 'half_day']);

  if (attError) {
    throw new Error(`Attendance query failed: ${attError.message}`);
  }

  // 4. Count days worked (present = 1, half_day = 0.5)
  // Group by date to avoid double-counting multiple shifts on the same day
  const dateMap = new Map<string, number>();
  for (const record of attendance ?? []) {
    const date = record.attendance_date;
    const value = record.status === 'half_day' ? 0.5 : 1;
    // Take the maximum value for a given date (if both present and half_day exist)
    dateMap.set(date, Math.max(dateMap.get(date) ?? 0, value));
  }

  const daysWorked = Array.from(dateMap.values()).reduce((sum, v) => sum + v, 0);

  // 5. Calculate accumulated salary
  const totalDaysInMonth = getTotalDaysInMonth(month);
  const dailyRate = monthlySalary / totalDaysInMonth;
  const accumulatedSalary = Math.round(dailyRate * daysWorked);

  return accumulatedSalary;
}

/**
 * Extended version that returns the full breakdown for display purposes.
 */
export async function getAccumulatedSalaryDetails(
  employeeId: string,
  month: Date
): Promise<AccumulatedSalaryResult> {
  // 1. Fetch employee's monthly salary
  const { data: employee, error: empError } = await supabaseClient
    .from('employees')
    .select('monthly_salary, salary')
    .eq('id', employeeId)
    .single();

  if (empError || !employee) {
    throw new Error(`Employee not found: ${empError?.message || 'no data'}`);
  }

  const monthlySalary = employee.monthly_salary || employee.salary || 0;
  if (monthlySalary <= 0) {
    return {
      accumulatedSalary: 0,
      totalWorkingDays: getTotalDaysInMonth(month),
      daysWorked: 0,
      monthlySalary: 0,
      dailyRate: 0,
    };
  }

  // 2. Determine the date range
  const startDate = getMonthStart(month);
  const endDate = getEffectiveEndDate(month);

  // 3. Query attendance records
  const { data: attendance, error: attError } = await supabaseClient
    .from('shift_attendance')
    .select('attendance_date, status')
    .eq('employee_id', employeeId)
    .gte('attendance_date', startDate)
    .lte('attendance_date', endDate)
    .in('status', ['present', 'half_day']);

  if (attError) {
    throw new Error(`Attendance query failed: ${attError.message}`);
  }

  // 4. Count days worked
  const dateMap = new Map<string, number>();
  for (const record of attendance ?? []) {
    const date = record.attendance_date;
    const value = record.status === 'half_day' ? 0.5 : 1;
    dateMap.set(date, Math.max(dateMap.get(date) ?? 0, value));
  }

  const daysWorked = Array.from(dateMap.values()).reduce((sum, v) => sum + v, 0);

  // 5. Calculate
  const totalWorkingDays = getTotalDaysInMonth(month);
  const dailyRate = monthlySalary / totalWorkingDays;
  const accumulatedSalary = Math.round(dailyRate * daysWorked);

  return {
    accumulatedSalary,
    totalWorkingDays,
    daysWorked,
    monthlySalary,
    dailyRate: Math.round(dailyRate * 100) / 100,
  };
}
