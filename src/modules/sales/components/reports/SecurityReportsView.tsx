'use client';

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { GuardUtilizationReport } from "./GuardUtilizationReport";
import { ClientSatisfactionReport } from "./ClientSatisfactionReport";
import { ContractRenewalReport } from "./ContractRenewalReport";
import { ComplianceAdherenceReport } from "./ComplianceAdherenceReport";
import { useReportExport } from "@/services/reports/ExportService";
import { FileText, FileSpreadsheet, Share2 } from "lucide-react";

export function SecurityReportsView() {
  const [activeTab, setActiveTab] = useState("guard-utilization");
  const [reportPeriod, setReportPeriod] = useState("last-month");
  const { exportToPdf, exportToExcel } = useReportExport();

  const handleExportPdf = () => {
    exportToPdf("security-report", { period: reportPeriod, reportType: activeTab });
  };

  const handleExportExcel = () => {
    exportToExcel("security-report", { period: reportPeriod, reportType: activeTab });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Security Reports</h2>
          <p className="text-muted-foreground">
            Comprehensive reports for security operations
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={reportPeriod} onValueChange={setReportPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this-month">This Month</SelectItem>
              <SelectItem value="last-month">Last Month</SelectItem>
              <SelectItem value="last-quarter">Last Quarter</SelectItem>
              <SelectItem value="last-year">Last Year</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          
          <Button variant="outline" size="icon" onClick={handleExportPdf}>
            <FileText className="h-4 w-4" />
          </Button>
          
          <Button variant="outline" size="icon" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4" />
          </Button>
          
          <Button variant="outline" size="icon">
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 mb-4">
          <TabsTrigger value="guard-utilization">Guard Utilization</TabsTrigger>
          <TabsTrigger value="client-satisfaction">Client Satisfaction</TabsTrigger>
          <TabsTrigger value="contract-renewal">Contract Renewal</TabsTrigger>
          <TabsTrigger value="compliance-adherence">Compliance Adherence</TabsTrigger>
        </TabsList>
        
        <TabsContent value="guard-utilization">
          <GuardUtilizationReport period={reportPeriod} />
        </TabsContent>
        
        <TabsContent value="client-satisfaction">
          <ClientSatisfactionReport period={reportPeriod} />
        </TabsContent>
        
        <TabsContent value="contract-renewal">
          <ContractRenewalReport period={reportPeriod} />
        </TabsContent>
        
        <TabsContent value="compliance-adherence">
          <ComplianceAdherenceReport period={reportPeriod} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
