import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock GSAP and ScrollTrigger before importing the component to prevent
// module-level gsap.registerPlugin(ScrollTrigger) from calling matchMedia in jsdom.
vi.mock('gsap', () => ({
  gsap: { registerPlugin: vi.fn(), to: vi.fn(), fromTo: vi.fn(), set: vi.fn() },
}));
vi.mock('gsap/ScrollTrigger', () => ({
  ScrollTrigger: { enable: vi.fn(), refresh: vi.fn() },
}));
vi.mock('@gsap/react', () => ({
  useGSAP: vi.fn(),
}));

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ href, children, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

// Mock child components
vi.mock('../MobileNavMenu', () => ({
  MobileNavMenu: () => <div data-testid="mobile-nav-menu">Mobile Menu</div>,
}));

vi.mock('../NavLinks', () => ({
  NavLinks: ({ links }: any) => (
    <div data-testid="nav-links">
      {links.map((l: any) => (
        <a key={l.href} href={l.href}>
          {l.label}
        </a>
      ))}
    </div>
  ),
}));

// Import AFTER mocks are registered
import { NAV_LINKS } from '../NavigationBar';

describe('NavigationBar Navigation Model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes route links for Services, Pricing, About, and Contact', () => {
    const labels = NAV_LINKS.map((l) => l.label);
    expect(labels).toEqual(['Services', 'Pricing', 'About', 'Contact']);
  });

  it('links to dedicated page routes (not anchors)', () => {
    const hrefs = NAV_LINKS.map((l) => l.href);
    expect(hrefs).toEqual(['/services', '/pricing', '/about', '/contact']);
    // Ensure no anchor-style links remain
    expect(hrefs.some((h) => h.startsWith('#'))).toBe(false);
  });
});
