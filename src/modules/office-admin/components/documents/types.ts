// ==========================================
// DOCUMENTS & POLICY TYPES
// ==========================================

export type DocType =
  | 'policy'
  | 'sop'
  | 'contract'
  | 'workorder'
  | 'agreement'
  | 'license'
  | 'certificate'
  | 'letter'
  | 'notice'
  | 'manual'
  | 'other';

export type DocCategory =
  | 'corporate'
  | 'hr'
  | 'operations'
  | 'finance'
  | 'it'
  | 'legal'
  | 'compliance'
  | 'safety'
  | 'training'
  | 'general';

export type DocStatus = 'draft' | 'active' | 'archived' | 'expired' | 'superseded';

export type AccessLevel = 'all' | 'management' | 'admin_only' | 'department_specific';

export interface CompanyDocument {
  id: string;
  doc_code: string;
  title: string;
  description?: string;
  doc_type: DocType;
  category: DocCategory;
  version: string;
  is_latest: boolean;
  parent_doc_id?: string;
  file_url?: string;
  file_key?: string;
  file_name?: string;
  file_size?: number;
  file_type?: string;
  effective_date?: string;
  expiry_date?: string;
  access_level: AccessLevel;
  department?: string;
  status: DocStatus;
  requires_acknowledgment: boolean;
  acknowledgment_deadline?: string;
  tags?: string[];
  uploaded_by: string;
  approved_by?: string;
  branch_id: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentAcknowledgment {
  id: string;
  document_id: string;
  user_id: string;
  user_name: string;
  acknowledged_at: string;
  notes?: string;
}

// Display labels
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  policy: 'Policy',
  sop: 'SOP',
  contract: 'Contract',
  workorder: 'Work Order',
  agreement: 'Agreement',
  license: 'License',
  certificate: 'Certificate',
  letter: 'Letter',
  notice: 'Notice',
  manual: 'Manual',
  other: 'Other',
};

export const DOC_CATEGORY_LABELS: Record<DocCategory, string> = {
  corporate: 'Corporate',
  hr: 'HR',
  operations: 'Operations',
  finance: 'Finance',
  it: 'IT',
  legal: 'Legal',
  compliance: 'Compliance',
  safety: 'Safety',
  training: 'Training',
  general: 'General',
};

export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
  expired: 'Expired',
  superseded: 'Superseded',
};

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  all: 'All Employees',
  management: 'Management Only',
  admin_only: 'Admin Only',
  department_specific: 'Department Specific',
};
