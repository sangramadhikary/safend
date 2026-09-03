/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Shared Module Types — Cross-Module Contracts
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Types defined here are the CONTRACTS between modules. They represent data
 * shapes that multiple modules need to understand (e.g., an Employee referenced
 * by both HR and Operations, or a Client referenced by both Sales and Accounts).
 *
 * Rules:
 * - Only put types here if 2+ modules need them
 * - Module-internal types stay in their own module
 * - These types are stable — changing them requires coordination between teams
 * - Never put business logic here, only data shapes
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ── Employee (shared between HR, Operations, Payroll) ───────────────────────

export interface SharedEmployee {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  phone?: string;
  designation?: string;
  department?: string;
  branch_id?: string;
  status: 'active' | 'inactive' | 'terminated' | 'on leave' | string;
  joinDate?: string;
  photo_url?: string;
}

// ── Client (shared between Sales, Accounts, Operations) ─────────────────────

export interface SharedClient {
  id: string;
  client_name: string;
  company_name?: string;
  contact_person: string;
  email?: string;
  phone?: string;
  status: 'active' | 'inactive' | 'prospect' | string;
}

// ── Post (shared between Operations, Sales, Client Portal) ──────────────────

export interface SharedPost {
  id: string;
  post_name: string;
  post_code: string;
  client_name: string;
  location: any;
  total_guards: number;
  shift_type: string;
  status: 'active' | 'inactive' | string;
}

// ── Invoice/Receivable (shared between Accounts, Client Portal) ─────────────

export interface SharedInvoice {
  id: string;
  reference_number: string | null;
  client_name: string;
  category: string;
  description: string;
  amount: number;
  gst_amount: number | null;
  total_amount: number;
  due_date: string | null;
  status: 'pending' | 'overdue' | 'received' | 'cancelled' | string;
  created_at: string;
}

// ── Branch (shared across all ERP modules) ──────────────────────────────────

export interface SharedBranch {
  id: string;
  branch_code: string;
  branch_name: string;
  branch_type: 'main' | 'sub';
  status: 'active' | 'inactive';
}

// ── User role (shared across auth and module access) ────────────────────────

export type ERPRole = 'admin' | 'branch_admin' | 'hr' | 'accounts' | 'operations' | 'sales' | 'office-admin';
export type PortalRole = 'client' | 'supervisor';
export type AppRole = ERPRole | PortalRole;

// ── BFF response types (shared between API routes and client hooks) ─────────

export interface AdminOverviewResponse {
  leadsTotal: number;
  opportunities: number;
  activeClients: number;
  conversionRate: number;
  activePosts: number;
  activeStaff: number;
  penaltiesOpen: number;
  penaltiesThisMonth: number;
  receivablesOutstanding: number;
  receivablesOverdue: number;
  collectionRate: number;
  payablesOutstanding: number;
  payablesPending: number;
  messFundPending: number;
  headcount: number;
  leavePending: number;
  penaltiesFinancial: number;
  activeRatio: number;
}

export interface OperationsDashboardResponse {
  manpower: {
    total: number;
    designations: Record<string, number>;
  };
  posts: SharedPost[];
  postsCount: number;
  totalGuardsRequired: number;
  rota: {
    deployed: number;
    deployedPostIds: string[];
  };
  attendance: {
    present: number;
    absent: number;
    halfDay: number;
    total: number;
  };
  patrols: {
    total: number;
    completed: number;
  };
  onLeave: number;
  today: string;
}

export interface EmployeePortalResponse {
  profile: any;
  photoUrl: string | null;
  attendance: any[];
  leaves: any[];
  payslips: any[];
  penalties: any[];
}

export interface ClientDashboardResponse {
  profile: any;
  posts: SharedPost[];
  invoices: SharedInvoice[];
  openIncidents: number;
}

export interface SalesPipelineResponse {
  pipeline: {
    total: number;
    new: number;
    contacted: number;
    qualified: number;
    opportunity: number;
    client: number;
    lost: number;
  };
  leadsThisMonth: number;
  conversionRate: number;
  quotationStats: {
    total: number;
    pending: number;
    approved: number;
    totalValue: number;
    pipelineValue: number;
  };
  agreementStats: {
    total: number;
    active: number;
    totalValue: number;
  };
  workOrderStats: {
    total: number;
    active: number;
  };
  overdueFollowups: number;
}

export interface HROverviewResponse {
  headcount: {
    total: number;
    active: number;
    inactive: number;
    terminated: number;
    onLeave: number;
  };
  departments: Record<string, number>;
  leavePending: number;
  penaltiesPending: number;
  activeLoans: number;
  newJoinsThisMonth: number;
  compliance: {
    total: number;
    completed: number;
    pending: number;
  };
}
