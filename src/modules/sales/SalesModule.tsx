'use client';
import React, { lazy, Suspense } from "react";
import { Tabs } from "@/components/ui/tabs";
import { ModuleHeader } from "@/components/ui/module-header";
import { ModuleCard } from "@/components/ui/module-card";
import { BrandLoader } from "@/components/ui/brand-loader";

// Data providers for centralized Firebase subscriptions
import { LeadsDataProvider } from "@/contexts/LeadsDataContext";
import { QuotationsDataProvider } from "@/contexts/QuotationsDataContext";
import { AgreementsDataProvider } from "@/contexts/AgreementsDataContext";
import { WorkOrdersDataProvider } from "@/contexts/WorkOrdersDataContext";
import { FollowupsDataProvider } from "@/contexts/FollowupsDataContext";

// NOTE: framer-motion's `motion` is used via direct import in child components.
// Removed invalid React.lazy() usage — motion is a namespace, not a component.

// Lazy load components for better performance
const SalesTabNavigation = lazy(() => import("./components/SalesTabNavigation").then(mod => ({ default: mod.SalesTabNavigation })));
const SalesFormsWrapper = lazy(() => import("./components/SalesFormsWrapper").then(mod => ({ default: mod.SalesFormsWrapper })));
const SalesTabsContent = lazy(() => import("./components/SalesTabsContent").then(mod => ({ default: mod.SalesTabsContent })));

// Hooks (not lazy loaded as they're lightweight)
import { useSalesFormHandlers } from "./hooks/useSalesFormHandlers";
import { useSalesModule } from "./hooks/useSalesModule";
import { updateLead } from "@/services/supabase/LeadFirebaseService";

// Loading fallback — skeleton matching sales table layout
const LoadingFallback = () => (
  <div className="space-y-4 animate-pulse p-6">
    {/* Table header */}
    <div className="flex gap-4 px-2 py-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-4 flex-1 rounded bg-muted" />
      ))}
    </div>
    {/* Table rows */}
    {Array.from({ length: 8 }).map((_, r) => (
      <div key={r} className="flex gap-4 px-2 py-3 border-t border-border/30 items-center">
        <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
        {Array.from({ length: 5 }).map((_, c) => (
          <div key={c} className="h-4 flex-1 rounded bg-muted" />
        ))}
        <div className="h-6 w-16 rounded-full bg-muted shrink-0" />
      </div>
    ))}
  </div>
);

function SalesModuleContent() {
  // Module state management
  const {
    activeTab,
    activeFilter,
    searchTerm,
    filterIsOpen,
    selectedClient,
    isLoading,
    setSearchTerm,
    setFilterIsOpen,
    setSelectedClient,
    setActiveTab,
    handleTabChange,
    handleFilterChange,
    handleClientSelect
  } = useSalesModule();
  
  // Form handling from custom hook
  const {
    showLeadForm,
    showQuotationForm,
    showContactForm,
    showWorkorderForm,
    showFollowupForm,
    showAgreementForm,
    showAgingInvoiceForm,
    setShowLeadForm,
    setShowQuotationForm,
    setShowContactForm,
    setShowWorkorderForm,
    setShowFollowupForm,
    setShowAgreementForm,
    setShowAgingInvoiceForm,
    editingItem,
    initialQuotationData,
    handleLeadFormSubmit,
    handleOtherFormSubmit,
    handleEdit,
    setEditingItem,
    setInitialQuotationData
  } = useSalesFormHandlers();

  // Handle convert lead to quotation
  const handleCreateQuotationFromLead = (lead: any) => {
    const quotationData = {
      leadId: lead.id, // UUID - used as FK reference to leads table
      client: lead.name,
      companyName: lead.companyName,
      contactPerson: lead.name,
      contactEmail: lead.email,
      contactPhone: lead.phone,
      address: lead.address,
      city: lead.city,
      state: lead.state,
      pincode: lead.pincode,
      service: `Security Services for ${lead.companyName}`,
      status: "Draft"
      // NOTE: no `id` field — so QuotationForm treats this as a new quotation
    };
    
    // Update lead status to Converted
    updateLead(lead.id, { status: 'Converted' });

    setInitialQuotationData(quotationData);
    setEditingItem(null); // null = create mode; pre-fill via initialQuotationData
    setActiveTab("quotations");
    
    // Small delay to ensure tab switch completes
    setTimeout(() => {
      setShowQuotationForm(true);
    }, 100);
  };

  // Handle convert follow-up to quotation
  const handleConvertToQuotation = (followup: any) => {
    const quotationData = {
      client: followup.contact,
      company: followup.company,
      contactPerson: followup.contact,
      contactEmail: followup.email || "",
      contactPhone: followup.phone || "",
      service: followup.subject,
      status: "Draft"
      // NOTE: no `id` field — so QuotationForm treats this as a new quotation
    };
    
    setInitialQuotationData(quotationData);
    setEditingItem(null); // null = create mode
    setActiveTab("quotations");
    
    // Small delay to ensure tab switch completes
    setTimeout(() => {
      setShowQuotationForm(true);
    }, 100);
  };

  return (
    <>
      <div
        className="space-y-6 page-transition"
      >
        <ModuleHeader
          title="Sales Management"
          description={activeTab === "aging" ? 
            "Manage outstanding invoices and collections" : 
            "Manage leads, quotations, agreements, work orders and follow-ups"}
        />

        <ModuleCard className="overflow-hidden">
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <Suspense fallback={<LoadingFallback />}>
              <SalesTabNavigation
                activeTab={activeTab}
                onTabChange={handleTabChange}
                activeFilter={activeFilter}
                onFilterChange={handleFilterChange}
                filterIsOpen={filterIsOpen}
                setFilterIsOpen={setFilterIsOpen}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onShowLeadForm={() => {
                  setEditingItem(null);
                  setShowLeadForm(true);
                }}
                onShowAgreementForm={() => {
                  setEditingItem(null);
                  setShowWorkorderForm(true);
                }}
                onShowAgingInvoiceForm={() => {
                  setEditingItem(null);
                  setShowAgingInvoiceForm(true);
                }}
              />
              
              <SalesTabsContent
                isLoading={isLoading}
                activeTab={activeTab}
                selectedClient={selectedClient}
                setSelectedClient={setSelectedClient}
                activeFilter={activeFilter}
                searchTerm={searchTerm}
                handleEdit={handleEdit}
                handleClientSelect={handleClientSelect}
                setEditingItem={setEditingItem}
                setShowFollowupForm={setShowFollowupForm}
                onConvertToQuotation={handleConvertToQuotation}
                onCreateQuotationFromLead={handleCreateQuotationFromLead}
              />
            </Suspense>
          </Tabs>
        </ModuleCard>
      </div>

      <Suspense fallback={null}>
        <SalesFormsWrapper
          showLeadForm={showLeadForm}
          showQuotationForm={showQuotationForm}
          showContactForm={showContactForm}
          showWorkorderForm={showWorkorderForm}
          showFollowupForm={showFollowupForm}
          showAgreementForm={showAgreementForm}
          showAgingInvoiceForm={showAgingInvoiceForm}
          setShowLeadForm={setShowLeadForm}
          setShowQuotationForm={setShowQuotationForm}
          setShowContactForm={setShowContactForm}
          setShowWorkorderForm={setShowWorkorderForm}
          setShowFollowupForm={setShowFollowupForm}
          setShowAgreementForm={setShowAgreementForm}
          setShowAgingInvoiceForm={setShowAgingInvoiceForm}
          editingItem={editingItem}
          initialQuotationData={initialQuotationData}
          handleLeadFormSubmit={handleLeadFormSubmit}
          handleOtherFormSubmit={handleOtherFormSubmit}
        />
      </Suspense>
    </>
  );
}

// Wrap with data providers for centralized Firebase subscriptions
export function SalesModule() {
  return (
    <LeadsDataProvider>
      <QuotationsDataProvider>
        <AgreementsDataProvider>
          <WorkOrdersDataProvider>
            <FollowupsDataProvider>
              <SalesModuleContent />
            </FollowupsDataProvider>
          </WorkOrdersDataProvider>
        </AgreementsDataProvider>
      </QuotationsDataProvider>
    </LeadsDataProvider>
  );
}
