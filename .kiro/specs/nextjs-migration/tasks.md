# Implementation Plan: Next.js 16.1 Migration

## Overview

This implementation plan migrates the existing Vite-based React SPA to Next.js 16.1 with App Router. The migration is performed in phases to minimize risk and maintain rollback capability. All components use client-side rendering via the `'use client'` directive.

## Tasks

- [x] 1. Phase 1: Foundation Setup
  - [x] 1.1 Create Next.js configuration file
    - Create `next.config.js` with path alias `@/` → `./src`
    - Configure API rewrites for `/api/*` → `localhost:3001`
    - Set development port to 8080
    - _Requirements: 1.3, 2.4, 2.5_

  - [x] 1.2 Update package.json for Next.js
    - Add Next.js 16.1 as dependency
    - Add Next.js scripts (dev, build, start)
    - Keep Vite scripts with different names for rollback
    - _Requirements: 1.5_

  - [x] 1.3 Update TypeScript configuration
    - Modify `tsconfig.json` for Next.js compatibility
    - Ensure path alias `@/*` works with Next.js
    - _Requirements: 2.3_

  - [x] 1.4 Create environment variable file
    - Create `.env.local` with `NEXT_PUBLIC_` prefixed variables
    - Map all `VITE_` variables to `NEXT_PUBLIC_` equivalents
    - _Requirements: 1.4, 5.5_

- [x] 2. Phase 2: App Router Structure
  - [x] 2.1 Create root layout
    - Create `app/layout.tsx` with `'use client'` directive
    - Add all providers (QueryClient, Firebase, AppData, Branch, Theme, Sound)
    - Import global CSS files
    - Add HTML structure with `suppressHydrationWarning`
    - _Requirements: 7.1_

  - [x] 2.2 Create home page
    - Create `app/page.tsx` with `'use client'` directive
    - Import and render Index component with PageTransition
    - _Requirements: 7.2_

  - [x] 2.3 Create module pages
    - Create `app/dashboard/page.tsx` for AdminDashboard
    - Create `app/sales/page.tsx` for SalesModule
    - Create `app/operations/page.tsx` for OperationsModule
    - Create `app/accounts/page.tsx` for AccountsModule
    - Create `app/hr/page.tsx` for HRModule
    - Create `app/office-admin/page.tsx` for OfficeAdminModule
    - Create `app/profile/page.tsx` for UserProfile
    - All pages use `'use client'` directive
    - _Requirements: 7.3_

  - [x] 2.4 Create not-found page
    - Create `app/not-found.tsx` with `'use client'` directive
    - Import and render NotFound component
    - _Requirements: 6.1_

- [x] 3. Phase 3: Component Adaptation
  - [x] 3.1 Create ProtectedRoute component for Next.js
    - Create `src/components/ProtectedRoute.tsx`
    - Use `next/navigation` instead of react-router-dom
    - Preserve authentication and role-checking logic
    - _Requirements: 6.5_

  - [x] 3.2 Create PageTransition component for Next.js
    - Create `src/components/PageTransition.tsx`
    - Use `usePathname` from `next/navigation`
    - Preserve framer-motion animations
    - _Requirements: 6.3_

  - [x] 3.3 Add 'use client' directive to all components
    - Add directive to all files in `src/components/`
    - Add directive to all files in `src/contexts/`
    - Add directive to all files in `src/hooks/`
    - Add directive to all page components in `src/pages/`
    - _Requirements: 4.1_

- [x] 3.4 Write verification script for 'use client' directive
  - **Property 1: Client Directive Presence**
  - Scan all .tsx files in src/components, src/contexts, src/hooks, src/pages
  - Verify first non-comment line is 'use client'
  - **Validates: Requirements 4.1**

- [x] 4. Phase 4: Service Updates
  - [x] 4.1 Update Firebase configuration
    - Update `src/config/firebase.ts` to use `NEXT_PUBLIC_` env vars
    - Add `'use client'` directive
    - _Requirements: 5.1, 5.5_

  - [x] 4.2 Update Supabase configuration
    - Update `src/integrations/supabase/client.ts` to use `NEXT_PUBLIC_` env vars
    - Add `'use client'` directive
    - _Requirements: 5.2, 5.5_

  - [x] 4.3 Update all service files
    - Add `'use client'` directive to all service files
    - Update any `VITE_` env var references to `NEXT_PUBLIC_`
    - _Requirements: 5.5_

- [x] 4.4 Write verification script for environment variables
  - **Property 2: Environment Variable Prefix**
  - Scan service files for process.env or import.meta.env usage
  - Verify all client-side vars use NEXT_PUBLIC_ prefix
  - **Validates: Requirements 5.5**

- [x] 5. Phase 5: Navigation Updates
  - [x] 5.1 Update navigation components
    - Replace `react-router-dom` Link with `next/link` Link
    - Replace `useNavigate` with `useRouter` from `next/navigation`
    - Replace `useLocation` with `usePathname` from `next/navigation`
    - _Requirements: 6.3_

  - [x] 5.2 Update sidebar and header navigation
    - Update `src/components/layout/` components
    - Ensure all navigation uses Next.js Link
    - _Requirements: 6.3_

- [x] 5.3 Write verification script for route mapping
  - **Property 3: Route-to-Page Mapping**
  - Parse routes from original App.tsx
  - Verify corresponding page.tsx exists in app/
  - **Validates: Requirements 6.1, 7.3**

- [x] 6. Checkpoint - Build Verification
  - Run `npm run build` to verify Next.js build succeeds
  - Fix any build errors
  - Ensure all TypeScript errors are resolved
  - _Requirements: 10.1_

- [x] 6.1 Write verification script for provider chain
  - **Property 4: Provider Chain Completeness**
  - Parse app/layout.tsx for provider imports
  - Verify all required providers are present
  - **Validates: Requirements 7.1**

- [x] 7. Phase 6: Final Integration
  - [x] 7.1 Update Tailwind configuration
    - Ensure `tailwind.config.ts` includes `app/` in content paths
    - Verify all custom colors and animations are preserved
    - _Requirements: 2.1, 9.1, 9.2, 9.4_

  - [x] 7.2 Verify asset paths
    - Ensure `public/` directory contents are accessible
    - Verify sound files in `public/sfx/` load correctly
    - _Requirements: 3.1, 3.2_

  - [x] 7.3 Clean up unused files
    - Keep `vite.config.ts` for rollback (rename to `vite.config.ts.bak`)
    - Keep original `App.tsx` and `main.tsx` as backup
    - _Requirements: 1.2_

- [-] 8. Final Checkpoint - Manual Smoke Testing
  - [x] Verify home page loads at `/`
  - [ ] Verify login functionality works
  - [x] Verify dashboard loads after authentication
  - [ ] Verify navigation between all modules
  - [ ] Verify dark mode toggle works
  - [ ] Verify sound effects play
  - [ ] Verify Firebase data loads correctly
  - [ ] Verify forms submit correctly
  - _Requirements: 10.3, 10.4, 10.5_

## Notes

- All tasks are required including verification scripts
- Each phase should be completed before moving to the next
- Checkpoints ensure incremental validation
- Keep Vite configuration for rollback capability
- All components must have `'use client'` directive for SPA behavior
- Verification scripts provide automated validation of migration correctness
