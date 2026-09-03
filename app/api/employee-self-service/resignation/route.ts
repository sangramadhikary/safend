import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { HR_CONFIG } from '@/config';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

/**
 * POST /api/employee-self-service/resignation — Submit a resignation request
 * (Requirements 4.1, 4.2, 4.4, 4.5, 4.6).
 *
 * Accepts multipart/form-data with:
 *   - employee_code (string, required)
 *   - reason (string, optional)
 *   - notice_period (number, optional, default 30, clamped to 15-30)
 *   - letter (File, required — JPEG, PNG, or PDF, max 10 MB)
 *
 * Pipeline:
 *   1. Rate limit
 *   2. Parse multipart form data
 *   3. Validate employee exists and is active
 *   4. Validate letter file (type + size)
 *   5. Check for existing active resignation
 *   6. Upload letter to Supabase storage
 *   7. Calculate last_working_day = submission_date + notice_period days
 *   8. Insert into resignation_requests
 *   9. Insert into deboarding_pipeline
 *  10. Return { ok: true, resignationId }
 */

export const maxDuration = 60;

/** The storage bucket for resignation letter uploads. */
const RESIGNATION_BUCKET = 'uploads';

/** Maximum file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Allowed MIME types for resignation letters */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

/** Map MIME type to file extension */
function extForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'application/pdf': return 'pdf';
    default: return 'bin';
  }
}

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

/**
 * Add days to a date string (YYYY-MM-DD) and return the result as YYYY-MM-DD.
 */
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function POST(request: NextRequest) {
  // ── 1. Rate limit ──
  const clientIp = getClientIp(request);
  const { limited, retryAfter } = rateLimit(`resignation:${clientIp}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (limited) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please wait.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  // ── 2. Parse multipart form data ──
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid form data.' },
      { status: 400 },
    );
  }

  const employeeCode = (form.get('employee_code') as string | null)?.trim();
  const reason = (form.get('reason') as string | null)?.trim() || null;
  const noticePeriodRaw = form.get('notice_period') as string | null;
  const letter = form.get('letter');

  if (!employeeCode) {
    return NextResponse.json(
      { ok: false, error: 'Missing required field: employee_code' },
      { status: 400 },
    );
  }

  // Validate notice period (default 30, clamp to 15-30)
  let noticePeriod = 30;
  if (noticePeriodRaw) {
    const parsed = parseInt(noticePeriodRaw, 10);
    if (!isNaN(parsed)) {
      noticePeriod = Math.max(
        HR_CONFIG.RESIGNATION.MIN_NOTICE_DAYS,
        Math.min(HR_CONFIG.RESIGNATION.MAX_NOTICE_DAYS, parsed),
      );
    }
  }

  // ── 3. Validate letter file (R4.1, R4.6) ──
  if (!(letter instanceof Blob) || letter.size === 0) {
    return NextResponse.json(
      { ok: false, error: 'Missing required field: letter. A resignation letter must be attached.' },
      { status: 400 },
    );
  }

  if (!ALLOWED_MIME_TYPES.includes(letter.type)) {
    return NextResponse.json(
      { ok: false, error: `Invalid file type: ${letter.type}. Allowed: JPEG, PNG, PDF.` },
      { status: 400 },
    );
  }

  if (letter.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { ok: false, error: 'File too large. Maximum size is 10 MB.' },
      { status: 400 },
    );
  }

  try {
    // ── 4. Validate employee exists and is active ──
    const { data: employee, error: empError } = await supabaseAdmin
      .from('employees')
      .select('id, name, designation, status')
      .eq('employee_id', employeeCode)
      .maybeSingle();

    if (empError) {
      console.error('[resignation] employee lookup error:', empError.message);
      return NextResponse.json(
        { ok: false, error: 'Unable to verify employee.' },
        { status: 500 },
      );
    }

    if (!employee) {
      return NextResponse.json(
        { ok: false, error: 'Invalid employee code.' },
        { status: 400 },
      );
    }

    if (employee.status !== 'active') {
      return NextResponse.json(
        { ok: false, error: 'Employee is not active.' },
        { status: 400 },
      );
    }

    const employeeId = employee.id as string;
    const employeeName = (employee.name as string) || '';
    const designation = (employee.designation as string) || '';

    // ── 5. Check for existing active resignation (edge case) ──
    const { data: existingResignation, error: existingError } = await supabaseAdmin
      .from('resignation_requests')
      .select('id')
      .eq('employee_id', employeeId)
      .not('status', 'eq', 'completed')
      .not('status', 'eq', 'withdrawn')
      .maybeSingle();

    if (existingError) {
      console.error('[resignation] existing check error:', existingError.message);
    }

    if (existingResignation) {
      return NextResponse.json(
        { ok: false, error: 'An active resignation request already exists for this employee.' },
        { status: 422 },
      );
    }

    // ── 6. Upload letter to Supabase storage ──
    const submissionDate = appToday();
    const timestamp = Date.now();
    const ext = extForMimeType(letter.type);
    const storagePath = `resignation-letters/${employeeCode}/${timestamp}.${ext}`;

    const letterBuffer = Buffer.from(await letter.arrayBuffer());

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(RESIGNATION_BUCKET)
      .upload(storagePath, letterBuffer, {
        contentType: letter.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('[resignation] upload error:', uploadError.message);
      return NextResponse.json(
        { ok: false, error: 'File upload failed. Please try again.' },
        { status: 500 },
      );
    }

    // Get public URL for the uploaded file
    const { data: urlData } = supabaseAdmin.storage
      .from(RESIGNATION_BUCKET)
      .getPublicUrl(uploadData.path);

    const letterUrl = urlData.publicUrl;

    // ── 7. Calculate last_working_day (R4.2, R4.4) ──
    const lastWorkingDay = addDays(submissionDate, noticePeriod);

    // ── 8. Insert into resignation_requests ──
    const { data: resignationData, error: resignationError } = await supabaseAdmin
      .from('resignation_requests')
      .insert({
        employee_id: employeeId,
        employee_code: employeeCode,
        employee_name: employeeName,
        letter_url: letterUrl,
        letter_filename: (letter as File).name || `resignation_letter.${ext}`,
        reason,
        submission_date: submissionDate,
        notice_period_days: noticePeriod,
        last_working_day: lastWorkingDay,
        status: 'resignation_received',
      })
      .select('id')
      .single();

    if (resignationError) {
      console.error('[resignation] insert error:', resignationError.message);
      // Attempt to clean up the uploaded file
      await supabaseAdmin.storage.from(RESIGNATION_BUCKET).remove([storagePath]).catch(() => {});
      return NextResponse.json(
        { ok: false, error: 'Submission failed. Please try again.' },
        { status: 500 },
      );
    }

    const resignationId = resignationData.id;

    // ── 9. Insert into deboarding_pipeline (R4.5) ──
    const now = new Date().toISOString();
    const { error: pipelineError } = await supabaseAdmin
      .from('deboarding_pipeline')
      .insert({
        resignation_id: resignationId,
        employee_id: employeeId,
        employee_name: employeeName,
        designation,
        current_stage: 'resignation_received',
        stage_history: [{ stage: 'resignation_received', timestamp: now }],
        last_working_day: lastWorkingDay,
        progress_pct: Math.round((1 / 7) * 100),
      });

    if (pipelineError) {
      console.error('[resignation] deboarding pipeline insert error:', pipelineError.message);
      // The resignation record exists but pipeline failed — log but don't fail the request
      // since the resignation itself was recorded. HR can create the pipeline entry manually.
    }

    // ── 10. Success ──
    return NextResponse.json(
      { ok: true, resignationId },
      { status: 201 },
    );
  } catch (err: any) {
    console.error('[resignation] unexpected error:', err?.message ?? err);
    return NextResponse.json(
      { ok: false, error: 'Submission failed. Please try again.' },
      { status: 500 },
    );
  }
}
