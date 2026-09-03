import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/attendance/rateLimitPolicy';
import { verifyInput } from '@/lib/attendance/checkinSchema';
import { verifyAttendanceCode } from '@/lib/attendance/hmac';
import {
  resolveShifts,
  isShiftKey,
  type MatchedDeployment,
} from '@/lib/attendance/shiftResolver';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

/**
 * POST /api/attendance/checkin/verify — Server-side deployment verification
 * (Requirement 3) for the public Quick Attendance Scanner.
 *
 * The Scanner is untrusted: it submits only a `post_id` (from the scanned QR)
 * and a human `employee_code`. This route is the sole authority on whether the
 * employee is deployed to that post today. Every trust-bearing step runs
 * server-side using the Supabase service-role key, mirroring the established
 * public route pattern (`app/api/verify-employee/route.ts`,
 * `app/api/enquiry/route.ts`).
 *
 * Ordered pipeline (matches design "3. Verification Service"):
 *   1. Rate limit FIRST — before any lookup — keyed by the derived client id;
 *      a limited request returns 429 with `Retry-After` and never touches the
 *      database (R14.1, R14.2, R14.3).
 *   2. Validate the body with `verifyInput` (zod). `employee_code` must be
 *      non-empty after trim and ≤ 50 chars; `post_id` must be a UUID. A bad
 *      body is rejected before any lookup (R3.8).
 *   3. Resolve `employee_uuid` from `employees.employee_id`. No match →
 *      `employee_not_found`, and no shift is ever returned (R3.3, R3.5).
 *   4. Query `rota_assignments` for the post, the current calendar date in the
 *      app's configured time zone, and the resolved `employee_uuid` (R3.1).
 *   5. Zero matches → `not_assigned` (R3.4). One or more → the distinct shift
 *      keys via the pure shift resolver: exactly one is auto-selectable (R3.6),
 *      more than one requires the user to choose (R3.7).
 *   6. Any database error → `service_error` (500) with no shift leaked (R3.9).
 *
 * The deployment lookup relies only on server-side data and never on any
 * client-provided verification result (R3.2).
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 14.1, 14.2, 14.3
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Service-role client — bypasses RLS so the unauthenticated Scanner can be
// verified server-side, exactly as the other public routes do.
/**
 * The application's configured time zone. The ERP runs on IST throughout
 * (see `DigitalClock.tsx`, `app/api/enquiry/route.ts`), so the current
 * calendar date used for the deployment lookup is computed in this zone
 * rather than the serverless host's local zone (R3.1).
 */
const APP_TIME_ZONE = 'Asia/Kolkata';

/** Current calendar date (YYYY-MM-DD) in the app's configured time zone. */
function appToday(): string {
  // `en-CA` formats as YYYY-MM-DD, matching the `rota_assignments.rota_date`
  // `date` column.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

type VerifyReason =
  | 'employee_not_found'
  | 'not_assigned'
  | 'validation'
  | 'service_error'
  | 'rate_limited';

function reject(reason: VerifyReason, status: number, extraHeaders?: Record<string, string>) {
  return NextResponse.json(
    { ok: false, reason },
    { status, headers: extraHeaders },
  );
}

export async function POST(request: NextRequest) {
  // ── 1. Rate limit FIRST — before any lookup (R14.1, R14.2, R14.3) ──
  const decision = enforceRateLimit(request, 'att-verify');
  if (decision.limited) {
    return reject('rate_limited', 429, { 'Retry-After': String(decision.retryAfter) });
  }

  // ── 2. Parse + validate the body (R3.8). No lookup happens on a bad body. ──
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reject('validation', 400);
  }

  const parsed = verifyInput.safeParse(body);
  if (!parsed.success) {
    return reject('validation', 400);
  }

  const { post_id, employee_code, raw_code } = parsed.data;

  // ── 2b. If a raw_code is provided (v2 signed code), verify its HMAC signature ──
  if (raw_code && raw_code.startsWith('safend-attendance:v2:')) {
    const hmacResult = verifyAttendanceCode(raw_code);
    if (!hmacResult.valid) {
      return reject('validation', 400);
    }
    // Ensure the post_id extracted client-side matches the signed one
    if (hmacResult.postId !== post_id) {
      return reject('validation', 400);
    }
  }

  try {
    // ── 3. Resolve employee_uuid from the human employee code (R3.1, R3.5). ──
    const { data: employee, error: employeeError } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('employee_id', employee_code)
      .maybeSingle();

    if (employeeError) {
      console.error('[attendance/verify] employee lookup error:', employeeError.message);
      return reject('service_error', 500);
    }

    // No matching employee — reject before evaluating any deployment, and never
    // return a shift key (R3.3, R3.5).
    if (!employee) {
      return reject('employee_not_found', 200);
    }

    const employeeUuid = employee.id as string;

    // ── 4. Deployment lookup: post + today (app time zone) + employee (R3.1). ──
    const { data: rows, error: rotaError } = await supabaseAdmin
      .from('rota_assignments')
      .select('shift_key, service_type_key')
      .eq('post_id', post_id)
      .eq('rota_date', appToday())
      .eq('employee_id', employeeUuid);

    if (rotaError) {
      console.error('[attendance/verify] rota lookup error:', rotaError.message);
      return reject('service_error', 500);
    }

    // ── 5. Resolve the distinct matched shifts (R3.4, R3.6, R3.7). ──
    const deployments: MatchedDeployment[] = (rows ?? [])
      .filter((row) => isShiftKey(row.shift_key))
      .map((row) => ({
        shiftKey: row.shift_key,
        serviceTypeKey: String(row.service_type_key),
      }));

    const resolution = resolveShifts(deployments);

    // No deployment for this employee/post/today (R3.4). No shift leaked.
    if (resolution.shifts.length === 0) {
      return reject('not_assigned', 200);
    }

    return NextResponse.json({
      ok: true,
      autoSelect: resolution.autoSelect,
      shifts: resolution.shifts.map((shift) => ({
        shiftKey: shift.shiftKey,
        serviceTypeKey: shift.serviceTypeKey,
      })),
    });
  } catch (err: any) {
    // ── 6. Any unexpected failure → service_error, no shift returned (R3.9). ──
    console.error('[attendance/verify] unexpected error:', err?.message ?? err);
    return reject('service_error', 500);
  }
}
