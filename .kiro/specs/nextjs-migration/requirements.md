# Requirements Document

## Introduction

This specification covers the migration of an existing React Single Page Application (SPA) built with Vite to Next.js 16.1 using the App Router. The migration must preserve all existing functionality, UI, logic, and behavior without any refactoring, redesign, or feature additions. The project is approximately 20% complete and uses React Router DOM, Tailwind CSS, shadcn/ui components, Firebase, and Supabase.

## Glossary

- **Migration_System**: The process and tooling used to convert the Vite SPA to Next.js
- **Source_Project**: The existing Vite-based React SPA located in `Jagannath project/lovable-project-513c5e73`
- **Target_Project**: The new Next.js 16.1 application with App Router
- **SPA_Behavior**: Client-side only rendering without server-side rendering (SSR)
- **Path_Alias**: The `@/` import alias that maps to `./src` directory
- **Client_Component**: A Next.js component marked with `'use client'` directive for client-side rendering

## Requirements

### Requirement 1: Project Structure Setup

**User Story:** As a developer, I want the Next.js project structure created alongside the existing Vite project, so that I can migrate incrementally while maintaining rollback capability.

#### Acceptance Criteria

1. THE Migration_System SHALL create a new Next.js 16.1 project structure in the same directory
2. THE Migration_System SHALL preserve the existing Vite configuration files for rollback capability
3. THE Migration_System SHALL create `next.config.js` with path alias `@/` mapping to `./src`
4. THE Migration_System SHALL configure environment variables matching the existing `.env.example`
5. THE Migration_System SHALL install all dependencies from the existing `package.json`

### Requirement 2: Configuration Migration

**User Story:** As a developer, I want all build configurations migrated correctly, so that the application builds and runs identically to the Vite version.

#### Acceptance Criteria

1. THE Migration_System SHALL copy and adapt `tailwind.config.ts` for Next.js compatibility
2. THE Migration_System SHALL copy `postcss.config.js` without modifications
3. THE Migration_System SHALL configure TypeScript paths in `tsconfig.json` matching the existing setup
4. THE Migration_System SHALL configure API proxy routes to `localhost:3001` matching Vite proxy configuration
5. THE Migration_System SHALL set the development server port to 8080 to match existing configuration

### Requirement 3: Asset Migration

**User Story:** As a developer, I want all static assets migrated to the correct Next.js locations, so that images, fonts, and other assets load correctly.

#### Acceptance Criteria

1. THE Migration_System SHALL move contents of `public/` directory to Next.js `public/` directory
2. THE Migration_System SHALL preserve the `sfx/` sound files directory structure
3. THE Migration_System SHALL update any hardcoded asset paths to use Next.js conventions
4. WHEN assets are referenced in components THEN the Migration_System SHALL ensure paths resolve correctly

### Requirement 4: Component Migration

**User Story:** As a developer, I want all React components migrated to Next.js with client-side rendering preserved, so that the UI behaves identically.

#### Acceptance Criteria

1. THE Migration_System SHALL add `'use client'` directive to ALL component files
2. THE Migration_System SHALL preserve all component logic, props, and state management
3. THE Migration_System SHALL maintain the existing component directory structure under `src/components`
4. WHEN components use browser APIs (window, document, localStorage) THEN the Migration_System SHALL ensure they only execute on the client side
5. THE Migration_System SHALL preserve all shadcn/ui component configurations

### Requirement 5: Service and Context Migration

**User Story:** As a developer, I want all services, contexts, and hooks migrated correctly, so that data fetching and state management work identically.

#### Acceptance Criteria

1. THE Migration_System SHALL migrate all Firebase services without modification
2. THE Migration_System SHALL migrate all Supabase integrations without modification
3. THE Migration_System SHALL preserve all React contexts (AuthContext, BranchContext, FirebaseContext, AppDataContext)
4. THE Migration_System SHALL migrate all custom hooks maintaining their functionality
5. WHEN services use environment variables THEN the Migration_System SHALL ensure they use Next.js `NEXT_PUBLIC_` prefix for client-side variables

### Requirement 6: Routing Migration

**User Story:** As a developer, I want React Router DOM routes converted to Next.js App Router, so that navigation works identically.

#### Acceptance Criteria

1. THE Migration_System SHALL convert all React Router routes to Next.js App Router file-based routes
2. THE Migration_System SHALL preserve all route parameters and query string handling
3. THE Migration_System SHALL maintain client-side navigation behavior using Next.js `Link` component
4. WHEN dynamic routes exist THEN the Migration_System SHALL create appropriate `[param]` folder structures
5. THE Migration_System SHALL preserve all protected route logic and authentication guards

### Requirement 7: Page Migration

**User Story:** As a developer, I want all page components migrated to the Next.js `app/` directory, so that the application renders all pages correctly.

#### Acceptance Criteria

1. THE Migration_System SHALL create `app/layout.tsx` with all providers (Theme, Auth, Firebase, etc.)
2. THE Migration_System SHALL migrate the Index page to `app/page.tsx`
3. THE Migration_System SHALL migrate all module pages (HR, Sales, Operations, Accounts, Admin, etc.)
4. THE Migration_System SHALL preserve all page-level state and data fetching logic
5. THE Migration_System SHALL maintain the existing URL structure for all pages

### Requirement 8: Third-Party Integration Preservation

**User Story:** As a developer, I want all third-party integrations to continue working, so that Firebase, Supabase, and other services function correctly.

#### Acceptance Criteria

1. THE Migration_System SHALL preserve Firebase authentication flow
2. THE Migration_System SHALL preserve Firestore database operations
3. THE Migration_System SHALL preserve Supabase client configuration
4. THE Migration_System SHALL preserve all API integrations (India Post API, Razorpay IFSC API)
5. WHEN third-party libraries require browser APIs THEN the Migration_System SHALL ensure proper client-side initialization

### Requirement 9: Styling Preservation

**User Story:** As a developer, I want all styling to render identically, so that the UI appearance is unchanged.

#### Acceptance Criteria

1. THE Migration_System SHALL preserve all Tailwind CSS classes and configurations
2. THE Migration_System SHALL preserve the brand color palette (Red #D71920, Black #000000, White #FFFFFF, Gray #4A4A4A)
3. THE Migration_System SHALL preserve dark mode functionality using `next-themes`
4. THE Migration_System SHALL preserve all custom animations and keyframes
5. THE Migration_System SHALL preserve all CSS-in-JS styles if any exist

### Requirement 10: Build and Development Verification

**User Story:** As a developer, I want verification that the migrated application works correctly, so that I can confidently deploy the Next.js version.

#### Acceptance Criteria

1. THE Migration_System SHALL ensure the application builds without errors using `next build`
2. THE Migration_System SHALL ensure the development server runs on port 8080
3. THE Migration_System SHALL verify all routes are accessible and render correctly
4. THE Migration_System SHALL verify all forms submit data correctly
5. THE Migration_System SHALL verify all Firebase and Supabase operations work correctly
