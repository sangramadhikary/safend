// Supabase User Management Utilities
import { supabase } from '@/lib/supabase';

export interface SupabaseUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  branch: string | null;
  branch_id: string | null;
  status: 'active' | 'inactive';
  avatar_url: string | null;
  last_active: string | null;
  created_at: string;
  updated_at: string;
}

// Create a new user in Supabase Auth and users table
export const createSupabaseUser = async (
  email: string,
  password: string,
  userData: {
    name: string;
    roles: string[];
    branch?: string;
    branchId?: string;
    status?: 'active' | 'inactive';
  }
): Promise<{ success: boolean; id?: string; error?: string }> => {
  try {
    // Use regular signup (admin API requires service role key which isn't available client-side)
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: userData.name,
          roles: userData.roles,
        },
      },
    });

    if (signUpError) {
      return { success: false, error: signUpError.message };
    }

    if (signUpData?.user) {
      // Update user profile with additional data
      const { error: updateError } = await supabase
        .from('users')
        .upsert({
          id: signUpData.user.id,
          email: email,
          name: userData.name,
          roles: userData.roles,
          branch: userData.branch || null,
          branch_id: userData.branchId || null,
          status: userData.status || 'active',
        });

      if (updateError) {
        console.error('Error updating user profile:', updateError);
      }

      return { success: true, id: signUpData.user.id };
    }

    return { success: false, error: 'Failed to create user' };
  } catch (error: any) {
    console.error('Error creating user:', error);
    return { success: false, error: error.message };
  }
};

// Get all users from Supabase
export const getAllUsers = async (): Promise<SupabaseUser[]> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching users:', error);
      return [];
    }

    return data as SupabaseUser[];
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
};

// Get user by ID
export const getUserById = async (id: string): Promise<SupabaseUser | null> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching user:', error);
      return null;
    }

    return data as SupabaseUser;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
};

// Get user by email
export const getUserByEmail = async (email: string): Promise<SupabaseUser | null> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      console.error('Error fetching user:', error);
      return null;
    }

    return data as SupabaseUser;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
};

// Update user data in Supabase
export const updateSupabaseUser = async (
  id: string,
  updates: Partial<Omit<SupabaseUser, 'id' | 'email' | 'created_at' | 'updated_at'>>
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error updating user:', error);
    return { success: false, error: error.message };
  }
};

// Delete user from Supabase (soft delete - set status to inactive)
export const deleteSupabaseUser = async (id: string): Promise<{ success: boolean; error?: string }> => {
  try {
    // Soft delete - just set status to inactive
    const { error } = await supabase
      .from('users')
      .update({ status: 'inactive' })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting user:', error);
    return { success: false, error: error.message };
  }
};

// Update user roles — syncs BOTH the users.roles[] cache column AND the
// authoritative user_roles table used by server-side access guards.
export const updateUserRoles = async (
  id: string,
  roles: string[]
): Promise<{ success: boolean; error?: string }> => {
  // 1. Update the profile cache (stores all roles including non-enum ones)
  const profileResult = await updateSupabaseUser(id, { roles });
  if (!profileResult.success) return profileResult;

  // 2. Sync the authoritative user_roles table
  // The user_roles table has a check constraint — only these values are valid.
  const ENUM_ROLES = new Set(['admin', 'branch_admin', 'sales', 'operations', 'accounts', 'hr', 'office-admin', 'reports', 'client']);

  try {
    const { error: deleteError } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', id);
    if (deleteError) {
      return { success: false, error: `Failed to clear existing roles: ${deleteError.message}` };
    }

    const enumRoles = roles.filter(r => ENUM_ROLES.has(r));
    if (enumRoles.length > 0) {
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert(enumRoles.map(role => ({ user_id: id, role })));
      if (insertError) {
        return { success: false, error: `Failed to assign roles: ${insertError.message}` };
      }
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

// Get users by role
export const getUsersByRole = async (role: string): Promise<SupabaseUser[]> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .contains('roles', [role])
      .eq('status', 'active')
      .order('name');

    if (error) {
      console.error('Error fetching users by role:', error);
      return [];
    }

    return data as SupabaseUser[];
  } catch (error) {
    console.error('Error fetching users by role:', error);
    return [];
  }
};

// Get current user's roles
export const getCurrentUserRoles = async (): Promise<string[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return [];
    }

    // Check for permanent admin
    if (user.email === 'safendadmin@mail.com') {
      return ['admin'];
    }

    const { data, error } = await supabase
      .from('users')
      .select('roles')
      .eq('id', user.id)
      .single();

    if (error || !data) {
      return [];
    }

    return data.roles || [];
  } catch (error) {
    console.error('Error fetching user roles:', error);
    return [];
  }
};

// Update last active timestamp
export const updateLastActive = async (): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      // Uses server-side now() via RPC — single source of truth for timestamps
      await supabase.rpc('update_last_active');
    }
  } catch (error) {
    console.error('Error updating last active:', error);
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

// Subscribe to user changes (real-time)
export const subscribeToUsers = (callback: (users: SupabaseUser[]) => void): (() => void) => {
  // Initial fetch
  getAllUsers().then(callback);

  // Set up real-time subscription
  const channel = supabase
    .channel('users-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'users' },
      () => {
        // Refetch all users on any change
        getAllUsers().then(callback);
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel);
  };
};
