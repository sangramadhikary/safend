'use client';
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useBranch } from "@/contexts/BranchContext";
import { supabaseClient } from "@/integrations/supabase/client";
import { branchScopedSelect } from "../hooks/branchFilter";
import { 
  BarChart3, 
  LineChart, 
  PieChart, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight, 
  PlusCircle, 
  ChevronRight,
  Activity,
  Users,
  Clock,
  AlarmClock,
  FileText
} from "lucide-react";
import { DashboardWidget } from "./widgets/DashboardWidget";
import { KpiCard } from "./widgets/KpiCard";

interface ReportsDashboardProps {
  selectedModule: string | null;
}

export function ReportsDashboard({ selectedModule }: ReportsDashboardProps) {
  const [dashboardType, setDashboardType] = useState("executive");
  const [dateRange, setDateRange] = useState("last30days");
  const [isLoading, setIsLoading] = useState(true);
  const { currentBranch, isMainBranchUser } = useBranch();
  
  // Different data for different dashboard types
  const [executiveData, setExecutiveData] = useState<any>(null);
  const [operationalData, setOperationalData] = useState<any>(null);
  const [financialData, setFinancialData] = useState<any>(null);
  
  useEffect(() => {
    let active = true;
    setIsLoading(true);

    const fmtCurrency = (val: number) => {
      if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)}Cr`;
      if (val >= 100000) return `₹${(val / 100000).toFixed(2)}L`;
      return `₹${Math.round(val).toLocaleString('en-IN')}`;
    };
    const fmtCount = (val: number) => Math.round(val).toLocaleString('en-IN');

    const loadData = async () => {
      // RLS scopes sub-branch users automatically. For main users, we apply an
      // explicit branch filter so the header branch dropdown actually changes
      // the data shown (HQ/main selected = all branches).
      const scoped = (table: string, columns: string) =>
        branchScopedSelect(table, columns, currentBranch, isMainBranchUser);

      const [
        recvRes,
        postsRes,
        employeesRes,
        penaltiesRes,
        payablesRes,
        attendanceRes,
      ] = await Promise.all([
        scoped('receivables', 'total_amount, amount, status, due_date'),
        scoped('operational_posts', 'status'),
        scoped('employees', 'id, status'),
        scoped('penalties', 'id, created_at'),
        scoped('payables', 'total_amount, amount'),
        scoped('attendance', 'status'),
      ]);

      const receivables = recvRes.data || [];
      const posts = postsRes.data || [];
      const employees = employeesRes.data || [];
      const penalties = penaltiesRes.data || [];
      const payables = payablesRes.data || [];
      const attendance = attendanceRes.data || [];

      const totalRevenue = receivables.reduce((s: number, r: any) => s + Number(r.total_amount ?? r.amount ?? 0), 0);
      const totalPayables = payables.reduce((s: number, p: any) => s + Number(p.total_amount ?? p.amount ?? 0), 0);
      const activePosts = posts.filter((p: any) => (p.status || '').toLowerCase() !== 'vacant').length;
      const headcount = employees.length;
      const activeEmployees = employees.filter((e: any) => (e.status || '').toLowerCase() === 'active').length;

      const coveredPosts = posts.filter((p: any) => (p.status || '').toLowerCase().includes('cover')).length;
      const postCoverage = posts.length > 0 ? Math.round((coveredPosts / posts.length) * 100) : 0;

      const presentCount = attendance.filter((a: any) => (a.status || '').toLowerCase() === 'present').length;
      const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 1000) / 10 : 0;

      const overdueReceivables = receivables.filter((r: any) => {
        if (!r.due_date || (r.status || '').toLowerCase() === 'received') return false;
        return new Date(r.due_date).getTime() < Date.now();
      }).length;

      if (!active) return;

      setExecutiveData({
        kpis: [
          { title: "Total Revenue", value: fmtCurrency(totalRevenue), change: 0, trend: "up", metric: "all receivables", icon: <LineChart className="h-4 w-4 text-muted-foreground" /> },
          { title: "Active Posts", value: fmtCount(activePosts), change: 0, trend: "up", metric: `${posts.length} total`, icon: <BarChart3 className="h-4 w-4 text-muted-foreground" /> },
          { title: "Headcount", value: fmtCount(headcount), change: 0, trend: "up", metric: `${activeEmployees} active`, icon: <PieChart className="h-4 w-4 text-muted-foreground" /> },
          { title: "Overdue Invoices", value: fmtCount(overdueReceivables), change: 0, trend: "down", metric: "past due date", icon: <Calendar className="h-4 w-4 text-muted-foreground" /> }
        ]
      });

      setOperationalData({
        kpis: [
          { title: "Post Coverage", value: `${postCoverage}%`, change: 0, trend: "up", metric: "covered posts", icon: <Activity className="h-4 w-4 text-muted-foreground" /> },
          { title: "Attendance Rate", value: `${attendanceRate}%`, change: 0, trend: "up", metric: "present / total", icon: <Users className="h-4 w-4 text-muted-foreground" /> },
          { title: "Active Posts", value: fmtCount(activePosts), change: 0, trend: "up", metric: `${posts.length} total`, icon: <Clock className="h-4 w-4 text-muted-foreground" /> },
          { title: "Incidents", value: fmtCount(penalties.length), change: 0, trend: "down", metric: "recorded penalties", icon: <AlarmClock className="h-4 w-4 text-muted-foreground" /> }
        ]
      });

      setFinancialData({
        kpis: [
          { title: "Total Receivables", value: fmtCurrency(totalRevenue), change: 0, trend: "up", metric: "billed", icon: <LineChart className="h-4 w-4 text-muted-foreground" /> },
          { title: "Total Payables", value: fmtCurrency(totalPayables), change: 0, trend: "down", metric: "owed", icon: <BarChart3 className="h-4 w-4 text-muted-foreground" /> },
          { title: "Net Position", value: fmtCurrency(totalRevenue - totalPayables), change: 0, trend: "up", metric: "receivables − payables", icon: <PieChart className="h-4 w-4 text-muted-foreground" /> },
          { title: "Overdue Invoices", value: fmtCount(overdueReceivables), change: 0, trend: "down", metric: "past due", icon: <Calendar className="h-4 w-4 text-muted-foreground" /> }
        ]
      });

      setIsLoading(false);
    };

    loadData().catch((err) => {
      console.error('[ReportsDashboard] Failed to load KPIs:', err);
      if (active) setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [selectedModule, dashboardType, dateRange, currentBranch?.id]);
  
  // Get current data based on selected dashboard type
  const currentDashboardData = () => {
    switch(dashboardType) {
      case 'executive': return executiveData;
      case 'operational': return operationalData;
      case 'financial': return financialData;
      default: return executiveData;
    }
  };
  
  const data = currentDashboardData();
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <Tabs 
          defaultValue="executive" 
          value={dashboardType} 
          onValueChange={setDashboardType} 
          className="w-full sm:w-auto"
        >
          <TabsList>
            <TabsTrigger value="executive">Executive</TabsTrigger>
            <TabsTrigger value="operational">Operational</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="flex items-center gap-2">
          <Select defaultValue={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="last7days">Last 7 Days</SelectItem>
              <SelectItem value="last30days">Last 30 Days</SelectItem>
              <SelectItem value="thisMonth">This Month</SelectItem>
              <SelectItem value="lastMonth">Last Month</SelectItem>
              <SelectItem value="thisQuarter">This Quarter</SelectItem>
              <SelectItem value="thisYear">This Year</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon">
            <Calendar className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 py-12">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="w-full h-24 animate-pulse">
              <div className="h-full bg-gray-200 dark:bg-gray-800 rounded-lg" />
            </Card>
          ))}
          
          <Card className="w-full col-span-1 md:col-span-2 h-80 animate-pulse">
            <div className="h-full bg-gray-200 dark:bg-gray-800 rounded-lg" />
          </Card>

          <Card className="w-full col-span-1 md:col-span-2 h-80 animate-pulse">
            <div className="h-full bg-gray-200 dark:bg-gray-800 rounded-lg" />
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI Summary Row - Different data for each dashboard type */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {data?.kpis?.map((kpi: any, index: number) => (
              <KpiCard 
                key={`${dashboardType}-kpi-${index}`}
                title={kpi.title}
                value={kpi.value}
                change={kpi.change}
                trend={kpi.trend}
                metric={kpi.metric}
                icon={kpi.icon}
              />
            ))}
          </div>
          
          {/* Primary Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DashboardWidget 
              title={dashboardType === "executive" 
                ? (isMainBranchUser ? "Revenue by Branch" : `Revenue - ${currentBranch?.name || 'Branch'}`)
                : dashboardType === "operational" ? "Post Performance"
                : "Cash Flow Trend"}
              description={dashboardType === "executive" 
                ? (isMainBranchUser ? "Monthly revenue across top branches" : "Monthly revenue for your branch")
                : dashboardType === "operational" ? "Coverage metrics by location"
                : "Monthly cash inflow vs outflow"}
              type="bar"
            />
            <DashboardWidget 
              title={dashboardType === "executive" ? "Headcount Trend" :
                    dashboardType === "operational" ? "Incident Reports" :
                    "Expense Categories"}
              description={dashboardType === "executive" 
                ? (isMainBranchUser ? "Monthly employee count by role" : `Employee count - ${currentBranch?.name || 'Branch'}`)
                : dashboardType === "operational" ? "Weekly incident types"
                : "Breakdown of major expense categories"}
              type="area"
            />
          </div>
          
          {/* Secondary Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <DashboardWidget 
              title={dashboardType === "executive" ? "Attendance Rate" :
                    dashboardType === "operational" ? "Training Compliance" :
                    "Revenue Streams"}
              description={dashboardType === "executive" ? "Weekly attendance percentage" :
                          dashboardType === "operational" ? "Staff certification status" :
                          "Revenue distribution by service"}
              type="line"
            />
            <DashboardWidget 
              title={dashboardType === "executive" ? "Receivables Aging" :
                    dashboardType === "operational" ? "Response Times" :
                    "Budget Variance"}
              description={dashboardType === "executive" ? "Outstanding invoices by age bucket" :
                          dashboardType === "operational" ? "Average resolution time" :
                          "Actual vs planned expense"}
              type="bar"
            />
            <DashboardWidget 
              title={dashboardType === "executive" ? "Post Coverage" :
                    dashboardType === "operational" ? "Staff Utilization" :
                    "Profit Margins"}
              description={dashboardType === "executive" ? "Planned vs actual deployment" :
                          dashboardType === "operational" ? "Team efficiency metrics" :
                          "Gross and net margin trends"}
              type="pie"
            />
          </div>
          
          <div className="flex justify-center pt-4">
            <Button variant="outline" className="flex items-center gap-1">
              <PlusCircle className="h-4 w-4" />
              Add Widget
            </Button>
          </div>
          
          <Separator />
          
          {/* Module-specific Reports - Filtered by both module and dashboard type */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Recent Reports</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  title: "Monthly P&L Statement",
                  module: "accounts",
                  dashboardType: ["executive", "financial"],
                  date: "May 8, 2025",
                  status: "Generated"
                },
                {
                  title: "Post Attendance Summary",
                  module: "operations",
                  dashboardType: ["executive", "operational"],
                  date: "May 7, 2025",
                  status: "Generated"
                },
                {
                  title: "Sales Pipeline Analysis",
                  module: "sales",
                  dashboardType: ["executive", "financial"],
                  date: "May 6, 2025",
                  status: "Generated"
                },
                {
                  title: "Inventory Valuation Report",
                  module: "office-admin",
                  dashboardType: ["operational", "financial"],
                  date: "May 5, 2025",
                  status: "Generated"
                },
                {
                  title: "Statutory Compliance Status",
                  module: "hr",
                  dashboardType: ["executive", "operational"],
                  date: "May 4, 2025",
                  status: "Generated"
                },
                {
                  title: "User Activity Audit",
                  module: "control-centre",
                  dashboardType: ["executive", "operational"],
                  date: "May 3, 2025",
                  status: "Generated"
                },
                {
                  title: "Cash Flow Forecast",
                  module: "accounts",
                  dashboardType: ["financial"],
                  date: "May 2, 2025",
                  status: "Generated"
                },
                {
                  title: "Branch Performance Dashboard",
                  module: "operations",
                  dashboardType: ["operational"],
                  date: "May 1, 2025",
                  status: "Generated"
                },
                {
                  title: "Custom Report 1",
                  module: "custom",
                  dashboardType: ["custom"],
                  date: "Apr 30, 2025",
                  status: "Generated"
                }
              ]
                .filter(report => (!selectedModule || report.module === selectedModule) && 
                                  (!dashboardType || report.dashboardType.includes(dashboardType)))
                .map((report, index) => (
                  <Card key={index} className="cursor-pointer hover:bg-accent/5">
                    <CardHeader className="p-4">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-base">{report.title}</CardTitle>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <CardDescription className="flex justify-between">
                        <span>
                          {report.module.charAt(0).toUpperCase() + report.module.slice(1).replace('-', ' ')}
                        </span>
                        <span>{report.date}</span>
                      </CardDescription>
                    </CardHeader>
                  </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
