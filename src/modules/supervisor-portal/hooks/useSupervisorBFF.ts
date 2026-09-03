'use client';

import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '@/integrations/supabase/client';

export interface SupervisorBFFData {
  profile: {
    id: string;
    auth_user_id: string;
    employee_id: string;
    name: string;
    email: string;
    phone: string | null;
    designation: string | null;
    department: string | null;
    status: string;
  };
  posts: Array<{
    id: string;
    post_name: string;
    post_code: string;
    client_name: string;
    location: any;
    total_guards: number;
    shift_type: string;
    status: string;
    service_instances: any;
  }>;
  attendance: Array<{
    id: string;
    post_id: string;
    post_name: string;
    shift_key: string;
    service_type_key: string;
    slot_index: number;
    employee_id: string | null;
    employee_name: string | null;
    employee_code: string | null;
    status: string;
    marked_at: string | null;
    marked_by: string | null;
  }>;
  rota: Array<{
    id: string;
    post_id: string;
    post_name: string;
    shift_key: string;
    service_type_key: string;
    employee_id: string;
    employee_name: string;
    employee_code: string;
  }>;
  patrols: Array<{
    id: string;
    post_id: string;
    status: string;
    patrol_date: string;
  }>;
  leaves: Array<{
    id: string;
    employee_name: string;
    leave_type: string;
    from_date: string;
    to_date: string;
    status: string;
    post_id: string;
  }>;
  attendanceScore: number; // 0-10 score from last 3 months
  weeklyTrend: Array<{ date: string; present: number; total: number }>;
  today: string;
}

/**
 * Single BFF hook that fetches all supervisor portal data in one request.
 * Reduces network waterfall and provides instant page transitions.
 */
export function useSupervisorBFF() {
  return useQuery<SupervisorBFFData>({
    queryKey: ['supervisor-bff'],
    queryFn: async () => {
      const client = getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const res = await fetch('/api/bff/supervisor-portal', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      return res.json();
    },
    staleTime: 15_000, // 15s — matches server cache
    refetchInterval: 30_000, // Auto-refresh every 30s for live data
  });
}
