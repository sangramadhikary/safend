'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut,
  LayoutDashboard, Clock, Users, CalendarDays,
  Shield, MapPin, FileText, MoreHorizontal, Utensils,
} from 'lucide-react';
import { useSupervisorProfile } from '../hooks/useSupervisorData';
import { cn } from '@/lib/utils';
import { clearPersistedQueryCache } from '@/lib/queryCache';

const LOGO_URL = "https://static.wixstatic.com/media/5b3fdf_0d52b265a0004375a797c038ad88f65e~mv2.png/v1/fill/w_278,h_172,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Logo_edited_edited.png";

// Bottom nav (mobile) — 4 main + More
const BOTTOM_NAV = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'posts', label: 'Posts', icon: MapPin },
  { id: 'attendance', label: 'Attend', icon: Clock },
  { id: 'deployments', label: 'Deploy', icon: Users },
];

// Items accessible via "More" menu on mobile
const MORE_NAV = [
  { id: 'patrols', label: 'Patrols', icon: Shield },
  { id: 'mess', label: 'Mess Meals', icon: Utensils },
  { id: 'leaves', label: 'Leaves', icon: CalendarDays },
  { id: 'reports', label: 'Reports', icon: FileText },
];

const PRIMARY_NAV = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'posts', label: 'Posts', icon: MapPin },
  { id: 'attendance', label: 'Attendance', icon: Clock },
  { id: 'deployments', label: 'Deploy', icon: Users },
  { id: 'patrols', label: 'Patrols', icon: Shield },
];

const SECONDARY_NAV = [
  { id: 'mess', label: 'Mess Meals', icon: Utensils },
  { id: 'leaves', label: 'Leaves', icon: CalendarDays },
  { id: 'reports', label: 'Reports', icon: FileText },
];

export const navItems = [...PRIMARY_NAV, ...SECONDARY_NAV];

interface SupervisorLayoutProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
}

function haptic(style: 'light' | 'medium' | 'heavy' = 'light') {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    switch (style) {
      case 'light': navigator.vibrate(8); break;
      case 'medium': navigator.vibrate(15); break;
      case 'heavy': navigator.vibrate([10, 30, 10]); break;
    }
  }
}

export function SupervisorLayout({ activeTab, onTabChange, children }: SupervisorLayoutProps) {
  const router = useRouter();
  const { data: profile } = useSupervisorProfile();
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Close "More" menu when tab changes externally
  useEffect(() => {
    setShowMoreMenu(false);
  }, [activeTab]);

  const handleLogout = async () => {
    haptic('medium');
    // Release the device slot first — the delete is authorized by the current
    // JWT, so it must happen before signOut(). Supervisors are capped at one
    // device, so a leaked row locks them out of their next login entirely.
    try {
      const { releaseSession } = await import('@/utils/sessionManager');
      await releaseSession();
    } catch { /* non-critical — the stale-session TTL reclaims the slot */ }
    try {
      const client = getSupabaseClient();
      await client.auth.signOut();
      clearPersistedQueryCache();
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('userName');
      localStorage.removeItem('userRole');
      localStorage.removeItem('session_token');
      localStorage.removeItem('userId');
      router.push('/login');
    } catch {
      router.push('/login');
    }
  };

  const handleTabChange = (id: string) => {
    haptic('medium');
    onTabChange(id);
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white dark:bg-[#0B0F19] text-black dark:text-[#E0E0E0]">
      {/* ─── Desktop Sidebar (matches ERP Sidebar style) ─── */}
      <aside className="hidden lg:flex lg:flex-col w-60 border-r border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-[#0B0F19]/80 backdrop-blur-lg shrink-0 fixed inset-y-0 left-0 z-30">
        {/* Logo header — same as ERP topbar */}
        <div className="h-16 flex items-center px-5 border-b border-gray-100 dark:border-gray-800">
          <img src={LOGO_URL} alt="Safend" className="w-7 h-7 object-contain" />
          <span className="ml-2 font-semibold text-base">Safend</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-[#D71920] text-white shadow-xs'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 active:scale-[0.97]'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer — matches ERP sidebar user card */}
        <div className="border-t border-gray-100 dark:border-gray-800 p-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-200 flex items-center justify-center text-xs font-medium shrink-0">
              {profile?.name ? profile.name.split(' ').map(w => w.charAt(0)).join('').toUpperCase().slice(0, 2) : 'S'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{profile?.name || 'Supervisor'}</p>
              <p className="text-xs text-muted-foreground truncate">{profile?.designation || 'Area Officer'}</p>
            </div>
            <button
              onClick={handleLogout}
              aria-label="Log out"
              className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/20 text-gray-400 hover:text-red-600 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Mobile/Tablet Top Bar (matches ERP Topbar) ─── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 border-b border-gray-200 dark:border-white/10 bg-white/80 dark:bg-[#0B0F19]/80 backdrop-blur-lg z-40 flex items-center justify-between px-4 safe-area-top">
        <div className="flex items-center gap-2.5">
          <img src={LOGO_URL} alt="Safend" className="w-6 h-6 object-contain" />
          <div>
            <p className="text-sm font-semibold leading-tight">Safend</p>
            <p className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight">{profile?.name?.split(' ')[0] || 'Supervisor'} · Area Officer</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          aria-label="Log out"
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 active:scale-90 transition-transform"
        >
          <LogOut className="h-4 w-4 text-gray-500" />
        </button>
      </header>

      {/* ─── Main Content ─── */}
      <main className="flex-1 min-w-0 lg:ml-60 pt-14 pb-20 lg:pt-0 lg:pb-0">
        <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* ─── Mobile Bottom Navigation ─── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 safe-area-bottom">
        {/* Frosted glass background */}
        <div className="absolute inset-0 bg-white/80 dark:bg-[#0B0F19]/80 backdrop-blur-xl border-t border-gray-200/50 dark:border-white/5" />
        
        <div className="relative flex items-center justify-around h-[68px] max-w-lg mx-auto px-2">
          {BOTTOM_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { handleTabChange(item.id); setShowMoreMenu(false); }}
                className="flex flex-col items-center justify-center gap-1 flex-1 h-full relative tap-highlight-none"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {/* Active indicator pill */}
                {isActive && !MORE_NAV.some(n => n.id === activeTab) && (
                  <motion.div
                    layoutId="supervisorBottomNav"
                    className="absolute -top-px left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-full bg-[#D71920]"
                    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  />
                )}

                {/* Icon with background pill when active */}
                <motion.div
                  whileTap={{ scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                  className={cn(
                    'flex items-center justify-center w-10 h-7 rounded-full transition-colors duration-200',
                    isActive ? 'bg-[#D71920]/10' : 'bg-transparent'
                  )}
                >
                  <Icon className={cn(
                    'h-[22px] w-[22px] transition-all duration-200',
                    isActive ? 'text-[#D71920]' : 'text-gray-400 dark:text-gray-500'
                  )} />
                </motion.div>

                {/* Label */}
                <span className={cn(
                  'text-[10px] leading-none transition-all duration-200',
                  isActive ? 'font-semibold text-[#D71920]' : 'font-normal text-gray-400 dark:text-gray-500'
                )}>
                  {item.label}
                </span>
              </button>
            );
          })}

          {/* More button */}
          <div className="relative flex flex-col items-center justify-center gap-1 flex-1 h-full">
            <button
              onClick={() => { haptic('light'); setShowMoreMenu(prev => !prev); }}
              aria-label="More navigation options"
              aria-expanded={showMoreMenu}
              className="flex flex-col items-center justify-center gap-1 h-full w-full tap-highlight-none"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              {/* Active indicator if a "more" tab is active */}
              {MORE_NAV.some(n => n.id === activeTab) && !BOTTOM_NAV.some(n => n.id === activeTab) && (
                <motion.div
                  layoutId="supervisorBottomNav"
                  className="absolute -top-px left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-full bg-[#D71920]"
                  transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                />
              )}
              <motion.div
                whileTap={{ scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                className={cn(
                  'flex items-center justify-center w-10 h-7 rounded-full transition-colors duration-200',
                  MORE_NAV.some(n => n.id === activeTab) ? 'bg-[#D71920]/10' : 'bg-transparent'
                )}
              >
                <MoreHorizontal className={cn(
                  'h-[22px] w-[22px] transition-all duration-200',
                  MORE_NAV.some(n => n.id === activeTab) ? 'text-[#D71920]' : 'text-gray-400 dark:text-gray-500'
                )} />
              </motion.div>
              <span className={cn(
                'text-[10px] leading-none transition-all duration-200',
                MORE_NAV.some(n => n.id === activeTab) ? 'font-semibold text-[#D71920]' : 'font-normal text-gray-400 dark:text-gray-500'
              )}>
                More
              </span>
            </button>

            {/* More dropdown */}
            <AnimatePresence>
              {showMoreMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowMoreMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full mb-2 right-0 z-50 w-44 bg-white dark:bg-[#1a1f2e] rounded-xl shadow-xl border border-gray-200 dark:border-white/10 overflow-hidden"
                  >
                    {MORE_NAV.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => { handleTabChange(item.id); setShowMoreMenu(false); }}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-[#D71920]/5 text-[#D71920]'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'
                          )}
                        >
                          <Icon className={cn('h-4 w-4', isActive ? 'text-[#D71920]' : 'text-gray-400')} />
                          {item.label}
                        </button>
                      );
                    })}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </nav>
    </div>
  );
}
