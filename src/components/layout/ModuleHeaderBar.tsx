'use client';

/**
 * ModuleHeaderBar — permanently mounted in PersistentLayout.
 *
 * Renders the module title, description, AND primary tab bar instantly
 * on every route. Because it lives outside {children}, it never unmounts
 * on department navigation — zero flash, zero layout shift.
 *
 * Tab state is synced via the same `?tab=` URL param that each module's
 * useTabWithHash hook reads, so both stay in perfect sync.
 * Modules that use a different mechanism (Sales, Accounts) also write to
 * `?tab=` via this bar; their internal state is initialized from the URL.
 */

import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Users, FileText, BarChart2, Calendar, FileSignature,
  BarChart3, Shield, Clipboard, Utensils, MapPin,
  IndianRupee, Receipt, Briefcase, Landmark, CreditCard,
  ClipboardCheck, CircleDollarSign, AlertTriangle,
  Package, ShoppingCart, Wrench, FolderOpen, Building2,
} from 'lucide-react';

// ─── Tab config per module ────────────────────────────────────────────────────

interface TabDef {
  id: string;
  label: string;
  icon: React.ElementType;
}

interface ModuleMeta {
  title: string;
  description: string;
  tabs: TabDef[];
  defaultTab: string;
}

const MODULE_META: Record<string, ModuleMeta> = {
  '/dashboard': {
    title: 'Administrative Dashboard',
    description: 'Unified administration, reporting, and branch management system',
    defaultTab: 'overview',
    tabs: [
      { id: 'overview', label: 'Overview',       icon: BarChart3 },
      { id: 'reports',  label: 'Reports',        icon: FileText  },
      { id: 'control',  label: 'Control Centre', icon: Wrench    },
    ],
  },
  '/sales': {
    title: 'Sales Management',
    description: 'Manage leads, quotations, agreements, work orders and follow-ups',
    defaultTab: 'crm',
    tabs: [
      { id: 'clients',    label: 'Clients',     icon: Building2     },
      { id: 'crm',        label: 'Leads',       icon: Users         },
      { id: 'quotations', label: 'Quotations',  icon: FileText      },
      { id: 'contracts',  label: 'Contracts',   icon: FileSignature },
      { id: 'aging',      label: 'Collections', icon: IndianRupee   },
      { id: 'reports',    label: 'Reports',     icon: BarChart2     },
      { id: 'calendar',   label: 'Calendar',    icon: Calendar      },
    ],
  },
  '/operations': {
    title: 'Operations Management',
    description: 'Comprehensive field operations management for security services',
    defaultTab: 'dashboard',
    tabs: [
      { id: 'dashboard',   label: 'Ground Reality', icon: BarChart3  },
      { id: 'posts',       label: 'Post Details',   icon: MapPin     },
      { id: 'deployments', label: 'Deployments',    icon: Shield     },
      { id: 'attendance',  label: 'Attendance',     icon: Users      },
      { id: 'leave',       label: 'Leave',          icon: Calendar   },
      { id: 'fieldops',    label: 'Field Ops',      icon: Clipboard  },
      { id: 'mess',        label: 'Mess',           icon: Utensils   },
      { id: 'reports',     label: 'Reports',        icon: FileText   },
    ],
  },
  '/hr': {
    title: 'Human Resources',
    description: 'Manage employees, payroll and compliance',
    defaultTab: 'employees',
    tabs: [
      { id: 'employees',  label: 'Employees',       icon: Users           },
      { id: 'leave',      label: 'Leave',           icon: Calendar        },
      { id: 'payroll',    label: 'Payroll & Salary', icon: IndianRupee    },
      { id: 'compliance', label: 'Compliance',      icon: ClipboardCheck  },
      { id: 'loans',      label: 'Advances',        icon: CircleDollarSign},
      { id: 'penalties',  label: 'Penalties',       icon: AlertTriangle   },
      { id: 'reports',    label: 'Reports',         icon: BarChart2       },
    ],
  },
  '/accounts': {
    title: 'Accounts & Finance',
    description: 'Manage financial operations, accounting, compliance and banking',
    defaultTab: 'dashboard',
    tabs: [
      { id: 'dashboard',          label: 'Dashboard',           icon: BarChart2   },
      { id: 'payables',           label: 'Payables',            icon: CreditCard  },
      { id: 'receivables',        label: 'Receivables',         icon: Receipt     },
      { id: 'compliance',         label: 'Compliance',          icon: FileText    },
      { id: 'assets-liabilities', label: 'Assets & Liabilities', icon: Briefcase  },
      { id: 'banking',            label: 'Banking',             icon: Landmark    },
    ],
  },
  '/office-admin': {
    title: 'Office Administration',
    description: 'Centralized management of non-HR, non-Accounts back-office tasks',
    defaultTab: 'dashboard',
    tabs: [
      { id: 'dashboard',   label: 'Branch Dashboard',   icon: BarChart3    },
      { id: 'inventory',   label: 'Inventory',          icon: Package      },
      { id: 'procurement', label: 'Procurement & Bills', icon: ShoppingCart },
      { id: 'facilities',  label: 'Fleet & Properties', icon: Wrench       },
      { id: 'documents',   label: 'Documents & Policy', icon: FolderOpen   },
    ],
  },
};

const SKIP_PATHS = ['/login', '/profile', '/client-login', '/client-portal', '/supervisor-portal'];

// ─── Inner component (uses useSearchParams — must be inside <Suspense>) ───────

import { Suspense } from 'react';

function ModuleHeaderBarInner() {
  const pathname  = usePathname();
  const params    = useSearchParams();
  const router    = useRouter();

  const segment = '/' + (pathname.split('/')[1] || '');
  const meta    = MODULE_META[segment];

  const activeTab = params.get('tab') ?? meta?.defaultTab ?? '';

  const setTab = useCallback((tab: string) => {
    const next = new URLSearchParams(params.toString());
    if (tab === meta?.defaultTab) {
      next.delete('tab');
    } else {
      next.set('tab', tab);
    }
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    // Notify module contexts that the tab changed (router.replace doesn't fire popstate)
    window.dispatchEvent(new CustomEvent('moduleTabChanged', { detail: { tab, pathname } }));
  }, [params, pathname, router, meta]);

  if (!meta || SKIP_PATHS.some(p => pathname.startsWith(p))) return null;

  return (
    <div className="px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 pb-0 space-y-3">
      {/* Title + description */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold leading-tight bg-linear-to-r from-red-700 via-red-500 to-black bg-clip-text text-transparent! dark:via-red-400 dark:to-white">
          {meta.title}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{meta.description}</p>
      </div>

      {/* Primary tab bar */}
      <ScrollArea className="w-full">
        <div className="flex items-center gap-1 pb-0" role="tablist">
          {meta.tabs.map((tab) => {
            const Icon    = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all duration-150 select-none',
                  isActive
                    ? 'bg-[#D71920] text-white shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>

      {/* Separator line below the tab bar */}
      <div className="h-px bg-border -mx-3 sm:-mx-4 md:-mx-6" />
    </div>
  );
}

// ─── Public export — wraps inner in Suspense so Next.js can statically prerender ─

export function ModuleHeaderBar() {
  return (
    <Suspense fallback={null}>
      <ModuleHeaderBarInner />
    </Suspense>
  );
}
