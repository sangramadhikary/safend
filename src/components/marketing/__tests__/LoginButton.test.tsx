import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginButton } from '../LoginButton';

// The LoginButton calls `window.location.href = href` for navigation.
// In jsdom, assigning location.href triggers an unimplemented navigation
// error, so we replace `window.location` with a mock for these tests.

const originalLocation = window.location;

beforeEach(() => {
  // @ts-expect-error — jsdom allows deleting location for test overrides
  delete (window as any).location;
  window.location = { ...originalLocation, href: '' } as Location;
});

afterEach(() => {
  window.location = originalLocation;
  vi.restoreAllMocks();
});

// Mock getPortalUrl so we get predictable hrefs without env dependencies.
vi.mock('@/lib/portalUrls', () => ({
  getPortalUrl: (_portal: string, path: string) => path,
}));

describe('LoginButton Component', () => {
  it('renders the Login label with Brand_Color #D71920', () => {
    render(<LoginButton />);
    const button = screen.getByRole('button', { name: 'Login' });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain('bg-[#D71920]');
  });

  it('navigates to /login when a dropdown option is activated (Requirement 4.2)', () => {
    render(<LoginButton />);

    // Click a dropdown login option (e.g., "Client Login")
    fireEvent.click(screen.getByRole('button', { name: 'Client Login' }));

    // The component sets window.location.href to the portal URL
    expect(window.location.href).toBe('/login');
  });

  it('shows an error indication when navigation fails (Requirement 4.4)', async () => {
    // Make the location.href setter throw to simulate a navigation failure.
    Object.defineProperty(window, 'location', {
      value: {
        ...originalLocation,
        get href() { return ''; },
        set href(_v: string) { throw new Error('navigation blocked'); },
      },
      configurable: true,
      writable: true,
    });

    render(<LoginButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Client Login' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/login screen could not be opened/i);
  });

  it('clears a previous error when retried successfully', async () => {
    // First: make navigation fail.
    let shouldThrow = true;
    Object.defineProperty(window, 'location', {
      value: new Proxy(
        { ...originalLocation, href: '' },
        {
          set(target, prop, value) {
            if (prop === 'href' && shouldThrow) throw new Error('navigation blocked');
            return Reflect.set(target, prop, value);
          },
        },
      ),
      configurable: true,
      writable: true,
    });

    render(<LoginButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Client Login' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    // Second: allow navigation.
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Employee Login' }));

    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    );
  });
});
