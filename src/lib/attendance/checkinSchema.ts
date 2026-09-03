/**
 * Submission DTOs and the pending-record builder for QR field attendance
 * (pure, dependency-free apart from `zod` and the sibling `geo` module).
 *
 * This module encodes the server-side shape of the two public submissions:
 *
 *   - `verifyInput`   — the body of `POST /api/attendance/checkin/verify`
 *   - `checkInFields` — the scalar fields of `POST /api/attendance/checkin`
 *     (the `photo` file is validated separately by `photoValidation.ts`)
 *
 * It also provides `buildPendingCheckInRecord`, which assembles a complete
 * `pending` `qr_check_ins` row from validated inputs plus the server-computed
 * geofence evaluation. The builder never trusts a client-supplied distance or
 * within-geofence value: it copies those from the `GeofenceEval` produced by
 * `evaluateGeofence` (R6.2, R7.3).
 *
 * Validation rejects missing required fields (naming the offending field) and
 * out-of-range / non-numeric coordinates before any record is constructed
 * (R3.8, R5.2, R6.9, R7.6).
 *
 * The record field names match the `qr_check_ins` columns defined in
 * `supabase/migrations/20260715000000_create_qr_check_ins.sql`.
 *
 * Requirements: 3.8, 5.2, 6.9, 7.2, 7.3, 7.6
 */

import { z } from 'zod';

import type { GeofenceEval } from './geo';
import { SHIFT_KEYS, type ShiftKey } from './shiftResolver';

// ---------------------------------------------------------------------------
// Submission DTOs (zod)
// ---------------------------------------------------------------------------

/**
 * Body of the verification request. `employee_code` is trimmed and must be
 * non-empty and at most 50 characters, rejected before any lookup (R3.8).
 * `raw_code` is the full scanned QR string — used for HMAC verification of v2 codes.
 */
export const verifyInput = z.object({
  post_id: z.string().uuid(),
  employee_code: z.string().trim().min(1).max(50),
  raw_code: z.string().max(200).optional(),
});

export type VerifyInput = z.infer<typeof verifyInput>;

/**
 * Scalar fields of the check-in submission. Coordinates are coerced from the
 * multipart string form and range-checked: latitude −90..90, longitude
 * −180..180 (R5.2, R6.9); reported accuracy must be a number greater than 0.
 * `consent_accepted_at` is an ISO 8601 UTC timestamp (R4.4).
 */
export const checkInFields = z.object({
  post_id: z.string().uuid(),
  employee_code: z.string().trim().min(1).max(50),
  shift_key: z.enum(SHIFT_KEYS),
  service_type_key: z.string().min(1),
  gps_lat: z.coerce.number().gte(-90).lte(90),
  gps_lng: z.coerce.number().gte(-180).lte(180),
  gps_accuracy_m: z.coerce.number().gt(0),
  consent_accepted_at: z.string().datetime(),
});

export type CheckInFields = z.infer<typeof checkInFields>;

// ---------------------------------------------------------------------------
// Field-level parsing that names the offending field (R7.6, R3.8, R6.9)
// ---------------------------------------------------------------------------

/** Why a check-in submission's scalar fields were refused. */
export type CheckInFieldsRejectionReason = 'missing_field' | 'invalid_field';

export type CheckInFieldsResult =
  | { ok: true; data: CheckInFields }
  | { ok: false; reason: CheckInFieldsRejectionReason; field: string; message: string };

/**
 * The scalar fields required on every check-in submission (R7.2). Used to
 * distinguish a *missing* required field from a *present-but-invalid* one so
 * the service can name the offending field in its error response (R7.6).
 */
export const REQUIRED_CHECK_IN_FIELDS = [
  'post_id',
  'employee_code',
  'shift_key',
  'service_type_key',
  'gps_lat',
  'gps_lng',
  'gps_accuracy_m',
  'consent_accepted_at',
] as const;

/** Treats null, undefined, and empty/whitespace-only strings as absent. */
function isAbsent(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  return typeof value === 'string' && value.trim() === '';
}

/**
 * Validate a raw (untyped) check-in submission's scalar fields.
 *
 * Returns the typed fields on success. On failure it names the offending
 * field: `missing_field` when a required field is absent (R7.6), otherwise
 * `invalid_field` for a present-but-invalid value such as an out-of-range or
 * non-numeric coordinate (R5.2, R6.9) or a bad employee code (R3.8). Missing
 * required fields are reported before other validation so the caller can
 * surface "which required field is missing".
 */
export function parseCheckInFields(raw: Record<string, unknown>): CheckInFieldsResult {
  // Report a missing required field first, before running full validation, so
  // the reason and field name are unambiguous (R7.6).
  for (const field of REQUIRED_CHECK_IN_FIELDS) {
    if (isAbsent(raw[field])) {
      return {
        ok: false,
        reason: 'missing_field',
        field,
        message: `Missing required field: ${field}`,
      };
    }
  }

  const parsed = checkInFields.safeParse(raw);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }

  const issue = parsed.error.issues[0];
  const field = issue?.path.length ? String(issue.path[0]) : 'unknown';
  return {
    ok: false,
    reason: 'invalid_field',
    field,
    message: issue?.message ?? 'Invalid field',
  };
}

// ---------------------------------------------------------------------------
// Pending record builder (R7.2, R7.3)
// ---------------------------------------------------------------------------

/**
 * A `pending` `qr_check_ins` row ready for insertion. Field names mirror the
 * table columns. The non-photo lifecycle columns (`approved_*`, `reviewed_*`,
 * `photo_expired`) rely on their database defaults and are intentionally not
 * set here; the server may attach `branch_id` for portal scoping.
 */
export interface PendingCheckInRecord {
  post_id: string;
  employee_code: string;
  employee_uuid: string;
  shift_key: ShiftKey;
  service_type_key: string;
  check_in_date: string;
  gps_lat: number;
  gps_lng: number;
  gps_accuracy_m: number;
  distance_m: number;
  within_geofence: boolean;
  low_accuracy: boolean;
  photo_path: string;
  consent_accepted_at: string;
  status: 'pending';
  branch_id: string | null;
}

/** Inputs the server supplies to assemble a pending record. */
export interface BuildPendingCheckInInput {
  /** Validated scalar submission fields. */
  fields: CheckInFields;
  /** Employee UUID resolved server-side from the employee code (R3.1). */
  employeeUuid: string;
  /** Check-in calendar date in the app's configured time zone (YYYY-MM-DD). */
  checkInDate: string;
  /** Server-computed geofence evaluation (distance + flags). */
  geofence: GeofenceEval;
  /** Storage path of the uploaded photo (R7.2, R8.7). */
  photoPath: string;
  /** Optional branch scope for the portals. */
  branchId?: string | null;
}

/**
 * Assemble a complete `pending` check-in record from validated inputs and the
 * server-computed geofence evaluation.
 *
 * Every field required by R7.2 is set non-null and the within-geofence flag is
 * copied verbatim from the server-side `GeofenceEval` — never from the client —
 * so an out-of-geofence check-in is still persisted with `within_geofence`
 * false and remains visible to approvers (R6.2, R7.3).
 */
export function buildPendingCheckInRecord(
  input: BuildPendingCheckInInput,
): PendingCheckInRecord {
  const { fields, employeeUuid, checkInDate, geofence, photoPath, branchId } = input;

  return {
    post_id: fields.post_id,
    employee_code: fields.employee_code,
    employee_uuid: employeeUuid,
    shift_key: fields.shift_key,
    service_type_key: fields.service_type_key,
    check_in_date: checkInDate,
    gps_lat: fields.gps_lat,
    gps_lng: fields.gps_lng,
    gps_accuracy_m: fields.gps_accuracy_m,
    distance_m: geofence.distanceM,
    within_geofence: geofence.withinGeofence,
    low_accuracy: geofence.lowAccuracy,
    photo_path: photoPath,
    consent_accepted_at: fields.consent_accepted_at,
    status: 'pending',
    branch_id: branchId ?? null,
  };
}
