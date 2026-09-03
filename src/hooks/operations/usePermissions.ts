'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { PERMISSIONS } from '@/config';
import { Permission } from '@/types/branch';
import RolePermissionService from '@/services/admin/RolePermissionService'; 

interface PermissionHook {
  hasPermission: (permission: keyof typeof PERMISSIONS) => boolean;
  hasModuleAction: (module: Permission['module'], action: string) => boolean;
  userRoles: string[];
  userPermissions: Permission[];
  isLoading: boolean;
  refreshPermissions: () => Promise<void>;
}

// Default permissions for when API is unavailable — deny by default rather
// than granting full access, to avoid privilege escalation in error states.
const DEFAULT_PERMISSIONS: Permission[] = [];

export function usePermissions(): PermissionHook {
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [userPermissions, setUserPermissions] = useState<Permission[]>(DEFAULT_PERMISSIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const fetchAttempted = useRef(false);

  const fetchUserPermissions = useCallback(async (uid?: string) => {
    const id = uid || userId;
    if (!id) return;
    
    try {
      const permissions = await RolePermissionService.getUserPermissions(id);
      setUserPermissions(permissions.length > 0 ? permissions : DEFAULT_PERMISSIONS);
    } catch (error) {
      // Silently use default permissions - no need to log error as RolePermissionService already handles it
      setUserPermissions(DEFAULT_PERMISSIONS);
    }
  }, [userId]);

  useEffect(() => {
    // Prevent multiple fetch attempts
    if (fetchAttempted.current) return;
    fetchAttempted.current = true;

    const fetchUserRoles = async () => {
      try {
        setIsLoading(true);
        
        // Try to get actual roles from Supabase auth user + user_roles table
        let roles: string[] = [];
        let currentUserId = '';

        try {
          const { supabaseClient } = await import('@/integrations/supabase/client');
          const { data: { user } } = await supabaseClient.auth.getUser();
          if (user) {
            currentUserId = user.id;

            // Read from user_roles table first (authoritative source)
            const { data: roleData, error: roleError } = await supabaseClient
              .from('user_roles')
              .select('role')
              .eq('user_id', user.id);

            if (!roleError && roleData && roleData.length > 0) {
              roles = roleData.map((r: any) => r.role);
            } else {
              // Fallback: try 'users' table profile cache
              const { data: userData, error: usersError } = await supabaseClient
                .from('users')
                .select('roles')
                .eq('id', user.id)
                .single();

              if (!usersError && userData?.roles && userData.roles.length > 0) {
                roles = userData.roles;
              }
            }
          }
        } catch {
          // Fallback to localStorage — use empty array if nothing stored
          const storedRoles = typeof window !== 'undefined' ? localStorage.getItem('userRoles') : null;
          roles = storedRoles ? JSON.parse(storedRoles) : [];
          currentUserId = typeof window !== 'undefined' ? localStorage.getItem('userId') || '' : '';
        }

        setUserRoles(roles);
        setUserId(currentUserId);
        
        // Store in localStorage for quick access
        if (typeof window !== 'undefined') {
          localStorage.setItem('userRoles', JSON.stringify(roles));
          localStorage.setItem('userId', currentUserId);
        }

        // Fetch permissions with the userId directly (avoid waiting for state update)
        if (currentUserId) {
          await fetchUserPermissions(currentUserId);
        }
      } catch (error) {
        // Use empty defaults on any error — deny by default
        setUserRoles([]);
        setUserPermissions(DEFAULT_PERMISSIONS);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserRoles();
  }, [fetchUserPermissions]);

  // Re-fetch permissions only when userId changes AFTER initial load completes.
  // The initial fetch already handles permissions, so skip if still loading.
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (isLoading) return;
    if (!initialLoadDone.current) {
      // First time isLoading becomes false — the initial effect already fetched
      initialLoadDone.current = true;
      return;
    }
    if (userId) {
      fetchUserPermissions();
    }
  }, [userId, fetchUserPermissions, isLoading]);

  const hasPermission = useCallback((permission: keyof typeof PERMISSIONS): boolean => {
    // While loading, only allow read-only access to prevent unauthorized actions
    if (isLoading) return false;
    if (userRoles.includes('admin') || userRoles.includes('branch_admin')) return true;
    
    const requiredRoles = PERMISSIONS[permission] || [];
    return userRoles.some(role => requiredRoles.includes(role));
  }, [isLoading, userRoles]);

  const hasModuleAction = useCallback((module: Permission['module'], action: string): boolean => {
    // While loading, only allow "view" to prevent unauthorized mutations
    if (isLoading) return action === 'view';
    if (userRoles.includes('admin') || userRoles.includes('branch_admin')) return true;
    
    return userPermissions.some(
      permission => 
        permission.module === module && 
        permission.actions.includes(action as any)
    );
  }, [isLoading, userRoles, userPermissions]);

  const refreshPermissions = useCallback(async () => {
    setIsLoading(true);
    await fetchUserPermissions();
    setIsLoading(false);
  }, [fetchUserPermissions]);

  return {
    hasPermission,
    hasModuleAction,
    userRoles,
    userPermissions,
    isLoading,
    refreshPermissions
  };
}
