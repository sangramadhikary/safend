'use client';

import { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, LogOut, ChevronDown } from 'lucide-react';
import { getPortalUrl, getDashboardUrlForRole } from '@/lib/portalUrls';
import { cleanupAuthState } from '@/utils/authCleanup';
import { supabaseClient } from '@/integrations/supabase/client';

function getRedirectForRole(role: string | null): string {
  return getDashboardUrlForRole(role);
}

/**
 * Session-aware navigation auth button.
 * - Not authenticated: "Sign in" button with a minimal 3-link dropdown on hover
 * - Authenticated: Shows user name with dropdown (Dashboard + Logout)
 */
export function NavAuthButton() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const auth = localStorage.getItem('isAuthenticated');
    const name = localStorage.getItem('userName');
    const role = localStorage.getItem('userRole');
    if (auth === 'true') {
      setIsAuthenticated(true);
      setUserName(name);
      setUserRole(role);
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  const handleLogout = async () => {
    // Release the device slot first — needs the JWT that signOut() destroys.
    try {
      const { releaseSession } = await import('@/utils/sessionManager');
      await releaseSession();
    } catch { /* ignore */ }
    try {
      await supabaseClient.auth.signOut();
    } catch { /* ignore */ }
    // Clear the HttpOnly session cookie so middleware doesn't redirect back
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch { /* ignore */ }
    cleanupAuthState();
    window.location.href = '/';
  };

  if (!mounted) {
    return (
      <div className="inline-flex items-center rounded-full bg-safend-red px-5 py-2 text-[13px] font-heading font-semibold text-white opacity-0">
        Sign in
      </div>
    );
  }

  // ─── Authenticated State ───────────────────────────────────────────────────
  if (isAuthenticated) {
    const dashboardPath = getRedirectForRole(userRole);
    let displayName = userName?.split(' ')[0] || 'Dashboard';
    if (displayName.includes('@')) displayName = displayName.split('@')[0];
    displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

    return (
      <div ref={dropdownRef} className="relative inline-flex flex-col items-stretch">
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="inline-flex items-center gap-2 rounded-full bg-safend-red px-5 py-2 text-[13px] font-heading font-semibold text-white transition-all duration-300 hover:bg-[#b8151b] hover:-translate-y-px"
          style={{ boxShadow: 'rgba(215,25,32,0.25) 0 3px 10px 0px' }}
        >
          <LayoutDashboard className="h-3.5 w-3.5" />
          {displayName}
          <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {dropdownOpen && (
          <div className="absolute top-full right-0 pt-2 z-50 animate-fade-in">
            <div className="rounded-md border border-gray-200 bg-white shadow-md overflow-hidden min-w-[160px]">
              <a
                href={dashboardPath}
                className="flex items-center gap-2.5 w-full text-left px-4 py-[10px] text-[12px] font-medium tracking-wide text-gray-800 border-b border-gray-100 hover:bg-safend-red hover:text-white transition-colors duration-100"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                Dashboard
              </a>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2.5 w-full text-left px-4 py-[10px] text-[12px] font-medium tracking-wide text-gray-800 hover:bg-safend-red hover:text-white transition-colors duration-100"
              >
                <LogOut className="h-3.5 w-3.5" />
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Not Authenticated — Compact dropdown ──────────────────────────────────
  return (
    <div className="relative inline-flex flex-col items-stretch group">
      <button
        type="button"
        className="inline-flex items-center rounded-full bg-safend-red px-5 py-2 text-[13px] font-heading font-semibold text-white transition-all duration-300 hover:bg-[#b8151b] hover:-translate-y-px cursor-pointer"
        style={{ boxShadow: 'rgba(215,25,32,0.25) 0 3px 10px 0px' }}
      >
        Sign in
      </button>

      {/* Bank-style dropdown — segmented, tight, professional */}
      <div className="absolute top-full right-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
        <div className="rounded-md border border-gray-200 bg-white shadow-md overflow-hidden min-w-[148px]">
          <a
            href={getPortalUrl('client', '/login')}
            className="block w-full text-left px-4 py-[9px] text-[12px] font-medium tracking-wide text-gray-800 border-b border-gray-100 hover:bg-[#D71920] hover:text-white transition-colors duration-100"
          >
            Client Login
          </a>
          <a
            href={getPortalUrl('ops', '/login')}
            className="block w-full text-left px-4 py-[9px] text-[12px] font-medium tracking-wide text-gray-800 border-b border-gray-100 hover:bg-[#D71920] hover:text-white transition-colors duration-100"
          >
            Supervisor Login
          </a>
          <a
            href={getPortalUrl('office', '/login')}
            className="block w-full text-left px-4 py-[9px] text-[12px] font-medium tracking-wide text-gray-800 hover:bg-[#D71920] hover:text-white transition-colors duration-100"
          >
            Office Login
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Mobile version — inline links, no dropdown.
 */
export function NavAuthButtonMobile({ onNavigate }: { onNavigate?: () => void }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const auth = localStorage.getItem('isAuthenticated');
    const name = localStorage.getItem('userName');
    const role = localStorage.getItem('userRole');
    if (auth === 'true') {
      setIsAuthenticated(true);
      setUserName(name);
      setUserRole(role);
    }
  }, []);

  const handleLogout = async () => {
    // Release the device slot first — needs the JWT that signOut() destroys.
    try {
      const { releaseSession } = await import('@/utils/sessionManager');
      await releaseSession();
    } catch { /* ignore */ }
    try {
      await supabaseClient.auth.signOut();
    } catch { /* ignore */ }
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch { /* ignore */ }
    cleanupAuthState();
    onNavigate?.();
    window.location.href = '/';
  };

  if (!mounted) return null;

  if (isAuthenticated) {
    const dashboardPath = getRedirectForRole(userRole);
    let displayName = userName?.split(' ')[0] || 'Dashboard';
    if (displayName.includes('@')) displayName = displayName.split('@')[0];
    displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
    return (
      <div className="flex items-center justify-between">
        <a
          href={dashboardPath}
          onClick={onNavigate}
          className="inline-flex items-center gap-2 text-[14px] font-body font-medium text-safend-red"
        >
          <LayoutDashboard className="h-4 w-4" />
          {displayName} →
        </a>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-1.5 text-[13px] font-body text-safend-muted hover:text-safend-red transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Logout
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <a href={getPortalUrl('client', '/login')} onClick={onNavigate} className="text-[14px] font-body text-safend-ink/70 hover:text-safend-red transition-colors">Client</a>
      <span className="text-safend-ink/20">·</span>
      <a href={getPortalUrl('ops', '/login')} onClick={onNavigate} className="text-[14px] font-body text-safend-ink/70 hover:text-safend-red transition-colors">Supervisor</a>
      <span className="text-safend-ink/20">·</span>
      <a href={getPortalUrl('office', '/login')} onClick={onNavigate} className="text-[14px] font-body text-safend-ink/70 hover:text-safend-red transition-colors">Office</a>
    </div>
  );
}
