'use client';
// Base interface for all HR components
export interface ComponentWithFilterProps {
  filter: string;
}

// Employee Management
export interface EmployeeDirectoryProps extends ComponentWithFilterProps {}

// Leave Management
export interface LeaveManagementProps extends ComponentWithFilterProps {}
export interface LeaveDashboardProps extends ComponentWithFilterProps {
  month?: string;
}

// Training & Development
export interface TrainingModuleProps extends ComponentWithFilterProps {}

// Payroll & Salary Management
export interface PayrollManagementProps extends ComponentWithFilterProps {}
export interface SalaryCalculationProps extends ComponentWithFilterProps {}

// Compliance & Documentation
export interface ComplianceDashboardProps extends ComponentWithFilterProps {
  month?: string;
}

// Reports & Analytics
export interface HRReportsProps extends ComponentWithFilterProps {}

// Loan Management
export interface LoanCentreProps extends ComponentWithFilterProps {}

// Employee Data Types
export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  status: string;
  joinDate: string;
  avatar: string;
  phoneNumber?: string;
  address?: string;
  govtIds?: {
    aadhar?: string;
    pan?: string;
    uan?: string;
    esic?: string;
  };
  bankDetails?: {
    accountNumber: string;
    ifsc: string;
    bankName: string;
  };
  documents?: EmployeeDocument[];
}

export interface EmployeeDocument {
  id: string;
  type: 'agreement' | 'idcard' | 'biodata' | 'kyc' | 'other';
  fileName: string;
  uploadDate: string;
  status: 'verified' | 'pending' | 'rejected';
  url: string;
}

// Payroll & Statutory Types
export interface SalaryStructure {
  id: string;
  employeeId: string;
  basic: number;
  hra: number;
  specialAllowance: number;
  grossSalary: number;
  pfDeduction: number;
  esiDeduction: number;
  professionalTax: number;
  tdsDeduction: number;
  netSalary: number;
  effectiveFrom: string;
}

export interface PayrollRun {
  id: string;
  month: string;
  status: 'draft' | 'processing' | 'completed' | 'approved';
  totalEmployees: number;
  totalAmount: number;
  processedBy: string;
  processedAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface StatutoryCompliance {
  id: string;
  type: 'pf' | 'esic' | 'pt' | 'tds' | 'bonus' | 'gratuity';
  month: string;
  dueDate: string;
  status: 'pending' | 'filed' | 'overdue' | 'generated' | 'verified';
  amount: number;
  filedBy?: string;
  filingDate?: string;
  challanNumber?: string;
  documentUrl?: string;
  remarks?: string;
  lastUpdated?: string;
  totalEmployees?: number;
}

export interface ComplianceDocument {
  id: string;
  complianceId: string;
  type: 'challan' | 'ecr' | 'return' | 'receipt' | 'certificate' | 'other';
  fileName: string;
  fileUrl: string;
  uploadedBy: string;
  uploadedAt: string;
  status: 'verified' | 'pending' | 'rejected';
  remarks?: string;
}

export interface ComplianceCalendarEntry {
  id: string;
  type: 'pf' | 'esic' | 'pt' | 'tds' | 'bonus' | 'gratuity' | 'other';
  title: string;
  date: string;
  status: 'pending' | 'completed' | 'overdue';
  priority: 'high' | 'medium' | 'low';
}

// Leave Management Types
export interface LeaveApplication {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: 'casual' | 'sick' | 'earned' | 'unpaid';
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedOn: string;
  approvedBy?: string;
  approvedOn?: string;
}

export interface LeaveBalance {
  employeeId: string;
  casual: number;
  sick: number;
  earned: number;
  total: number;
}

// Uninformed Leave & Abscond Types
export interface UninformedLeave {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  detectedBy: string;
  resolvedBy?: string;
  resolution?: 'Regularized' | 'Converted' | 'Marked Abscond' | null;
  timestamp: string;
  postId?: string;
  branchId?: string;
}

export interface AbscondCase {
  id: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  lastContact: string;
  status: 'PENDING' | 'CLOSED';
  remarks: string;
  createdAt: string;
  closedAt?: string;
  closedBy?: string;
  salaryCut?: boolean;
}

// Loan Types
export type LoanType = 'ADVANCE_SALARY' | 'NEGATIVE_BALANCE' | 'UNIFORM_FEE' | 'TRAINING_FEE';
export type LoanStatus = 'REQUESTED' | 'APPROVED' | 'ACTIVE' | 'CLOSED' | 'REJECTED';
export type LoanAccountsRequestStatus = 'DRAFT' | 'SENT_TO_ACCOUNTS' | 'APPROVED_BY_ACCOUNTS' | 'REJECTED_BY_ACCOUNTS';

export interface Loan {
  id: string;
  employeeId: string;
  employeeName: string;
  type: LoanType;
  principal: number;
  emiMonths: number;
  interestPct: number;
  balance: number;
  status: LoanStatus;
  requestedOn: string;
  approvedOn?: string;
  approvedBy?: string;
  startDate?: string;
  endDate?: string;
  // New fields for accounts approval workflow
  accountsRequestStatus?: LoanAccountsRequestStatus;
  sentToAccountsOn?: string;
  accountsApprovedOn?: string;
  accountsApprovedBy?: string;
  accountsRejectedOn?: string;
  accountsRejectedBy?: string;
  rejectionReason?: string;
}

export interface LoanInstallment {
  id: string;
  loanId: string;
  payslipId?: string;
  amount: number;
  dueDate: string;
  paidOn?: string;
  status: 'PENDING' | 'PAID' | 'OVERDUE';
}

// Salary related types
export interface SalaryData {
  id: string;
  name: string;
  designation: string;
  shifts: number;
  dutyEarnings: number;
  baseSalary: number;
  basic: number;
  hra: number;
  otherAllowances: number;
  totalAllowances: number;
  pfDeduction: number;
  esiDeduction: number;
  professionalTax: number;
  tdsDeduction: number;
  loanDeduction?: number;
  messCharges?: number;
  otherDeductions?: number;
  grossSalary: number;
  totalDeduction: number;
  netSalary: number;
  attendedShifts?: number;
  totalShifts?: number;
  status?: 'READY_TO_PAY' | 'HELD' | 'PAID';
  holdReason?: string;
}

export interface SalaryAdjustment {
  id: string;
  employeeId: string;
  type: "Allowance" | "Deduction";
  description: string;
  amount: number;
  appliedDate: string;
}

// New types for Salary Payment Requests
export interface SalaryPaymentRequestUI {
  id: string;
  departmentName: string;
  employeeCount: number;
  totalAmount: number;
  month: string;
  year: string;
  requestDate: string;
  status: string;
  description: string;
  paymentReference?: string;
  heldCount?: number;
}

// New interfaces for detailed salary processing
export interface EmployeeSalaryDetailUI {
  employeeId: string;
  employeeName: string;
  designation?: string;
  department?: string;
  attendedShifts: number;
  totalShifts: number;
  baseSalary: number;
  deductions: SalaryDeductionUI[];
  netSalary: number;
  status: 'READY_TO_PAY' | 'HELD' | 'PAID';
  holdReason?: string;
}

export interface SalaryDeductionUI {
  type: 'PF' | 'ESI' | 'PT' | 'TDS' | 'LOAN' | 'MESS' | 'OTHER';
  description: string;
  amount: number;
  reference?: string;
}

export interface HeldSalaryUI {
  employeeId: string;
  employeeName: string;
  amount: number;
  reason: string;
  heldBy: string;
  heldOn: string;
  resolved: boolean;
  resolvedOn?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
}

// Mess charge interfaces
export interface MessChargeUI {
  id: string;
  employeeId: string;
  employeeName: string;
  month: string;
  year: string;
  amount: number;
  numberOfMeals: number;
  description: string;
  status: string;
}
