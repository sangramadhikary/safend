import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

/**
 * Unit tests for the hardened Protected_Route_Guard (Req 5.5, 5.6, 5.7, 5.8).
 *
 * These tests assert that:
 *  - access is denied (redirect to /login) when the server cannot confirm a
 *    session via `supabase.auth.getUser()` (Req 5.7, 5.8);
 *  - the authorized role is resolved from the `user_roles` table for the
 *    validated user, never from a `localStorage` value (Req 5.8);
 *  - a sign-out / session-revocation auth-state transition redirects to login
 *    on the next evaluation rather than rendering protected content (Req 5.5);
 *  - no default/hardcoded role is applied when the server returns no role.
 */

// ---- Router mock ---------------------------------------------------------
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

// Skeleton is irrelevant to behavior; render a lightweight stand-in.
vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: (props: any) => <div data-testid="skeleton" {...props} />,
}));

// ---- Supabase mock -------------------------------------------------------
// Configurable per-test handles. `getUserResult` controls the server-side
// session validation; `rolesResult` controls the user_roles lookup; the
// captured auth-state callback lets a test simulate sign-out/revocation.
let getUserResult: { data: { user: any }; error: any };
let rolesResult: { data: any; error: any };
let authStateCallback: ((event: string, session: any) => void) | null = null;
const eqMock = vi.fn();
const unsubscribeMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => getUserResult),
      onAuthStateChange: vi.fn((cb: (event: string, session: any) => void) => {
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe: unsubscribeMock } } };
      }),
    },
    from: vi.fn((_table: string) => ({
      select: vi.fn(() => ({
        eq: eqMock,
      })),
    })),
  },
}));

import { ProtectedRoute } from '../ProtectedRoute';

const PROTECTED_TEXT = 'secret-dashboard';
const Protected = () => <div>{PROTECTED_TEXT}</div>;

beforeEach(() => {
  vi.clearAllMocks();
  authStateCallback = null;
  // Default: confirmed user with an admin role.
  getUserResult = { data: { user: { id: 'user-1', email: 'a@safend.com' } }, error: null };
  rolesResult = { data: [{ role: 'admin' }], error: null };
  eqMock.mockImplementation(async () => rolesResult);
  // Pre-seed a stale, tampered cache to prove the guard ignores it (Req 5.8).
  localStorage.setItem('isAuthenticated', 'true');
  localStorage.setItem('userRole', 'admin');
});

afterEach(() => {
  localStorage.clear();
});

describe('ProtectedRoute server-side session re-validation (Req 5.7, 5.8)', () => {
  it('renders protected content when the server confirms the session and role', async () => {
    render(
      <ProtectedRoute allowedRoles={['admin']}>
        <Protected />
      </ProtectedRoute>
    );

    expect(await screen.findByText(PROTECTED_TEXT)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('redirects to /login when getUser returns no user (unconfirmed session)', async () => {
    getUserResult = { data: { user: null }, error: null };

    render(
      <ProtectedRoute allowedRoles={['admin']}>
        <Protected />
      </ProtectedRoute>
    );

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
  });

  it('clears the stale localStorage auth cache when the server denies the session (Req 5.8)', async () => {
    getUserResult = { data: { user: null }, error: null };

    render(
      <ProtectedRoute allowedRoles={['admin']}>
        <Protected />
      </ProtectedRoute>
    );

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    // The tampered cache must not be trusted or left in place.
    expect(localStorage.getItem('isAuthenticated')).toBeNull();
    expect(localStorage.getItem('userRole')).toBeNull();
  });

  it('resolves the role from the user_roles table, not from localStorage (Req 5.8)', async () => {
    // Cache claims admin, but the server says this user only has the "sales" role.
    localStorage.setItem('userRole', 'admin');
    rolesResult = { data: [{ role: 'sales' }], error: null };

    render(
      <ProtectedRoute allowedRoles={['admin']}>
        <Protected />
      </ProtectedRoute>
    );

    // sales is not in allowedRoles=['admin'] and is not admin -> denied.
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
    // The query was issued against user_roles for the validated user id.
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('does not apply a default/hardcoded role when the server returns no roles (Req 5.8)', async () => {
    rolesResult = { data: [], error: null };

    render(
      <ProtectedRoute allowedRoles={['admin']}>
        <Protected />
      </ProtectedRoute>
    );

    // No role resolved -> not authorized for an admin-gated route -> redirect.
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
  });
});

describe('ProtectedRoute sign-out / revocation handling (Req 5.5)', () => {
  it('redirects to /login when an auth-state SIGNED_OUT event fires', async () => {
    render(
      <ProtectedRoute allowedRoles={['admin']}>
        <Protected />
      </ProtectedRoute>
    );

    // Content renders for the confirmed session first.
    expect(await screen.findByText(PROTECTED_TEXT)).toBeInTheDocument();
    expect(authStateCallback).toBeTypeOf('function');

    // Simulate sign-out: the next guard evaluation must redirect, not render.
    await act(async () => {
      authStateCallback!('SIGNED_OUT', null);
    });

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    expect(localStorage.getItem('isAuthenticated')).toBeNull();
    expect(localStorage.getItem('userRole')).toBeNull();
  });

  it('redirects to /login when the session is revoked (null session, non-SIGNED_OUT event)', async () => {
    render(
      <ProtectedRoute allowedRoles={['admin']}>
        <Protected />
      </ProtectedRoute>
    );

    expect(await screen.findByText(PROTECTED_TEXT)).toBeInTheDocument();

    await act(async () => {
      authStateCallback!('TOKEN_REFRESHED', null);
    });

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
  });
});
