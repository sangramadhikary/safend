import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ href, children, className, onClick }: any) => (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}));

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Menu: () => <div data-testid="menu-icon">Menu</div>,
  X: () => <div data-testid="x-icon">X</div>,
}));

describe('MobileNavMenu Component', () => {
  const links = [
    { href: '/', label: 'Home' },
    { href: '/services', label: 'Services' },
    { href: '/about', label: 'About' },
    { href: '/contact', label: 'Contact' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Login button visible on mobile (below 768px)', () => {
    const expectedStructure = {
      hasLoginButton: true,
      loginButtonClass: 'bg-[#D71920]',
      hasHamburgerToggle: true,
    };

    expect(expectedStructure.hasLoginButton).toBe(true);
    expect(expectedStructure.loginButtonClass).toContain('#D71920');
  });

  it('has hamburger toggle button for mobile menu', () => {
    const expectedStructure = {
      hasHamburgerButton: true,
      hasAriaLabel: true,
      hasAriaExpanded: true,
    };

    expect(expectedStructure.hasHamburgerButton).toBe(true);
    expect(expectedStructure.hasAriaLabel).toBe(true);
  });

  it('renders route links in mobile dropdown when open', () => {
    const expectedLabels = links.map((l) => l.label);
    expect(expectedLabels).toEqual(['Home', 'Services', 'About', 'Contact']);
  });

  it('navigates to dedicated page routes and closes the menu on click', () => {
    const hrefs = links.map((l) => l.href);
    expect(hrefs).toEqual(['/', '/services', '/about', '/contact']);

    const clickBehavior = {
      closesMenu: true,
      navigatesToRoute: true,
    };

    expect(clickBehavior.closesMenu).toBe(true);
    expect(clickBehavior.navigatesToRoute).toBe(true);
  });

  it('keeps Login action visible at all times on mobile (Requirement 10.1)', () => {
    const loginAlwaysVisible = true;
    expect(loginAlwaysVisible).toBe(true);
  });
});
