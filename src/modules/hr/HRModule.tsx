'use client';

import { useState, lazy, Suspense } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ModuleHeader } from "@/components/ui/module-header";
import { ModuleCard } from "@/components/ui/module-card";
import { BrandLoader } from "@/components/ui/brand-loader";
import { useTabWithHash } from "@/hooks/useTabWithHash";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { 
  Users, Calendar, IndianRupee, 
  BarChart2, ClipboardCheck, CircleDollarSign,
  FileUp, AlertTriangle, UserPlus2, UserMinus
} from "lucide-react";

// Lazy load all HR components
const EmployeeDirectory = lazy(() => import("./components/EmployeeDirectory").then(mod => ({ default: mod.EmployeeDirectory })));
const OnboardingPipeline = lazy(() => import("./components/onboarding/OnboardingPipeline").then(mod => ({ default: mod.OnboardingPipeline })));
const DboardingPipeline = lazy(() => import("./components/deboarding/DboardingPipeline").then(mod => ({ default: mod.DboardingPipeline })));
const LeaveManagement = lazy(() => import("./components/LeaveManagement").then(mod => ({ default: mod.LeaveManagement })));
const PayrollSalaryModule = lazy(() => import("./components/PayrollSalaryModule").then(mod => ({ default: mod.PayrollSalaryModule })));
const ComplianceDashboard = lazy(() => import("./components/ComplianceDashboard").then(mod => ({ default: mod.ComplianceDashboard })));
const HRReports = lazy(() => import("./components/HRReports").then(mod => ({ default: mod.HRReports })));
const LoanCentre = lazy(() => import("./components/loans/LoanCentre").then(mod => ({ default: mod.LoanCentre })));
const PenaltyReview = lazy(() => import("./components/PenaltyReview").then(mod => ({ default: mod.PenaltyReview })));

// Loading fallback — structured skeleton matching the tab content layout
const LoadingFallback = () => (
  <div className="space-y-4 animate-pulse">
    {/* Filter chips */}
    <div className="flex gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-8 w-20 rounded-lg bg-muted" />
      ))}
    </div>
    {/* Table header */}
    <div className="flex gap-4 px-4 py-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-4 flex-1 rounded bg-muted" />
      ))}
    </div>
    {/* Table rows */}
    {Array.from({ length: 7 }).map((_, r) => (
      <div key={r} className="flex gap-4 px-4 py-3 border-t border-border/30">
        {Array.from({ length: 6 }).map((_, c) => (
          <div key={c} className="h-4 flex-1 rounded bg-muted" />
        ))}
      </div>
    ))}
  </div>
);

// Define hrTabs with consolidated tabs (removed leave-dashboard)
const hrTabs = [
  { id: "employees", label: "Employees", icon: Users },
  { id: "leave", label: "Leave", icon: Calendar },
  { id: "payroll", label: "Payroll & Salary", icon: IndianRupee },
  { id: "compliance", label: "Compliance", icon: ClipboardCheck },
  { id: "loans", label: "Advances", icon: CircleDollarSign },
  { id: "penalties", label: "Penalties", icon: AlertTriangle },
  { id: "reports", label: "Reports", icon: BarChart2 }
];

// Filter options for each tab - merged leave and leave-dashboard filters
const filterOptions = {
  "employees": ["All Employees", "Active", "On Leave", "Terminated", "Contractors"],
  "leave": ["All", "Pending", "Approved", "Rejected", "Uninformed", "Abscond", "Resolved"],
  "payroll": ["All Payroll", "Processing", "Completed", "Holds", "Advances"],
  "compliance": ["All Compliance", "Due", "Completed", "Overdue", "At Risk"],
  "loans": ["All", "Salary Advances", "Active", "Pending Approval", "Cleared", "Exits (F&F)"],
  "penalties": ["All Pending", "Disciplinary", "Integrity", "Criminal"],
  "reports": ["Performance", "Attendance", "Turnover", "Cost Analysis", "Demographics"]
};

export function HRModule() {
  const validTabs = hrTabs.map(t => t.id);
  const [activeTab, setActiveTab] = useTabWithHash("employees", validTabs);
  const [activeFilter, setActiveFilter] = useState("All Employees");
  const [employeesSubTab, setEmployeesSubTab] = useState("onboarding");
  
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setActiveFilter(filterOptions[value as keyof typeof filterOptions][0]);
  };
  
  const getActionButton = () => {
    switch (activeTab) {
      case "employees":
        return {
          label: "Add Employee",
          icon: <Users className="mr-2 h-4 w-4" />,
          action: () => {}
        };
      case "loans":
        return {
          label: "New Advance",
          icon: <CircleDollarSign className="mr-2 h-4 w-4" />,
          action: () => {}
        };
      case "compliance":
        return {
          label: "Add Filing",
          icon: <FileUp className="mr-2 h-4 w-4" />,
          action: () => {}
        };
      default:
        return null;
    }
  };

  const actionButton = getActionButton();

  return (
      <div className="space-y-6 page-transition">
        <ModuleHeader 
          title="Human Resources"
          description="Manage employees, payroll and compliance"
          actionLabel={actionButton?.label}
          actionIcon={actionButton?.icon}
          onAction={actionButton?.action}
        />
        
        <ModuleCard>
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-800" data-module-primary-tabs="">
              <ScrollArea className="w-full">
                <TabsList className="inline-flex md:grid md:grid-cols-7 gap-1 w-full md:w-auto bg-gray-100 dark:bg-gray-800 p-1 rounded-lg min-w-max">
                  {hrTabs.map(tab => (
                    <TabsTrigger 
                      key={tab.id} 
                      value={tab.id} 
                      className={`flex gap-2 items-center transition-all duration-200 ${
                        activeTab === tab.id 
                          ? "bg-safend-red text-white" 
                          : ""
                      }`}
                    >
                      <tab.icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
                <ScrollBar orientation="horizontal" className="invisible" />
              </ScrollArea>
            </div>
            
            <div className="p-6">
              <Suspense fallback={<LoadingFallback />}>
                {/* Employee Directory Tab (with Onboarding sub-tab) */}
                <TabsContent value="employees" className="space-y-6 animate-in fade-in-50">
                  <Tabs value={employeesSubTab} onValueChange={setEmployeesSubTab} className="w-full">
                    <TabsList className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                      <TabsTrigger value="onboarding" className={`flex gap-2 items-center ${employeesSubTab === "onboarding" ? "bg-safend-red text-white" : ""}`}>
                        <UserPlus2 className="h-4 w-4" /> Onboarding
                      </TabsTrigger>
                      <TabsTrigger value="directory" className={`flex gap-2 items-center ${employeesSubTab === "directory" ? "bg-safend-red text-white" : ""}`}>
                        <Users className="h-4 w-4" /> Directory
                      </TabsTrigger>
                      <TabsTrigger value="deboard" className={`flex gap-2 items-center ${employeesSubTab === "deboard" ? "bg-safend-red text-white" : ""}`}>
                        <UserMinus className="h-4 w-4" /> Deboard
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="directory" className="mt-4">
                      <EmployeeDirectory filter={activeFilter} />
                    </TabsContent>
                    <TabsContent value="onboarding" className="mt-4">
                      <OnboardingPipeline />
                    </TabsContent>
                    <TabsContent value="deboard" className="mt-4">
                      <DboardingPipeline />
                    </TabsContent>
                  </Tabs>
                </TabsContent>
                
                {/* Leave Management Tab - Enhanced with Leave Dashboard functionality */}
                <TabsContent value="leave" className="space-y-6 animate-in fade-in-50">
                  <LeaveManagement filter={activeFilter} />
                </TabsContent>
                

              {/* Payroll & Salary Tab */}
              <TabsContent value="payroll" className="space-y-6 animate-in fade-in-50">
                <PayrollSalaryModule filter={activeFilter} />
              </TabsContent>
              
              {/* Compliance Tab - Enhanced with new functionality */}
              <TabsContent value="compliance" className="space-y-6 animate-in fade-in-50">
                <ComplianceDashboard filter={activeFilter} />
              </TabsContent>
              
              {/* Loans Tab */}
              <TabsContent value="loans" className="space-y-6 animate-in fade-in-50">
                <LoanCentre filter={activeFilter} />
              </TabsContent>
              
              {/* Penalties Tab */}
              <TabsContent value="penalties" className="space-y-6 animate-in fade-in-50">
                <PenaltyReview filter={activeFilter} />
              </TabsContent>
              
              {/* Reports Tab */}
              <TabsContent value="reports" className="space-y-6 animate-in fade-in-50">
                <HRReports filter={activeFilter} />
              </TabsContent>
              </Suspense>
            </div>
          </Tabs>
        </ModuleCard>
      </div>
  );
}
