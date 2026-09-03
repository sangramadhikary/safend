import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';
import { applyBranchScope, getBranchScopeFilter } from '@/utils/branchScope';
import { PenaltyRecord, PenaltyFormData, PenaltyStatus } from '../schemas/penaltySchema';

interface UsePenaltiesOptions {
  status?: PenaltyStatus | 'all' | string;
  sourceOfInformation?: string;
}

interface UsePenaltiesReturn {
  penalties: PenaltyRecord[];
  isLoading: boolean;
  error: Error | null;
  createPenalty: (data: PenaltyFormData) => Promise<void>;
  updatePenalty: (id: string, data: Partial<PenaltyFormData>) => Promise<void>;
  deletePenalty: (id: string) => Promise<void>;
  changeStatus: (id: string, status: PenaltyStatus) => Promise<void>;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
}

export function usePenalties(options?: UsePenaltiesOptions): UsePenaltiesReturn {
  const queryClient = useQueryClient();

  const queryKey = ['penalties', options?.status ?? 'all', options?.sourceOfInformation ?? 'all', getBranchScopeFilter()];

  const { data, isLoading, error } = useQuery<PenaltyRecord[], Error>({
    queryKey,
    queryFn: async () => {
      let query = supabaseClient.from('penalties').select('*');

      if (options?.status && options.status !== 'all') {
        query = query.eq('status', options.status);
      }

      if (options?.sourceOfInformation) {
        query = query.eq('source_of_information', options.sourceOfInformation);
      }

      query = applyBranchScope(query);
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data as PenaltyRecord[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (penaltyData: PenaltyFormData) => {
      const { data, error } = await supabaseClient
        .from('penalties')
        .insert({
          ...penaltyData,
          status: 'Pending HR Review',
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['penalties'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PenaltyFormData> }) => {
      const { data: updatedData, error } = await supabaseClient
        .from('penalties')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return updatedData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['penalties'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseClient
        .from('penalties')
        .delete()
        .eq('id', id);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['penalties'] });
    },
  });

  const changeStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PenaltyStatus }) => {
      const { data, error } = await supabaseClient
        .from('penalties')
        .update({ status })
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['penalties'] });
    },
  });

  return {
    penalties: data ?? [],
    isLoading,
    error: error ?? null,
    createPenalty: async (penaltyData: PenaltyFormData) => {
      await createMutation.mutateAsync(penaltyData);
    },
    updatePenalty: async (id: string, penaltyData: Partial<PenaltyFormData>) => {
      await updateMutation.mutateAsync({ id, data: penaltyData });
    },
    deletePenalty: async (id: string) => {
      await deleteMutation.mutateAsync(id);
    },
    changeStatus: async (id: string, status: PenaltyStatus) => {
      await changeStatusMutation.mutateAsync({ id, status });
    },
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
