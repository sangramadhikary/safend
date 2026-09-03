# Threat-Model Mapping

> Assessment artifact for the **security-hardening** spec.
> Satisfies Requirements **1.2** (document each in-scope threat category),
> **1.4** (map every enumerated attack surface to at least one applicable threat
> category), and **1.5** (record the assumed attacker capability for each mapped
> surface-to-category pair).

## Purpose and method

This document layers the **threat model** on top of the attack-surface registry
(`attack-surfaces.md`, surfaces `AS-001` – `AS-034`). It does three things:

1. Declares the **in-scope threat categories** (Req 1.2), using the `ThreatCategory`
   union from `src/lib/security/types.ts` as the canonical vocabulary.
2. Maps **each** enumerated surface to **every** applicable category, recording at
   least one category per surface (Req 1.4).
3. Records, for **each surface-to-category pair**, the single assumed
   **attacker capability** (Req 1.5), drawn from the `AttackerCapability` union.

This is a scoping artifact only: it states *which* attacks are considered against
*which* surfaces and *who* is assumed to mount them. The *how* (exploitation
mechanism) is documented in `mechanisms.md` (Req 2), and the *whether-exploitable*
verdict is recorded in `findings.md` (Req 3). No remediation is described here.

### Vocabulary (from `src/lib/security/types.ts`)

**`ThreatCategory`** (Req 1.2 in-scope set):

| Key | Threat category (requirements wording) |
|-----|----------------------------------------|
| `broken-access-control-idor` | Broken access control and IDOR |
| `injection` | Injection (SQL / PostgREST filter, XSS, command) |
| `crypto-failure-secret-exposure` | Cryptographic failures and secret exposure |
| `ssrf` | Server-Side Request Forgery |
| `insecure-file-upload` | Insecure file upload |
| `auth-session-weakness` | Authentication and session weaknesses |
| `security-misconfiguration` | Security misconfiguration (headers and CORS) |
| `pii-exposure` | Sensitive data and PII exposure |
| `rate-limiting-abuse` | Rate limiting and abuse |
| `dependency-supply-chain` | Dependency and supply-chain risk |
| `audit-logging-gap` | Audit logging and monitoring gaps |

All **eleven** categories from Requirement 1.2 are in-scope for this assessment.
Two categories — `dependency-supply-chain` and `audit-logging-gap` — are
**application-wide** concerns rather than properties of a single entry point; their
surface mapping and the categories with no applicable per-surface entry point are
addressed in the [Application-wide categories](#application-wide-categories) section.

**`AttackerCapability`** (Req 1.5 — exactly one per pair):

| Key | Assumed attacker |
|-----|------------------|
| `unauthenticated-external` | An anonymous caller on the public internet with no session. |
| `authenticated-low-privilege` | A caller holding a valid session but lacking the privilege required for the targeted operation (e.g. a portal user hitting a staff/admin action). |
| `cross-tenant-authenticated` | A caller holding a valid session for one branch/tenant attempting to reach another branch's/tenant's data. |

### Capability-selection rule

For each surface-to-category pair the assessment records the **minimum capability
sufficient** to attempt the attack against that surface:

- If the surface is reachable and actionable without a session
  (`publicly-exposed`), the pair is assigned `unauthenticated-external`.
- For a server-enforced `authenticated-only` surface, a privilege-bypass / role
  abuse on that surface assumes `authenticated-low-privilege`.
- Where the attack specifically targets *another* tenant's/branch's data through a
  legitimately held session (IDOR / RLS gaps / destructive ops on arbitrary keys),
  the pair is assigned `cross-tenant-authenticated`.
- For the surfaces **flagged for manual review** in `attack-surfaces.md` (client-side
  -only gated pages AS-024, AS-025, AS-027 – AS-033; and the Express process
  AS-014 – AS-017 whose deployment is undetermined), the defaulted
  `publicly-exposed` classification drives an `unauthenticated-external` capability,
  consistent with Req 1.7's conservative default.

---

## Surface-to-category mapping

Each row lists a surface, its exposure (from `attack-surfaces.md`), the applicable
threat categories, and — for each category — the assumed attacker capability.
Every surface maps to **at least one** category (Req 1.4); every pair carries
**exactly one** capability (Req 1.5).

Capability legend: **U** = `unauthenticated-external`, **L** =
`authenticated-low-privilege`, **X** = `cross-tenant-authenticated`.

### Next.js API routes (`app/api/**`)

| Surface | Exposure | Threat category | Capability |
|---------|----------|-----------------|:---:|
| **AS-001** `/api/admin/create-user` (POST) | authenticated-only | `broken-access-control-idor` (privilege escalation via role assignment) | L |
| | | `injection` (request body fields) | L |
| | | `auth-session-weakness` (server session verification) | U |
| | | `security-misconfiguration` (CORS on the route) | U |
| | | `audit-logging-gap` (privileged user-creation event) | L |
| **AS-002** `/api/client-portal/create-client` (POST) | authenticated-only | `broken-access-control-idor` (cross-branch client creation) | X |
| | | `injection` (request body fields) | L |
| | | `auth-session-weakness` (Bearer-token verification) | U |
| | | `audit-logging-gap` (privileged creation event) | L |
| **AS-003** `/api/employee-portal/create-employee` (GET, POST) | authenticated-only | `broken-access-control-idor` (cross-branch employee enumeration/creation) | X |
| | | `pii-exposure` (GET lists employee records) | L |
| | | `injection` (request body fields) | L |
| | | `auth-session-weakness` (Bearer-token verification) | U |
| | | `audit-logging-gap` (privileged creation event) | L |
| **AS-004** `/api/enquiry` (POST) | publicly-exposed | `injection` (body persisted via service-role insert) | U |
| | | `rate-limiting-abuse` (spam / flood of public write) | U |
| | | `security-misconfiguration` (CORS / headers) | U |
| | | `audit-logging-gap` (write event provenance) | U |
| **AS-005** `/api/gst-lookup` (GET) | publicly-exposed | `ssrf` (server outbound proxy) | U |
| | | `rate-limiting-abuse` (outbound amplification) | U |
| | | `injection` (GSTIN parameter into outbound request) | U |
| **AS-006** `/api/lead` (POST) | publicly-exposed | `injection` (body persisted via service-role insert) | U |
| | | `rate-limiting-abuse` (spam / flood of public write) | U |
| | | `security-misconfiguration` (CORS / headers) | U |
| | | `audit-logging-gap` (write event provenance) | U |
| **AS-007** `/api/pincode-lookup` (GET) | publicly-exposed | `ssrf` (server outbound proxy) | U |
| | | `rate-limiting-abuse` (outbound amplification) | U |
| | | `injection` (pincode parameter into outbound request) | U |
| **AS-008** `/api/quotation-pdf` (POST) | publicly-exposed | `rate-limiting-abuse` (CPU/memory exhaustion via PDF render) | U |
| | | `injection` (Content-Disposition header injection; field content) | U |
| | | `security-misconfiguration` (no auth on compute-heavy route) | U |
| **AS-009** `/api/upload` (POST) | authenticated-only | `insecure-file-upload` (type/size/content/path constraints) | L |
| | | `auth-session-weakness` (user resolution from token/cookie) | U |
| | | `injection` (object-key prefix / folder value) | L |
| **AS-010** `/api/upload` (DELETE) | authenticated-only | `broken-access-control-idor` (destructive delete on arbitrary object key) | X |
| | | `auth-session-weakness` (staff-role gate) | L |
| | | `audit-logging-gap` (file-deletion event) | L |
| **AS-011** `/api/upload` (GET) | authenticated-only | `broken-access-control-idor` (metadata probe on arbitrary key) | X |
| | | `pii-exposure` (object metadata of other tenants) | X |
| | | `auth-session-weakness` (staff-role gate) | L |
| **AS-012** `/api/upload` (OPTIONS) | publicly-exposed | `security-misconfiguration` (CORS preflight ACAO policy) | U |
| **AS-013** `/api/verify-employee` (GET) | publicly-exposed | `pii-exposure` (returns employee PII; over-broad fields) | U |
| | | `injection` (search term into PostgREST `.or()` filter) | U |
| | | `rate-limiting-abuse` (enumeration of employee records) | U |
| | | `broken-access-control-idor` (unauthenticated read of employee table) | U |

### Express PDF / DigiPIN server (`server/`, port 3001)

All four Express surfaces are **flagged for manual review** and default to
`publicly-exposed` (Req 1.7), so each pair assumes `unauthenticated-external`.

| Surface | Exposure | Threat category | Capability |
|---------|----------|-----------------|:---:|
| **AS-014** `GET /api/digipin/decode` | publicly-exposed | `ssrf` (outbound to `api.indiapost.gov.in`) | U |
| | | `security-misconfiguration` (`cors()` permits all origins) | U |
| | | `rate-limiting-abuse` (no limiter on outbound proxy) | U |
| **AS-015** `GET /health` | publicly-exposed | `security-misconfiguration` (unauthenticated info endpoint) | U |
| | | `pii-exposure` (environment/info disclosure) | U |
| **AS-016** `POST /api/quotation/download` | publicly-exposed | `rate-limiting-abuse` (unauthenticated PDF render) | U |
| | | `injection` (unauthenticated field content into document) | U |
| | | `security-misconfiguration` (`cors()` permits all origins; no auth) | U |
| **AS-017** `POST /api/quotation/preview` | publicly-exposed | `rate-limiting-abuse` (unauthenticated compute) | U |
| | | `injection` (field content into calculation) | U |
| | | `security-misconfiguration` (`cors()` permits all origins; no auth) | U |

### Marketing pages (`app/(marketing)`)

| Surface | Exposure | Threat category | Capability |
|---------|----------|-----------------|:---:|
| **AS-018** `/(marketing)/page.tsx` | publicly-exposed | `security-misconfiguration` (response headers / CSP) | U |
| **AS-019** `/(marketing)/about/page.tsx` | publicly-exposed | `security-misconfiguration` (response headers / CSP) | U |
| **AS-020** `/(marketing)/services/page.tsx` | publicly-exposed | `security-misconfiguration` (response headers / CSP) | U |
| **AS-021** `/(marketing)/contact/page.tsx` | publicly-exposed | `security-misconfiguration` (response headers / CSP) | U |
| | | `injection` (form fields relayed to AS-004 / AS-006) | U |

### Public employee-verification flow (UI)

| Surface | Exposure | Threat category | Capability |
|---------|----------|-----------------|:---:|
| **AS-022** `EmployeeVerificationPage.tsx` | publicly-exposed | `pii-exposure` (renders employee PII returned by AS-013) | U |
| | | `injection` (XSS via rendered server-supplied content) | U |
| | | `security-misconfiguration` (CSP governing rendered content) | U |

### Client portal (`app/(client-portal)`)

| Surface | Exposure | Threat category | Capability |
|---------|----------|-----------------|:---:|
| **AS-023** `/client-login/page.tsx` | publicly-exposed | `auth-session-weakness` (login surface; token storage) | U |
| | | `security-misconfiguration` (response headers / CSP) | U |
| **AS-024** `/client-portal/page.tsx` *(flagged)* | publicly-exposed | `broken-access-control-idor` (server returns page to any caller; client-side gating only) | U |
| | | `auth-session-weakness` (no server-side session enforcement) | U |
| | | `security-misconfiguration` (response headers / CSP) | U |

### Employee portal (`app/(employee-portal)`)

| Surface | Exposure | Threat category | Capability |
|---------|----------|-----------------|:---:|
| **AS-025** `/employee-portal/page.tsx` *(flagged)* | publicly-exposed | `broken-access-control-idor` (server returns page to any caller; client-side gating only) | U |
| | | `auth-session-weakness` (no server-side session enforcement) | U |
| | | `security-misconfiguration` (response headers / CSP) | U |

### ERP route group (`app/(erp)`)

| Surface | Exposure | Threat category | Capability |
|---------|----------|-----------------|:---:|
| **AS-026** `/(erp)/login/page.tsx` | publicly-exposed | `auth-session-weakness` (login surface; token storage in localStorage) | U |
| | | `security-misconfiguration` (response headers / CSP) | U |
| **AS-027** `/(erp)/dashboard/page.tsx` *(flagged)* | publicly-exposed | `broken-access-control-idor` (client-side gating only) | U |
| | | `auth-session-weakness` (no server-side session enforcement) | U |
| | | `security-misconfiguration` (response headers / CSP) | U |
| **AS-028** `/(erp)/accounts/page.tsx` *(flagged)* | publicly-exposed | `broken-access-control-idor` (client-side gating only) | U |
| | | `auth-session-weakness` (no server-side session enforcement) | U |
| | | `pii-exposure` (financial/account data behind the gate) | U |
| **AS-029** `/(erp)/hr/page.tsx` *(flagged)* | publicly-exposed | `broken-access-control-idor` (client-side gating only) | U |
| | | `auth-session-weakness` (no server-side session enforcement) | U |
| | | `pii-exposure` (employee PII behind the gate) | U |
| **AS-030** `/(erp)/office-admin/page.tsx` *(flagged)* | publicly-exposed | `broken-access-control-idor` (client-side gating only) | U |
| | | `auth-session-weakness` (no server-side session enforcement) | U |
| **AS-031** `/(erp)/operations/page.tsx` *(flagged)* | publicly-exposed | `broken-access-control-idor` (client-side gating only) | U |
| | | `auth-session-weakness` (no server-side session enforcement) | U |
| **AS-032** `/(erp)/sales/page.tsx` *(flagged)* | publicly-exposed | `broken-access-control-idor` (client-side gating only) | U |
| | | `auth-session-weakness` (no server-side session enforcement) | U |
| | | `pii-exposure` (customer/lead PII behind the gate) | U |
| **AS-033** `/(erp)/profile/page.tsx` *(flagged)* | publicly-exposed | `broken-access-control-idor` (client-side gating only) | U |
| | | `auth-session-weakness` (no server-side session enforcement) | U |

### Supabase database interface

| Surface | Exposure | Threat category | Capability |
|---------|----------|-----------------|:---:|
| **AS-034** Supabase PostgREST + GoTrue (anon key) | publicly-exposed | `broken-access-control-idor` (RLS-governed row access; `USING (true)` / anon-CRUD policies) | X |
| | | `crypto-failure-secret-exposure` (anon key ships in the client bundle) | U |
| | | `injection` (PostgREST filter syntax via direct queries) | U |
| | | `auth-session-weakness` (GoTrue auth endpoint reachable directly) | U |
| | | `pii-exposure` (over-broad row/column access through anon role) | U |

---

## Application-wide categories

Two in-scope categories from Req 1.2 are **cross-cutting** — they apply to the
application as a whole rather than to a single entry point. They are declared
in-scope here and assessed against their anchor surfaces and artifacts:

- **`dependency-supply-chain`** — applies to the build of the entire application
  (`package.json` / `package-lock.json`, covering direct and transitive
  dependencies). It is anchored to the marketing/portal/ERP delivery surfaces
  (AS-018 – AS-033) and the API runtime (AS-001 – AS-013), because a vulnerable or
  malicious package reaches an attacker through any served route. Assumed
  capability: `unauthenticated-external` (a poisoned client bundle or a vulnerable
  server dependency is exploitable without a session). Verified in `findings.md`
  via the dependency audit (Req 14.1).
- **`audit-logging-gap`** — applies to every **privileged or state-changing**
  operation: the user/client/employee-creation routes (AS-001 – AS-003), the public
  write endpoints (AS-004, AS-006), the destructive upload operation (AS-010), and
  the login surfaces (AS-023, AS-026). The gap is the absence/placeholder-quality of
  audit records (e.g. the hardcoded client-IP sentinel). Assumed capability per pair
  is recorded in the mapping tables above (predominantly `authenticated-low-privilege`
  for the privileged routes and `unauthenticated-external` for the public writes and
  login surfaces).

### Category applicability (Req 2.5 cross-reference)

All eleven in-scope categories have at least one applicable surface in this model;
**none** is recorded as not-applicable. Should a future review find an in-scope
category with no applicable surface, it must be recorded as not-applicable with a
reason in `mechanisms.md` per Req 2.5.

---

## Coverage summary

- **Surfaces mapped:** all 34 (AS-001 – AS-034); every surface carries **at least one**
  threat category (Req 1.4).
- **Categories in-scope:** all 11 `ThreatCategory` values (Req 1.2), each applied to
  one or more surfaces.
- **Capability coverage:** every surface-to-category pair carries exactly one
  `AttackerCapability` (Req 1.5):
  - `unauthenticated-external` — all `publicly-exposed` surfaces and the
    manual-review-flagged surfaces (AS-004 – AS-008, AS-012 – AS-034 where public).
  - `authenticated-low-privilege` — privilege/role abuse on the server-enforced
    `authenticated-only` routes (AS-001 – AS-003, AS-009 – AS-011).
  - `cross-tenant-authenticated` — IDOR / cross-branch targeting on AS-002, AS-003,
    AS-010, AS-011, and the RLS-governed database interface AS-034.

> **Maintenance (Req 1.6):** when `attack-surfaces.md` changes (a surface is added,
> removed, modified, or its authentication requirement changes), re-review this
> mapping and update the affected rows — including the assumed attacker capability —
> before that change is deployed.
