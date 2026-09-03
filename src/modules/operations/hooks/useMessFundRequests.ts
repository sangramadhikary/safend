import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';
import { applyBranchScope, getBranchScopeFilter } from '@/utils/branchScope';

export interface MessFundRequest {
  id: string;
  mess_week_id: string;
  requested_amount: number | null;
  approved_amount: number | null;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessFundRequestWithWeek extends MessFundRequest {
  mess_weeks: {
    id: string;
    week_start_date: string;
    week_end_date: string;
    status: string;
    mess_week_posts: { id: string; post_id: string; post_name: string }[];
  };
}

export function useMessFundRequests(status?: 'pending' | 'approved' | 'rejected') {
  const queryClient = useQueryClient();

  const query = useQuery<MessFundRequestWithWeek[]>({
    queryKey: ['mess_fund_requests', status, getBranchScopeFilter()],
    queryFn: async () => {
      let q = supabaseClient
        .from('mess_fund_requests')
        .select('*, mess_weeks(id, week_start_date, week_end_date, status, mess_week_posts(id, post_id, post_name))');

      if (status) {
        q = q.eq('status', status);
      }
      q = applyBranchScope(q);

      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data as MessFundRequestWithWeek[];
    },
  });

  const approveFundRequest = useMutation({
    mutationFn: async ({ id, approved_amount, approved_by, notes }: {
      id: string;
      approved_amount: number;
      approved_by?: string;
      notes?: string;
    }) => {
      const { data, error } = await supabaseClient
        .from('mess_fund_requests')
        .update({
          status: 'approved',
          approved_amount,
          approved_by: approved_by || null,
          approved_at: new Date().toISOString(),
          notes: notes || null,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(error.message);

      // Update the mess week status to fund_approved
      const { data: request } = await supabaseClient
        .from('mess_fund_requests')
        .select('mess_week_id')
        .eq('id', id)
        .single();

      if (request) {
        await supabaseClient
          .from('mess_weeks')
          .update({ status: 'fund_approved' })
          .eq('id', request.mess_week_id);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mess_fund_requests'] });
      queryClient.invalidateQueries({ queryKey: ['mess_weeks'] });
    },
  });

  const rejectFundRequest = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const { data, error } = await supabaseClient
        .from('mess_fund_requests')
        .update({
          status: 'rejected',
          notes: notes || null,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mess_fund_requests'] });
    },
  });

  return {
    fundRequests: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    approveFundRequest,
    rejectFundRequest,
  };
}
