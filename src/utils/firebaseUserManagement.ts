// Supabase User Management Utilities
import { supabase, supabaseClient } from '@/integrations/supabase/client';

export interface FirebaseUser {
  uid: string;
  email: string;
  name: string;
  roles: string[];
  branch: string;
  branchId: string;
  status: 'active' | 'inactive';
  createdAt: string;
  lastActive?: string;
}

// Create a new user via admin API (auto-confirms email)
export const createFirebaseUser = async (
  email: string,
  password: string,
  userData: Omit<FirebaseUser, 'uid' | 'createdAt'>
): Promise<{ success: boolean; uid?: string; error?: string }> => {
  try {
    // Retrieve the current session token to authenticate the API call.
    // The app stores sessions in localStorage (not cookies), so we must
    // explicitly pass the access token via the Authorization header.
    const { getSupabaseClient } = await import('@/integrations/supabase/client');
    const { data: sessionData } = await getSupabaseClient().auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      return { success: false, error: 'Not authenticated. Please log in again.' };
    }

    // Use admin API route to create user without email confirmation
    const response = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        email,
        password,
        name: userData.name,
        roles: userData.roles,
        branch: userData.branch,
        branchId: userData.branchId,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return { success: false, error: result.error || 'Failed to create user' };
    }

    return { success: true, uid: result.uid };
  } catch (error: any) {
    console.error('Error creating user:', error);
    return { success: false, error: error.message };
  }
};

// Get all users from Supabase
export const getAllUsers = async (): Promise<FirebaseUser[]> => {
  try {
    // Try the users profile table first
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      return data.map(user => ({
        uid: user.id,
        email: user.email,
        name: user.name || user.email?.split('@')[0] || '',
        roles: user.roles || [],
        branch: user.branch || '',
        branchId: user.branch_id || '',
        status: (user.status as 'active' | 'inactive') || 'active',
        createdAt: user.created_at,
        lastActive: user.last_active,
      }));
    }

    // Fallback: try user_roles table to at least show users with roles
    const { data: roleData, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('user_id, role');

    if (roleError || !roleData || roleData.length === 0) {
      console.warn('No users found in users or user_roles tables');
      return [];
    }

    // Group roles by user_id
    const userMap = new Map<string, string[]>();
    roleData.forEach((r: any) => {
      const existing = userMap.get(r.user_id) || [];
      existing.push(r.role);
      userMap.set(r.user_id, existing);
    });

    return Array.from(userMap.entries()).map(([uid, roles]) => ({
      uid,
      email: '',
      name: '',
      roles,
      branch: '',
      branchId: '',
      status: 'active' as const,
      createdAt: '',
    }));
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
};

// Get user by UID
export const getUserByUid = async (uid: string): Promise<FirebaseUser | null> => {
  try {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .eq('id', uid)
      .single();

    if (error || !data) {
      console.error('Error fetching user:', error);
      return null;
    }

    return {
      uid: data.id,
      email: data.email,
      name: data.name,
      roles: data.roles || [],
      branch: data.branch || '',
      branchId: data.branch_id || '',
      status: data.status as 'active' | 'inactive',
      createdAt: data.created_at,
      lastActive: data.last_active,
    };
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
};

// Update user data in Supabase
export const updateFirebaseUser = async (
  uid: string,
  updates: Partial<FirebaseUser>
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Map to Supabase column names
    const supabaseUpdates: any = {};
    if (updates.name !== undefined) supabaseUpdates.name = updates.name;
    if (updates.roles !== undefined) supabaseUpdates.roles = updates.roles;
    if (updates.branch !== undefined) supabaseUpdates.branch = updates.branch;
    if (updates.branchId !== undefined) supabaseUpdates.branch_id = updates.branchId;
    if (updates.status !== undefined) supabaseUpdates.status = updates.status;
    if (updates.lastActive !== undefined) supabaseUpdates.last_active = updates.lastActive;

    const { error } = await supabaseClient
      .from('users')
      .update(supabaseUpdates)
      .eq('id', uid);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error updating user:', error);
    return { success: false, error: error.message };
  }
};

// Delete user from Supabase — removes from users, user_roles, and auth
export const deleteFirebaseUser = async (uid: string): Promise<{ success: boolean; error?: string }> => {
  try {
    // 1. Delete from user_roles table
    await supabaseClient
      .from('user_roles')
      .delete()
      .eq('user_id', uid);

    // 2. Delete from users profile table
    const { error } = await supabaseClient
      .from('users')
      .delete()
      .eq('id', uid);

    if (error) {
      return { success: false, error: error.message };
    }

    // 3. Delete from auth.users via admin API
    // Note: This requires a server-side call. We'll call our delete-user API
    // if available, otherwise the auth account remains (user can't log in
    // because user_roles is empty, so login will be denied).
    try {
      const { getSupabaseClient } = await import('@/integrations/supabase/client');
      const { data: sessionData } = await getSupabaseClient().auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (accessToken) {
        await fetch('/api/admin/create-user', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ userId: uid }),
        });
      }
    } catch {
      // Auth deletion is best-effort — profile and roles are already gone
      console.warn('Could not delete auth account (best-effort). User profile and roles removed.');
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting user:', error);
    return { success: false, error: error.message };
  }
};

// Update user roles — writes to BOTH `users.roles[]` (profile cache) and
// `user_roles` table (authoritative source used by server-side auth guards).
export const updateUserRoles = async (
  uid: string,
  roles: string[],
  _email?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // 1. Update the profile cache (users.roles array column)
    const profileResult = await updateFirebaseUser(uid, { roles });
    if (!profileResult.success) {
      return profileResult;
    }

    // 2. Sync the authoritative user_roles table (read by getServerRoles, ProtectedRoute, login)
    // Delete existing role rows and insert new ones.
    const { error: deleteError } = await supabaseClient
      .from('user_roles')
      .delete()
      .eq('user_id', uid);

    if (deleteError) {
      console.error('Error clearing user_roles:', deleteError);
      return { success: false, error: `Failed to clear existing roles: ${deleteError.message}` };
    }

    if (roles.length > 0) {
      const { error: insertError } = await supabaseClient
        .from('user_roles')
        .insert(roles.map(role => ({ user_id: uid, role })));

      if (insertError) {
        console.error('Error inserting user_roles:', insertError);
        return { success: false, error: `Failed to assign roles: ${insertError.message}` };
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error updating user roles:', error);
    return { success: false, error: error.message };
  }
};

// Get users by role
export const getUsersByRole = async (role: string): Promise<FirebaseUser[]> => {
  try {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .contains('roles', [role])
      .eq('status', 'active');

    if (error) {
      console.error('Error fetching users by role:', error);
      return [];
    }

    return data.map(user => ({
      uid: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles || [],
      branch: user.branch || '',
      branchId: user.branch_id || '',
      status: user.status as 'active' | 'inactive',
      createdAt: user.created_at,
      lastActive: user.last_active,
    }));
  } catch (error) {
    console.error('Error fetching users by role:', error);
    return [];
  }
};

// Generate a random password
export const generatePassword = (): string => {
  const length = 12;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};
