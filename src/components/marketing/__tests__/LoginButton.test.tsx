import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginButton } from '../LoginButton';

// Mock next/navigation's useRouter so we can control push behavior.
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe('LoginButton Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Login label with Brand_Color #D71920', () => {
    render(<LoginButton />);
    const button = screen.getByRole('button', { name: 'Login' });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain('bg-[#D71920]');
  });

  it('navigates to /login when a dropdown option is activated (Requirement 4.2)', async () => {
    pushMock.mockResolvedValueOnce(undefined);
    render(<LoginButton />);

    // Click a dropdown login option (e.g., "Client Login")
    fireEvent.click(screen.getByRole('button', { name: 'Client Login' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
    // No error indication on successful navigation.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error indication when navigation fails (Requirement 4.4)', async () => {
    pushMock.mockRejectedValueOnce(new Error('router failure'));
    render(<LoginButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Client Login' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/login screen could not be opened/i);
    expect(pushMock).toHaveBeenCalledWith('/login');
  });

  it('clears a previous error when retried successfully', async () => {
    pushMock.mockRejectedValueOnce(new Error('router failure'));
    render(<LoginButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Client Login' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    pushMock.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Employee Login' }));

    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    );
  });
});
