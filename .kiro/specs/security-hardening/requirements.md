# Requirements Document

## Introduction

This feature delivers a comprehensive security assessment and remediation program for the Safend application — a multi-tenant ERP plus client/employee/marketing portal built on Next.js 16 (App Router), React 19, Supabase (Auth + Postgres + RLS), Firebase (Firestore for audit logs and legacy services), Cloudflare R2 (file storage via the AWS S3 SDK), and a React-PDF quotation generator. The application exposes role-scoped ERP modules (admin, hr, accounts, operations, sales, office-admin), authenticated client and employee portals, public marketing pages, and a public employee-verification flow.

The work has two distinct deliverables:

1. **The Assessment** — a documented threat model that enumerates the attack surfaces relevant to this class of web tool, the mechanism of each candidate attack (how it would be executed), an ethical-hacking-style verification of whether the current codebase is exploitable, and a severity rating for each confirmed finding.
2. **The Remediation Plan** — a prioritized set of protections that close each confirmed vulnerability, expressed as verifiable target-state requirements grouped by threat category.

This document scopes both deliverables. It treats the application code as the system under assessment and the security team (assisted by Kiro) as the actor performing the assessment and remediation. A prior `AUDIT_REPORT.md` (dated 2025-08-12, 49 findings) is used as a starting reference; several of its HIGH findings have since been partially remediated in source, so each finding MUST be re-verified against current code rather than assumed.

## Glossary

- **Security_Assessment**: The process and its documented output that identifies, describes the mechanism of, and verifies the exploitability of security weaknesses in the application.
- **Threat_Model**: The structured catalogue of attack surfaces, threat categories, and attacker capabilities applicable to the application.
- **Finding**: A single documented security weakness, including its category, mechanism, exploitability verification result, affected component, and severity.
- **Severity**: A classification of a Finding's risk as Critical, High, Medium, or Low, derived from impact and exploitability.
- **Remediation_Plan**: The prioritized, sequenced set of remediation tasks that resolve confirmed Findings.
- **Verification_Procedure**: A reproducible, ethical-hacking-style test (request, payload, or query) that demonstrates whether a Finding is exploitable, run only against non-production or controlled environments.
- **Attack_Surface**: Any externally reachable entry point — Next.js API route, Express PDF route, public page, portal, or database interface — through which an attacker can submit input.
- **API_Route**: A server-side HTTP handler under `app/api/**` or the Express PDF server.
- **Auth_Guard**: A server-side check that verifies the caller's session and authorization before executing a protected operation.
- **RLS_Policy**: A Supabase Postgres Row-Level Security policy controlling row access per database role.
- **Service_Role_Key**: The Supabase service-role JWT that bypasses all RLS policies and has full database access.
- **Anon_Role**: The Supabase `anon` (unauthenticated) database role.
- **Protected_Route_Guard**: The client-side React components (`ProtectedRoute`, `ClientProtectedRoute`, `EmployeeProtectedRoute`) that gate page rendering.
- **Rate_Limiter**: The mechanism that caps request volume per client identifier for an Attack_Surface.
- **SSRF**: Server-Side Request Forgery — coercing the server into making attacker-controlled outbound requests.
- **PII**: Personally Identifiable Information (names, contact details, employee identifiers, etc.).
- **CSP**: Content-Security-Policy HTTP response header.
- **Reviewer**: The human security or engineering owner who approves the assessment and remediation plan.
- **Secret**: Any credential, key, or token granting access to a system (Service_Role_Key, R2 access keys, Firebase keys, anon key).

## Requirements

### Requirement 1: Threat Model and Attack-Surface Enumeration

**User Story:** As a security reviewer, I want a documented threat model that enumerates every attack surface and the threat categories that apply to this web tool, so that the assessment has a complete and traceable scope.

#### Acceptance Criteria

1. THE Security_Assessment SHALL enumerate every Attack_Surface in the application and SHALL record, for each enumerated Attack_Surface, its source location (route path, file path, or interface identifier) so that the enumeration can be verified as complete against the application's routes and interfaces, including each Next.js API_Route under `app/api`, the Express PDF route, the public marketing pages, the public employee-verification flow, the client portal, the employee portal, and the Supabase database interface.
2. THE Security_Assessment SHALL document each of the following threat categories as in-scope: broken access control and IDOR, injection (SQL/PostgREST filter, XSS, command), cryptographic failures and secret exposure, SSRF, insecure file upload, authentication and session weaknesses, security misconfiguration including headers and CORS, sensitive data and PII exposure, rate limiting and abuse, dependency and supply-chain risk, and audit logging and monitoring gaps.
3. WHERE an Attack_Surface is reachable without authentication, THE Security_Assessment SHALL mark that Attack_Surface as publicly exposed, and WHERE an Attack_Surface requires authentication, THE Security_Assessment SHALL mark that Attack_Surface as authenticated-only, such that every enumerated Attack_Surface carries exactly one exposure classification.
4. THE Threat_Model SHALL map each enumerated Attack_Surface to every threat category from criterion 2 that applies to it, and SHALL record at least one applicable threat category for each enumerated Attack_Surface.
5. THE Security_Assessment SHALL record, for each mapped Attack_Surface-to-threat-category pair, the attacker capability assumed, selected from exactly one of: unauthenticated external, authenticated low-privilege user, or cross-tenant authenticated user.
6. WHEN a code change adds an Attack_Surface, removes an Attack_Surface, modifies an Attack_Surface, or changes whether an Attack_Surface requires authentication, THE Security_Assessment SHALL be updated by manual review to re-record that Attack_Surface's exposure classification before that change is deployed.
7. IF the authentication requirement of an Attack_Surface cannot be determined, THEN THE Security_Assessment SHALL mark that Attack_Surface as publicly exposed and SHALL flag that Attack_Surface for manual review.

### Requirement 2: Vulnerability Mechanism Documentation

**User Story:** As a security reviewer, I want each candidate attack described with its mechanism, so that I understand how an attacker would attempt the exploit before deciding on a fix.

#### Acceptance Criteria

1. THE Security_Assessment SHALL describe, for each in-scope threat category from the Threat_Model, the mechanism by which the corresponding attack would be executed against this application, and each mechanism description SHALL include the entry Attack_Surface, the attacker-controlled input, the weakness exploited, and the observable impact.
2. WHEN a threat category maps to one or more components, THE Security_Assessment SHALL identify each affected file or component by its repository-relative path.
3. THE Security_Assessment SHALL describe each mechanism in terms that state the weakness and its exploitation path, and each mechanism description SHALL NOT include any remediation step, fix implementation, or corrective control.
4. WHERE a mechanism depends on a precondition (for example, a token stored in localStorage or a permissive RLS_Policy), THE Security_Assessment SHALL state that precondition explicitly.
5. IF an in-scope threat category has no applicable Attack_Surface, THEN THE Security_Assessment SHALL record that category as not-applicable with a reason.

### Requirement 3: Exploitability Verification (Ethical-Hacking Validation)

**User Story:** As a security reviewer, I want each candidate finding verified against the current code with a reproducible procedure, so that the assessment reports confirmed vulnerabilities rather than assumptions inherited from the prior audit.

#### Acceptance Criteria

1. FOR EACH candidate Finding, THE Security_Assessment SHALL execute a reproducible Verification_Procedure against the current codebase and record the result as exactly one of confirmed, not-exploitable, or partially-mitigated against a unique Finding identifier.
2. THE Security_Assessment SHALL define every Verification_Procedure to run only against a non-production or controlled environment.
3. WHEN a prior `AUDIT_REPORT.md` Finding is re-verified, THE Security_Assessment SHALL record whether the Finding still-applies, no-longer-applies, or partially-applies to the current code.
4. IF a Verification_Procedure demonstrates exploitability, THEN THE Security_Assessment SHALL record the request, payload, or query used and the observed result in sufficient detail for an independent Reviewer to reproduce the same classification.
5. IF a Verification_Procedure cannot conclusively determine exploitability because the environment is unavailable or the result is inconclusive, THEN THE Security_Assessment SHALL record the Finding as unverified with a reason.
6. THE Security_Assessment SHALL assign a Severity to each confirmed Finding of exactly one of Critical, High, Medium, or Low, based on impact and exploitability.
7. THE Verification_Procedure SHALL exclude any payload that would damage data, exfiltrate real Secrets, or affect real users.

### Requirement 4: Secrets Management

**User Story:** As a system operator, I want all credentials sourced exclusively from the environment with no secrets in source or client bundles, so that a source disclosure does not compromise the database or storage.

#### Acceptance Criteria

1. THE Security_Assessment SHALL scan the source tree, configuration files, and build output for hardcoded Secrets, including the Service_Role_Key, R2 access keys, Firebase keys, and the anon key, and record for each occurrence found its file path, location within the file, and Secret type.
2. THE Application SHALL read every server-side Secret exclusively from environment variables with no hardcoded fallback literal in source.
3. IF a required Secret is absent or empty at startup, THEN THE Application SHALL terminate startup without serving any request and SHALL emit an error identifying the missing variable by name.
4. THE Application SHALL exclude the Service_Role_Key from any client-side bundle through a dedicated server-only exclusion control, handled separately from other server Secrets.
5. THE Application SHALL exclude all other server-only Secrets from any client-side bundle.
6. THE Security_Assessment SHALL verify that no Secret literal appears in a produced client-side bundle.
7. WHERE a Secret has been committed to version control history, THE Remediation_Plan SHALL require rotation of that Secret.
8. THE Remediation_Plan SHALL include a secret-scanning control, satisfied by either a pre-commit hook or a CI check alone, that blocks the commit introducing a hardcoded Secret and reports the offending file.

### Requirement 5: Authentication and Session Integrity

**User Story:** As a user of the ERP and portals, I want authentication enforced server-side and session tokens protected from theft, so that an attacker cannot bypass login or replay a stolen token.

#### Acceptance Criteria

1. THE Security_Assessment SHALL document that the Protected_Route_Guard performs client-side-only gating and that authentication tokens persisted in localStorage are exposed to any successful XSS.
2. WHEN a request reaches a protected API_Route, THE API_Route SHALL verify the caller's Supabase session server-side before performing the requested operation, and SHALL block the operation entirely if verification does not succeed.
3. IF the caller's session is absent, expired, or invalid, THEN THE API_Route SHALL return HTTP 401 without performing the operation.
4. THE Remediation_Plan SHALL specify a server-enforceable session strategy that allows the Edge middleware or server to verify authentication, rather than relying solely on client-side guards.
5. WHEN the next protected route evaluation occurs after a sign-out or session revocation, THE Protected_Route_Guard SHALL redirect to login rather than render protected content.
6. THE Remediation_Plan SHALL require that the mock administrator user in `AppDataContext` be removed so that no component receives a hardcoded `admin` role.
7. THE Protected_Route_Guard SHALL re-validate the session server-side on each protected route evaluation, rendering protected content when validation passes and redirecting to login when validation fails.
8. IF the server cannot confirm an authenticated session and role, THEN access SHALL be denied and no default or hardcoded role SHALL be applied.

### Requirement 6: Authorization and Row-Level Security

**User Story:** As a tenant administrator, I want database access restricted to the rows a user is entitled to, so that an authenticated user cannot read or modify data belonging to other users or branches.

#### Acceptance Criteria

1. THE Security_Assessment SHALL enumerate every table whose RLS_Policy uses `USING (true) WITH CHECK (true)` or grants the Anon_Role full CRUD (create, read, update, delete), and record each as a Finding.
2. THE Database SHALL deny the Anon_Role write access (insert, update, delete) to the `users`, `roles`, and `branches` tables.
3. WHERE an unauthenticated flow exists in the system that requires read access, THE Database SHALL grant the Anon_Role only a restricted SELECT policy limited to the specific columns required, independent of any individual request's authentication state.
4. WHEN an authenticated user queries a branch-scoped table, THE RLS_Policy SHALL return only rows belonging to the authorized branch recorded for that user and exclude all other rows.
5. IF an authenticated user attempts an INSERT, UPDATE, or DELETE on a row outside their authorized branch, THEN THE RLS_Policy SHALL deny the operation.
6. WHERE a user has no authorized branch, THE RLS_Policy SHALL return zero rows and deny writes.
7. THE Remediation_Plan SHALL specify branch-scoped, role-aware RLS_Policy definitions to replace each permissive `USING (true)` policy, using non-recursive helper functions.
8. THE Security_Assessment SHALL identify each table referenced in code that has no SQL definition and therefore an unknown RLS status, and record each as a Finding.

### Requirement 7: API Route Protection

**User Story:** As a security reviewer, I want every privileged or service-role-backed API route guarded by a server-side authorization check, so that no anonymous caller can perform privileged operations.

#### Acceptance Criteria

1. THE Security_Assessment SHALL identify every API_Route that uses the Service_Role_Key and record whether that route enforces an Auth_Guard.
2. WHEN a caller invokes an administrative API_Route such as `/api/admin/create-user`, `/api/client-portal/create-client`, or `/api/employee-portal/create-employee`, THE API_Route SHALL compare the caller's server-verified Supabase session role against that route's predefined authorized-role set before executing.
3. IF a caller lacks the required role, THEN THE API_Route SHALL return HTTP 403 without performing the operation.
4. THE API_Route SHALL derive authorization solely from the server-verified session and SHALL NOT use any client-supplied role from the request body, headers, or query parameters.
5. WHEN a user-creation API_Route receives a requested role that is absent, empty, or outside the assignable-roles allowlist, THE API_Route SHALL reject the request with HTTP 400 and create no account.
6. WHEN a destructive operation (such as a file delete or metadata probe on `/api/upload`, or any destructive data operation on another route) is requested, THE API_Route SHALL restrict the operation to the concrete ERP staff roles admin, hr, accounts, operations, sales, and office-admin, system-wide regardless of route.
7. IF an unauthorized caller requests a destructive operation, THEN THE API_Route SHALL return HTTP 403 with no data or object modification.

### Requirement 8: Input Validation and Injection Prevention

**User Story:** As a security reviewer, I want all external input validated and sanitized before use, so that injection and cross-site scripting attacks fail.

#### Acceptance Criteria

1. WHEN an API_Route receives a request body, THE API_Route SHALL validate the body against a schema, enforce a per-field maximum of 10,000 characters, and IF the body does not conform THEN reject it with HTTP 400 while preserving state and performing no side effect.
2. WHEN a free-text search term is embedded in a Supabase PostgREST filter, THE API_Route SHALL remove the structural and wildcard characters comma, parentheses, period, colon, asterisk, and percent from the term before use, while retaining the safe set of alphanumerics, spaces, hyphens, and apostrophes.
3. THE Security_Assessment SHALL verify that the Express quotation-PDF route validates `documentDetails`, `clientDetails`, `laborInputs`, `roles`, and `contractTerms` against a schema before rendering, and record the outcome as a Finding.
4. IF an API_Route receives malformed JSON, THEN THE API_Route SHALL return HTTP 400 without processing the body.
5. WHEN user-supplied values are written into an HTTP response header such as Content-Disposition, THE API_Route SHALL strip control characters (code points below 0x20) and path separators (forward slash and backslash) from those values to prevent header injection; WHERE no user-supplied value is written to a header, no sanitization is required.
6. THE Security_Assessment SHALL verify that user-controlled content rendered in React is not injected via mechanisms that bypass React's default escaping, and record the outcome as a Finding.

### Requirement 9: File Upload Security

**User Story:** As a system operator, I want uploads constrained by authentication, type, size, content, and destination path, so that the storage bucket cannot be abused for malware hosting, stored XSS, or path traversal.

#### Acceptance Criteria

1. IF a file upload (POST) is requested without a valid authenticated session (no resolvable Supabase user from either the Authorization Bearer token or the session cookie), THEN THE Upload_Route SHALL reject the request with HTTP 401, return an error response indicating authentication is required, and SHALL NOT write any object to storage, regardless of upload progress or resources already consumed.
2. IF a file is uploaded whose declared MIME type is not present in the allowed-types list (the union of the allowed image, video, and document type lists), THEN THE Upload_Route SHALL reject the upload with HTTP 400, return an error response indicating the file type is not allowed, and SHALL NOT write any object to storage.
3. IF the leading bytes (magic-number signature) of an uploaded file with a signature-checkable declared MIME type (JPEG, PNG, GIF, WEBP, BMP, PDF, ZIP-based Office Open XML, and legacy OLE2 Office formats) do not match the byte signature expected for that declared MIME type, THEN THE Upload_Route SHALL reject the upload with HTTP 400, return an error response indicating the content does not match the declared type, and SHALL NOT write any object to storage.
4. IF an uploaded file's size exceeds the configured maximum for its type category — 10 MB for image types, 100 MB for video types, and 50 MB for all other allowed (document) types — THEN THE Upload_Route SHALL reject the upload with HTTP 400, return an error response indicating the file exceeds the maximum size for its type, and SHALL NOT write any object to storage.
5. IF the provided upload destination folder value contains a path-traversal sequence (".."), begins with "/", contains a backslash, contains any character outside the safe set [a-zA-Z0-9_-/], or does not match an allowed folder prefix, THEN THE Upload_Route SHALL reject the upload with HTTP 400, return an error response indicating the upload folder is invalid, and SHALL NOT write any object to storage.
6. WHEN a client-supplied prefix is included in the stored object key, THE Upload_Route SHALL replace every character outside the safe set [a-zA-Z0-9.-] with an underscore before embedding it in the key.
7. WHERE an uploaded file's declared MIME type can carry inline active content (image/svg+xml, text/plain, text/csv, or application/rtf), THE Upload_Route SHALL set the stored object's Content-Disposition to "attachment".

### Requirement 10: SSRF and External-Request Hardening

**User Story:** As a security reviewer, I want server-side outbound requests constrained to validated inputs and known destinations, so that the lookup and integration routes cannot be abused for SSRF or amplification.

#### Acceptance Criteria

1. WHEN the GST-lookup route receives a GSTIN, THE API_Route SHALL validate the GSTIN against its 15-character format pattern before issuing any outbound request.
2. WHEN the pincode-lookup route receives a pincode, THE API_Route SHALL validate the pincode as a six-digit value before issuing any outbound request.
3. IF GSTIN or pincode validation fails, THEN THE API_Route SHALL reject the request without issuing an outbound request and return an error indication.
4. THE external-lookup API_Routes SHALL issue outbound requests only to their fixed, predefined upstream hosts and SHALL NOT incorporate caller-supplied URL, hostname, scheme, port, or path into the outbound request target.
5. WHEN an outbound request is issued, THE API_Route SHALL apply a bounded timeout not exceeding 10 seconds, and IF the timeout elapses THEN abort the request and return a gateway-timeout error indication.
6. WHEN an unauthenticated outbound-proxy route is invoked, THE Rate_Limiter SHALL cap requests to a maximum of 20 per client identifier within any rolling 60-second window, and on exceeding the cap SHALL reject the request with a retry-after indication and issue no outbound request.

### Requirement 11: Security Headers and CORS

**User Story:** As a security reviewer, I want defense-in-depth response headers and a restrictive CORS policy applied to all responses, so that clickjacking, MIME sniffing, and cross-origin abuse are mitigated.

#### Acceptance Criteria

1. THE Application SHALL set the following response headers on application responses with these values: `X-Frame-Options` set to `DENY` or `SAMEORIGIN`, `X-Content-Type-Options` set to `nosniff`, `Strict-Transport-Security` with `max-age` of at least 31536000, plus `Referrer-Policy` and `Permissions-Policy`.
2. THE Application SHALL set a `Content-Security-Policy` response header with `script-src`, `style-src`, and `connect-src` directives restricted to the configured origin and containing no wildcard.
3. WHEN an API_Route responds to a CORS preflight, THE API_Route SHALL restrict `Access-Control-Allow-Origin` to the application's configured origin rather than a wildcard.
4. IF a request origin does not match the configured origin, THEN THE API_Route SHALL NOT reflect that origin and SHALL NOT emit a wildcard.
5. THE Security_Assessment SHALL record the presence or absence of each required header and the CORS behavior as Findings.

### Requirement 12: PII and Sensitive Data Exposure

**User Story:** As a data owner, I want public endpoints to expose only the minimum necessary data, so that employee and customer PII is not over-disclosed.

#### Acceptance Criteria

1. THE Security_Assessment SHALL document every public endpoint that returns PII, including the public employee-verification route, and record each as a Finding.
2. WHEN the public employee-verification route returns results, THE API_Route SHALL return only the fields on the documented verification-field allowlist and SHALL exclude attributes outside that allowlist.
3. WHEN the employee-verification route receives a search term, THE API_Route SHALL enforce a minimum sanitized query length of 2 characters, a maximum search-term length of 50 characters, and a result-count limit of 20.
4. IF the sanitized search term is shorter than 2 characters, THEN THE API_Route SHALL return an empty set without querying.
5. THE Remediation_Plan SHALL require that audit log entries record an actual resolved client identifier and prohibit placeholder values.

### Requirement 13: Rate Limiting and Abuse Prevention

**User Story:** As a system operator, I want public write and compute-heavy endpoints rate limited with a deployment-appropriate store, so that spam, brute force, and resource-exhaustion attacks are blunted.

#### Acceptance Criteria

1. WHEN a public write endpoint (lead, enquiry) is invoked, THE Rate_Limiter SHALL cap submissions to a maximum of 10 requests per source IP within any rolling 60-second window.
2. IF the cap on a public write endpoint is exceeded, THEN THE API_Route SHALL reject the request with HTTP 429 and a `Retry-After` header indicating the seconds until reset.
3. WHEN the quotation-PDF route is invoked, THE Rate_Limiter SHALL cap requests to a maximum of 10 per source IP within any rolling 60-second window to prevent CPU and memory exhaustion.
4. THE Security_Assessment SHALL document that the current Rate_Limiter is per-process and in-memory, and that it does not enforce a shared limit across multiple instances.
5. THE Remediation_Plan SHALL specify a shared or edge-enforced Rate_Limiter for multi-instance deployments.
6. WHEN the quotation-PDF route receives an oversized payload (for example, more than 500 service-line entries), THE API_Route SHALL reject the payload with HTTP 413 and SHALL NOT render the PDF.

### Requirement 14: Dependency and Supply-Chain Security

**User Story:** As a system operator, I want dependencies audited and pinned, so that known-vulnerable or malicious packages do not enter the build.

#### Acceptance Criteria

1. THE Security_Assessment SHALL run a dependency vulnerability audit against the project manifest and lockfile (`package.json` and `package-lock.json`), covering both direct and transitive dependencies, and SHALL record for each reported advisory its advisory identifier, the affected package name, the affected installed version, the fixed version where one is available, and its Severity (Critical, High, Medium, or Low).
2. THE Remediation_Plan SHALL order remediation of dependency advisories rated Critical or High ahead of advisories rated Medium or Low.
3. THE Remediation_Plan SHALL specify a CI control that runs a dependency audit on every build and fails that build when the audit reports any advisory rated High or Critical that is not present in the build's base-branch baseline, with no override, waiver, or grace-period exception.
4. WHERE a dependency is added or updated, THE Remediation_Plan SHALL require it to be pinned to a single exact version and SHALL reject range specifiers (for example a caret `^`, tilde `~`, wildcard `*`, or comparator range).

### Requirement 15: Audit Logging and Monitoring

**User Story:** As a security responder, I want security-relevant events logged with accurate metadata, so that I can investigate incidents after the fact.

#### Acceptance Criteria

1. WHEN a privileged operation succeeds (user creation, role change, file deletion, login), THE Application SHALL record an audit log entry containing at minimum the actor's authenticated user ID, the action type, the affected resource ID, the operation outcome, the source client IP, and a UTC timestamp at a precision of at least 1 second.
2. IF a login attempt fails or an authorization is denied, THEN THE Application SHALL record an audit log entry for that event.
3. THE Security_Assessment SHALL identify audit log entries that record placeholder or hardcoded values (for example a hardcoded `"Client IP"` value) substituted for the actual runtime value, and record each as a Finding.
4. IF an audit log write fails, THEN THE Application SHALL write the entry to a fallback channel with the same minimum fields and SHALL NOT silently discard it.
5. THE Remediation_Plan SHALL specify which security-relevant events require audit logging and the same minimum field set each entry must contain.

### Requirement 16: Prioritized Remediation Plan

**User Story:** As an engineering owner, I want a single prioritized remediation plan tied to confirmed findings, so that the team fixes the highest-risk issues first with verifiable acceptance criteria.

#### Acceptance Criteria

1. THE Remediation_Plan SHALL list exactly one remediation task for each confirmed Finding from the Security_Assessment and SHALL contain no task that does not correspond to a confirmed Finding.
2. THE Remediation_Plan SHALL order remediation tasks in strict descending Severity, Critical before High before Medium before Low.
3. FOR EACH remediation task, THE Remediation_Plan SHALL state a verifiable acceptance criterion that is satisfied by re-executing the corresponding Finding's Verification_Procedure and obtaining a not-exploitable result.
4. WHERE a remediation task depends on another task, THE Remediation_Plan SHALL record that dependency by the prerequisite task's unique task identifier.
5. THE Remediation_Plan SHALL assign each remediation task a unique task identifier and map it back to the Finding identifier it resolves.
6. THE Security_Assessment SHALL produce exactly one Remediation_Plan covering all confirmed Findings.
7. WHERE remediation tasks share the same Severity, THE Remediation_Plan SHALL order them deterministically while respecting recorded dependencies.
