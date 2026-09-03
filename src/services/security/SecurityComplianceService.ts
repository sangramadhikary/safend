'use client';

import { emitEvent, EVENT_TYPES } from '@/services/EventService';

export interface LicenseDocument {
  id: string;
  type: 'PSARA' | 'GUARD_LICENSE' | 'FIREARM_LICENSE' | 'OTHER';
  name: string;
  number: string;
  issuedBy: string;
  issuedTo: string;
  issuedDate: string;
  expiryDate: string;
  status: 'active' | 'expired' | 'pending_renewal' | 'cancelled';
  documentUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ComplianceFee {
  id: string;
  licenseId: string;
  type: 'RENEWAL' | 'PENALTY' | 'APPLICATION' | 'OTHER';
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  paymentReference?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

// Mock data for licenses and fees
const securityLicenses: LicenseDocument[] = [];
const complianceFees: ComplianceFee[] = [];

// Function to generate a unique license ID
const generateLicenseId = () => {
  return `LIC-${Date.now().toString().slice(-6)}`;
};

// Function to generate a unique fee ID
const generateFeeId = () => {
  return `FEE-${Date.now().toString().slice(-6)}`;
};

// Function to create a new license document
export const createLicenseDocument = (data: Omit<LicenseDocument, 'id' | 'createdAt' | 'status'>): LicenseDocument => {
  const now = new Date().toISOString();
  const expiryDate = new Date(data.expiryDate);
  
  // Determine status based on expiry date
  let status: LicenseDocument['status'] = 'active';
  if (expiryDate < new Date()) {
    status = 'expired';
  } else if (expiryDate < new Date(new Date().setDate(new Date().getDate() + 30))) {
    status = 'pending_renewal';
  }
  
  const license: LicenseDocument = {
    id: generateLicenseId(),
    status,
    createdAt: now,
    ...data
  };
  
  securityLicenses.push(license);
  
  emitEvent(EVENT_TYPES.SECURITY_LICENSE_UPDATED, {
    licenseId: license.id,
    type: license.type,
    status: license.status,
    expiryDate: license.expiryDate
  });
  
  return license;
};

// Function to get all licenses
export const getLicenseDocuments = async (filters?: {
  type?: LicenseDocument['type'];
  status?: LicenseDocument['status'];
  issuedTo?: string;
}): Promise<LicenseDocument[]> => {
  if (!filters) {
    return Promise.resolve([...securityLicenses]);
  }
  
  return Promise.resolve(securityLicenses.filter(license => {
    if (filters.type && license.type !== filters.type) {
      return false;
    }
    if (filters.status && license.status !== filters.status) {
      return false;
    }
    if (filters.issuedTo && license.issuedTo !== filters.issuedTo) {
      return false;
    }
    
    return true;
  }));
};

// Function to get a specific license by ID
export const getLicenseDocumentById = (licenseId: string): LicenseDocument | undefined => {
  return securityLicenses.find(license => license.id === licenseId);
};

// Function to update a license document
export const updateLicenseDocument = (licenseId: string, updates: Partial<LicenseDocument>): LicenseDocument | null => {
  const licenseIndex = securityLicenses.findIndex(license => license.id === licenseId);
  
  if (licenseIndex === -1) {
    return null;
  }
  
  securityLicenses[licenseIndex] = {
    ...securityLicenses[licenseIndex],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  // Update status based on new expiry date if provided
  if (updates.expiryDate) {
    const expiryDate = new Date(updates.expiryDate);
    if (expiryDate < new Date()) {
      securityLicenses[licenseIndex].status = 'expired';
    } else if (expiryDate < new Date(new Date().setDate(new Date().getDate() + 30))) {
      securityLicenses[licenseIndex].status = 'pending_renewal';
    } else {
      securityLicenses[licenseIndex].status = 'active';
    }
  }
  
  emitEvent(EVENT_TYPES.SECURITY_LICENSE_UPDATED, {
    licenseId,
    type: securityLicenses[licenseIndex].type,
    status: securityLicenses[licenseIndex].status,
    expiryDate: securityLicenses[licenseIndex].expiryDate
  });
  
  return securityLicenses[licenseIndex];
};

// Function to create a new compliance fee
export const createComplianceFee = (data: Omit<ComplianceFee, 'id' | 'createdAt'>): ComplianceFee => {
  const now = new Date().toISOString();
  
  const fee: ComplianceFee = {
    id: generateFeeId(),
    createdAt: now,
    ...data
  };
  
  complianceFees.push(fee);
  
  // Check if this is a PSARA related fee and emit appropriate event
  const relatedLicense = securityLicenses.find(license => license.id === data.licenseId);
  if (relatedLicense && relatedLicense.type === 'PSARA') {
    emitEvent(EVENT_TYPES.SECURITY_PSARA_UPDATED, {
      licenseId: relatedLicense.id,
      feeId: fee.id,
      amount: fee.amount,
      dueDate: fee.dueDate,
      status: fee.status
    });
  }
  
  return fee;
};

// Function to get all compliance fees
export const getComplianceFees = async (filters?: {
  licenseId?: string;
  type?: ComplianceFee['type'];
  status?: ComplianceFee['status'];
  startDate?: string;
  endDate?: string;
}): Promise<ComplianceFee[]> => {
  if (!filters) {
    return Promise.resolve([...complianceFees]);
  }
  
  return Promise.resolve(complianceFees.filter(fee => {
    if (filters.licenseId && fee.licenseId !== filters.licenseId) {
      return false;
    }
    if (filters.type && fee.type !== filters.type) {
      return false;
    }
    if (filters.status && fee.status !== filters.status) {
      return false;
    }
    if (filters.startDate && new Date(fee.dueDate) < new Date(filters.startDate)) {
      return false;
    }
    if (filters.endDate && new Date(fee.dueDate) > new Date(filters.endDate)) {
      return false;
    }
    
    return true;
  }));
};

// Function to update a compliance fee
export const updateComplianceFee = (feeId: string, updates: Partial<ComplianceFee>): ComplianceFee | null => {
  const feeIndex = complianceFees.findIndex(fee => fee.id === feeId);
  
  if (feeIndex === -1) {
    return null;
  }
  
  complianceFees[feeIndex] = {
    ...complianceFees[feeIndex],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  // If marking as paid, record paid date
  if (updates.status === 'paid' && !complianceFees[feeIndex].paidDate) {
    complianceFees[feeIndex].paidDate = new Date().toISOString();
  }
  
  // Check if this is a PSARA related fee and emit appropriate event
  const relatedLicense = securityLicenses.find(license => license.id === complianceFees[feeIndex].licenseId);
  if (relatedLicense && relatedLicense.type === 'PSARA') {
    emitEvent(EVENT_TYPES.SECURITY_PSARA_UPDATED, {
      licenseId: relatedLicense.id,
      feeId,
      status: complianceFees[feeIndex].status,
      paidDate: complianceFees[feeIndex].paidDate
    });
  }
  
  return complianceFees[feeIndex];
};

// Function to check for licenses nearing expiry
export const checkExpiringLicenses = (daysThreshold: number = 30): LicenseDocument[] => {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
  
  const expiringLicenses = securityLicenses.filter(license => {
    const expiryDate = new Date(license.expiryDate);
    return expiryDate > new Date() && expiryDate <= thresholdDate && license.status !== 'pending_renewal';
  });
  
  // Update the status of expiring licenses
  expiringLicenses.forEach(license => {
    const licenseIndex = securityLicenses.findIndex(l => l.id === license.id);
    if (licenseIndex !== -1) {
      securityLicenses[licenseIndex] = {
        ...securityLicenses[licenseIndex],
        status: 'pending_renewal',
        updatedAt: new Date().toISOString()
      };
      
      // Emit appropriate event based on license type
      if (license.type === 'PSARA') {
        emitEvent(EVENT_TYPES.SECURITY_PSARA_EXPIRING, {
          licenseId: license.id,
          expiryDate: license.expiryDate,
          daysRemaining: Math.ceil((new Date(license.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        });
      } else {
        emitEvent(EVENT_TYPES.SECURITY_LICENSE_EXPIRING, {
          licenseId: license.id,
          type: license.type,
          expiryDate: license.expiryDate,
          daysRemaining: Math.ceil((new Date(license.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        });
      }
    }
  });
  
  return expiringLicenses;
};
