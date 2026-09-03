'use client';

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Topbar } from "./Topbar";
import { DrawerNavigation } from "./DrawerNavigation";
import { BottomNavigation } from "./BottomNavigation";
import { Sidebar } from "./Sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScrollArea } from "../ui/scroll-area";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userRole, setUserRole] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobile();
  
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

  // Header height: 56px (h-14) on mobile, 64px (h-16) on sm+
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
          <motion.main
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
            className={`flex-1 py-4 sm:py-6 px-3 sm:px-4 md:px-6 w-full ${
              isMobile ? 'pb-20' : ''
            }`}
            style={{ minHeight: `calc(100vh - ${headerHeight}px)` }}
          >
            {children}
          </motion.main>
        </ScrollArea>
      </div>
      {isMobile && <BottomNavigation />}
    </div>
  );
}
