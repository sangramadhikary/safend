'use client';
import React, { useState, lazy, Suspense, useEffect, useRef } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { ModuleHeader } from "@/components/ui/module-header";
import { ModuleCard } from "@/components/ui/module-card";
import { usePermissions } from "@/hooks/operations/usePermissions";
import { BrandLoader } from "@/components/ui/brand-loader";
import { useWebSocket } from "@/hooks/operations/useWebSocket";
import { useTabWithHash } from "@/hooks/useTabWithHash";
import { WS_BASE_URL } from "@/config";
import { Bell, Calendar, FileText, Users, Clipboard, BarChart3, Utensils, Shield, MapPin } from "lucide-react";
import { PermissionType } from "@/types/operations";

// Lazy load all heavy components
const OperationsDashboard = lazy(() => import("./components/OperationsDashboard").then(mod => ({ default: mod.OperationsDashboard })));
const PostsDetails = lazy(() => import("./components/PostsDetails").then(mod => ({ default: mod.PostsDetails })));
const Deployments = lazy(() => import("./components/Deployments").then(mod => ({ default: mod.Deployments })));
const AttendanceManagement = lazy(() => import("./components/AttendanceManagement").then(mod => ({ default: mod.AttendanceManagement })));
const LeaveManagement = lazy(() => import("./components/LeaveManagement").then(mod => ({ default: mod.LeaveManagement })));
const PatrolManagement = lazy(() => import("./components/PatrolManagement").then(mod => ({ default: mod.PatrolManagement })));
const MessManagement = lazy(() => import("./components/MessManagement").then(mod => ({ default: mod.MessManagement })));
const ReportsCenter = lazy(() => import("./components/ReportsCenter").then(mod => ({ default: mod.ReportsCenter })));

// Loading fallback — skeleton matching operations tab content
const LoadingFallback = () => (
  <div className="space-y-4 animate-pulse">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card/50 p-6 space-y-2">
          <div className="flex justify-between">
            <div className="space-y-2 flex-1">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-8 w-16 rounded bg-muted" />
            </div>
            <div className="h-9 w-9 rounded-lg bg-muted" />
          </div>
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-2 rounded-lg border bg-card/50 p-6 space-y-3">
        <div className="h-5 w-32 rounded bg-muted" />
        <div className="h-48 w-full rounded-lg bg-muted" />
      </div>
      <div className="rounded-lg border bg-card/50 p-6 space-y-3">
        <div className="h-5 w-28 rounded bg-muted" />
        <div className="h-48 w-full rounded-lg bg-muted" />
      </div>
    </div>
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, r) => (
        <div key={r} className="flex gap-4 px-4 py-3 border-t border-border/30">
          {Array.from({ length: 5 }).map((_, c) => (
            <div key={c} className="h-4 flex-1 rounded bg-muted" />
          ))}
        </div>
      ))}
    </div>
  </div>
);

// Operation module tabs
const operationsTabs = [
  { id: "dashboard", label: "Ground Reality", icon: BarChart3, permission: null }, // All users can see dashboard
  { id: "posts", label: "Post Details", icon: MapPin, permission: "POST_MANAGEMENT" as PermissionType },
  { id: "deployments", label: "Deployments", icon: Shield, permission: "POST_MANAGEMENT" as PermissionType },
  { id: "attendance", label: "Attendance", icon: Users, permission: "ATTENDANCE_MANAGEMENT" as PermissionType },
  { id: "leave", label: "Leave", icon: Calendar, permission: "LEAVE_MANAGEMENT" as PermissionType },
  { id: "fieldops", label: "Field Ops", icon: Clipboard, permission: "PATROL_MANAGEMENT" as PermissionType },
  { id: "mess", label: "Mess", icon: Utensils, permission: "MESS_MANAGEMENT" as PermissionType },
  { id: "reports", label: "Reports", icon: FileText, permission: "REPORTS_ACCESS" as PermissionType },
];

export function OperationsModule() {
  const validTabs = operationsTabs.map(t => t.id);
  const [activeTab, setActiveTab] = useTabWithHash("dashboard", validTabs);
  const [presetDate, setPresetDate] = useState<string | null>(null);
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  
  // Connect to WebSocket for real-time updates
  const { isConnected, lastMessage } = useWebSocket(`${WS_BASE_URL}/operations`);
  
  // Ref-based event handler to always read latest state without re-subscribing
  const setActiveTabRef = useRef(setActiveTab);
  setActiveTabRef.current = setActiveTab;
  const setPresetDateRef = useRef(setPresetDate);
  setPresetDateRef.current = setPresetDate;

  // Listen for tab switch events from other components (e.g., missed days banner)
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ tab: string; date?: string }>).detail;
      if (detail?.tab) {
        setActiveTabRef.current(detail.tab);
        if (detail.date) setPresetDateRef.current(detail.date);
      }
    };
    window.addEventListener('switchOpsTab', handler);
    return () => window.removeEventListener('switchOpsTab', handler);
  }, []);
  
  // Filter tabs based on user permissions
  const filteredTabs = operationsTabs.filter(tab => 
    tab.permission === null || hasPermission(tab.permission)
  );

  const handleTabChange = (value: string) => {
    if (value === activeTab) return;
    setActiveTab(value);
  };

  if (permissionsLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)] bg-white dark:bg-gray-950 rounded-lg">
        <BrandLoader size="lg" message="Loading permissions..." />
      </div>
    );
  }

  return (
      <div className="space-y-6 page-transition">
        <ModuleHeader 
          title="Operations Management"
          description="Comprehensive field operations management for security services"
          actionLabel={
            isConnected 
              ? "Connected to Real-time Updates" 
              : "Connecting to Real-time Updates..."
          }
          actionIcon={
            <Bell className={`h-4 w-4 ${isConnected ? "text-green-500" : "text-yellow-500"}`} />
          }
        />
        
        <ModuleCard>
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800" data-module-primary-tabs="">
              <ScrollArea className="w-full">
                <TabsList className="inline-flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg flex-wrap">
                  {filteredTabs.map(tab => (
                    <TabsTrigger 
                      key={tab.id} 
                      value={tab.id} 
                      className="flex gap-2 items-center transition-all duration-200"
                    >
                      <tab.icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
                <ScrollBar orientation="horizontal" className="invisible" />
              </ScrollArea>
            </div>
            
            <ScrollArea className="h-[calc(100vh-250px)]">
                <div className="p-6">
                  <Suspense fallback={<LoadingFallback />}>
                    <TabsContent value="dashboard" className="animate-in fade-in-50 mt-0">
                      <OperationsDashboard lastMessage={lastMessage} />
                    </TabsContent>
                    
                    <TabsContent value="deployments" className="animate-in fade-in-50 mt-0">
                      {/* `presetDate` carries the date across a tab hand-off, so
                          "Deploy this post" from Attendance lands on the day being
                          marked rather than on today. */}
                      <Deployments presetDate={presetDate} />
                    </TabsContent>

                    <TabsContent value="posts" className="animate-in fade-in-50 mt-0">
                      <PostsDetails />
                    </TabsContent>
                    
                    <TabsContent value="attendance" className="animate-in fade-in-50 mt-0">
                      <AttendanceManagement presetDate={presetDate} />
                    </TabsContent>
                    
                    <TabsContent value="leave" className="animate-in fade-in-50 mt-0">
                      <LeaveManagement />
                    </TabsContent>
                    
                    <TabsContent value="fieldops" className="animate-in fade-in-50 mt-0">
                      <PatrolManagement />
                    </TabsContent>
                    
                    <TabsContent value="mess" className="animate-in fade-in-50 mt-0">
                      <MessManagement />
                    </TabsContent>
                    
                    <TabsContent value="reports" className="animate-in fade-in-50 mt-0">
                      <ReportsCenter />
                    </TabsContent>
                  </Suspense>
                </div>
              </ScrollArea>
          </Tabs>
        </ModuleCard>
      </div>
  );
}
