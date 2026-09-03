'use client';
import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { useLeadsData } from "@/contexts/LeadsDataContext";

export function CRMStatsCards() {
  const { leads } = useLeadsData();

  const stats = useMemo(() => {
    const totalLeads = leads.length;
    const opportunities = leads.filter(lead => lead.status === "Opportunity").length;
    const activeClients = leads.filter(lead => lead.status === "Client").length;
    const qualifiedLeads = leads.filter(lead =>
      lead.status === "Qualified Lead" ||
      lead.status === "Opportunity" ||
      lead.status === "Client"
    ).length;
    const conversionRate = totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : 0;
    return { totalLeads, opportunities, activeClients, conversionRate };
  }, [leads]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="p-6 hover:shadow-lg transition-shadow border-t-4 stat-border-red">
        <h4 className="font-semibold text-gray-600 dark:text-gray-300">Total Leads</h4>
        <p className="text-3xl font-bold stat-text-red mt-2">{stats.totalLeads}</p>
        <p className="text-xs text-muted-foreground mt-1">All contacts made</p>
      </Card>

      <Card className="p-6 hover:shadow-lg transition-shadow border-t-4 stat-border-black">
        <h4 className="font-semibold text-gray-600 dark:text-gray-300">Opportunities</h4>
        <p className="text-3xl font-bold stat-text-black mt-2">{stats.opportunities}</p>
        <p className="text-xs text-muted-foreground mt-1">Current pipeline</p>
      </Card>

      <Card className="p-6 hover:shadow-lg transition-shadow border-t-4 stat-border-gray">
        <h4 className="font-semibold text-gray-600 dark:text-gray-300">Active Clients</h4>
        <p className="text-3xl font-bold stat-text-gray mt-2">{stats.activeClients}</p>
        <p className="text-xs text-muted-foreground mt-1">With ongoing contracts</p>
      </Card>

      <Card className="p-6 hover:shadow-lg transition-shadow border-t-4 stat-border-red">
        <h4 className="font-semibold text-gray-600 dark:text-gray-300">Conversion Rate</h4>
        <p className="text-3xl font-bold stat-text-red mt-2">{stats.conversionRate}%</p>
        <p className="text-xs text-muted-foreground mt-1">Qualified ÷ Contacts Made</p>
      </Card>
    </div>
  );
}
