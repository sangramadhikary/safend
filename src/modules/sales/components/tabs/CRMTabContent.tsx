'use client';
import React from "react";
import { LeadsTable } from "../LeadsTable";
import { ClientProfile } from "../ClientProfile";
import { CRMStatsCards } from "../CRMStatsCards";

interface CRMTabContentProps {
  selectedClient: any;
  setSelectedClient: (client: any) => void;
  activeFilter: string;
  searchTerm: string;
  onEdit: (item: any, type: string) => void;
  onClientSelect: (client: any) => void;
  onCreateQuotationFromLead?: (lead: any) => void;
}

export function CRMTabContent({
  selectedClient,
  setSelectedClient,
  activeFilter,
  searchTerm,
  onEdit,
  onClientSelect,
  onCreateQuotationFromLead,
}: CRMTabContentProps) {
  if (selectedClient) {
    return <ClientProfile client={selectedClient} onBack={() => setSelectedClient(null)} onEdit={onEdit} />;
  }

  return (
    <>
      <CRMStatsCards />

      <LeadsTable
        filter={activeFilter}
        searchTerm={searchTerm}
        onEdit={item => onEdit(item, "lead")}
        onClientSelect={onClientSelect}
        onCreateQuotation={onCreateQuotationFromLead}
      />
    </>
  );
}
