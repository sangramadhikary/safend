# Remediation Plan

> Assessment artifact for the **security-hardening** spec — the single prioritized
> Remediation_Plan (Req 16.6). It satisfies Requirements **16.1** (exactly one
> remediation task per confirmed Finding and no task that does not correspond to a
> confirmed Finding), **16.2** (strict descending-severity order), **16.3** (each task
> carries a re-run-procedure → `not-exploitable` acceptance criterion), **16.4** (recorded
> dependencies by prerequisite task id), **16.5** (unique task id mapped back to its
> Finding id), **16.6** (exactly one plan covering all confirmed Findings), and **16.7**
> (deterministic ordering for equal-severity tasks).

## Purpose and scope

This plan converts the **confirmed** Findings of `findings.md` into a single, prioritized
set of remediation tasks. Per Req 16.1 it lists **exactly one** task for **each** Finding
whose `verification` result is `confirmed`, and contains **no** task for any other Finding.
Findings recorded as `partially-mitigated`, `not-exploitable`, or `unverified` are therefore
**out of scope** for this plan:

- `not-exploitable` (F-008, F-010, F-011, F-014, F-017, F-018, F-019) — no present weakness to
  remediate; severity is retained in `findings.md` only for regression traceability.
- `unverified` (F-015, F-023) — exploitability is undetermined (Express deployment topology);
  these carry an `unverifiedReason` and re-enter scope only once re-verified as `confirmed`.
- `partially-mitigated` (F-004, F-005, F-007, F-009, F-016, F-021, F-025, F-029) — a control is
  present with a residual gap; these are tracked against their target-state requirement clauses
  and their backing code tasks (e.g. the extracted `src/lib/security/` controls and the
  consolidated RLS migration) but are **not** counted as `confirmed` Findings, so Req 16.1
  excludes them from this plan.

The **12 confirmed Findings** therefore map to **12 remediation tasks** (`RT-001` … `RT-012`).

## Ordering method

The task order below is produced by the remediation ordering function
`orderRemediationTasks` in `src/lib/security/remediation-order.ts` (task 18.1), applied to the
`RemediationTask[]` set in [Appendix A](#appendix-a--ordering-function-input). That function is
a priority topological sort over the dependency DAG:

- **dependency edges are hard constraints** — every prerequisite task is placed before its
  dependents (Req 16.4);
- **severity is the selection priority** among ready tasks — strict descending
  `Critical > High > Medium > Low` (Req 16.2); and
- **task id is the deterministic tie-break** for equal-severity, equally-ready tasks (Req 16.7).

Each task `severity` is inherited from its Finding's severity in `findings.md` (Req 16.2), and
each `acceptanceCriterion` is the re-execution of that Finding's recorded `Verification_Procedure`
yielding a `not-exploitable` result (Req 16.3). The acceptance procedures run only against a
non-production / controlled environment with benign payloads, exactly as recorded in `findings.md`.

## Prioritized remediation tasks (ordered)

| Order | Task ID | Finding | Severity | Remediation task | Depends on |
|:-----:|---------|:-------:|:--------:|------------------|------------|
| 1 | **RT-001** | F-026 | Critical | Upgrade/replace vulnerable dependencies and gate with CI audit | — |
| 2 | **RT-002** | F-001 | High | Server-enforceable session strategy with edge/server verification | — |
| 3 | **RT-003** | F-002 | High | Move auth tokens out of `localStorage` to cookie-based storage | RT-002 |
| 4 | **RT-004** | F-003 | High | Deny unauthenticated requests to protected routes server-side | RT-002 |
| 5 | **RT-005** | F-006 | Medium | Constrain the public employee-verification read and enumeration | — |
| 6 | **RT-006** | F-012 | Medium | Fail-fast secret bootstrap; remove silent fallbacks | — |
| 7 | **RT-007** | F-020 | Medium | Add a non-wildcard Content-Security-Policy header | — |
| 8 | **RT-008** | F-022 | Medium | Project verification response to the field allowlist | — |
| 9 | **RT-009** | F-024 | Medium | Shared/edge-enforced rate limiter for multi-instance deployments | — |
| 10 | **RT-010** | F-027 | Medium | Record real client IP and actor in audit entries (no placeholders) | RT-002 |
| 11 | **RT-011** | F-028 | Medium | Define RLS for code-referenced tables with no SQL definition | — |
| 12 | **RT-012** | F-013 | Low | Confirm no server-only secret leaks into the client bundle | — |

> The order is severity-descending (Critical → High → Medium → Low) with every prerequisite
> ahead of its dependents (`RT-002` precedes `RT-003`, `RT-004`, and `RT-010`) and a deterministic
> id tie-break within each equal-severity band.

---

## Per-task detail

### RT-001 — Remediate vulnerable dependencies (F-026)

- **Resolves:** F-026 · **Severity:** Critical · **Category:** `dependency-supply-chain`
- **Depends on:** none
- **Target state (Req 14.2, 14.3, 14.4):** Upgrade every Critical/High advisory from
  [`findings.md` Appendix B](findings.md) ahead of the moderate set (protobufjs, vitest,
  fast-xml-parser via the `@aws-sdk/s3-request-presigner` upgrade, flatted, lodash(-es),
  minimatch, picomatch, rollup); for `xlsx` (no upstream fix) record a mitigation/replacement
  decision. Pin every direct dependency to a single exact version (no `^`, `~`, `*`, or
  comparator range) and add the CI dependency-audit gate that fails the build on any new
  High/Critical advisory absent from the base-branch baseline.
- **Acceptance criterion (Req 16.3):** Re-run the F-026 procedure (`npm audit --json` against the
  manifest and lockfile, direct + transitive) and obtain a `not-exploitable` result — no Critical
  or High advisory remains outside the recorded `xlsx` mitigation exception, and the CI gate
  reports no new High/Critical advisory versus the baseline.

### RT-002 — Server-enforceable session strategy (F-001)

- **Resolves:** F-001 · **Severity:** High · **Category:** `auth-session-weakness`
- **Depends on:** none
- **Target state (Req 5.1, 5.2, 5.4):** Adopt a cookie-based `@supabase/ssr` session so the Edge
  middleware / server can verify the caller's Supabase session server-side before serving
  protected content or performing an operation, rather than relying solely on client-side guards.
- **Acceptance criterion (Req 16.3):** Re-run the F-001 procedure (inspect `middleware.ts` and
  issue a request to a protected route without a valid session) and obtain a `not-exploitable`
  result — the edge/server verifies the session and the request is denied without a client-side
  round-trip.

### RT-003 — Remove auth tokens from `localStorage` (F-002)

- **Resolves:** F-002 · **Severity:** High · **Category:** `auth-session-weakness`
- **Depends on:** **RT-002** (the cookie-based session strategy must be in place before token
  storage is moved off `localStorage`).
- **Target state (Req 5.1):** Configure the Supabase client to store the session in secure cookies
  (via the strategy from RT-002), so access/refresh tokens are not readable by page scripts.
- **Acceptance criterion (Req 16.3):** Re-run the F-002 procedure (inspect the Supabase client
  config and attempt to read tokens from `localStorage`) and obtain a `not-exploitable` result —
  no access/refresh token is present in `localStorage`.

### RT-004 — Server-side denial for protected routes (F-003)

- **Resolves:** F-003 · **Severity:** High · **Category:** `broken-access-control-idor`
- **Depends on:** **RT-002** (server-side denial requires the edge/server session verification).
- **Target state (Req 5.2, 5.3):** Protected page and API routes deny unauthenticated callers at
  the server/edge (HTTP 401 / redirect) instead of returning the protected document for
  client-side gating after hydration.
- **Acceptance criterion (Req 16.3):** Re-run the F-003 procedure (request a protected route with
  no session against a local dev server) and obtain a `not-exploitable` result — the server denies
  the request rather than returning the protected page.

### RT-005 — Constrain public employee-verification read (F-006)

- **Resolves:** F-006 · **Severity:** Medium · **Category:** `broken-access-control-idor`
- **Depends on:** none
- **Target state (Req 12.3, 12.4, 13.x):** Keep the verification surface usable but bound it —
  enforce the ≥2-char sanitized term, the 50-char cap, and the 20-row limit, and apply the
  rate-limit / abuse controls so the directory cannot be enumerated by iterating search terms.
- **Acceptance criterion (Req 16.3):** Re-run the F-006 procedure (`GET /api/verify-employee`
  with varied terms and no session against seeded throwaway data) and obtain a `not-exploitable`
  result — bulk enumeration of the directory is prevented.

### RT-006 — Fail-fast secret bootstrap (F-012)

- **Resolves:** F-012 · **Severity:** Medium · **Category:** `crypto-failure-secret-exposure`
- **Depends on:** none
- **Target state (Req 4.2, 4.3):** Replace the silent fallbacks
  (`process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'`, `... || ''`,
  `R2_BUCKET_NAME ?? '...'`, `R2_PUBLIC_URL ?? ''`) in `src/integrations/supabase/client.ts` and
  `app/api/upload/route.ts` with the `src/lib/security/env-bootstrap.ts` validator invoked at
  server module load, so a missing/empty required secret fails fast and names the variable.
- **Acceptance criterion (Req 16.3):** Re-run the F-012 procedure (read the credential reads and
  start the process with a required var absent) and obtain a `not-exploitable` result — the
  process refuses to start in a misconfigured state instead of serving with placeholder values.

### RT-007 — Add a Content-Security-Policy header (F-020)

- **Resolves:** F-020 · **Severity:** Medium · **Category:** `security-misconfiguration`
- **Depends on:** none
- **Target state (Req 11.1, 11.2):** Add a `Content-Security-Policy` header in `middleware.ts`
  alongside the existing headers, with `script-src` / `style-src` / `connect-src` pinned to the
  configured origin and no wildcard.
- **Acceptance criterion (Req 16.3):** Re-run the F-020 procedure (request any route and inspect
  response headers) and obtain a `not-exploitable` result — a conformant, non-wildcard CSP header
  is present.

### RT-008 — Project verification response to the field allowlist (F-022)

- **Resolves:** F-022 · **Severity:** Medium · **Category:** `pii-exposure`
- **Depends on:** none
- **Target state (Req 12.2):** Apply `projectVerificationFields` (`src/lib/security/pii.ts`) so the
  public verification response exposes only the allowlist (`employee_id, name, department,
  designation, join_date, status, photo_url, gender`) and drops the internal `id` and `branch_id`.
- **Acceptance criterion (Req 16.3):** Re-run the F-022 procedure (`GET /api/verify-employee` and
  inspect the returned field set) and obtain a `not-exploitable` result — no field outside the
  allowlist is returned.

### RT-009 — Shared/edge-enforced rate limiter (F-024)

- **Resolves:** F-024 · **Severity:** Medium · **Category:** `rate-limiting-abuse`
- **Depends on:** none
- **Target state (Req 13.5):** Replace the per-process in-memory limiter with a shared or
  edge-enforced limiter (e.g. a shared store / platform edge config) so the cap holds across
  multiple instances and survives process restarts, while preserving the windowing semantics.
- **Acceptance criterion (Req 16.3):** Re-run the F-024 procedure (review the limiter and exercise
  it across instances) and obtain a `not-exploitable` result — the effective cap is enforced
  globally rather than multiplied per instance.

### RT-010 — Real client IP and actor in audit entries (F-027)

- **Resolves:** F-027 · **Severity:** Medium · **Category:** `audit-logging-gap`
- **Depends on:** **RT-002** (accurate actor attribution depends on the server-verified session
  identity established by the session strategy).
- **Target state (Req 12.5, 15.1, 15.2, 15.4):** Use `src/lib/security/audit-entry.ts` so each
  entry records the actual resolved client IP and the real actor (no `'client-side …'` sentinel,
  no `Admin`/`admin@safend.com` default), logs auth-denied / login-failure events, and writes to a
  fallback channel on primary-write failure instead of discarding.
- **Acceptance criterion (Req 16.3):** Re-run the F-027 procedure (read `auditLog.ts` and inspect
  emitted entries) and obtain a `not-exploitable` result — entries contain the real IP and actor
  with no placeholder substitution.

### RT-011 — Define RLS for undefined code-referenced tables (F-028)

- **Resolves:** F-028 · **Severity:** Medium · **Category:** `broken-access-control-idor`
- **Depends on:** none
- **Target state (Req 6.8, 6.2–6.7):** For each residual code-referenced table with no SQL
  definition ([`findings.md` Appendix D](findings.md): `rota_plans`, `shift_assignments`,
  `calendar_events`, and the ambiguous `user_notifications`/`notifications` pair), either add a
  branch-scoped, role-aware RLS-governed definition or document the Firebase-backed access-control
  posture, eliminating the unknown-RLS status.
- **Acceptance criterion (Req 16.3):** Re-run the F-028 procedure (cross-reference `.from('<table>')`
  usages against `CREATE TABLE` definitions / documented access controls) and obtain a
  `not-exploitable` result — no code-referenced table has an unknown RLS status.

### RT-012 — Confirm no server-only secret in the client bundle (F-013)

- **Resolves:** F-013 · **Severity:** Low · **Category:** `crypto-failure-secret-exposure`
- **Depends on:** none
- **Target state (Req 4.5, 4.6):** Keep only the intended `NEXT_PUBLIC_*` anon key/URL in the
  client bundle (whose safety rests on the restrictive RLS posture tracked under F-005) and ensure
  no server-only secret (service-role JWT, R2 keys, Firebase private key) is bundled; add the
  build-time client-bundle secret scan as the standing check.
- **Acceptance criterion (Req 16.3):** Re-run the F-013 procedure (build the app and scan the
  produced client bundle for secret literals) and obtain a `not-exploitable` result — only the
  intended `NEXT_PUBLIC_*` values appear and no server-only secret is present.

---

## Coverage summary

- **Confirmed Findings covered:** 12 — F-001, F-002, F-003, F-006, F-012, F-013, F-020, F-022,
  F-024, F-026, F-027, F-028 (Req 16.1, 16.6).
- **Remediation tasks:** 12 — `RT-001` … `RT-012`, each with a unique id mapped to exactly one
  Finding id (Req 16.5), and no task for any non-confirmed Finding (Req 16.1).
- **Severity distribution (descending):** Critical 1 (RT-001), High 3 (RT-002, RT-003, RT-004),
  Medium 7 (RT-005 – RT-011), Low 1 (RT-012) — total 12, matching the confirmed-finding tally in
  `findings.md`.
- **Recorded dependencies (Req 16.4):** `RT-003 → RT-002`, `RT-004 → RT-002`, `RT-010 → RT-002`.
- **Ordering (Req 16.2, 16.7):** produced by `orderRemediationTasks`; severity-descending,
  dependency-respecting, deterministic.

## Appendix A — Ordering function input

The exact `RemediationTask[]` passed to `orderRemediationTasks`
(`src/lib/security/remediation-order.ts`). Running the function on this input yields the order in
the table above (`RT-001, RT-002, RT-003, RT-004, RT-005, RT-006, RT-007, RT-008, RT-009, RT-010,
RT-011, RT-012`).

```json
[
  { "id": "RT-001", "findingId": "F-026", "severity": "Critical", "dependsOn": [] },
  { "id": "RT-002", "findingId": "F-001", "severity": "High", "dependsOn": [] },
  { "id": "RT-003", "findingId": "F-002", "severity": "High", "dependsOn": ["RT-002"] },
  { "id": "RT-004", "findingId": "F-003", "severity": "High", "dependsOn": ["RT-002"] },
  { "id": "RT-005", "findingId": "F-006", "severity": "Medium", "dependsOn": [] },
  { "id": "RT-006", "findingId": "F-012", "severity": "Medium", "dependsOn": [] },
  { "id": "RT-007", "findingId": "F-020", "severity": "Medium", "dependsOn": [] },
  { "id": "RT-008", "findingId": "F-022", "severity": "Medium", "dependsOn": [] },
  { "id": "RT-009", "findingId": "F-024", "severity": "Medium", "dependsOn": [] },
  { "id": "RT-010", "findingId": "F-027", "severity": "Medium", "dependsOn": ["RT-002"] },
  { "id": "RT-011", "findingId": "F-028", "severity": "Medium", "dependsOn": [] },
  { "id": "RT-012", "findingId": "F-013", "severity": "Low", "dependsOn": [] }
]
```

> The `acceptanceCriterion` field of each task is the per-task acceptance criterion recorded in
> the [Per-task detail](#per-task-detail) section above (re-run the Finding's `Verification_Procedure`
> → `not-exploitable`); it is omitted from this appendix for brevity.
