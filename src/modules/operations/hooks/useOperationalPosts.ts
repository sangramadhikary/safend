import { useQuery } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';

interface OperationalPostOption {
  id: string;
  post_name: string;
}

interface UseOperationalPostsReturn {
  posts: OperationalPostOption[];
  isLoading: boolean;
  error: Error | null;
}

export function useOperationalPosts(): UseOperationalPostsReturn {
  const { data, isLoading, error } = useQuery<OperationalPostOption[], Error>({
    queryKey: ['operational_posts', 'active'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('operational_posts')
        .select('id, post_name')
        .eq('status', 'active');

      if (error) throw new Error(error.message);
      return data as OperationalPostOption[];
    },
  });

  return {
    posts: data ?? [],
    isLoading,
    error: error ?? null,
  };
}
