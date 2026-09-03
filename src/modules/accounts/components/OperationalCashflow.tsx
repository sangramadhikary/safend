'use client';

import { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { CashAdvance, getCashAdvances, getAdvanceSummaryByCategory } from '@/services/security/SecurityCashAdvanceService';
import { useAccountsData } from '@/hooks/accounts/useAccountsData';

// Import refactored components
import { SearchForm } from './cashflow/SearchForm';
import { SummaryStats } from './cashflow/SummaryStats';
import { CategorySummaryCards } from './cashflow/CategorySummaryCards';
import { MonthlyCashRequirementsTable } from './cashflow/MonthlyCashRequirementsTable';
import { CashAdvancesList } from './cashflow/CashAdvancesList';
import { BranchCashflowTable } from './cashflow/BranchCashflowTable';

export function OperationalCashflow() {
  const [activeTab, setActiveTab] = useState('advances');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<string | undefined>(undefined);
  const { toast } = useToast();
  
  // Fetch cash advances
  const {
    data: advances,
    isLoading: isLoadingAdvances,
    refetch: refetchAdvances
  } = useAccountsData(
    () => getCashAdvances({
      branchId: selectedBranchId,
      status: activeTab === 'overdue' ? 'disbursed' : undefined
    }),
    [selectedBranchId, activeTab],
    [],
    "Failed to load cash advance data"
  );
  
  // Get summary stats
  const {
    data: categorySummary,
    refetch: refetchSummary
  } = useAccountsData(
    () => getAdvanceSummaryByCategory(
      undefined,
      undefined,
      selectedBranchId
    ),
    [selectedBranchId],
    {},
    "Failed to load summary data"
  );
  
  // Monthly cash requirements (loaded from database when available)
  const monthlyCashRequirements: { month: string; patrol: number; fuel: number; equipment: number; other: number; total: number }[] = [];
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    refetchAdvances();
  };
  
  const handleSettlementComplete = () => {
    // Refresh data after settlement
    refetchAdvances();
    refetchSummary();
    
    toast({
      title: "Data refreshed",
      description: "Cash advance data has been updated",
    });
  };
  
  // Filter advances for overdue tab
  const overdueAdvances = activeTab === 'overdue' 
    ? advances?.filter(a => a.status === 'disbursed' && new Date(a.settlementDueDate || '') < new Date())
    : advances;

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Operational Cash Flow</h2>
        <p className="text-muted-foreground">
          Manage cash advances, settlements and branch cash flow for security operations
        </p>
      </div>
      
      <SearchForm 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedBranchId={selectedBranchId}
        setSelectedBranchId={setSelectedBranchId}
        handleSearch={handleSearch}
      />
      
      <SummaryStats data={advances || []} />
      
      <Tabs defaultValue="advances" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="advances">All Advances</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
          <TabsTrigger value="summary">Category Summary</TabsTrigger>
          <TabsTrigger value="branches">Branch Analysis</TabsTrigger>
        </TabsList>
        
        <TabsContent value="advances" className="space-y-4 mt-6">
          <CashAdvancesList 
            advances={advances} 
            isLoading={isLoadingAdvances}
            onSettlementComplete={handleSettlementComplete}
          />
        </TabsContent>
        
        <TabsContent value="overdue" className="space-y-4 mt-6">
          <CashAdvancesList 
            advances={overdueAdvances} 
            isLoading={isLoadingAdvances} 
            title="Overdue Settlements"
            onSettlementComplete={handleSettlementComplete}
          />
        </TabsContent>
        
        <TabsContent value="summary" className="space-y-4 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <CategorySummaryCards categorySummary={categorySummary} />
          </div>
          
          <MonthlyCashRequirementsTable />
        </TabsContent>
        
        <TabsContent value="branches" className="space-y-4 mt-6">
          <BranchCashflowTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
