'use client';

import { supabaseClient } from '@/integrations/supabase/client';
import { getSupabaseClient } from '@/integrations/supabase/client';

/**
 * Workflow Service — Supabase Realtime
 * Provides real-time queries for workflow pipeline stages using Supabase subscriptions.
 */

// Subscribe to Pending Agreements (status == "Pending Signature")
export const subscribeToPendingAgreements = (callback: (agreements: any[]) => void) => {
  const fetchData = async () => {
    const { data } = await supabaseClient.from('agreements')
      .select('*')
      .eq('status', 'Pending Signature')
      .order('created_at', { ascending: false });
    callback(data || []);
  };

  fetchData();

  const channel = getSupabaseClient()
    .channel('workflow_pending_agreements')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agreements' }, () => {
      fetchData();
    })
    .subscribe();

  return () => { getSupabaseClient().removeChannel(channel); };
};

// Subscribe to Signed Agreements (status == "Signed")
export const subscribeToSignedAgreements = (callback: (agreements: any[]) => void) => {
  const fetchData = async () => {
    const { data } = await supabaseClient.from('agreements')
      .select('*')
      .eq('status', 'Signed')
      .order('created_at', { ascending: false });
    callback(data || []);
  };

  fetchData();

  const channel = getSupabaseClient()
    .channel('workflow_signed_agreements')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agreements' }, () => {
      fetchData();
    })
    .subscribe();

  return () => { getSupabaseClient().removeChannel(channel); };
};

// Subscribe to Active Work Orders (status == "In Progress")
export const subscribeToActiveWorkOrders = (callback: (workOrders: any[]) => void) => {
  const fetchData = async () => {
    const { data } = await supabaseClient.from('work_orders')
      .select('*')
      .eq('status', 'In Progress')
      .order('created_at', { ascending: false });
    callback(data || []);
  };

  fetchData();

  const channel = getSupabaseClient()
    .channel('workflow_active_workorders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => {
      fetchData();
    })
    .subscribe();

  return () => { getSupabaseClient().removeChannel(channel); };
};

// Subscribe to all workflow stages combined
export const subscribeToWorkflowPipeline = (callback: (pipeline: {
  pendingAgreements: any[];
  signedAgreements: any[];
  activeWorkOrders: any[];
}) => void) => {
  let pendingAgreements: any[] = [];
  let signedAgreements: any[] = [];
  let activeWorkOrders: any[] = [];

  const updateCallback = () => {
    callback({
      pendingAgreements,
      signedAgreements,
      activeWorkOrders
    });
  };

  const unsubscribePending = subscribeToPendingAgreements((data) => {
    pendingAgreements = data;
    updateCallback();
  });

  const unsubscribeSigned = subscribeToSignedAgreements((data) => {
    signedAgreements = data;
    updateCallback();
  });

  const unsubscribeActive = subscribeToActiveWorkOrders((data) => {
    activeWorkOrders = data;
    updateCallback();
  });

  // Return combined unsubscribe function
  return () => {
    unsubscribePending();
    unsubscribeSigned();
    unsubscribeActive();
  };
};
