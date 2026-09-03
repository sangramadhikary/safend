'use client';

import { useState, Suspense, useEffect, useMemo, lazy } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ModuleHeader } from "@/components/ui/module-header";
import { ModuleCard } from "@/components/ui/module-card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { 
  BarChart2, IndianRupee, FileText, Receipt, LineChart,
  Landmark, Briefcase, Calendar, Plus, CreditCard
} from "lucide-react";
import { usePermissions } from "@/hooks/operations/usePermissions";
import { AccountsProvider, useAccountsContext, AccountsSection } from "@/contexts/AccountsContext";
import { FormsProvider, useFormsController } from "./components/forms/FormsController";

// Lazy load all Accounts Components
const AccountsDashboard = lazy(() => import("./components/AccountsDashboard").then(mod => ({ default: mod.AccountsDashboard })));
const ManagePayables = lazy(() => import("./components/ManagePayables").then(mod => ({ default: mod.ManagePayables })));
const ManageReceivables = lazy(() => import("./components/ManageReceivables").then(mod => ({ default: mod.ManageReceivables })));
const ComplianceModule = lazy(() => import("./components/ComplianceModule").then(mod => ({ default: mod.ComplianceModule })));
const AssetsLiabilities = lazy(() => import("./components/AssetsLiabilities").then(mod => ({ default: mod.AssetsLiabilities })));
const BankingModule = lazy(() => import("./components/BankingModule").then(mod => ({ default: mod.BankingModule })));

// Define tabs structure
const accountsTabs = [
  { id: "dashboard", label: "Dashboard", icon: BarChart2, section: 'dashboard' as AccountsSection },
  { id: "payables", label: "Payables", icon: CreditCard, section: 'payables' as AccountsSection },
  { id: "receivables", label: "Receivables", icon: Receipt, section: 'receivables' as AccountsSection },
  { id: "compliance", label: "Compliance", icon: FileText, section: 'compliance' as AccountsSection },
  { id: "assets-liabilities", label: "Assets & Liabilities", icon: Briefcase, section: 'assets-liabilities' as AccountsSection },
  { id: "banking", label: "Banking", icon: Landmark, section: 'banking' as AccountsSection }
];

// Loading component for tab content — skeleton matching financial dashboards
function TabContentLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card/50 p-6 space-y-3">
            <div className="flex justify-between">
              <div className="space-y-2 flex-1">
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="h-8 w-20 rounded bg-muted" />
                <div className="h-3 w-16 rounded bg-muted" />
              </div>
              <div className="h-10 w-10 rounded-lg bg-muted shrink-0" />
            </div>
          </div>
        ))}
      </div>
      {/* Chart row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-lg border bg-card/50 p-6 space-y-3">
            <div className="h-5 w-36 rounded bg-muted" />
            <div className="h-3 w-48 rounded bg-muted" />
            <div className="h-40 w-full rounded-lg bg-muted" />
          </div>
        ))}
      </div>
      {/* Table rows */}
      <div className="space-y-2">
        <div className="flex gap-4 px-4 py-2">
          {Array.from({ length: 5 }).map((_, c) => (
            <div key={c} className="h-4 flex-1 rounded bg-muted" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, r) => (
          <div key={r} className="flex gap-4 px-4 py-3 border-t border-border/30">
            {Array.from({ length: 5 }).map((_, c) => (
              <div key={c} className="h-4 flex-1 rounded bg-muted" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountsModuleContent() {
  const { 
    activeSection, setActiveSection, isDataLoading, 
    setCurrentFilter, setIsDataLoading, triggerRefresh, 
    filters, selectedBranch, branchName 
  } = useAccountsContext();
  
  const { openExpenseForm, openInvoiceForm, openTransactionForm } = useFormsController();
  
  const { hasModuleAction } = usePermissions();
  
  // Get current filters for active section
  const currentFilters = useMemo(() => {
    return filters[activeSection] || [];
  }, [activeSection, filters]);
  
  const [activeFilter, setActiveFilter] = useState(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      const parts = hash.split('/');
      if (parts[1]) return decodeURIComponent(parts[1]);
    }
    return currentFilters[0] || "All";
  });

  useEffect(() => {
    // When section changes, reset filter to first available
    setActiveFilter(currentFilters[0] || "All");
    setCurrentFilter(currentFilters[0] || "All");
  }, [activeSection, currentFilters, setCurrentFilter]);

  const handleTabChange = (value: string) => {
    const section = accountsTabs.find(tab => tab.id === value)?.section || 'dashboard';
    if (section === activeSection) return;
    setActiveSection(section);
  };

  const handleFilterChange = (filter: string) => {
    setActiveFilter(filter);
    setCurrentFilter(filter);
    // Sync filter to URL hash
    if (typeof window !== 'undefined') {
      const section = accountsTabs.find(tab => tab.section === activeSection)?.section || 'dashboard';
      window.location.hash = `${section}/${encodeURIComponent(filter)}`;
    }
    triggerRefresh();
  };

  const getActionButton = () => {
    // Check if user has permission to create in the accounts module
    const canCreate = hasModuleAction("accounts", "create");
    
    if (!canCreate) return null;
    
    switch (activeSection) {
      case "banking":
        return {
          label: "Record Transaction",
          icon: <Plus className="mr-2 h-4 w-4" />,
          action: openTransactionForm
        };
      default:
        return null;
    }
  };

  const actionButton = getActionButton();

  // Quick Action Button (floating action button)
  const getFloatingActionButton = () => {
    if (!hasModuleAction("accounts", "create")) return null;
    
    let label = "";
    let action = () => {};
    
    switch (activeSection) {
      case "banking":
        label = "Add Transaction";
        action = openTransactionForm;
        break;
      default:
        return null;
    }
    
    return (
      <Button 
        variant="floating" 
        onClick={action}
        className="flex items-center gap-2"
      >
        <Plus className="h-4 w-4" />
        {label}
      </Button>
    );
  };

  return (
    <div className="space-y-6">
      <ModuleHeader 
        title={`Accounts & Finance${branchName ? ` - ${branchName}` : ''}`}
        description="Manage financial operations, accounting, compliance and banking"
        actionLabel={actionButton?.label}
        actionIcon={actionButton?.icon}
        onAction={actionButton?.action}
      />
      
      <ModuleCard>
        <Tabs 
          value={accountsTabs.find(tab => tab.section === activeSection)?.id || 'dashboard'} 
          onValueChange={handleTabChange} 
          className="w-full"
        >
          {/* Primary tab bar — hidden by CSS when ModuleHeaderBar is active (layout-level tabs own this UI) */}
          <div data-module-primary-tabs="">
            <ScrollArea className="w-full">
              <TabsList className="inline-flex md:grid grid-cols-3 lg:grid-cols-6 gap-1 w-full md:w-auto bg-gray-100 dark:bg-gray-800/50 p-1 rounded-lg min-w-max">
                {accountsTabs.map(tab => (
                  <TabsTrigger 
                    key={tab.id} 
                    value={tab.id} 
                    className="flex gap-2 items-center transition-all duration-200"
                  >
                    <tab.icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              <ScrollBar orientation="horizontal" className="invisible" />
            </ScrollArea>
          </div>

          {/* Secondary filter row — always visible; lives outside the hidden primary-tabs container */}
          {currentFilters.length > 0 && (
          <div className="px-6 pt-4 pb-3 border-b border-gray-200 dark:border-gray-800 flex gap-2 overflow-x-auto scrollbar-hide">
            {currentFilters.map((filter) => (
              <button
                key={filter}
                onClick={() => handleFilterChange(filter)}
                className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all duration-200 border ${
                  filter === activeFilter
                    ? 'bg-safend-red text-white border-safend-red shadow-xs'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-safend-red/50 hover:text-safend-red'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
          )}
          
          <ScrollArea className="h-[calc(100vh-250px)]">
            <div className="p-6">
              <>
                  {/* Dashboard Tab */}
                  <TabsContent value="dashboard" className="space-y-6 animate-in fade-in-50">
                    <Suspense fallback={<TabContentLoading />}>
                      <AccountsDashboard filter={activeFilter} />
                    </Suspense>
                  </TabsContent>
                  
                  {/* Payables Tab */}
                  <TabsContent value="payables" className="space-y-6 animate-in fade-in-50">
                    <Suspense fallback={<TabContentLoading />}>
                      <ManagePayables filter={activeFilter} />
                    </Suspense>
                  </TabsContent>
                  
                  {/* Receivables Tab */}
                  <TabsContent value="receivables" className="space-y-6 animate-in fade-in-50">
                    <Suspense fallback={<TabContentLoading />}>
                      <ManageReceivables filter={activeFilter} />
                    </Suspense>
                  </TabsContent>
                  
                  {/* Compliance Tab */}
                  <TabsContent value="compliance" className="space-y-6 animate-in fade-in-50">
                    <Suspense fallback={<TabContentLoading />}>
                      <ComplianceModule filter={activeFilter} />
                    </Suspense>
                  </TabsContent>
                  
                  {/* Assets & Liabilities Tab */}
                  <TabsContent value="assets-liabilities" className="space-y-6 animate-in fade-in-50">
                    <Suspense fallback={<TabContentLoading />}>
                      <AssetsLiabilities filter={activeFilter} />
                    </Suspense>
                  </TabsContent>
                  
                  {/* Banking Tab */}
                  <TabsContent value="banking" className="space-y-6 animate-in fade-in-50">
                    <Suspense fallback={<TabContentLoading />}>
                      <BankingModule filter={activeFilter} />
                    </Suspense>
                  </TabsContent>
                </>
            </div>
          </ScrollArea>
        </Tabs>
      </ModuleCard>
      
      {/* Floating Action Button */}
      {getFloatingActionButton()}
    </div>
  );
}

export function AccountsModule() {
  return (
    <AccountsProvider>
      <FormsProvider>
          <AccountsModuleContent />
      </FormsProvider>
    </AccountsProvider>
  );
}
