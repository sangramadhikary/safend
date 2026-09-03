'use client';

import { lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandLoader } from "@/components/ui/brand-loader";
import { useTabWithHash } from "@/hooks/useTabWithHash";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

// Lazy load all Office Admin components
const BranchDashboard = lazy(() => import("./components/BranchDashboard").then(mod => ({ default: mod.BranchDashboard })));
const InventoryDashboard = lazy(() => import("./components/inventory/InventoryDashboard").then(mod => ({ default: mod.InventoryDashboard })));
const ProcurementModule = lazy(() => import("./components/procurement/ProcurementModule").then(mod => ({ default: mod.ProcurementModule })));
const FacilitiesFleet = lazy(() => import("./components/FacilitiesFleet").then(mod => ({ default: mod.FacilitiesFleet })));
const DocumentPolicy = lazy(() => import("./components/documents/DocumentPolicyModule").then(mod => ({ default: mod.DocumentPolicyModule })));

// Loading fallback — structured skeleton for tab content
const LoadingFallback = () => (
  <div className="space-y-4 animate-pulse p-2">
    {/* Stat cards row */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card/50 p-6 space-y-3">
          <div className="flex justify-between">
            <div className="space-y-2 flex-1">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-8 w-16 rounded bg-muted mt-2" />
              <div className="h-3 w-20 rounded bg-muted" />
            </div>
            <div className="h-10 w-10 rounded-lg bg-muted shrink-0" />
          </div>
        </div>
      ))}
    </div>
    {/* Chart placeholder */}
    <div className="rounded-lg border bg-card/50 p-6 space-y-3">
      <div className="h-5 w-36 rounded bg-muted" />
      <div className="h-48 w-full rounded-lg bg-muted mt-2" />
    </div>
  </div>
);

export function OfficeAdminModule() {
  const [activeTab, setActiveTab] = useTabWithHash("dashboard", [
    "dashboard",
    "inventory",
    "procurement",
    "facilities",
    "documents",
  ]);

  return (
      <div className="space-y-6">
        <div className="flex flex-col space-y-2">
          {/* Title rendered by persistent ModuleHeaderBar in PersistentLayout */}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <ScrollArea className="w-full" data-module-primary-tabs="">
            <TabsList className="inline-flex w-full h-auto bg-card p-1 mb-8 min-w-max">
              <TabsTrigger value="dashboard" className="grow whitespace-nowrap">
                Branch Dashboard
              </TabsTrigger>
              <TabsTrigger value="inventory" className="grow whitespace-nowrap">
                Inventory
              </TabsTrigger>
              <TabsTrigger value="procurement" className="grow whitespace-nowrap">
                Procurement & Bills
              </TabsTrigger>
              <TabsTrigger value="facilities" className="grow whitespace-nowrap">
                Fleet & Properties
              </TabsTrigger>
              <TabsTrigger value="documents" className="grow whitespace-nowrap">
                Documents & Policy
              </TabsTrigger>
            </TabsList>
            <ScrollBar orientation="horizontal" className="invisible" />
          </ScrollArea>

          <Suspense fallback={<LoadingFallback />}>
            <TabsContent value="dashboard" className="mt-0">
              <BranchDashboard />
            </TabsContent>
            
            <TabsContent value="inventory" className="mt-0">
              <InventoryDashboard />
            </TabsContent>
            
            <TabsContent value="procurement" className="mt-0">
              <ProcurementModule />
            </TabsContent>
            
            <TabsContent value="facilities" className="mt-0">
              <FacilitiesFleet />
            </TabsContent>
            
            <TabsContent value="documents" className="mt-0">
              <DocumentPolicy />
            </TabsContent>
            
          </Suspense>
        </Tabs>
      </div>
  );
}
