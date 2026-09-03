'use client';

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ShieldCheck, FileCheck, Calendar } from "lucide-react";

interface ComplianceReportsProps {
  moduleFilter?: string | null;
}

export function ComplianceReports({ moduleFilter }: ComplianceReportsProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Mock compliance reports data
  const complianceReports = [
    {
      id: "cr-001",
      title: "Data Security Audit",
      category: "Security",
      dueDate: "2025-05-15",
      status: "Completed",
      module: "control-centre"
    },
    {
      id: "cr-002",
      title: "Employee Background Verification",
      category: "HR",
      dueDate: "2025-05-20",
      status: "In Progress",
      module: "hr"
    },
    {
      id: "cr-003",
      title: "Financial Compliance Report",
      category: "Finance",
      dueDate: "2025-05-30",
      status: "Pending",
      module: "accounts"
    },
    {
      id: "cr-004",
      title: "Vendor Verification",
      category: "Procurement",
      dueDate: "2025-06-10",
      status: "Pending",
      module: "office-admin"
    }
  ];

  // Filter reports based on module and search query
  const filteredReports = complianceReports.filter(report => {
    const matchesModule = !moduleFilter || report.module === moduleFilter;
    const matchesSearch = !searchQuery || 
      report.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.category.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesModule && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search compliance reports..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="default">
          <ShieldCheck className="h-4 w-4 mr-2" />
          New Compliance Check
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredReports.map(report => (
          <Card key={report.id}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{report.title}</CardTitle>
                  <CardDescription>{report.category}</CardDescription>
                </div>
                <div className={`px-2 py-1 rounded text-xs font-medium ${
                  report.status === "Completed" ? "bg-green-100 text-green-800" :
                  report.status === "In Progress" ? "bg-blue-100 text-blue-800" :
                  "bg-amber-100 text-amber-800"
                }`}>
                  {report.status}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center text-sm text-muted-foreground mb-4">
                <Calendar className="h-4 w-4 mr-2" />
                Due: {report.dueDate}
              </div>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="mr-2">
                  <FileCheck className="h-4 w-4 mr-1" />
                  View Details
                </Button>
                <Button size="sm">
                  Run Check
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {filteredReports.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center p-8 text-center">
            <ShieldCheck className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No compliance reports found</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Try adjusting your filters or create a new compliance check
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
