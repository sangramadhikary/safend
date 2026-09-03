'use client';

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Home, UserCircle, ClipboardList, Building2, ShoppingCart, Files } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export const BottomNavigation = () => {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [userRole, setUserRole] = useState<string>("");
  
  // Get user role from localStorage
  useEffect(() => {
    const updateRole = () => {
      if (typeof window !== 'undefined') {
        const storedRole = localStorage.getItem("userRole");
        if (storedRole) {
          setUserRole(storedRole);
        }
      }
    };
    updateRole();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', updateRole);
      return () => window.removeEventListener('storage', updateRole);
    }
  }, []);
  
  const allNavItems = [
    { name: "Home", path: "/dashboard", icon: Home, roles: ["admin", "branch_admin"] },
    { name: "Sales", path: "/sales", icon: ShoppingCart, roles: ["admin", "branch_admin", "sales"] },
    { name: "Operations", path: "/operations", icon: ClipboardList, roles: ["admin", "branch_admin", "operations"] },
    { name: "Accounts", path: "/accounts", icon: Files, roles: ["admin", "branch_admin", "accounts"] },
    { name: "HR", path: "/hr", icon: UserCircle, roles: ["admin", "branch_admin", "hr"] },
  ];

  // Filter nav items based on user role
  const navItems = allNavItems.filter(item => item.roles.includes(userRole));

  const handleNavigation = (path: string) => {
    router.push(path);
  };

  if (!isMobile || navItems.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom">
      <div className="bg-background/95 backdrop-blur-lg border-t border-border/50 px-1 sm:px-2 py-1.5 sm:py-2 flex justify-around items-center shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        {navItems.map((item) => {
          const isActive = pathname === item.path || pathname?.startsWith(item.path + '/');
          
          return (
            <button
              key={item.path}
              onClick={() => handleNavigation(item.path)}
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-2 sm:px-3 relative min-w-[56px] sm:min-w-[64px] rounded-lg transition-colors",
                isActive
                  ? "text-safend-red"
                  : "text-muted-foreground active:bg-muted/50"
              )}
            >
              <div className="relative">
                <item.icon className={cn("h-5 w-5 sm:h-[22px] sm:w-[22px]", isActive && "stroke-[2.5]")} />
                {isActive && (
                  <motion.div
                    layoutId="bottomNavIndicator"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-1 bg-safend-red rounded-full"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </div>
              <span className={cn(
                "text-[10px] sm:text-xs mt-1.5 leading-none",
                isActive && "font-semibold"
              )}>
                {item.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
