import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

/**
 * GET /api/employee-self-service/accumulated-salary
 *
 * Returns the accumulated salary for the current month, the maximum advance
 * allowed (50% of accumulated), the number of salary advance requests this
 * month, and the next eligible date (if gap constraint applies).
 *
 * Query params:
 *   - employee_code (required): The employee's human-readable code
 *
 * Requirements: 3.1, 3.2
 */

// ── Constants ────────────────────────────────────────────────────────────

const MAX_PERCENT_OF_ACCUMULATED = 50;
const MAX_REQUESTS_PER_MONTH = 3;
const MIN_GAP_DAYS = 7;
const APP_TIME_ZONE = 'Asia/Kolkata';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Current calendar date (YYYY-MM-DD) in the app's configured time zone (IST). */
function appToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** First day of the current month as YYYY-MM-DD. */
function getMonthStart(today: string): string {
  return today.slice(0, 8) + '01';
}

/** Total calendar days in the month (security industry operates 7 days/week). */
function getTotalDaysInMonth(today: string): number {
  const [y, m] = today.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Add days to a YYYY-MM-DD date string and return YYYY-MM-DD. */
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── Handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // 1. Rate limit
  const ip = getClientIp(request);
  const { limited, retryAfter } = rateLimit(`ess-accumulated-salary:${ip}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please wait.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  // 2. Validate query params
  const { searchParams } = new URL(request.url);
  const employeeCode = searchParams.get('employee_code')?.trim();

  if (!employeeCode) {
    return NextResponse.json(
      { ok: false, error: 'Missing required parameter: employee_code' },
      { status: 400 }
    );
  }

  try {
    // 3. Resolve employee by code and ensure active
    const { data: employee, error: empError } = await supabaseAdmin
      .from('employees')
      .select('id, name, status, monthly_salary, salary')
      .eq('employee_id', employeeCode)
      .maybeSingle();

    if (empError) {
      console.error('[accumulated-salary] employee lookup error:', empError.message);
      return NextResponse.json(
        { ok: false, error: 'Service error' },
        { status: 500 }
      );
    }

    if (!employee) {
      return NextResponse.json(
        { ok: false, error: 'Invalid employee code' },
        { status: 400 }
      );
    }

    if (employee.status && employee.status.toLowerCase() !== 'active') {
      return NextResponse.json(
        { ok: false, error: 'Employee is not active' },
        { status: 400 }
      );
    }

    const employeeId = employee.id as string;
    const monthlySalary = employee.monthly_salary || employee.salary || 0;

    // 4. Calculate accumulated salary for the current month
    const today = appToday();
    const monthStart = getMonthStart(today);
    const totalDaysInMonth = getTotalDaysInMonth(today);

    let accumulatedSalary = 0;

    if (monthlySalary > 0) {
      // Query attendance records for this employee: 1st of month → today
      const { data: attendance, error: attError } = await supabaseAdmin
        .from('shift_attendance')
        .select('attendance_date, status')
        .eq('employee_id', employeeId)
        .gte('attendance_date', monthStart)
        .lte('attendance_date', today)
        .in('status', ['present', 'half_day']);

      if (attError) {
        console.error('[accumulated-salary] attendance query error:', attError.message);
        return NextResponse.json(
          { ok: false, error: 'Service error' },
          { status: 500 }
        );
      }

      // Count days worked (present = 1, half_day = 0.5), grouped by date
      const dateMap = new Map<string, number>();
      for (const record of attendance ?? []) {
        const date = record.attendance_date;
        const value = record.status === 'half_day' ? 0.5 : 1;
        dateMap.set(date, Math.max(dateMap.get(date) ?? 0, value));
      }

      const daysWorked = Array.from(dateMap.values()).reduce((sum, v) => sum + v, 0);
      const dailyRate = monthlySalary / totalDaysInMonth;
      accumulatedSalary = Math.round(dailyRate * daysWorked);
    }

    // 5. Calculate max advance (50% of accumulated salary)
    const maxAdvance = Math.floor(accumulatedSalary * (MAX_PERCENT_OF_ACCUMULATED / 100));

    // 6. Check monthly request count (SALARY_ADVANCE requests this month)
    const { data: monthlyAdvances, error: monthlyError } = await supabaseAdmin
      .from('employee_advances')
      .select('id, created_at')
      .eq('employee_id', employeeId)
      .eq('advance_type', 'SALARY_ADVANCE')
      .gte('created_at', monthStart + 'T00:00:00')
      .order('created_at', { ascending: false });

    if (monthlyError) {
      console.error('[accumulated-salary] monthly advances query error:', monthlyError.message);
      return NextResponse.json(
        { ok: false, error: 'Service error' },
        { status: 500 }
      );
    }

    const requestsThisMonth = monthlyAdvances?.length ?? 0;

    // 7. Check minimum gap (7 days since last request)
    let nextEligibleDate: string | null = null;

    if (requestsThisMonth > 0) {
      // The most recent request's created_at
      const lastRequestDate = monthlyAdvances![0].created_at.split('T')[0];
      const eligibleDate = addDays(lastRequestDate, MIN_GAP_DAYS);

      // If the eligible date is after today, the employee cannot request yet
      if (eligibleDate > today) {
        nextEligibleDate = eligibleDate;
      }
    }

    // 8. Return response
    return NextResponse.json({
      accumulatedSalary,
      maxAdvance,
      requestsThisMonth,
      nextEligibleDate,
    });
  } catch (err: any) {
    console.error('[accumulated-salary] unexpected error:', err?.message ?? err);
    return NextResponse.json(
      { ok: false, error: 'Service error' },
      { status: 500 }
    );
  }
}
