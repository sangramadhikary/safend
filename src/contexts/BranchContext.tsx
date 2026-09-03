'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabaseClient, getSupabaseClient } from '@/integrations/supabase/client';
import { setBranchScope } from '@/utils/branchScope';

// Safe auth hook that doesn't throw if AuthProvider is missing
function useAuthSafe() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data: { session } }: any) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((_event: any, session: any) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading };
}

// Branch type matching the Supabase table
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
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

interface BranchContextType {
  currentBranch: Branch | null;
  allBranches: Branch[];
  setCurrentBranchById: (branchId: string) => void;
  isMainBranch: boolean;
  isMainBranchUser: boolean;
  loading: boolean;
  refreshBranches: () => Promise<void>;
  createBranch: (data: Partial<Branch>) => Promise<{ success: boolean; error?: string; branch?: Branch }>;
  updateBranch: (id: string, data: Partial<Branch>) => Promise<{ success: boolean; error?: string }>;
  deleteBranch: (id: string) => Promise<{ success: boolean; error?: string }>;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export const useBranch = (): BranchContextType => {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
};

// Map Supabase row to Branch interface
function mapRowToBranch(row: any): Branch {
  return {
    id: row.id,
    name: row.name || row.branch_name || '',
    code: row.code || row.branch_id || '',
    // DB stores is_main (boolean); legacy `type` field used as fallback.
    type: row.is_main === true ? 'main' : (row.type || 'sub'),
    address: row.address || '',
    city: row.city || '',
    state: row.state || '',
    country: row.country || 'India',
    postalCode: row.pincode || row.postal_code || '',
    phone: row.phone || row.contact_number || '',
    email: row.email || '',
    managerName: row.manager_name || row.contact_person || '',
    managerId: row.manager_id || null,
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Map Branch to Supabase row format
function mapBranchToRow(data: Partial<Branch>): Record<string, any> {
  const row: Record<string, any> = {};
  if (data.name !== undefined) row.name = data.name;
  if (data.code !== undefined) row.code = data.code;
  if (data.type !== undefined) row.is_main = data.type === 'main';
  if (data.address !== undefined) row.address = data.address;
  if (data.city !== undefined) row.city = data.city;
  if (data.state !== undefined) row.state = data.state;
  if (data.country !== undefined) row.country = data.country;
  if (data.postalCode !== undefined) row.pincode = data.postalCode;
  if (data.phone !== undefined) row.phone = data.phone;
  if (data.email !== undefined) row.email = data.email;
  if (data.managerName !== undefined) row.manager_name = data.managerName;
  if (data.managerId !== undefined) row.manager_id = data.managerId;
  if (data.status !== undefined) row.status = data.status;
  return row;
}

export const BranchProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuthSafe();
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [userBranchId, setUserBranchId] = useState<string | null>(null);
  const [userBranchType, setUserBranchType] = useState<'main' | 'sub' | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user's branch info
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchUserBranch = async () => {
      try {
        // maybeSingle() returns null (not a 406 error) when the user has no
        // corresponding row in public.users — which happens for auth accounts
        // that were created before the backfill or that have never been given
        // a profile row.
        let { data, error } = await supabaseClient
          .from('users')
          .select('branch_id')
          .eq('id', user.id)
          .maybeSingle();

        // If JWT expired, refresh and retry
        if (error && (error.message?.includes('JWT expired') || error.message?.includes('token is expired'))) {
          const client = getSupabaseClient();
          await client.auth.refreshSession();
          const retry = await supabaseClient.from('users').select('branch_id').eq('id', user.id).maybeSingle();
          data = retry.data;
          error = retry.error;
        }

        if (!error && data?.branch_id) {
          setUserBranchId(data.branch_id);
        } else {
          // No row or no branch assigned — default to first main branch.
          setUserBranchId(null);
        }
      } catch (err) {
        console.error('Error fetching user branch:', err);
      }
    };

    fetchUserBranch();
  }, [user]);

  // Fetch all branches
  const fetchBranches = useCallback(async () => {
    setLoading(true);
    try {
      let { data, error } = await supabaseClient
        .from('branches')
        .select('*');

      // If JWT expired, refresh the session and retry once
      if (error && (error.message?.includes('JWT expired') || error.message?.includes('token is expired'))) {
        const client = getSupabaseClient();
        const { error: refreshError } = await client.auth.refreshSession();
        if (!refreshError) {
          // Retry the query with the fresh token
          const retry = await supabaseClient.from('branches').select('*');
          data = retry.data;
          error = retry.error;
        }
      }

      if (error) {
        console.error('Error fetching branches:', error.message);
        setAllBranches([]);
        setCurrentBranch(null);
        setUserBranchType('main');
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        console.warn('No branches found in database');
        setAllBranches([]);
        setCurrentBranch(null);
        setUserBranchType('main');
        setLoading(false);
        return;
      }

      // Map first, then sort on the normalized `type` field (which correctly
      // derives from `is_main` boolean). Sorting raw DB rows used the potentially
      // absent/inconsistent `type` column; sorting after mapping is reliable.
      const branches = data.map(mapRowToBranch).sort((a, b) => {
        if (a.type === 'main' && b.type !== 'main') return -1;
        if (a.type !== 'main' && b.type === 'main') return 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
      setAllBranches(branches);

      // Determine user's branch and type
      if (userBranchId) {
        const userBranch = branches.find(b => b.id === userBranchId);
        if (userBranch) {
          setUserBranchType(userBranch.type);
          // If sub-branch user, lock to their branch
          if (userBranch.type === 'sub') {
            setCurrentBranch(userBranch);
          } else {
            // Main branch user: restore last selected or default to main
            const savedBranchId = localStorage.getItem('selectedBranchId');
            const savedBranch = savedBranchId ? branches.find(b => b.id === savedBranchId) : null;
            setCurrentBranch(savedBranch || userBranch);
          }
        } else {
          // Branch not found, default to first main
          const mainBranch = branches.find(b => b.type === 'main') || branches[0];
          setCurrentBranch(mainBranch || null);
          setUserBranchType(mainBranch?.type || null);
        }
      } else {
        // No branch assigned to user - default to main branch (admin scenario)
        const mainBranch = branches.find(b => b.type === 'main') || branches[0];
        setCurrentBranch(mainBranch || null);
        setUserBranchType('main'); // Treat unassigned users as main branch
      }
    } catch (err) {
      console.error('Error in fetchBranches:', err);
    } finally {
      setLoading(false);
    }
  }, [userBranchId]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  // Listen for realtime branch changes
  useEffect(() => {
    const channel = supabaseClient
      .channel('branches-changes')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'branches' }, () => {
        fetchBranches();
      })
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [fetchBranches]);

  const setCurrentBranchById = (branchId: string) => {
    // Sub-branch users cannot switch branches
    if (userBranchType === 'sub') return;

    const branch = allBranches.find(b => b.id === branchId) || null;
    setCurrentBranch(branch);
    if (branch) {
      localStorage.setItem('selectedBranchId', branch.id);
      // Publish the new scope so all data services re-fetch & filter
      setBranchScope({
        id: branch.id,
        code: branch.code || null,
        type: branch.type,
        isMainUser: userBranchType === 'main',
      });
    }
  };

  const createBranch = async (data: Partial<Branch>): Promise<{ success: boolean; error?: string; branch?: Branch }> => {
    // Only main branch users can create branches
    if (userBranchType !== 'main') {
      return { success: false, error: 'Only main branch users can create branches' };
    }

    try {
      // Check for duplicate branch code before inserting
      if (data.code) {
        const { data: existing, error: checkError } = await supabaseClient
          .from('branches')
          .select('id')
          .eq('code', data.code)
          .maybeSingle();

        if (checkError) {
          console.error('[BranchContext] Error checking duplicate code:', checkError);
        }

        if (existing) {
          return { success: false, error: `Branch code "${data.code}" already exists. Please use a unique code.` };
        }
      }

      // Build insert row — branch_id is a NOT NULL required column
      const row: Record<string, any> = {
        name: data.name || '',
        code: data.code || '',
        branch_id: data.code || '', // Legacy NOT NULL UNIQUE column - keep in sync with code
        is_main: false, // New branches are always sub-branches
        address: data.address || '',
        city: data.city || '',
        state: data.state || '',
        country: data.country || 'India',
        pincode: data.postalCode || '',
        phone: data.phone || '',
        email: data.email || '',
        manager_name: data.managerName || '',
        status: data.status || 'active',
      };
      if (data.managerId) row.manager_id = data.managerId;
      
      console.log('[BranchContext] Creating branch with row:', row);

      const { data: result, error } = await supabaseClient
        .from('branches')
        .insert(row)
        .select()
        .single();

      if (error) {
        console.error('[BranchContext] Insert error:', error);
        // Provide a friendlier message for unique constraint violations
        if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
          return { success: false, error: `A branch with code "${data.code}" already exists. Please use a different branch code.` };
        }
        return { success: false, error: error.message };
      }

      const newBranch = mapRowToBranch(result);
      setAllBranches(prev => [...prev, newBranch]);
      return { success: true, branch: newBranch };
    } catch (err: any) {
      console.error('[BranchContext] Create branch exception:', err);
      return { success: false, error: err.message };
    }
  };

  const updateBranch = async (id: string, data: Partial<Branch>): Promise<{ success: boolean; error?: string }> => {
    // Sub-branch users can only update their own branch
    if (userBranchType === 'sub' && id !== userBranchId) {
      return { success: false, error: 'You can only edit your own branch' };
    }

    try {
      const row = mapBranchToRow(data);
      console.log('[BranchContext] Updating branch:', id, 'with data:', row);
      
      const { data: result, error } = await supabaseClient
        .from('branches')
        .update(row)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[BranchContext] Update error:', error);
        return { success: false, error: error.message };
      }

      if (!result) {
        console.error('[BranchContext] Update returned no data - RLS may have blocked it');
        return { success: false, error: 'Update failed - insufficient permissions' };
      }

      console.log('[BranchContext] Update successful:', result);
      
      // Update local state with the server response
      const updatedBranch = mapRowToBranch(result);
      setAllBranches(prev => prev.map(b => b.id === id ? updatedBranch : b));
      if (currentBranch?.id === id) {
        setCurrentBranch(updatedBranch);
      }
      return { success: true };
    } catch (err: any) {
      console.error('[BranchContext] Update exception:', err);
      return { success: false, error: err.message };
    }
  };

  const deleteBranch = async (id: string): Promise<{ success: boolean; error?: string }> => {
    // Only main branch users can delete, and cannot delete main branch
    if (userBranchType !== 'main') {
      return { success: false, error: 'Only main branch users can delete branches' };
    }

    const branch = allBranches.find(b => b.id === id);
    if (branch?.type === 'main') {
      return { success: false, error: 'Cannot delete the main branch' };
    }

    try {
      const { error } = await supabaseClient
        .from('branches')
        .delete()
        .eq('id', id);

      if (error) {
        return { success: false, error: error.message };
      }

      setAllBranches(prev => prev.filter(b => b.id !== id));
      if (currentBranch?.id === id) {
        const mainBranch = allBranches.find(b => b.type === 'main');
        setCurrentBranch(mainBranch || null);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const isMainBranch = currentBranch?.type === 'main';
  const isMainBranchUser = userBranchType === 'main';

  // Publish the active branch scope so all data services filter & re-fetch.
  useEffect(() => {
    if (loading) return;
    setBranchScope({
      id: currentBranch?.id || null,
      code: currentBranch?.code || null,
      type: currentBranch?.type || null,
      isMainUser: isMainBranchUser,
    });
  }, [currentBranch?.id, currentBranch?.code, currentBranch?.type, isMainBranchUser, loading]);

  return (
    <BranchContext.Provider
      value={{
        currentBranch,
        allBranches,
        setCurrentBranchById,
        isMainBranch,
        isMainBranchUser,
        loading,
        refreshBranches: fetchBranches,
        createBranch,
        updateBranch,
        deleteBranch,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
};
