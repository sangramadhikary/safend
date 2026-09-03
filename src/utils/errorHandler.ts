
import { toast } from "@/hooks/use-toast";

// Enhanced error type that matches our API responses
interface ApiError {
  message?: string;
  error?: string;
  details?: any;
  status?: number;
  code?: string;
}

// Function to handle API errors
export const handleApiError = (error: any, fallbackMessage = "An error occurred") => {
  console.error("API Error:", error);
  
  // Extract error message
  let errorMessage = fallbackMessage;
  let errorDetails = "";
  
  if (typeof error === 'string') {
    errorMessage = error;
  } else if (error && error.message) {
    errorMessage = error.message;
    
    if (error.details) {
      if (typeof error.details === 'string') {
        errorDetails = error.details;
      } else if (typeof error.details === 'object') {
        errorDetails = Object.keys(error.details)
          .map(key => `${key}: ${error.details[key]}`)
          .join(', ');
      }
    }
  } else if (error && error.error) {
    errorMessage = error.error;
  } else if (error && error.response && error.response.data) {
    const responseData = error.response.data;
    if (typeof responseData === 'string') {
      errorMessage = responseData;
    } else if (responseData.message) {
      errorMessage = responseData.message;
    } else if (responseData.error) {
      errorMessage = responseData.error;
    }
  }
  
  // For network errors, provide more helpful message
  if (error && error.code === "ERR_NETWORK") {
    errorMessage = "Network error. Please check your internet connection.";
  }

  // Handle common Indian tax compliance errors
  if (errorMessage.includes("GSTIN") || errorMessage.includes("GST")) {
    errorMessage = `GST Error: ${errorMessage}`;
  }
  
  if (errorMessage.includes("TDS") || errorMessage.includes("PAN") || errorMessage.includes("Form 16")) {
    errorMessage = `TDS Error: ${errorMessage}`;
  }
  
  // Show toast notification
  toast({
    title: "Error",
    description: errorDetails ? `${errorMessage}\n${errorDetails}` : errorMessage,
    variant: "destructive",
    duration: 5000,
  });
  
  return errorMessage;
};

// Function to validate required fields in a form
export const validateRequiredFields = (data: Record<string, any>, requiredFields: string[]) => {
  const missingFields = requiredFields.filter(field => {
    const value = data[field];
    return value === undefined || value === null || value === '';
  });
  
  if (missingFields.length > 0) {
    const fieldsText = missingFields.join(', ');
    toast({
      title: "Validation Error",
      description: `Please fill in the required fields: ${fieldsText}`,
      variant: "destructive",
    });
    return false;
  }
  
  return true;
};

// Function to format API response for displaying success messages
export const handleApiSuccess = (response: any, successMessage: string) => {
  toast({
    title: "Success",
    description: successMessage,
    duration: 3000,
  });
  
  return response;
};

// Function to format currency values in Indian Rupees
export const formatIndianCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
};

// Function to format date in Indian format (DD/MM/YYYY)
export const formatIndianDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).replace(/-/g, '/');
};

// Format percentage
export const formatPercentage = (value: number): string => {
  return `${value.toFixed(2)}%`;
};

// Add mock data checking for development
export const handleMockDataRequests = <T>(
  entityType: string,
  mockData: T[],
  filter?: string,
  searchParam?: string
): T[] => {
  if (!mockData || !Array.isArray(mockData)) {
    console.warn(`No mock ${entityType} data available`);
    return [];
  }
  
  // Return filtered data if filter is provided
  if (filter && filter !== 'All') {
    return mockData.filter((item: any) => {
      // Handle common status filters
      if (item.status && item.status.toLowerCase() === filter.toLowerCase()) {
        return true;
      }
      
      // Handle specialized filters
      if (entityType === 'receivables' && filter === 'Overdue') {
        const dueDate = new Date(item.dueDate);
        return dueDate < new Date() && item.status !== 'paid';
      }
      
      if (entityType === 'compliance' && filter === 'Due') {
        const dueDate = new Date(item.dueDate);
        return dueDate >= new Date() && (item.status === 'pending' || item.status === 'prepared');
      }
      
      return false;
    });
  }
  
  return mockData;
};

// Helper to create mock data for development
export const createMockData = <T>(template: T, count: number): T[] => {
  return Array(count).fill(null).map((_, index) => {
    const copy = { ...template } as any;
    
    // Add unique ID if applicable
    if ('id' in copy) {
      copy.id = `mock-${index + 1}`;
    }
    
    return copy as T;
  });
};

// GST Calculation utilities
export const calculateGST = (amount: number, rate: number = 18): { baseAmount: number; gstAmount: number; totalAmount: number } => {
  const baseAmount = amount / (1 + rate / 100);
  const gstAmount = amount - baseAmount;
  
  return {
    baseAmount,
    gstAmount,
    totalAmount: amount
  };
};

// Function to calculate GST with split CGST/SGST or IGST
export const calculateGSTBreakup = (
  amount: number, 
  isIGST: boolean = false
): { baseAmount: number; cgst: number; sgst: number; igst: number; totalGst: number; totalAmount: number } => {
  const baseAmount = amount / 1.18; // For 18% GST
  const totalGst = amount - baseAmount;
  
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  
  if (isIGST) {
    igst = totalGst;
  } else {
    cgst = totalGst / 2;
    sgst = totalGst / 2;
  }
  
  return {
    baseAmount,
    cgst,
    sgst,
    igst,
    totalGst,
    totalAmount: amount
  };
};

// TDS Calculation 
export const calculateTDS = (amount: number, rate: number = 1): { tdsAmount: number; netPayable: number } => {
  const tdsAmount = amount * (rate / 100);
  const netPayable = amount - tdsAmount;
  
  return {
    tdsAmount,
    netPayable
  };
};

// Format HSN code display (for GST)
export const formatHSN = (hsn: string): string => {
  return `HSN: ${hsn}`;
};

// Calculate aging buckets for receivables/payables
export const calculateAgingBuckets = (items: any[]): Record<string, number> => {
  const buckets: Record<string, number> = {
    "Current": 0,
    "1-30 days": 0,
    "31-60 days": 0,
    "61-90 days": 0,
    "91+ days": 0
  };
  
  const today = new Date();
  
  items.forEach(item => {
    if (!item.dueDate || item.status === 'paid') return;
    
    const dueDate = new Date(item.dueDate);
    const diffTime = today.getTime() - dueDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) {
      buckets["Current"] += item.totalAmount;
    } else if (diffDays <= 30) {
      buckets["1-30 days"] += item.totalAmount;
    } else if (diffDays <= 60) {
      buckets["31-60 days"] += item.totalAmount;
    } else if (diffDays <= 90) {
      buckets["61-90 days"] += item.totalAmount;
    } else {
      buckets["91+ days"] += item.totalAmount;
    }
  });
  
  return buckets;
};
