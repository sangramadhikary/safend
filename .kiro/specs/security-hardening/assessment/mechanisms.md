# Vulnerability Mechanism Documentation

> Assessment artifact for the **security-hardening** spec.
> Satisfies Requirements **2.1** (describe, for each in-scope threat category, the
> mechanism by which the attack would be executed — entry surface, attacker-controlled
> input, weakness exploited, observable impact), **2.2** (identify each affected file
> or component by its repository-relative path), **2.3** (state the weakness and its
> exploitation path with **no** remediation step, fix, or corrective control),
> **2.4** (state any precondition the mechanism depends on explicitly), and **2.5**
> (record any in-scope category with no applicable surface as not-applicable with a
> reason).

## Purpose and method

This document describes **how** each in-scope threat category from the threat model
(`threat-model.md`) would be exploited against this application. It is the *mechanism*
layer: the *which-surface / who-attacks* mapping lives in `threat-model.md`
(Req 1) and the *whether-exploitable* verdict and severity live in `findings.md`
(Req 3).

Each mechanism record follows the `Mechanism` schema from
`src/lib/security/types.ts`:

- **category** — the `ThreatCategory` key.
- **entrySurfaceId** — the entry attack surface (`AS-NNN` from `attack-surfaces.md`).
- **attackerInput** — the attacker-controlled input (Req 2.1).
- **weakness** — the weakness exploited (Req 2.1, 2.3).
- **impact** — the observable impact (Req 2.1).
- **preconditions** — conditions the mechanism depends on (Req 2.4).
- **affectedPaths** — repository-relative file/component paths (Req 2.2).
- **notApplicableReason** — recorded only when a category has no applicable surface (Req 2.5).

> **No-remediation constraint (Req 2.3):** every record below states only the weakness
> and the exploitation path. No record contains a fix, corrective control, or
> remediation step. Target-state controls are specified in the requirements/design and
> tracked in `remediation-plan.md`, not here.

> **Status of the in-scope set (Req 2.5):** all **eleven** `ThreatCategory` values are
> in-scope and **each maps to at least one applicable surface** in `threat-model.md`;
> therefore **none** is recorded as not-applicable. The not-applicable convention is
> documented in [§12](#12-not-applicable-categories) so a future review with a category
> that loses all surfaces records it correctly.

---

## 1. `broken-access-control-idor` — Broken access control and IDOR

### 1.1 Mechanism M-BAC-1 — Client-side-only page gating

- **Entry surface:** AS-024, AS-025, AS-027 – AS-033 (client/employee portal and ERP module pages).
- **Attacker-controlled input:** A direct HTTP GET to the page route (e.g. `/dashboard`, `/hr`, `/accounts`) with no session, plus any client-stored state the attacker chooses to plant before hydration.
- **Weakness:** Authorization for these pages is enforced **only** by client-side React guards (`ProtectedRoute`, `ClientProtectedRoute`, `EmployeeProtectedRoute`); the Edge middleware deliberately does not enforce authentication because the Supabase session lives in `localStorage` rather than a cookie the server can read. The server returns the page document to any caller, and gating happens only after hydration in the browser.
- **Impact:** The server delivers protected page documents (and any data embedded in the initial payload or fetched by client code the attacker can drive) to unauthenticated callers; gating logic runs in an environment the attacker fully controls.
- **Preconditions:** Supabase session stored in `localStorage`, not in a server-readable cookie; `middleware.ts` performing no auth enforcement for these routes.
- **Affected paths:**
  - `middleware.ts`
  - `app/(erp)/layout.tsx`
  - `app/(client-portal)/layout.tsx`
  - `app/(employee-portal)/layout.tsx`
  - `app/(erp)/dashboard/page.tsx`, `app/(erp)/accounts/page.tsx`, `app/(erp)/hr/page.tsx`, `app/(erp)/office-admin/page.tsx`, `app/(erp)/operations/page.tsx`, `app/(erp)/sales/page.tsx`, `app/(erp)/profile/page.tsx`
  - `app/(client-portal)/client-portal/page.tsx`
  - `app/(employee-portal)/employee-portal/page.tsx`

### 1.2 Mechanism M-BAC-2 — Destructive/metadata operations on arbitrary object keys

- **Entry surface:** AS-010 (`/api/upload` DELETE), AS-011 (`/api/upload` GET/HEAD metadata).
- **Attacker-controlled input:** The object key / file path supplied in the request targeting an arbitrary R2 object, including keys belonging to other branches/tenants.
- **Weakness:** The operation is keyed by a caller-supplied object identifier; if the server-side authorization is limited to a coarse staff-role check without binding the target key to the caller's branch/tenant, a holder of any staff role can reference keys outside their own scope.
- **Impact:** Deletion of, or metadata disclosure about, storage objects belonging to other branches/tenants (cross-tenant object tampering and information disclosure).
- **Preconditions:** A valid session holding an ERP staff role; object keys that are guessable or enumerable across tenants.
- **Affected paths:**
  - `app/api/upload/route.ts`

### 1.3 Mechanism M-BAC-3 — RLS-governed row access via the anon role

- **Entry surface:** AS-034 (Supabase PostgREST reached directly with the anon key).
- **Attacker-controlled input:** Direct PostgREST queries (filters, row selectors, write payloads) issued from the browser using the public anon key.
- **Weakness:** Row access is governed entirely by Postgres RLS. Where policies use `USING (true) WITH CHECK (true)` or grant the `anon` role full CRUD, the database does not restrict rows to the caller's branch/tenant, and no server-side gate sits between the browser and PostgREST.
- **Impact:** A caller (anonymous or cross-tenant authenticated) can read or modify rows belonging to other users or branches, including across the `users`, `roles`, and `branches` tables when those carry permissive policies.
- **Preconditions:** A permissive `USING (true)` policy or anon-CRUD grant on the targeted table; the anon key present in the client bundle; PostgREST directly reachable.
- **Affected paths:**
  - `src/integrations/supabase/client.ts`
  - `scripts/` (RLS policy SQL — the live policy set is determined in `findings.md`, Req 6.1/6.8)

### 1.4 Mechanism M-BAC-4 — Unauthenticated read of the employee table

- **Entry surface:** AS-013 (`/api/verify-employee` GET).
- **Attacker-controlled input:** Repeated verification queries with varied search terms.
- **Weakness:** The route is a service-role-backed read of the `employees` table exposed without authentication; access control reduces to the search-term gate and result cap rather than a per-record authorization decision.
- **Impact:** An anonymous caller can read employee records (subject to the search gate), enabling enumeration of the employee directory. (PII over-disclosure on this surface is detailed under [§8](#8-pii-exposure--sensitive-data-and-pii-exposure).)
- **Preconditions:** Service-role read executed regardless of caller identity; search-term gate permits the query.
- **Affected paths:**
  - `app/api/verify-employee/route.ts`

---

## 2. `injection` — Injection (SQL / PostgREST filter, XSS, command)

### 2.1 Mechanism M-INJ-1 — PostgREST filter injection via the verification search term

- **Entry surface:** AS-013 (`/api/verify-employee` GET).
- **Attacker-controlled input:** The free-text search term embedded into a Supabase PostgREST `.or()` filter expression.
- **Weakness:** Structural and wildcard characters of the PostgREST filter grammar (comma, parentheses, period, colon, asterisk, percent) carry meaning inside `.or()`. If the term is interpolated without removing those characters, the attacker can alter the filter structure (add disjuncts, broaden matches with wildcards, change targeted columns).
- **Impact:** The attacker can broaden or restructure the query to return rows beyond the intended match, expanding the data returned by the public endpoint.
- **Preconditions:** The raw term reaches the `.or()` expression with structural/wildcard characters retained.
- **Affected paths:**
  - `app/api/verify-employee/route.ts`

### 2.2 Mechanism M-INJ-2 — Content-Disposition header injection (quotation PDF filename)

- **Entry surface:** AS-008 (`/api/quotation-pdf` POST).
- **Attacker-controlled input:** Document/client fields that flow into the `Content-Disposition` response header filename.
- **Weakness:** Control characters (code points below 0x20, e.g. CR/LF) and path separators in a user-supplied value written into a response header can break the header into additional headers or distort the response if not stripped.
- **Impact:** Response header injection / response splitting and a forged download filename driven by attacker input.
- **Preconditions:** A user-supplied value is written into the `Content-Disposition` header; control characters or separators are retained in that value.
- **Affected paths:**
  - `app/api/quotation-pdf/route.ts`
  - `server/routes/quotation-pdf.js` (Express equivalent, AS-016)

### 2.3 Mechanism M-INJ-3 — Unvalidated body fields persisted via the service role

- **Entry surface:** AS-004 (`/api/enquiry` POST), AS-006 (`/api/lead` POST), AS-001 – AS-003 (creation routes).
- **Attacker-controlled input:** JSON request-body fields, including oversized values and unexpected/extra keys.
- **Weakness:** Where a body is not validated against a schema or a per-field length cap before a service-role insert, attacker-controlled content (oversized fields, fields outside the intended set) is persisted directly into the database with full privileges.
- **Impact:** Storage of malformed or oversized records, persistence of attacker-controlled content that downstream consumers may render or trust, and resource pressure from oversized payloads.
- **Preconditions:** A request body reaches a service-role insert without schema/length validation; the field is not constrained at the database layer.
- **Affected paths:**
  - `app/api/enquiry/route.ts`
  - `app/api/lead/route.ts`
  - `app/api/admin/create-user/route.ts`
  - `app/api/client-portal/create-client/route.ts`
  - `app/api/employee-portal/create-employee/route.ts`

### 2.4 Mechanism M-INJ-4 — Cross-site scripting via rendered server-supplied content

- **Entry surface:** AS-022 (`EmployeeVerificationPage.tsx`), and any component rendering server-supplied content.
- **Attacker-controlled input:** Employee-record string fields stored in the database and returned by AS-013, then rendered in the verification UI.
- **Weakness:** React escapes string children by default, but content rendered through `dangerouslySetInnerHTML`, injected into URL/`href` attributes, or otherwise placed outside React's default escaping bypasses that protection. If stored employee content is rendered through such a path, it executes in the visitor's browser.
- **Impact:** Stored XSS executing in the context of a visitor to the public verification page; because tokens are kept in `localStorage`, script in the page origin can read them.
- **Preconditions:** A render path that bypasses React's default escaping (e.g. `dangerouslySetInnerHTML`, attribute injection); attacker-controlled content stored in a rendered field.
- **Affected paths:**
  - `src/components/EmployeeVerificationPage.tsx`
  - `src/modules/Index.tsx`

### 2.5 Mechanism M-INJ-5 — Lookup parameters embedded in outbound requests

- **Entry surface:** AS-005 (`/api/gst-lookup` GET), AS-007 (`/api/pincode-lookup` GET).
- **Attacker-controlled input:** The GSTIN / pincode query parameter incorporated into the outbound request path.
- **Weakness:** A caller-supplied parameter placed into an outbound URL path without format validation can carry path or query metacharacters that alter the outbound request target or path. (The host-control aspect is covered under [§4](#4-ssrf--server-side-request-forgery).)
- **Impact:** Distortion of the outbound request path/target shaped by attacker input.
- **Preconditions:** The parameter reaches the outbound request without format validation.
- **Affected paths:**
  - `app/api/gst-lookup/route.ts`
  - `app/api/pincode-lookup/route.ts`

---

## 3. `crypto-failure-secret-exposure` — Cryptographic failures and secret exposure

### 3.1 Mechanism M-SEC-1 — Anon key shipped in the client bundle

- **Entry surface:** AS-034 (Supabase interface, anon key in the browser bundle).
- **Attacker-controlled input:** Inspection of the served client JavaScript bundle and direct PostgREST/GoTrue calls using the extracted anon key.
- **Weakness:** The Supabase anon key is embedded in the client bundle (`NEXT_PUBLIC_*`) by design and is therefore readable by anyone who loads the application; its safety depends entirely on RLS being restrictive. When combined with permissive RLS (see [§1.3](#13-mechanism-m-bac-3--rls-governed-row-access-via-the-anon-role)), the exposed key becomes a direct data-access path.
- **Impact:** Any visitor obtains a working anon credential to the PostgREST/GoTrue API; the data exposure is bounded only by the live RLS policy set.
- **Preconditions:** Anon key present in the bundle (inherent to the public client); RLS the sole access control.
- **Affected paths:**
  - `src/integrations/supabase/client.ts`

### 3.2 Mechanism M-SEC-2 — Silent secret fallbacks masking misconfiguration

- **Entry surface:** AS-009 (`/api/upload`) and the shared Supabase client used by all browser-facing surfaces.
- **Attacker-controlled input:** None directly; the mechanism is reachable through any request handled while a required secret is absent.
- **Weakness:** Some server-side reads use silent fallbacks (`?? ''`, `'https://placeholder.supabase.co'`) instead of failing fast when a required secret/URL is absent. A process that starts with empty or placeholder credentials can serve requests in a misconfigured state, and a source/bundle disclosure of any hardcoded literal would compromise the corresponding system.
- **Impact:** The application serves requests with empty/placeholder credentials (undefined behavior, requests routed to a placeholder host) rather than refusing to start; any committed secret literal that exists would be exploitable on disclosure.
- **Preconditions:** A required secret/URL is absent or empty at startup; the code substitutes a fallback literal rather than terminating.
- **Affected paths:**
  - `app/api/upload/route.ts`
  - `src/integrations/supabase/client.ts`
  - `src/config/firebase.ts`

> The enumeration of any hardcoded-secret occurrences and the client-bundle scan
> result are recorded as findings in `findings.md` (Req 4.1, 4.6).

---

## 4. `ssrf` — Server-Side Request Forgery

### 4.1 Mechanism M-SSRF-1 — Outbound lookup proxies

- **Entry surface:** AS-005 (`/api/gst-lookup`), AS-007 (`/api/pincode-lookup`), AS-014 (`server` DigiPIN decode).
- **Attacker-controlled input:** The GSTIN / pincode / DigiPIN value submitted by an unauthenticated caller.
- **Weakness:** These routes issue server-side outbound requests on behalf of the caller. SSRF arises if any caller-supplied value (URL, hostname, scheme, port, or path) is incorporated into the outbound target, or if the absence of format validation and a bounded timeout lets the caller shape or stall the outbound request. The exposure widens when no rate cap bounds the volume of outbound requests.
- **Impact:** Coercion of the server into attacker-influenced outbound requests, outbound amplification, and resource consumption from unbounded or slow upstream calls.
- **Preconditions:** Caller-supplied value reaches the outbound request target or path; missing input-format validation, missing bounded timeout, or missing rate cap.
- **Affected paths:**
  - `app/api/gst-lookup/route.ts`
  - `app/api/pincode-lookup/route.ts`
  - `server/index.js`

---

## 5. `insecure-file-upload` — Insecure file upload

### 5.1 Mechanism M-UP-1 — Type/content/size/path abuse on the upload route

- **Entry surface:** AS-009 (`/api/upload` POST).
- **Attacker-controlled input:** The uploaded file (declared MIME type, leading bytes, size), the destination folder value, and the client-supplied object-key prefix.
- **Weakness:** Without enforced constraints, an uploader can (a) declare an allowed MIME type while supplying mismatched content (a magic-byte mismatch), (b) upload a type outside the allowed union, (c) exceed the per-category size cap, (d) supply a destination folder containing `..`, a leading `/`, a backslash, characters outside `[a-zA-Z0-9_-/]`, or a non-allowlisted prefix (path traversal), (e) embed unsafe characters in the object-key prefix, or (f) store an inline-active content type (SVG, text, CSV, RTF) served inline.
- **Impact:** Storage-bucket abuse for malware hosting, stored XSS via inline-served active content, path traversal placing objects outside intended prefixes, and resource exhaustion via oversized files.
- **Preconditions:** The corresponding constraint (auth, MIME allowlist, magic-byte check, size cap, folder allowlist, prefix sanitization, attachment disposition) is absent or bypassable for the targeted file.
- **Affected paths:**
  - `app/api/upload/route.ts`
  - `src/lib/security/content-type.ts`
  - `src/lib/security/path-sanitizer.ts`

### 5.2 Mechanism M-UP-2 — Unauthenticated write to storage

- **Entry surface:** AS-009 (`/api/upload` POST).
- **Attacker-controlled input:** A POST upload with no valid Supabase session (no resolvable user from the Authorization Bearer token or the session cookie).
- **Weakness:** If a session cannot be resolved yet the handler still writes an object to storage (for example because the auth check runs after bytes are consumed, or is skipped), an anonymous caller can persist objects.
- **Impact:** Anonymous writes to the R2 bucket, enabling unattributed storage consumption and hosting of attacker content.
- **Preconditions:** No resolvable Supabase user; the handler proceeds to write despite the unresolved session.
- **Affected paths:**
  - `app/api/upload/route.ts`
  - `src/lib/auth/server-session.ts`

---

## 6. `auth-session-weakness` — Authentication and session weaknesses

### 6.1 Mechanism M-AUTH-1 — Tokens in localStorage exposed to XSS; no server-side session

- **Entry surface:** AS-023, AS-026 (login surfaces), AS-024, AS-025, AS-027 – AS-033 (gated pages), AS-001 – AS-003, AS-009 (server routes verifying sessions).
- **Attacker-controlled input:** Script executing in the page origin (via an XSS path such as [§2.4](#24-mechanism-m-inj-4--cross-site-scripting-via-rendered-server-supplied-content)), or a forged/absent session presented to a protected route.
- **Weakness:** Supabase authentication tokens persist in `localStorage`, which is readable by any script that achieves execution in the origin, and the session is not held in a cookie the server/Edge middleware can verify. Protection of protected routes depends on client-side guards that re-evaluate in an attacker-controllable environment; a server route that does not independently verify the session server-side before acting trusts an unverifiable client state.
- **Impact:** Session-token theft via XSS (token replay/account takeover), and access to protected server operations where the server does not verify the session itself.
- **Preconditions:** Tokens stored in `localStorage`; an XSS foothold for theft; a protected route that omits server-side session verification for the bypass.
- **Affected paths:**
  - `middleware.ts`
  - `src/integrations/supabase/client.ts`
  - `app/(erp)/login/page.tsx`, `app/(client-portal)/client-login/page.tsx`
  - `app/api/admin/create-user/route.ts`, `app/api/client-portal/create-client/route.ts`, `app/api/employee-portal/create-employee/route.ts`, `app/api/upload/route.ts`

### 6.2 Mechanism M-AUTH-2 — Hardcoded/default role fallback

- **Entry surface:** Application context consumed by the gated pages (AS-024 – AS-033).
- **Attacker-controlled input:** Any access attempt that reaches a code path applying a default role when the server has not confirmed an authenticated session and role.
- **Weakness:** A default or hardcoded role (for example a mock administrator user) applied when no authenticated session is confirmed grants privilege without verification.
- **Impact:** A caller is treated with an elevated role absent a verified session, enabling access to functionality gated on that role.
- **Preconditions:** A code path that assigns a default/hardcoded role when the session/role is unconfirmed.
- **Affected paths:**
  - `src/contexts/AppDataContext` (as referenced by Req 5.6; exact path confirmed in `findings.md`)

---

## 7. `security-misconfiguration` — Security misconfiguration (headers and CORS)

### 7.1 Mechanism M-CFG-1 — Missing defense-in-depth response headers / CSP

- **Entry surface:** AS-018 – AS-033 (served pages), AS-001 – AS-013 (API responses).
- **Attacker-controlled input:** A crafted page that frames the application, or content that relies on MIME sniffing / absent CSP to execute.
- **Weakness:** Absence of `X-Frame-Options`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`, or a `Content-Security-Policy` with non-wildcard `script-src`/`style-src`/`connect-src` removes the browser-enforced defenses against framing, MIME sniffing, and unauthorized script/connect origins.
- **Impact:** Clickjacking via framing, MIME-sniffing-driven content execution, and a wider blast radius for injected script (no CSP restriction on script/connect origins).
- **Preconditions:** The relevant header(s) absent or set to a permissive/wildcard value on responses.
- **Affected paths:**
  - `middleware.ts`

### 7.2 Mechanism M-CFG-2 — Permissive CORS

- **Entry surface:** AS-012 (`/api/upload` OPTIONS preflight), AS-014 – AS-017 (Express `cors()` with no origin restriction).
- **Attacker-controlled input:** A cross-origin request from an attacker-controlled site, including a forged `Origin` header.
- **Weakness:** A CORS policy that emits a wildcard `Access-Control-Allow-Origin` or reflects an arbitrary request origin allows scripts on attacker origins to read responses; the Express server applies `cors()` permitting all origins.
- **Impact:** Cross-origin reading of responses by attacker-controlled pages, enabling cross-site data access against the affected endpoints.
- **Preconditions:** ACAO set to wildcard or reflects a non-matching origin.
- **Affected paths:**
  - `app/api/upload/route.ts`
  - `server/index.js`

---

## 8. `pii-exposure` — Sensitive data and PII exposure

### 8.1 Mechanism M-PII-1 — Over-broad fields from the public verification endpoint

- **Entry surface:** AS-013 (`/api/verify-employee` GET), rendered at AS-022.
- **Attacker-controlled input:** Verification queries from an anonymous caller, repeated to enumerate records.
- **Weakness:** The endpoint returns employee attributes beyond the documented verification-field allowlist (it returns fields such as `branch_id`), so the public response carries PII and internal identifiers not required for verification.
- **Impact:** Disclosure of employee PII and internal identifiers to anonymous callers; combined with enumeration (see [§9](#9-rate-limiting-abuse--rate-limiting-and-abuse)), broad harvesting of the employee directory.
- **Preconditions:** The response projection includes attributes outside the verification-field allowlist.
- **Affected paths:**
  - `app/api/verify-employee/route.ts`
  - `src/lib/security/pii.ts`
  - `src/components/EmployeeVerificationPage.tsx`

### 8.2 Mechanism M-PII-2 — PII reachable behind client-side-only gates and the anon role

- **Entry surface:** AS-028 (`accounts`), AS-029 (`hr`), AS-032 (`sales`), AS-011 (`/api/upload` GET metadata), AS-034 (anon-role row access).
- **Attacker-controlled input:** Direct page requests (bypassing client gating) and direct PostgREST queries via the anon key.
- **Weakness:** PII (financial/account data, employee PII, customer/lead PII) sits behind pages gated only client-side ([§1.1](#11-mechanism-m-bac-1--client-side-only-page-gating)) and behind RLS that may be permissive ([§1.3](#13-mechanism-m-bac-3--rls-governed-row-access-via-the-anon-role)); the data layer is the only real boundary.
- **Impact:** Disclosure of PII held behind nominally-protected modules when the server-side boundary is absent or permissive.
- **Preconditions:** Client-side-only gating on the page; permissive RLS or over-broad anon column access on the underlying tables.
- **Affected paths:**
  - `app/(erp)/accounts/page.tsx`, `app/(erp)/hr/page.tsx`, `app/(erp)/sales/page.tsx`
  - `app/api/upload/route.ts`
  - `src/integrations/supabase/client.ts`

---

## 9. `rate-limiting-abuse` — Rate limiting and abuse

### 9.1 Mechanism M-RL-1 — Per-process in-memory limiter does not bound multi-instance volume

- **Entry surface:** AS-004 (`/api/enquiry`), AS-006 (`/api/lead`), AS-008 (`/api/quotation-pdf`), AS-005 / AS-007 (lookup proxies), AS-013 (`/api/verify-employee`).
- **Attacker-controlled input:** High-volume request floods (public writes, compute-heavy PDF renders, outbound-proxy calls, verification enumeration), optionally spread across instances.
- **Weakness:** The rate limiter is per-process and in-memory; it does not enforce a shared limit across multiple instances, so the effective cap multiplies with instance count and resets on process restart. Surfaces without any cap are bounded only by upstream/runtime limits.
- **Impact:** Spam and brute-force against public writes, CPU/memory exhaustion via the PDF route, outbound amplification via the lookup proxies, and enumeration of employee records — at volumes exceeding the nominal per-process cap when more than one instance runs.
- **Preconditions:** More than one running instance (or process restarts) for the shared-limit gap; a surface with no or per-process-only limiting.
- **Affected paths:**
  - `src/lib/rateLimit.ts`
  - `app/api/enquiry/route.ts`, `app/api/lead/route.ts`, `app/api/quotation-pdf/route.ts`, `app/api/gst-lookup/route.ts`, `app/api/pincode-lookup/route.ts`, `app/api/verify-employee/route.ts`

### 9.2 Mechanism M-RL-2 — Oversized compute payload to the PDF route

- **Entry surface:** AS-008 (`/api/quotation-pdf` POST), AS-016/AS-017 (Express equivalents).
- **Attacker-controlled input:** A quotation payload with a very large number of service-line entries (e.g. more than 500).
- **Weakness:** Rendering a PDF from an unbounded number of line entries consumes CPU and memory proportional to attacker-chosen payload size when a payload-size guard is absent.
- **Impact:** Resource exhaustion (CPU/memory) from a single oversized request.
- **Preconditions:** No upper bound on service-line count before rendering.
- **Affected paths:**
  - `app/api/quotation-pdf/route.ts`
  - `server/routes/quotation-pdf.js`

---

## 10. `dependency-supply-chain` — Dependency and supply-chain risk

### 10.1 Mechanism M-DEP-1 — Vulnerable or malicious package reaches the build

- **Entry surface:** Application-wide — the served client bundle (AS-018 – AS-033) and the API runtime (AS-001 – AS-013), anchored to the build manifest/lockfile.
- **Attacker-controlled input:** A known-vulnerable or malicious direct/transitive dependency, or a version range that resolves to a compromised release.
- **Weakness:** Dependencies expressed with range specifiers (`^`, `~`, `*`, comparator ranges) can resolve to a newly published vulnerable or malicious version; advisories against installed versions remain exploitable until addressed. A poisoned client dependency reaches any visitor; a vulnerable server dependency reaches any API caller.
- **Impact:** Execution of vulnerable or malicious code in the client bundle (visitor browsers) or the server runtime (API requests), without a session being required.
- **Preconditions:** A reported advisory against an installed version, or a range specifier permitting an unvetted resolution.
- **Affected paths:**
  - `package.json`
  - `package-lock.json`

> The audited advisory list (identifier, package, installed/fixed version, severity)
> is recorded in `findings.md` (Req 14.1).

---

## 11. `audit-logging-gap` — Audit logging and monitoring gaps

### 11.1 Mechanism M-LOG-1 — Placeholder/incomplete audit metadata

- **Entry surface:** AS-001 – AS-003 (creation routes), AS-004 / AS-006 (public writes), AS-010 (file deletion), AS-023 / AS-026 (login surfaces).
- **Attacker-controlled input:** A privileged or state-changing operation performed such that the audit record cannot attribute it (the operation itself is the "input" whose provenance is lost).
- **Weakness:** Audit entries record placeholder/hardcoded values instead of the actual runtime value — a hardcoded client-IP sentinel (`'client-side (see server logs for IP)'`) and a default actor (`'Admin'` / `'admin@safend.com'`) — and security-relevant events (auth-denied, login-failure) and a fallback channel on write failure may be absent. Entries therefore lack the actor user ID, source client IP, and reliable provenance.
- **Impact:** Privileged actions cannot be attributed to a specific actor or source after the fact; failed logins and denied authorizations may go unrecorded; failed audit writes may be silently discarded — collectively defeating post-incident investigation.
- **Preconditions:** Audit construction substitutes placeholder/default values for the actor and client IP; missing coverage of auth-failure events; no fallback channel on write failure.
- **Affected paths:**
  - `src/utils/auditLog.ts`

---

## 12. Not-applicable categories

Per Requirement 2.5, an in-scope threat category with **no applicable attack surface**
is recorded here as not-applicable with a reason.

**Current status: none.** All eleven in-scope `ThreatCategory` values
(`broken-access-control-idor`, `injection`, `crypto-failure-secret-exposure`, `ssrf`,
`insecure-file-upload`, `auth-session-weakness`, `security-misconfiguration`,
`pii-exposure`, `rate-limiting-abuse`, `dependency-supply-chain`, `audit-logging-gap`)
have at least one applicable surface in `threat-model.md` and a documented mechanism in
§1 – §11 above. No category is not-applicable.

> Should a future review determine that an in-scope category no longer has any
> applicable surface, add a record here in the form:
> `category: <ThreatCategory>` — `notApplicableReason: <reason the category has no
> applicable surface in this application>`.

---

## Coverage summary

- **Categories documented:** all 11 in-scope `ThreatCategory` values, each with at least one mechanism record (Req 2.1).
- **Mechanism records:** M-BAC-1 – M-BAC-4, M-INJ-1 – M-INJ-5, M-SEC-1 – M-SEC-2, M-SSRF-1, M-UP-1 – M-UP-2, M-AUTH-1 – M-AUTH-2, M-CFG-1 – M-CFG-2, M-PII-1 – M-PII-2, M-RL-1 – M-RL-2, M-DEP-1, M-LOG-1.
- **Every record states** entry surface, attacker-controlled input, weakness, observable impact (Req 2.1), explicit preconditions (Req 2.4), and repository-relative affected paths (Req 2.2).
- **No remediation language** appears in any record (Req 2.3).
- **Not-applicable categories:** none (Req 2.5); the convention is documented in §12.

> **Maintenance (Req 1.6 cross-reference):** when `attack-surfaces.md` or
> `threat-model.md` changes, re-review the affected mechanism records here — including
> entry surfaces, preconditions, and affected paths — before that change is deployed.
