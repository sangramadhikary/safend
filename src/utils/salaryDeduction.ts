/**
 * Salary deduction calculation utilities.
 *
 * Used by the EmployeeLeaveForm to compute salary deductions for unpaid leave.
 * The deduction is a linear function: deduction = daily_rate × number_of_days.
 *
 * Requirement 2.5: WHEN the Employee selects dates for an unpaid leave request,
 * THE Self_Service_Hub SHALL display the total salary deduction as
 * daily_rate × number_of_leave_days.
 */

/**
 * Calculate the salary deduction for unpaid leave days.
 *
 * @param dailyRate - The daily salary rate (must be > 0)
 * @param days - The number of leave days (must be > 0)
 * @returns The total salary deduction amount
 */
export function calculateSalaryDeduction(dailyRate: number, days: number): number {
  if (dailyRate <= 0 || days <= 0) return 0;
  return dailyRate * days;
}
