import { useQuery } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';

interface StaffMember {
  id: string;
  name: string;
}

interface UseStaffMembersReturn {
  staffMembers: StaffMember[];
  isLoading: boolean;
  error: Error | null;
}

export function useStaffMembers(): UseStaffMembersReturn {
  const { data, isLoading, error } = useQuery<StaffMember[], Error>({
    queryKey: ['employees', 'active'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('employees')
        .select('id, name')
        .ilike('status', 'active');

      if (error) throw new Error(error.message);
      return data as StaffMember[];
    },
  });

  return {
    staffMembers: data ?? [],
    isLoading,
    error: error ?? null,
  };
}
