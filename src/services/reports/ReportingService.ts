'use client';

import { ReportTemplate, ReportResult, Dashboard, ScheduledReport } from "@/types/reports";
import { emitEvent, EVENT_TYPES } from "@/services/EventService";

// Mock data for the reporting service
// In a real app, this would connect to a backend API for the data warehouse

// Mock execution of a report template
export const executeReport = async (
  templateId: string, 
  parameters: Record<string, any>
): Promise<ReportResult> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Find the template
  const template = mockReportTemplates.find(t => t.id === templateId);
  
  if (!template) {
    throw new Error(`Report template with ID ${templateId} not found`);
  }
  
  // Create a mock result based on the template and parameters
  const result: ReportResult = {
    id: `result-${Date.now()}`,
    templateId: templateId,
    parameters: parameters,
    data: generateMockData(template),
    metadata: {
      columns: generateMockColumns(template),
      rowCount: Math.floor(Math.random() * 100) + 10,
      executionTime: Math.floor(Math.random() * 2000) + 500,
    },
    generatedAt: new Date().toISOString(),
    generatedBy: "Current User", // Would come from auth context in real app
  };
  
  // Record the event
  emitEvent(EVENT_TYPES.REPORT_EXECUTED, {
    templateId: templateId,
    resultId: result.id,
    executionTime: result.metadata.executionTime,
    parameters: parameters,
  });
  
  return result;
};

// Create a new report template
export const createReportTemplate = (
  template: Omit<ReportTemplate, "id" | "createdAt" | "createdBy">
): ReportTemplate => {
  const newTemplate: ReportTemplate = {
    ...template,
    id: `template-${Date.now()}`,
    createdAt: new Date().toISOString(),
    createdBy: "Current User", // Would come from auth context in real app
    isBuiltIn: false,
  };
  
  // Add to mock data
  mockReportTemplates.push(newTemplate);
  
  // Record the event
  emitEvent(EVENT_TYPES.REPORT_TEMPLATE_CREATED, {
    templateId: newTemplate.id,
    name: newTemplate.name,
    module: newTemplate.module,
  });
  
  return newTemplate;
};

// Update an existing report template
export const updateReportTemplate = (
  templateId: string,
  updates: Partial<ReportTemplate>
): ReportTemplate => {
  const index = mockReportTemplates.findIndex(t => t.id === templateId);
  
  if (index === -1) {
    throw new Error(`Report template with ID ${templateId} not found`);
  }
  
  // Cannot update built-in templates
  if (mockReportTemplates[index].isBuiltIn) {
    throw new Error("Cannot modify built-in report templates");
  }
  
  mockReportTemplates[index] = {
    ...mockReportTemplates[index],
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy: "Current User", // Would come from auth context in real app
  };
  
  // Record the event
  emitEvent(EVENT_TYPES.REPORT_TEMPLATE_UPDATED, {
    templateId: templateId,
    name: mockReportTemplates[index].name,
  });
  
  return mockReportTemplates[index];
};

// Get all report templates
export const getReportTemplates = (): ReportTemplate[] => {
  return [...mockReportTemplates];
};

// Get a specific report template
export const getReportTemplate = (templateId: string): ReportTemplate | undefined => {
  return mockReportTemplates.find(t => t.id === templateId);
};

// Create a new dashboard
export const createDashboard = (
  dashboard: Omit<Dashboard, "id" | "createdAt" | "createdBy">
): Dashboard => {
  const newDashboard: Dashboard = {
    ...dashboard,
    id: `dashboard-${Date.now()}`,
    createdAt: new Date().toISOString(),
    createdBy: "Current User", // Would come from auth context in real app
  };
  
  // Add to mock data
  mockDashboards.push(newDashboard);
  
  // Record the event
  emitEvent(EVENT_TYPES.DASHBOARD_CREATED, {
    dashboardId: newDashboard.id,
    name: newDashboard.name,
  });
  
  return newDashboard;
};

// Get all dashboards
export const getDashboards = (branchId?: string): Dashboard[] => {
  if (branchId) {
    return mockDashboards.filter(d => d.isGlobal || d.branchId === branchId);
  }
  return [...mockDashboards];
};

// Schedule a report
export const scheduleReport = (report: Omit<ScheduledReport, "id" | "createdAt" | "createdBy">): ScheduledReport => {
  const newSchedule: ScheduledReport = {
    ...report,
    id: `schedule-${Date.now()}`,
    createdAt: new Date().toISOString(),
    createdBy: "Current User", // Would come from auth context in real app
  };
  
  // Add to mock data
  mockScheduledReports.push(newSchedule);
  
  // Record the event
  emitEvent(EVENT_TYPES.REPORT_SCHEDULED, {
    scheduleId: newSchedule.id,
    reportTemplateId: newSchedule.reportTemplateId,
    name: newSchedule.name,
    schedule: newSchedule.schedule,
  });
  
  return newSchedule;
};

// Get all scheduled reports
export const getScheduledReports = (): ScheduledReport[] => {
  return [...mockScheduledReports];
};

// Helper functions for mock data generation
const generateMockData = (template: ReportTemplate): any[] => {
  // Generate mock data based on the template's query reference
  // In a real app, this would execute SQL or fetch from an API
  
  const rowCount = Math.floor(Math.random() * 20) + 5;
  const data = [];
  
  for (let i = 0; i < rowCount; i++) {
    const row: Record<string, any> = {};
    
    // Add some standard fields
    if (template.queryReference.includes('attendance')) {
      row.date = new Date(2025, 4, i + 1).toISOString().split('T')[0];
      row.present = Math.floor(Math.random() * 50) + 50;
      row.absent = Math.floor(Math.random() * 10);
      row.leave = Math.floor(Math.random() * 5);
      row.total = row.present + row.absent + row.leave;
    } else if (template.queryReference.includes('revenue') || template.queryReference.includes('pl')) {
      row.period = `May ${i + 1}, 2025`;
      row.revenue = Math.floor(Math.random() * 100000) + 50000;
      row.expenses = Math.floor(Math.random() * 50000) + 20000;
      row.profit = row.revenue - row.expenses;
      row.margin = (row.profit / row.revenue * 100).toFixed(2) + '%';
    } else {
      // Generic data
      row.id = `row-${i}`;
      row.name = `Item ${i + 1}`;
      row.value = Math.floor(Math.random() * 1000);
      row.category = ['Category A', 'Category B', 'Category C'][i % 3];
      row.date = new Date(2025, 4, i + 1).toISOString().split('T')[0];
    }
    
    data.push(row);
  }
  
  return data;
};

const generateMockColumns = (template: ReportTemplate): Array<{ name: string, type: string, label: string }> => {
  // Generate mock column definitions based on the template
  if (template.queryReference.includes('attendance')) {
    return [
      { name: 'date', type: 'date', label: 'Date' },
      { name: 'present', type: 'number', label: 'Present' },
      { name: 'absent', type: 'number', label: 'Absent' },
      { name: 'leave', type: 'number', label: 'On Leave' },
      { name: 'total', type: 'number', label: 'Total' },
    ];
  } else if (template.queryReference.includes('revenue') || template.queryReference.includes('pl')) {
    return [
      { name: 'period', type: 'string', label: 'Period' },
      { name: 'revenue', type: 'number', label: 'Revenue' },
      { name: 'expenses', type: 'number', label: 'Expenses' },
      { name: 'profit', type: 'number', label: 'Profit' },
      { name: 'margin', type: 'string', label: 'Margin' },
    ];
  } else {
    // Generic columns
    return [
      { name: 'id', type: 'string', label: 'ID' },
      { name: 'name', type: 'string', label: 'Name' },
      { name: 'value', type: 'number', label: 'Value' },
      { name: 'category', type: 'string', label: 'Category' },
      { name: 'date', type: 'date', label: 'Date' },
    ];
  }
};

// Mock data
const mockReportTemplates: ReportTemplate[] = [
  // These would be defined here, but we'll leave them empty since we've already defined templates in the UI components
];

const mockDashboards: Dashboard[] = [
  {
    id: "dashboard-executive",
    name: "Executive Dashboard",
    description: "Key performance indicators for executive management",
    layout: {
      widgets: [
        {
          id: "widget-1",
          reportTemplateId: "acc-pl",
          title: "Revenue Trend",
          type: "chart",
          chartType: "line",
          position: { x: 0, y: 0, w: 6, h: 4 },
          parameters: { period: "last12months" }
        },
        {
          id: "widget-2",
          reportTemplateId: "ops-attendance",
          title: "Attendance Summary",
          type: "chart",
          chartType: "bar",
          position: { x: 6, y: 0, w: 6, h: 4 },
          parameters: { period: "currentMonth" }
        }
      ]
    },
    filters: { branch: "all" },
    createdBy: "System",
    createdAt: "2025-01-01T00:00:00Z",
    isDefault: true,
    isGlobal: true
  }
];

const mockScheduledReports: ScheduledReport[] = [
  {
    id: "schedule-1",
    name: "Monthly P&L Report",
    reportTemplateId: "acc-pl",
    parameters: { period: "previousMonth" },
    format: "pdf",
    schedule: {
      type: "monthly",
      dayOfMonth: 1,
      time: "09:00",
      timezone: "Asia/Kolkata",
      startDate: "2025-01-01"
    },
    recipients: ["finance@example.com"],
    status: "active",
    lastRun: "2025-04-01T09:00:00Z",
    nextRun: "2025-05-01T09:00:00Z",
    createdBy: "System",
    createdAt: "2024-12-15T00:00:00Z"
  }
];
