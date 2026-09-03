'use client';
import React, { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCollectionTasks, checkAndAssignOverdueCollections, refreshOverdueDays, type CollectionTask } from '@/services/collections/OverdueCollectionService';
import { AgingInvoicesTable } from "../AgingInvoicesTable";

interface CollectionsTabContentProps {
  activeFilter: string;
  searchTerm: string;
  onEdit: (item: any, type: string) => void;
}

export function CollectionsTabContent({
  activeFilter,
  searchTerm,
  onEdit
}: CollectionsTabContentProps) {
  const queryClient = useQueryClient();

  // On mount: check for new overdue items and refresh days, then invalidate queries
  useEffect(() => {
    const init = async () => {
      await refreshOverdueDays();
      const result = await checkAndAssignOverdueCollections();
      if (result.tasksCreated > 0 || result.overdueCount > 0) {
        queryClient.invalidateQueries({ queryKey: ['collection_tasks'] });
      }
    };
    init();
  }, [queryClient]);

  // Fetch all collection tasks for summary stats — same key as table so they share cache
  const { data: tasks = [] } = useQuery<CollectionTask[]>({
    queryKey: ['collection_tasks', 'All Invoices'],
    queryFn: () => fetchCollectionTasks(),
  });

  // Calculate aging buckets from real data
  const bucket0_30 = tasks.filter(t => t.days_overdue >= 0 && t.days_overdue <= 30 && t.status !== 'resolved');
  const bucket31_60 = tasks.filter(t => t.days_overdue >= 31 && t.days_overdue <= 60 && t.status !== 'resolved');
  const bucket61_90 = tasks.filter(t => t.days_overdue >= 61 && t.days_overdue <= 90 && t.status !== 'resolved');
  const bucket90plus = tasks.filter(t => t.days_overdue > 90 && t.status !== 'resolved');

  const sumAmount = (items: CollectionTask[]) =>
    items.reduce((sum, t) => sum + (t.amount || 0), 0);

  const formatAmount = (amount: number) => {
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  return (
    <>
      <div className="bg-linear-to-r from-red-50 to-gray-50 dark:from-red-900/20 dark:to-gray-900/20 p-6 rounded-lg border border-red-100 dark:border-red-800/30">
        <h3 className="text-lg font-medium mb-2">Aging Invoice Collection</h3>
        <p className="text-muted-foreground">
          Track and manage overdue invoices assigned for collection. Tasks are auto-created when receivables pass their due date.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-6 hover:shadow-lg transition-shadow border-t-4 stat-border-gray">
          <h4 className="font-semibold text-gray-600 dark:text-gray-300">0-30 Days</h4>
          <p className="text-3xl font-bold stat-text-gray mt-2">{formatAmount(sumAmount(bucket0_30))}</p>
          <p className="text-xs text-muted-foreground mt-1">{bucket0_30.length} invoice{bucket0_30.length !== 1 ? 's' : ''}</p>
        </Card>
        <Card className="p-6 hover:shadow-lg transition-shadow border-t-4 stat-border-black">
          <h4 className="font-semibold text-gray-600 dark:text-gray-300">31-60 Days</h4>
          <p className="text-3xl font-bold stat-text-black mt-2">{formatAmount(sumAmount(bucket31_60))}</p>
          <p className="text-xs text-muted-foreground mt-1">{bucket31_60.length} invoice{bucket31_60.length !== 1 ? 's' : ''}</p>
        </Card>
        <Card className="p-6 hover:shadow-lg transition-shadow border-t-4 stat-border-gray">
          <h4 className="font-semibold text-gray-600 dark:text-gray-300">61-90 Days</h4>
          <p className="text-3xl font-bold stat-text-gray mt-2">{formatAmount(sumAmount(bucket61_90))}</p>
          <p className="text-xs text-muted-foreground mt-1">{bucket61_90.length} invoice{bucket61_90.length !== 1 ? 's' : ''}</p>
        </Card>
        <Card className="p-6 hover:shadow-lg transition-shadow border-t-4 stat-border-red">
          <h4 className="font-semibold text-gray-600 dark:text-gray-300">90+ Days</h4>
          <p className="text-3xl font-bold stat-text-red mt-2">{formatAmount(sumAmount(bucket90plus))}</p>
          <p className="text-xs text-muted-foreground mt-1">{bucket90plus.length} invoice{bucket90plus.length !== 1 ? 's' : ''}</p>
        </Card>
      </div>
      
      <AgingInvoicesTable 
        filter={activeFilter}
        searchTerm={searchTerm}
        onEdit={(item) => onEdit(item, "aging")}
      />
    </>
  );
}
