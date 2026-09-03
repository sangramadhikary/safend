# Module Architecture

## Overview

This project uses a **Modular Monolith** architecture. Each business domain has its own module folder with clear boundaries, but they share a single deployment, runtime, and build pipeline.

## Module Map

| Module | Route | Owner | BFF Endpoint |
|--------|-------|-------|-------------|
| `sales/` | /sales | Sales team | /api/bff/sales-pipeline |
| `operations/` | /operations | Ops team | /api/bff/operations-dashboard |
| `hr/` | /hr | HR team | /api/bff/hr-overview |
| `accounts/` | /accounts | Finance team | /api/bff/admin-overview |
| `office-admin/` | /office-admin | Admin | — |
| `admin/` | /dashboard | Admin | /api/bff/admin-overview |
| `client-portal/` | /client-portal | Client-facing | /api/bff/client-dashboard |
| `supervisor-portal/` | /employee-portal | Supervisor/Area Officer | /api/bff/supervisor-portal |
| `reports/` | (embedded) | Cross-team | — |
| `shared/` | — | All teams | — |

## Rules

### 1. Public API (Barrel Exports)

Each module has an `index.ts` that defines its public API. Other modules **must** import only from the barrel:

```ts
// ✅ Correct — uses the barrel
import { useMessFundRequests } from '@/modules/operations';

// ❌ Wrong — reaches into internals
import { useMessFundRequests } from '@/modules/operations/hooks/useMessFundRequests';
```

ESLint `no-restricted-imports` enforces this at build time.

### 2. Cross-Module Types

Shared data shapes live in `src/modules/shared/types.ts`. Use these when:
- 2+ modules need the same type (Employee, Client, Post, Invoice)
- BFF response types need to be shared between API and client

```ts
import type { SharedEmployee, AdminOverviewResponse } from '@/modules/shared';
```

### 3. Module Structure

```
src/modules/sales/
├── index.ts              ← Public API (barrel export)
├── SalesModule.tsx       ← Root component (lazy-loaded at page level)
├── components/           ← Internal UI components
├── hooks/                ← Internal data hooks
├── constants/            ← Module-specific constants
└── services/             ← Module-specific API services (if any)
```

### 4. Data Flow

```
Page (app/(erp)/sales/page.tsx)
  └── dynamic(() => import('@/modules/sales'))  ← code-split
        └── SalesModule.tsx
              ├── Uses React Query with BFF hook (useBFF)
              ├── OR uses Context providers with realtime subscriptions
              └── Internal components receive data via props/context
```

### 5. Allowed Dependencies

| From \ To | shared | services | components/ui | contexts | lib |
|-----------|--------|----------|---------------|----------|-----|
| Any module | ✅ | ✅ | ✅ | ✅ | ✅ |
| Module → Module | ❌ (use barrel) | — | — | — | — |

### 6. BFF Pattern

Heavy pages use a Backend-For-Frontend endpoint that aggregates multiple DB queries into a single HTTP response:

```
Browser → /api/bff/admin-overview → 11 parallel Supabase queries → Single JSON response
```

Use the `useBFF<T>()` hook from `@/lib/bff`:

```ts
import { useBFF } from '@/lib/bff';
import type { AdminOverviewResponse } from '@/modules/shared';

const { data, isLoading } = useBFF<AdminOverviewResponse>(
  ['dashboard', 'overview'],
  '/api/bff/admin-overview'
);
```

## Adding a New Module

1. Create `src/modules/my-module/`
2. Add `index.ts` with public API exports
3. Add internal `components/`, `hooks/` as needed
4. Create page at `app/(erp)/my-module/page.tsx` with `dynamic()` import
5. If 3+ DB calls on load, create `/api/bff/my-module/route.ts`
6. Add ESLint boundary rules in `eslint.config.js`
7. Add shared types to `src/modules/shared/types.ts` if needed
