'use client';

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReportsDashboard } from "./components/ReportsDashboard";
import { ReportLibrary } from "./components/ReportLibrary";
import { ReportBuilder } from "./components/ReportBuilder";
import { ScheduledReports } from "./components/ScheduledReports";
import { AdHocQuery } from "./components/AdHocQuery";
import { ReportsSettings } from "./components/ReportsSettings";
import { ComplianceReports } from "./components/ComplianceReports";
import { ModuleSelector } from "./components/ModuleSelector";
import { DataWarehouseStatus } from "./components/DataWarehouseStatus";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  BarChart3, 
  Library, 
  FileCog, 
  Clock, 
  FileSearch, 
  Settings, 
  FileBarChart2, 
  FileSpreadsheet, 
  ShieldCheck 
} from "lucide-react";

export function ReportsModule() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedModule, setSelectedModule] = useState<string | null>(null);

  return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reports & Analytics</h1>
            <p className="text-muted-foreground">
              Data warehouse-powered reports and dashboards across all business modules
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ModuleSelector 
              onModuleChange={setSelectedModule} 
              selectedModule={selectedModule}
            />
            <DataWarehouseStatus />
          </div>
        </div>

        <Tabs
          defaultValue="dashboard"
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4"
        >
          <TabsList className="grid grid-cols-2 md:grid-cols-7 gap-1 md:w-auto w-full">
            <TabsTrigger value="dashboard" className="flex items-center gap-1">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden md:inline">Dashboard</span>
              <span className="md:hidden">Dash</span>
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
            {activeTab !== "dashboard" && (
              <Button variant="outline" size="sm" className="flex items-center gap-1">
                <FileBarChart2 className="h-4 w-4" />
                Export PDF
              </Button>
            )}
            {activeTab !== "dashboard" && (
              <Button variant="outline" size="sm" className="flex items-center gap-1">
                <FileSpreadsheet className="h-4 w-4" />
                Export Excel
              </Button>
            )}
            {activeTab === "dashboard" && (
              <Button variant="outline" size="sm">
                Customize Dashboard
              </Button>
            )}
          </div>
          
          <Separator />

          <TabsContent value="dashboard" className="space-y-4">
            <ReportsDashboard selectedModule={selectedModule} />
          </TabsContent>

          <TabsContent value="library" className="space-y-4">
            <ReportLibrary moduleFilter={selectedModule} />
          </TabsContent>

          <TabsContent value="compliance" className="space-y-4">
            <ComplianceReports moduleFilter={selectedModule} />
          </TabsContent>

          <TabsContent value="builder" className="space-y-4">
            <ReportBuilder />
          </TabsContent>

          <TabsContent value="scheduled" className="space-y-4">
            <ScheduledReports />
          </TabsContent>

          <TabsContent value="adhoc" className="space-y-4">
            <AdHocQuery />
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <ReportsSettings />
          </TabsContent>
        </Tabs>
      </div>
  );
}
