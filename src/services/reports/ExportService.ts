'use client';

import { ReportTemplate, ReportResult } from "@/types/reports";
import { executeReport } from "./ReportingService";
import { emitEvent, EVENT_TYPES } from "@/services/EventService";
import { useToast } from "@/hooks/use-toast";

/**
 * Generate a PDF export of a report
 * In a real app this would connect to backend API to generate PDF with WeasyPrint
 */
export const exportReportToPdf = async (
  templateId: string,
  parameters: Record<string, any>,
  options: {
    filename?: string;
    headerText?: string;
    footerText?: string;
    showBranding?: boolean;
  } = {}
): Promise<Blob> => {
  // First execute the report to get data
  const result = await executeReport(templateId, parameters);
  
  // In a real app, this would call a backend API endpoint
  // that converts the report data to HTML and then to PDF using WeasyPrint
  
  // For now, we'll simulate a delay and emit an event
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Record the event
  emitEvent(EVENT_TYPES.PDF_GENERATED, {
    templateId,
    resultId: result.id,
    parameters,
    options
  });
  
  // Return a mock blob (in a real app this would be the PDF file)
  return new Blob(['PDF content'], { type: 'application/pdf' });
};

/**
 * Generate an Excel export of a report
 * In a real app this would connect to backend API to generate XLSX with ExcelJS
 */
export const exportReportToExcel = async (
  templateId: string,
  parameters: Record<string, any>,
  options: {
    filename?: string;
    sheetName?: string;
    includeCharts?: boolean;
  } = {}
): Promise<Blob> => {
  // First execute the report to get data
  const result = await executeReport(templateId, parameters);
  
  // In a real app, this would call a backend API endpoint
  // that converts the report data to XLSX using ExcelJS
  
  // For now, we'll simulate a delay and emit an event
  await new Promise(resolve => setTimeout(resolve, 1200));
  
  // Record the event
  emitEvent(EVENT_TYPES.EXCEL_GENERATED, {
    templateId,
    resultId: result.id,
    parameters,
    options
  });
  
  // Return a mock blob (in a real app this would be the Excel file)
  return new Blob(['Excel content'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

/**
 * Schedule a report to be sent via email
 */
export const scheduleReportEmail = async (
  templateId: string,
  parameters: Record<string, any>,
  emailConfig: {
    recipients: string[];
    subject: string;
    body?: string;
    format: 'pdf' | 'excel' | 'both';
    scheduling: {
      type: 'once' | 'daily' | 'weekly' | 'monthly';
      startDate: string;
      endDate?: string;
      time?: string;
      dayOfWeek?: number; // 0-6, Sunday to Saturday
      dayOfMonth?: number; // 1-31
      timezone?: string;
    }
  }
): Promise<{ jobId: string }> => {
  // In a real app, this would create a job in Celery/Redis
  
  // For now, we'll simulate a delay and emit an event
  await new Promise(resolve => setTimeout(resolve, 800));
  
  const jobId = `job-${Date.now()}`;
  
  // Record the event
  emitEvent(EVENT_TYPES.REPORT_SCHEDULED, {
    templateId,
    jobId,
    parameters,
    emailConfig
  });
  
  return { jobId };
};

/**
 * React hook to use for export functionality
 */
export const useReportExport = () => {
  const { toast } = useToast();
  
  const exportReport = async (
    templateId: string,
    parameters: Record<string, any>,
    format: 'pdf' | 'excel'
  ) => {
    try {
      toast({
        title: `Exporting report as ${format.toUpperCase()}`,
        description: "Please wait while we generate your file...",
      });
      
      let blob: Blob;
      if (format === 'pdf') {
        blob = await exportReportToPdf(templateId, parameters);
      } else {
        blob = await exportReportToExcel(templateId, parameters);
      }
      
      // Create a download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${templateId}-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Export complete",
        description: `Your ${format.toUpperCase()} file has been downloaded.`,
        // Changed variant from "success" to "default" since "success" isn't a valid variant
        variant: "default",
      });
      
      return true;
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export failed",
        description: "There was an error generating your export. Please try again.",
        variant: "destructive",
      });
      
      return false;
    }
  };
  
  const exportToPdf = (templateId: string, parameters: Record<string, any>) => 
    exportReport(templateId, parameters, 'pdf');
    
  const exportToExcel = (templateId: string, parameters: Record<string, any>) => 
    exportReport(templateId, parameters, 'excel');
    
  const scheduleEmail = async (
    templateId: string,
    parameters: Record<string, any>,
    emailConfig: Parameters<typeof scheduleReportEmail>[2]
  ) => {
    try {
      toast({
        title: "Scheduling report",
        description: "Setting up your scheduled report...",
      });
      
      const { jobId } = await scheduleReportEmail(templateId, parameters, emailConfig);
      
      toast({
        title: "Report scheduled",
        description: "Your report has been scheduled successfully.",
        // Changed variant from "success" to "default" since "success" isn't a valid variant
        variant: "default",
      });
      
      return { success: true, jobId };
    } catch (error) {
      console.error("Schedule error:", error);
      toast({
        title: "Scheduling failed",
        description: "There was an error scheduling your report. Please try again.",
        variant: "destructive",
      });
      
      return { success: false };
    }
  };
  
  return {
    exportToPdf,
    exportToExcel,
    scheduleEmail
  };
};
