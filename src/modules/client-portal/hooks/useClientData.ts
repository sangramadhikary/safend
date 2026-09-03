'use client';

import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '@/integrations/supabase/client';

export interface ClientUser {
  id: string;
  auth_user_id: string;
  client_name: string;
  company_name: string | null;
  contact_person: string;
  email: string;
  phone: string | null;
  agreement_ids: string[];
  post_ids: string[];
  status: string;
  created_at: string;
}

/**
 * Fetches the current client user profile from client_users table.
 */
export function useClientProfile() {
  return useQuery({
    queryKey: ['client-profile'],
    queryFn: async () => {
      const client = getSupabaseClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await client
        .from('client_users')
        .select('*')
        .eq('auth_user_id', user.id)
        .single();

      if (error) throw new Error(error.message);
      return data as ClientUser;
    },
  });
}

/**
 * Fetches invoices for the client (from receivables table matched by client_name).
 * Includes both Invoices and Debit Notes for full visibility.
 */
export function useClientInvoices(clientName: string | undefined) {
  return useQuery({
    queryKey: ['client-invoices', clientName],
    enabled: !!clientName,
    queryFn: async () => {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('receivables')
        .select('*')
        .in('category', ['Invoices', 'Invoice Adjustments'])
        .eq('client_name', clientName!)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);
      return data || [];
    },
  });
}

/**
 * Fetches attendance records for the client's posts.
 */
export function useClientAttendance(postIds: string[] | undefined, dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ['client-attendance', postIds, dateFrom, dateTo],
    enabled: !!postIds && postIds.length > 0,
    queryFn: async () => {
      const client = getSupabaseClient();
      let query = client
        .from('attendance_records')
        .select('*')
        .in('post_id', postIds!);

      if (dateFrom) query = query.gte('attendance_date', dateFrom);
      if (dateTo) query = query.lte('attendance_date', dateTo);

      const { data, error } = await query.order('attendance_date', { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    },
  });
}

/**
 * Fetches operational posts linked to the client.
 * Also fetches gst_number and gst_percentage for the invoice detail modal.
 */
export function useClientPosts(postIds: string[] | undefined) {
  return useQuery({
    queryKey: ['client-posts', postIds],
    enabled: !!postIds && postIds.length > 0,
    queryFn: async () => {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('operational_posts')
        .select('id, post_name, post_code, location, total_guards, shift_type, status, gst_number, gst_percentage, client_name')
        .in('id', postIds!);

      if (error) throw new Error(error.message);
      return data || [];
    },
  });
}

/**
 * Fetches incidents reported by this client.
 */
export function useClientIncidents(clientUserId: string | undefined) {
  return useQuery({
    queryKey: ['client-incidents', clientUserId],
    enabled: !!clientUserId,
    queryFn: async () => {
      const client = getSupabaseClient();
      const { data, error } = await client
        .from('client_incidents')
        .select('*')
        .eq('client_user_id', clientUserId!)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);
      return data || [];
    },
  });
}

/**
 * Fetches compliance filings (ESIC, EPF challans) that the client can download.
 */
export function useClientComplianceDocs(clientName: string | undefined) {
  return useQuery({
    queryKey: ['client-compliance', clientName],
    enabled: !!clientName,
    queryFn: async () => {
      const client = getSupabaseClient();
      // Compliance filings relevant to the client — ESIC and EPF categories
      const { data, error } = await client
        .from('compliance_filings')
        .select('*')
        .in('category', ['ESIC', 'EPF'])
        .eq('status', 'filed')
        .order('period', { ascending: false });

      if (error) throw new Error(error.message);
      return data || [];
    },
  });
}
