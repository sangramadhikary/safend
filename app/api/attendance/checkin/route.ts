import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

import { enforceRateLimit } from '@/lib/attendance/rateLimitPolicy';
import { parseCheckInFields, buildPendingCheckInRecord } from '@/lib/attendance/checkinSchema';
import { validatePhoto } from '@/lib/attendance/photoValidation';
import { evaluateGeofence, isValidLat, isValidLng, type Coord } from '@/lib/attendance/geo';
import { admitSubmission, type SlotState } from '@/lib/attendance/lifecycle';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

/**
 * POST /api/attendance/checkin — Public check-in submission (Requirements 5, 6,
 * 7, 8, 12, 13, 14) for the unauthenticated Quick Attendance Scanner.
 *
 * The Scanner is untrusted: it submits only raw inputs (a `post_id` from the
 * scanned QR, a human `employee_code`, a resolved shift, GPS coordinates +
 * accuracy, a consent timestamp, and a front-camera photo). This route is the
 * sole authority on whether a check-in is created. Every trust-bearing gate
 * runs server-side using the Supabase service-role key, mirroring the verify
 * route (`app/api/attendance/checkin/verify/route.ts`) and the established
 * public-route pattern.
 *
 * Ordered, fail-fast pipeline (design "4. Check-In Service") — no partial
 * writes ever persist:
 *   1. Rate limit FIRST — before any parse/lookup/insert (R14.1-14.3).
 *   2. Parse multipart + validate scalar fields; a missing required field is
 *      named in the error (R7.6); out-of-range/non-numeric coords are rejected
 *      as an invalid location (R5.2, R6.9).
 *   3. Photo pre-store validation: 0 < size <= 10 MiB, type image/jpeg|png
 *      (R14.4, R14.5).
 *   4. Coordinate/post validation: load the Post; reject when its stored
 *      coordinates are missing/out of range (R6.10).
 *   5. Geofence evaluation: recompute distance + within-geofence + low-accuracy
 *      server-side (R6.1-R6.8, R6.11). Out-of-geofence does NOT abort — it is
 *      persisted with `within_geofence = false` (R7.3).
 *   6. Duplicate guard: reject when a live pending record or an already-present
 *      attendance slot exists for the slot (R12.1, R12.2).
 *   7. Upload the photo to the private bucket with up to 3 retries; total
 *      failure returns `upload_failed` and creates no record (R8.1, R8.2).
 *   8. Insert the `pending` record. The DB partial unique index resolves
 *      concurrent submissions to a single winner; a unique violation maps to
 *      `duplicate_pending` (R12.3). Any post-upload insert failure attempts
 *      orphan-photo cleanup and returns `insert_failed`, never persisting a
 *      partial record (R7.5).
 *   9. Return `{ id, status: 'pending' }` (R7.4).
 *
 * `maxDuration = 60` so the photo upload (<=10 MiB, up to 3 retries) plus the
 * insert is not cut off by the Vercel Hobby 10s function default.
 *
 * Requirements: 5.1, 6.1, 6.2, 6.7, 6.9, 6.10, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6,
 * 8.1, 8.2, 8.7, 12.1, 12.2, 12.3, 14.1, 14.2, 14.3, 14.4, 14.5
 */

// The photo upload + insert does non-trivial I/O; raise the ceiling above the
// Vercel Hobby 10s default (capped at 60s on Hobby).
export const maxDuration = 60;

// Multipart parsing + Supabase storage upload need the Node.js runtime.
// Note: runtime = 'nodejs' removed — Next.js 16 defaults to Node.js and the
// explicit segment config conflicts with cacheComponents.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Service-role client — bypasses RLS so the unauthenticated Scanner's
// submission can be verified and inserted server-side, exactly as the other
// public routes do.
/** The private bucket holding attendance photos (R8.1, R8.3). */
const PHOTO_BUCKET = 'attendance-photos';

/**
 * Number of additional upload attempts after the first (R8.2: "retry the
 * upload up to 3 times"). Total attempts = 1 initial + 3 retries.
 */
const UPLOAD_RETRIES = 3;

/**
 * Postgres unique-violation SQLSTATE. Raised by the partial unique index
 * `qr_check_ins_live_slot_uniq` when a concurrent submission already occupies
 * the slot (R12.3).
 */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * The application's configured time zone. The ERP runs on IST throughout; the
 * check-in calendar date is computed in this zone (matching the verify route
 * and `rota_assignments.rota_date`) rather than the serverless host's zone.
 */
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
 * Machine-readable rejection reasons the Scanner uses to distinguish retryable
 * (network) failures from terminal rejections (R13.4, R13.5).
 */
type CheckInError =
  | 'validation'
  | 'invalid_location'
  | 'post_not_configured'
  | 'duplicate_pending'
  | 'already_present'
  | 'photo_invalid'
  | 'upload_failed'
  | 'insert_failed'
  | 'rate_limited';

function reject(
  reason: CheckInError,
  status: number,
  extra?: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  return NextResponse.json({ ok: false, reason, ...extra }, { status, headers });
}

/** Map an accepted content type to the stored file extension. */
function extForContentType(contentType: string): string {
  return contentType === 'image/png' ? 'png' : 'jpg';
}

export async function POST(request: NextRequest) {
  // ── 1. Rate limit FIRST — before any parse/lookup/insert (R14.1-14.3) ──
  const decision = enforceRateLimit(request, 'att-checkin');
  if (decision.limited) {
    return reject('rate_limited', 429, undefined, {
      'Retry-After': String(decision.retryAfter),
    });
  }

  // ── 2. Parse multipart + validate scalar fields ──
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reject('validation', 400, { field: 'body', message: 'Malformed multipart body' });
  }

  // Collect scalar fields (everything except the photo file) into a plain
  // object the pure validator can inspect.
  const raw: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (key === 'photo') {
      continue;
    }
    if (typeof value === 'string') {
      raw[key] = value;
    }
  }

  const parsed = parseCheckInFields(raw);
  if (parsed.ok === false) {
    // Out-of-range/non-numeric coordinates are surfaced as an invalid location
    // (R6.9); every other bad/missing scalar is a generic validation error that
    // names the offending field (R7.6).
    const isCoordField = parsed.field === 'gps_lat' || parsed.field === 'gps_lng';
    if (parsed.reason === 'invalid_field' && isCoordField) {
      return reject('invalid_location', 400, {
        field: parsed.field,
        message: parsed.message,
      });
    }
    return reject('validation', 400, { field: parsed.field, message: parsed.message });
  }

  const fields = parsed.data;

  // ── 3. Photo pre-store validation (R14.4, R14.5) ──
  const photo = form.get('photo');
  if (!(photo instanceof Blob)) {
    // Absent (or non-file) photo is a missing required field (R7.6).
    return reject('validation', 400, { field: 'photo', message: 'Missing required field: photo' });
  }

  const photoValidation = validatePhoto(photo.size, photo.type);
  if (photoValidation.ok === false) {
    // Reject before storing anything; no record is created (R14.5).
    return reject('photo_invalid', 400, { detail: photoValidation.reason });
  }

  try {
    // ── 4. Coordinate/post validation: load the Post (R6.10) ──
    const { data: post, error: postError } = await supabaseAdmin
      .from('operational_posts')
      .select('location, branch_id')
      .eq('id', fields.post_id)
      .maybeSingle();

    if (postError) {
      console.error('[attendance/checkin] post lookup error:', postError.message);
      return reject('post_not_configured', 400, { message: 'Post location is not configured.' });
    }

    const location = (post?.location ?? {}) as {
      latitude?: unknown;
      longitude?: unknown;
      geofenceRadius?: unknown;
    };
    const postLat = location.latitude;
    const postLng = location.longitude;

    if (!post || !isValidLat(postLat) || !isValidLng(postLng)) {
      // Post coordinates missing or out of range — cannot evaluate geofence.
      return reject('post_not_configured', 400, { message: 'Post location is not configured.' });
    }

    const geofenceRadius =
      typeof location.geofenceRadius === 'number' ? location.geofenceRadius : null;

    const gps: Coord = { lat: fields.gps_lat, lng: fields.gps_lng };
    const postCoord: Coord = { lat: postLat, lng: postLng };

    // ── 5. Geofence evaluation (server-side, never client-trusted) ──
    // Out-of-geofence does NOT abort: the record is persisted with
    // `within_geofence = false` so approvers can see it (R7.3).
    const geofence = evaluateGeofence(gps, postCoord, fields.gps_accuracy_m, geofenceRadius);

    const checkInDate = appToday();

    // ── 6. Duplicate guard (R12.1, R12.2) ──
    // A slot may hold at most one live (pending/approved) record; and if the
    // attendance slot is already `present`, no new submission is accepted.
    //
    // employee_uuid is not resent by the Scanner (only the human employee_code
    // is), so resolve it here (service-role) to key the slot exactly like the
    // DB partial unique index does.
    const { data: employee, error: employeeError } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('employee_id', fields.employee_code)
      .maybeSingle();

    if (employeeError) {
      console.error('[attendance/checkin] employee lookup error:', employeeError.message);
      return reject('validation', 400, { field: 'employee_code', message: 'Employee not found.' });
    }
    if (!employee) {
      return reject('validation', 400, { field: 'employee_code', message: 'Employee not found.' });
    }
    const employeeUuid = employee.id as string;

    // Existing live (pending/approved) check-in for this exact slot.
    const { data: existingLive, error: existingLiveError } = await supabaseAdmin
      .from('qr_check_ins')
      .select('status')
      .eq('employee_uuid', employeeUuid)
      .eq('post_id', fields.post_id)
      .eq('check_in_date', checkInDate)
      .eq('shift_key', fields.shift_key)
      .in('status', ['pending', 'approved']);

    if (existingLiveError) {
      console.error('[attendance/checkin] live-slot lookup error:', existingLiveError.message);
      return reject('validation', 400, { message: 'Unable to verify slot availability.' });
    }

    // Existing `present` attendance for this slot (R12.2).
    const { count: presentCount, error: attendanceError } = await supabaseAdmin
      .from('shift_attendance')
      .select('id', { count: 'exact', head: true })
      .eq('attendance_date', checkInDate)
      .eq('post_id', fields.post_id)
      .eq('shift_key', fields.shift_key)
      .eq('service_type_key', fields.service_type_key)
      .eq('employee_id', employeeUuid)
      .eq('status', 'present');

    if (attendanceError) {
      console.error('[attendance/checkin] attendance lookup error:', attendanceError.message);
      return reject('validation', 400, { message: 'Unable to verify attendance status.' });
    }

    const slotState: SlotState = {
      livePendingExists: (existingLive ?? []).some((r) => r.status === 'pending'),
      liveApprovedExists: (existingLive ?? []).some((r) => r.status === 'approved'),
      attendancePresent: (presentCount ?? 0) > 0,
    };

    const admission = admitSubmission(slotState);
    if (admission.accepted === false) {
      // duplicate_pending (R12.1) or already_present (R12.2) — no record created,
      // existing record left unchanged. 409 Conflict.
      return reject(admission.reason, 409);
    }

    // ── 7. Upload the photo to the private bucket, up to 3 retries (R8.1, R8.2) ──
    // Generate the record id client-side so the photo path can reference it and
    // the subsequent insert stays consistent. Upload BEFORE insert so a record
    // never references an unstored photo; on later insert failure the orphan is
    // cleaned up (R7.5, R8.2).
    const checkInId = randomUUID();
    const ext = extForContentType(photo.type);
    const photoPath = `attendance/${checkInDate}/${checkInId}.${ext}`;

    const photoBuffer = Buffer.from(await photo.arrayBuffer());

    let uploaded = false;
    let lastUploadError: string | undefined;
    for (let attempt = 0; attempt <= UPLOAD_RETRIES; attempt += 1) {
      const { error: uploadError } = await supabaseAdmin.storage
        .from(PHOTO_BUCKET)
        .upload(photoPath, photoBuffer, {
          contentType: photo.type,
          upsert: false,
        });

      if (!uploadError) {
        uploaded = true;
        break;
      }
      lastUploadError = uploadError.message;
    }

    if (!uploaded) {
      // All attempts failed — no record references an unstored photo (R8.2).
      console.error('[attendance/checkin] photo upload failed:', lastUploadError);
      return reject('upload_failed', 502, { message: 'The check-in photo could not be stored.' });
    }

    // ── 8. Insert the pending record (R7.1, R7.2, R7.3) ──
    const record = buildPendingCheckInRecord({
      fields,
      employeeUuid,
      checkInDate,
      geofence,
      photoPath,
      branchId: (post.branch_id as string | null) ?? null,
    });

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('qr_check_ins')
      .insert({ id: checkInId, ...record })
      .select('id, status')
      .single();

    if (insertError) {
      // The photo is already stored; clean it up so no orphan remains, then map
      // the failure. A unique violation means a concurrent submission won the
      // slot (R12.3) → duplicate_pending; any other failure → insert_failed
      // (R7.5). Never persist a partial record.
      await supabaseAdmin.storage.from(PHOTO_BUCKET).remove([photoPath]).catch(() => {});

      if ((insertError as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        return reject('duplicate_pending', 409);
      }
      console.error('[attendance/checkin] insert failed:', insertError.message);
      return reject('insert_failed', 500, { message: 'The check-in could not be saved.' });
    }

    // ── 9. Success (R7.4) ──
    return NextResponse.json({ id: inserted.id, status: 'pending' }, { status: 201 });
  } catch (err: any) {
    console.error('[attendance/checkin] unexpected error:', err?.message ?? err);
    return reject('insert_failed', 500, { message: 'The check-in could not be saved.' });
  }
}
