export interface Branch {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  phone: string;
  email: string;
  managerName: string;
  managerId: string | null;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

export interface BranchUser {
  id: string;
  userId: string;
  branchId: string;
  roles: string[];
  permissions: Permission[];
  isManager: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Permission {
  module: string;
  actions: string[];
}

export interface BranchManagerInfo {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: "active" | "inactive";
}

// Role management types
export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  status: "active" | "inactive";
}

export interface RoleAssignment {
  id: string;
  userId: string;
  userName: string;
  branchId: string;
  branchName: string;
  roles: string[];
  assignedBy: string;
  assignedDate: string;
}
