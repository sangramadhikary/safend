'use client';

import { apiRequest } from '../api';

export interface Invoice {
  id: string;
  clientId: string;
  clientName: string;
  branchId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  gstApplicable: boolean;
  gstAmount?: number;
  totalAmount: number;
  description: string;
  status: string;
  eInvoiceApplicable: boolean;
  eInvoiceRef?: string;
  paymentDate?: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  referenceNumber: string;
  status: string;
  description: string;
  branchId: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OtherIncome {
  id: string;
  source: string;
  category: string;
  amount: number;
  date: string;
  receivedFrom?: string;
  description: string;
  branchId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaxEntry {
  id: string;
  type: string;
  period: string;
  dueDate: string;
  amount: number;
  status: string;
  filingDate?: string;
  paymentDate?: string;
  referenceNumber?: string;
  branchId?: string;
}

export interface PaymentRequest {
  id: string;
  department: string;
  purpose: string;
  amount: number;
  requestedDate: string;
  status: string;
  remarks?: string;
  branchId: string;
  approvedBy?: string;
  approvedDate?: string;
  paidDate?: string;
  attachments?: File[];
}

export interface ReportData {
  labels: string[];
  datasets: Array<{
    name: string;
    data: number[];
    color: string;
  }>;
  summary?: {
    total: number;
    average: number;
    growth: number;
    ytd: number;
  };
}

export interface Expense {
  id: string;
  category: string;
  amount: number;
  date: string;
  paymentMethod: string;
  description: string;
  status: string;
  branchId: string;
  employeeName?: string;
  branchName?: string;
  createdAt: string;
  updatedAt: string;
}

// Add missing interfaces needed by other components
export interface DashboardWidget {
  id: string;
  title: string;
  type: string;
  data: any;
  icon?: string;
  color?: string;
  trend?: number;
  status?: string;
}

export interface Payable {
  id: string;
  description: string;
  vendorName?: string;
  employeeName?: string;
  dueDate: string;
  totalAmount: number;
  status: string;
  type: string;
  amount: number;
  gstApplicable?: boolean;
  gstAmount?: number;
  tdsApplicable?: boolean;
  tdsAmount?: number;
  paymentMethod?: string;
  paymentReference?: string;
  paymentDate?: string;
}

export interface Receivable {
  id: string;
  description: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  status: string;
  type: string;
  amount: number;
  gstApplicable: boolean;
  gstAmount?: number;
  paymentDate?: string;
  invoiceNumber?: string;
  eInvoiceApplicable: boolean;
  eInvoiceRef?: string;
}

export interface BankAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  branchName: string;
  ifscCode: string;
  balance: number;
  status: string;
  accountType: string;
  lastTransactionDate?: string;
  branchId: string;
  branch?: string; // Add alias for backward compatibility
}

export interface AccountTransaction {
  id: string;
  accountId?: string;
  type: string;
  amount: number;
  description: string;
  date: string;
  reference?: string;
  referenceNumber?: string; // Add referenceNumber property
  status: string;
  balance?: number;
  category?: string;
  branchId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceReturn {
  id: string;
  returnType: string;
  period: string;
  dueDate: string;
  amount: number;
  status: string;
  filingDate?: string;
  paymentDate?: string;
  referenceNumber?: string;
  branchId?: string;
}

export interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  account: string;
  accountCode: string;
  debit: number;
  credit: number;
  balance: number;
  referenceType: string;
  referenceId?: string;
  branchId: string;
}

export interface Asset {
  id: string;
  name: string;
  category: string;
  value: number;
  purchaseDate: string;
  description: string;
  status: string;
  branchId: string;
  purchasePrice: number;
  currentValue: number;
  depreciationRate: number;
  depreciationMethod: string;
  /** Residual value below which the asset is not depreciated (SLM/WDV floor) */
  salvageValue: number;
  /** Total depreciation charged to date (cumulative) */
  accumulatedDepreciation: number;
  /** ISO date of the last depreciation run, if any */
  lastDepreciationDate: string | null;
}

export interface Liability {
  id: string;
  name: string;
  type: string;
  amount: number;
  dueDate: string;
  description: string;
  status: string;
  branchId: string;
  creditorName?: string;
  startDate: string;
  remainingAmount: number;
  /** Annual interest rate (%) — drives amortization & interest accrual */
  interestRate: number;
  emiAmount: number | null;
  emiDay: number | null;
  totalInstallments: number | null;
  paidInstallments: number;
  nextPaymentDate: string | null;
}

export class AccountsService {
  // Invoice methods
  public static async getInvoices(params: Record<string, string> = {}): Promise<Invoice[]> {
    try {
      const response = await apiRequest('GET', '/invoices', params);
      return response.data;
    } catch (error) {
      console.error('Error fetching invoices:', error);
      throw error;
    }
  }

  public static async createInvoice(invoiceData: Omit<Invoice, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<Invoice> {
    try {
      const response = await apiRequest('POST', '/invoices', {}, invoiceData);
      return response.data;
    } catch (error) {
      console.error('Error creating invoice:', error);
      throw error;
    }
  }

  // Payment methods
  public static async getPayments(params: Record<string, string> = {}): Promise<Payment[]> {
    try {
      const response = await apiRequest('GET', '/payments', params);
      return response.data;
    } catch (error) {
      console.error('Error fetching payments:', error);
      throw error;
    }
  }

  // Other income methods
  public static async getOtherIncome(params: Record<string, string> = {}): Promise<OtherIncome[]> {
    try {
      const response = await apiRequest('GET', '/other-income', params);
      return response.data;
    } catch (error) {
      console.error('Error fetching other income:', error);
      throw error;
    }
  }

  public static async createOtherIncome(incomeData: Omit<OtherIncome, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<OtherIncome> {
    try {
      const response = await apiRequest('POST', '/other-income', {}, incomeData);
      return response.data;
    } catch (error) {
      console.error('Error creating other income:', error);
      throw error;
    }
  }

  // Expense methods
  public static async createExpense(expenseData: Omit<Expense, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<Expense> {
    try {
      const response = await apiRequest('POST', '/expenses', {}, expenseData);
      return response.data;
    } catch (error) {
      console.error('Error creating expense:', error);
      throw error;
    }
  }

  // Report methods
  public static async getIncomeReport(params: { startDate: string; endDate: string; branchId?: string; groupBy?: string }): Promise<ReportData> {
    try {
      const response = await apiRequest('GET', '/reports/income', params);
      return {
        ...response.data,
        summary: {
          total: response.data.total || 0,
          average: response.data.average || 0,
          growth: response.data.growth || 0,
          ytd: response.data.ytd || 0
        }
      };
    } catch (error) {
      console.error('Error fetching income report:', error);
      throw error;
    }
  }

  public static async getExpenseReport(params: { startDate: string; endDate: string; branchId?: string; groupBy?: string }): Promise<ReportData> {
    try {
      const response = await apiRequest('GET', '/reports/expense', params);
      return {
        ...response.data,
        summary: {
          total: response.data.total || 0,
          average: response.data.average || 0,
          growth: response.data.growth || 0,
          ytd: response.data.ytd || 0
        }
      };
    } catch (error) {
      console.error('Error fetching expense report:', error);
      throw error;
    }
  }

  // Payment request methods
  public static async updatePaymentRequestStatus(requestId: string, status: "approved" | "rejected" | "paid"): Promise<PaymentRequest> {
    try {
      const response = await apiRequest('PUT', `/payment-requests/${requestId}/status`, {}, { status });
      return response.data;
    } catch (error) {
      console.error('Error updating payment request status:', error);
      throw error;
    }
  }

  // Dashboard widget methods
  public static async getDashboardWidgets(branchId?: string): Promise<DashboardWidget[]> {
    try {
      const params = branchId ? { branchId } : {};
      const response = await apiRequest('GET', '/dashboard/widgets', params);
      return response.data;
    } catch (error) {
      console.error('Error fetching dashboard widgets:', error);
      throw error;
    }
  }

  // Cash flow report method
  public static async getCashFlowReport(
    startDate: string, 
    endDate: string, 
    branchId?: string
  ): Promise<any> {
    try {
      const response = await apiRequest('GET', '/reports/cash-flow', { 
        startDate, 
        endDate, 
        branchId 
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching cash flow report:', error);
      throw error;
    }
  }

  // Profit and loss report method
  public static async getProfitLossReport(params: { 
    startDate: string; 
    endDate: string; 
    branchId?: string;
    groupBy?: string;
  }): Promise<ReportData> {
    try {
      const response = await apiRequest('GET', '/reports/profit-loss', params);
      return response.data;
    } catch (error) {
      console.error('Error fetching profit & loss report:', error);
      throw error;
    }
  }

  // Expense related methods
  public static async getExpenses(params: Record<string, string> = {}): Promise<Expense[]> {
    try {
      const response = await apiRequest('GET', '/expenses', params);
      return response.data;
    } catch (error) {
      console.error('Error fetching expenses:', error);
      throw error;
    }
  }

  // Payment request methods
  public static async getPaymentRequests(params: Record<string, string> = {}): Promise<PaymentRequest[]> {
    try {
      const response = await apiRequest('GET', '/payment-requests', params);
      return response.data;
    } catch (error) {
      console.error('Error fetching payment requests:', error);
      throw error;
    }
  }

  public static async createPaymentRequest(
    requestData: Omit<PaymentRequest, 'id' | 'status' | 'approvedBy' | 'approvedDate' | 'paidDate'> & { requestedDate?: string }
  ): Promise<PaymentRequest> {
    try {
      const response = await apiRequest('POST', '/payment-requests', {}, requestData);
      return response.data;
    } catch (error) {
      console.error('Error creating payment request:', error);
      throw error;
    }
  }

  // Assets and liabilities methods
  public static async getAssets(params: Record<string, string> = {}): Promise<Asset[]> {
    try {
      const response = await apiRequest('GET', '/assets', params);
      return response.data;
    } catch (error) {
      console.error('Error fetching assets:', error);
      throw error;
    }
  }

  public static async getLiabilities(params: Record<string, string> = {}): Promise<Liability[]> {
    try {
      const response = await apiRequest('GET', '/liabilities', params);
      return response.data;
    } catch (error) {
      console.error('Error fetching liabilities:', error);
      throw error;
    }
  }

  // Bank account methods
  public static async getBankAccounts(params: Record<string, string> = {}): Promise<BankAccount[]> {
    try {
      const response = await apiRequest('GET', '/bank-accounts', params);
      return response.data;
    } catch (error) {
      console.error('Error fetching bank accounts:', error);
      throw error;
    }
  }

  // Compliance return methods
  public static async getComplianceReturns(returnType: string, params: Record<string, string> = {}): Promise<ComplianceReturn[]> {
    try {
      const response = await apiRequest('GET', `/compliance/${returnType}`, params);
      return response.data;
    } catch (error) {
      console.error(`Error fetching ${returnType} returns:`, error);
      throw error;
    }
  }

  // Ledger entries methods
  public static async getLedgerEntries(params: { startDate: string; endDate: string; branchId?: string; search?: string }): Promise<LedgerEntry[]> {
    try {
      const response = await apiRequest('GET', '/ledger', params);
      return response.data;
    } catch (error) {
      console.error('Error fetching ledger entries:', error);
      throw error;
    }
  }

  // Payables methods
  public static async getPayables(params: Record<string, string> = {}): Promise<Payable[]> {
    try {
      const response = await apiRequest('GET', '/payables', params);
      return response.data;
    } catch (error) {
      console.error('Error fetching payables:', error);
      throw error;
    }
  }

  public static async getPayableById(id: string): Promise<Payable | null> {
    try {
      const response = await apiRequest('GET', `/payables/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching payable details:', error);
      throw error;
    }
  }

  // Receivables methods
  public static async getReceivables(params: Record<string, string> = {}): Promise<Receivable[]> {
    try {
      const response = await apiRequest('GET', '/receivables', params);
      return response.data;
    } catch (error) {
      console.error('Error fetching receivables:', error);
      throw error;
    }
  }

  public static async getReceivableById(id: string): Promise<Receivable | null> {
    try {
      const response = await apiRequest('GET', `/receivables/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching receivable details:', error);
      throw error;
    }
  }
}
