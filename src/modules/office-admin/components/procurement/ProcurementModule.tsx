'use client';

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Search, Plus, Store, ShoppingCart, Receipt, CalendarClock,
  AlertTriangle, IndianRupee, Activity, Pause, TrendingUp,
} from "lucide-react";
import { useAppData } from "@/contexts/AppDataContext";
import { BrandLoader } from "@/components/ui/brand-loader";

// Vendor imports
import { useVendorStore } from "../vendors/vendorStore";
import { VendorList } from "../vendors/VendorList";
import { VendorForm } from "../vendors/VendorForm";
import { PurchaseOrderList } from "../vendors/PurchaseOrderList";
import { PurchaseOrderForm } from "../vendors/PurchaseOrderForm";
import { PurchaseOrderDetail } from "../vendors/PurchaseOrderDetail";
import { PurchaseOrder } from "../vendors/types";

// Bills imports
import { useBillStore } from "../bills/billStore";
import { RecurringBillsList } from "../bills/RecurringBillsList";
import { PaymentsList } from "../bills/PaymentsList";
import { BillForm } from "../bills/BillForm";
import { PaymentDialog } from "../bills/PaymentDialog";
import { BillPayment } from "../bills/types";

export function ProcurementModule() {
  const { activeBranch, branches, isLoading } = useAppData();
  const { fetchVendors, fetchPurchaseOrders, vendors, purchaseOrders } = useVendorStore();
  const { fetchBills, fetchPayments, generateUpcomingPayments, getBillStats, bills } = useBillStore();

  const [activeTab, setActiveTab] = useState("vendors");
  const [searchQuery, setSearchQuery] = useState("");

  // Vendor/PO state
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [showPOForm, setShowPOForm] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [editingPOId, setEditingPOId] = useState<string | null>(null);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);

  // Bills state
  const [showBillForm, setShowBillForm] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [paymentToPay, setPaymentToPay] = useState<BillPayment | null>(null);

  // Fetch all data when branch changes
  useEffect(() => {
    if (activeBranch) {
      fetchVendors(activeBranch);
      fetchPurchaseOrders(activeBranch);
      fetchBills(activeBranch);
      fetchPayments(activeBranch);
    }
  }, [activeBranch, fetchVendors, fetchPurchaseOrders, fetchBills, fetchPayments]);

  // Auto-generate upcoming payments
  useEffect(() => {
    if (activeBranch && bills.length > 0) {
      generateUpcomingPayments(activeBranch);
    }
  }, [activeBranch, bills.length, generateUpcomingPayments]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <BrandLoader size="lg" />
      </div>
    );
  }

  const activeBranchName = branches.find(b => b.id === activeBranch)?.name || 'Unknown Branch';
  const billStats = getBillStats();

  // Clear search when switching tabs
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchQuery("");
  };

  // Action button based on active tab
  const getActionButton = () => {
    switch (activeTab) {
      case 'vendors':
        return (
          <Button size="sm" onClick={() => setShowVendorForm(true)} className="whitespace-nowrap">
            <Plus className="h-4 w-4 mr-1" /> Add Vendor
          </Button>
        );
      case 'purchase-orders':
        return (
          <Button size="sm" onClick={() => setShowPOForm(true)} className="whitespace-nowrap">
            <Plus className="h-4 w-4 mr-1" /> New PO
          </Button>
        );
      case 'recurring-bills':
        return (
          <Button size="sm" onClick={() => setShowBillForm(true)} className="whitespace-nowrap">
            <Plus className="h-4 w-4 mr-1" /> Add Bill
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Procurement & Bills</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage vendors, purchase orders, recurring bills, and payments — {activeBranchName}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleTabChange('vendors')}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <Store className="h-4 w-4 text-blue-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vendors</p>
              <p className="text-lg font-bold">{vendors.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleTabChange('purchase-orders')}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <ShoppingCart className="h-4 w-4 text-purple-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active POs</p>
              <p className="text-lg font-bold">
                {purchaseOrders.filter(po => !['completed', 'cancelled', 'rejected'].includes(po.status)).length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleTabChange('recurring-bills')}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              <Activity className="h-4 w-4 text-green-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Bills</p>
              <p className="text-lg font-bold">{billStats.active}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleTabChange('payments')}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100">
              <AlertTriangle className="h-4 w-4 text-red-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className="text-lg font-bold text-red-600">{billStats.overdue}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100">
              <TrendingUp className="h-4 w-4 text-emerald-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Monthly Spend</p>
              <p className="text-lg font-bold">₹{Math.round(billStats.totalMonthly).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="vendors" className="flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5" />
              Vendors
            </TabsTrigger>
            <TabsTrigger value="purchase-orders" className="flex items-center gap-1.5">
              <ShoppingCart className="h-3.5 w-3.5" />
              Purchase Orders
            </TabsTrigger>
            <TabsTrigger value="recurring-bills" className="flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5" />
              Recurring Bills
            </TabsTrigger>
            <TabsTrigger value="payments" className="flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              Payments
              {billStats.overdue > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full">
                  {billStats.overdue}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                className="pl-8"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            {getActionButton()}
          </div>
        </div>

        {/* Tab Contents */}
        <TabsContent value="vendors" className="mt-6">
          <VendorList
            searchQuery={searchQuery}
            onEdit={(id) => { setEditingVendorId(id); setShowVendorForm(true); }}
          />
        </TabsContent>

        <TabsContent value="purchase-orders" className="mt-6">
          <PurchaseOrderList
            searchQuery={searchQuery}
            onView={(po) => setSelectedPO(po)}
            onCreateNew={() => setShowPOForm(true)}
          />
        </TabsContent>

        <TabsContent value="recurring-bills" className="mt-6">
          <RecurringBillsList
            searchQuery={searchQuery}
            onEdit={(id) => { setEditingBillId(id); setShowBillForm(true); }}
          />
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          <PaymentsList
            searchQuery={searchQuery}
            onMarkPaid={(payment) => setPaymentToPay(payment)}
          />
        </TabsContent>
      </Tabs>

      {/* ===== DIALOGS ===== */}

      {/* Vendor Form */}
      <Dialog open={showVendorForm} onOpenChange={(open) => {
        if (!open) { setShowVendorForm(false); setEditingVendorId(null); }
      }}>
        <DialogContent className="max-w-[1165px] w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVendorId ? 'Edit Vendor' : 'Add New Vendor'}</DialogTitle>
          </DialogHeader>
          <VendorForm
            vendorId={editingVendorId}
            branchId={activeBranch}
            onSuccess={() => { setShowVendorForm(false); setEditingVendorId(null); fetchVendors(activeBranch); }}
            onCancel={() => { setShowVendorForm(false); setEditingVendorId(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Purchase Order Form — same dialog serves create and edit */}
      <Dialog open={showPOForm} onOpenChange={(open) => {
        if (!open) { setShowPOForm(false); setEditingPOId(null); }
      }}>
        <DialogContent className="max-w-[1152px] w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPOId ? 'Edit Purchase Order' : 'Create Purchase Order'}</DialogTitle>
          </DialogHeader>
          <PurchaseOrderForm
            key={editingPOId ?? 'new'}
            poId={editingPOId}
            branchId={activeBranch}
            onSuccess={() => { setShowPOForm(false); setEditingPOId(null); fetchPurchaseOrders(activeBranch); }}
            onCancel={() => { setShowPOForm(false); setEditingPOId(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Purchase Order Detail */}
      <Dialog open={!!selectedPO} onOpenChange={() => setSelectedPO(null)}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Purchase Order - {selectedPO?.po_number}</DialogTitle>
          </DialogHeader>
          {selectedPO && (
            <PurchaseOrderDetail
              purchaseOrder={selectedPO}
              onClose={() => setSelectedPO(null)}
              onStatusChange={() => { fetchPurchaseOrders(activeBranch); setSelectedPO(null); }}
              onEdit={(po) => {
                // Close the detail view first so the two dialogs never stack.
                setSelectedPO(null);
                setEditingPOId(po.id);
                setShowPOForm(true);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Bill Form */}
      <Dialog open={showBillForm} onOpenChange={(open) => {
        if (!open) { setShowBillForm(false); setEditingBillId(null); }
      }}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBillId ? 'Edit Bill' : 'Add Recurring Bill'}</DialogTitle>
          </DialogHeader>
          <BillForm
            billId={editingBillId}
            branchId={activeBranch}
            onSuccess={() => { setShowBillForm(false); setEditingBillId(null); fetchBills(activeBranch); generateUpcomingPayments(activeBranch); }}
            onCancel={() => { setShowBillForm(false); setEditingBillId(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Payment Dialog — wide enough for the 3-column meter reading grids */}
      <Dialog open={!!paymentToPay} onOpenChange={() => setPaymentToPay(null)}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {bills.find(b => b.id === paymentToPay?.bill_id)?.category === 'rent'
                ? 'Pay Rent & Utilities'
                : 'Record Payment'}
            </DialogTitle>
          </DialogHeader>
          {paymentToPay && (
            <PaymentDialog
              payment={paymentToPay}
              onSuccess={() => { setPaymentToPay(null); fetchPayments(activeBranch); }}
              onCancel={() => setPaymentToPay(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
