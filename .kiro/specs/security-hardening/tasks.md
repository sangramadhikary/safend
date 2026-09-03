# Implementation Plan: Security Hardening

## Overview

This plan converts the security-hardening design into incremental coding tasks. It delivers two coupled outputs: (1) the assessment artifacts (attack-surface registry, threat model, mechanisms, finding registry, remediation plan) authored as version-controlled documents, and (2) the code controls, with the pure-function security controls extracted into `src/lib/security/` so they can be verified by property-based tests.

The implementation language is **TypeScript** (matching the design and the existing Next.js 16 / React 19 codebase). Property tests use **fast-check 3.x** with **Vitest 2.x** (already in `package.json`; `npm test` runs `vitest --run`). Each of the 19 correctness properties is implemented by a single fast-check property test running a minimum of 100 iterations (`fc.assert(fc.property(...), { numRuns: 100 })`) and tagged with a comment of the form `// Feature: security-hardening, Property {number}: {property_text}`.

Tasks marked with `*` are optional (tests) and can be skipped for a faster MVP. Each task references the specific requirement clauses it satisfies.

## Tasks

- [x] 1. Set up the security control module and shared types
  - [x] 1.1 Create the security module scaffold and types
    - Create the `src/lib/security/` directory and a barrel `src/lib/security/index.ts`
    - Add `src/lib/security/types.ts` with the assessment and control types from the design (`ExposureClass`, `AttackerCapability`, `ThreatCategory`, `Severity`, `VerificationResult`, `PriorAuditStatus`, `AttackSurface`, `Mechanism`, `Finding`, `RemediationTask`, `VerificationResultRecord`)
    - Create the test directories `src/lib/security/__tests__/` and `src/lib/__tests__/`
    - _Requirements: 1.1, 3.1, 9.2_

- [ ] 2. Author the security assessment artifacts
  - [x] 2.1 Author the attack-surface registry
    - Create `.kiro/specs/security-hardening/assessment/attack-surfaces.md`
    - Enumerate every attack surface (each `app/api/**` route, the Express PDF route, marketing pages, the public employee-verification flow, client/employee portals, and the Supabase interface) with source location and exactly one exposure class; default undeterminable surfaces to `publicly-exposed` with a manual-review flag
    - _Requirements: 1.1, 1.3, 1.7_

  - [x] 2.2 Author the threat-model mapping
    - Create `.kiro/specs/security-hardening/assessment/threat-model.md`
    - Document the in-scope threat categories, map each surface to at least one applicable category, and record the assumed attacker capability per surface-category pair
    - _Requirements: 1.2, 1.4, 1.5_

  - [-] 2.3 Author the mechanism documentation
    - Create `.kiro/specs/security-hardening/assessment/mechanisms.md`
    - Describe each in-scope category's mechanism (entry surface, attacker input, weakness, impact, preconditions, repo-relative affected paths) with no remediation language; record any category with no surface as not-applicable with a reason
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.4 Author the finding registry with verification and severities
    - Create `.kiro/specs/security-hardening/assessment/findings.md`
    - Re-verify each candidate finding against current code via a documented, reproducible procedure (controlled-environment only, no data-damaging payloads); record a unique id, `confirmed | not-exploitable | partially-mitigated | unverified`, prior-audit status, repro detail or unverified reason, and a severity for each confirmed finding
    - Include the assessment-only findings: hardcoded-secret scan + client-bundle scan results, RLS `USING (true)`/anon-CRUD tables, code-referenced tables with no SQL definition, service-role routes lacking guards, quotation-PDF schema-validation outcome, React-escaping outcome, header/CORS presence, PII-returning endpoints, and audit-log placeholder values
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.6, 6.1, 6.8, 7.1, 8.3, 8.6, 11.5, 12.1, 13.4, 15.3_

- [ ] 3. Implement string-sanitization controls and property tests
  - [x] 3.1 Implement the search-term sanitizer
    - Add `src/lib/security/search-sanitizer.ts` exporting `sanitizeSearchTerm(raw)`: remove structural/wildcard chars (`, ( ) . : * %`), keep the safe set (alphanumerics, spaces, hyphens, apostrophes), cap at 50 chars; export a query-gate helper that yields empty when the sanitized term is shorter than 2 chars
    - _Requirements: 8.2, 12.3, 12.4_

  - [-] 3.2 Write property test for the search-term sanitizer
    - **Property 6: Search-term sanitization removes structural characters, is idempotent, and bounds length**
    - **Validates: Requirements 8.2, 12.3, 12.4**

  - [x] 3.3 Implement the header-value sanitizer
    - Add `src/lib/security/header-sanitizer.ts` exporting `sanitizeHeaderValue(value)`: strip control chars (code points below 0x20) and path separators (`/` and `\`)
    - _Requirements: 8.5_

  - [-] 3.4 Write property test for the header-value sanitizer
    - **Property 7: Header-value sanitization strips control characters and path separators**
    - **Validates: Requirements 8.5**

  - [x] 3.5 Implement the path/folder sanitizer
    - Add `src/lib/security/path-sanitizer.ts` exporting `sanitizeKeySegment(value)` (replace every char outside `[a-zA-Z0-9.-]` with `_`, preserving length) and `isAllowedFolder(folder)` (reject `..`, leading `/`, backslash, any char outside `[a-zA-Z0-9_-/]`, and non-allowlisted prefixes)
    - _Requirements: 9.5, 9.6_

  - [-] 3.6 Write property test for folder validation
    - **Property 10: Folder validation rejects traversal and out-of-allowlist paths**
    - **Validates: Requirements 9.5**

  - [-] 3.7 Write property test for object-key segment sanitization
    - **Property 11: Object-key segment sanitization yields only safe characters**
    - **Validates: Requirements 9.6**

- [ ] 4. Implement upload content-type controls and property tests
  - [x] 4.1 Implement the content-type control module
    - Add `src/lib/security/content-type.ts` exporting `isAllowedType(declaredType)` (image ∪ video ∪ document union), `contentMatchesDeclaredType(leadingBytes, declaredType)` (magic-byte match for JPEG/PNG/GIF/WEBP/BMP/PDF/ZIP-OOXML/OLE2; pass-through for unsignable types), `maxSizeForType(declaredType)` (10 MB image, 100 MB video, 50 MB document), and `requiresAttachment(declaredType)` (true for `image/svg+xml`, `text/plain`, `text/csv`, `application/rtf`)
    - _Requirements: 9.2, 9.3, 9.4, 9.7_

  - [-] 4.2 Write property test for magic-byte verification
    - **Property 8: Magic-byte verification matches declared type signatures**
    - **Validates: Requirements 9.3**

  - [-] 4.3 Write property test for upload type/size acceptance
    - **Property 9: Upload acceptance enforces type membership and per-category size caps**
    - **Validates: Requirements 9.2, 9.4**

  - [-] 4.4 Write property test for attachment disposition
    - **Property 12: Inline-unsafe types map to an attachment disposition**
    - **Validates: Requirements 9.7**

- [ ] 5. Implement lookup-input validators and property test
  - [x] 5.1 Implement the lookup validators
    - Add `src/lib/security/lookups.ts` exporting `isValidGSTIN(gstin)` (15-char GSTIN pattern) and `isValidPincode(pincode)` (exactly six digits)
    - _Requirements: 10.1, 10.2, 10.3_

  - [-] 5.2 Write property test for lookup validators
    - **Property 13: Lookup-input validators accept only well-formed GSTIN and pincode values**
    - **Validates: Requirements 10.1, 10.2, 10.3**

- [ ] 6. Implement PII projection and property test
  - [x] 6.1 Implement the verification-field projector
    - Add `src/lib/security/pii.ts` exporting `projectVerificationFields(employee)` that returns only the verification-field allowlist (`employee_id`, `name`, `department`, `designation`, `join_date`, `status`, `photo_url`, `gender`)
    - _Requirements: 12.2_

  - [-] 6.2 Write property test for PII projection
    - **Property 15: PII projection exposes only allowlisted fields**
    - **Validates: Requirements 12.2**

- [x] 7. Checkpoint - pure-function controls
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement secrets bootstrap and remove silent fallbacks
  - [x] 8.1 Implement the required-secret bootstrap validator
    - Add `src/lib/security/env-bootstrap.ts` exporting a validator that accepts only when every required secret variable is present and non-empty after trimming, otherwise rejects with an error naming a genuinely missing/empty variable
    - _Requirements: 4.3_

  - [-] 8.2 Write property test for the secret bootstrap
    - **Property 1: Required-secret bootstrap fails fast and names a missing variable**
    - **Validates: Requirements 4.3**

  - [x] 8.3 Wire the bootstrap and remove silent fallbacks
    - Invoke the bootstrap validator at server module load; replace the silent fallbacks (`?? ''`, `'https://placeholder.supabase.co'`) in `app/api/upload/route.ts` and `src/integrations/supabase/client.ts` with fail-fast reads
    - _Requirements: 4.2, 4.3_

- [ ] 9. Implement authorization decision logic and property tests
  - [x] 9.1 Implement the access-decision and role utilities
    - Add `src/lib/security/access-decision.ts` exporting: an access decision that returns "allow" only when the session is confirmed and the resolved roles intersect the route-allowed set (or it is empty) and never substitutes a default role when unconfirmed; `validateRequestedRoles(roles)` enforcing a non-empty assignable-roles allowlist; and `hasStaffRole(roles)` for the ERP staff set (admin, hr, accounts, operations, sales, office-admin)
    - _Requirements: 5.8, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [-] 9.2 Write property test for the access decision
    - **Property 2: Access is denied unless the session is confirmed and the role is authorized**
    - **Validates: Requirements 5.8, 7.2, 7.3, 7.4**

  - [-] 9.3 Write property test for requested-role validation
    - **Property 3: Requested-role validation enforces the assignable allowlist**
    - **Validates: Requirements 7.5**

  - [-] 9.4 Write property test for the staff-role gate
    - **Property 4: Destructive-operation gate admits only ERP staff roles**
    - **Validates: Requirements 7.6, 7.7**

  - [x] 9.5 Implement request-body schema validation
    - Add `src/lib/security/request-validation.ts` using zod to validate a request body against a schema and enforce a per-field maximum of 10,000 characters, returning a rejection without mutating the input
    - _Requirements: 8.1_

  - [-] 9.6 Write property test for request-body validation
    - **Property 5: Request-body validation enforces schema and the per-field length cap**
    - **Validates: Requirements 8.1**

- [ ] 10. Wire server-side session verification and route protection
  - [-] 10.1 Implement the server session resolver
    - Add `src/lib/auth/server-session.ts` exporting `getServerUser(request)` (verified Supabase user from bearer token or session cookie, else null), `getServerRoles(userId)` (server-verified ERP roles via service-role client), and re-export `hasStaffRole`
    - _Requirements: 5.2, 7.2, 9.1_

  - [x] 10.2 Add auth/role guards to privileged routes
    - In `app/api/admin/create-user`, `app/api/client-portal/create-client`, `app/api/employee-portal/create-employee`, and the destructive operations on `app/api/upload`, derive authorization from the server-verified session only: return 401 when unauthenticated, 403 when the role check fails, 400 when a requested role is outside the assignable allowlist
    - _Requirements: 5.3, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 9.1_

  - [x] 10.3 Refactor route handlers to use the extracted controls
    - Replace the inline sanitizers/validators in `verify-employee`, `upload`, `quotation-pdf`, `gst-lookup`, and `pincode-lookup` routes with imports from `src/lib/security/` (search/header/path sanitizers, content-type checks, lookup validators, PII projector)
    - _Requirements: 8.2, 9.5, 9.6, 10.1, 10.2, 12.2_

  - [x] 10.4 Write integration tests for route auth guards
    - Mock sessions to assert 401 for unauthenticated, 403 for wrong-role, and 400 for invalid requested role on the privileged routes
    - _Requirements: 5.3, 7.3, 7.5, 9.1_

  - [x] 10.5 Harden the Protected_Route_Guard and remove the mock admin
    - Make `ProtectedRoute` re-validate the session server-side on each evaluation (redirect to login on failure, render on pass) and remove the mock administrator user in `AppDataContext`
    - _Requirements: 5.5, 5.6, 5.7_

  - [x] 10.6 Write unit tests for the guard and mock-admin removal
    - Assert sign-out/revocation redirects to login and that no component receives a hardcoded `admin` role
    - _Requirements: 5.5, 5.6_

- [x] 11. Checkpoint - auth and route protection
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Implement CORS resolution and security headers
  - [x] 12.1 Implement the CORS origin resolver
    - Add `src/lib/security/cors.ts` exporting a resolver that returns the configured origin only when the request origin equals it, otherwise returns "no allow-origin header"; never a wildcard, never a reflected non-matching origin
    - _Requirements: 11.3, 11.4_

  - [-] 12.2 Write property test for CORS origin resolution
    - **Property 14: CORS origin resolution never reflects untrusted origins or emits a wildcard**
    - **Validates: Requirements 11.3, 11.4**

  - [x] 12.3 Extend middleware with CSP and apply the CORS resolver
    - Add `Content-Security-Policy` (`script-src`/`style-src`/`connect-src` pinned to the configured origin, no wildcard) to `middleware.ts` alongside the existing headers; apply the CORS resolver to API CORS/preflight handlers (e.g. upload `OPTIONS`)
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 12.4 Write snapshot/integration test for response headers
    - Assert the required headers and CSP directives are present with correct values and that non-matching origins are not reflected
    - _Requirements: 11.1, 11.2_

- [ ] 13. Implement rate limiting and payload guards
  - [-] 13.1 Verify and apply the rate limiter
    - Confirm/adjust `src/lib/rateLimit.ts` windowing and `retryAfter`, and apply it to the public write endpoints (lead, enquiry), the quotation-PDF route, and the employee-verification proxy with the specified caps and 429 + `Retry-After` responses
    - _Requirements: 10.6, 13.1, 13.2, 13.3_

  - [x] 13.2 Write property test for the rate limiter
    - **Property 16: Rate limiter admits up to the cap then limits within a rolling window**
    - **Validates: Requirements 10.6, 13.1, 13.3**

  - [x] 13.3 Add the oversized-payload guard to the quotation-PDF route
    - Reject payloads with more than 500 service-line entries with HTTP 413 and render no PDF
    - _Requirements: 13.6_

  - [x] 13.4 Write unit test for the oversized-payload guard
    - Assert a >500-line payload returns 413 and no PDF is rendered
    - _Requirements: 13.6_

- [ ] 14. Implement audit logging
  - [x] 14.1 Implement the audit-entry builder
    - Add `src/lib/security/audit-entry.ts` exporting a builder that populates actor user ID, action type, affected resource ID, outcome, source client IP, and a UTC timestamp (≥1-second precision) from the input, never substituting a placeholder sentinel for a supplied value
    - _Requirements: 15.1_

  - [-] 14.2 Write property test for the audit-entry builder
    - **Property 18: Audit entries contain all required fields with no placeholder substitution**
    - **Validates: Requirements 15.1**

  - [x] 14.3 Wire real client IP, fallback channel, and event coverage
    - Update `src/utils/auditLog.ts` to use the builder, resolve the actual client IP (replacing the `'client-side ...'` sentinel and default actor), log auth-denied/login-failure events, and write to a fallback channel on write failure instead of discarding
    - _Requirements: 12.5, 15.2, 15.4_

  - [x] 14.4 Write unit test for audit fallback on write failure
    - Assert a failed primary write is delivered to the fallback channel with the same minimum fields
    - _Requirements: 15.4_

- [ ] 15. Implement branch-scoped RLS policies
  - [x] 15.1 Author the consolidated RLS migration
    - Create a SQL migration under `scripts/` that replaces every permissive `USING (true)`/anon-CRUD policy with branch-scoped, role-aware policies using the non-recursive helpers (`app_user_branch_uuid()`, `app_user_branch_code()`, `app_is_main_user()`), denies anon writes to `users`/`roles`/`branches`, and limits required anon reads to a column-scoped SELECT
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [-] 15.2 Write integration tests for RLS policies
    - Against a controlled Supabase instance, assert branch isolation on read, write denial outside the authorized branch, zero rows for users with no branch, and anon-write denial
    - _Requirements: 6.4, 6.5, 6.6_

- [ ] 16. Implement dependency and secret-scanning controls
  - [x] 16.1 Implement the exact-version validator
    - Add `src/lib/security/dep-version.ts` exporting a validator that returns true only for a single exact version with no range operator (rejecting `^`, `~`, `*`, and comparator ranges)
    - _Requirements: 14.4_

  - [-] 16.2 Write property test for the exact-version validator
    - **Property 17: Dependency version specifiers must be exact**
    - **Validates: Requirements 14.4**

  - [x] 16.3 Add the CI dependency-audit and secret-scanning controls
    - Add a CI workflow step that runs `npm audit` and fails on any new High/Critical advisory not in the base-branch baseline (no waiver), and a pre-commit hook or CI check that blocks commits introducing a hardcoded secret and reports the offending file
    - _Requirements: 4.8, 14.3_

  - [x] 16.4 Pin dependencies to exact versions
    - Update `package.json` to pin direct dependencies to exact versions, removing range specifiers
    - _Requirements: 14.4_

- [x] 17. Checkpoint - controls and pipeline
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. Build the prioritized remediation plan
  - [x] 18.1 Implement the remediation ordering function
    - Add `src/lib/security/remediation-order.ts` exporting an ordering function over tasks annotated with severity and dependency edges (a DAG): strict descending severity (Critical, High, Medium, Low), every prerequisite before its dependents, and deterministic ordering for equal-severity tasks
    - _Requirements: 16.2, 16.4, 16.7_

  - [-] 18.2 Write property test for remediation ordering
    - **Property 19: Remediation ordering is severity-descending, dependency-respecting, and deterministic**
    - **Validates: Requirements 16.2, 16.4, 16.7**

  - [x] 18.3 Author the remediation plan document
    - Create `.kiro/specs/security-hardening/assessment/remediation-plan.md` with exactly one task per confirmed finding, ordered by the ordering function, each with a unique task id mapped to its finding id, a re-run-procedure-yields-not-exploitable acceptance criterion, and recorded dependencies
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

- [x] 19. Final checkpoint - full suite
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (unit, property, and integration tests) and can be skipped for a faster MVP.
- Each task references specific requirement clauses for traceability.
- All 19 correctness properties from the design are covered by exactly one property test each (Properties 1, 5–13, 15, 17–19 in `src/lib/security/__tests__/`; Property 16 against `src/lib/rateLimit.ts`), every one running ≥100 iterations and tagged `// Feature: security-hardening, Property {n}: {text}`.
- The assessment artifacts (Req 1–3, 16 documentation), RLS SQL (Req 6), headers/CSP (Req 11.1, 11.2), CI controls, and audit-log delivery are validated by review, integration, snapshot, and smoke tests rather than property tests, per the design's Testing Strategy.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["2.2", "3.1", "3.3", "3.5", "4.1", "5.1", "6.1", "8.1", "9.1", "9.5", "12.1", "14.1", "15.1", "16.1", "18.1"] },
    { "id": 2, "tasks": ["2.3", "3.2", "3.4", "3.6", "3.7", "4.2", "4.3", "4.4", "5.2", "6.2", "8.2", "9.2", "9.3", "9.4", "9.6", "10.1", "12.2", "13.1", "14.2", "15.2", "16.2", "18.2"] },
    { "id": 3, "tasks": ["2.4", "8.3", "10.5", "12.3", "13.3", "14.3", "16.3", "16.4"] },
    { "id": 4, "tasks": ["10.2", "10.6", "12.4", "13.2", "13.4", "14.4", "18.3"] },
    { "id": 5, "tasks": ["10.3"] },
    { "id": 6, "tasks": ["10.4"] }
  ]
}
```
