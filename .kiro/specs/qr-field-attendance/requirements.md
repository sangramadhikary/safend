# Requirements Document

## Introduction

The QR Field Attendance feature adds a public, QR-based check-in flow for security guards and field employees of the Safend ERP application. An employee scans a QR code posted at a physical site, opens a public "Quick Attendance Scanner" without logging in, enters their employee code, captures a single self-photo and their GPS location, and submits a check-in. The server verifies that the employee is deployed to that post today, computes the distance from the captured location to the post's geofence, and records a pending check-in. The pending check-in surfaces as an approval queue in both the Supervisor portal and the ERP Operations portal; any single approver from either portal can approve it, which marks the employee present for that shift slot.

Because the scanner is used by unauthenticated clients, all verification (deployment lookup, geofence distance) is performed server-side through public API routes using the service-role key, protected by rate limiting. Captured photos are treated as biometric-adjacent personal data: consent is required at capture, photos are stored in a private storage bucket accessed only via signed URLs, and photos are automatically deleted after a defined retention window.

This document specifies the requirements for the scan-and-verify flow, server-side deployment verification, geofence verification, photo capture and consent, private photo storage and retention, the pending/approval lifecycle, dual-portal visibility, network resilience, rate limiting and abuse protection, and per-post QR generation, including the associated edge cases.

## Glossary

- **Scanner**: The public, unauthenticated "Quick Attendance Scanner" client UI wired to the existing `showQrScanner` button in `src/components/LoginForm.tsx`.
- **QR_Code**: A printed code posted at a physical site that encodes the post identifier (`post_id`).
- **Post**: A physical site/duty location represented by the `operational_posts` table, including a `location` JSONB with `latitude`, `longitude`, and optional `geofenceRadius`.
- **Employee_Code**: The human-entered employee identifier (`employees.employee_id`, e.g. "EMP001").
- **Employee_UUID**: The internal `employees.id` UUID used as the join key in `rota_assignments.employee_id`.
- **Deployment**: An employee-to-post assignment for a date, stored in `rota_assignments` (`rota_date`, `post_id`, `shift_key`, `service_type_key`, `employee_id`, `employee_name`, `employee_code`).
- **Shift_Key**: One of `day`, `afternoon`, `night` identifying a shift on a deployment.
- **Geofence**: A circular boundary around a Post defined by the Post's stored coordinates and `geofenceRadius` (in meters).
- **Default_Geofence_Radius**: The radius of 50 meters used when a Post has no configured `geofenceRadius`.
- **Verification_Service**: The server-side public API route (`/api/attendance/checkin/verify`) that performs deployment lookup using the service-role key.
- **Check_In_Service**: The server-side public API route (`/api/attendance/checkin`) that recomputes geofence distance, stores the photo, and inserts the check-in using the service-role key.
- **Check_In_Record**: A row in the new `qr_check_ins` table representing a submitted check-in and its lifecycle status (`pending`, `approved`, `rejected`, `expired`).
- **Photo_Bucket**: The new private Supabase Storage bucket holding attendance photos, accessible to approvers only via signed URLs.
- **Approver**: A user with the Supervisor role or Operations role who can review check-ins.
- **Approval_Queue**: The list of `pending` Check_In_Records displayed in the Supervisor portal and the Operations portal.
- **Attendance_Record**: The row in `shift_attendance` (`attendance_date`, `post_id`, `shift_key`, `service_type_key`, `slot_index`, `employee_id`, `status`, `marked_at`, `marked_by`) marked `present` on approval.
- **Rate_Limiter**: The existing per-instance limiter in `src/lib/rateLimit.ts` applied to public routes.
- **Retention_Window**: The configured duration (30 days, measured from resolution timestamp) after which resolved attendance photos are deleted.
- **Consent_Text**: The explicit notice presented at photo capture time describing collection and use of the photo and location data.

## Requirements

### Requirement 1: Launch Public Scanner from QR Code

**User Story:** As a field employee, I want to open the attendance scanner from the login page and scan a posted QR code, so that I can begin a check-in for the site I am at without logging in.

#### Acceptance Criteria

1. WHEN the user activates the `showQrScanner` control on the supervisor login page, THE Scanner SHALL open the camera-based scanning interface within 3 seconds and SHALL NOT require the user to authenticate.
2. WHEN the Scanner reads a QR_Code whose content matches the attendance code scheme and encodes a syntactically valid `post_id`, THE Scanner SHALL extract the `post_id` and proceed to the check-in flow for that `post_id`.
3. IF the scanned QR_Code content matches the attendance code scheme but does not contain a syntactically valid `post_id`, THEN THE Scanner SHALL display a message stating the attendance code is malformed and SHALL present a rescan control that returns the Scanner to the scanning state.
4. IF the scanned QR_Code content does not match the attendance code scheme, THEN THE Scanner SHALL display a message stating the code is not an attendance code and SHALL present a rescan control that returns the Scanner to the scanning state.
5. IF the Scanner does not read any QR_Code within 30 seconds of the scanning interface opening, THEN THE Scanner SHALL display a message stating no code was detected and SHALL present a rescan control that restarts scanning.
6. WHILE the supervisor login page is displayed on a viewport with a width of 1024 pixels or less, THE Scanner SHALL present the `showQrScanner` control and render the scanning interface without horizontal scrolling.

### Requirement 2: Request Device Permissions

**User Story:** As a field employee, I want the scanner to request camera, location, and notification access, so that the check-in can capture the required photo and coordinates.

#### Acceptance Criteria

1. WHEN the field employee initiates a check-in, THE Scanner SHALL prompt for Camera permission, precise Location permission, and Notification permission before enabling photo capture.
2. IF Camera permission is denied, THEN THE Scanner SHALL display a message indicating that camera access is required, SHALL block submission of the check-in, and SHALL retain any check-in data already entered.
3. IF precise Location permission is denied, THEN THE Scanner SHALL display a message indicating that location access is required, SHALL block submission of the check-in, and SHALL retain any check-in data already entered.
4. WHEN the check-in photo is captured, THE Scanner SHALL use the front-facing camera only and SHALL NOT record video or audio.
5. IF Notification permission is denied, THEN THE Scanner SHALL allow the check-in to proceed and SHALL NOT block submission of the check-in.
6. WHEN both Camera permission and precise Location permission are granted, THE Scanner SHALL enable submission of the check-in.
7. IF a precise location fix cannot be obtained within 30 seconds after precise Location permission is granted, THEN THE Scanner SHALL display a message indicating that the location could not be determined and SHALL block submission of the check-in.

### Requirement 3: Enter Employee Code and Verify Deployment (Server-Side)

**User Story:** As an operations manager, I want the system to verify server-side that the entered employee is deployed to the scanned post today, so that only assigned staff can check in and spoofing is prevented.

#### Acceptance Criteria

1. WHEN the user submits an Employee_Code and a `post_id` to the Verification_Service, THE Verification_Service SHALL look up Deployment records in `rota_assignments` matching the `post_id`, the current calendar date in the application's configured time zone, and the Employee_UUID resolved from the Employee_Code.
2. THE Verification_Service SHALL perform the deployment lookup using the service-role key within the public API route and SHALL NOT rely on client-provided verification results.
3. IF no `employees` record matches the submitted Employee_Code, THEN THE Verification_Service SHALL return a rejection response stating that the employee code was not found and SHALL NOT return any Shift_Key.
4. IF no Deployment matches the employee, post, and current calendar date, THEN THE Verification_Service SHALL return a rejection response stating that the employee is not assigned to this post today and SHALL NOT return any Shift_Key.
5. THE Verification_Service SHALL confirm the Employee_Code matches an existing `employees` record before evaluating any Deployment matches.
6. WHEN exactly one Deployment matches the employee, post, and current calendar date, THE Verification_Service SHALL return that single Shift_Key and its `service_type_key`, and THE Scanner SHALL select it automatically without prompting.
7. WHEN more than one Deployment matches the employee, post, and current calendar date, THE Verification_Service SHALL return the list of matching Shift_Keys (at most the three values day, afternoon, night), and THE Scanner SHALL require the user to select exactly one Shift_Key before capturing the photo.
8. IF the submitted Employee_Code is empty, whitespace-only, or longer than 50 characters, THEN THE Verification_Service SHALL reject the request before performing any lookup and SHALL return a validation error.
9. IF the deployment lookup fails due to a service error, THEN THE Verification_Service SHALL return an error response, SHALL NOT return any Shift_Key, and SHALL NOT record a check-in.
10. WHEN the Verification_Service processes a request that passed rate limiting, THE Verification_Service SHALL return its response within 5 seconds.

### Requirement 4: Capture Photo with Explicit Consent

**User Story:** As a field employee, I want to be told how my photo and location will be used and to agree before capture, so that my personal data is collected with informed consent.

#### Acceptance Criteria

1. WHEN the Scanner reaches the photo capture step, THE Scanner SHALL display the Consent_Text describing the collection, use, and retention of the photo and location data within 2 seconds of reaching the step.
2. WHILE the user has not accepted the Consent_Text, THE Scanner SHALL block navigation to the photo capture screen and SHALL keep the accept action as the only means of proceeding.
3. WHEN the user accepts the Consent_Text, THE Scanner SHALL capture exactly one still photo from the front-facing camera within 2 seconds of acceptance.
4. WHEN the user accepts the Consent_Text, THE Scanner SHALL record the acceptance timestamp in ISO 8601 UTC format and include it with the check-in submission.
5. IF the user declines or dismisses the Consent_Text without accepting, THEN THE Scanner SHALL abort the photo capture step, discard any location data collected for the current check-in, and return the user to the step preceding photo capture.
6. IF the front-facing camera is unavailable or camera permission is denied at the moment of capture, THEN THE Scanner SHALL abort the capture, retain the recorded consent acceptance timestamp, and display an error message indicating that the camera could not be accessed.

### Requirement 5: Capture Geolocation

**User Story:** As a field employee, I want the scanner to capture my GPS coordinates and accuracy, so that the server can confirm I am physically at the post.

#### Acceptance Criteria

1. WHEN the user submits a check-in, THE Scanner SHALL include the captured GPS latitude in decimal degrees, GPS longitude in decimal degrees, and reported horizontal GPS accuracy in meters in the submission.
2. WHILE the Scanner has not obtained a GPS position whose latitude is within -90 to 90 degrees, whose longitude is within -180 to 180 degrees, and whose reported horizontal accuracy is a numeric value greater than 0 meters, THE Scanner SHALL block submission of the check-in.
3. IF the device does not return a GPS position meeting the criterion 2 validity conditions within 30 seconds of starting the location capture step, THEN THE Scanner SHALL display a message stating that location could not be obtained and SHALL allow the user to retry the location capture step.

### Requirement 6: Server-Side Geofence Verification

**User Story:** As an operations manager, I want the server to recompute the distance from the captured location to the post and compare it against the geofence, so that geofence checks cannot be bypassed by the client.

#### Acceptance Criteria

1. WHEN the Check_In_Service receives a check-in with valid GPS coordinates, THE Check_In_Service SHALL recompute the distance in meters between the submitted GPS coordinates and the Post's stored `latitude` and `longitude` using the haversine great-circle formula with an Earth radius of 6,371,000 meters, rounded to one decimal place.
2. THE Check_In_Service SHALL perform the distance computation and geofence comparison server-side using the service-role key and SHALL NOT rely on any client-computed distance or within-geofence value.
3. WHERE the Post has a configured `geofenceRadius` between 1 and 10,000 meters inclusive, THE Check_In_Service SHALL compare the computed distance against that `geofenceRadius`.
4. WHERE the Post has no configured `geofenceRadius`, THE Check_In_Service SHALL compare the computed distance against the Default_Geofence_Radius of 50 meters.
5. WHEN the computed distance is strictly less than the applicable geofence radius, THE Check_In_Service SHALL set the within-geofence flag to true on the Check_In_Record.
6. WHEN the computed distance is greater than or equal to the applicable geofence radius, THE Check_In_Service SHALL set the within-geofence flag to false on the Check_In_Record.
7. THE Check_In_Service SHALL store the computed distance in meters and the reported GPS accuracy in meters on the Check_In_Record.
8. WHERE the reported GPS accuracy is greater than the applicable geofence radius, THE Check_In_Service SHALL flag the Check_In_Record as low-accuracy for approver attention.
9. IF the submitted GPS coordinates are missing, non-numeric, or outside the valid range of -90 to 90 degrees latitude or -180 to 180 degrees longitude, THEN THE Check_In_Service SHALL reject the check-in, return an error indicating invalid location coordinates, and SHALL NOT create a Check_In_Record.
10. IF the Post's stored `latitude` or `longitude` is missing or outside the valid range of -90 to 90 degrees latitude or -180 to 180 degrees longitude, THEN THE Check_In_Service SHALL reject the check-in and return an error indicating the Post location is not configured.
11. IF the reported GPS accuracy is missing or non-numeric, THEN THE Check_In_Service SHALL flag the Check_In_Record as low-accuracy for approver attention.

### Requirement 7: Create Pending Check-In Record

**User Story:** As a field employee, I want my check-in stored as pending with all evidence attached, so that an approver can review and confirm my attendance.

#### Acceptance Criteria

1. WHEN the Check_In_Service accepts a validated submission, THE Check_In_Service SHALL create a Check_In_Record in `qr_check_ins` with status `pending` within 3 seconds of accepting the submission.
2. WHEN the Check_In_Service creates the Check_In_Record, THE Check_In_Service SHALL store the following non-null fields on the record: `post_id`, Employee_Code, Employee_UUID, selected Shift_Key, `service_type_key`, check-in date, GPS latitude (range -90.0 to 90.0 degrees), GPS longitude (range -180.0 to 180.0 degrees), GPS accuracy (in meters, 0 or greater), computed distance (in meters, 0 or greater), within-geofence flag (boolean true or false), and photo storage path.
3. WHEN the Check_In_Service creates the Check_In_Record, THE Check_In_Service SHALL persist the record even when the within-geofence flag is false, and SHALL set the within-geofence flag to false so that the out-of-geofence condition is visible to Approvers.
4. WHEN the Check_In_Record is successfully created, THE Check_In_Service SHALL return a confirmation to the Scanner within 3 seconds that includes the created record identifier and a status value of `pending`.
5. IF the Check_In_Service fails to create the Check_In_Record, THEN THE Check_In_Service SHALL return an error response to the Scanner indicating that the check-in was not saved, and SHALL NOT persist any partial Check_In_Record.
6. IF the submission is missing any of the required fields listed in criterion 2, THEN THE Check_In_Service SHALL reject the submission, SHALL return an error response indicating which required field is missing, and SHALL NOT create a Check_In_Record.

### Requirement 8: Private Photo Storage

**User Story:** As a data protection officer, I want attendance photos stored privately and viewable only through signed URLs, so that biometric-adjacent data is not publicly accessible.

#### Acceptance Criteria

1. WHEN the Check_In_Service stores a captured photo, THE Check_In_Service SHALL upload the photo to the private Photo_Bucket using the service-role key within 30 seconds of receiving the photo.
2. IF the photo upload to the Photo_Bucket fails, THEN THE Check_In_Service SHALL retry the upload up to 3 times, and if all attempts fail, SHALL return an error response indicating upload failure and SHALL NOT create a Check_In_Record referencing an unstored photo.
3. THE Photo_Bucket SHALL be configured as private and SHALL NOT allow public read access.
4. WHEN an authorized Approver requests a Check_In_Record photo, THE system SHALL provide access through a signed URL that expires 300 seconds after generation.
5. IF a request for a Check_In_Record photo originates from a user who is not an authorized Approver for that record, THEN THE system SHALL deny the request and SHALL NOT generate a signed URL.
6. IF signed URL generation fails, THEN THE system SHALL leave the photo inaccessible, SHALL return an error response indicating the photo cannot be accessed, and SHALL NOT expose an alternative public access path.
7. THE Check_In_Service SHALL store the photo storage path on the Check_In_Record and SHALL NOT store a public URL for the photo.

### Requirement 9: Photo Retention and Auto-Deletion

**User Story:** As a data protection officer, I want photos automatically deleted after a retention window once a check-in is resolved, so that personal data is not kept longer than necessary.

#### Acceptance Criteria

1. WHILE a Check_In_Record has status `approved` or `rejected`, THE system SHALL retain its photo for the Retention_Window of 30 days measured from the resolution timestamp, where the resolution timestamp is the approval timestamp for an `approved` record or the review timestamp for a `rejected` record.
2. WHEN the system next processes a resolved Check_In_Record whose Retention_Window has elapsed, THE system SHALL delete the photo from the Photo_Bucket.
3. WHEN a photo is deleted after the Retention_Window, THE system SHALL mark the photo storage path on the Check_In_Record as expired and SHALL retain all non-photo check-in metadata unchanged.
4. IF deletion of a photo from the Photo_Bucket fails, THEN THE system SHALL leave the Check_In_Record's photo storage path unchanged, SHALL record the deletion as unresolved, and SHALL retry the deletion on the next processing cycle.
5. WHEN a Check_In_Record's photo storage path has been marked as expired, THE system SHALL NOT generate a signed URL for that photo and SHALL treat the photo as inaccessible.

### Requirement 10: Approval Queue Visibility in Both Portals

**User Story:** As a supervisor or operations user, I want to see pending check-ins with their evidence in my portal, so that I can review and act on them.

#### Acceptance Criteria

1. WHEN a Check_In_Record's status becomes `pending`, THE Approval_Queue SHALL make that record available in both the Supervisor portal and the Operations portal within 5 seconds of the status change, subject to each portal's own access-control and filtering rules.
2. WHEN the Approval_Queue is loaded, THE Approval_Queue SHALL display for each pending Check_In_Record all of the following fields: the photo, the computed distance in meters, the map location, the check-in timestamp, the employee identifier, and the post identifier.
3. WHERE a Check_In_Record has the within-geofence flag set to false, THE Approval_Queue SHALL display a visible out-of-geofence indicator on that record.
4. WHERE a Check_In_Record is flagged as low-accuracy, THE Approval_Queue SHALL display a visible low-accuracy indicator on that record.
5. IF a pending Check_In_Record's photo or map location cannot be loaded, THEN THE Approval_Queue SHALL display a placeholder indicating that the evidence is unavailable and SHALL continue to display the remaining fields for that record.
6. WHEN the Approval_Queue is loaded and no Check_In_Record with status `pending` exists within the current user's access-control scope, THE Approval_Queue SHALL display an empty-state message indicating that there are no pending check-ins.

### Requirement 11: Either-Approver Approval and Attendance Marking

**User Story:** As a supervisor or operations user, I want any single approver from either portal to confirm a check-in and mark attendance, so that approvals are not blocked on one specific role.

#### Acceptance Criteria

1. WHEN an Approver with the Supervisor role or the Operations role approves a `pending` Check_In_Record, THE system SHALL set the Check_In_Record status to `approved` and SHALL record the approving user's identifier and the approval timestamp.
2. WHEN a Check_In_Record transitions to `approved`, THE system SHALL set the single matching Attendance_Record in `shift_attendance` to status `present`, matched by attendance date, `post_id`, Shift_Key, `service_type_key`, and Employee_UUID, and SHALL record `marked_at` and `marked_by`.
3. WHEN an Approver rejects a `pending` Check_In_Record, THE system SHALL set the Check_In_Record status to `rejected` and SHALL record the reviewing user's identifier, the review timestamp, and the reviewer notes, where reviewer notes are at most 500 characters.
4. IF a Check_In_Record is already in status `approved` or `rejected` when an approval or rejection is submitted, THEN THE system SHALL reject the action, SHALL leave the Check_In_Record status unchanged, and SHALL return a message stating the check-in has already been resolved.
5. IF a user who holds neither the Supervisor role nor the Operations role submits an approval or rejection, THEN THE system SHALL reject the action, SHALL leave the Check_In_Record status unchanged, and SHALL return an insufficient-permissions error.
6. IF zero or more than one Attendance_Record matches the attendance date, `post_id`, Shift_Key, `service_type_key`, and Employee_UUID during an approval, THEN THE system SHALL not partially mark attendance, SHALL leave the Check_In_Record in status `pending`, and SHALL return an error indicating the attendance slot could not be resolved.

### Requirement 12: Duplicate Check-In Handling

**User Story:** As an operations manager, I want the system to prevent duplicate attendance for the same slot, so that a single deployment slot is not marked present more than once.

#### Acceptance Criteria

1. IF a `pending` Check_In_Record already exists for the same Employee_UUID, `post_id`, check-in date (determined from the application's configured local time zone), and Shift_Key, THEN THE Check_In_Service SHALL reject the new submission, SHALL NOT create a new Check_In_Record, SHALL leave the existing `pending` Check_In_Record unchanged, and SHALL return a message indicating a check-in is already pending for this slot.
2. IF the Attendance_Record for the same attendance date (determined from the application's configured local time zone), `post_id`, Shift_Key, `service_type_key`, and Employee_UUID is already `present`, THEN THE Check_In_Service SHALL reject the new submission, SHALL NOT create a new Check_In_Record, SHALL leave the existing `present` Attendance_Record unchanged, and SHALL return a message indicating attendance is already marked for this slot.
3. IF two or more check-in submissions with the same Employee_UUID, `post_id`, check-in date, and Shift_Key are received concurrently, THEN THE Check_In_Service SHALL accept exactly one submission and SHALL reject each remaining submission with a message indicating a check-in already exists for this slot.

### Requirement 13: Network Resilience and Manual Fallback

**User Story:** As a field employee in an area with poor connectivity, I want the app to retry a failed submission and tell me what to do if it still fails, so that my attendance can still be recorded.

#### Acceptance Criteria

1. IF a check-in submission fails because the Scanner receives no response from the Check_In_Service within 30 seconds or the device reports no network connectivity, THEN THE Scanner SHALL queue the submission and perform up to 3 additional retry attempts, waiting at least 2 seconds and no more than 10 seconds between consecutive attempts.
2. WHILE a queued submission is awaiting or undergoing a retry attempt, THE Scanner SHALL display an indication that the submission is being retried and SHALL block starting a new check-in.
3. WHEN a queued submission succeeds on any of the retry attempts, THE Scanner SHALL display the pending-approval confirmation and SHALL clear the submission from the queue.
4. IF all 3 retry attempts fail with a network error or no-connectivity condition, THEN THE Scanner SHALL display only the message "Contact your Supervisor / Area Officer to mark your attendance manually." and SHALL NOT display a pending-approval confirmation.
5. IF a check-in submission fails because the Check_In_Service returns a rejection response (including deployment, geofence, duplicate, validation, or rate-limit rejections), THEN THE Scanner SHALL NOT retry the submission and SHALL display the rejection reason returned by the service instead of the manual-fallback message.

### Requirement 14: Rate Limiting and Abuse Protection for Public Endpoints

**User Story:** As a system administrator, I want the public check-in endpoints rate-limited, so that unauthenticated abuse and spam submissions are blunted.

#### Acceptance Criteria

1. WHEN the Verification_Service or the Check_In_Service receives a request, THE system SHALL apply the Rate_Limiter keyed by a client identifier derived from the first entry of the `x-forwarded-for` header, falling back to `x-real-ip`, then `cf-connecting-ip`, then a value of "unknown".
2. WHEN the Rate_Limiter evaluates a request, THE system SHALL allow at most 5 requests per client identifier within a rolling 60-second window, evaluated before performing any deployment lookup or check-in insert.
3. IF a client exceeds the request limit within the window, THEN THE system SHALL return a rate-limit response with a Retry-After value in whole seconds until the window resets (rounded up, minimum 1), and SHALL NOT perform the deployment lookup and SHALL NOT perform the check-in insert.
4. THE Check_In_Service SHALL, before storing a submitted photo, validate that the photo size is greater than 0 bytes and no more than 10,485,760 bytes and that its content type is image/jpeg or image/png.
5. IF the submitted photo exceeds the maximum size or is not an accepted image content type, THEN THE Check_In_Service SHALL reject the submission, SHALL NOT store the photo, and SHALL NOT create a Check_In_Record.

### Requirement 15: Expired and Unresolved Check-In Handling

**User Story:** As an operations manager, I want stale pending check-ins to be expired, so that the approval queue reflects only actionable items.

#### Acceptance Criteria

1. WHILE a Check_In_Record has status `pending` and its check-in date is earlier than the current date in the application's configured time zone, WHEN the expiration process runs, THE system SHALL set that Check_In_Record status to `expired`.
2. THE system SHALL run the expiration process at least once every 24 hours.
3. WHEN a Check_In_Record is set to `expired`, THE system SHALL remove it from the Approval_Queue.
4. WHEN a Check_In_Record is set to `expired`, THE system SHALL make it available in a separate expired-items section for audit purposes for no less than 90 days.
5. WHEN a Check_In_Record is set to `expired`, THE system SHALL leave the corresponding Attendance_Record unchanged.
6. THE expiration process SHALL only change records whose status is `pending` and SHALL leave `approved` and `rejected` records unchanged.
7. IF setting a Check_In_Record to `expired` fails, THEN THE system SHALL leave that record in status `pending`, SHALL keep it in the Approval_Queue, SHALL record an error indication, and SHALL continue processing the remaining records.

### Requirement 16: Per-Post QR Code Generation

**User Story:** As an operations user, I want to generate and print a QR code for each post, so that field employees can scan the correct code at the site.

#### Acceptance Criteria

1. WHEN an operations user requests a QR_Code for a Post from Operations post management, THE system SHALL generate a QR_Code whose encoded content is a well-formed attendance code containing that Post's `post_id`, such that the Scanner extracts the same `post_id` per Requirement 1.
2. IF an operations user requests a QR_Code for a `post_id` that does not exist in `operational_posts`, THEN THE system SHALL reject the request, SHALL NOT generate a QR_Code, and SHALL display a message indicating that the post could not be found.
3. IF QR_Code generation fails, THEN THE system SHALL display an error message indicating that the QR code could not be generated, SHALL NOT display a partial or invalid QR_Code, and SHALL allow the operations user to retry generation.
4. WHEN a QR_Code has been generated for a Post, THE system SHALL present a printable view containing the QR_Code image, the Post name, and the Post code, and SHALL provide a control to send that view to print.
5. FOR ALL Posts, each time a QR_Code is generated for the same Post, THE system SHALL produce a QR_Code that, when scanned by the Scanner, resolves to that same Post's `post_id`.
