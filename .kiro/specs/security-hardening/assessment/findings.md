# Finding Registry

> Assessment artifact for the **security-hardening** spec.
> Satisfies Requirements **3.1** (reproducible verification recorded as
> `confirmed | not-exploitable | partially-mitigated | unverified` against a unique
> finding id), **3.2** (affected file/component by repo-relative path), **3.3**
> (prior-audit re-verification status), **3.4** (repro detail for confirmed findings),
> **3.5** (unverified reason), **3.6** (severity for each confirmed finding), and
> **3.7** (controlled-environment, non-destructive procedures only). It also records
> the assessment-only outcomes required by **4.1**, **4.6**, **6.1**, **6.8**, **7.1**,
> **8.3**, **8.6**, **11.5**, **12.1**, **13.4**, and **15.3**.

## Purpose and method

This registry re-verifies every candidate finding **against the current code** rather
than inheriting verdicts from the prior `AUDIT_REPORT.md` (2025-08-12, 49 findings).
Each finding records, per the `Finding` schema in `src/lib/security/types.ts`:

- **id** — unique identifier `F-NNN` (Req 3.1).
- **category** — the `ThreatCategory` key.
- **affectedComponent** — repo-relative file/component path(s) (Req 3.2).
- **mechanismRef** — the mechanism record in `mechanisms.md` (`M-XXX-N`).
- **verification** — exactly one of `confirmed | not-exploitable | partially-mitigated | unverified` (Req 3.1).
- **priorAuditStatus** — `still-applies | no-longer-applies | partially-applies` for prior-audit items (Req 3.3).
- **reproDetail** — the request/payload/query and observed result for `confirmed`/`partially-mitigated` findings (Req 3.4).
- **unverifiedReason** — the reason when `unverified` (Req 3.5).
- **severity** — `Critical | High | Medium | Low`, required when `confirmed` (Req 3.6).

### Verification-procedure safety constraints (Req 3.2, 3.7)

Every `Verification_Procedure` referenced below is defined to run **only against a
non-production or controlled environment** (a local dev instance, a disposable Supabase
project, or static source/build inspection). **No** procedure uses a payload that would
damage data, exfiltrate real secrets, or affect real users (Req 3.7):

- Source/build inspection (`grep`, reading files, `npm audit`, bundle scan) is read-only
  and runs against the working tree — no live system is touched.
- Dynamic request procedures (e.g. `curl` against a route) target a **local dev server**
  with **seeded throwaway data** and use benign payloads (a 1×1 PNG, a `'..'` folder
  string, an over-length search string). Destructive verbs (DELETE) are exercised only
  against seeded throwaway object keys in a controlled bucket.
- RLS procedures run against a **disposable Supabase instance** loaded with the
  `scripts/` SQL, using seeded branch/user rows — never production credentials.

### Verification-result legend

| Result | Meaning |
|--------|---------|
| `confirmed` | The weakness is present and exploitable / observable in current code. |
| `partially-mitigated` | A control exists but an exploitable gap or limitation remains. |
| `not-exploitable` | The candidate weakness is not present/exploitable in current code (a prior-audit item that has been remediated). |
| `unverified` | Exploitability could not be conclusively determined; reason recorded (Req 3.5). |

### Severity rubric (Req 3.6)

Severity is derived from impact × exploitability:

- **Critical** — unauthenticated or trivial path to full data/credential compromise or RCE.
- **High** — significant data exposure / integrity loss, or privileged action reachable with low effort.
- **Medium** — meaningful weakness requiring a precondition, narrower blast radius, or defense-in-depth gap.
- **Low** — limited impact, hard-to-reach, or informational hardening gap.

---

## Finding registry

| ID | Category | Affected component | Mechanism | Verification | Prior-audit | Severity |
|----|----------|--------------------|-----------|--------------|-------------|:--------:|
| **F-001** | auth-session-weakness | `middleware.ts`, `src/integrations/supabase/client.ts`, `src/components/ProtectedRoute.tsx` | M-BAC-1 / M-AUTH-1 | confirmed | still-applies | High |
| **F-002** | auth-session-weakness | `src/integrations/supabase/client.ts` (localStorage tokens) | M-AUTH-1 | confirmed | still-applies | High |
| **F-003** | broken-access-control-idor | `app/(erp)/**/page.tsx`, `app/(client-portal)/client-portal/page.tsx`, `app/(employee-portal)/employee-portal/page.tsx` | M-BAC-1 | confirmed | still-applies | High |
| **F-004** | broken-access-control-idor | `app/api/upload/route.ts` (DELETE/GET by arbitrary key) | M-BAC-2 | partially-mitigated | partially-applies | Medium |
| **F-005** | broken-access-control-idor | Supabase RLS (`scripts/*.sql`), `src/integrations/supabase/client.ts` | M-BAC-3 | partially-mitigated | partially-applies | High |
| **F-006** | broken-access-control-idor | `app/api/verify-employee/route.ts` (unauth employee read) | M-BAC-4 | confirmed | still-applies | Medium |
| **F-007** | injection | `app/api/verify-employee/route.ts` (PostgREST `.or()` filter) | M-INJ-1 | partially-mitigated | new | Low |
| **F-008** | injection | `app/api/quotation-pdf/route.ts`, `server/routes/quotation-pdf.js` (Content-Disposition) | M-INJ-2 | not-exploitable | partially-applies | Low |
| **F-009** | injection | `app/api/enquiry/route.ts`, `app/api/lead/route.ts`, `app/api/admin/create-user/route.ts`, `app/api/client-portal/create-client/route.ts`, `app/api/employee-portal/create-employee/route.ts` | M-INJ-3 | partially-mitigated | new | Medium |
| **F-010** | injection | `src/components/EmployeeVerificationPage.tsx`, `src/modules/Index.tsx` (React escaping) | M-INJ-4 | not-exploitable | new | Low |
| **F-011** | crypto-failure-secret-exposure | `app/api/admin/create-user/route.ts`, `app/api/upload/route.ts`, `app/api/verify-employee/route.ts` (hardcoded-secret scan) | M-SEC-1 / M-SEC-2 | not-exploitable | no-longer-applies | High |
| **F-012** | crypto-failure-secret-exposure | `src/integrations/supabase/client.ts`, `app/api/upload/route.ts` (silent secret fallbacks) | M-SEC-2 | confirmed | new | Medium |
| **F-013** | crypto-failure-secret-exposure | Client bundle (`.next/`), `src/integrations/supabase/client.ts` (client-bundle secret scan) | M-SEC-1 | confirmed | new | Low |
| **F-014** | ssrf | `app/api/gst-lookup/route.ts`, `app/api/pincode-lookup/route.ts` | M-SSRF-1 | not-exploitable | new | Low |
| **F-015** | ssrf | `server/index.js` (DigiPIN decode) | M-SSRF-1 | unverified | new | — |
| **F-016** | insecure-file-upload | `app/api/upload/route.ts` (type/content/size/path constraints) | M-UP-1 | partially-mitigated | partially-applies | Medium |
| **F-017** | insecure-file-upload | `app/api/upload/route.ts` (unauthenticated write) | M-UP-2 | not-exploitable | no-longer-applies | High |
| **F-018** | auth-session-weakness | `app/api/admin/create-user/route.ts` (route auth guard) | M-AUTH-1 | not-exploitable | no-longer-applies | High |
| **F-019** | broken-access-control-idor | `src/contexts/AppDataContext.tsx` (mock admin role) | M-AUTH-2 | not-exploitable | no-longer-applies | High |
| **F-020** | security-misconfiguration | `middleware.ts` (missing CSP) | M-CFG-1 | confirmed | new | Medium |
| **F-021** | security-misconfiguration | `app/api/upload/route.ts` OPTIONS, `server/index.js` (CORS) | M-CFG-2 | partially-mitigated | new | Medium |
| **F-022** | pii-exposure | `app/api/verify-employee/route.ts` (over-broad fields) | M-PII-1 | confirmed | still-applies | Medium |
| **F-023** | pii-exposure | `server/index.js` `/health` | M-CFG-1 | unverified | new | — |
| **F-024** | rate-limiting-abuse | `src/lib/rateLimit.ts` (per-process, in-memory) | M-RL-1 | confirmed | new | Medium |
| **F-025** | rate-limiting-abuse | `app/api/quotation-pdf/route.ts` (oversized payload) | M-RL-2 | partially-mitigated | new | Low |
| **F-026** | dependency-supply-chain | `package.json`, `package-lock.json` | M-DEP-1 | confirmed | new | Critical |
| **F-027** | audit-logging-gap | `src/utils/auditLog.ts` (placeholder IP + default actor) | M-LOG-1 | confirmed | still-applies | Medium |
| **F-028** | broken-access-control-idor | Code-referenced tables with no SQL definition | M-BAC-3 | confirmed | partially-applies | Medium |
| **F-029** | injection | `server/routes/quotation-pdf.js` (schema validation) | M-INJ-3 | partially-mitigated | partially-applies | Low |

**Counts:** 29 findings — `confirmed`: 12, `partially-mitigated`: 8, `not-exploitable`: 7,
`unverified`: 2. Each `confirmed`/`partially-mitigated` finding carries a severity (Req 3.6);
`not-exploitable` findings retain a severity reflecting the impact *if the control regresses*,
for traceability. Severity tally of remediation-relevant (`confirmed` + `partially-mitigated`)
findings: **Critical 1, High 4, Medium 11, Low 4** (20 total).

---

## Per-finding detail

### F-001 — Client-side-only authentication; no server/edge session verification

- **Category:** `auth-session-weakness` · **Mechanism:** M-BAC-1 / M-AUTH-1 · **Severity:** High
- **Affected:** `middleware.ts`, `src/integrations/supabase/client.ts`, `src/components/ProtectedRoute.tsx`
- **Verification:** `confirmed` · **Prior-audit:** still-applies (AUDIT bug #7)
- **Procedure (controlled, read-only):** Read `middleware.ts` — it sets headers only and
  documents that it "does NOT enforce authentication" because sessions live in `localStorage`.
  Confirm no `app/api/**` server-side session-cookie verification at the edge.
- **Repro detail:** `middleware.ts` returns `NextResponse.next()` with headers and no auth
  branch; gating depends entirely on client guards re-evaluated in the browser. A direct
  request to a protected page route receives the page document without a server session check.
- **Notes:** The architectural root behind Req 5.1/5.4/5.7. Remediated by the cookie-based
  `@supabase/ssr` session strategy + edge verification in the remediation plan.

### F-002 — Auth tokens in localStorage exposed to any successful XSS

- **Category:** `auth-session-weakness` · **Mechanism:** M-AUTH-1 · **Severity:** High
- **Affected:** `src/integrations/supabase/client.ts`
- **Verification:** `confirmed` · **Prior-audit:** still-applies
- **Procedure (controlled, read-only):** Inspect the Supabase client config — `persistSession: true`
  with the default `localStorage` storage. Tokens are readable by any script in the origin.
- **Repro detail:** `getSupabaseClient()` creates the client with `auth.persistSession: true`
  and no cookie storage adapter; the access/refresh tokens are written to `localStorage`,
  which is reachable by `localStorage.getItem(...)` from any injected script (precondition: an
  XSS foothold — see F-010 path analysis). Documents Requirement 5.1.

### F-003 — Protected pages served to unauthenticated callers (client-side gating only)

- **Category:** `broken-access-control-idor` · **Mechanism:** M-BAC-1 · **Severity:** High
- **Affected:** `app/(erp)/dashboard|accounts|hr|office-admin|operations|sales|profile/page.tsx`,
  `app/(client-portal)/client-portal/page.tsx`, `app/(employee-portal)/employee-portal/page.tsx`
- **Verification:** `confirmed` · **Prior-audit:** still-applies
- **Procedure (controlled):** Against a local dev server, request a protected route
  (e.g. `GET /dashboard`) with no session cookie/header; observe the server returns the
  page document (HTTP 200) and the gate only runs after hydration.
- **Repro detail:** Because `middleware.ts` performs no auth (F-001) and the route group
  layouts wrap children in client-side `ProtectedRoute`/`ClientProtectedRoute`/`EmployeeProtectedRoute`,
  the server does not deny the request. The real data boundary is RLS (F-005). Maps to the
  manual-review-flagged surfaces AS-024/025/027–033.

### F-004 — Destructive/metadata upload operations keyed by arbitrary object key

- **Category:** `broken-access-control-idor` · **Mechanism:** M-BAC-2 · **Severity:** Medium
- **Affected:** `app/api/upload/route.ts` (DELETE, GET)
- **Verification:** `partially-mitigated` · **Prior-audit:** partially-applies
- **Procedure (controlled):** Read the DELETE/GET handlers; with a seeded staff session,
  observe that the handler accepts any `key` and calls `DeleteObjectCommand`/`HeadObjectCommand`
  without binding the key to the caller's branch/tenant.
- **Repro detail:** DELETE/GET now require auth **and** `callerHasStaffRole(user.id)` (the
  prior-audit unauthenticated gap is closed), but the target `key` is not constrained to the
  caller's scope. Any staff-role holder can delete/probe another branch's object by key.
  Mitigation present (role gate) but cross-tenant key binding absent — hence partial.

### F-005 — Permissive RLS history; live policy set depends on apply order

- **Category:** `broken-access-control-idor` · **Mechanism:** M-BAC-3 · **Severity:** High
- **Affected:** `scripts/*.sql` (esp. `fix_branches_rls_recursion.sql`, `fix_users_rls_anon.sql`,
  `fix_roles_rls_anon.sql`, `fix_branches_rls_anon.sql` vs. `consolidated_rls_hardening.sql`,
  `branch_isolation_rls.sql`, `fix_rls_security_regression.sql`), `src/integrations/supabase/client.ts`
- **Verification:** `partially-mitigated` · **Prior-audit:** partially-applies (AUDIT bugs #5, #6)
- **Procedure (controlled):** Static review of `scripts/`. `consolidated_rls_hardening.sql`
  (task 15.1) defines branch-scoped, role-aware policies on non-recursive `SECURITY DEFINER`
  helpers and denies anon writes to `users`/`roles`/`branches`. The earlier permissive scripts
  (`fix_*_rls_anon.sql`, `fix_branches_rls_recursion.sql`) still exist in the tree and would
  reintroduce `USING (true)`/anon-CRUD if re-applied.
- **Repro detail (Req 6.1):** The hardening migration's header explicitly states it SUPERSEDES
  the Phase-4 fix scripts and that those "must NOT be re-run." The **live** effective policy on
  a target database therefore depends on apply order, which is enforced only by documentation
  (`APPLY_ORDER.md`), not by the schema. On a disposable Supabase instance loaded with the
  consolidated migration last, branch isolation and anon-write denial hold; loaded with a
  `fix_*_rls_anon.sql` last, the anon role regains CRUD on `users`/`roles`/`branches`.
- **Notes:** Tables enumerated by Req 6.1 (permissive `USING (true)` / anon-CRUD) are listed in
  [Appendix A](#appendix-a--rls-permissive--anon-crud-tables-req-61). Integration tests
  (task 15.2) verify the post-migration state.

### F-006 — Unauthenticated read of the employee directory

- **Category:** `broken-access-control-idor` · **Mechanism:** M-BAC-4 · **Severity:** Medium
- **Affected:** `app/api/verify-employee/route.ts`
- **Verification:** `confirmed` · **Prior-audit:** still-applies (AUDIT bug #3, auth aspect)
- **Procedure (controlled):** Against a local dev server seeded with throwaway employee rows,
  `GET /api/verify-employee?q=<2+chars>` with no session returns employee rows.
- **Repro detail:** The route is service-role backed and applies no auth; the only gate is the
  ≥2-char sanitized term and `.limit(20)`. An anonymous caller can enumerate the directory by
  iterating search terms. PII over-disclosure on the same surface is F-022; rate-limit aspect
  is F-024. (This surface is intentionally public for verification, so the finding is the
  *over-broad* read + enumeration, not the publicness itself.)

### F-007 — PostgREST filter-injection surface on the verification search term

- **Category:** `injection` · **Mechanism:** M-INJ-1 · **Severity:** Low
- **Affected:** `app/api/verify-employee/route.ts`
- **Verification:** `partially-mitigated` · **Prior-audit:** new
- **Procedure (controlled):** Read `sanitizeSearchTerm`; submit `q` values containing
  `, ( ) . : * %` against a local dev server and confirm they are stripped before the `.or()`.
- **Repro detail:** The inline `sanitizeSearchTerm` regex `[^a-zA-Z0-9 _.\-&/']` **retains** `.`,
  `_`, `&`, `/`, and `'`. PostgREST treats `.` as a structural separator inside `.or()`
  (`col.op.value`), so retaining `.` is a residual structural-char gap versus the design's safe
  set (alphanumerics, spaces, hyphens, apostrophes — Req 8.2). No filter break was achieved with
  benign inputs because the term is wrapped in `%...%` `ilike` operands, but the retained `.`/`/`
  characters mean the sanitizer does not match the required safe set. Remediated by replacing the
  inline sanitizer with `src/lib/security/search-sanitizer.ts` (task 3.1 / 10.3).

### F-008 — Content-Disposition header injection (quotation PDF filename)

- **Category:** `injection` · **Mechanism:** M-INJ-2 · **Severity:** Low
- **Affected:** `app/api/quotation-pdf/route.ts`, `server/routes/quotation-pdf.js`
- **Verification:** `not-exploitable` · **Prior-audit:** partially-applies
- **Procedure (controlled):** Read `safeFilenamePart`; POST a quotation with
  `quotationId` containing CR/LF and `/` to a local dev server; inspect the response
  `Content-Disposition` header.
- **Repro detail:** `safeFilenamePart` replaces every char outside `[a-zA-Z0-9._-]` with `_`
  and caps to 80 chars before the value is embedded in the header, so control chars and path
  separators cannot reach the header. Not exploitable in the Next.js route. The Express
  equivalent (`server/routes/quotation-pdf.js`) is covered by F-029 / F-015 manual-review.

### F-009 — Request bodies persisted via service role with incomplete schema/length validation

- **Category:** `injection` · **Mechanism:** M-INJ-3 · **Severity:** Medium
- **Affected:** `app/api/enquiry/route.ts`, `app/api/lead/route.ts`, `app/api/admin/create-user/route.ts`,
  `app/api/client-portal/create-client/route.ts`, `app/api/employee-portal/create-employee/route.ts`
- **Verification:** `partially-mitigated` · **Prior-audit:** new
- **Procedure (controlled):** Read each route. `lead` and `enquiry` validate against
  `leadSchema`/`enquirySchema` (zod) and reject malformed JSON with 400. `create-user` validates
  only `email`/`password` presence and a role allowlist; the creation routes do not enforce a
  uniform per-field 10,000-char cap (Req 8.1).
- **Repro detail:** `POST /api/lead` with malformed JSON returns 400 (`catch` around
  `request.json()`); with a schema-violating body returns 400 with `fieldErrors`. However the
  per-field 10,000-char maximum from Req 8.1 is not uniformly enforced across the creation
  routes, and `create-user` accepts arbitrary `name`/`branch` strings of unbounded length.
  Partial mitigation: schema validation present on public writes; length cap + schema coverage
  on creation routes pending (`src/lib/security/request-validation.ts`, task 9.5 / 10.3).

### F-010 — Stored XSS via rendered server-supplied employee content

- **Category:** `injection` · **Mechanism:** M-INJ-4 · **Severity:** Low
- **Affected:** `src/components/EmployeeVerificationPage.tsx`, `src/modules/Index.tsx`
- **Verification:** `not-exploitable` · **Prior-audit:** new
- **Procedure (controlled):** Grep the verification UI and `src/**` for `dangerouslySetInnerHTML`
  and unescaped `href`/attribute injection of server-supplied employee fields.
- **Repro detail:** Employee fields are rendered as React string children (default-escaped);
  no `dangerouslySetInnerHTML` render path for verification content was found. React's default
  escaping holds, so stored XSS via this path is not exploitable in current code. Recorded per
  Req 8.6 (verify React escaping). Re-check required if a `dangerouslySetInnerHTML`/raw-attribute
  path is later introduced.

### F-011 — Hardcoded-secret scan of source (service-role JWT, R2 keys)

- **Category:** `crypto-failure-secret-exposure` · **Mechanism:** M-SEC-1 / M-SEC-2 · **Severity:** High
- **Affected:** `app/api/admin/create-user/route.ts`, `app/api/upload/route.ts`, `app/api/verify-employee/route.ts`
- **Verification:** `not-exploitable` · **Prior-audit:** no-longer-applies (AUDIT bugs #1, #2, #3)
- **Procedure (Req 4.1, controlled, read-only):** Scan the source tree, config files, and build
  output for hardcoded secrets — Service_Role_Key, R2 access keys, Firebase keys, anon key —
  recording file path, location, and secret type for each occurrence.
- **Repro detail (scan result):** The three routes that previously embedded the Supabase
  service-role JWT and R2 credentials as fallback literals now read them **exclusively** from
  `process.env` and `throw` at module load when absent (`create-user` lines 5–12, `verify-employee`
  lines 5–12, `upload` lines 7–11). **No** hardcoded service-role key, R2 secret, or Firebase
  private key literal was found in source. The only embedded credentials are the intentional
  `NEXT_PUBLIC_*` anon key/URL (public by design — see F-013). Prior-audit HIGH findings #1–#3
  no longer apply. Severity retained as High for regression traceability (Req 4.7 rotation
  still applies if the keys were ever committed historically).

### F-012 — Silent secret/URL fallbacks instead of fail-fast

- **Category:** `crypto-failure-secret-exposure` · **Mechanism:** M-SEC-2 · **Severity:** Medium
- **Affected:** `src/integrations/supabase/client.ts`, `app/api/upload/route.ts`
- **Verification:** `confirmed` · **Prior-audit:** new
- **Procedure (controlled, read-only):** Read the credential reads in both files.
- **Repro detail:** `src/integrations/supabase/client.ts` uses
  `process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'` and
  `... || ''` for the anon key; `app/api/upload/route.ts` uses
  `R2_BUCKET_NAME ?? 'safend-profile-pictures'` and `R2_PUBLIC_URL ?? ''`. A process started
  with these vars absent does **not** fail fast (Req 4.3) — it serves requests in a misconfigured
  state (routed to a placeholder host / empty key). Confirmed gap. Remediated by
  `src/lib/security/env-bootstrap.ts` + fail-fast reads (task 8.1 / 8.3).

### F-013 — Anon key + Supabase URL present in the client bundle

- **Category:** `crypto-failure-secret-exposure` · **Mechanism:** M-SEC-1 · **Severity:** Low
- **Affected:** client bundle (`.next/`), `src/integrations/supabase/client.ts`
- **Verification:** `confirmed` · **Prior-audit:** new
- **Procedure (Req 4.6, controlled):** Build the app and scan the produced client bundle for
  secret literals; confirm only the intended `NEXT_PUBLIC_*` anon key/URL appear and that **no**
  service-role key or R2 secret literal is present.
- **Repro detail:** The `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SUPABASE_URL` are
  embedded in the bundle by design (required for the browser Supabase client). This is the
  expected, documented exposure — its safety depends entirely on restrictive RLS (F-005). The
  client-bundle scan confirms **no** server-only secret (service-role JWT, R2 keys, Firebase
  private key) leaks into the bundle, satisfying Req 4.6's negative check. Recorded as a Low
  informational finding because the anon-key exposure is inherent and only becomes material
  when combined with permissive RLS.

### F-014 — SSRF on the Next.js lookup proxies

- **Category:** `ssrf` · **Mechanism:** M-SSRF-1 · **Severity:** Low
- **Affected:** `app/api/gst-lookup/route.ts`, `app/api/pincode-lookup/route.ts`
- **Verification:** `not-exploitable` · **Prior-audit:** new
- **Procedure (controlled):** Read both routes; submit malformed GSTIN/pincode values and
  attempt to influence the outbound host/path against a local dev server.
- **Repro detail:** Both routes validate the input (15-char GSTIN format / 6-digit pincode)
  before issuing the outbound request, target **fixed** hosts (`gst.jamku.app`,
  `api.postalpincode.in`), apply bounded timeouts (10s / 8s), and never incorporate a
  caller-supplied URL/host/scheme/port. No caller-controlled value reaches the outbound target.
  Not exploitable for SSRF. (The per-process rate-limit limitation is F-024.)

### F-015 — SSRF on the Express DigiPIN decode route

- **Category:** `ssrf` · **Mechanism:** M-SSRF-1 · **Severity:** — (unverified)
- **Affected:** `server/index.js`
- **Verification:** `unverified` · **Prior-audit:** new
- **Unverified reason (Req 3.5):** The Express server is a **separate process** whose
  deployment status cannot be determined from source (matching the manual-review flag on
  AS-014). Whether the route is reachable in any environment is undetermined, so exploitability
  cannot be conclusively established. Re-verify once the deployment topology is confirmed; if
  deployed, run the controlled SSRF procedure against a local instance.

### F-016 — Upload type/content/size/path constraints

- **Category:** `insecure-file-upload` · **Mechanism:** M-UP-1 · **Severity:** Medium
- **Affected:** `app/api/upload/route.ts`
- **Verification:** `partially-mitigated` · **Prior-audit:** partially-applies
- **Procedure (controlled, benign payloads):** Against a local dev server with a seeded staff
  session, POST: (a) a `.png` whose bytes are `<html>` (magic-byte mismatch), (b) a folder
  value `../etc`, (c) an oversized buffer, (d) an SVG. Observe rejections / dispositions.
- **Repro detail:** The route enforces the MIME allowlist, `contentMatchesDeclaredType`
  magic-byte check (JPEG/PNG/GIF/WEBP/BMP/PDF/OOXML/OLE2), per-category size caps
  (10/100/50 MB), `isAllowedFolder` traversal/allowlist check, prefix/filename sanitization
  (`[^a-zA-Z0-9.-] → _`), and `Content-Disposition: attachment` for inline-unsafe types
  (SVG/text/CSV/RTF). All controls are present. The residual gap is that these are **inline,
  per-route** implementations not shared with other routes and not independently unit/property
  tested; the design extracts them to `src/lib/security/content-type.ts` and
  `path-sanitizer.ts` for verification (tasks 4.1, 3.5, 10.3). Partial because the behavior is
  correct but unverified/unconsolidated.

### F-017 — Unauthenticated upload write

- **Category:** `insecure-file-upload` · **Mechanism:** M-UP-2 · **Severity:** High
- **Affected:** `app/api/upload/route.ts`
- **Verification:** `not-exploitable` · **Prior-audit:** no-longer-applies (AUDIT bug #17)
- **Procedure (controlled):** `POST /api/upload` with no Authorization header and no session
  cookie against a local dev server; observe response.
- **Repro detail:** The POST handler calls `getAuthenticatedUser(request)` first and returns
  HTTP 401 with no object written when no Supabase user resolves from the Bearer token or cookie.
  The prior-audit unauthenticated-write finding no longer applies. Severity retained High for
  regression traceability.

### F-018 — Admin user-creation route lacked an auth guard

- **Category:** `auth-session-weakness` · **Mechanism:** M-AUTH-1 · **Severity:** High
- **Affected:** `app/api/admin/create-user/route.ts`
- **Verification:** `not-exploitable` · **Prior-audit:** no-longer-applies (AUDIT bug #4)
- **Procedure (controlled):** `POST /api/admin/create-user` with no session and with a
  non-admin session against a local dev server; observe 401/403.
- **Repro detail:** The route now builds a per-request client from the caller's cookie, calls
  `auth.getUser()` (401 if absent), and verifies an `admin` row in `user_roles` (403 otherwise)
  before creating any user; it also validates requested roles against an `ASSIGNABLE_ROLES`
  allowlist (400 on invalid). The prior unauthenticated-creation finding no longer applies.
  (Authorization derives from the server-verified session, not the body — satisfies Req 7.4.)

### F-019 — Hardcoded mock administrator role

- **Category:** `broken-access-control-idor` · **Mechanism:** M-AUTH-2 · **Severity:** High
- **Affected:** `src/contexts/AppDataContext.tsx`
- **Verification:** `not-exploitable` · **Prior-audit:** no-longer-applies (AUDIT bug #15)
- **Procedure (controlled, read-only):** Read `AppDataContext.tsx` around the `user` field.
- **Repro detail:** `userData` is now `null` with a comment that "the context does not own auth
  state"; the returned `user` is `userData || context.user`. No component receives a hardcoded
  `role: 'admin'`. The prior mock-admin finding no longer applies (Req 5.6 verified). Severity
  retained High for regression traceability.

### F-020 — Missing Content-Security-Policy header

- **Category:** `security-misconfiguration` · **Mechanism:** M-CFG-1 · **Severity:** Medium
- **Affected:** `middleware.ts`
- **Verification:** `confirmed` · **Prior-audit:** new
- **Procedure (Req 11.5, controlled):** Request any route on a local dev server and inspect
  response headers.
- **Repro detail (header presence/absence, Req 11.5):** `middleware.ts` sets `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy`, and `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  — all present and conformant with Req 11.1. **No `Content-Security-Policy` header is set**
  (Req 11.2 unmet). Confirmed gap. Remediated by adding CSP with non-wildcard
  `script-src`/`style-src`/`connect-src` (task 12.3).

### F-021 — CORS policy (Next.js OPTIONS conformant; Express permissive)

- **Category:** `security-misconfiguration` · **Mechanism:** M-CFG-2 · **Severity:** Medium
- **Affected:** `app/api/upload/route.ts` (OPTIONS), `server/index.js`
- **Verification:** `partially-mitigated` · **Prior-audit:** new
- **Procedure (Req 11.5, controlled):** Send a CORS preflight to `/api/upload` with a
  non-matching `Origin`; inspect `Access-Control-Allow-Origin`. Read the Express `cors()` config.
- **Repro detail (CORS behavior, Req 11.5):** The Next.js upload `OPTIONS` sets ACAO to the
  configured site origin only (and omits the header entirely when unset) — never a wildcard,
  never a reflected origin — conformant with Req 11.3/11.4. The Express server applies bare
  `cors()` which permits **all** origins (`Access-Control-Allow-Origin: *`). Partial: the
  primary app is correct; the Express process (manual-review, deployment undetermined) is
  permissive. Severity Medium because exploitability of the Express side depends on F-015's
  unresolved deployment status.

### F-022 — Public verification endpoint returns over-broad PII fields

- **Category:** `pii-exposure` · **Mechanism:** M-PII-1 · **Severity:** Medium
- **Affected:** `app/api/verify-employee/route.ts`
- **Verification:** `confirmed` · **Prior-audit:** still-applies (AUDIT bug #3, field aspect)
- **Procedure (Req 12.1, controlled):** `GET /api/verify-employee?q=<term>` against a local
  dev server seeded with throwaway employees; inspect the returned field set.
- **Repro detail:** The `.select(...)` returns `id, employee_id, name, department, designation,
  join_date, status, photo_url, gender, branch_id`. The internal identifiers `id` and `branch_id`
  are **outside** the documented verification-field allowlist (`employee_id, name, department,
  designation, join_date, status, photo_url, gender` — Req 12.2 / `VerificationResultRecord`).
  An anonymous caller receives the internal row id and branch id. Confirmed PII over-disclosure.
  Remediated by `projectVerificationFields` (`src/lib/security/pii.ts`, task 6.1 / 10.3).
- **Notes (Req 12.1 — PII-returning public endpoints):** The complete list of public endpoints
  returning PII is in [Appendix C](#appendix-c--public-pii-returning-endpoints-req-121).

### F-023 — Express `/health` info disclosure

- **Category:** `pii-exposure` · **Mechanism:** M-CFG-1 · **Severity:** — (unverified)
- **Affected:** `server/index.js` (`/health`)
- **Verification:** `unverified` · **Prior-audit:** new
- **Unverified reason (Req 3.5):** Same as F-015 — the Express process deployment status is
  undetermined from source (manual-review flag on AS-015). Cannot conclusively determine whether
  the endpoint is reachable or what it discloses in any live environment. Re-verify once
  deployment topology is known.

### F-024 — Rate limiter is per-process and in-memory

- **Category:** `rate-limiting-abuse` · **Mechanism:** M-RL-1 · **Severity:** Medium
- **Affected:** `src/lib/rateLimit.ts` (consumed by `enquiry`, `lead`, `quotation-pdf`,
  `gst-lookup`, `pincode-lookup`, `verify-employee`)
- **Verification:** `confirmed` · **Prior-audit:** new
- **Procedure (Req 13.4, controlled, read-only):** Read `src/lib/rateLimit.ts`.
- **Repro detail (Req 13.4):** The limiter stores counters in a module-level in-memory `Map`
  keyed by client id. It enforces the cap **per process only**; with N application instances the
  effective cap is N× the nominal limit, and all counters reset on process restart. It does not
  enforce a shared limit across instances. Confirmed (documents Req 13.4). The single-process
  windowing behavior itself is correct and is property-tested (Property 16). Remediated by a
  shared/edge-enforced limiter in the remediation plan (Req 13.5).

### F-025 — Quotation-PDF oversized-payload guard

- **Category:** `rate-limiting-abuse` · **Mechanism:** M-RL-2 · **Severity:** Low
- **Affected:** `app/api/quotation-pdf/route.ts`
- **Verification:** `partially-mitigated` · **Prior-audit:** new
- **Procedure (controlled):** POST a quotation payload with `posts.length > 500` to a local
  dev server; observe HTTP 413 and that no PDF is rendered.
- **Repro detail:** The route rejects `quotation.posts.length > 500` with HTTP 413 before
  rendering (Req 13.6 satisfied for the `posts` array) and rate-limits 10/60s per IP. Partial
  because the 500-entry guard keys off `posts` only; other unbounded collections used by
  `buildDoc` (e.g. `serviceInstances`, `locations`) are not size-capped, leaving a narrower
  compute-amplification path. Low severity (authenticated compute cost, capped by the rate limit).

### F-026 — Vulnerable dependencies (npm audit)

- **Category:** `dependency-supply-chain` · **Mechanism:** M-DEP-1 · **Severity:** Critical
- **Affected:** `package.json`, `package-lock.json`
- **Verification:** `confirmed` · **Prior-audit:** new
- **Procedure (Req 14.1, controlled, read-only):** `npm audit --json` against the manifest and
  lockfile (direct + transitive).
- **Repro detail (audit summary):** 44 advisories — **3 critical, 8 high, 33 moderate**. The
  per-advisory table (identifier, package, installed range, fixed version, severity) is in
  [Appendix B](#appendix-b--dependency-advisories-req-141). Notable Critical/High:
  `protobufjs` (GHSA-xq3m-2v4x-88gg, RCE, fix <7.5.5+), `vitest` (GHSA-9crc-q9x8-hgqq /
  GHSA-5xrq-8626-4rwp, RCE when API/UI server listening, fix 4.1.8), `fast-xml-parser`
  (GHSA-m7jm-9gc2-mpf2, critical), `xlsx` (GHSA-4r6h-8v6p-xvw6 prototype pollution +
  GHSA-5pgg-2g8v-p4x9 ReDoS, **no fix available**), `lodash`/`lodash-es` (GHSA-r5fr-rjxr-66jc
  code injection), `minimatch`/`picomatch`/`rollup`/`flatted` (high). Overall severity Critical
  driven by the protobufjs/vitest RCE advisories. Remediated by audit-based upgrades + exact
  pinning + CI gate (tasks 16.x).

### F-027 — Audit log records placeholder IP and default actor

- **Category:** `audit-logging-gap` · **Mechanism:** M-LOG-1 · **Severity:** Medium
- **Affected:** `src/utils/auditLog.ts`
- **Verification:** `confirmed` · **Prior-audit:** still-applies (AUDIT bugs #11, #24)
- **Procedure (Req 15.3, controlled, read-only):** Read `auditLog.ts`.
- **Repro detail (Req 15.3 — placeholder values):** `logActivity` hardcodes
  `const ipAddress = 'client-side (see server logs for IP)'` for every entry, and the
  `auditActions` helpers default the actor to `localStorage 'userName' || 'Admin'` /
  `'userEmail' || 'admin@safend.com'`. Entries therefore record a sentinel IP and may attribute
  actions to a default `Admin`/`admin@safend.com` actor rather than the real runtime values.
  No fallback channel on write failure, and auth-denied/login-failure events are not logged
  (Req 15.2/15.4 gaps). Confirmed. Remediated by the audit-entry builder + real IP + fallback
  (`src/lib/security/audit-entry.ts`, tasks 14.1/14.3).

### F-028 — Code-referenced tables with no SQL definition (unknown RLS)

- **Category:** `broken-access-control-idor` · **Mechanism:** M-BAC-3 · **Severity:** Medium
- **Affected:** application code referencing tables absent from `scripts/*.sql`
- **Verification:** `confirmed` · **Prior-audit:** partially-applies (AUDIT §3.1, §4.1)
- **Procedure (Req 6.8, controlled, read-only):** Cross-reference tables referenced via
  `.from('<table>')` in `src/**` against `CREATE TABLE` definitions in `scripts/*.sql`.
- **Repro detail (Req 6.8):** Several tables called out by the prior audit now **have** SQL
  definitions in `scripts/` (`create_employees_table.sql`, `create_attendance_records_table.sql`,
  `create_held_salaries_table.sql`, `create_user_sessions_table.sql`,
  `create_notifications_table.sql`, `create_payroll_requests_table.sql`), so those no longer
  apply. The residual code-referenced tables with **no** `CREATE TABLE` in `scripts/` — and thus
  **unknown RLS status** — are enumerated in
  [Appendix D](#appendix-d--code-referenced-tables-with-no-sql-definition-req-68)
  (notably the Firebase-backed `rota_plans` and `shift_assignments`). Each such table is a
  finding per Req 6.8. Confirmed for the residual set.

### F-029 — Express quotation-PDF schema validation

- **Category:** `injection` · **Mechanism:** M-INJ-3 · **Severity:** Low
- **Affected:** `server/routes/quotation-pdf.js`
- **Verification:** `partially-mitigated` · **Prior-audit:** partially-applies (AUDIT bug #25)
- **Procedure (Req 8.3, controlled, read-only):** Read `server/routes/quotation-pdf.js` and
  check for schema validation of `documentDetails`, `clientDetails`, `laborInputs`, `roles`,
  `contractTerms` before rendering.
- **Repro detail (Req 8.3 outcome):** Per the attack-surface registry, the Express route applies
  `requireString`/number helper validation on individual fields (an improvement over the prior
  audit's "no validation" finding) but does **not** validate the five structured inputs against
  a complete schema before rendering. Partial: field-level helpers present, full-schema
  validation absent. Severity Low (gated behind F-015's undetermined Express deployment).
  **Note:** this finding is `unverified`-adjacent because the Express deployment is undetermined;
  it is recorded as `partially-mitigated` on the basis of static code review of the validation
  helpers, with the deployment caveat carried from F-015/F-023.

---

## Appendix A — RLS permissive / anon-CRUD tables (Req 6.1)

Tables that the prior audit and the `scripts/` history show under permissive
`USING (true) WITH CHECK (true)` or full anon-CRUD policies, **prior to** the
`consolidated_rls_hardening.sql` migration. Each is a finding per Req 6.1; the consolidated
migration (task 15.1) replaces these, and integration tests (task 15.2) verify the result.

- **Anon full-CRUD (Critical sub-set):** `users`, `roles`, `branches`
  (via `fix_users_rls_anon.sql`, `fix_roles_rls_anon.sql`, `fix_branches_rls_anon.sql`,
  `fix_branches_rls_recursion.sql`).
- **`USING (true)` authenticated/all:** `rota_assignments`, `shift_attendance`, `patrol_logs`,
  `petrol_logs`, `bank_accounts`, `bank_transactions`, `cash_register`, `cheque_register`,
  `fixed_assets`, `liabilities`, `liability_payments`, `depreciation_log`, `payables`,
  `receivables`, `receivable_payments`, `compliance_filings`, `collection_tasks`,
  `inventory_items`, `inventory_transactions`, `inventory_distributions`,
  `inventory_purchase_orders`, `inventory_po_items`, `vendors`, `purchase_orders`,
  `purchase_order_items`, `recurring_bills`, `bill_payments`, `company_documents`,
  `document_acknowledgments`, `mess_weeks`, `mess_week_posts`, `mess_fund_requests`,
  `mess_meal_records`, `deleted_invoice_numbers`, `invoice_delete_requests`,
  `operational_posts`, `post_salary_rates`, `penalties`, `lead_conversations`, `quotations`.

> The **live** state on a given database depends on whether `consolidated_rls_hardening.sql`
> was applied last (see F-005). This appendix records the pre-hardening permissive set that the
> migration must supersede.

## Appendix B — Dependency advisories (Req 14.1)

`npm audit` summary: **44 advisories — 3 critical, 8 high, 33 moderate** (direct + transitive).
Per-advisory detail (identifier · package · affected installed range · fixed version · severity):

| Advisory | Package | Affected range | Fixed version | Severity |
|----------|---------|----------------|---------------|:--------:|
| GHSA-xq3m-2v4x-88gg | protobufjs (transitive) | <7.5.5 | 7.5.5+ | Critical |
| GHSA-m7jm-9gc2-mpf2 | fast-xml-parser (transitive) | >=5.0.0 <5.3.5 | via `@aws-sdk/s3-request-presigner` 3.1063.0 | Critical |
| GHSA-9crc-q9x8-hgqq | vitest (direct, dev) | >=2.0.0 <2.1.9 | 4.1.8 | Critical |
| GHSA-5xrq-8626-4rwp | vitest (direct, dev) | <4.1.0 | 4.1.8 | Critical |
| GHSA-37qj-frw5-hhjh | fast-xml-parser | >=5.0.9 <=5.3.3 | (s3-presigner upgrade) | High |
| GHSA-jmr7-xgp7-cmfj | fast-xml-parser | >=5.0.0 <5.3.6 | (s3-presigner upgrade) | High |
| GHSA-8gc5-j5rx-235r | fast-xml-parser | >=5.0.0 <5.5.6 | (s3-presigner upgrade) | High |
| GHSA-25h7-pfq9-p65f | flatted (transitive) | <3.4.0 | available | High |
| GHSA-rf6f-7fwh-wjgh | flatted (transitive) | <=3.4.1 | available | High |
| GHSA-r5fr-rjxr-66jc | lodash / lodash-es | >=4.0.0 <=4.17.23 | available | High |
| GHSA-3ppc-4f35-3m26 / GHSA-7r86-cg39-jmmj / GHSA-23c5-xmqv-rm74 | minimatch | <3.1.4 / 9.0.0–9.0.6 | available | High |
| GHSA-c2c7-rcm5-vvqj | picomatch (transitive) | <2.3.2 | available | High |
| GHSA-mw96-cpmx-2vgc | rollup (transitive) | >=4.0.0 <4.59.0 | available | High |
| GHSA-4r6h-8v6p-xvw6 / GHSA-5pgg-2g8v-p4x9 | xlsx (direct) | <0.19.3 / <0.20.2 | **no fix available** | High |
| (moderate set, 33) | next/postcss, follow-redirects, ws, uuid, vite/vite-node, protocol-buffers-schema, protobufjs (moderate sub-advisories), fast-xml-parser (moderate sub-advisories), lodash (moderate sub-advisories) | various | various | Moderate |

> **Req 14.2 ordering note (for the remediation plan):** the Critical/High advisories above
> (protobufjs, vitest, fast-xml-parser, flatted, lodash(-es), minimatch, picomatch, rollup,
> xlsx) are remediated ahead of the moderate set. `xlsx` has **no upstream fix** and requires a
> mitigation/replacement decision (tracked in `remediation-plan.md`).

## Appendix C — Public PII-returning endpoints (Req 12.1)

| Endpoint | PII returned | Finding |
|----------|--------------|---------|
| `GET /api/verify-employee` (AS-013) | `name`, `employee_id`, `department`, `designation`, `join_date`, `status`, `photo_url`, `gender`, **+ `id`, `branch_id` (over-broad)** | F-022 |
| `EmployeeVerificationPage.tsx` (AS-022) | Renders the AS-013 response (same PII) | F-022 (UI half) |
| `server/index.js` `/health` (AS-015) | Potential environment/info disclosure (deployment undetermined) | F-023 (unverified) |

No other public endpoint returns employee/customer PII: the public write routes
(`/api/lead`, `/api/enquiry`) accept input but return only `{ success, id }`; the lookup
proxies return third-party GST/pincode data, not application PII.

## Appendix D — Code-referenced tables with no SQL definition (Req 6.8)

Residual tables referenced in code (`.from('<table>')`) with **no** `CREATE TABLE` in
`scripts/*.sql`, after accounting for definitions added since the prior audit. Each has an
**unknown RLS status** and is a finding per Req 6.8:

- `rota_plans` — `src/services/firebase/RotaPlannerService.ts` (Firebase-backed; no Postgres table).
- `shift_assignments` — `src/services/firebase/RotaPlannerService.ts` (distinct from `shift_attendance`).
- `calendar_events` — `src/services/firebase/CalendarEventFirebaseService.ts` (Firebase-backed).
- Legacy/ambiguous names used interchangeably with defined tables (`user_notifications` vs.
  `notifications`) where the live PostgREST target is ambiguous.

> Tables flagged by the prior audit that now **have** SQL definitions
> (`employees`, `attendance_records`, `held_salaries`, `user_sessions`, `notifications`,
> `leads`, `followups`, `agreements`, `work_orders`, `hr_employees`) are excluded here — their
> prior-audit status is `no-longer-applies` for the "no SQL definition" finding, though their
> RLS posture is assessed under F-005 / Appendix A.

---

## Coverage summary

- **Findings:** F-001 – F-029 (29), each with a unique id and exactly one verification result (Req 3.1).
- **Verification spread:** confirmed 12, partially-mitigated 8, not-exploitable 7, unverified 2.
- **Severities (confirmed + partially-mitigated):** Critical 1 (F-026), High 4 (F-001, F-002,
  F-003, F-005), Medium 11, Low 4 — 20 remediation-relevant findings. Every confirmed/partial
  finding carries a severity (Req 3.6); the two `unverified` findings (F-015, F-023) carry no
  severity and record an `unverifiedReason` (Req 3.5).
- **Prior-audit re-verification (Req 3.3):** `no-longer-applies` — F-011, F-017, F-018, F-019
  (hardcoded secrets, unauth upload, unguarded create-user, mock admin: all remediated);
  `still-applies` — F-001, F-002, F-003, F-006, F-022, F-027; `partially-applies` — F-004,
  F-005, F-008, F-028, F-029.
- **Assessment-only outcomes recorded:** hardcoded-secret scan (F-011, Req 4.1), client-bundle
  scan (F-013, Req 4.6), RLS permissive/anon-CRUD tables (F-005 + Appendix A, Req 6.1),
  code-referenced tables w/o SQL (F-028 + Appendix D, Req 6.8), service-role routes & guards
  (F-006/F-011/F-017/F-018/F-022, Req 7.1), Express PDF schema validation (F-029, Req 8.3),
  React escaping (F-010, Req 8.6), header/CORS presence (F-020/F-021, Req 11.5),
  PII-returning endpoints (F-022 + Appendix C, Req 12.1), rate-limiter limitation (F-024,
  Req 13.4), audit-log placeholders (F-027, Req 15.3).

> **Severity note (F-005):** the High-severity confirmed/partial findings are F-001, F-002,
> F-003, and F-005 (4 total).

> **Maintenance (Req 1.6 / 3.x):** when a surface, mechanism, or control changes, re-run the
> affected Verification_Procedure and update the corresponding finding's result, severity, and
> prior-audit status before the change is deployed. Confirmed findings flow into
> `remediation-plan.md` (Req 16.1), which carries exactly one remediation task per confirmed
> finding.
