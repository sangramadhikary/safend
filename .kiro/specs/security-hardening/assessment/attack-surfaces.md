# Attack-Surface Registry

> Assessment artifact for the **security-hardening** spec.
> Satisfies Requirements **1.1** (enumerate every attack surface with source location),
> **1.3** (exactly one exposure classification per surface), and **1.7** (undeterminable
> surfaces default to `publicly-exposed` and are flagged for manual review).

## Purpose and method

This registry enumerates **every externally reachable entry point** of the Safend
application — each Next.js API route under `app/api/**`, the standalone Express PDF/DigiPIN
server under `server/`, the public marketing pages, the public employee-verification flow,
the client and employee portals, the ERP route group, and the Supabase database interface.

Each surface records:

- **ID** — stable identifier (`AS-NNN`) referenced by `threat-model.md`, `mechanisms.md`, and `findings.md`.
- **Source location** — route path, file path, or interface identifier (Req 1.1).
- **HTTP method(s)** — where applicable.
- **Exposure** — exactly one of `publicly-exposed` | `authenticated-only` (Req 1.3).
- **Manual-review flag** — `true` when the authentication requirement could not be
  conclusively determined from code; such surfaces default to `publicly-exposed` (Req 1.7).

### Exposure-class definitions (from design.md / requirements.md)

- **`publicly-exposed`** — reachable and actionable **without** a valid authenticated
  session. The handler performs its work for an anonymous caller (Req 1.3, first clause).
- **`authenticated-only`** — the handler verifies a session/role **server-side** and refuses
  to act without it (Req 1.3, second clause).

### Classification rule for client-side-only gating (Req 1.7)

The ERP modules and the client/employee portal **pages** are gated **only by client-side
React guards** (`ProtectedRoute`, `ClientProtectedRoute`, `EmployeeProtectedRoute`); the Edge
middleware (`middleware.ts`) deliberately does **not** enforce authentication because Supabase
sessions live in `localStorage`, not cookies. The server therefore returns the page document to
**any** caller and authentication is enforced after hydration in the browser. Because the
server-side authentication requirement of these pages **cannot be determined to be enforced**,
they are recorded here as `publicly-exposed` and **flagged for manual review** per Requirement 1.7.
Their *intended* exposure (authenticated-only) is noted alongside so the gap is traceable.

---

## Registry

| ID | Source location | Method(s) | Exposure | Manual review | Notes |
|----|-----------------|-----------|----------|:---:|-------|
| **Next.js API routes (`app/api/**`)** |
| AS-001 | `app/api/admin/create-user/route.ts` | POST | authenticated-only | no | Server-side admin-role guard via session cookie + `user_roles` lookup. |
| AS-002 | `app/api/client-portal/create-client/route.ts` | POST | authenticated-only | no | Server-side guard: Bearer token + `admin`/`branch_admin` role. |
| AS-003 | `app/api/employee-portal/create-employee/route.ts` | GET, POST | authenticated-only | no | Server-side guard: Bearer token + `admin`/`branch_admin`/`hr` role (`verifyAdminCaller`). |
| AS-004 | `app/api/enquiry/route.ts` | POST | publicly-exposed | no | Public marketing write; service-role insert; in-memory rate limit (5/60s). |
| AS-005 | `app/api/gst-lookup/route.ts` | GET | publicly-exposed | no | Public outbound proxy to `gst.jamku.app`; GSTIN format validation; rate limit (20/60s). |
| AS-006 | `app/api/lead/route.ts` | POST | publicly-exposed | no | Public marketing write; service-role insert; rate limit (5/60s). |
| AS-007 | `app/api/pincode-lookup/route.ts` | GET | publicly-exposed | no | Public outbound proxy to `api.postalpincode.in`; 6-digit validation; rate limit (20/60s). |
| AS-008 | `app/api/quotation-pdf/route.ts` | POST | publicly-exposed | no | Public CPU/memory-heavy PDF render; no auth guard; rate limit (10/60s); 413 over 500 posts. |
| AS-009 | `app/api/upload/route.ts` | POST | authenticated-only | no | POST requires resolvable Supabase user (Bearer or cookie). |
| AS-010 | `app/api/upload/route.ts` | DELETE | authenticated-only | no | Destructive; requires auth **and** ERP staff role (`callerHasStaffRole`). |
| AS-011 | `app/api/upload/route.ts` | GET | authenticated-only | no | Metadata/HEAD probe; requires auth **and** ERP staff role. |
| AS-012 | `app/api/upload/route.ts` | OPTIONS | publicly-exposed | no | CORS preflight; restricts ACAO to configured site origin (no wildcard). |
| AS-013 | `app/api/verify-employee/route.ts` | GET | publicly-exposed | no | Public employee-verification backend; service-role read; search-term sanitizer; returns PII. |
| **Express PDF / DigiPIN server (`server/`, port 3001)** |
| AS-014 | `server/index.js` → `GET /api/digipin/decode` | GET | publicly-exposed | yes | No auth; outbound to `api.indiapost.gov.in`; `cors()` permits all origins. Standalone process — deployment status undetermined from code. |
| AS-015 | `server/index.js` → `GET /health` | GET | publicly-exposed | yes | Unauthenticated health/info endpoint; `cors()` permits all origins. |
| AS-016 | `server/routes/quotation-pdf.js` → `POST /api/quotation/download` | POST | publicly-exposed | yes | No auth; schema validation via `requireString`/number helpers; `express.json({limit:'10mb'})`. |
| AS-017 | `server/routes/quotation-pdf.js` → `POST /api/quotation/preview` | POST | publicly-exposed | yes | No auth; returns calculated breakdown JSON. |
| **Marketing pages (`app/(marketing)`)** |
| AS-018 | `app/(marketing)/page.tsx` | GET (page) | publicly-exposed | no | Public landing page. |
| AS-019 | `app/(marketing)/about/page.tsx` | GET (page) | publicly-exposed | no | Public marketing page. |
| AS-020 | `app/(marketing)/services/page.tsx` | GET (page) | publicly-exposed | no | Public marketing page. |
| AS-021 | `app/(marketing)/contact/page.tsx` | GET (page) | publicly-exposed | no | Public marketing page; submits to AS-004/AS-006. |
| **Public employee-verification flow (UI)** |
| AS-022 | `src/components/EmployeeVerificationPage.tsx` (mounted from `src/modules/Index.tsx`) | GET (page) | publicly-exposed | no | Public UI that calls AS-013; renders returned employee PII. |
| **Client portal (`app/(client-portal)`)** |
| AS-023 | `app/(client-portal)/client-login/page.tsx` | GET (page) | publicly-exposed | no | Public login page. |
| AS-024 | `app/(client-portal)/client-portal/page.tsx` | GET (page) | publicly-exposed | yes | Intended authenticated-only; gated only client-side by `ClientProtectedRoute`. Flagged per Req 1.7. |
| **Employee portal (`app/(employee-portal)`)** |
| AS-025 | `app/(employee-portal)/employee-portal/page.tsx` | GET (page) | publicly-exposed | yes | Intended authenticated-only; gated only client-side by `EmployeeProtectedRoute`. Flagged per Req 1.7. |
| **ERP route group (`app/(erp)`)** |
| AS-026 | `app/(erp)/login/page.tsx` | GET (page) | publicly-exposed | no | Public ERP login page. |
| AS-027 | `app/(erp)/dashboard/page.tsx` | GET (page) | publicly-exposed | yes | Intended authenticated-only; gated only client-side by `ProtectedRoute`. Flagged per Req 1.7. |
| AS-028 | `app/(erp)/accounts/page.tsx` | GET (page) | publicly-exposed | yes | Intended authenticated-only; client-side `ProtectedRoute` only. Flagged per Req 1.7. |
| AS-029 | `app/(erp)/hr/page.tsx` | GET (page) | publicly-exposed | yes | Intended authenticated-only; client-side `ProtectedRoute` only. Flagged per Req 1.7. |
| AS-030 | `app/(erp)/office-admin/page.tsx` | GET (page) | publicly-exposed | yes | Intended authenticated-only; client-side `ProtectedRoute` only. Flagged per Req 1.7. |
| AS-031 | `app/(erp)/operations/page.tsx` | GET (page) | publicly-exposed | yes | Intended authenticated-only; client-side `ProtectedRoute` only. Flagged per Req 1.7. |
| AS-032 | `app/(erp)/sales/page.tsx` | GET (page) | publicly-exposed | yes | Intended authenticated-only; client-side `ProtectedRoute` only. Flagged per Req 1.7. |
| AS-033 | `app/(erp)/profile/page.tsx` | GET (page) | publicly-exposed | yes | Intended authenticated-only; client-side `ProtectedRoute` only. Flagged per Req 1.7. |
| **Supabase database interface** |
| AS-034 | Supabase PostgREST + Auth endpoint, reached directly from the browser via the anon key (`src/integrations/supabase/client.ts`, `NEXT_PUBLIC_SUPABASE_URL`) | HTTPS (PostgREST/GoTrue) | publicly-exposed | no | The anon key ships in the client bundle; the PostgREST/Auth API is directly reachable by anyone. Row access is governed by RLS only — see `findings.md` (Req 6). |

---

## Per-surface detail

### Next.js API routes

- **AS-001 `/api/admin/create-user` (POST)** — `authenticated-only`. Builds a per-request
  Supabase client from the caller's session cookie, calls `auth.getUser()`, and requires an
  `admin` row in `user_roles`; returns 401 unauthenticated, 403 non-admin. Validates requested
  roles against an assignable allowlist. Uses the service-role key.
- **AS-002 `/api/client-portal/create-client` (POST)** — `authenticated-only`. Verifies the
  caller via Bearer access token and requires `admin`/`branch_admin`; 401/403 otherwise.
  Service-role backed.
- **AS-003 `/api/employee-portal/create-employee` (GET, POST)** — `authenticated-only`.
  `verifyAdminCaller` requires Bearer token + `admin`/`branch_admin`/`hr`. GET lists employees;
  POST creates the portal user. Service-role backed.
- **AS-004 `/api/enquiry` (POST)** — `publicly-exposed`. No auth; validates body against
  `enquirySchema`; service-role insert into `marketing_enquiries`; rate-limited 5/60s per IP.
- **AS-005 `/api/gst-lookup` (GET)** — `publicly-exposed`. No auth; validates GSTIN format;
  fixed outbound host `gst.jamku.app` with a 10s timeout; rate-limited 20/60s per IP.
- **AS-006 `/api/lead` (POST)** — `publicly-exposed`. No auth; validates body against
  `leadSchema`; service-role insert into `leads`; rate-limited 5/60s per IP.
- **AS-007 `/api/pincode-lookup` (GET)** — `publicly-exposed`. No auth; validates 6-digit
  pincode; fixed outbound host `api.postalpincode.in` with an 8s timeout; rate-limited 20/60s per IP.
- **AS-008 `/api/quotation-pdf` (POST)** — `publicly-exposed`. **No authentication guard.**
  Renders a React-PDF document; rate-limited 10/60s per IP; rejects `>500` posts with 413;
  sanitizes the `Content-Disposition` filename. CPU/memory-heavy.
- **AS-009 `/api/upload` (POST)** — `authenticated-only`. Resolves the Supabase user from the
  Bearer token or session cookie; 401 if none. Enforces folder allowlist, MIME allowlist,
  magic-byte check, size caps, prefix sanitization, and `Content-Disposition: attachment` for
  inline-unsafe types. R2 (S3 SDK) backed.
- **AS-010 `/api/upload` (DELETE)** — `authenticated-only`. Destructive object delete; requires
  auth **and** an ERP staff role; 401/403 otherwise.
- **AS-011 `/api/upload` (GET)** — `authenticated-only`. `HeadObject` metadata probe; requires
  auth **and** an ERP staff role.
- **AS-012 `/api/upload` (OPTIONS)** — `publicly-exposed`. CORS preflight; sets
  `Access-Control-Allow-Origin` to the configured site origin only (no wildcard, no reflection).
- **AS-013 `/api/verify-employee` (GET)** — `publicly-exposed`. The trusted backend for the
  public verification page; service-role read of `employees`; sanitizes the search term before
  the PostgREST `.or()` filter; min length 2, limit 20. **Returns PII** including `branch_id`
  (broader than the documented allowlist — see `findings.md`).

### Express PDF / DigiPIN server (`server/`)

This is a **separate Node/Express process** (`node server/index.js`, port 3001), distinct from
the Next.js API routes. It applies `cors()` with no origin restriction and parses up to 10 MB of
JSON. None of its routes authenticate. Because whether/where this process is deployed cannot be
determined from source, all four routes (AS-014 – AS-017) are **flagged for manual review** and
default to `publicly-exposed` per Req 1.7.

- **AS-014 `GET /api/digipin/decode`** — validates DigiPIN format, then issues an outbound
  request to `api.indiapost.gov.in`; falls back to a deterministic algorithm.
- **AS-015 `GET /health`** — unauthenticated status endpoint.
- **AS-016 `POST /api/quotation/download`** — renders a PDF (`pdf-lib`) from request data;
  validates fields via `requireString`/number helpers.
- **AS-017 `POST /api/quotation/preview`** — returns calculated breakdowns as JSON.

### Marketing pages (AS-018 – AS-021)

Static/SSR public pages under `app/(marketing)` served via the shared `layout.tsx`. The contact
page drives the public write endpoints AS-004 and AS-006.

### Public employee-verification flow (AS-022)

`EmployeeVerificationPage.tsx`, toggled from `src/modules/Index.tsx`, is reachable by anonymous
visitors and calls AS-013, rendering returned employee fields. This is the UI half of the public
verification flow that the assessment must scope (Req 1.1, Req 12).

### Client portal (AS-023 – AS-024)

`client-login` is public. `client-portal` is **intended** authenticated-only but enforced solely
by the client-side `ClientProtectedRoute`; the server returns the document to anyone, so it is
recorded `publicly-exposed` + manual-review per Req 1.7.

### Employee portal (AS-025)

`employee-portal` is **intended** authenticated-only, gated solely by the client-side
`EmployeeProtectedRoute`; recorded `publicly-exposed` + manual-review per Req 1.7.

### ERP route group (AS-026 – AS-033)

`login` is public. `dashboard`, `accounts`, `hr`, `office-admin`, `operations`, `sales`, and
`profile` are **intended** authenticated-only, gated solely by the client-side `ProtectedRoute`
under `app/(erp)/layout.tsx`. Each is recorded `publicly-exposed` + manual-review per Req 1.7.

### Supabase database interface (AS-034)

The browser talks **directly** to Supabase PostgREST and GoTrue using the public anon key
embedded in the client bundle (`src/integrations/supabase/client.ts`). This is an externally
reachable input surface whose row-level access is governed entirely by RLS policies; the
assessment must evaluate those policies (Req 6) and the anon key's exposure (Req 4).

---

## Coverage summary

- **Next.js API routes:** AS-001 – AS-013 (all 10 route files; `upload` split by method).
- **Express PDF/DigiPIN server:** AS-014 – AS-017.
- **Marketing pages:** AS-018 – AS-021.
- **Public employee-verification flow:** AS-013 (backend) + AS-022 (UI).
- **Client portal:** AS-023 – AS-024.
- **Employee portal:** AS-025.
- **ERP route group:** AS-026 – AS-033.
- **Supabase database interface:** AS-034.

**Total: 34 attack surfaces.** Every surface carries exactly one exposure class (Req 1.3).
**13 surfaces** are flagged for manual review and defaulted to `publicly-exposed` (Req 1.7):
AS-014 – AS-017 (Express process deployment undetermined) and AS-024, AS-025, AS-027 – AS-033
(client-side-only gating leaves server-side auth unenforced).

> **Maintenance (Req 1.6):** when a code change adds, removes, modifies, or changes the
> authentication requirement of any surface above, this registry must be re-reviewed and the
> affected row(s) updated before that change is deployed.
