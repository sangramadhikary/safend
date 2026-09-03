'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { NavAuthButton, NavAuthButtonMobile } from './NavAuthButton';

gsap.registerPlugin(ScrollTrigger, useGSAP);

export const NAV_LINKS = [
  { href: '/services', label: 'Services' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

/**
 * Island/collapsible floating navigation bar.
 * - Rounded pill shape with padding, floating with margin from edges
 * - Glassmorphism background (increases opacity on scroll)
 * - Collapses on scroll down, expands back on scroll up
 * - Desktop: links left, logo center, phone + sign in right
 * - Mobile: full-screen overlay with stacked links
 */
export function NavigationBar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const islandRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // Entry reveal
      gsap.from(islandRef.current, {
        y: -20,
        opacity: 0,
        scale: 0.95,
        duration: 0.6,
        ease: 'power3.out',
        delay: 0.1,
      });

      // Collapse on scroll down, expand on scroll up — but only after the
      // user has moved at least 50px in one direction, so small scroll
      // jitter no longer flips the nav.
      const THRESHOLD = 50;
      let prevScroll = 0;
      let anchor = 0; // scroll position where the current direction began
      let dir = 0; // -1 = up, 1 = down
      let hidden = false;

      ScrollTrigger.create({
        start: 0,
        end: 'max',
        onUpdate: (self) => {
          const cur = self.scroll();
          const delta = cur - prevScroll;
          prevScroll = cur;
          if (delta === 0) return;

          // Reset the accumulation anchor whenever direction changes so the
          // 50px threshold is measured from the turning point.
          const newDir = delta > 0 ? 1 : -1;
          if (newDir !== dir) {
            dir = newDir;
            anchor = cur;
          }

          // Always keep the nav visible near the very top of the page.
          if (cur <= THRESHOLD) {
            if (hidden) {
              hidden = false;
              gsap.to(islandRef.current, {
                yPercent: 0,
                duration: 0.35,
                ease: 'power2.out',
              });
            }
            return;
          }

          if (dir === 1 && !hidden && cur - anchor > THRESHOLD) {
            // Scrolled down 50px+ — hide nav
            hidden = true;
            gsap.to(islandRef.current, {
              yPercent: -120,
              duration: 0.35,
              ease: 'power2.out',
            });
          } else if (dir === -1 && hidden && anchor - cur > THRESHOLD) {
            // Scrolled up 50px+ — show nav
            hidden = false;
            gsap.to(islandRef.current, {
              yPercent: 0,
              duration: 0.35,
              ease: 'power2.out',
            });
          }
        },
      });

      // #6: Increase opacity after scrolling past the fold
      ScrollTrigger.create({
        start: 'top -100',
        end: 'max',
        onEnter: () => {
          if (islandRef.current) {
            islandRef.current.classList.add('nav-scrolled');
          }
        },
        onLeaveBack: () => {
          if (islandRef.current) {
            islandRef.current.classList.remove('nav-scrolled');
          }
        },
      });

      // Auto-collapse after 1s of inactivity (no scroll, mouse movement, or touch).
      // Re-shows on any interaction, then hides again after 1s idle.
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let idleHidden = false;

      const hideNav = () => {
        // Only auto-hide if we're past the top fold and not already hidden by scroll logic
        if (prevScroll > THRESHOLD && !hidden && !idleHidden) {
          idleHidden = true;
          gsap.to(islandRef.current, {
            yPercent: -120,
            duration: 0.4,
            ease: 'power2.out',
          });
        }
      };

      const showNavFromIdle = () => {
        if (idleHidden) {
          idleHidden = false;
          gsap.to(islandRef.current, {
            yPercent: 0,
            duration: 0.3,
            ease: 'power2.out',
          });
        }
      };

      const resetIdleTimer = () => {
        showNavFromIdle();
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(hideNav, 1000);
      };

      // Start the timer immediately
      idleTimer = setTimeout(hideNav, 1000);

      // Listen for user activity
      window.addEventListener('scroll', resetIdleTimer, { passive: true });
      window.addEventListener('mousemove', resetIdleTimer, { passive: true });
      window.addEventListener('touchstart', resetIdleTimer, { passive: true });

      // Also show nav when hovering directly over the header area (top ~80px)
      const headerEl = headerRef.current;
      const handleHeaderEnter = () => {
        showNavFromIdle();
        if (idleTimer) clearTimeout(idleTimer);
      };
      const handleHeaderLeave = () => {
        idleTimer = setTimeout(hideNav, 1000);
      };
      if (headerEl) {
        headerEl.addEventListener('mouseenter', handleHeaderEnter);
        headerEl.addEventListener('mouseleave', handleHeaderLeave);
      }

      // Cleanup
      return () => {
        if (idleTimer) clearTimeout(idleTimer);
        window.removeEventListener('scroll', resetIdleTimer);
        window.removeEventListener('mousemove', resetIdleTimer);
        window.removeEventListener('touchstart', resetIdleTimer);
        if (headerEl) {
          headerEl.removeEventListener('mouseenter', handleHeaderEnter);
          headerEl.removeEventListener('mouseleave', handleHeaderLeave);
        }
      };
    },
    { scope: headerRef }
  );

  return (
    <>
      {/* ─── Floating Island Header ─── */}
      <header ref={headerRef} className="fixed top-0 left-0 right-0 z-100 pointer-events-none">
        <div className="max-w-editorial mx-auto px-4 sm:px-6 lg:px-10">
          <div
            ref={islandRef}
            className="pointer-events-auto relative mx-auto max-w-5xl rounded-b-2xl bg-white/60 backdrop-blur-2xl border border-t-0 border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.7)] px-5 sm:px-7 h-[76px] flex items-center justify-between transition-[background-color,box-shadow] duration-300 [&.nav-scrolled]:bg-white/90 [&.nav-scrolled]:shadow-[0_8px_40px_rgba(0,0,0,0.12)]"
          >
            {/* Left — Nav links (desktop) with stronger active state (#2) */}
            <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
              {NAV_LINKS.map((link) => {
                const isActive =
                  link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`relative text-[13px] font-heading font-medium tracking-[-0.01em] px-4 py-2 rounded-full transition-all duration-300 ${
                      isActive
                        ? 'text-safend-red bg-safend-red/10 font-semibold'
                        : 'text-safend-ink/60 hover:text-safend-ink hover:bg-safend-ink/5'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            {/* Center — Logo (#3: slightly larger with subtle ring) */}
            <Link href="/" className="absolute left-1/2 -translate-x-1/2 flex items-center">
              <img
                src="/logo.png"
                alt="Safend"
                className="h-14 w-auto object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
              />
            </Link>

            {/* Right — Sign in (desktop) */}
            <div className="hidden md:flex items-center">
              <NavAuthButton />
            </div>

            {/* Mobile — Hamburger (#5: larger tap target, 44x44) */}
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden w-11 h-11 flex flex-col items-center justify-center gap-[5px] -mr-2 rounded-full hover:bg-safend-ink/5 active:bg-safend-ink/10 transition-colors"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              <span className={`block h-[2px] w-5 bg-safend-ink transition-all duration-300 ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
              <span className={`block h-[2px] w-5 bg-safend-ink transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`block h-[2px] w-5 bg-safend-ink transition-all duration-300 ${menuOpen ? '-rotate-45 translate-y-[-7px]' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* ─── Mobile Full-Screen Menu ─── */}
      {menuOpen && (
        <div className="fixed inset-0 z-110 bg-safend-canvas md:hidden flex flex-col">
          {/* Top — Logo + Close */}
          <div className="flex items-center justify-between px-6 h-[64px] shrink-0">
            <Link href="/" onClick={() => setMenuOpen(false)}>
              <img src="/logo.png" alt="Safend" className="h-8 w-auto object-contain" />
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-safend-ink/5"
              aria-label="Close menu"
            >
              <X className="w-5 h-5 text-safend-ink" />
            </button>
          </div>

          {/* Links — stacked with dividers */}
          <nav className="flex-1 flex flex-col px-6 pt-4">
            {NAV_LINKS.map((link, i) => {
              const isActive =
                link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
              return (
                <div key={link.href}>
                  {i > 0 && <div className="h-px bg-safend-mist" />}
                  <Link
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`block py-5 text-[16px] font-body transition-colors ${
                      isActive ? 'text-safend-red font-medium' : 'text-safend-ink'
                    }`}
                  >
                    {link.label}
                  </Link>
                </div>
              );
            })}
          </nav>

          {/* Bottom — Sign in */}
          <div className="px-6 pb-8 pt-4 border-t border-safend-mist">
            <NavAuthButtonMobile onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
