'use client';
import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { QuotationsTable } from "../QuotationsTable";
import { useQuotationsData } from "@/contexts/QuotationsDataContext";

interface QuotationsTabContentProps {
  activeFilter: string;
  searchTerm: string;
  onEdit: (item: any, type: string) => void;
}

export function QuotationsTabContent({
  activeFilter,
  searchTerm,
  onEdit
}: QuotationsTabContentProps) {
  // Use centralized quotations data from context
  const { quotations } = useQuotationsData();

  const stats = useMemo(() => {
    const total = quotations.length;
    const draft = quotations.filter(q => q.status === "Draft").length;
    const pending = quotations.filter(q => q.status === "Pending" || q.status === "Sent" || q.status === "Revised").length;
    const accepted = quotations.filter(q => q.status === "Accepted").length;
    const rejected = quotations.filter(q => q.status === "Rejected").length;
    
    return { total, draft, pending, accepted, rejected };
  }, [quotations]);

  return (
    <>
      <div className="bg-linear-to-r from-red-50 to-gray-50 dark:from-red-900/20 dark:to-gray-900/20 p-6 rounded-lg border border-red-100 dark:border-red-800/30">
        <h3 className="text-lg font-medium mb-2">Quotation Management</h3>
        <p className="text-muted-foreground">
          Create, track, and manage quotations for your clients and prospects.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-6 hover:shadow-lg transition-shadow border-t-4 border-t-gray-800">
          <h4 className="font-semibold text-gray-600 dark:text-gray-300">Total</h4>
          <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 mt-2">{stats.total}</p>
        </Card>
        <Card className="p-6 hover:shadow-lg transition-shadow border-t-4 border-t-amber-500">
          <h4 className="font-semibold text-gray-600 dark:text-gray-300">Pending</h4>
          <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-2">{stats.pending}</p>
          <p className="text-xs text-muted-foreground mt-1">{stats.draft} draft</p>
        </Card>
        <Card className="p-6 hover:shadow-lg transition-shadow border-t-4 border-t-green-500">
          <h4 className="font-semibold text-gray-600 dark:text-gray-300">Accepted</h4>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">{stats.accepted}</p>
        </Card>
        <Card className="p-6 hover:shadow-lg transition-shadow border-t-4 border-t-red-500">
          <h4 className="font-semibold text-gray-600 dark:text-gray-300">Rejected</h4>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">{stats.rejected}</p>
        </Card>
      </div>
      
      <QuotationsTable 
        filter={activeFilter}
        searchTerm={searchTerm}
        onEdit={(item) => onEdit(item, "quotation")}
      />
    </>
  );
}
