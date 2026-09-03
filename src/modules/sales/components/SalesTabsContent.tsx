'use client';
import React, { lazy, Suspense } from "react";
import { TabsContent } from "@/components/ui/tabs";
import { BrandLoader } from "@/components/ui/brand-loader";
import { CRMTabContent } from "./tabs/CRMTabContent";
import { QuotationsTabContent } from "./tabs/QuotationsTabContent";
import { CollectionsTabContent } from "./tabs/CollectionsTabContent";
import { ContractsManagement } from "./ContractsManagement";

// Lazy-load heavy components that pull in large libraries:
// - EnhancedCalendarView: react-big-calendar (~80KB)
// - SalesReportsTab: recharts (~300KB)
const SalesReportsTab = lazy(() => import("./reports/SalesReportsTab").then(mod => ({ default: mod.SalesReportsTab })));
// ClientsTabContent aggregates data from every sales context + Supabase — lazy so it
// only loads when the Clients tab is actually opened.
const ClientsTabContent = lazy(() => import("./clients/ClientsTabContent").then(mod => ({ default: mod.ClientsTabContent })));
const EnhancedCalendarView = lazy(() => import("./calendar/EnhancedCalendarView").then(mod => ({ default: mod.EnhancedCalendarView })));

const TabLoader = () => (
  <div className="flex items-center justify-center h-[300px]">
    <BrandLoader size="md" message="Loading..." />
  </div>
);

interface SalesTabsContentProps {
  isLoading: boolean;
  activeTab: string;
  selectedClient: any;
  setSelectedClient: (client: any) => void;
  activeFilter: string;
  searchTerm: string;
  handleEdit: (item: any, type: string) => void;
  handleClientSelect: (client: any) => void;
  setEditingItem: (item: any) => void;
  setShowFollowupForm: (show: boolean) => void;
  onConvertToQuotation?: (followup: any) => void;
  onCreateQuotationFromLead?: (lead: any) => void;
}

export function SalesTabsContent({
  isLoading,
  activeTab,
  selectedClient,
  setSelectedClient,
  activeFilter,
  searchTerm,
  handleEdit,
  handleClientSelect,
  setEditingItem,
  setShowFollowupForm,
  onConvertToQuotation,
  onCreateQuotationFromLead
}: SalesTabsContentProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px] bg-white dark:bg-gray-950 rounded-lg">
        <BrandLoader size="lg" message={`Loading ${activeTab} data...`} />
      </div>
    );
  }

  return (
    <div className="p-6">
      <TabsContent value="clients" className="space-y-6 animate-in fade-in-50">
        <Suspense fallback={<TabLoader />}>
          <ClientsTabContent activeFilter={activeFilter} searchTerm={searchTerm} />
        </Suspense>
      </TabsContent>

      <TabsContent value="crm" className="space-y-4 animate-in fade-in-50">
        <CRMTabContent
          selectedClient={selectedClient}
          setSelectedClient={setSelectedClient}
          activeFilter={activeFilter}
          searchTerm={searchTerm}
          onEdit={handleEdit}
          onClientSelect={handleClientSelect}
          onCreateQuotationFromLead={onCreateQuotationFromLead}
        />
      </TabsContent>
      
      <TabsContent value="quotations" className="space-y-6 animate-in fade-in-50">
        <QuotationsTabContent
          activeFilter={activeFilter}
          searchTerm={searchTerm}
          onEdit={handleEdit}
        />
      </TabsContent>
      
      <TabsContent value="contracts" className="space-y-6 animate-in fade-in-50">
        <ContractsManagement
          filter={activeFilter}
          searchTerm={searchTerm}
          onEdit={handleEdit}
        />
      </TabsContent>
      
      <TabsContent value="aging" className="space-y-6 animate-in fade-in-50">
        <CollectionsTabContent
          activeFilter={activeFilter}
          searchTerm={searchTerm}
          onEdit={handleEdit}
        />
      </TabsContent>
      
      <TabsContent value="reports" className="animate-in fade-in-50">
        <Suspense fallback={<TabLoader />}>
          <SalesReportsTab />
        </Suspense>
      </TabsContent>
      
      <TabsContent value="calendar" className="space-y-6 animate-in fade-in-50">
        <div className="bg-linear-to-r from-red-50 to-gray-50 dark:from-red-900/20 dark:to-gray-900/20 p-6 rounded-lg border border-red-100 dark:border-red-800/30">
          <h3 className="text-lg font-medium mb-2">Calendar</h3>
          <p className="text-muted-foreground">
            Centralized calendar integrating Sales, HR, Operations, and Office Admin activities with smart conflict detection and resource optimization.
          </p>
        </div>
        
        <Suspense fallback={<TabLoader />}>
          <EnhancedCalendarView filter={activeFilter} />
        </Suspense>
      </TabsContent>
    </div>
  );
}
