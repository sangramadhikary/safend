'use client';

import { Document, DocumentCategory, DocumentSignature } from "@/types/documents";
import { emitEvent, EVENT_TYPES } from "@/services/EventService";

// Mock data for documents
const mockDocuments: Document[] = [
  {
    id: "doc-001",
    branchId: "branch-001",
    title: "Employee Handbook",
    description: "Company policies and procedures for employees",
    category: "policy",
    tags: ["policy", "employees", "handbook"],
    fileUrl: "/documents/employee-handbook.pdf",
    fileName: "employee-handbook.pdf",
    fileType: "application/pdf",
    fileSize: 2500000,
    uploadedBy: "John Doe",
    uploadedAt: "2025-04-15T10:30:00Z",
    expiryDate: "2026-04-15T10:30:00Z",
    version: "1.2",
    status: "active",
    views: 45,
    lastViewedAt: "2025-05-07T14:22:00Z",
    lastViewedBy: "Jane Smith",
    signatureRequired: true,
    signatures: [
      {
        id: "sig-001",
        documentId: "doc-001",
        employeeId: "emp-123",
        employeeName: "Jane Smith",
        signedAt: "2025-04-16T09:15:00Z",
        status: "signed"
      }
    ]
  },
  {
    id: "doc-002",
    branchId: "branch-001",
    title: "Safety Procedures",
    description: "Workplace safety guidelines and emergency protocols",
    category: "procedure",
    tags: ["safety", "emergency", "procedures"],
    fileUrl: "/documents/safety-procedures.pdf",
    fileName: "safety-procedures.pdf",
    fileType: "application/pdf",
    fileSize: 1800000,
    uploadedBy: "John Doe",
    uploadedAt: "2025-03-22T11:45:00Z",
    version: "2.0",
    status: "active",
    views: 68,
    lastViewedAt: "2025-05-06T16:08:00Z",
    lastViewedBy: "Robert Johnson",
    signatureRequired: true,
    signatures: []
  },
  {
    id: "doc-003",
    branchId: "branch-001",
    title: "Vendor Agreement Template",
    description: "Standard contract template for vendors",
    category: "contract",
    tags: ["vendor", "contract", "legal"],
    fileUrl: "/documents/vendor-agreement.docx",
    fileName: "vendor-agreement.docx",
    fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fileSize: 550000,
    uploadedBy: "Sarah Williams",
    uploadedAt: "2025-02-18T14:20:00Z",
    version: "1.0",
    status: "active",
    views: 12,
    signatureRequired: false
  }
];

// Mock data for document categories
const mockCategories: DocumentCategory[] = [
  {
    id: "cat-001",
    branchId: "branch-001",
    name: "Policies",
    description: "Company-wide policies and guidelines",
    documentCount: 15
  },
  {
    id: "cat-002",
    branchId: "branch-001",
    name: "Procedures",
    description: "Standard operating procedures",
    documentCount: 23
  },
  {
    id: "cat-003",
    branchId: "branch-001",
    name: "Forms",
    description: "Standard forms for various purposes",
    documentCount: 8
  },
  {
    id: "cat-004",
    branchId: "branch-001",
    name: "Contracts",
    description: "Legal agreements and contracts",
    documentCount: 12
  }
];

// Get all documents for a branch
export const getDocuments = (branchId: string): Document[] => {
  return mockDocuments.filter(doc => doc.branchId === branchId);
};

// Get document by ID
export const getDocumentById = (documentId: string): Document | undefined => {
  return mockDocuments.find(doc => doc.id === documentId);
};

// Create new document
export const createDocument = (document: Omit<Document, "id" | "uploadedAt" | "views">): Document => {
  const newDocument: Document = {
    ...document,
    id: `doc-${Date.now().toString(36)}`,
    uploadedAt: new Date().toISOString(),
    views: 0
  };
  
  mockDocuments.push(newDocument);
  
  emitEvent(EVENT_TYPES.DOCUMENT_CREATED, {
    documentId: newDocument.id,
    title: newDocument.title,
    category: newDocument.category
  });
  
  return newDocument;
};

// Update document
export const updateDocument = (document: Document): Document => {
  const index = mockDocuments.findIndex(doc => doc.id === document.id);
  
  if (index !== -1) {
    mockDocuments[index] = document;
    
    emitEvent(EVENT_TYPES.DOCUMENT_UPDATED, {
      documentId: document.id,
      title: document.title,
      category: document.category
    });
    
    return document;
  }
  
  throw new Error(`Document with ID ${document.id} not found`);
};

// Archive document
export const archiveDocument = (documentId: string): void => {
  const document = getDocumentById(documentId);
  
  if (document) {
    document.status = "archived";
    
    emitEvent(EVENT_TYPES.DOCUMENT_ARCHIVED, {
      documentId: document.id,
      title: document.title
    });
  } else {
    throw new Error(`Document with ID ${documentId} not found`);
  }
};

// Record document view
export const recordDocumentView = (documentId: string, viewedBy: string): void => {
  const document = getDocumentById(documentId);
  
  if (document) {
    document.views += 1;
    document.lastViewedAt = new Date().toISOString();
    document.lastViewedBy = viewedBy;
  } else {
    throw new Error(`Document with ID ${documentId} not found`);
  }
};

// Add document signature
export const addDocumentSignature = (
  documentId: string,
  signature: Omit<DocumentSignature, "id" | "documentId" | "signedAt">
): DocumentSignature => {
  const document = getDocumentById(documentId);
  
  if (!document) {
    throw new Error(`Document with ID ${documentId} not found`);
  }
  
  const newSignature: DocumentSignature = {
    ...signature,
    id: `sig-${Date.now().toString(36)}`,
    documentId,
    signedAt: new Date().toISOString()
  };
  
  if (!document.signatures) {
    document.signatures = [];
  }
  
  document.signatures.push(newSignature);
  
  emitEvent(EVENT_TYPES.DOCUMENT_SIGNED, {
    documentId: document.id,
    title: document.title,
    employeeId: signature.employeeId,
    employeeName: signature.employeeName
  });
  
  return newSignature;
};

// Get all document categories for a branch
export const getDocumentCategories = (branchId: string): DocumentCategory[] => {
  return mockCategories.filter(cat => cat.branchId === branchId);
};

// Create new document category
export const createDocumentCategory = (
  category: Omit<DocumentCategory, "id" | "documentCount">
): DocumentCategory => {
  const newCategory: DocumentCategory = {
    ...category,
    id: `cat-${Date.now().toString(36)}`,
    documentCount: 0
  };
  
  mockCategories.push(newCategory);
  return newCategory;
};

// Update document category
export const updateDocumentCategory = (category: DocumentCategory): DocumentCategory => {
  const index = mockCategories.findIndex(cat => cat.id === category.id);
  
  if (index !== -1) {
    mockCategories[index] = category;
    return category;
  }
  
  throw new Error(`Category with ID ${category.id} not found`);
};

// Delete document category
export const deleteDocumentCategory = (categoryId: string): void => {
  const index = mockCategories.findIndex(cat => cat.id === categoryId);
  
  if (index !== -1) {
    mockCategories.splice(index, 1);
  } else {
    throw new Error(`Category with ID ${categoryId} not found`);
  }
};
