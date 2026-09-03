'use client';

import { StatutoryCompliance, ComplianceDocument, SalaryData, Employee } from "@/modules/hr/components";
import { HR_CONFIG } from "@/config";
import { emitEvent, EVENT_TYPES } from "@/services/EventService";

// Compliance document types
export type ComplianceDocumentType = 'challan' | 'ecr' | 'return' | 'receipt' | 'certificate' | 'other';

// Enhanced compliance status types
export type ComplianceStatus = 'pending' | 'generated' | 'filed' | 'verified' | 'overdue';

/**
 * Service for managing statutory compliance operations
 */
export class ComplianceService {
  /**
   * Calculate statutory deductions based on employee salary data
   */
  static calculateStatutoryDeductions(salaryData: SalaryData, state: string = "DEFAULT"): {
    pfDeduction: number;
    esiDeduction: number;
    professionalTax: number;
    employerPfContribution: number;
    employerEsiContribution: number;
  } {
    const { PF, ESIC, PT } = HR_CONFIG;
    
    // Get PT slabs based on state or use default
    const ptSlabs = PT[state] ? PT[state].SLABS : PT.DEFAULT.SLABS;
    
    // Calculate PF deduction (employee contribution)
    let pfDeduction = 0;
    const pfWages = Math.min(salaryData.basic, PF.WAGE_CEILING);
    pfDeduction = Math.round(pfWages * (PF.EMPLOYEE_CONTRIBUTION_RATE / 100));
    
    // Calculate employer PF contribution
    const employerPfContribution = Math.round(pfWages * (PF.EMPLOYER_CONTRIBUTION_RATE / 100));
    
    // Calculate ESI deduction (if applicable)
    let esiDeduction = 0;
    let employerEsiContribution = 0;
    
    if (salaryData.grossSalary <= ESIC.WAGE_CEILING) {
      esiDeduction = Math.round(salaryData.grossSalary * (ESIC.EMPLOYEE_CONTRIBUTION_RATE / 100));
      employerEsiContribution = Math.round(salaryData.grossSalary * (ESIC.EMPLOYER_CONTRIBUTION_RATE / 100));
    }
    
    // Calculate Professional Tax based on state's slab
    const professionalTax = this.calculateProfessionalTax(salaryData.grossSalary, ptSlabs);
    
    return {
      pfDeduction,
      esiDeduction,
      professionalTax,
      employerPfContribution,
      employerEsiContribution
    };
  }
  
  /**
   * Calculate Professional Tax based on salary and slabs
   */
  private static calculateProfessionalTax(grossSalary: number, slabs: any[]): number {
    for (const slab of slabs) {
      if (grossSalary >= slab.min && grossSalary <= slab.max) {
        return slab.amount;
      }
    }
    return 0;
  }
  
  /**
   * Generate monthly compliance entries for a new month
   */
  static generateMonthlyComplianceEntries(month: string): StatutoryCompliance[] {
    const complianceEntries: StatutoryCompliance[] = [];
    const monthDate = new Date(month + '-01');
    
    // Generate PF compliance entry
    const pfDueDate = new Date(monthDate);
    pfDueDate.setMonth(pfDueDate.getMonth() + 1);
    pfDueDate.setDate(15);
    
    complianceEntries.push({
      id: `PF-${month}`,
      type: 'pf',
      month: month,
      dueDate: pfDueDate.toISOString().split('T')[0],
      status: 'pending',
      amount: 0 // Will be updated when calculated
    });
    
    // Generate ESIC compliance entry
    const esicDueDate = new Date(monthDate);
    esicDueDate.setMonth(esicDueDate.getMonth() + 1);
    esicDueDate.setDate(21);
    
    complianceEntries.push({
      id: `ESIC-${month}`,
      type: 'esic',
      month: month,
      dueDate: esicDueDate.toISOString().split('T')[0],
      status: 'pending',
      amount: 0 // Will be updated when calculated
    });
    
    // Generate Professional Tax compliance entry
    const ptDueDate = new Date(monthDate);
    ptDueDate.setMonth(ptDueDate.getMonth() + 1);
    ptDueDate.setDate(30);
    
    complianceEntries.push({
      id: `PT-${month}`,
      type: 'pt',
      month: month,
      dueDate: ptDueDate.toISOString().split('T')[0],
      status: 'pending',
      amount: 0 // Will be updated when calculated
    });
    
    // Generate TDS quarterly entry if this is the last month of a quarter
    const monthNum = parseInt(month.split('-')[1]);
    if (monthNum % 3 === 0) {
      const quarter = Math.ceil(monthNum / 3);
      const year = month.split('-')[0];
      const tdsDueDate = new Date(monthDate);
      tdsDueDate.setMonth(tdsDueDate.getMonth() + 1);
      tdsDueDate.setDate(7);
      
      complianceEntries.push({
        id: `TDS-${year}-Q${quarter}`,
        type: 'tds',
        month: `${year}-Q${quarter}`,
        dueDate: tdsDueDate.toISOString().split('T')[0],
        status: 'pending',
        amount: 0 // Will be updated when calculated
      });
    }
    
    return complianceEntries;
  }
  
  /**
   * Update compliance totals based on salary data
   */
  static updateComplianceTotals(complianceEntries: StatutoryCompliance[], salaryData: SalaryData[]): StatutoryCompliance[] {
    const updatedEntries = [...complianceEntries];
    
    // Calculate total PF amount
    const pfEntry = updatedEntries.find(entry => entry.type === 'pf');
    if (pfEntry) {
      pfEntry.amount = salaryData.reduce((sum, emp) => 
        sum + (emp.pfDeduction || 0), 0);
    }
    
    // Calculate total ESIC amount
    const esicEntry = updatedEntries.find(entry => entry.type === 'esic');
    if (esicEntry) {
      esicEntry.amount = salaryData.reduce((sum, emp) => 
        sum + (emp.esiDeduction || 0), 0);
    }
    
    // Calculate total PT amount
    const ptEntry = updatedEntries.find(entry => entry.type === 'pt');
    if (ptEntry) {
      ptEntry.amount = salaryData.reduce((sum, emp) => 
        sum + (emp.professionalTax || 0), 0);
    }
    
    // For TDS, would need additional logic with income tax calculations
    
    return updatedEntries;
  }
  
  /**
   * Get compliance entries that are due soon
   */
  static getUpcomingDueDates(complianceEntries: StatutoryCompliance[], daysThreshold: number = 7): StatutoryCompliance[] {
    const today = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(today.getDate() + daysThreshold);
    
    return complianceEntries.filter(entry => {
      const dueDate = new Date(entry.dueDate);
      return (
        entry.status === 'pending' && 
        dueDate > today && 
        dueDate <= thresholdDate
      );
    });
  }
  
  /**
   * Get compliance entries that are overdue
   */
  static getOverdueCompliance(complianceEntries: StatutoryCompliance[]): StatutoryCompliance[] {
    const today = new Date();
    
    return complianceEntries.filter(entry => {
      const dueDate = new Date(entry.dueDate);
      return (
        entry.status === 'pending' && 
        dueDate < today
      );
    }).map(entry => ({
      ...entry,
      status: 'overdue' as 'pending' | 'filed' | 'overdue' // Type cast to avoid TypeScript error
    }));
  }
  
  /**
   * Update compliance status and details
   */
  static updateComplianceStatus(
    complianceId: string, 
    complianceEntries: StatutoryCompliance[],
    status: ComplianceStatus, 
    details: Partial<StatutoryCompliance> = {}
  ): StatutoryCompliance[] {
    return complianceEntries.map(entry => {
      if (entry.id === complianceId) {
        const updatedEntry = {
          ...entry,
          status: status as 'pending' | 'filed' | 'overdue', // Type cast to match the existing type
          ...details
        };
        
        // Emit compliance status change event
        if (status === 'filed') {
          emitEvent(EVENT_TYPES.COMPLIANCE_FILED, updatedEntry);
        }
        
        return updatedEntry;
      }
      return entry;
    });
  }
  
  /**
   * Generate a compliance document based on type and month
   */
  static async generateComplianceDocument(
    type: 'pf' | 'esic' | 'pt' | 'tds',
    month: string,
    salaryData: SalaryData[]
  ): Promise<{ success: boolean, documentUrl?: string, message?: string }> {
    try {
      // In a real implementation, this would generate actual files
      // For now, we'll simulate the generation with a delay
      
      // Return simulated response
      return {
        success: true,
        documentUrl: `/documents/${type}-${month}.xlsx`,
        message: `${type.toUpperCase()} document for ${month} generated successfully`
      };
    } catch (error) {
      console.error(`Error generating ${type} document:`, error);
      return {
        success: false,
        message: `Failed to generate ${type.toUpperCase()} document: ${error}`
      };
    }
  }
  
  /**
   * Check if compliance monitoring should be enabled
   */
  static shouldMonitorCompliance(employeeCount: number): boolean {
    return employeeCount >= HR_CONFIG.ESIC.COVERAGE_THRESHOLD;
  }
  
  /**
   * Check for approaching due dates and trigger notifications
   */
  static checkAndNotifyDueDates(complianceEntries: StatutoryCompliance[]): void {
    const upcomingDueDates = this.getUpcomingDueDates(complianceEntries, 3);
    
    if (upcomingDueDates.length > 0) {
      emitEvent(EVENT_TYPES.COMPLIANCE_DUE_DATE_APPROACHING, upcomingDueDates);
    }
    
    const overdueEntries = this.getOverdueCompliance(complianceEntries);
    
    if (overdueEntries.length > 0) {
      emitEvent(EVENT_TYPES.COMPLIANCE_OVERDUE, overdueEntries);
    }
  }
}
