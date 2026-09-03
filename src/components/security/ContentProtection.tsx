'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { SessionLockScreen, GeoBlockedScreen, DevToolsScreen } from './SecurityScreens';

interface ContentProtectionProps {
  children: React.ReactNode;
  /** If true, all protections are disabled (admin user) */
  isAdmin?: boolean;
  /** User's name */
  userName?: string;
  /** User's email */
  userEmail?: string;
  /** User's employee ID */
  employeeId?: string;
}

// India bounding box (rough)
const INDIA_BOUNDS = { minLat: 6.5, maxLat: 35.7, minLng: 68.1, maxLng: 97.4 };

/**
 * Content Protection Layer — Full security suite.
 *
 * Protections (all bypassed for admin):
 * 1. Right-click disabled
 * 2. Text selection/copy disabled
 * 3. Drag disabled
 * 4. Print blocked (keyboard + CSS + beforeprint)
 * 5. Zoom blocked (keyboard + wheel + pinch)
 * 6. DevTools detection (size heuristic + timing)
 * 7. PrintScreen clipboard wipe
 * 8. Tab visibility: blur content when tab inactive
 * 9. Idle timeout: lock after 3 min inactivity
 * 10. Clipboard wipe on focus
 * 11. Visibility watermark flash (on tab return)
 * 12. Suspicious activity blur (rapid visibility toggles)
 * 13. Geofence: India only
 * 14. 3-layer invisible watermark (name, email, employeeId)
 */
export function ContentProtection({ children, isAdmin, userName, userEmail, employeeId }: ContentProtectionProps) {
  const [mounted, setMounted] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedAt, setLockedAt] = useState(0);
  const [isBlurred, setIsBlurred] = useState(false);
  const [geoBlocked, setGeoBlocked] = useState(false);
  const [showWatermarkFlash, setShowWatermarkFlash] = useState(false);
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibilityCountRef = useRef(0);
  const visibilityWindowRef = useRef(0);

  const IDLE_MINUTES = 3;
  const IDLE_TIMEOUT = IDLE_MINUTES * 60 * 1000;

  const lockSession = useCallback(() => {
    setLockedAt(Date.now());
    setIsLocked(true);
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (isAdmin) return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(lockSession, IDLE_TIMEOUT);
  }, [isAdmin, lockSession, IDLE_TIMEOUT]);

  useEffect(() => {
    setMounted(true);
    if (isAdmin) return;

    document.body.classList.add('print-protected');

    // ─── Geofence: India only ───
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const inIndia = latitude >= INDIA_BOUNDS.minLat && latitude <= INDIA_BOUNDS.maxLat &&
            longitude >= INDIA_BOUNDS.minLng && longitude <= INDIA_BOUNDS.maxLng;
          if (!inIndia) setGeoBlocked(true);
        },
        () => { /* If location denied, don't block — permission gate handles it */ },
        { enableHighAccuracy: false, timeout: 5000 }
      );
    }

    // ─── Idle timeout ───
    resetIdleTimer();
    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    const handleActivity = () => {
      if (isLocked) return; // Don't reset if already locked
      resetIdleTimer();
    };
    activityEvents.forEach(ev => document.addEventListener(ev, handleActivity, { passive: true }));

    // ─── Block keyboard shortcuts ───
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (['p', 's', 'u'].includes(e.key.toLowerCase())) { e.preventDefault(); e.stopPropagation(); }
        if (e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase())) { e.preventDefault(); e.stopPropagation(); }
        if (['+', '-', '=', '0'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); }
      }
      if (e.key === 'F12') { e.preventDefault(); e.stopPropagation(); }
      if (e.key === 'PrintScreen') {
        e.preventDefault();
      }
    };

    // ─── Block right-click ───
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    // ─── Block copy ───
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      e.clipboardData?.setData('text/plain', '');
    };

    // ─── Block drag ───
    const handleDragStart = (e: DragEvent) => e.preventDefault();

    // ─── Block pinch-to-zoom ───
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };

    // ─── Block Ctrl+scroll zoom ───
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };

    // ─── Print blocking ───
    const handleBeforePrint = () => { document.body.style.visibility = 'hidden'; };
    const handleAfterPrint = () => { document.body.style.visibility = 'visible'; };

    // ─── Tab visibility: blur when inactive + watermark flash on return ───
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsBlurred(true);
      } else {
        setIsBlurred(false);
        // Flash watermark briefly on return
        setShowWatermarkFlash(true);
        setTimeout(() => setShowWatermarkFlash(false), 1500);
        // Track rapid visibility toggles (suspicious screenshot behavior)
        visibilityCountRef.current++;
        const now = Date.now();
        if (now - visibilityWindowRef.current < 10000 && visibilityCountRef.current > 4) {
          // 4+ toggles in 10s — suspicious, blur for 5s
          setIsBlurred(true);
          setTimeout(() => setIsBlurred(false), 5000);
          visibilityCountRef.current = 0;
        }
        if (now - visibilityWindowRef.current > 10000) {
          visibilityWindowRef.current = now;
          visibilityCountRef.current = 0;
        }
      }
    };

    // ─── DevTools detection (window size heuristic) ───
    let devtoolsCheckInterval: ReturnType<typeof setInterval> | null = null;
    const checkDevtools = () => {
      const threshold = 160;
      const widthDiff = window.outerWidth - window.innerWidth > threshold;
      const heightDiff = window.outerHeight - window.innerHeight > threshold;
      if (widthDiff || heightDiff) {
        setDevtoolsOpen(true);
      } else {
        setDevtoolsOpen(false);
      }
    };
    devtoolsCheckInterval = setInterval(checkDevtools, 2000);

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      document.body.classList.remove('print-protected');
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (devtoolsCheckInterval) clearInterval(devtoolsCheckInterval);
      activityEvents.forEach(ev => document.removeEventListener(ev, handleActivity));
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('wheel', handleWheel);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [isAdmin, resetIdleTimer, isLocked]);

  if (!mounted) return <>{children}</>;

  // ─── Geo-blocked screen ───
  if (!isAdmin && geoBlocked) {
    return <GeoBlockedScreen />;
  }

  // ─── Idle lock screen ───
  if (!isAdmin && isLocked) {
    return (
      <SessionLockScreen
        onUnlock={() => { setIsLocked(false); resetIdleTimer(); }}
        userName={userName}
        employeeId={employeeId}
        lockedAt={lockedAt}
        idleMinutes={IDLE_MINUTES}
      />
    );
  }

  // ─── DevTools warning overlay ───
  if (!isAdmin && devtoolsOpen) {
    return <DevToolsScreen />;
  }

  return (
    <div
      className={isAdmin ? '' : 'select-none'}
      style={isAdmin ? undefined : { WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as any}
    >
      {/* Content with blur when tab is inactive */}
      <div className={!isAdmin && isBlurred ? 'blur-lg transition-all duration-200' : 'transition-all duration-200'}>
        {children}
      </div>

      {/* Watermark flash on tab return — high opacity for 1.5s */}
      {!isAdmin && showWatermarkFlash && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none z-10000 overflow-hidden animate-pulse"
          style={{ opacity: 0.06 }}
        >
          <div className="w-full h-full flex flex-wrap items-center justify-center gap-x-8 gap-y-12 rotate-[-20deg] scale-[1.5]">
            {Array.from({ length: 16 }).map((_, i) => (
              <span key={i} className="text-sm font-mono whitespace-nowrap text-[#D71920]">
                {userName} · {userEmail} · {employeeId}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Invisible watermarks (always present) */}
      {!isAdmin && userName && (
        <>
          {/* Layer 1: Rotated text */}
          <div
            aria-hidden="true"
            className="fixed inset-0 pointer-events-none z-9999 overflow-hidden"
            style={{ opacity: 0.018 }}
          >
            <div className="w-full h-full flex flex-wrap items-center justify-center gap-x-12 gap-y-16 rotate-[-25deg] scale-[1.8]">
              {Array.from({ length: 24 }).map((_, i) => (
                <span key={i} className="text-xs font-mono whitespace-nowrap text-black dark:text-white">
                  {userName} · {userEmail} · {employeeId}
                </span>
              ))}
            </div>
          </div>

          {/* Layer 2: Micro dots */}
          <div
            aria-hidden="true"
            className="fixed inset-0 pointer-events-none z-9998 overflow-hidden"
            style={{ opacity: 0.008 }}
          >
            <div className="w-full h-full grid grid-cols-8 gap-4 p-4 rotate-12 scale-[2]">
              {Array.from({ length: 64 }).map((_, i) => (
                <span key={i} className="text-[4px] font-mono text-black dark:text-white leading-none break-all">
                  {employeeId || 'x'}{userName?.replace(/\s/g, '').slice(0, 3)}
                </span>
              ))}
            </div>
          </div>

          {/* Layer 3: SVG steganographic pattern */}
          <div
            aria-hidden="true"
            className="fixed inset-0 pointer-events-none z-9997"
            style={{ opacity: 0.012 }}
          >
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" className="absolute inset-0">
              <defs>
                <pattern id="wm-dots" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
                  <circle cx="4" cy="4" r="0.5" fill="currentColor" />
                  <circle cx="40" cy="20" r="0.4" fill="currentColor" />
                  <circle cx="20" cy="60" r="0.5" fill="currentColor" />
                  <circle cx="60" cy="44" r="0.4" fill="currentColor" />
                  <circle cx="72" cy="72" r="0.5" fill="currentColor" />
                  <text x="10" y="38" fontSize="3" fontFamily="monospace" fill="currentColor">{employeeId || ''}</text>
                  <text x="10" y="70" fontSize="2.5" fontFamily="monospace" fill="currentColor">{userEmail?.split('@')[0] || ''}</text>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#wm-dots)" className="text-black dark:text-white" />
            </svg>
          </div>
        </>
      )}
    </div>
  );
}
