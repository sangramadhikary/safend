'use client';

import { useState, useEffect, lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnhancedButton as Button } from "@/components/ui/enhanced-button";
import { Separator } from "@/components/ui/separator";
import { BarChart3, Library, FileCog, Clock, FileSearch, Settings, FileBarChart2, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { WelcomeAnimation } from "@/components/dashboard/WelcomeAnimation";
import { BrandLoader } from "@/components/ui/brand-loader";

// Lazy-loaded components for better performance
const ReportsDashboard = lazy(() => import('../reports/components/ReportsDashboard').then(module => ({ default: module.ReportsDashboard })));
const ReportLibrary = lazy(() => import('../reports/components/ReportLibrary').then(module => ({ default: module.ReportLibrary })));
const ReportBuilder = lazy(() => import('../reports/components/ReportBuilder').then(module => ({ default: module.ReportBuilder })));
const ScheduledReports = lazy(() => import('../reports/components/ScheduledReports').then(module => ({ default: module.ScheduledReports })));
const AdHocQuery = lazy(() => import('../reports/components/AdHocQuery').then(module => ({ default: module.AdHocQuery })));
const ReportsSettings = lazy(() => import('../reports/components/ReportsSettings').then(module => ({ default: module.ReportsSettings })));
const ComplianceReports = lazy(() => import('../reports/components/ComplianceReports').then(module => ({ default: module.ComplianceReports })));
const ModuleSelector = lazy(() => import('../reports/components/ModuleSelector').then(module => ({ default: module.ModuleSelector })));
const DataWarehouseStatus = lazy(() => import('../reports/components/DataWarehouseStatus').then(module => ({ default: module.DataWarehouseStatus })));

// Loading fallback with brand loader
const LoadingFallback = () => (
  <div className="p-4 w-full h-48 flex items-center justify-center bg-white dark:bg-gray-950 rounded-lg">
    <BrandLoader size="md" />
  </div>
);

export function DashboardModule() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);
  
  // Hide welcome animation after first load
  useEffect(() => {
    const hasSeenWelcome = sessionStorage.getItem('hasSeenWelcome');
    setShowWelcome(!hasSeenWelcome);
    
    if (!hasSeenWelcome) {
      sessionStorage.setItem('hasSeenWelcome', 'true');
    }
  }, []);

  // Optimized tab change handler
  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };
  
  return (
    <>
      {showWelcome && <WelcomeAnimation />}
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
              <p className="text-muted-foreground">
                Overview of metrics and operations across all business modules
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Suspense fallback={<LoadingFallback />}>
                <ModuleSelector onModuleChange={setSelectedModule} selectedModule={selectedModule} />
                <DataWarehouseStatus />
              </Suspense>
            </div>
          </div>

          <Tabs defaultValue="dashboard" value={activeTab} onValueChange={handleTabChange} className="space-y-4">
            <TabsList className="grid grid-cols-2 md:grid-cols-7 gap-1 md:w-auto w-full">
              <TabsTrigger value="dashboard" className="flex items-center gap-1">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden md:inline">Overview</span>
                <span className="md:hidden">Overview</span>
              </TabsTrigger>
              <TabsTrigger value="library" className="flex items-center gap-1">
                <Library className="h-4 w-4" />
                <span className="hidden md:inline">Report Library</span>
                <span className="md:hidden">Library</span>
              </TabsTrigger>
              <TabsTrigger value="compliance" className="flex items-center gap-1">
                <ShieldCheck className="h-4 w-4" />
                <span className="hidden md:inline">Compliance</span>
                <span className="md:hidden">Comply</span>
              </TabsTrigger>
              <TabsTrigger value="builder" className="flex items-center gap-1">
                <FileCog className="h-4 w-4" />
                <span className="hidden md:inline">Report Builder</span>
                <span className="md:hidden">Builder</span>
              </TabsTrigger>
              <TabsTrigger value="scheduled" className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span className="hidden md:inline">Scheduled</span>
                <span className="md:hidden">Sched</span>
              </TabsTrigger>
              <TabsTrigger value="adhoc" className="flex items-center gap-1">
                <FileSearch className="h-4 w-4" />
                <span className="hidden md:inline">Ad-Hoc Query</span>
                <span className="md:hidden">Query</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-1">
                <Settings className="h-4 w-4" />
                <span className="hidden md:inline">Settings</span>
                <span className="md:hidden">Settings</span>
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2 justify-end">
              <div>
                {activeTab !== "dashboard" && <Button variant="outline" size="sm" className="flex items-center gap-1" soundEffect="download">
                  <FileBarChart2 className="h-4 w-4" />
                  Export PDF
                </Button>}
                {activeTab !== "dashboard" && <Button variant="outline" size="sm" className="flex items-center gap-1 ml-2" soundEffect="download">
                  <FileSpreadsheet className="h-4 w-4" />
                  Export Excel
                </Button>}
                {activeTab === "dashboard" && <Button variant="outline" size="sm">
                  Customize Dashboard
                </Button>}
              </div>
            </div>
            
            <Separator />

            <Suspense fallback={<LoadingFallback />}>
              <TabsContent value="dashboard" className="space-y-4 animate-in fade-in-50">
                <ReportsDashboard selectedModule={selectedModule} />
              </TabsContent>

              <TabsContent value="library" className="space-y-4 animate-in fade-in-50">
                <ReportLibrary moduleFilter={selectedModule} />
              </TabsContent>

              <TabsContent value="compliance" className="space-y-4 animate-in fade-in-50">
                <ComplianceReports moduleFilter={selectedModule} />
              </TabsContent>

              <TabsContent value="builder" className="space-y-4 animate-in fade-in-50">
                <ReportBuilder />
              </TabsContent>

              <TabsContent value="scheduled" className="space-y-4 animate-in fade-in-50">
                <ScheduledReports />
              </TabsContent>

              <TabsContent value="adhoc" className="space-y-4 animate-in fade-in-50">
                <AdHocQuery />
              </TabsContent>

              <TabsContent value="settings" className="space-y-4 animate-in fade-in-50">
                <ReportsSettings />
              </TabsContent>
            </Suspense>
          </Tabs>
        </div>
    </>
  );
}
