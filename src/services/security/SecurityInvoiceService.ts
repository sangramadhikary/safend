'use client';

import { emitEvent, EVENT_TYPES } from '@/hooks/useEvent';

export interface SecurityInvoice {
  id: string;
  clientId: string;
  clientName: string;
  invoiceNumber: string;
  month: string;
  year: string;
  totalAmount: number;
  gstAmount?: number;
  gstPercentage?: number;
  gstApplicable: boolean;
  eInvoiceApplicable: boolean;
  eInvoiceRef?: string;
  issueDate: string;
  dueDate: string;
  status: 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'cancelled';
  items: SecurityInvoiceItem[];
  paymentTerms?: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  sentAt?: string;
  paidAt?: string;
  paidAmount?: number;
  branchId?: string;
}

export interface SecurityInvoiceItem {
  id: string;
  postId: string;
  postName: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  startDate: string;
  endDate: string;
  attendanceDetails?: {
    daysPresent: number;
    totalDays: number;
    replacementDays: number;
    overtimeHours: number;
    penalties: number;
  }
}

// Mock data for invoices
const securityInvoices: SecurityInvoice[] = [];
let lastInvoiceNumber = 1000;

// Function to generate a unique invoice ID
const generateInvoiceId = () => {
  return `INV-${Date.now().toString().slice(-6)}`;
};

// Function to generate the next invoice number
const generateInvoiceNumber = () => {
  lastInvoiceNumber++;
  return `SI-${lastInvoiceNumber}`;
};

// Function to create a new security invoice
export const createSecurityInvoice = (data: Omit<SecurityInvoice, 'id' | 'invoiceNumber' | 'status' | 'createdAt'>): SecurityInvoice => {
  const now = new Date().toISOString();
  
  // Calculate total amount if not provided
  const totalAmount = data.totalAmount || data.items.reduce((total, item) => total + item.amount, 0);
  
  // Calculate GST amount if applicable
  const gstAmount = data.gstApplicable ? 
    (data.gstPercentage || 18) / 100 * totalAmount : 
    0;
  
  const invoice: SecurityInvoice = {
    id: generateInvoiceId(),
    invoiceNumber: generateInvoiceNumber(),
    status: 'draft',
    createdAt: now,
    totalAmount: totalAmount + gstAmount,
    gstAmount: data.gstApplicable ? gstAmount : undefined,
    gstPercentage: data.gstApplicable ? (data.gstPercentage || 18) : undefined,
    ...data
  };
  
  securityInvoices.push(invoice);
  
  emitEvent(EVENT_TYPES.FORM_SUBMITTED, {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    clientId: invoice.clientId,
    clientName: invoice.clientName,
    amount: invoice.totalAmount
  });
  
  return invoice;
};

// Function to get all security invoices - updated to return Promise
export const getSecurityInvoices = async (filters?: {
  clientId?: string;
  status?: string;
  month?: string;
  year?: string;
  startDate?: string;
  endDate?: string;
  branchId?: string; // Added branchId to filters
}): Promise<SecurityInvoice[]> => {
  if (!filters) {
    return Promise.resolve([...securityInvoices]);
  }
  
  return Promise.resolve(securityInvoices.filter(invoice => {
    if (filters.clientId && invoice.clientId !== filters.clientId) {
      return false;
    }
    if (filters.status && invoice.status !== filters.status) {
      return false;
    }
    if (filters.month && invoice.month !== filters.month) {
      return false;
    }
    if (filters.year && invoice.year !== filters.year) {
      return false;
    }
    if (filters.startDate && new Date(invoice.issueDate) < new Date(filters.startDate)) {
      return false;
    }
    if (filters.endDate && new Date(invoice.issueDate) > new Date(filters.endDate)) {
      return false;
    }
    // Support for branchId filtering (assuming invoices might have a branchId)
    if (filters.branchId && invoice.branchId !== filters.branchId) {
      return false;
    }
    
    return true;
  }));
};

// Function to get a specific invoice by ID
export const getSecurityInvoiceById = (invoiceId: string): SecurityInvoice | undefined => {
  return securityInvoices.find(invoice => invoice.id === invoiceId);
};

// Function to update an invoice
export const updateSecurityInvoice = (invoiceId: string, updates: Partial<SecurityInvoice>): SecurityInvoice | null => {
  const invoiceIndex = securityInvoices.findIndex(invoice => invoice.id === invoiceId);
  
  if (invoiceIndex === -1) {
    return null;
  }
  
  // Don't allow updates to certain fields once invoice is sent
  if (securityInvoices[invoiceIndex].status !== 'draft') {
    // Filter out fields that cannot be updated after sending
    const { items, totalAmount, gstAmount, gstPercentage, invoiceNumber, issueDate, ...allowedUpdates } = updates;
    securityInvoices[invoiceIndex] = {
      ...securityInvoices[invoiceIndex],
      ...allowedUpdates,
      updatedAt: new Date().toISOString()
    };
  } else {
    // For draft invoices, allow all updates
    securityInvoices[invoiceIndex] = {
      ...securityInvoices[invoiceIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    // Recalculate totals if items were updated
    if (updates.items) {
      const totalBeforeGst = updates.items.reduce((total, item) => total + item.amount, 0);
      const gstAmount = securityInvoices[invoiceIndex].gstApplicable ? 
        (securityInvoices[invoiceIndex].gstPercentage || 18) / 100 * totalBeforeGst : 
        0;
        
      securityInvoices[invoiceIndex].totalAmount = totalBeforeGst + gstAmount;
      if (securityInvoices[invoiceIndex].gstApplicable) {
        securityInvoices[invoiceIndex].gstAmount = gstAmount;
      }
    }
  }
  
  emitEvent(EVENT_TYPES.FORM_SUBMITTED, {
    invoiceId,
    invoiceNumber: securityInvoices[invoiceIndex].invoiceNumber,
    status: securityInvoices[invoiceIndex].status
  });
  
  return securityInvoices[invoiceIndex];
};

// Function to send an invoice to client
export const sendSecurityInvoice = (invoiceId: string): SecurityInvoice | null => {
  const invoiceIndex = securityInvoices.findIndex(invoice => invoice.id === invoiceId);
  
  if (invoiceIndex === -1 || securityInvoices[invoiceIndex].status !== 'draft') {
    return null;
  }
  
  securityInvoices[invoiceIndex] = {
    ...securityInvoices[invoiceIndex],
    status: 'sent',
    sentAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  emitEvent(EVENT_TYPES.SECURITY_INVOICE_SENT, {
    invoiceId,
    invoiceNumber: securityInvoices[invoiceIndex].invoiceNumber,
    clientName: securityInvoices[invoiceIndex].clientName,
    amount: securityInvoices[invoiceIndex].totalAmount
  });
  
  return securityInvoices[invoiceIndex];
};

// Function to record a payment for an invoice
export const recordPaymentForInvoice = (
  invoiceId: string, 
  paymentData: { 
    amount: number; 
    paymentDate: string;
    paymentMethod: string;
    referenceNumber?: string;
    notes?: string;
  }
): SecurityInvoice | null => {
  const invoiceIndex = securityInvoices.findIndex(invoice => invoice.id === invoiceId);
  
  if (invoiceIndex === -1 || securityInvoices[invoiceIndex].status === 'cancelled') {
    return null;
  }
  
  const invoice = securityInvoices[invoiceIndex];
  const totalPaid = (invoice.paidAmount || 0) + paymentData.amount;
  
  // Update invoice status based on payment
  let newStatus = invoice.status;
  if (totalPaid >= invoice.totalAmount) {
    newStatus = 'paid';
  } else if (totalPaid > 0) {
    newStatus = 'partial';
  }
  
  securityInvoices[invoiceIndex] = {
    ...invoice,
    paidAmount: totalPaid,
    status: newStatus,
    paidAt: newStatus === 'paid' ? new Date().toISOString() : invoice.paidAt,
    updatedAt: new Date().toISOString()
  };
  
  emitEvent(EVENT_TYPES.SECURITY_INVOICE_PAID, {
    invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    clientName: invoice.clientName,
    amountPaid: paymentData.amount,
    totalPaid: totalPaid,
    status: newStatus
  });
  
  return securityInvoices[invoiceIndex];
};

// Function to cancel an invoice
export const cancelSecurityInvoice = (invoiceId: string, reason: string): SecurityInvoice | null => {
  const invoiceIndex = securityInvoices.findIndex(invoice => invoice.id === invoiceId);
  
  if (invoiceIndex === -1 || securityInvoices[invoiceIndex].status === 'paid') {
    return null;
  }
  
  securityInvoices[invoiceIndex] = {
    ...securityInvoices[invoiceIndex],
    status: 'cancelled',
    notes: reason + (securityInvoices[invoiceIndex].notes ? `\n${securityInvoices[invoiceIndex].notes}` : ''),
    updatedAt: new Date().toISOString()
  };
  
  emitEvent(EVENT_TYPES.SECURITY_INVOICE_CANCELLED, {
    invoiceId,
    invoiceNumber: securityInvoices[invoiceIndex].invoiceNumber,
    reason
  });
  
  return securityInvoices[invoiceIndex];
};

// Function to generate invoice based on attendance data
export const generateInvoiceFromAttendance = async (
  clientId: string,
  clientName: string,
  month: string,
  year: string,
  postIds: string[],
  options: {
    gstApplicable?: boolean;
    eInvoiceApplicable?: boolean;
    paymentTerms?: string;
    notes?: string;
    customRates?: Record<string, number>;
  } = {}
): Promise<SecurityInvoice> => {
  // In a real app, this would fetch attendance data from a database
  // and calculate billing items based on that data
  
  const mockAttendanceData = postIds.map(postId => ({
    postId,
    postName: `Post ${postId.split('-')[1]}`,
    daysPresent: 28 + Math.floor(Math.random() * 3),
    totalDays: 30,
    replacementDays: Math.floor(Math.random() * 3),
    overtimeHours: Math.floor(Math.random() * 10),
    basicRate: options.customRates?.[postId] || 500 + Math.floor(Math.random() * 200)
  }));
  
  const invoiceItems: SecurityInvoiceItem[] = mockAttendanceData.map(attendance => {
    const unitPrice = attendance.basicRate;
    const amount = unitPrice * attendance.daysPresent;
    
    return {
      id: `ITEM-${Date.now()}-${attendance.postId}`,
      postId: attendance.postId,
      postName: attendance.postName,
      description: `Security services for ${month} ${year}`,
      quantity: attendance.daysPresent,
      unitPrice,
      amount,
      startDate: `${year}-${getMonthNumber(month)}-01`,
      endDate: `${year}-${getMonthNumber(month)}-${getLastDayOfMonth(month, parseInt(year))}`,
      attendanceDetails: {
        daysPresent: attendance.daysPresent,
        totalDays: attendance.totalDays,
        replacementDays: attendance.replacementDays,
        overtimeHours: attendance.overtimeHours,
        penalties: 0
      }
    };
  });
  
  // Calculate total amount
  const totalAmount = invoiceItems.reduce((total, item) => total + item.amount, 0);
  
  // Generate invoice
  const issueDate = new Date().toISOString().split('T')[0];
  const dueDate = new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0];
  
  return createSecurityInvoice({
    clientId,
    clientName,
    month,
    year,
    totalAmount,
    gstApplicable: options.gstApplicable || false,
    eInvoiceApplicable: options.eInvoiceApplicable || false,
    issueDate,
    dueDate,
    items: invoiceItems,
    paymentTerms: options.paymentTerms || 'Net 30',
    notes: options.notes || '',
    createdBy: 'System'
  });
};

// Helper function to convert month name to number
const getMonthNumber = (monthName: string): string => {
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                 'july', 'august', 'september', 'october', 'november', 'december'];
  const monthIndex = months.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
  return (monthIndex + 1).toString().padStart(2, '0');
};

// Helper function to get the last day of a month
const getLastDayOfMonth = (monthName: string, year: number): string => {
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                 'july', 'august', 'september', 'october', 'november', 'december'];
  const monthIndex = months.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
  return new Date(year, monthIndex + 1, 0).getDate().toString();
};
