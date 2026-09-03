# Implementation Plan: QR Field Attendance

## Overview

This plan builds the QR Field Attendance feature bottom-up: pure, dependency-free domain modules first (parser, geo/geofence math, validation, lifecycle, retention, retry, client-id), each covered by a property-based test, then the server-side Route Handlers that orchestrate them, then the shared approval-queue UI wired into both portals, the QR generation flow, and finally the public Quick Attendance Scanner wired into `LoginForm`. Every step builds on the previous one and ends by wiring the pieces into the existing Next.js + Supabase codebase so no code is left orphaned.

Language/stack: TypeScript (Next.js Route Handlers under `app/api/**`, Supabase service-role pattern, `zod`, `@tanstack/react-query`, `qrcode.react`, `leaflet`/`react-leaflet`). Tests use `vitest` + `fast-check`, matching the existing convention (`penaltyValidation.property.test.ts`). Property tests run a minimum of 100 iterations and are tagged `// Feature: qr-field-attendance, Property {n}: ...`.

## Tasks

- [x] 1. Database schema and private storage setup
  - [x] 1.1 Create migration for the `qr_check_ins` table and indexes
    - Add SQL migration creating `public.qr_check_ins` with all columns, check constraints, and defaults per the data model
    - Create the partial unique index `qr_check_ins_live_slot_uniq` on `(employee_uuid, post_id, check_in_date, shift_key) where status in ('pending','approved')`
    - Create `qr_check_ins_status_idx` and `qr_check_ins_post_idx`; enable RLS with no anon policy
    - _Requirements: 7.2, 12.1, 12.3_

  - [x] 1.2 Provision the private `attendance-photos` storage bucket
    - Add migration/config creating the bucket as private with no public read access
    - Document the path convention `attendance/{check_in_date}/{check_in_id}.{ext}`
    - _Requirements: 8.3, 8.7_

- [x] 2. Attendance code scheme and geo modules (pure)
  - [x] 2.1 Implement `src/lib/attendance/attendanceCode.ts`
    - Implement `formatAttendanceCode`, `parseAttendanceCode`, `isUuid`, and the `ParseResult` union
    - Distinguish `ok` / `malformed` / `not-attendance` outcomes for the `safend-attendance:v1:<uuid>` scheme
    - _Requirements: 1.2, 1.3, 1.4, 16.1, 16.5_

  - [x]* 2.2 Write property test for the attendance code scheme
    - **Property 1: Attendance code round-trip and classification**
    - **Validates: Requirements 1.2, 1.3, 1.4, 16.1, 16.5**

  - [x] 2.3 Implement `src/lib/attendance/geo.ts`
    - Implement `isValidLat`, `isValidLng`, `haversineMeters` (Earth radius 6,371,000 m, rounded to 1 decimal), `effectiveRadius`, and `evaluateGeofence`
    - Compute `distanceM`, `withinGeofence` (strictly-less-than), and `lowAccuracy` flags; store distance and accuracy
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.11_

  - [x]* 2.4 Write property test for effective geofence radius selection
    - **Property 3: Effective geofence radius selection**
    - **Validates: Requirements 6.3, 6.4**

  - [x]* 2.5 Write property test for haversine distance and geofence comparison
    - **Property 4: Haversine distance and geofence comparison**
    - **Validates: Requirements 6.1, 6.5, 6.6**

  - [x]* 2.6 Write property test for low-accuracy flagging
    - **Property 5: Low-accuracy flagging**
    - **Validates: Requirements 6.8, 6.11**

- [x] 3. Submission validation, photo, and client-id modules (pure)
  - [x] 3.1 Implement `src/lib/attendance/checkinSchema.ts` and the pending-record builder
    - Implement `verifyInput` and `checkInFields` zod schemas
    - Implement a record builder that assembles a complete `pending` `qr_check_ins` record from validated inputs plus the geofence evaluation, preserving the server-computed within-geofence flag
    - Reject missing required fields naming the offending field; reject out-of-range/non-numeric coordinates
    - _Requirements: 3.8, 5.2, 6.9, 7.2, 7.3, 7.6_

  - [x]* 3.2 Write property test for accepted submission record completeness
    - **Property 6: Accepted submission produces a complete pending record**
    - **Validates: Requirements 7.2, 7.3**

  - [x]* 3.3 Write property test for missing-required-field rejection
    - **Property 7: Missing required field is rejected without a record**
    - **Validates: Requirements 7.6**

  - [ ]* 3.4 Write property test for server-side coordinate rejection
    - **Property 17: Server-side coordinate rejection**
    - **Validates: Requirements 6.9**

  - [x]* 3.5 Write property test for employee code validation
    - **Property 18: Employee code validation**
    - **Validates: Requirements 3.8**

  - [x] 3.6 Implement `src/lib/attendance/photoValidation.ts`
    - Implement the size + content-type acceptability predicate (`0 < size ≤ 10,485,760`, type ∈ {`image/jpeg`, `image/png`})
    - _Requirements: 14.4, 14.5_

  - [x]* 3.7 Write property test for photo acceptability
    - **Property 13: Photo acceptability**
    - **Validates: Requirements 14.4, 14.5**

  - [x] 3.8 Implement `src/lib/attendance/clientId.ts`
    - Derive the client identifier by header precedence: first `x-forwarded-for` entry, then `x-real-ip`, then `cf-connecting-ip`, else `"unknown"` (wrapping `getClientIp`)
    - _Requirements: 14.1_

  - [ ]* 3.9 Write property test for client identifier derivation precedence
    - **Property 14: Client identifier derivation precedence**
    - **Validates: Requirements 14.1**

- [x] 4. Lifecycle, retention, shift resolution, retry, and rate-limit modules (pure)
  - [x] 4.1 Implement `src/lib/attendance/lifecycle.ts`
    - Implement status-transition rules (approve/reject/already-resolved), the duplicate/live-slot decision model, and the attendance-slot resolution rule (exactly-one match)
    - Enforce reviewer-notes ≤ 500 characters
    - _Requirements: 11.1, 11.3, 11.4, 11.6, 12.1, 12.2, 12.3_

  - [ ]* 4.2 Write property test for at-most-one-live-record-per-slot
    - **Property 9: At most one live record per slot**
    - **Validates: Requirements 12.1, 12.2, 12.3**

  - [ ]* 4.3 Write property test for check-in lifecycle transitions
    - **Property 10: Check-in lifecycle transitions**
    - **Validates: Requirements 11.1, 11.3, 11.4**

  - [ ]* 4.4 Write property test for attendance slot resolution on approval
    - **Property 15: Attendance slot resolution on approval**
    - **Validates: Requirements 11.6**

  - [x] 4.5 Implement `src/lib/attendance/retention.ts` and expiry selectivity
    - Implement the 30-day retention-window-elapsed calculation (from resolution timestamp) and the pending-and-past-date expiry selector
    - Ensure expiry transitions only change status and never touch `shift_attendance`
    - _Requirements: 9.1, 15.1, 15.5, 15.6_

  - [ ]* 4.6 Write property test for expiry selectivity
    - **Property 12: Expiry selectivity**
    - **Validates: Requirements 15.1, 15.5, 15.6**

  - [x] 4.7 Implement the shift resolver (pure) used by the verify route
    - Return the distinct matched shift keys (each ∈ {day, afternoon, night}, at most three) and an auto-select flag when exactly one distinct shift exists
    - _Requirements: 3.6, 3.7_

  - [ ]* 4.8 Write property test for shift resolution over matched deployments
    - **Property 2: Shift resolution over matched deployments**
    - **Validates: Requirements 3.6, 3.7**

  - [x] 4.9 Implement the submission retry policy module (pure)
    - Retry only on network/timeout conditions, at most 3 retries, inter-attempt delay in 2–10s; conclude with manual-fallback on exhaustion; zero retries on service rejection
    - _Requirements: 13.1, 13.4, 13.5_

  - [ ]* 4.10 Write property test for submission retry policy
    - **Property 11: Submission retry policy**
    - **Validates: Requirements 13.1, 13.4, 13.5**

  - [x] 4.11 Implement the rate-limit budget + Retry-After derivation helper
    - Wrap `rateLimit`/`getClientIp` to enforce ≤ 5 requests per client id per 60s and compute a whole-second `Retry-After` (min 1) for limited requests
    - _Requirements: 14.2, 14.3_

  - [ ]* 4.12 Write property test for rate-limit budget and Retry-After
    - **Property 19: Rate-limit budget and Retry-After**
    - **Validates: Requirements 14.2, 14.3**

- [x] 5. Checkpoint - Ensure all pure-module tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Verification route (`POST /api/attendance/checkin/verify`)
  - [x] 6.1 Implement `app/api/attendance/checkin/verify/route.ts`
    - Apply rate limiting first, then zod-validate `employee_code`, resolve `employee_uuid`, query `rota_assignments` for today, and return the resolved shifts via the shift resolver
    - Return `employee_not_found`, `not_assigned`, `validation`, `service_error`, or `rate_limited` reasons with no shift leaked on failure
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 14.1, 14.2, 14.3_

  - [ ]* 6.2 Write integration tests for the verify route
    - Cover seeded rota matches (zero/one/many), unknown employee code, service error, and rate-limit short-circuit
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.9, 3.10_

- [x] 7. Check-in route (`POST /api/attendance/checkin`)
  - [x] 7.1 Implement `app/api/attendance/checkin/route.ts`
    - Implement the ordered fail-fast pipeline: rate limit → parse multipart + validate → photo pre-store validation → coordinate/post validation → geofence eval → duplicate guard → photo upload (≤ 3 retries) → insert pending record → return `{ id, status: 'pending' }`
    - Map unique-violation to `duplicate_pending`; on post-upload insert failure attempt orphan-photo cleanup and return `insert_failed`; never persist a partial record
    - Declare `export const maxDuration = 60` so the photo upload + insert is not cut off by the Vercel Hobby 10s default
    - _Requirements: 5.1, 6.1, 6.2, 6.7, 6.9, 6.10, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.7, 12.1, 12.2, 12.3, 14.1, 14.2, 14.3, 14.4, 14.5_

  - [ ]* 7.2 Write integration tests for the check-in route
    - Cover in/out-of-geofence persistence, invalid/missing coordinates, unconfigured post, duplicate pending/present, photo rejection, upload-failure-no-record, and orphan cleanup on insert failure
    - _Requirements: 6.2, 6.7, 6.10, 7.1, 7.4, 7.5, 8.1, 8.2, 12.1, 12.2, 14.5_

  - [ ]* 7.3 Write concurrency integration test for duplicate prevention
    - Exercise concurrent submissions for the same slot against the real partial unique index; assert exactly one winner
    - **Property 9: At most one live record per slot**
    - **Validates: Requirements 12.3**

- [ ] 8. Photo access and resolution routes
  - [x] 8.1 Implement `app/api/attendance/checkin/[id]/photo/route.ts`
    - Verify Operations/Supervisor role via `getServerUser`/`getServerRoles`; generate a signed URL with `expiresIn: 300`
    - Return 403 (no URL) for unauthorized callers, 410 for expired photo paths, 502 on signing failure with no public fallback
    - _Requirements: 8.4, 8.5, 8.6, 9.5_

  - [ ]* 8.2 Write tests for the photo access route
    - Cover authorized signed-URL success, unauthorized 403, expired 410, and signing-failure 502
    - _Requirements: 8.4, 8.5, 8.6, 9.5_

  - [x] 8.3 Implement `app/api/attendance/checkin/[id]/resolve/route.ts`
    - Verify Operations/Supervisor role; approve (set approved + mark single matching `shift_attendance` present in one transaction) or reject (set rejected + reviewer notes ≤ 500)
    - Return 409 for already-resolved, 403 for insufficient permissions, and `attendance_slot_unresolved` (leave pending) on 0/>1 slot matches
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 8.4 Write tests for the resolution route
    - Cover approve→present, reject with notes, already-resolved 409, non-approver 403, and ambiguous-slot rollback
    - _Requirements: 11.2, 11.4, 11.5, 11.6_

- [x] 9. Check-in data service and maintenance jobs
  - [x] 9.1 Implement `src/services/supabase/QrCheckInService.ts`
    - Provide branch/role-scoped reads of pending records for the portals and resolution helpers used by the resolve route
    - _Requirements: 10.1, 11.1_

  - [x] 9.2 Implement `app/api/attendance/maintenance/expire/route.ts`
    - Export a `GET` handler (Vercel Cron invokes via GET) that rejects callers lacking the `CRON_SECRET` bearer token with 401; declare `export const maxDuration = 60`
    - Idempotently set past-date `pending` records to `expired`, processing a bounded oldest-first batch (`MAINTENANCE_BATCH_LIMIT`) per invocation to stay within the Hobby 60s ceiling, record-by-record with per-record error isolation; leave attendance and non-pending records unchanged
    - _Requirements: 15.1, 15.3, 15.4, 15.5, 15.6, 15.7_

  - [ ]* 9.3 Write tests for the expiry job
    - Cover selectivity (only past-date pending), attendance untouched, and per-record failure isolation
    - _Requirements: 15.1, 15.5, 15.6, 15.7_

  - [x] 9.4 Implement `app/api/attendance/maintenance/retention/route.ts`
    - Export a `GET` handler (Vercel Cron invokes via GET) that rejects callers lacking the `CRON_SECRET` bearer token with 401; declare `export const maxDuration = 60`
    - Idempotently delete photos whose 30-day retention window has elapsed, processing a bounded oldest-first batch (`MAINTENANCE_BATCH_LIMIT`) per invocation, mark `photo_expired` + null the path, retain metadata, and retry unresolved deletions next cycle
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 9.5 Write tests for the retention job
    - Cover window-elapsed deletion, metadata retention, and deletion-failure retry behavior
    - _Requirements: 9.2, 9.3, 9.4_

- [ ] 10. Checkpoint - Ensure all server-side tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Shared approval queue UI
  - [x] 11.1 Implement `useApprovalQueue.ts` and the queue view-model builder
    - Build a react-query hook returning pending records with derived display fields (photo ref, distance, map location, timestamp, employee id, post id) and out-of-geofence / low-accuracy indicators
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 11.2 Write property test for approval queue view-model completeness
    - **Property 8: Approval queue view-model completeness and indicators**
    - **Validates: Requirements 10.2, 10.3, 10.4**

  - [x] 11.3 Implement `ApprovalQueue.tsx` and `CheckInCard.tsx`
    - Render the queue with per-record photo (via photo route), Leaflet map marker, computed distance, badges, evidence placeholders on load failure, and an empty-state message
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6_

  - [ ]* 11.4 Write component tests for the queue and card
    - Cover evidence-unavailable placeholders and the empty-state message
    - _Requirements: 10.5, 10.6_

- [x] 12. Wire approval queue into both portals
  - [x] 12.1 Integrate the shared `ApprovalQueue` into the Supervisor portal
    - Mount the queue in the supervisor attendance area applying branch/role scope; wire approve/reject to the resolve route
    - _Requirements: 10.1, 11.1_

  - [x] 12.2 Integrate the shared `ApprovalQueue` into the Operations portal
    - Mount the queue in the operations attendance area applying branch/role scope; wire approve/reject to the resolve route
    - _Requirements: 10.1, 11.1_

- [x] 13. Per-post QR generation
  - [x] 13.1 Implement `app/api/attendance/qr/route.ts`
    - Operations-authenticated; validate `post_id` exists in `operational_posts` (404 "post not found"); return `formatAttendanceCode(post_id)`; never return a partial code on failure
    - _Requirements: 16.1, 16.2, 16.3_

  - [ ]* 13.2 Write tests for the QR generation route
    - Cover successful code content, non-existent post 404, and generation-failure handling
    - _Requirements: 16.2, 16.3_

  - [x] 13.3 Implement `src/modules/operations/components/attendance/QrPostCodes.tsx`
    - Render the returned code with `qrcode.react` into a printable view (QR image, post name, post code) with a print control and a retry on failure
    - _Requirements: 16.3, 16.4_

  - [ ]* 13.4 Write component test for the QR post codes UI
    - Cover printable-view contents and retry-on-error
    - _Requirements: 16.3, 16.4_

- [x] 14. Quick Attendance Scanner (public client)
  - [x] 14.1 Implement the GPS submission-gate predicate (pure)
    - Enable submission iff latitude ∈ −90..90, longitude ∈ −180..180, and accuracy is a number strictly greater than 0
    - _Requirements: 5.2_

  - [ ]* 14.2 Write property test for the client-side GPS submission gate
    - **Property 16: Client-side GPS submission gate**
    - **Validates: Requirements 5.2**

  - [x] 14.3 Implement `src/components/attendance/QuickAttendanceScanner.tsx`
    - Build the step machine (scan → permissions → enter code → select/auto shift → consent → capture → locate → submit) using `BarcodeDetector` with a lazy JS fallback, front-camera still capture, geolocation, consent timestamp (ISO 8601 UTC), the submission-gate predicate, and the retry policy; render the server's verdict and the fixed manual-fallback message
    - Responsive with no horizontal scroll at ≤ 1024px
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.3, 13.2, 13.3, 13.4, 13.5_

  - [x] 14.4 Wire the scanner to the `showQrScanner` control in `LoginForm.tsx`
    - Replace the existing TODO so activating the control opens the scanner without authentication within the required time budget
    - _Requirements: 1.1_

  - [ ]* 14.5 Write component tests for the scanner step machine
    - Cover code errors (malformed/non-attendance/30s timeout), permission-denied blocking with data retention, consent decline discarding location, GPS-fix timeout, and retry/manual-fallback vs service-rejection display
    - _Requirements: 1.1, 1.5, 1.6, 2.2, 2.3, 2.7, 4.5, 4.6, 5.1, 5.3, 13.2, 13.3_

- [x] 15. Schedule maintenance jobs
  - [x] 15.1 Configure Vercel Cron for the expire and retention routes
    - Add `vercel.json` cron entries on a fixed once-daily schedule (Vercel Hobby caps cron at once per day; a more frequent expression fails at deploy time). Use distinct times, e.g. `expire` at `0 3 * * *` and `retention` at `0 4 * * *`; this satisfies R15.2's "at least every 24 hours"
    - Set `CRON_SECRET` in the Vercel project env so the maintenance routes can authenticate the scheduler; do not expose the routes to unauthenticated callers
    - Note: Hobby cron timing is only guaranteed within the hour, so no downstream logic may depend on precise execution time
    - _Requirements: 15.2_

- [ ] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Deployment target is the **Vercel Hobby plan**: cron runs at most once daily, function duration is capped at 60s, and cron endpoints are invoked via GET. The maintenance routes (9.2, 9.4) reflect this with `GET` + `maxDuration = 60` + bounded batches, and the check-in route (7.1) sets `maxDuration = 60`. If moving to Pro, these constraints (daily cadence, batch bounds) can be relaxed.
- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific granular requirement clauses for traceability.
- Checkpoints ensure incremental validation at natural boundaries (pure modules, server routes, full feature).
- Property tests validate the 19 universal correctness properties from the design (min 100 iterations each, `fast-check`); unit/integration tests cover example scenarios, error branches, storage/portal wiring, and the concurrency winner.
- All 19 design properties are covered: P1→2.2, P2→4.8, P3→2.4, P4→2.5, P5→2.6, P6→3.2, P7→3.3, P8→11.2, P9→4.2 & 7.3, P10→4.3, P11→4.10, P12→4.6, P13→3.7, P14→3.9, P15→4.4, P16→14.2, P17→3.4, P18→3.5, P19→4.12.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "2.3", "3.6", "3.8", "4.1", "4.5", "4.7", "4.9", "4.11"] },
    { "id": 1, "tasks": ["3.1", "2.2", "2.4", "2.5", "2.6", "3.7", "3.9", "4.2", "4.3", "4.4", "4.6", "4.8", "4.10", "4.12", "9.1", "13.1", "14.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "3.4", "3.5", "6.1", "7.1", "8.1", "8.3", "9.2", "9.4", "11.1", "13.2", "14.2", "14.3"] },
    { "id": 3, "tasks": ["6.2", "7.2", "7.3", "8.2", "8.4", "9.3", "9.5", "11.2", "11.3", "13.3", "14.4"] },
    { "id": 4, "tasks": ["11.4", "12.1", "12.2", "13.4", "14.5", "15.1"] }
  ]
}
```
