'use client';

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
  ClockIcon, 
  Edit, 
  Pause, 
  Play, 
  Trash2, 
  Clock,
  Search
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ScheduledReport {
  id: string;
  name: string;
  schedule: string;
  lastRun: string;
  nextRun: string;
  status: "active" | "paused" | "failed";
  recipients: string[];
  format: string;
  category: string;
}

const scheduledReports: ScheduledReport[] = [
  {
    id: "sr-1",
    name: "Monthly Payroll Summary",
    schedule: "Monthly (1st, 6:00 AM)",
    lastRun: "2025-05-01 06:00",
    nextRun: "2025-06-01 06:00",
    status: "active",
    recipients: ["finance@safend.com", "hr@safend.com"],
    format: "XLSX",
    category: "payroll"
  },
  {
    id: "sr-2",
    name: "Weekly Attendance Report",
    schedule: "Weekly (Monday, 8:00 AM)",
    lastRun: "2025-05-05 08:00",
    nextRun: "2025-05-12 08:00",
    status: "active",
    recipients: ["operations@safend.com"],
    format: "PDF",
    category: "operations"
  },
  {
    id: "sr-3",
    name: "Daily Cash Position",
    schedule: "Daily (10:00 AM)",
    lastRun: "2025-05-05 10:00",
    nextRun: "2025-05-06 10:00",
    status: "active",
    recipients: ["finance@safend.com", "cfo@safend.com"],
    format: "PDF",
    category: "accounts"
  },
  {
    id: "sr-4",
    name: "Quarterly P&L Report",
    schedule: "Quarterly (1st, 9:00 AM)",
    lastRun: "2025-04-01 09:00",
    nextRun: "2025-07-01 09:00",
    status: "active",
    recipients: ["management@safend.com", "directors@safend.com"],
    format: "PDF, XLSX",
    category: "accounts"
  },
  {
    id: "sr-5",
    name: "Monthly GST Return Data",
    schedule: "Monthly (5th, 10:00 AM)",
    lastRun: "2025-05-05 10:00",
    nextRun: "2025-06-05 10:00",
    status: "failed",
    recipients: ["tax@safend.com", "accounts@safend.com"],
    format: "XLSX",
    category: "compliance"
  },
  {
    id: "sr-6",
    name: "Weekly Sales Pipeline",
    schedule: "Weekly (Friday, 4:00 PM)",
    lastRun: "2025-05-02 16:00",
    nextRun: "2025-05-09 16:00",
    status: "active",
    recipients: ["sales@safend.com", "management@safend.com"],
    format: "PDF",
    category: "sales"
  },
  {
    id: "sr-7",
    name: "Monthly Inventory Valuation",
    schedule: "Monthly (Last Day, 11:59 PM)",
    lastRun: "2025-04-30 23:59",
    nextRun: "2025-05-31 23:59",
    status: "paused",
    recipients: ["inventory@safend.com", "accounts@safend.com"],
    format: "XLSX",
    category: "inventory"
  },
  {
    id: "sr-8",
    name: "Annual Contract Profitability",
    schedule: "Yearly (March 31, 12:00 PM)",
    lastRun: "2025-03-31 12:00",
    nextRun: "2026-03-31 12:00",
    status: "active",
    recipients: ["management@safend.com", "directors@safend.com"],
    format: "PDF, XLSX",
    category: "crossdomain"
  },
  {
    id: "sr-9",
    name: "PF/ESIC Monthly Compliance",
    schedule: "Monthly (5th, 9:00 AM)",
    lastRun: "2025-05-05 09:00",
    nextRun: "2025-06-05 09:00",
    status: "active",
    recipients: ["compliance@safend.com", "hr@safend.com"],
    format: "PDF",
    category: "compliance"
  },
  {
    id: "sr-10",
    name: "Daily Branch Performance",
    schedule: "Daily (5:00 PM)",
    lastRun: "2025-05-05 17:00",
    nextRun: "2025-05-06 17:00",
    status: "active",
    recipients: ["operations@safend.com", "branch-managers@safend.com"],
    format: "PDF",
    category: "operations"
  }
];

export function ScheduledReports() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  
  const toggleReportStatus = (report: ScheduledReport) => {
    const newStatus = report.status === "active" ? "paused" : "active";
    const actionText = newStatus === "active" ? "activated" : "paused";
    
    toast({
      title: `Report ${actionText}`,
      description: `${report.name} has been ${actionText}.`,
    });
  };
  
  const editReport = (reportId: string) => {
    toast({
      title: "Edit Schedule",
      description: "Opening report schedule editor.",
    });
  };
  
  const deleteReport = (reportId: string) => {
    toast({
      title: "Delete Schedule",
      description: "Are you sure you want to delete this scheduled report?",
      variant: "destructive",
    });
  };

  const runNow = (report: ScheduledReport) => {
    toast({
      title: "Running Report",
      description: `Executing ${report.name} immediately.`,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">Active</Badge>;
      case "paused":
        return <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">Paused</Badge>;
      case "failed":
        return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredReports = scheduledReports.filter(report => {
    if (searchTerm && !report.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    
    if (statusFilter !== "all" && report.status !== statusFilter) {
      return false;
    }
    
    if (categoryFilter !== "all" && report.category !== categoryFilter) {
      return false;
    }
    
    return true;
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Scheduled Reports</CardTitle>
          <CardDescription>
            View and manage all your scheduled report generations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4 md:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search reports..."
                  className="pl-8 w-full md:w-[240px]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
              >
                <SelectTrigger className="w-full md:w-[160px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              
              <Select
                value={categoryFilter}
                onValueChange={setCategoryFilter}
              >
                <SelectTrigger className="w-full md:w-[160px]">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="hr">HR</SelectItem>
                  <SelectItem value="payroll">Payroll</SelectItem>
                  <SelectItem value="accounts">Accounts</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="inventory">Inventory</SelectItem>
                  <SelectItem value="operations">Operations</SelectItem>
                  <SelectItem value="compliance">Compliance</SelectItem>
                  <SelectItem value="crossdomain">Cross-Domain</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Button>
              <Calendar className="mr-2 h-4 w-4" />
              New Schedule
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Report Name</TableHead>
                  <TableHead className="hidden md:table-cell">Schedule</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Last Run</TableHead>
                  <TableHead className="hidden md:table-cell">Next Run</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">
                      <div>
                        {report.name}
                        <div className="text-xs text-muted-foreground">
                          {report.recipients.join(", ")} • {report.format}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center">
                        <ClockIcon className="mr-2 h-4 w-4" />
                        {report.schedule}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(report.status)}</TableCell>
                    <TableCell className="hidden md:table-cell">{report.lastRun}</TableCell>
                    <TableCell className="hidden md:table-cell">{report.nextRun}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => runNow(report)}
                          title="Run Now"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => toggleReportStatus(report)}
                          title={report.status === "active" ? "Pause" : "Activate"}
                        >
                          {report.status === "active" ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => editReport(report.id)}
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => deleteReport(report.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
