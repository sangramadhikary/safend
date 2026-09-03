'use client';

import { Suspense, lazy } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClientPortalLayout } from "./components/ClientPortalLayout";
import { useTabWithHash } from "@/hooks/useTabWithHash";
import {
  LayoutDashboard, FileText, Users, AlertTriangle,
  CreditCard, Download
} from "lucide-react";

// Lazy-loaded tab components
const ClientDashboard = lazy(() => import("./components/ClientDashboard"));
const ClientInvoices = lazy(() => import("./components/ClientInvoices"));
const ClientAttendance = lazy(() => import("./components/ClientAttendance"));
const ClientIncidents = lazy(() => import("./components/ClientIncidents"));
const ClientPayments = lazy(() => import("./components/ClientPayments"));
const ClientCompliance = lazy(() => import("./components/ClientCompliance"));

const portalTabs = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "attendance", label: "Attendance", icon: Users },
  { id: "incidents", label: "Report Incident", icon: AlertTriangle },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "compliance", label: "Compliance Docs", icon: Download },
];

function TabLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-gray-100 dark:bg-gray-800" />
    </div>
  );
}

export function ClientPortalModule() {
  const [activeTab, setActiveTab] = useTabWithHash(
    "dashboard",
    portalTabs.map((t) => t.id)
  );

  return (
    <ClientPortalLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground dark:text-white">
            Client Portal
          </h1>
          <p className="text-sm text-muted-foreground dark:text-gray-400 mt-1">
            View invoices, attendance, report incidents, and manage payments
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <ScrollArea className="w-full">
            <TabsList className="inline-flex md:grid md:grid-cols-6 gap-1 w-full bg-gray-100 dark:bg-gray-800/50 p-1 rounded-lg min-w-max">
              {portalTabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex gap-2 items-center transition-all duration-200 text-xs sm:text-sm"
                >
                  <tab.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </ScrollArea>

          <div className="mt-6">
            <TabsContent value="dashboard">
              <Suspense fallback={<TabLoading />}>
                <ClientDashboard />
              </Suspense>
            </TabsContent>

            <TabsContent value="invoices">
              <Suspense fallback={<TabLoading />}>
                <ClientInvoices />
              </Suspense>
            </TabsContent>

            <TabsContent value="attendance">
              <Suspense fallback={<TabLoading />}>
                <ClientAttendance />
              </Suspense>
            </TabsContent>

            <TabsContent value="incidents">
              <Suspense fallback={<TabLoading />}>
                <ClientIncidents />
              </Suspense>
            </TabsContent>

            <TabsContent value="payments">
              <Suspense fallback={<TabLoading />}>
                <ClientPayments />
              </Suspense>
            </TabsContent>

            <TabsContent value="compliance">
              <Suspense fallback={<TabLoading />}>
                <ClientCompliance />
              </Suspense>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </ClientPortalLayout>
  );
}
