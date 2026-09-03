# Design Document: Next.js 16.1 Migration

## Overview

This design document outlines the technical approach for migrating the existing Vite-based React SPA to Next.js 16.1 with App Router. The migration preserves all existing functionality by using client-side rendering throughout, achieved by adding the `'use client'` directive to all components. The migration follows a phased approach to minimize risk and maintain rollback capability.

## Architecture

### Current Architecture (Vite SPA)

```
┌─────────────────────────────────────────────────────────────┐
│                        Vite Dev Server                       │
│                         (Port 8080)                          │
├─────────────────────────────────────────────────────────────┤
│  main.tsx                                                    │
│    └── BrowserRouter                                         │
│          └── ThemeProvider                                   │
│                └── App.tsx                                   │
│                      ├── QueryClientProvider                 │
│                      ├── FirebaseProvider                    │
│                      ├── AppDataProvider                     │
│                      ├── BranchProvider                      │
│                      ├── SoundEffectsProvider                │
│                      └── Routes (React Router DOM)           │
│                            ├── / → Index                     │
│                            ├── /dashboard → AdminDashboard   │
│                            ├── /sales → SalesModule          │
│                            ├── /operations → OperationsModule│
│                            ├── /accounts → AccountsModule    │
│                            ├── /hr → HRModule                │
│                            ├── /office-admin → OfficeAdmin   │
│                            ├── /profile → UserProfile        │
│                            └── * → NotFound                  │
└─────────────────────────────────────────────────────────────┘
```

### Target Architecture (Next.js 16.1)

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Dev Server                       │
│                         (Port 8080)                          │
├─────────────────────────────────────────────────────────────┤
│  app/layout.tsx ('use client')                               │
│    └── Providers (all client-side)                           │
│          ├── QueryClientProvider                             │
│          ├── FirebaseProvider                                │
│          ├── AppDataProvider                                 │
│          ├── BranchProvider                                  │
│          ├── ThemeProvider                                   │
│          └── SoundEffectsProvider                            │
├─────────────────────────────────────────────────────────────┤
│  app/                                                        │
│    ├── page.tsx → Index (login/landing)                      │
│    ├── dashboard/page.tsx → AdminDashboard                   │
│    ├── sales/page.tsx → SalesModule                          │
│    ├── operations/page.tsx → OperationsModule                │
│    ├── accounts/page.tsx → AccountsModule                    │
│    ├── hr/page.tsx → HRModule                                │
│    ├── office-admin/page.tsx → OfficeAdminModule             │
│    ├── profile/page.tsx → UserProfile                        │
│    └── not-found.tsx → NotFound                              │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Next.js Configuration

```typescript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Preserve SPA behavior - disable SSR for all pages
  reactStrictMode: true,
  
  // Path alias matching Vite config
  webpack: (config) => {
    config.resolve.alias['@'] = path.join(__dirname, 'src');
    return config;
  },
  
  // API rewrites to match Vite proxy
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
    ];
  },
  
  // Environment variables
  env: {
    // All VITE_ prefixed vars become NEXT_PUBLIC_
  },
};
```

### Root Layout Component

```typescript
// app/layout.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/components/ThemeProvider';
import { FirebaseProvider } from '@/contexts/FirebaseContext';
import { AppDataProvider } from '@/contexts/AppDataContext';
import { BranchProvider } from '@/contexts/BranchContext';
import { SoundEffectsProvider } from '@/components/sound/SoundEffectsProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { SoundInitializer } from '@/components/sound/SoundInitializer';
import { SoundToggle } from '@/components/sound/SoundToggle';
import '@/index.css';
import '@/styles/module-styles.css';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
    },
  },
});

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <QueryClientProvider client={queryClient}>
          <FirebaseProvider>
            <AppDataProvider>
              <BranchProvider>
                <ThemeProvider defaultTheme="light">
                  <SoundEffectsProvider>
                    <TooltipProvider>
                      <Toaster />
                      <Sonner />
                      <SoundInitializer />
                      <SoundToggle />
                      {children}
                    </TooltipProvider>
                  </SoundEffectsProvider>
                </ThemeProvider>
              </BranchProvider>
            </AppDataProvider>
          </FirebaseProvider>
        </QueryClientProvider>
      </body>
    </html>
  );
}
```

### Protected Route Component (Adapted for Next.js)

```typescript
// src/components/ProtectedRoute.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/integrations/supabase/client';
import { FullscreenBrandLoader } from '@/components/ui/brand-loader';
import { useSoundEffect } from '@/hooks/useSoundEffect';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export function ProtectedRoute({ children, allowedRoles = [] }: ProtectedRouteProps) {
  const router = useRouter();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const sounds = useSoundEffect();

  useEffect(() => {
    // Same authentication logic as current implementation
    // Uses Next.js router.push() instead of Navigate component
  }, []);

  if (loading) {
    return <FullscreenBrandLoader message="Authenticating..." />;
  }

  if (!isAuthenticated) {
    router.push('/');
    return null;
  }

  const allowed = allowedRoles.length === 0 || 
    (userRole && (allowedRoles.includes(userRole) || userRole === 'admin'));
  
  if (!allowed) {
    sounds.playError();
    router.push('/');
    return null;
  }

  sounds.playClick();
  return <>{children}</>;
}
```

### Page Transition Component (Adapted)

```typescript
// src/components/PageTransition.tsx
'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{
          duration: 0.3,
          ease: [0.16, 1, 0.3, 1],
        }}
        className="w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

## Data Models

### Environment Variables Mapping

| Vite Variable | Next.js Variable |
|---------------|------------------|
| `VITE_FIREBASE_API_KEY` | `NEXT_PUBLIC_FIREBASE_API_KEY` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| `VITE_FIREBASE_PROJECT_ID` | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` |
| `VITE_FIREBASE_APP_ID` | `NEXT_PUBLIC_FIREBASE_APP_ID` |
| `VITE_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

### Route Mapping

| React Router Path | Next.js App Router Path |
|-------------------|-------------------------|
| `/` | `app/page.tsx` |
| `/dashboard` | `app/dashboard/page.tsx` |
| `/sales` | `app/sales/page.tsx` |
| `/operations` | `app/operations/page.tsx` |
| `/accounts` | `app/accounts/page.tsx` |
| `/hr` | `app/hr/page.tsx` |
| `/office-admin` | `app/office-admin/page.tsx` |
| `/profile` | `app/profile/page.tsx` |
| `*` (catch-all) | `app/not-found.tsx` |

### File Structure Mapping

```
Current (Vite)                    Target (Next.js)
─────────────────────────────────────────────────────────
src/                              src/
├── components/                   ├── components/        (unchanged)
├── contexts/                     ├── contexts/          (unchanged)
├── hooks/                        ├── hooks/             (unchanged)
├── services/                     ├── services/          (unchanged)
├── pages/                        ├── pages/             (keep as components)
├── types/                        ├── types/             (unchanged)
├── utils/                        ├── utils/             (unchanged)
├── data/                         ├── data/              (unchanged)
├── lib/                          ├── lib/               (unchanged)
├── integrations/                 ├── integrations/      (unchanged)
├── App.tsx                       (removed - logic in layout)
├── main.tsx                      (removed - Next.js handles)
├── index.css                     ├── index.css          (unchanged)
└── styles/                       └── styles/            (unchanged)

public/                           public/                (unchanged)
├── sfx/                          ├── sfx/
└── ...                           └── ...

(new)                             app/
                                  ├── layout.tsx
                                  ├── page.tsx
                                  ├── not-found.tsx
                                  ├── dashboard/
                                  │   └── page.tsx
                                  ├── sales/
                                  │   └── page.tsx
                                  ├── operations/
                                  │   └── page.tsx
                                  ├── accounts/
                                  │   └── page.tsx
                                  ├── hr/
                                  │   └── page.tsx
                                  ├── office-admin/
                                  │   └── page.tsx
                                  └── profile/
                                      └── page.tsx
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, the following properties can be verified through automated testing:

### Property 1: Client Directive Presence

*For any* TypeScript/TSX component file in the `src/components/` directory, the file SHALL begin with the `'use client'` directive as its first statement (excluding comments).

**Validates: Requirements 4.1**

### Property 2: Environment Variable Prefix

*For any* service file that references environment variables for client-side use, the variable names SHALL use the `NEXT_PUBLIC_` prefix instead of `VITE_` prefix.

**Validates: Requirements 5.5**

### Property 3: Route-to-Page Mapping

*For any* route defined in the original React Router configuration, there SHALL exist a corresponding `page.tsx` file in the `app/` directory structure that matches the route path.

**Validates: Requirements 6.1, 7.3**

### Property 4: Provider Chain Completeness

*For any* provider used in the original `App.tsx` (QueryClientProvider, FirebaseProvider, AppDataProvider, BranchProvider, ThemeProvider, SoundEffectsProvider, TooltipProvider), the provider SHALL be present in `app/layout.tsx`.

**Validates: Requirements 7.1**

## Error Handling

### Build-Time Errors

| Error Type | Cause | Resolution |
|------------|-------|------------|
| Module not found | Missing `'use client'` directive | Add directive to component |
| Invalid import | React Router imports | Replace with Next.js navigation |
| Environment variable undefined | Wrong prefix | Change `VITE_` to `NEXT_PUBLIC_` |
| Type errors | Missing types | Install `@types/node` for Next.js |

### Runtime Errors

| Error Type | Cause | Resolution |
|------------|-------|------------|
| Hydration mismatch | Server/client content differs | Ensure `'use client'` on all components |
| Window is not defined | Browser API on server | Wrap in `useEffect` or dynamic import |
| Router not found | Using react-router-dom | Replace with `next/navigation` |

### Migration Rollback Procedure

1. Stop Next.js development server
2. Remove `app/` directory
3. Remove `next.config.js`
4. Restore original `package.json` scripts
5. Run `npm run dev` (Vite)

## Testing Strategy

### Verification Approach

Since this is a migration (not new feature development), testing focuses on:

1. **Static Analysis**: Verify file structure and content patterns
2. **Build Verification**: Ensure `next build` succeeds
3. **Manual Smoke Testing**: Verify critical user flows work

### Static Verification Tests

These tests verify the migration was performed correctly without running the application:

```typescript
// Example verification script structure
describe('Migration Verification', () => {
  test('All component files have use client directive', () => {
    // Scan src/components/**/*.tsx
    // Verify first non-comment line is 'use client'
  });

  test('All routes have corresponding page files', () => {
    // Parse original routes from App.tsx
    // Verify app/{route}/page.tsx exists
  });

  test('Environment variables use correct prefix', () => {
    // Scan service files for process.env usage
    // Verify NEXT_PUBLIC_ prefix
  });

  test('Layout contains all providers', () => {
    // Parse app/layout.tsx
    // Verify all provider imports present
  });
});
```

### Build Verification

```bash
# Verify build succeeds
npm run build

# Expected: Exit code 0, no errors
```

### Manual Smoke Test Checklist

- [ ] Home page loads at `/`
- [ ] Login form works
- [ ] Dashboard loads after authentication
- [ ] Navigation between modules works
- [ ] Dark mode toggle works
- [ ] Sound effects play
- [ ] Firebase data loads
- [ ] Forms submit correctly

### Property-Based Testing Note

Due to the nature of this migration (file transformation rather than business logic), traditional property-based testing with random input generation is not applicable. The properties defined above are verified through static analysis of the codebase rather than runtime property testing.

The verification scripts will:
1. Enumerate all relevant files
2. Parse/analyze each file
3. Assert the property holds for each file
4. Report any violations
