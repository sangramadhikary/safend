import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';

/**
 * Unit tests for the mock-admin removal in AppDataContext (Req 5.6, 5.8).
 *
 * The previous implementation seeded a hardcoded administrator user so that
 * any consumer of `useAppData()` received an `admin` role without an
 * authenticated session. These tests assert that the context now exposes
 * `user: null` and that no consumer receives a hardcoded `admin` role.
 */

// BranchContext is consumed inside useAppData; provide a controllable mock so
// the tests focus on the user/role behavior rather than branch wiring.
let branchThrows = false;
vi.mock('@/contexts/BranchContext', () => ({
  useBranch: () => {
    if (branchThrows) throw new Error('BranchContext not available');
    return {
      allBranches: [],
      currentBranch: null,
      setCurrentBranchById: () => {},
    };
  },
}));

import { AppDataProvider, useAppData } from '../AppDataContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppDataProvider>{children}</AppDataProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  branchThrows = false;
});

describe('AppDataContext mock-admin removal (Req 5.6, 5.8)', () => {
  it('exposes user as null (no hardcoded mock administrator)', () => {
    const { result } = renderHook(() => useAppData(), { wrapper });
    expect(result.current.user).toBeNull();
  });

  it('does not expose any object carrying a hardcoded "admin" role', () => {
    const { result } = renderHook(() => useAppData(), { wrapper });
    const user = result.current.user;
    // No user object at all, and certainly no role === 'admin'.
    expect(user).toBeNull();
    expect(user?.role).toBeUndefined();
  });

  it('still exposes user as null even when BranchContext is unavailable', () => {
    branchThrows = true;
    const { result } = renderHook(() => useAppData(), { wrapper });
    expect(result.current.user).toBeNull();
  });

  it('throws when used outside an AppDataProvider', () => {
    // Suppress the expected React error boundary console noise.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAppData())).toThrow(
      /useAppData must be used within an AppDataProvider/
    );
    spy.mockRestore();
  });

  it('a consuming component renders without receiving an admin role', () => {
    const Consumer = () => {
      const { user } = useAppData();
      return <div data-testid="role">{user?.role ?? 'no-role'}</div>;
    };

    render(
      <AppDataProvider>
        <Consumer />
      </AppDataProvider>
    );

    expect(screen.getByTestId('role')).toHaveTextContent('no-role');
  });
});
