'use client';

import { emitEvent, EVENT_TYPES } from "../EventService";

export interface Visitor {
  id: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  idType: 'aadhar' | 'pan' | 'driving_license' | 'voter_id' | 'passport' | 'other';
  idNumber: string;
  photoUrl?: string;
  purpose: string;
  hostEmployeeId: string;
  hostName: string;
  branchId: string;
  status: 'checked_in' | 'checked_out';
  checkInTime: string;
  checkOutTime?: string;
  badgeNumber?: string;
  agreementSigned: boolean;
  agreementUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VisitorGatePass {
  id: string;
  visitorId: string;
  type: 'person' | 'material' | 'vehicle';
  itemDetails?: string;
  vehicleNumber?: string;
  validFrom: string;
  validTo: string;
  approvedBy: string;
  status: 'active' | 'expired' | 'cancelled';
  qrCodeUrl?: string;
  branchId: string;
  createdAt: string;
  updatedAt: string;
}

// Mock data for visitors
const mockVisitors: Visitor[] = [
  {
    id: "v-001",
    name: "Amit Sharma",
    phone: "9876543210",
    email: "amit.sharma@example.com",
    company: "ABC Corporation",
    idType: "aadhar",
    idNumber: "XXXX-XXXX-1234",
    photoUrl: "/visitor-photos/amit.jpg",
    purpose: "Meeting with HR",
    hostEmployeeId: "E-3451",
    hostName: "Rohit Kumar",
    branchId: "branch-001",
    status: "checked_in",
    checkInTime: "2025-05-08T09:30:00Z",
    agreementSigned: true,
    agreementUrl: "/visitor-agreements/amit-sharma-001.pdf",
    createdAt: "2025-05-08T09:25:00Z",
    updatedAt: "2025-05-08T09:30:00Z"
  },
  {
    id: "v-002",
    name: "Priya Patel",
    phone: "8765432109",
    email: "priya.patel@example.com",
    company: "XYZ Industries",
    idType: "pan",
    idNumber: "ABCTY1234A",
    purpose: "Vendor meeting",
    hostEmployeeId: "E-2105",
    hostName: "Suresh Singh",
    branchId: "branch-001",
    status: "checked_out",
    checkInTime: "2025-05-07T14:00:00Z",
    checkOutTime: "2025-05-07T16:30:00Z",
    badgeNumber: "V00217",
    agreementSigned: true,
    agreementUrl: "/visitor-agreements/priya-patel-002.pdf",
    createdAt: "2025-05-07T13:55:00Z",
    updatedAt: "2025-05-07T16:30:00Z"
  }
];

// Mock data for gate passes
const mockGatePasses: VisitorGatePass[] = [
  {
    id: "gp-001",
    visitorId: "v-001",
    type: "person",
    validFrom: "2025-05-08T09:30:00Z",
    validTo: "2025-05-08T17:30:00Z",
    approvedBy: "E-3451",
    status: "active",
    qrCodeUrl: "/gate-pass-qr/gp-001.svg",
    branchId: "branch-001",
    createdAt: "2025-05-08T09:30:00Z",
    updatedAt: "2025-05-08T09:30:00Z"
  },
  {
    id: "gp-002",
    visitorId: "v-002",
    type: "material",
    itemDetails: "Laptop, Sample materials x3",
    validFrom: "2025-05-07T14:00:00Z",
    validTo: "2025-05-07T17:00:00Z",
    approvedBy: "E-2105",
    status: "expired",
    qrCodeUrl: "/gate-pass-qr/gp-002.svg",
    branchId: "branch-001",
    createdAt: "2025-05-07T14:00:00Z",
    updatedAt: "2025-05-07T16:30:00Z"
  }
];

// Get all visitors for a branch
export const getVisitors = async (branchId: string, searchQuery?: string): Promise<Visitor[]> => {
  // Simulate API request
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Filter by branch and optionally by search query
  return mockVisitors.filter(visitor => {
    const matchesBranch = visitor.branchId === branchId;
    if (!searchQuery) return matchesBranch;
    
    const query = searchQuery.toLowerCase();
    return matchesBranch && (
      visitor.name.toLowerCase().includes(query) ||
      visitor.phone.includes(query) ||
      visitor.company?.toLowerCase().includes(query) ||
      visitor.email?.toLowerCase().includes(query) ||
      visitor.hostName.toLowerCase().includes(query)
    );
  });
};

// Get all active gate passes for a branch
export const getGatePasses = async (branchId: string, status?: 'active' | 'expired' | 'cancelled'): Promise<VisitorGatePass[]> => {
  // Simulate API request
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Filter by branch and optionally by status
  return mockGatePasses.filter(pass => {
    const matchesBranch = pass.branchId === branchId;
    if (!status) return matchesBranch;
    
    return matchesBranch && pass.status === status;
  });
};

// Check in a new visitor
export const checkInVisitor = async (visitorData: Omit<Visitor, 'id' | 'status' | 'checkInTime' | 'createdAt' | 'updatedAt'>): Promise<Visitor> => {
  // Simulate API request
  await new Promise(resolve => setTimeout(resolve, 800));
  
  const now = new Date();
  const timestamp = now.toISOString();
  const id = `v-${Math.floor(1000 + Math.random() * 9000)}`;
  
  const newVisitor: Visitor = {
    ...visitorData,
    id,
    status: 'checked_in',
    checkInTime: timestamp,
    badgeNumber: `V${now.getFullYear().toString().substring(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(mockVisitors.length + 1).padStart(3, '0')}`,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  
  mockVisitors.push(newVisitor);
  
  // Emit visitor check-in event
  emitEvent(EVENT_TYPES.VISITOR_CHECKED_IN, {
    visitorId: newVisitor.id,
    visitorName: newVisitor.name,
    hostId: newVisitor.hostEmployeeId,
    hostName: newVisitor.hostName,
    branchId: newVisitor.branchId,
    checkInTime: newVisitor.checkInTime
  });
  
  return newVisitor;
};

// Check out visitor
export const checkOutVisitor = async (visitorId: string): Promise<Visitor> => {
  // Simulate API request
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const visitorIndex = mockVisitors.findIndex(v => v.id === visitorId);
  
  if (visitorIndex === -1) {
    throw new Error(`Visitor with ID ${visitorId} not found`);
  }
  
  const visitor = mockVisitors[visitorIndex];
  
  if (visitor.status === 'checked_out') {
    throw new Error(`Visitor ${visitor.name} is already checked out`);
  }
  
  const timestamp = new Date().toISOString();
  
  const updatedVisitor = {
    ...visitor,
    status: 'checked_out' as const,
    checkOutTime: timestamp,
    updatedAt: timestamp
  };
  
  mockVisitors[visitorIndex] = updatedVisitor;
  
  // Emit visitor check-out event
  emitEvent(EVENT_TYPES.VISITOR_CHECKED_OUT, {
    visitorId: updatedVisitor.id,
    visitorName: updatedVisitor.name,
    hostId: updatedVisitor.hostEmployeeId,
    hostName: updatedVisitor.hostName,
    branchId: updatedVisitor.branchId,
    checkInTime: updatedVisitor.checkInTime,
    checkOutTime: updatedVisitor.checkOutTime,
  });
  
  return updatedVisitor;
};

// Create gate pass for visitor
export const createGatePass = async (gatePassData: Omit<VisitorGatePass, 'id' | 'qrCodeUrl' | 'status' | 'createdAt' | 'updatedAt'>): Promise<VisitorGatePass> => {
  // Simulate API request
  await new Promise(resolve => setTimeout(resolve, 800));
  
  const now = new Date();
  const timestamp = now.toISOString();
  const id = `gp-${Math.floor(1000 + Math.random() * 9000)}`;
  
  const newGatePass: VisitorGatePass = {
    ...gatePassData,
    id,
    status: 'active',
    qrCodeUrl: `/gate-pass-qr/${id}.svg`,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  
  mockGatePasses.push(newGatePass);
  
  return newGatePass;
};

// Generate visitor badge SVG
export const generateVisitorBadgeSvg = async (visitorId: string): Promise<string> => {
  // Simulate API request
  await new Promise(resolve => setTimeout(resolve, 800));
  
  const visitor = mockVisitors.find(v => v.id === visitorId);
  
  if (!visitor) {
    throw new Error(`Visitor with ID ${visitorId} not found`);
  }
  
  // In a real implementation, this would generate an actual SVG
  return `<svg width="300" height="400" xmlns="http://www.w3.org/2000/svg">
    <rect width="300" height="400" fill="#f8f8f8" rx="10" ry="10" />
    <text x="20" y="40" font-family="Arial" font-size="16">VISITOR</text>
    <text x="20" y="80" font-family="Arial" font-size="24" font-weight="bold">${visitor.name}</text>
    <text x="20" y="110" font-family="Arial" font-size="16">${visitor.company || ""}</text>
    <text x="20" y="140" font-family="Arial" font-size="14">Host: ${visitor.hostName}</text>
    <text x="20" y="300" font-family="Arial" font-size="18" font-weight="bold">${visitor.badgeNumber}</text>
    <text x="20" y="380" font-family="Arial" font-size="12">${new Date(visitor.checkInTime).toLocaleDateString()}</text>
  </svg>`;
};

// Generate gate pass QR code
export const generateGatePassQRCode = async (gatePassId: string): Promise<string> => {
  // Simulate API request
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const gatePass = mockGatePasses.find(gp => gp.id === gatePassId);
  
  if (!gatePass) {
    throw new Error(`Gate pass with ID ${gatePassId} not found`);
  }
  
  // In a real implementation, this would generate an actual QR code
  return `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiB2aWV3Qm94PSIwIDAgMjEgMjEiPjxyZWN0IHdpZHRoPSIyMSIgaGVpZ2h0PSIyMSIgZmlsbD0iI2ZmZmZmZiI+PC9yZWN0PjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIHg9IjQiIHk9IjQiIGZpbGw9IiMwMDAwMDAiPjwvcmVjdD48cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4PSI1IiB5PSI0IiBmaWxsPSIjMDAwMDAwIj48L3JlY3Q+PHJlY3Qgd2lkdGg9IjEiIGhlaWdodD0iMSIgeD0iNiIgeT0iNCIgZmlsbD0iIzAwMDAwMCI+PC9yZWN0PjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIHg9IjciIHk9IjQiIGZpbGw9IiMwMDAwMDAiPjwvcmVjdD48cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4PSI4IiB5PSI0IiBmaWxsPSIjMDAwMDAwIj48L3JlY3Q+PHJlY3Qgd2lkdGg9IjEiIGhlaWdodD0iMSIgeD0iOSIgeT0iNCIgZmlsbD0iIzAwMDAwMCI+PC9yZWN0PjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIHg9IjEwIiB5PSI0IiBmaWxsPSIjMDAwMDAwIj48L3JlY3Q+PHJlY3Qgd2lkdGg9IjEiIGhlaWdodD0iMSIgeD0iMTMiIHk9IjQiIGZpbGw9IiMwMDAwMDAiPjwvcmVjdD48cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4PSIxNSIgeT0iNCIgZmlsbD0iIzAwMDAwMCI+PC9yZWN0PjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIHg9IjE2IiB5PSI0IiBmaWxsPSIjMDAwMDAwIj48L3JlY3Q+PC9zdmc+Cg==`;
};
