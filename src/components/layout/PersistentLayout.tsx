'use client';

import React, { Suspense, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Topbar } from "./Topbar";
import { BottomNavigation } from "./BottomNavigation";
import { Sidebar } from "./Sidebar";
import { ModuleHeaderBar } from "./ModuleHeaderBar";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePageAudit } from "@/hooks/usePageAudit";
import { ScrollArea } from "../ui/scroll-area";

interface PersistentLayoutProps {
  children: React.ReactNode;
}

/**
 * PersistentLayout is rendered ONCE at the ERP route-group level.
 * The sidebar never unmounts on page transitions — only `children` (the page content) swaps.
 * On the login page, the shell (topbar/sidebar) is hidden to allow full-screen login styling.
 */
export function PersistentLayout({ children }: PersistentLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userRole, setUserRole] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobile();
  const pathname = usePathname();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const updateRole = () => {
      if (typeof window !== 'undefined') {
        const storedRole = localStorage.getItem("userRole");
        if (storedRole) setUserRole(storedRole);
      }
    };
    updateRole();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', updateRole);
      return () => window.removeEventListener('storage', updateRole);
    }
  }, []);

  const toggleSidebar = () => setSidebarCollapsed(prev => !prev);
  const showSidebar = mounted && !isMobile && !!userRole;

  // Track page navigation in audit log
  usePageAudit();

  // On the login page, render children directly without the app shell
  const isLoginPage = pathname === '/login';
  if (isLoginPage) {
    return <>{children}</>;
  }

  const headerHeight = isMobile ? 56 : 64;

  return (
    <div className="min-h-screen flex w-full flex-col bg-white dark:bg-[#0B0F19] text-black dark:text-[#E0E0E0]" suppressHydrationWarning>
      <Topbar />
      <div className="flex flex-1 w-full overflow-hidden">
        {showSidebar && (
          <Sidebar collapsed={sidebarCollapsed} toggleSidebar={toggleSidebar} />
        )}
        <ScrollArea
          className="flex-1"
          style={{ height: `calc(100vh - ${headerHeight}px)` }}
        >
          <main
            className={`flex-1 py-0 sm:py-0 px-0 w-full ${
              isMobile ? 'pb-20' : ''
            }`}
            style={{ minHeight: `calc(100vh - ${headerHeight}px)` }}
          >
            {/* Persistent module header — renders instantly on navigation */}
            <ModuleHeaderBar />
            {/* Module content — lazy-loads below the header */}
            <div className="px-3 sm:px-4 md:px-6 pt-3 pb-4">
              <Suspense fallback={null}>
                {children}
              </Suspense>
            </div>
          </main>
        </ScrollArea>
      </div>
      {isMobile && <BottomNavigation />}
    </div>
  );
}
