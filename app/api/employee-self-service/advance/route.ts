import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { HR_CONFIG } from '@/config';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

/**
 * POST /api/employee-self-service/advance — Employee self-service salary advance.
 *
 * Accepts a salary advance request from the Employee Self-Service Hub (post-QR-scan).
 * Validates the employee is active, the amount ≤ 50% of accumulated salary for the
 * current month, enforces monthly limit (≤ 3) and gap (≥ 7 days), then inserts into
 * employee_advances with type SALARY_ADVANCE and interest_pct 0.
 *
 * Security model: Unauthenticated (same as attendance routes). The QR scan +
 * employee code + deployment verification serves as identity proof. Uses
 * service-role Supabase client to bypass RLS.
 *
 * Requirements: 3.3, 3.4, 3.5, 3.9
 */

// ── Constants ────────────────────────────────────────────────────────────

const MAX_PERCENT_OF_ACCUMULATED = HR_CONFIG?.SALARY_ADVANCE?.MAX_PERCENT_OF_ACCUMULATED ?? 50;
const MAX_REQUESTS_PER_MONTH = HR_CONFIG?.SALARY_ADVANCE?.MAX_REQUESTS_PER_MONTH ?? 3;
const MIN_GAP_DAYS = HR_CONFIG?.SALARY_ADVANCE?.MIN_GAP_DAYS ?? 7;
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

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

// ── Handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── 1. Rate limit ──
  const ip = getClientIp(request);
  const { limited, retryAfter } = rateLimit(`ess-advance:${ip}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (limited) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please wait.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  // ── 2. Parse request body ──
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid request body', 400);
  }

  if (!body || typeof body !== 'object') {
    return errorResponse('Invalid request body', 400);
  }

  const { employee_code, amount } = body as Record<string, unknown>;

  // ── 3. Validate required fields ──
  if (!employee_code || typeof employee_code !== 'string' || !employee_code.trim()) {
    return errorResponse('employee_code is required', 400);
  }

  if (amount === undefined || amount === null || typeof amount !== 'number' || isNaN(amount)) {
    return errorResponse('amount must be a valid number', 400);
  }

  if (amount <= 0) {
    return errorResponse('amount must be greater than zero', 422);
  }

  try {
    // ── 4. Resolve employee by code and ensure active ──
    const { data: employee, error: empError } = await supabaseAdmin
      .from('employees')
      .select('id, employee_name, status, monthly_salary, salary')
      .eq('employee_id', employee_code as string)
      .maybeSingle();

    if (empError) {
      console.error('[employee-self-service/advance] employee lookup error:', empError.message);
      return errorResponse('Invalid employee code', 400);
    }

    if (!employee) {
      return errorResponse('Invalid employee code', 400);
    }

    if (employee.status && employee.status.toLowerCase() !== 'active') {
      return errorResponse('Employee is not active', 400);
    }

    const employeeId = employee.id as string;
    const employeeName = (employee.employee_name as string) || '';
    const monthlySalary = employee.monthly_salary || employee.salary || 0;

    // ── 5. Calculate accumulated salary for the current month ──
    const today = appToday();
    const monthStart = getMonthStart(today);
    const totalDaysInMonth = getTotalDaysInMonth(today);

    let accumulatedSalary = 0;

    if (monthlySalary > 0) {
      // Query attendance records: 1st of month → today
      const { data: attendance, error: attError } = await supabaseAdmin
        .from('shift_attendance')
        .select('attendance_date, status')
        .eq('employee_id', employeeId)
        .gte('attendance_date', monthStart)
        .lte('attendance_date', today)
        .in('status', ['present', 'half_day']);

      if (attError) {
        console.error('[employee-self-service/advance] attendance query error:', attError.message);
        return errorResponse('Service error', 500);
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

    // ── 6. Validate amount ≤ 50% of accumulated salary ──
    const maxAdvance = Math.floor(accumulatedSalary * (MAX_PERCENT_OF_ACCUMULATED / 100));

    if (maxAdvance <= 0) {
      return errorResponse(
        'No salary has been accumulated yet. Cannot request an advance.',
        422,
      );
    }

    if (amount > maxAdvance) {
      return errorResponse(
        `Amount exceeds maximum allowed (₹${maxAdvance})`,
        422,
      );
    }

    // ── 7. Check monthly limit (≤ 3 requests per month) ──
    const { data: monthlyAdvances, error: monthlyError } = await supabaseAdmin
      .from('employee_advances')
      .select('id, created_at')
      .eq('employee_id', employeeId)
      .eq('advance_type', 'SALARY_ADVANCE')
      .gte('created_at', monthStart + 'T00:00:00')
      .order('created_at', { ascending: false });

    if (monthlyError) {
      console.error('[employee-self-service/advance] monthly query error:', monthlyError.message);
      return errorResponse('Service error', 500);
    }

    const requestsThisMonth = monthlyAdvances?.length ?? 0;

    if (requestsThisMonth >= MAX_REQUESTS_PER_MONTH) {
      // Calculate next eligible date (start of next month)
      const nextMonth = new Date(
        Number(today.split('-')[0]),
        Number(today.split('-')[1]),
        1,
      );
      const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
      return errorResponse(
        `Monthly limit reached. Next eligible: ${nextMonthStr}`,
        422,
      );
    }

    // ── 8. Check minimum gap (≥ 7 days between requests) ──
    if (requestsThisMonth > 0) {
      const lastRequestDate = monthlyAdvances![0].created_at.split('T')[0];
      const nextEligibleDate = addDays(lastRequestDate, MIN_GAP_DAYS);

      if (nextEligibleDate > today) {
        return errorResponse(
          `Minimum 7-day gap required. Next eligible: ${nextEligibleDate}`,
          422,
        );
      }
    }

    // ── 9. Insert into employee_advances ──
    const advanceAmount = Math.round(amount);

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('employee_advances')
      .insert({
        employee_id: employeeId,
        employee_name: employeeName,
        employee_code: employee_code as string,
        advance_type: 'SALARY_ADVANCE',
        principal: advanceAmount,
        interest_pct: 0,
        interest_amount: 0,
        total_recoverable: advanceAmount,
        recovery_mode: 'ONE_TIME',
        emi_months: 1,
        installment_amount: advanceAmount,
        amount_recovered: 0,
        balance_outstanding: advanceAmount,
        status: 'pending_approval',
        reason: null,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[employee-self-service/advance] insert error:', insertError.message);
      return errorResponse('Submission failed. Please try again.', 500);
    }

    // ── 10. Success ──
    return NextResponse.json({ ok: true, advanceId: inserted.id }, { status: 201 });
  } catch (err: any) {
    console.error('[employee-self-service/advance] unexpected error:', err?.message ?? err);
    return errorResponse('Submission failed. Please try again.', 500);
  }
}
