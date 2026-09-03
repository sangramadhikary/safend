'use client';

import { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PlusCircle, Search, Download, Upload, Package, Users, TrendingDown, Landmark, X
} from "lucide-react";
import { useAppData } from "@/contexts/AppDataContext";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import { useInventoryStore } from "./inventoryStore";
import { InventoryStats } from "./types";
import { exportItemsCsv } from "./inventoryCsv";
import { shouldPromptCapitalization } from "@/services/inventory/capitalizeAsset";
import { InventoryItemsView } from "./views/InventoryItemsView";
import { StockMovementView } from "./views/StockMovementView";
import { DistributionTrackingView } from "./views/DistributionTrackingView";
import { AssetReconciliationView } from "./views/AssetReconciliationView";
import { AddItemDialog } from "./dialogs/AddItemDialog";
import { IssueItemDialog } from "./dialogs/IssueItemDialog";
import { CountUp } from "@/components/dashboard/CountUp";

export function InventoryDashboard() {
  const { activeBranch, branches, isLoading } = useAppData();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("items");
  const [showAddItem, setShowAddItem] = useState(false);
  const [showIssueItem, setShowIssueItem] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" jumps to search from anywhere on the page; Escape clears and blurs.
  // Stock lookups are the most frequent action here, so it should not require
  // reaching for the mouse.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && el === searchRef.current) {
        setSearchQuery('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const items = useInventoryStore(s => s.items);
  const distributions = useInventoryStore(s => s.distributions);
  const fetchItems = useInventoryStore(s => s.fetchItems);
  const fetchDistributions = useInventoryStore(s => s.fetchDistributions);
  const fetchTransactions = useInventoryStore(s => s.fetchTransactions);

  // Fetch data from Supabase when branch changes
  useEffect(() => {
    if (activeBranch) {
      fetchItems(activeBranch);
      fetchDistributions(activeBranch);
      fetchTransactions(activeBranch);
    }
  }, [activeBranch, fetchItems, fetchDistributions, fetchTransactions]);

  const stats: InventoryStats = useMemo(() => {
    const branchItems = items.filter(i => i.branch === activeBranch);
    const activeDistributions = distributions.filter(
      d => d.branch === activeBranch && d.status === 'active'
    );
    const eventDists = activeDistributions.filter(d => d.targetType === 'event');
    return {
      totalItems: branchItems.length,
      totalStock: branchItems.reduce((sum, i) => sum + i.currentStock, 0),
      lowStockItems: branchItems.filter(i => i.currentStock <= i.reorderLevel && i.currentStock > 0).length,
      outOfStockItems: branchItems.filter(i => i.currentStock === 0).length,
      totalDistributed: activeDistributions.reduce((sum, d) => sum + d.quantity, 0),
      pendingReturns: activeDistributions.filter(d => d.expectedReturnDate).length,
      activeEventKits: eventDists.length,
      totalValue: branchItems.reduce((sum, i) => sum + (i.currentStock * (i.purchasePrice || 0)), 0),
    };
  }, [items, distributions, activeBranch]);

  if (isLoading) {
    return (
      <div className="w-full h-64 flex items-center justify-center">
        <LoadingAnimation size="lg" />
      </div>
    );
  }

  const activeBranchName = branches.find(b => b.id === activeBranch)?.name || 'Unknown Branch';

  // High-value tools in this branch not yet capitalized to the asset register.
  const pendingCapitalization = items.filter(i =>
    i.branch === activeBranch &&
    shouldPromptCapitalization(i.category, i.purchasePrice || 0) &&
    !(i.capitalize && i.linkedAssetId)
  ).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Inventory & Distribution</h2>
          <p className="text-sm text-muted-foreground">{activeBranchName}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowIssueItem(true)}>
            <Package className="h-4 w-4 mr-1" /> Issue Items
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled
            title="CSV import is not available yet"
          >
            <Upload className="h-4 w-4 mr-1" /> Import CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportItemsCsv(items.filter(i => i.branch === activeBranch), activeBranch)}
            disabled={stats.totalItems === 0}
            title="Download every item in this branch as CSV"
          >
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button size="sm" onClick={() => setShowAddItem(true)}>
            <PlusCircle className="h-4 w-4 mr-1" /> Add Item
          </Button>
        </div>
      </div>

      {/* Compact Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Items</p>
            <p className="text-xl font-bold"><CountUp to={stats.totalItems} duration={2} separator="," /></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">In Stock</p>
            <p className="text-xl font-bold text-green-600"><CountUp to={stats.totalStock} duration={2} separator="," /></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Low / Out</p>
            <p className="text-xl font-bold text-amber-600">
              <CountUp to={stats.lowStockItems} duration={2} separator="," /><span className="text-red-600">/<CountUp to={stats.outOfStockItems} duration={2} separator="," /></span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Distributed</p>
            <p className="text-xl font-bold text-blue-600"><CountUp to={stats.totalDistributed} duration={2} separator="," /></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Pending Returns</p>
            <p className="text-xl font-bold text-purple-600">{stats.pendingReturns}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Stock Value</p>
            <p className="text-lg font-bold">₹{(stats.totalValue / 1000).toFixed(0)}K</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative w-full md:w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={searchRef}
          placeholder="Search name, code, size, colour, location..."
          className="pl-8 pr-16 w-full"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          aria-label="Search inventory"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}
            className="absolute right-2 top-1.5 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="absolute right-2.5 top-2 hidden sm:inline-flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground pointer-events-none">
            /
          </kbd>
        )}
      </div>

      {/* 3 Tabs Only */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="items" className="flex items-center gap-1.5">
            <Package className="h-4 w-4" /> All Items
          </TabsTrigger>
          <TabsTrigger value="tracking" className="flex items-center gap-1.5">
            <Users className="h-4 w-4" /> Distribution & Tracking
          </TabsTrigger>
          <TabsTrigger value="movements" className="flex items-center gap-1.5">
            <TrendingDown className="h-4 w-4" /> Stock Movement
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="flex items-center gap-1.5">
            <Landmark className="h-4 w-4" /> Asset Reconciliation
            {pendingCapitalization > 0 && (
              <span className="ml-1 rounded-full bg-amber-500 text-white text-[10px] px-1.5 leading-4">{pendingCapitalization}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-4">
          <InventoryItemsView searchQuery={searchQuery} branch={activeBranch} />
        </TabsContent>
        <TabsContent value="tracking" className="mt-4">
          <DistributionTrackingView branch={activeBranch} searchQuery={searchQuery} />
        </TabsContent>
        <TabsContent value="movements" className="mt-4">
          <StockMovementView branch={activeBranch} searchQuery={searchQuery} />
        </TabsContent>
        <TabsContent value="reconciliation" className="mt-4">
          <AssetReconciliationView branch={activeBranch} searchQuery={searchQuery} />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <AddItemDialog open={showAddItem} onOpenChange={setShowAddItem} branch={activeBranch} />
      <IssueItemDialog open={showIssueItem} onOpenChange={setShowIssueItem} branch={activeBranch} />
    </div>
  );
}
