'use client';

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppData } from "@/contexts/AppDataContext";
import { BrandLoader } from "@/components/ui/brand-loader";
import { useVendorStore } from "./vendorStore";
import { VendorList } from "./VendorList";
import { VendorForm } from "./VendorForm";
import { PurchaseOrderList } from "./PurchaseOrderList";
import { PurchaseOrderForm } from "./PurchaseOrderForm";
import { PurchaseOrderDetail } from "./PurchaseOrderDetail";
import { PurchaseOrder } from "./types";
import {
  Store, ShoppingCart, Plus, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function VendorManagement() {
  const { activeBranch, branches, isLoading } = useAppData();
  const { fetchVendors, fetchPurchaseOrders } = useVendorStore();
  
  const [activeTab, setActiveTab] = useState("vendors");
  const [searchQuery, setSearchQuery] = useState("");
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [showPOForm, setShowPOForm] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);

  // Fetch data when branch changes
  useEffect(() => {
    if (activeBranch) {
      fetchVendors(activeBranch);
      fetchPurchaseOrders(activeBranch);
    }
  }, [activeBranch, fetchVendors, fetchPurchaseOrders]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <BrandLoader size="lg" />
      </div>
    );
  }

  const activeBranchName = branches.find(b => b.id === activeBranch)?.name || 'Unknown Branch';

  const handleVendorFormSuccess = () => {
    setShowVendorForm(false);
    setEditingVendorId(null);
    fetchVendors(activeBranch);
  };

  const handlePOFormSuccess = () => {
    setShowPOForm(false);
    fetchPurchaseOrders(activeBranch);
  };

  const handleEditVendor = (vendorId: string) => {
    setEditingVendorId(vendorId);
    setShowVendorForm(true);
  };

  const handleViewPO = (po: PurchaseOrder) => {
    setSelectedPO(po);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Vendor & Purchase Management</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage vendors, create purchase orders, and track approvals — {activeBranchName}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="vendors" className="flex items-center gap-2">
              <Store className="h-4 w-4" />
              Vendors
            </TabsTrigger>
            <TabsTrigger value="purchase-orders" className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Purchase Orders
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={activeTab === "vendors" ? "Search vendors..." : "Search POs..."}
                className="pl-8"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              onClick={() => activeTab === "vendors" ? setShowVendorForm(true) : setShowPOForm(true)}
              className="whitespace-nowrap"
            >
              <Plus className="h-4 w-4 mr-1" />
              {activeTab === "vendors" ? "Add Vendor" : "New PO"}
            </Button>
          </div>
        </div>

        <TabsContent value="vendors" className="mt-6">
          <VendorList
            searchQuery={searchQuery}
            onEdit={handleEditVendor}
          />
        </TabsContent>

        <TabsContent value="purchase-orders" className="mt-6">
          <PurchaseOrderList
            searchQuery={searchQuery}
            onView={handleViewPO}
            onCreateNew={() => setShowPOForm(true)}
          />
        </TabsContent>
      </Tabs>

      {/* Vendor Form Dialog */}
      <Dialog open={showVendorForm} onOpenChange={(open) => {
        if (!open) {
          setShowVendorForm(false);
          setEditingVendorId(null);
        }
      }}>
        <DialogContent className="max-w-[1165px] w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVendorId ? 'Edit Vendor' : 'Add New Vendor'}</DialogTitle>
          </DialogHeader>
          <VendorForm
            vendorId={editingVendorId}
            branchId={activeBranch}
            onSuccess={handleVendorFormSuccess}
            onCancel={() => { setShowVendorForm(false); setEditingVendorId(null); }}
          />
        </DialogContent>
      </Dialog>

      {/* Purchase Order Form Dialog */}
      <Dialog open={showPOForm} onOpenChange={setShowPOForm}>
        <DialogContent className="max-w-[1152px] w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Purchase Order</DialogTitle>
          </DialogHeader>
          <PurchaseOrderForm
            branchId={activeBranch}
            onSuccess={handlePOFormSuccess}
            onCancel={() => setShowPOForm(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Purchase Order Detail Dialog */}
      <Dialog open={!!selectedPO} onOpenChange={() => setSelectedPO(null)}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Purchase Order - {selectedPO?.po_number}</DialogTitle>
          </DialogHeader>
          {selectedPO && (
            <PurchaseOrderDetail
              purchaseOrder={selectedPO}
              onClose={() => setSelectedPO(null)}
              onStatusChange={() => {
                fetchPurchaseOrders(activeBranch);
                setSelectedPO(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
