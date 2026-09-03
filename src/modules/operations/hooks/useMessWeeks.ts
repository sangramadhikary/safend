import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';
import { applyBranchScope, getBranchScopeFilter } from '@/utils/branchScope';

export type MessWeekStatus = 'fund_requested' | 'fund_approved' | 'meals_recorded' | 'calculated' | 'deducted';

export interface MessWeek {
  id: string;
  week_start_date: string;
  week_end_date: string;
  status: MessWeekStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessWeekPost {
  id: string;
  mess_week_id: string;
  post_id: string;
  post_name: string;
}

export interface MessWeekWithPosts extends MessWeek {
  mess_week_posts: MessWeekPost[];
}

interface CreateMessWeekInput {
  week_start_date: string;
  week_end_date: string;
  posts: { post_id: string; post_name: string }[];
  requested_amount?: number;
  created_by?: string;
}

export function useMessWeeks(status?: MessWeekStatus) {
  const queryClient = useQueryClient();

  const query = useQuery<MessWeekWithPosts[]>({
    queryKey: ['mess_weeks', status, getBranchScopeFilter()],
    queryFn: async () => {
      let q = supabaseClient
        .from('mess_weeks')
        .select('*, mess_week_posts(*)');

      if (status) {
        q = q.eq('status', status);
      }
      q = applyBranchScope(q);

      const { data, error } = await q.order('week_start_date', { ascending: false });
      if (error) throw new Error(error.message);
      return data as MessWeekWithPosts[];
    },
  });

  const createMessWeek = useMutation({
    mutationFn: async (input: CreateMessWeekInput) => {
      // Create the mess week
      const { data: week, error: weekError } = await supabaseClient
        .from('mess_weeks')
        .insert({
          week_start_date: input.week_start_date,
          week_end_date: input.week_end_date,
          status: 'fund_requested' as MessWeekStatus,
          created_by: input.created_by || null,
        })
        .select()
        .single();

      if (weekError) throw new Error(weekError.message);

      // Create associated posts
      if (input.posts.length > 0) {
        const postRows = input.posts.map(p => ({
          mess_week_id: week.id,
          post_id: p.post_id,
          post_name: p.post_name,
        }));

        const { error: postsError } = await supabaseClient
          .from('mess_week_posts')
          .insert(postRows);

        if (postsError) throw new Error(postsError.message);
      }

      // Create a fund request automatically
      const { error: fundError } = await supabaseClient
        .from('mess_fund_requests')
        .insert({
          mess_week_id: week.id,
          status: 'pending',
          requested_amount: input.requested_amount || null,
        });

      if (fundError) throw new Error(fundError.message);

      return week;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mess_weeks'] });
      queryClient.invalidateQueries({ queryKey: ['mess_fund_requests'] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: MessWeekStatus }) => {
      const { data, error } = await supabaseClient
        .from('mess_weeks')
        .update({ status })
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mess_weeks'] });
    },
  });

  return {
    messWeeks: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createMessWeek,
    updateStatus,
  };
}
