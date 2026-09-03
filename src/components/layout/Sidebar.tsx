'use client';

import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingCart, Building2, Files, Users,
  ChevronLeft, ChevronRight, LogOut, User, GitBranch
} from "lucide-react";
import { Badge } from "../ui/badge";
import { motion } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from "@/components/ui/tooltip";
import { useBranch } from "@/contexts/BranchContext";

// ─── Navigation Structure ───
interface NavItem {
  title: string;
  icon: typeof LayoutDashboard;
  path: string;
  role: string[];
  highlight?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: "Main",
    items: [
      {
        title: "Admin Dashboard",
        icon: LayoutDashboard,
        path: "/dashboard",
        role: ["admin", "branch_admin"],
        highlight: true,
      },
    ],
  },
  {
    label: "Departments",
    items: [
    { title: "Sales", icon: ShoppingCart, path: "/sales", role: ["admin", "branch_admin", "sales"] },
      { title: "Operations", icon: Building2, path: "/operations", role: ["admin", "branch_admin", "operations"] },
      { title: "Accounts", icon: Files, path: "/accounts", role: ["admin", "branch_admin", "accounts"] },
      { title: "HR", icon: Users, path: "/hr", role: ["admin", "branch_admin", "hr"] },
      { title: "Office Admin", icon: Building2, path: "/office-admin", role: ["admin", "branch_admin", "office-admin", "office_admin"] },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  toggleSidebar: () => void;
}

export function Sidebar({ collapsed, toggleSidebar }: SidebarProps) {
  const [expanded, setExpanded] = useState(true);
  const [userRole, setUserRole] = useState<string>("");
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [userName, setUserName] = useState<string>("User");
  const [userEmail, setUserEmail] = useState<string>("");
  const [userPhoto, setUserPhoto] = useState<string>("");
  const [isMobileView, setIsMobileView] = useState(false);
  const pathname = usePathname();
  const { currentBranch, isMainBranchUser } = useBranch();
  const branchName = currentBranch?.name || (isMainBranchUser ? 'All Branches' : 'Branch');

  // Sync expanded state with props
  useEffect(() => { setExpanded(!collapsed); }, [collapsed]);

  // Responsive
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobileView(mobile);
      if (mobile && expanded) setExpanded(false);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [expanded]);

  // Load user info — prefer server-verified roles from user_roles table,
  // fall back to localStorage for instant paint (avoids flash of wrong sidebar)
  useEffect(() => {
    const sync = () => {
      if (typeof window === 'undefined') return;
      const primary = localStorage.getItem("userRole") || "";
      const allRoles = localStorage.getItem("userRoles");
      setUserRole(primary);
      setUserRoles(allRoles ? allRoles.split(',').map(r => r.trim()).filter(Boolean) : (primary ? [primary] : []));
      setUserName(localStorage.getItem("userName") || "User");
      setUserEmail(localStorage.getItem("userEmail") || "");
      setUserPhoto(localStorage.getItem("userPhotoURL") || "");
    };
    sync();
    window.addEventListener('storage', sync);

    // Also verify roles from Supabase session to prevent stale localStorage
    // from showing wrong sidebar items
    import('@/integrations/supabase/client').then(({ getSupabaseClient }) => {
      const client = getSupabaseClient();
      client.auth.getUser().then(({ data }) => {
        const userId = data?.user?.id;
        if (!userId) return;
        client.from('user_roles').select('role').eq('user_id', userId).then(({ data: roleRows }) => {
          if (!roleRows || roleRows.length === 0) return;
          const serverRoles = roleRows.map((r: any) => r.role).filter(Boolean);
          if (serverRoles.length === 0) return;
          // Priority order for primary role (for redirect/display)
          const PRIORITY = ['admin', 'branch_admin', 'sales', 'hr', 'operations', 'accounts', 'office-admin', 'reports'];
          const topRole = PRIORITY.find(r => serverRoles.includes(r)) ?? serverRoles[0];
          // Update localStorage and state with server-verified data
          localStorage.setItem('userRole', topRole);
          localStorage.setItem('userRoles', serverRoles.join(','));
          setUserRole(topRole);
          setUserRoles(serverRoles);
        });
      });
    }).catch(() => {/* non-critical */});

    return () => window.removeEventListener('storage', sync);
  }, []);

  const handleToggle = () => {
    setExpanded(!expanded);
    toggleSidebar();
  };

  const handleLogout = () => {
    window.dispatchEvent(new CustomEvent('app:logout'));
  };

  const getUserInitials = (name: string) =>
    name.split(" ").map(w => w.charAt(0)).join("").toUpperCase().slice(0, 2);

  // Filter sections: show item if ANY of the user's roles is in the item's allowed roles
  const filteredSections = navSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => item.role.some(r => userRoles.includes(r))),
    }))
    .filter(section => section.items.length > 0);

  const menuVariants = {
    expanded: { width: "16rem", transition: { duration: 0.2, ease: "easeInOut" } },
    collapsed: { width: "5rem", transition: { duration: 0.2, ease: "easeInOut" } },
  } as const;

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        initial="expanded"
        animate={expanded ? "expanded" : "collapsed"}
        variants={menuVariants}
        className={cn(
          "h-[calc(100vh-64px)] bg-white/80 dark:bg-[#0B0F19]/80 backdrop-blur-lg sticky top-16 border-r border-white/30 dark:border-white/10 z-30 flex flex-col shadow-xs",
          isMobileView && !expanded ? "w-0 border-none overflow-hidden" : "",
          expanded ? "w-64" : "w-20"
        )}
      >
        {/* ─── Header: Collapse toggle + Branch ─── */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between">
            {expanded ? (
              <div className="flex items-center gap-1.5 px-1">
                <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground truncate">{branchName}</span>
              </div>
            ) : (
              <div className="mx-auto">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleToggle}
                  className={cn(
                    "w-7 h-7 rounded-md flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors",
                    !expanded && "mx-auto mt-1"
                  )}
                >
                  {expanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {expanded ? "Collapse" : "Expand"} (Ctrl+B)
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* ─── Navigation ─── */}
        <ScrollArea className="flex-1 py-4 px-3">
          <nav className="space-y-5">
            {filteredSections.map(section => (
              <div key={section.label}>
                {/* Section label */}
                {expanded && (
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-2">
                    {section.label}
                  </p>
                )}
                {!expanded && <div className="border-t border-gray-100 dark:border-gray-800 mx-2 mb-2" />}

                <div className="space-y-1">
                  {section.items.map(item => {
                    const isActive = pathname === item.path || pathname?.startsWith(item.path + "/");

                    const linkContent = (
                      <Link
                        href={item.path}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 w-full group",
                          isActive
                            ? "bg-red-600 text-white shadow-xs"
                            : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300",
                          item.highlight && !isActive
                            ? "bg-red-50 dark:bg-red-950/10 border border-red-100 dark:border-red-900/20"
                            : "",
                          !expanded && "justify-center px-0"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-5 w-5 shrink-0",
                            isActive ? "text-white" : "",
                            item.highlight && !isActive ? "text-red-500" : ""
                          )}
                        />
                        {expanded && (
                          <span
                            className={cn(
                              "text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis",
                              item.highlight && !isActive ? "text-red-600 dark:text-red-400" : ""
                            )}
                          >
                            {item.title}
                          </span>
                        )}
                      </Link>
                    );

                    // Wrap in tooltip when collapsed
                    if (!expanded) {
                      return (
                        <Tooltip key={item.path}>
                          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                          <TooltipContent side="right" className="font-medium">
                            {item.title}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    return <div key={item.path}>{linkContent}</div>;
                  })}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* ─── User Card Footer ─── */}
        <div className="border-t border-gray-100 dark:border-gray-800 p-3">
          {expanded ? (
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9 shrink-0 cursor-pointer" onClick={() => window.dispatchEvent(new CustomEvent('open:profile-modal'))}>
                <AvatarImage src={userPhoto} alt={userName} />
                <AvatarFallback className="bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-200 text-xs font-medium">
                  {getUserInitials(userName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => window.dispatchEvent(new CustomEvent('open:profile-modal'))}>
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{userName}</p>
                <p className="text-xs text-muted-foreground truncate">{userRole.charAt(0).toUpperCase() + userRole.slice(1)}</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleLogout}
                    className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/20 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Logout</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Avatar className="h-9 w-9 cursor-pointer" onClick={() => window.dispatchEvent(new CustomEvent('open:profile-modal'))}>
                    <AvatarImage src={userPhoto} alt={userName} />
                    <AvatarFallback className="bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-200 text-xs font-medium">
                      {getUserInitials(userName)}
                    </AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-medium">{userName}</p>
                  <p className="text-xs text-muted-foreground">{userRole}</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleLogout}
                    className="w-8 h-8 rounded-md flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/20 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Logout</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}
