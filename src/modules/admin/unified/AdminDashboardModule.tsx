'use client';
import { useState, useEffect, lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnhancedButton as Button } from "@/components/ui/enhanced-button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useBranch } from "@/contexts/BranchContext";
import { BrandLoader } from "@/components/ui/brand-loader";
import { useTabWithHash } from "@/hooks/useTabWithHash";
import { 
  BarChart3, 
  Library, 
  FileCog, 
  Clock, 
  FileSearch, 
  Settings, 
  FileBarChart2, 
  FileSpreadsheet, 
  ShieldCheck,
  Building2, 
  Search, 
  Users, 
  Filter, 
  RefreshCw,
  Activity,
  Bell,
  Database,
  LayoutGrid
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getSoundBus } from "@/services/SoundService";
import { DepartmentOverview } from "./DepartmentOverview";

// Lazy-loaded components for better performance
// Dashboard components
const ReportsDashboard = lazy(() => import('../../reports/components/ReportsDashboard').then(module => ({ default: module.ReportsDashboard })));
const ReportLibrary = lazy(() => import('../../reports/components/ReportLibrary').then(module => ({ default: module.ReportLibrary })));
const ReportBuilder = lazy(() => import('../../reports/components/ReportBuilder').then(module => ({ default: module.ReportBuilder })));
const ScheduledReports = lazy(() => import('../../reports/components/ScheduledReports').then(module => ({ default: module.ScheduledReports })));
const AdHocQuery = lazy(() => import('../../reports/components/AdHocQuery').then(module => ({ default: module.AdHocQuery })));
const ReportsSettings = lazy(() => import('../../reports/components/ReportsSettings').then(module => ({ default: module.ReportsSettings })));
const ComplianceReports = lazy(() => import('../../reports/components/ComplianceReports').then(module => ({ default: module.ComplianceReports })));
const ModuleSelector = lazy(() => import('../../reports/components/ModuleSelector').then(module => ({ default: module.ModuleSelector })));
const DataWarehouseStatus = lazy(() => import('../../reports/components/DataWarehouseStatus').then(module => ({ default: module.DataWarehouseStatus })));

// Control Centre components - Fixed import paths
const BranchManager = lazy(() => import('@/components/admin/control-centre/BranchManager').then(module => ({ default: module.BranchManager })));
const UserRolesManager = lazy(() => import('@/components/admin/control-centre/UserRolesManager').then(module => ({ default: module.UserRolesManager })));
const AdminSettings = lazy(() => import('@/components/admin/control-centre/EmailNotificationSettings').then(module => ({ default: module.EmailNotificationSettings })));
const ActivityAudit = lazy(() => import('@/components/admin/control-centre/ActivityAudit').then(module => ({ default: module.ActivityAudit })));
const ClientUserManager = lazy(() => import('@/components/admin/control-centre/ClientUserManager').then(module => ({ default: module.ClientUserManager })));
const EmployeeUserManager = lazy(() => import('@/components/admin/control-centre/EmployeeUserManager').then(module => ({ default: module.EmployeeUserManager })));

// Loading fallback — skeleton for dashboard panels
const LoadingFallback = () => (
  <div className="space-y-4 animate-pulse p-4 w-full">
    {/* KPI row */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card/50 p-5 space-y-3">
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
    {/* Chart area */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-lg border bg-card/50 p-6 space-y-3">
        <div className="h-5 w-36 rounded bg-muted" />
        <div className="h-48 w-full rounded-lg bg-muted" />
      </div>
      <div className="rounded-lg border bg-card/50 p-6 space-y-3">
        <div className="h-5 w-36 rounded bg-muted" />
        <div className="h-48 w-full rounded-lg bg-muted" />
      </div>
    </div>
  </div>
);

// Main component
export function AdminDashboardModule() {
  const [activeMainTab, setActiveMainTab] = useTabWithHash("overview", ["overview", "reports", "control"]);
  const [activeDashboardTab, setActiveDashboardTab] = useTabWithHash("library", ["library", "settings"], "reportTab");
  const [activeControlTab, setActiveControlTab] = useTabWithHash(
    "branch-manager",
    ["branch-manager", "users-roles", "client-portal", "employee-portal", "admin-settings", "activity-audit"],
    "controlTab"
  );
  
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const { currentBranch, isMainBranch, isMainBranchUser } = useBranch();
  
  // Play welcome sound when dashboard loads
  useEffect(() => {
    if (typeof window !== 'undefined') getSoundBus().play('welcome');
  }, []);
  
  // Handle refresh button click
  const handleRefresh = () => {
    setIsRefreshing(true);
    if (typeof window !== 'undefined') getSoundBus().play('click');
    
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  };
  
  return (
      <div className="w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            {/* Title rendered by persistent ModuleHeaderBar in PersistentLayout */}
            {currentBranch?.id !== 'main' && (
              <p className="text-sm text-muted-foreground">
                Managing branch: {currentBranch?.name} ({currentBranch?.code})
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Dashboard Controls</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Database className="mr-2 h-4 w-4" /> Database Status
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Bell className="mr-2 h-4 w-4" /> Notification Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        {/* Main Tab Navigation */}
        <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="w-full">
          <TabsList className={`grid ${isMainBranchUser ? 'grid-cols-3' : 'grid-cols-2'} w-full`} data-module-primary-tabs="">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-2">
              <FileBarChart2 className="h-4 w-4" />
              <span>Reports</span>
            </TabsTrigger>
            {isMainBranchUser && (
              <TabsTrigger value="control" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span>Control Centre</span>
              </TabsTrigger>
            )}
          </TabsList>

          <Separator className="my-4" />
          
          {/* Overview Content — now shows the Reports Dashboard (KPIs + Charts) */}
          <TabsContent value="overview" className="space-y-4 animate-in fade-in-50">
            <Suspense fallback={<LoadingFallback />}>
              <ReportsDashboard selectedModule={selectedModule} />
            </Suspense>
          </TabsContent>
          
          {/* Reports Content — Report Library + Settings */}
          <TabsContent value="reports" className="space-y-4 animate-in fade-in-50">
            <Tabs value={activeDashboardTab} onValueChange={setActiveDashboardTab} className="w-full">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <TabsList className="md:w-auto w-full">
                  <TabsTrigger value="library" className="flex items-center gap-1">
                    <Library className="h-4 w-4" />
                    <span className="hidden md:inline">Report Library</span>
                    <span className="md:hidden">Library</span>
                  </TabsTrigger>
                  <TabsTrigger value="settings" className="flex items-center gap-1">
                    <Settings className="h-4 w-4" />
                    <span className="hidden md:inline">Settings</span>
                    <span className="md:hidden">Settings</span>
                  </TabsTrigger>
                </TabsList>
                
                <Suspense fallback={<div className="h-10" />}>
                  <ModuleSelector onModuleChange={setSelectedModule} selectedModule={selectedModule} />
                </Suspense>
              </div>

              <Suspense fallback={<LoadingFallback />}>
                <TabsContent value="library" className="space-y-4 animate-in fade-in-50">
                  <ReportLibrary moduleFilter={selectedModule} />
                </TabsContent>

                <TabsContent value="settings" className="space-y-4 animate-in fade-in-50">
                  <ReportsSettings />
                </TabsContent>
              </Suspense>
            </Tabs>
          </TabsContent>
          
          {/* Control Centre Content */}
          <TabsContent value="control" className="space-y-4 animate-in fade-in-50">
            <Tabs value={activeControlTab} onValueChange={setActiveControlTab} className="w-full">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <TabsList className="grid grid-cols-6 w-full">
                  <TabsTrigger value="branch-manager" className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Branch Manager</span>
                    <span className="sm:hidden">Branch</span>
                  </TabsTrigger>
                  <TabsTrigger value="users-roles" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span className="hidden sm:inline">Users & Roles</span>
                    <span className="sm:hidden">Users</span>
                  </TabsTrigger>
                  <TabsTrigger value="client-portal" className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Client Portal</span>
                    <span className="sm:hidden">Clients</span>
                  </TabsTrigger>
                  <TabsTrigger value="employee-portal" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span className="hidden sm:inline">Supervisor Portal</span>
                    <span className="sm:hidden">Supervisors</span>
                  </TabsTrigger>
                  <TabsTrigger value="admin-settings" className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    <span className="hidden sm:inline">Notifications</span>
                    <span className="sm:hidden">Notify</span>
                  </TabsTrigger>
                  <TabsTrigger value="activity-audit" className="flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    <span className="hidden sm:inline">Activity & Audit</span>
                    <span className="sm:hidden">Audit</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              {activeControlTab === "branch-manager" && (
                <div className="flex flex-col md:flex-row gap-4 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search branches..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              )}

              <Suspense fallback={<LoadingFallback />}>
                <TabsContent value="branch-manager" className="p-0 w-full">
                  <BranchManager searchTerm={searchTerm} />
                </TabsContent>

                <TabsContent value="users-roles" className="p-0 w-full">
                  <UserRolesManager />
                </TabsContent>

                <TabsContent value="client-portal" className="p-0 w-full">
                  <ClientUserManager />
                </TabsContent>

                <TabsContent value="employee-portal" className="p-0 w-full">
                  <EmployeeUserManager />
                </TabsContent>

                <TabsContent value="admin-settings" className="p-0 w-full">
                  <AdminSettings />
                </TabsContent>
                
                <TabsContent value="activity-audit" className="p-0 w-full">
                  <ActivityAudit />
                </TabsContent>
              </Suspense>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>
  );
}
