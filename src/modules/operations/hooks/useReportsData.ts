import { useQuery } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';

interface ReportsStats {
  activeEmployees: number;
  penaltiesThisMonth: number;
  activePosts: number;
  activeMessWeeks: number;
}

interface RecentPenalty {
  id: string;
  staff_name: string;
  offense: string;
  violation_date: string;
  status: string;
  created_at: string;
}

interface UseReportsDataReturn {
  stats: ReportsStats;
  recentPenalties: RecentPenalty[];
  isLoading: boolean;
}

export function useReportsData(): UseReportsDataReturn {
  const firstDayOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  ).toISOString();

  const { data: activeEmployees, isLoading: loadingEmployees } = useQuery({
    queryKey: ['reports', 'active-employees-count'],
    queryFn: async () => {
      const { count, error } = await supabaseClient
        .from('employees')
        .select('*', { count: 'exact', head: true })
        .ilike('status', 'active');
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });

  const { data: penaltiesThisMonth, isLoading: loadingPenalties } = useQuery({
    queryKey: ['reports', 'penalties-this-month'],
    queryFn: async () => {
      const { count, error } = await supabaseClient
        .from('penalties')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', firstDayOfMonth);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });

  const { data: activePosts, isLoading: loadingPosts } = useQuery({
    queryKey: ['reports', 'active-posts-count'],
    queryFn: async () => {
      const { count, error } = await supabaseClient
        .from('operational_posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });

  const { data: activeMessWeeks, isLoading: loadingMess } = useQuery({
    queryKey: ['reports', 'active-mess-weeks'],
    queryFn: async () => {
      const { count, error } = await supabaseClient
        .from('mess_weeks')
        .select('*', { count: 'exact', head: true })
        .neq('status', 'deducted');
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });

  const { data: recentPenalties, isLoading: loadingRecent } = useQuery<RecentPenalty[]>({
    queryKey: ['reports', 'recent-penalties'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('penalties')
        .select('id, staff_name, offense, violation_date, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw new Error(error.message);
      return (data ?? []) as RecentPenalty[];
    },
  });

  const isLoading =
    loadingEmployees || loadingPenalties || loadingPosts || loadingMess || loadingRecent;

  return {
    stats: {
      activeEmployees: activeEmployees ?? 0,
      penaltiesThisMonth: penaltiesThisMonth ?? 0,
      activePosts: activePosts ?? 0,
      activeMessWeeks: activeMessWeeks ?? 0,
    },
    recentPenalties: recentPenalties ?? [],
    isLoading,
  };
}
