'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { auditActions, logAuditEvent } from '@/utils/auditLog';

/**
 * Map pathname to a friendly module/page name for audit logging.
 */
const PAGE_NAMES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/sales': 'Sales',
  '/operations': 'Operations',
  '/accounts': 'Accounts',
  '/hr': 'HR',
  '/office-admin': 'Office Admin',
  '/profile': 'Profile',
};

/**
 * Views shorter than this are treated as pass-through navigation rather than a
 * real visit, and their dwell time is not recorded. Without a floor, clicking
 * through a menu produces a run of 200 ms "visits" that say nothing about what
 * anyone was actually looking at.
 */
const MIN_MEANINGFUL_DWELL_MS = 1500;

/** Derive a display name from a pathname. */
function resolvePageName(pathname: string): string {
  return (
    PAGE_NAMES[pathname] ??
    pathname
      .replace(/^\//, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/**
 * Hook that logs page navigation to the audit trail.
 * Place this in PersistentLayout so it fires on every route change.
 *
 * Beyond recording that a page was opened, this measures how long the previous
 * page was held and attaches it to the outgoing entry. Duration is what turns a
 * list of page views into something readable: it distinguishes someone working
 * through a screen from someone clicking past it, and it is the difference
 * between "she opened Accounts 40 times" and "she spent 20 minutes in Accounts".
 */
export function usePageAudit() {
  const pathname = usePathname();
  const lastPathRef = useRef<string | null>(null);
  const enteredAtRef = useRef<number>(0);

  useEffect(() => {
    // Skip non-ERP pages (login, marketing)
    if (!pathname || pathname === '/login' || pathname === '/') return;

    // Skip if same page (prevent double-logging)
    if (lastPathRef.current === pathname) return;

    // Only log if user is authenticated
    const isAuth = typeof window !== 'undefined' && localStorage.getItem('isAuthenticated') === 'true';
    if (!isAuth) {
      // Still advance the marker so the first authenticated view is not attributed
      // a dwell time that began before sign-in.
      lastPathRef.current = pathname;
      enteredAtRef.current = Date.now();
      return;
    }

    const previousPath = lastPathRef.current;
    const dwellMs = previousPath && enteredAtRef.current > 0 ? Date.now() - enteredAtRef.current : 0;

    lastPathRef.current = pathname;
    enteredAtRef.current = Date.now();

    // Record how long the previous page was held, as its own entry attributed to
    // that page rather than to the one being navigated to.
    if (previousPath && dwellMs >= MIN_MEANINGFUL_DWELL_MS) {
      const previousName = resolvePageName(previousPath);
      void logAuditEvent({
        action: 'nav.page.view',
        target: previousName,
        module: previousName,
        route: previousPath,
        durationMs: dwellMs,
        details: {
          navigatedTo: pathname,
          dwellSeconds: Math.round(dwellMs / 1000),
        },
      });
      return;
    }

    // First view of the session, or a pass-through too short to time.
    void auditActions.pageViewed(resolvePageName(pathname));
  }, [pathname]);

  // Record the final page's dwell time when the tab is closed or backgrounded.
  // Without this the last page of every session has no duration, which is
  // frequently the page someone was on longest.
  useEffect(() => {
    const flushFinalDwell = () => {
      const currentPath = lastPathRef.current;
      if (!currentPath || enteredAtRef.current === 0) return;

      const dwellMs = Date.now() - enteredAtRef.current;
      if (dwellMs < MIN_MEANINGFUL_DWELL_MS) return;

      // Reset so a visibility change followed by a real unload does not double-count.
      enteredAtRef.current = Date.now();

      const name = resolvePageName(currentPath);
      void logAuditEvent({
        action: 'nav.page.view',
        target: name,
        module: name,
        route: currentPath,
        durationMs: dwellMs,
        details: { dwellSeconds: Math.round(dwellMs / 1000), endedBy: 'page-hidden' },
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushFinalDwell();
    };

    window.addEventListener('pagehide', flushFinalDwell);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flushFinalDwell);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
}
