import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/attendance/rateLimitPolicy';
import { HR_CONFIG } from '@/config';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

/**
 * POST /api/employee-self-service/leave — Employee self-service leave submission.
 *
 * Accepts a leave request from the Employee Self-Service Hub (post-QR-scan).
 * Validates deployment, leave type constraints, and date advance days before
 * inserting into the leave_requests table with status "Pending".
 *
 * Security model: Unauthenticated (same as attendance routes). The QR scan +
 * employee code + deployment verification serves as identity proof. Uses
 * service-role Supabase client to bypass RLS.
 *
 * Requirements: 2.3, 2.4, 2.7, 2.10
 */

/** The application's configured time zone (IST). */
const APP_TIME_ZONE = 'Asia/Kolkata';

/** Current calendar date (YYYY-MM-DD) in the app's configured time zone. */
function appToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Valid leave types accepted by the endpoint. */
const VALID_LEAVE_TYPES = ['Planned Leave', 'Sick Leave'] as const;
type LeaveType = (typeof VALID_LEAVE_TYPES)[number];

function isValidLeaveType(value: unknown): value is LeaveType {
  return typeof value === 'string' && VALID_LEAVE_TYPES.includes(value as LeaveType);
}

/** ISO date string pattern (YYYY-MM-DD). */
function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!match) return false;
  const d = new Date(value + 'T00:00:00');
  return !isNaN(d.getTime());
}

/**
 * Calculate the difference in calendar days between two ISO date strings.
 * Returns (target - base) in days.
 */
function daysDifference(base: string, target: string): number {
  const baseDate = new Date(base + 'T00:00:00');
  const targetDate = new Date(target + 'T00:00:00');
  return Math.round((targetDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: NextRequest) {
  // ── 1. Rate limit ──
  const decision = enforceRateLimit(request, 'att-checkin');
  if (decision.limited) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please wait.' },
      { status: 429, headers: { 'Retry-After': String(decision.retryAfter) } },
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

  const { employee_code, post_id, leaveType, fromDate, toDate, reason } = body as Record<
    string,
    unknown
  >;

  // ── 3. Validate required fields ──
  if (!employee_code || typeof employee_code !== 'string' || !employee_code.trim()) {
    return errorResponse('employee_code is required', 400);
  }
  if (!post_id || typeof post_id !== 'string' || !post_id.trim()) {
    return errorResponse('post_id is required', 400);
  }
  if (!isValidLeaveType(leaveType)) {
    return errorResponse('leaveType must be "Planned Leave" or "Sick Leave"', 400);
  }
  if (!isValidDateString(fromDate)) {
    return errorResponse('fromDate must be a valid date (YYYY-MM-DD)', 400);
  }
  if (!isValidDateString(toDate)) {
    return errorResponse('toDate must be a valid date (YYYY-MM-DD)', 400);
  }

  // ── 4. Validate fromDate <= toDate ──
  if (fromDate > toDate) {
    return errorResponse('fromDate must be on or before toDate', 422);
  }

  // ── 5. Validate minimum advance days ──
  const today = appToday();
  const advanceDays = daysDifference(today, fromDate as string);
  const requiredAdvance =
    leaveType === 'Planned Leave'
      ? HR_CONFIG.LEAVE.PLANNED_LEAVE_MIN_ADVANCE_DAYS
      : HR_CONFIG.LEAVE.SICK_LEAVE_MIN_ADVANCE_DAYS;

  if (advanceDays < requiredAdvance) {
    return errorResponse(
      `Start date must be at least ${requiredAdvance} day${requiredAdvance > 1 ? 's' : ''} from today`,
      422,
    );
  }

  try {
    // ── 6. Validate employee exists ──
    const { data: employee, error: employeeError } = await supabaseAdmin
      .from('employees')
      .select('id, employee_name')
      .eq('employee_id', employee_code as string)
      .maybeSingle();

    if (employeeError) {
      console.error('[employee-self-service/leave] employee lookup error:', employeeError.message);
      return errorResponse('Invalid employee code', 400);
    }
    if (!employee) {
      return errorResponse('Invalid employee code', 400);
    }

    const employeeUuid = employee.id as string;
    const employeeName = (employee.employee_name as string) || '';

    // ── 7. Validate deployment: employee is deployed at this post today ──
    const { data: deploymentRows, error: rotaError } = await supabaseAdmin
      .from('rota_assignments')
      .select('id')
      .eq('post_id', post_id as string)
      .eq('rota_date', today)
      .eq('employee_id', employeeUuid)
      .limit(1);

    if (rotaError) {
      console.error('[employee-self-service/leave] rota lookup error:', rotaError.message);
      return errorResponse('No active deployment found', 400);
    }
    if (!deploymentRows || deploymentRows.length === 0) {
      return errorResponse('No active deployment found', 400);
    }

    // ── 8. Determine sub-type (Sick Leave is always Unpaid; Planned depends on balance) ──
    let subType: 'Paid' | 'Unpaid' = 'Unpaid';
    if (leaveType === 'Planned Leave') {
      // Fetch leave balance to determine sub-type
      const { data: empData } = await supabaseAdmin
        .from('employees')
        .select('leave_balance')
        .eq('id', employeeUuid)
        .single();

      const leaveBalance = (empData?.leave_balance as number) ?? 0;
      subType = leaveBalance > 0 ? 'Paid' : 'Unpaid';
    }

    // ── 9. Calculate number of leave days ──
    const leaveDays = daysDifference(fromDate as string, toDate as string) + 1;

    // ── 10. Insert leave request ──
    const leaveId = `LV-${Date.now().toString(36).toUpperCase()}`;

    const { error: insertError } = await supabaseAdmin.from('leave_requests').insert({
      leave_id: leaveId,
      post_id: post_id as string,
      employee_id: employeeUuid,
      employee_name: employeeName,
      leave_type: `${leaveType} - ${subType}`,
      from_date: fromDate as string,
      to_date: toDate as string,
      days: leaveDays,
      reason: (reason as string) || null,
      status: 'Pending',
      source: 'employee_self_service',
    });

    if (insertError) {
      console.error('[employee-self-service/leave] insert error:', insertError.message);
      return errorResponse('Submission failed. Please try again.', 500);
    }

    // ── 11. Success ──
    return NextResponse.json({ ok: true, leaveId }, { status: 201 });
  } catch (err: any) {
    console.error('[employee-self-service/leave] unexpected error:', err?.message ?? err);
    return errorResponse('Submission failed. Please try again.', 500);
  }
}
