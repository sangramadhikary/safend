# Implementation Plan: Marketing Website

## Overview

This plan implements a public marketing website at the root route (`/`) for Safend Secure Solutions, relocates the ERP login to `/login`, and updates all auth redirects. The approach uses Next.js App Router route groups to cleanly separate the public marketing layout from the ERP authenticated layout, introduces new marketing page components, and rewires existing redirect logic.

## Tasks

- [x] 1. Set up route groups, types, and shared utilities
  - [x] 1.1 Create marketing types and service/contact data files
    - Create `src/types/marketing.ts` with `ServiceEntry`, `EnquiryFormData`, `EnquiryFormState`, and `ContactInfo` interfaces
    - Create `src/data/services.ts` with the static `SERVICES` array (security guards, housekeeping, bouncers, armed security)
    - Create `src/data/contact.ts` with the static `CONTACT_INFO` object (phone, email, address)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 9.1_

  - [x] 1.2 Create the role redirect utility module
    - Create `src/utils/roleRedirect.ts` with `getRedirectPath`, `PROTECTED_ROUTES`, and `isAuthorizedForRoute` functions
    - Implement role-to-destination mapping: admin/branch_admin → `/dashboard`, sales → `/sales`, operations → `/operations`, accounts → `/accounts`, hr → `/hr`, unknown/null → `/sales`
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 8.1, 8.2_

  - [x] 1.3 Create enquiry validation schema
    - Create `src/lib/enquirySchema.ts` with Zod schema validating name (1–100 chars), contactMethod (valid email or phone), and message (1–2000 chars)
    - _Requirements: 9.4, 9.5_

  - [x] 1.4 Restructure app directory into route groups
    - Create `app/(marketing)/layout.tsx` — minimal layout with html structure, no ERP providers
    - Create `app/(marketing)/page.tsx` — placeholder server component for the marketing home page
    - Create `app/(erp)/layout.tsx` — layout that wraps children with the existing `Providers` component (move provider logic here)
    - Move existing ERP route folders (`dashboard`, `sales`, `operations`, `accounts`, `hr`, `profile`, `office-admin`) into `app/(erp)/`
    - Simplify `app/layout.tsx` to bare `<html>` and `<body>` wrapper without `Providers`
    - Retain `app/not-found.tsx` at root level
    - _Requirements: 1.1, 1.2, 5.3_

- [x] 2. Implement marketing page components
  - [x] 2.1 Implement NavigationBar and MobileNavMenu components
    - Create `src/components/marketing/NavigationBar.tsx` — sticky header with Safend logo, section links (Services, About, Contact), and Login button styled with Brand_Color `#D71920`
    - Create `src/components/marketing/MobileNavMenu.tsx` — client component with hamburger toggle for viewports below 768px, keeping Login action visible
    - Implement smooth scroll on section link activation, positioning section below the navbar
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 10.1_

  - [x] 2.2 Implement HeroSection component
    - Create `src/components/marketing/HeroSection.tsx` — displays Safend logo, brand tagline, and uses Brand_Color `#D71920` on a prominent element
    - _Requirements: 1.4, 1.5_

  - [x] 2.3 Implement ServiceSection component
    - Create `src/components/marketing/ServiceSection.tsx` — renders service entries from `SERVICES` data, filtering out any with missing/invalid name or description
    - Display name (1–60 chars) and description (1–500 chars) for each valid entry
    - Include text stating Safend serves events, businesses, and personal residences
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.4 Implement AboutSection component
    - Create `src/components/marketing/AboutSection.tsx` — company background, values, and service proposition
    - _Requirements: 1.3_

  - [x] 2.5 Implement ContactSection and EnquiryForm components
    - Create `src/components/marketing/ContactSection.tsx` — displays contact phone, email, and physical address from `CONTACT_INFO`
    - Create `src/components/marketing/EnquiryForm.tsx` — client component with name, contact method, and message fields; submit button; client-side validation using `enquirySchema`; displays confirmation on success, error on failure, retains values on error
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 2.6 Assemble marketing home page
    - Update `app/(marketing)/page.tsx` to compose NavigationBar, HeroSection, ServiceSection, AboutSection, and ContactSection in top-to-bottom order
    - Ensure page is a server component with client islands only for EnquiryForm and MobileNavMenu
    - Ensure responsive single-column layout on viewports below 768px with no horizontal scroll
    - _Requirements: 1.1, 1.2, 1.3, 10.2, 10.3_

- [x] 3. Checkpoint - Verify marketing page renders
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Relocate ERP login and update redirects
  - [x] 4.1 Create login route page
    - Create `app/(erp)/login/page.tsx` — renders the existing `Index` component (LoginScreen) with the same PageTransition wrapper
    - Ensure LoginForm, employee verification, and onboarding entry points function identically to their previous root-route behavior
    - _Requirements: 5.1, 5.2, 5.4, 5.5_

  - [x] 4.2 Update session redirect logic on login page
    - In the login page or the existing `Index.tsx` module, ensure that when a valid Supabase session exists, the user is redirected to the role-appropriate ERP destination using `getRedirectPath`
    - Handle session verification failure by keeping the user on the Login_Screen and showing an error indication
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [x] 4.3 Update ProtectedRoute redirect target
    - In `src/components/ProtectedRoute.tsx`, change `router.push('/')` to `router.push('/login')`
    - Ensure timeout behavior (5-second session check) still triggers redirect to `/login`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 4.4 Update LogoutOverlay redirect target
    - In `src/components/layout/LogoutOverlay.tsx`, change `window.location.href = '/'` to `window.location.href = '/login'`
    - Ensure cached auth state is cleared before navigation; if clearing fails, still navigate to `/login`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 4.5 Update Login_Action error handling
    - In NavigationBar Login button, if navigation to `/login` fails (e.g., router error), keep visitor on marketing page and display an error indication
    - _Requirements: 4.4_

- [x] 5. Implement enquiry API route
  - [x] 5.1 Create enquiry API endpoint
    - Create `app/api/enquiry/route.ts` — POST handler that validates the request body with `enquirySchema`, inserts into `marketing_enquiries` Supabase table using service role key, and returns appropriate success/error responses
    - _Requirements: 9.3, 9.6_

  - [x] 5.2 Create database migration script for marketing_enquiries table
    - Create `scripts/create_marketing_enquiries_table.sql` with the table schema (id UUID, name VARCHAR(100), contact_method VARCHAR(255), message TEXT with length check, created_at, status)
    - _Requirements: 9.3_

- [x] 6. Checkpoint - Verify login relocation and redirects
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Write property-based and unit tests
  - [ ]* 7.1 Write property test for service entry display validation
    - **Property 1: Valid service entries are displayed completely**
    - **Validates: Requirements 2.2, 2.3**
    - Generate random `ServiceEntry` arrays with valid name (1–60 chars) and description (1–500 chars), verify all are included in rendered output

  - [ ]* 7.2 Write property test for invalid service entry filtering
    - **Property 2: Invalid service entries are filtered out**
    - **Validates: Requirements 2.5**
    - Generate entries with empty/missing name or description, verify they are omitted from output

  - [ ]* 7.3 Write property test for role redirect mapping
    - **Property 3: Role-based redirect destination mapping**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7**
    - Generate random role strings, verify `getRedirectPath` returns correct destination for known roles and `/sales` for unknown/null

  - [ ]* 7.4 Write property test for protected route authorization
    - **Property 4: Unauthorized access to protected routes redirects to login**
    - **Validates: Requirements 8.1, 8.2**
    - Generate random route + role combinations, verify `isAuthorizedForRoute` correctly denies unauthorized access

  - [ ]* 7.5 Write property test for enquiry form validation
    - **Property 5: Enquiry form validation rejects invalid input**
    - **Validates: Requirements 9.4, 9.5**
    - Generate random form inputs (name exceeding 100 chars, message exceeding 2000 chars, invalid contact methods), verify schema rejects and identifies invalid fields

  - [ ]* 7.6 Write unit tests for marketing components
    - Test NavigationBar renders logo, section links, and Login button with Brand_Color
    - Test HeroSection renders logo and brand color element
    - Test ServiceSection renders exactly 4 services with correct content
    - Test ContactSection renders phone, email, and address
    - Test EnquiryForm shows validation messages for invalid input
    - _Requirements: 1.4, 1.5, 2.1, 3.1, 4.1, 9.1_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `Index.tsx` module is reused as-is at the new `/login` route — no rewrite needed
- Route groups `(marketing)` and `(erp)` keep URL paths unchanged while allowing different layouts
- All existing ERP functionality remains untouched beyond redirect target changes

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5"] },
    { "id": 3, "tasks": ["2.6", "4.1", "5.2"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "4.5", "5.1"] },
    { "id": 5, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6"] }
  ]
}
```
