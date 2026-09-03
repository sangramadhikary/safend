'use client';

import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '@/integrations/supabase/client';

export interface SupervisorUser {
  id: string;
  auth_user_id: string;
  employee_id: string;
  employee_table_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  department: string | null;
  branch_id: string | null;
  status: string;
  created_at: string;
}

export interface AssignedPost {
  id: string;
  post_id: string;
  post_name: string;
  post_code: string;
  client_name: string;
  location: any;
  total_guards: number;
  shift_type: string;
  status: string;
}

/**
 * Fetches the current supervisor profile.
 */
export function useSupervisorProfile() {
  return useQuery({
    queryKey: ['supervisor-profile'],
    queryFn: async () => {
      const client = getSupabaseClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await client
        .from('supervisor_users')
        .select('*')
        .eq('auth_user_id', user.id)
        .single();

      if (error) throw new Error(error.message);
      return data as SupervisorUser;
    },
  });
}

/**
 * Fetches posts assigned to the current supervisor.
 */
export function useSupervisorPosts(supervisorId: string | undefined) {
  return useQuery({
    queryKey: ['supervisor-posts', supervisorId],
    enabled: !!supervisorId,
    queryFn: async () => {
      const client = getSupabaseClient();
      
      // Get assignment records
      const { data: assignments, error: aErr } = await client
        .from('supervisor_post_assignments')
        .select('post_id')
        .eq('supervisor_id', supervisorId!);

      if (aErr) throw new Error(aErr.message);
      if (!assignments || assignments.length === 0) return [];

      const postIds = assignments.map((a: any) => a.post_id);

      // Fetch the actual posts
      const { data: posts, error: pErr } = await client
        .from('operational_posts')
        .select('id, post_name, post_code, client_name, location, total_guards, shift_type, status')
        .in('id', postIds)
        .eq('status', 'active')
        .order('post_name');

      if (pErr) throw new Error(pErr.message);
      return (posts || []) as AssignedPost[];
    },
  });
}

/**
 * Fetches today's attendance for assigned posts.
 */
export function useSupervisorAttendance(postIds: string[]) {
  const today = new Date().toISOString().split('T')[0];
  return useQuery({
    queryKey: ['supervisor-attendance', postIds, today],
    enabled: postIds.length > 0,
    queryFn: async () => {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('shift_attendance')
        .select('*')
        .in('post_id', postIds)
        .eq('attendance_date', today);

      if (error) throw new Error(error.message);
      return data || [];
    },
  });
}

/**
 * Fetches rota assignments for assigned posts.
 */
export function useSupervisorRota(postIds: string[], date?: string) {
  const targetDate = date || new Date().toISOString().split('T')[0];
  return useQuery({
    queryKey: ['supervisor-rota', postIds, targetDate],
    enabled: postIds.length > 0,
    queryFn: async () => {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('rota_assignments')
        .select('*')
        .in('post_id', postIds)
        .eq('rota_date', targetDate);

      if (error) throw new Error(error.message);
      return data || [];
    },
  });
}

/**
 * Fetches leave requests for employees at assigned posts.
 */
export function useSupervisorLeaves(postIds: string[]) {
  return useQuery({
    queryKey: ['supervisor-leaves', postIds],
    enabled: postIds.length > 0,
    queryFn: async () => {
      const client = getSupabaseClient();
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await client
        .from('leave_requests')
        .select('*')
        .in('post_id', postIds)
        .gte('to_date', today)
        .order('from_date', { ascending: true })
        .limit(50);

      if (error) throw new Error(error.message);
      return data || [];
    },
  });
}

/**
 * Fetches patrol logs for assigned posts.
 */
export function useSupervisorPatrols(postIds: string[]) {
  const today = new Date().toISOString().split('T')[0];
  return useQuery({
    queryKey: ['supervisor-patrols', postIds, today],
    enabled: postIds.length > 0,
    queryFn: async () => {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('patrol_logs')
        .select('*')
        .in('post_id', postIds)
        .eq('patrol_date', today);

      if (error) throw new Error(error.message);
      return data || [];
    },
  });
}
