'use client';

import { useEffect, useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Package, Truck, Building, FileText, Store, ShoppingCart,
  Receipt, AlertTriangle, IndianRupee, TrendingUp, CalendarClock,
  Activity, ArrowUpRight,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import { useVendorStore } from "./vendors/vendorStore";
import { useBillStore } from "./bills/billStore";
import { useDocumentStore } from "./documents/documentStore";
import { useInventoryStore } from "./inventory/inventoryStore";
import { getVehicles } from "@/services/fleet/FleetService";
import { CountUp } from "@/components/dashboard/CountUp";

export function BranchDashboard() {
  const {
    branches,
    activeBranch, setActiveBranch, isLoading,
  } = useAppData();

  const { vendors, purchaseOrders, fetchVendors, fetchPurchaseOrders } = useVendorStore();
  const { bills, getBillStats, fetchBills, fetchPayments } = useBillStore();
  const { documents, fetchDocuments } = useDocumentStore();
  const { items: inventoryItems, fetchItems: fetchInventory, distributions } = useInventoryStore();
  const [vehicleCount, setVehicleCount] = useState(0);

  // Fetch real data
  useEffect(() => {
    if (activeBranch) {
      fetchVendors(activeBranch);
      fetchPurchaseOrders(activeBranch);
      fetchBills(activeBranch);
      fetchPayments(activeBranch);
      fetchDocuments(activeBranch);
      fetchInventory(activeBranch);
      // Fetch vehicle count
      getVehicles(activeBranch).then(v => setVehicleCount(v.length)).catch(() => {});
    }
  }, [activeBranch, fetchVendors, fetchPurchaseOrders, fetchBills, fetchPayments, fetchDocuments, fetchInventory]);

  if (isLoading) {
    return (
      <div className="w-full h-64 flex items-center justify-center">
        <LoadingAnimation size="lg" />
      </div>
    );
  }

  const activeBranchName = branches.find(b => b.id === activeBranch)?.name || 'Unknown Branch';

  // Inventory stats (from Supabase-backed store)
  const branchInventory = inventoryItems.filter(item => item.branch === activeBranch);
  const lowStockItems = branchInventory.filter(item => item.currentStock <= item.reorderLevel).length;

  // Fleet stats (from Supabase)
  const vehiclesAvailable = vehicleCount; // simplified — full detail on Fleet tab

  // Procurement stats (real data)
  const activeVendors = vendors.filter(v => v.status === 'active').length;
  const pendingPOs = purchaseOrders.filter(po =>
    !['completed', 'cancelled', 'rejected'].includes(po.status)
  ).length;
  const poAwaitingApproval = purchaseOrders.filter(po =>
    po.status === 'submitted' || po.status === 'pending_approval'
  ).length;

  // Bills stats (real data)
  const billStats = getBillStats();

  // Documents stats (real data)
  const activeDocuments = documents.filter(d => d.status === 'active').length;
  const policiesCount = documents.filter(d => d.doc_type === 'policy' || d.doc_type === 'sop').length;
  const pendingAcks = documents.filter(d => d.requires_acknowledgment && d.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Branch Dashboard</h2>
        <Select value={activeBranch} onValueChange={setActiveBranch}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select Branch" />
          </SelectTrigger>
          <SelectContent>
            {branches.map((branch) => (
              <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-muted-foreground">{activeBranchName} — Office Administration Overview</p>

      {/* Primary Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Inventory */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              Inventory Items
              <Package className="h-4 w-4 text-blue-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold"><CountUp to={branchInventory.length} duration={2} separator="," /></div>
            <div className="flex items-center mt-2">
              <Progress
                value={branchInventory.length > 0 ? ((branchInventory.length - lowStockItems) / branchInventory.length) * 100 : 100}
                className="h-1.5"
              />
            </div>
            <div className="mt-2">
              {lowStockItems > 0 ? (
                <span className="text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {lowStockItems} items low on stock
                </span>
              ) : (
                <span className="text-xs text-green-600">All items stocked</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Vendors */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              Active Vendors
              <Store className="h-4 w-4 text-purple-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold"><CountUp to={activeVendors} duration={2} separator="," /></div>
            <div className="mt-2 space-y-1">
              <div className="text-xs text-muted-foreground flex items-center justify-between">
                <span>Purchase Orders</span>
                <span className="font-medium">{pendingPOs} active</span>
              </div>
              {poAwaitingApproval > 0 && (
                <span className="text-xs text-amber-600 flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" /> {poAwaitingApproval} awaiting approval
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bills */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              Recurring Bills
              <Receipt className="h-4 w-4 text-green-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold"><CountUp to={billStats.active} duration={2} separator="," /></div>
            <div className="mt-2 space-y-1">
              <div className="text-xs text-muted-foreground flex items-center justify-between">
                <span>Monthly avg</span>
                <span className="font-medium">₹{Math.round(billStats.totalMonthly).toLocaleString()}</span>
              </div>
              {billStats.overdue > 0 && (
                <span className="text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {billStats.overdue} overdue
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              Documents
              <FileText className="h-4 w-4 text-amber-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold"><CountUp to={activeDocuments} duration={2} separator="," /></div>
            <div className="mt-2 space-y-1">
              <div className="text-xs text-muted-foreground flex items-center justify-between">
                <span>Policies & SOPs</span>
                <span className="font-medium">{policiesCount}</span>
              </div>
              {pendingAcks > 0 && (
                <span className="text-xs text-amber-600 flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" /> {pendingAcks} need acknowledgment
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Fleet */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              Fleet & Vehicles
              <Truck className="h-4 w-4 text-indigo-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{vehicleCount}</div>
                <div className="text-xs text-muted-foreground">Registered vehicles</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Distributed Items */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              Distributed Items
              <Building className="h-4 w-4 text-teal-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{distributions.filter(d => d.branch === activeBranch && d.status === 'active').length}</div>
                <div className="text-xs text-muted-foreground">Active distributions</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Financial Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
              This Week
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{billStats.dueThisWeek}</div>
                <div className="text-xs text-muted-foreground">Payments due</div>
              </div>
              {billStats.dueThisWeek > 0 && (
                <Badge variant="secondary" className="text-orange-600">
                  Action needed
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions / Alerts */}
      {(billStats.overdue > 0 || poAwaitingApproval > 0 || lowStockItems > 0 || pendingAcks > 0) && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Attention Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {billStats.overdue > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-2 w-2 rounded-full bg-red-500" />
                  <span>{billStats.overdue} overdue bill{billStats.overdue > 1 ? 's' : ''}</span>
                </div>
              )}
              {poAwaitingApproval > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-2 w-2 rounded-full bg-amber-500" />
                  <span>{poAwaitingApproval} PO{poAwaitingApproval > 1 ? 's' : ''} need approval</span>
                </div>
              )}
              {lowStockItems > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-2 w-2 rounded-full bg-orange-500" />
                  <span>{lowStockItems} inventory item{lowStockItems > 1 ? 's' : ''} low</span>
                </div>
              )}
              {pendingAcks > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  <span>{pendingAcks} document{pendingAcks > 1 ? 's' : ''} need review</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
