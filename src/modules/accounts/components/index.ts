'use client';

export interface ComponentWithFilterProps {
  filter: string;
}

// Add specific interfaces for each Accounts component
export interface AccountsPayableProps extends ComponentWithFilterProps {}
export interface BillingReceivablesProps extends ComponentWithFilterProps {}
export interface BankingCashProps extends ComponentWithFilterProps {}
export interface FixedAssetsProps extends ComponentWithFilterProps {}
export interface FinancialsMISProps extends ComponentWithFilterProps {}
export interface GSTComplianceProps extends ComponentWithFilterProps {}
export interface TDSComplianceProps extends ComponentWithFilterProps {}

// Form interfaces for modals and dialogs
export interface BillFormData {
  category: string;
  branchId: string;
  amount: number;
  date: string;
  paymentMethod: string;
  description: string;
  attachments?: File[];
}

export interface PaymentRequestFormData {
  department: string;
  purpose: string;
  amount: number;
  requestDate: string;
  remarks?: string;
  attachments?: File[];
}

export interface InvoiceFormData {
  clientId: string;
  branchId: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  description: string;
  attachments?: File[];
}

export interface OtherIncomeFormData {
  source: string;
  category: string;
  amount: number;
  date: string;
  receivedFrom?: string;
  description: string;
  attachments?: File[];
}

export interface BankAccountFormData {
  accountName: string;
  accountNumber: string;
  bankName: string;
  branch: string;
  ifscCode: string;
  accountType: string;
  initialBalance: number;
  currency: string;
}

export interface FixedAssetFormData {
  name: string;
  category: string;
  purchaseDate: string;
  purchasePrice: number;
  location: string;
  assignedTo?: string;
  notes?: string;
  attachments?: File[];
}
