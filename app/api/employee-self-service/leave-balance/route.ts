import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

/**
 * GET /api/employee-self-service/leave-balance
 *
 * Returns the employee's current leave balance and the daily salary rate for
 * their deployed post. Used by the Employee Self-Service Hub leave form to
 * display leave balance and calculate salary deduction for unpaid leave days.
 *
 * Query params:
 *   - employee_code (required): The employee's human-readable code
 *   - post_id (required): The operational post UUID
 *
 * Response: { leaveBalance: number, dailySalaryRate: number }
 *
 * Requirements: 2.1
 */

// ── Constants ────────────────────────────────────────────────────────────

/** Annual paid leave balance allocation per employee. */
const ANNUAL_LEAVE_BALANCE = 12;

// ── Handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // 1. Rate limit
  const ip = getClientIp(request);
  const { limited, retryAfter } = rateLimit(`ess-leave-balance:${ip}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please wait.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  // 2. Validate query params
  const { searchParams } = new URL(request.url);
  const employeeCode = searchParams.get('employee_code')?.trim();
  const postId = searchParams.get('post_id')?.trim();

  if (!employeeCode) {
    return NextResponse.json(
      { ok: false, error: 'Missing required parameter: employee_code' },
      { status: 400 },
    );
  }

  if (!postId) {
    return NextResponse.json(
      { ok: false, error: 'Missing required parameter: post_id' },
      { status: 400 },
    );
  }

  try {
    // 3. Resolve employee by code and ensure active
    const { data: employee, error: empError } = await supabaseAdmin
      .from('employees')
      .select('id, name, status, leave_balance')
      .eq('employee_id', employeeCode)
      .maybeSingle();

    if (empError) {
      console.error('[leave-balance] employee lookup error:', empError.message);
      return NextResponse.json(
        { ok: false, error: 'Service error' },
        { status: 500 },
      );
    }

    if (!employee) {
      return NextResponse.json(
        { ok: false, error: 'Invalid employee code' },
        { status: 400 },
      );
    }

    if (employee.status && employee.status.toLowerCase() !== 'active') {
      return NextResponse.json(
        { ok: false, error: 'Employee is not active' },
        { status: 400 },
      );
    }

    // 4. Determine leave balance
    // If the employees table has a leave_balance column, use it directly.
    // Otherwise fall back to the annual allocation (12 days) minus approved
    // leaves taken this year.
    let leaveBalance: number;

    if (employee.leave_balance != null) {
      leaveBalance = employee.leave_balance;
    } else {
      // Calculate from approved paid leaves in the current year
      const yearStart = new Date().getFullYear() + '-01-01';
      const { data: approvedLeaves, error: leavesError } = await supabaseAdmin
        .from('leave_requests')
        .select('days')
        .eq('employee_id', employee.id)
        .eq('status', 'Approved')
        .eq('sub_type', 'Paid')
        .gte('from_date', yearStart);

      if (leavesError) {
        console.error('[leave-balance] leaves query error:', leavesError.message);
        return NextResponse.json(
          { ok: false, error: 'Service error' },
          { status: 500 },
        );
      }

      const usedDays = (approvedLeaves ?? []).reduce(
        (sum, row) => sum + (row.days || 0),
        0,
      );
      leaveBalance = Math.max(0, ANNUAL_LEAVE_BALANCE - usedDays);
    }

    // 5. Fetch daily salary rate from post_salary_rates + the post's salary_rate_basis
    // The table stores monthly_salary per post+designation. The divisor is determined
    // by salary_rate_basis on the operational_posts row: 'fixed26' → 26, otherwise
    // the actual number of days in the current calendar month.
    const [salaryRateResult, postBasisResult] = await Promise.all([
      supabaseAdmin
        .from('post_salary_rates')
        .select('monthly_salary')
        .eq('post_id', postId)
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('operational_posts')
        .select('salary_rate_basis')
        .eq('id', postId)
        .maybeSingle(),
    ]);

    if (salaryRateResult.error) {
      console.error('[leave-balance] salary rate query error:', salaryRateResult.error.message);
      return NextResponse.json(
        { ok: false, error: 'Service error' },
        { status: 500 },
      );
    }

    const monthlySalary = salaryRateResult.data?.monthly_salary || 0;
    const salaryBasis = (postBasisResult.data as any)?.salary_rate_basis as string | null | undefined;
    const now = new Date();
    const calendarDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const basisDivisor = salaryBasis === 'fixed26' ? 26 : calendarDays;
    const dailySalaryRate = monthlySalary > 0
      ? Math.round(monthlySalary / basisDivisor)
      : 0;

    // 6. Return response
    return NextResponse.json({
      leaveBalance,
      dailySalaryRate,
    });
  } catch (err: any) {
    console.error('[leave-balance] unexpected error:', err?.message ?? err);
    return NextResponse.json(
      { ok: false, error: 'Service error' },
      { status: 500 },
    );
  }
}
