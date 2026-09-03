import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServiceSection from '../ServiceSection';
import { SERVICES } from '@/data/services';

// Mock the lucide-react icons used by the service data
vi.mock('lucide-react', () => ({
  Shield: ({ className }: { className?: string }) => (
    <div data-testid="icon-shield" className={className} />
  ),
  ShieldAlert: ({ className }: { className?: string }) => (
    <div data-testid="icon-shieldalert" className={className} />
  ),
  UserCheck: ({ className }: { className?: string }) => (
    <div data-testid="icon-usercheck" className={className} />
  ),
  Users: ({ className }: { className?: string }) => (
    <div data-testid="icon-users" className={className} />
  ),
  PawPrint: ({ className }: { className?: string }) => (
    <div data-testid="icon-pawprint" className={className} />
  ),
  Camera: ({ className }: { className?: string }) => (
    <div data-testid="icon-camera" className={className} />
  ),
  ArrowDown: ({ className }: { className?: string }) => (
    <div data-testid="icon-arrowdown" className={className} />
  ),
}));

// Mock framer-motion to render static elements
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      className,
      ...props
    }: React.PropsWithChildren<{ className?: string }>) => (
      <div className={className}>{children}</div>
    ),
  },
  useReducedMotion: () => false,
}));

// Mock GlassCard
vi.mock('../GlassCard', () => ({
  GlassCard: ({
    children,
    className,
  }: React.PropsWithChildren<{ className?: string }>) => (
    <div className={className} data-testid="glass-card">
      {children}
    </div>
  ),
}));

// Mock MeshBackground
vi.mock('../MeshBackground', () => ({
  MeshBackground: () => <div data-testid="mesh-background" />,
}));

describe('ServiceSection', () => {
  it('renders the section with correct id for anchor linking', () => {
    const { container } = render(<ServiceSection />);
    const section = container.querySelector('#services');
    expect(section).toBeInTheDocument();
    expect(section?.tagName).toBe('SECTION');
  });

  it('renders the section heading', () => {
    render(<ServiceSection />);
    expect(screen.getByText('Our Services')).toBeInTheDocument();
  });

  it('renders the introductory description', () => {
    render(<ServiceSection />);
    expect(
      screen.getByText(/you need a company you can\s+trust/i)
    ).toBeInTheDocument();
  });

  it('renders all valid services from SERVICES data', () => {
    render(<ServiceSection />);

    SERVICES.forEach((service) => {
      expect(screen.getByText(service.name)).toBeInTheDocument();
    });
  });

  it('renders service names between 1-60 characters', () => {
    render(<ServiceSection />);

    SERVICES.forEach((service) => {
      expect(service.name.length).toBeGreaterThanOrEqual(1);
      expect(service.name.length).toBeLessThanOrEqual(60);
      expect(screen.getByText(service.name)).toBeInTheDocument();
    });
  });

  it('renders service descriptions between 1-500 characters', () => {
    render(<ServiceSection />);

    SERVICES.forEach((service) => {
      expect(service.description.length).toBeGreaterThanOrEqual(1);
      expect(service.description.length).toBeLessThanOrEqual(500);
    });
  });

  it('renders icons for services when icon property exists', () => {
    render(<ServiceSection />);

    expect(screen.getByTestId('icon-shield')).toBeInTheDocument();
    expect(screen.getByTestId('icon-shieldalert')).toBeInTheDocument();
  });

  it('applies correct styling classes', () => {
    const { container } = render(<ServiceSection />);
    const section = container.querySelector('#services');

    expect(section?.className).toMatch(/py-20/);
    expect(section?.className).toMatch(/px-4/);
  });

  it('renders in a responsive grid layout', () => {
    const { container } = render(<ServiceSection />);
    const grid = container.querySelector('.grid.grid-cols-1');

    expect(grid).toBeInTheDocument();
    expect(grid?.className).toMatch(/grid-cols-1/);
    expect(grid?.className).toMatch(/sm:grid-cols-2/);
    expect(grid?.className).toMatch(/lg:grid-cols-3/);
  });
});
