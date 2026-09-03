'use client';

import { apiRequest } from '../api';
import { Permission as PermissionType } from '@/types/branch';

// Define types for roles and permissions
export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Permission {
  id: string;
  name: string;
  description: string;
  module: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserRole {
  userId: string;
  roleId: string;
  assignedBy: string;
  assignedAt: string;
}

// Default permissions for when API is unavailable
const DEFAULT_PERMISSIONS: PermissionType[] = [
  {
    module: "control-centre",
    actions: ["view", "create", "update", "delete"]
  },
  {
    module: "sales",
    actions: ["view", "create", "update", "delete"]
  },
  {
    module: "operations",
    actions: ["view", "create", "update", "delete"]
  },
  {
    module: "accounts",
    actions: ["view", "create", "update", "delete"]
  },
  {
    module: "hr",
    actions: ["view", "create", "update", "delete"]
  },
  {
    module: "office-admin",
    actions: ["view", "create", "update", "delete"]
  }
];

// Default roles for when API is unavailable
const DEFAULT_ROLES: Role[] = [
  {
    id: 'role-admin',
    name: 'Admin',
    description: 'Full system access',
    permissions: ['all'],
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'role-manager',
    name: 'Manager',
    description: 'Management access',
    permissions: ['view', 'create', 'update'],
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'role-employee',
    name: 'Employee',
    description: 'Basic access',
    permissions: ['view'],
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

class RolePermissionService {
  /**
   * Get all roles - returns default roles if API fails
   */
  static async getAllRoles(): Promise<{ data: Role[] }> {
    try {
      const result = await apiRequest('GET', '/admin/roles');
      return result?.data ? result : { data: DEFAULT_ROLES };
    } catch (error) {
      console.warn('Using default roles due to API error');
      return { data: DEFAULT_ROLES };
    }
  }

  /**
   * Get a specific role by ID
   */
  static async getRole(roleId: string): Promise<{ data: Role | null }> {
    try {
      const result = await apiRequest('GET', `/admin/roles/${roleId}`);
      return result;
    } catch (error) {
      console.warn('Error fetching role:', error);
      const defaultRole = DEFAULT_ROLES.find(r => r.id === roleId);
      return { data: defaultRole || null };
    }
  }

  /**
   * Create a new role
   */
  static async createRole(data: Partial<Role>): Promise<{ data: Role }> {
    try {
      return await apiRequest('POST', '/admin/roles', {}, data);
    } catch (error) {
      console.error('Error creating role:', error);
      throw error;
    }
  }

  /**
   * Update an existing role
   */
  static async updateRole(roleId: string, data: Partial<Role>): Promise<{ data: Role }> {
    try {
      return await apiRequest('PUT', `/admin/roles/${roleId}`, {}, data);
    } catch (error) {
      console.error('Error updating role:', error);
      throw error;
    }
  }

  /**
   * Delete a role
   */
  static async deleteRole(roleId: string): Promise<{ success: boolean }> {
    try {
      return await apiRequest('DELETE', `/admin/roles/${roleId}`);
    } catch (error) {
      console.error('Error deleting role:', error);
      throw error;
    }
  }

  /**
   * Get all permissions
   */
  static async getAllPermissions(): Promise<{ data: Permission[] }> {
    try {
      return await apiRequest('GET', '/admin/permissions');
    } catch (error) {
      console.warn('Error fetching permissions:', error);
      return { data: [] };
    }
  }

  /**
   * Assign a role to a user
   */
  static async assignRoleToUser(userId: string, roleId: string): Promise<{ success: boolean }> {
    try {
      return await apiRequest('POST', '/admin/user-roles', {}, { userId, roleId });
    } catch (error) {
      console.error('Error assigning role to user:', error);
      throw error;
    }
  }

  /**
   * Remove a role from a user
   */
  static async removeRoleFromUser(userId: string, roleId: string): Promise<{ success: boolean }> {
    try {
      return await apiRequest('DELETE', `/admin/user-roles/${userId}/${roleId}`);
    } catch (error) {
      console.error('Error removing role from user:', error);
      throw error;
    }
  }

  /**
   * Get roles for a specific user - returns default roles if API fails
   */
  static async getUserRoles(userId: string): Promise<{ data: UserRole[] }> {
    try {
      const result = await apiRequest('GET', `/admin/users/${userId}/roles`);
      return result?.data ? result : { data: [{ userId, roleId: 'role-manager', assignedBy: 'system', assignedAt: new Date().toISOString() }] };
    } catch (error) {
      console.warn('Using default user roles due to API error');
      return { 
        data: [
          { userId, roleId: 'role-manager', assignedBy: 'system', assignedAt: new Date().toISOString() }
        ] 
      };
    }
  }

  /**
   * Get permissions for a specific user — reads the user's role from the
   * `user_roles` table, then looks up that role's permissions from the `roles`
   * table. Falls back to empty permissions (no access) rather than full access
   * when data is unavailable.
   */
  static async getUserPermissions(userId: string): Promise<PermissionType[]> {
    try {
      const { supabaseClient } = await import('@/integrations/supabase/client');

      // 1. Get the user's assigned roles from user_roles (authoritative table)
      const { data: userRoleRows, error: rolesErr } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (rolesErr || !userRoleRows || userRoleRows.length === 0) {
        // No roles found — return empty permissions (no access)
        return [];
      }

      const assignedRoleNames = userRoleRows.map((r: any) => r.role);

      // Admin / branch_admin get full access
      if (assignedRoleNames.includes('admin') || assignedRoleNames.includes('branch_admin')) {
        return DEFAULT_PERMISSIONS;
      }

      // 2. Look up role definitions from the `roles` table
      const { data: roleDefinitions, error: defErr } = await supabaseClient
        .from('roles')
        .select('name, permissions');

      if (defErr || !roleDefinitions || roleDefinitions.length === 0) {
        // If we can't read role definitions, return module-specific defaults
        // based on the user's role name rather than blanket full access.
        return assignedRoleNames.flatMap((roleName: string) => {
          const moduleMap: Record<string, string> = {
            sales: 'sales',
            operations: 'operations',
            accounts: 'accounts',
            hr: 'hr',
            'office-admin': 'office-admin',
          };
          const module = moduleMap[roleName];
          if (module) {
            return [{ module, actions: ['view', 'create', 'update', 'delete'] as any }];
          }
          return [];
        });
      }

      // 3. Merge permissions from all matching role definitions
      const merged: Record<string, Set<string>> = {};
      for (const def of roleDefinitions) {
        if (assignedRoleNames.includes(def.name?.toLowerCase())) {
          const perms = def.permissions as Record<string, string[]> | null;
          if (perms) {
            for (const [module, actions] of Object.entries(perms)) {
              if (!merged[module]) merged[module] = new Set();
              for (const action of actions) merged[module].add(action);
            }
          }
        }
      }

      return Object.entries(merged).map(([module, actions]) => ({
        module: module.toLowerCase().replace(/\s+/g, '-') as any,
        actions: Array.from(actions) as any,
      }));
    } catch (error) {
      console.warn('Error fetching user permissions:', error);
      // On error, return empty — deny by default, not grant by default
      return [];
    }
  }

  /**
   * Get users by role
   */
  static async getUsersByRole(roleId: string): Promise<{ data: any[] }> {
    try {
      return await apiRequest('GET', `/admin/roles/${roleId}/users`);
    } catch (error) {
      console.warn('Error fetching users by role:', error);
      return { data: [] };
    }
  }
}

export default RolePermissionService;
