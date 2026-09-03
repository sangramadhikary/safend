'use client';

import { supabaseClient } from '@/integrations/supabase/client';
import { deleteWorkOrder } from './WorkOrderFirebaseService';

/**
 * Cascading delete for a work order.
 * When a work order is deleted, ALL related client activity data is removed:
 * - Operational posts (and their salary rates via DB CASCADE)
 * - Rota assignments linked to those posts
 * - Rota plans linked to those posts
 * - Shift assignments linked to those posts (via rota_plans)
 * - Shift attendance linked to those posts
 * - Attendance records linked to those posts
 * - Penalties linked to those posts
 * - Mess management records linked to those posts
 * - Client portal incidents linked to those posts
 * - Receivables (invoices) for that client (only if no other active work orders)
 * - Collection tasks (via DB CASCADE on receivables)
 * - Invoice delete requests (via DB CASCADE on receivables)
 * - Client portal user cleanup (post_ids/agreement_ids updated or user deactivated)
 * - Deletion request document from Firebase
 * - The work order itself
 */
export const cascadeDeleteWorkOrder = async (workOrderId: string): Promise<{ success: boolean; error?: string; deletedCounts?: Record<string, number> }> => {
  try {
    const deletedCounts: Record<string, number> = {};

    // First get the work order's display ID since operational_posts may use either UUID or display ID
    let displayWorkOrderId: string | null = null;
    try {
      const { data: woRow } = await supabaseClient
        .from('work_orders')
        .select('id, work_order_id')
        .eq('id', workOrderId)
        .maybeSingle();
      if (woRow) {
        displayWorkOrderId = woRow.work_order_id;
      }
    } catch (e) {
      console.warn('[CascadeDelete] Could not fetch work order display ID:', e);
    }

    // Step 1: Get all operational posts linked to this work order (check both UUID and display ID)
    let posts: any[] = [];
    const { data: postsByUuid, error: postsError } = await supabaseClient
      .from('operational_posts')
      .select('id, client_name')
      .eq('work_order_id', workOrderId);

    if (postsError) {
      console.error('[CascadeDelete] Error fetching posts by UUID:', postsError);
    }
    posts = postsByUuid || [];

    // Also check by display ID if different from UUID
    if (displayWorkOrderId && displayWorkOrderId !== workOrderId) {
      const { data: postsByDisplay } = await supabaseClient
        .from('operational_posts')
        .select('id, client_name')
        .eq('work_order_id', displayWorkOrderId);
      if (postsByDisplay && postsByDisplay.length > 0) {
        // Merge, avoiding duplicates
        const existingIds = new Set(posts.map(p => p.id));
        for (const p of postsByDisplay) {
          if (!existingIds.has(p.id)) posts.push(p);
        }
      }
    }

    const postIds = posts.map(p => p.id);
    const clientName = posts[0]?.client_name || '';

    if (postIds.length > 0) {
      // Step 2: Delete rota_assignments for these posts
      const { count: rotaCount, error: rotaErr } = await supabaseClient
        .from('rota_assignments')
        .delete({ count: 'exact' })
        .in('post_id', postIds);
      if (rotaErr) console.error('[CascadeDelete] rota_assignments error:', rotaErr);
      deletedCounts.rota_assignments = rotaCount || 0;

      // Step 3: Delete shift_assignments linked to rota_plans for these posts
      // First get rota_plan IDs for these posts, then delete their shift_assignments
      try {
        const { data: rotaPlans } = await supabaseClient
          .from('rota_plans')
          .select('id')
          .in('post_id', postIds);

        if (rotaPlans && rotaPlans.length > 0) {
          const rotaPlanIds = rotaPlans.map(rp => rp.id);

          // Delete shift_assignments linked to these rota_plans
          const { count: shiftAssignCount, error: shiftAssignErr } = await supabaseClient
            .from('shift_assignments')
            .delete({ count: 'exact' })
            .in('rota_plan_id', rotaPlanIds);
          if (shiftAssignErr) console.error('[CascadeDelete] shift_assignments error:', shiftAssignErr);
          deletedCounts.shift_assignments = shiftAssignCount || 0;

          // Delete the rota_plans themselves
          const { count: rotaPlanCount, error: rotaPlanErr } = await supabaseClient
            .from('rota_plans')
            .delete({ count: 'exact' })
            .in('id', rotaPlanIds);
          if (rotaPlanErr) console.error('[CascadeDelete] rota_plans error:', rotaPlanErr);
          deletedCounts.rota_plans = rotaPlanCount || 0;
        }
      } catch (e) {
        console.warn('[CascadeDelete] rota_plans/shift_assignments cleanup skipped:', e);
      }

      // Step 4: Delete shift_attendance for these posts
      const { count: shiftAttCount, error: shiftErr } = await supabaseClient
        .from('shift_attendance')
        .delete({ count: 'exact' })
        .in('post_id', postIds);
      if (shiftErr) console.error('[CascadeDelete] shift_attendance error:', shiftErr);
      deletedCounts.shift_attendance = shiftAttCount || 0;

      // Step 5: Delete attendance_records for these posts (post_id is TEXT type)
      const postIdStrings = postIds.map(id => String(id));
      try {
        const { count: attCount, error: attErr } = await supabaseClient
          .from('attendance_records')
          .delete({ count: 'exact' })
          .in('post_id', postIdStrings);
        if (attErr) console.warn('[CascadeDelete] attendance_records error (table may not exist):', attErr.message);
        deletedCounts.attendance_records = attCount || 0;
      } catch (e) {
        console.warn('[CascadeDelete] attendance_records cleanup skipped:', e);
      }

      // Step 6: Delete penalties for these posts
      const { count: penaltyCount, error: penErr } = await supabaseClient
        .from('penalties')
        .delete({ count: 'exact' })
        .in('post_id', postIds);
      if (penErr) console.error('[CascadeDelete] penalties error:', penErr);
      deletedCounts.penalties = penaltyCount || 0;

      // Step 7: Delete mess_week_posts and mess_meal_records for these posts
      try {
        const { count: messPostCount } = await supabaseClient
          .from('mess_week_posts')
          .delete({ count: 'exact' })
          .in('post_id', postIds);
        deletedCounts.mess_week_posts = messPostCount || 0;

        const { count: messMealCount } = await supabaseClient
          .from('mess_meal_records')
          .delete({ count: 'exact' })
          .in('post_id', postIds);
        deletedCounts.mess_meal_records = messMealCount || 0;
      } catch (e) {
        console.warn('[CascadeDelete] Mess tables cleanup skipped:', e);
      }

      // Step 8: Delete client_incidents for these posts
      try {
        const { count: incidentCount } = await supabaseClient
          .from('client_incidents')
          .delete({ count: 'exact' })
          .in('post_id', postIds);
        deletedCounts.client_incidents = incidentCount || 0;
      } catch (e) {
        console.warn('[CascadeDelete] Client incidents cleanup skipped:', e);
      }

      // Step 9: Delete post_salary_rates
      const { count: salaryCount, error: salaryErr } = await supabaseClient
        .from('post_salary_rates')
        .delete({ count: 'exact' })
        .in('post_id', postIds);
      if (salaryErr) console.error('[CascadeDelete] post_salary_rates error:', salaryErr);
      deletedCounts.post_salary_rates = salaryCount || 0;

      // Step 10: Delete the operational posts themselves
      const { count: postCount, error: postDelErr } = await supabaseClient
        .from('operational_posts')
        .delete({ count: 'exact' })
        .in('id', postIds);
      if (postDelErr) console.error('[CascadeDelete] operational_posts delete error:', postDelErr);
      deletedCounts.operational_posts = postCount || 0;
    }

    // Step 11: Delete receivables (invoices) for this client
    // Only delete if the client has NO other active work orders
    if (clientName) {
      const hasOtherWorkOrders = await clientHasOtherActiveWorkOrders(clientName, workOrderId);
      if (!hasOtherWorkOrders) {
        const { count: receivableCount, error: recErr } = await supabaseClient
          .from('receivables')
          .delete({ count: 'exact' })
          .eq('client_name', clientName);
        if (recErr) console.error('[CascadeDelete] receivables error:', recErr);
        deletedCounts.receivables = receivableCount || 0;
      } else {
        console.info('[CascadeDelete] Skipping receivables deletion — client has other active work orders.');
        deletedCounts.receivables_skipped = 1;
      }
    }

    // Step 12: Delete linked agreement(s)
    let linkedAgreementId: string | null = null;
    try {
      const { data: woData } = await supabaseClient
        .from('work_orders')
        .select('id, description')
        .eq('id', workOrderId)
        .maybeSingle();
      
      if (woData?.description) {
        const desc = typeof woData.description === 'string' ? JSON.parse(woData.description) : woData.description;
        linkedAgreementId = desc?.linkedAgreementId || null;
        if (linkedAgreementId) {
          const { deleteAgreement } = await import('./AgreementFirebaseService');
          const agreeResult = await deleteAgreement(linkedAgreementId);
          if (agreeResult.success) deletedCounts.agreements = 1;
        }
      }
    } catch (e) {
      console.warn('[CascadeDelete] Agreement cleanup skipped:', e);
    }

    // Step 13: Delete contract renewals from Supabase
    try {
      const { data: renewals } = await supabaseClient
        .from('contract_renewals')
        .select('id')
        .eq('work_order_id', workOrderId);
      if (renewals && renewals.length > 0) {
        await supabaseClient
          .from('contract_renewals')
          .delete()
          .eq('work_order_id', workOrderId);
        deletedCounts.contract_renewals = renewals.length;
      }
    } catch (e) {
      console.warn('[CascadeDelete] Contract renewals cleanup skipped:', e);
    }

    // Step 14: Clean up client_users — remove deleted post_ids and agreement_ids
    // If no posts remain for the client user, deactivate the account
    if (postIds.length > 0 || linkedAgreementId) {
      try {
        // Find client_users whose post_ids overlap with deleted posts
        const { data: clientUsers } = await supabaseClient
          .from('client_users')
          .select('id, post_ids, agreement_ids, client_name')
          .eq('client_name', clientName);

        if (clientUsers && clientUsers.length > 0) {
          for (const cu of clientUsers) {
            const currentPostIds: string[] = cu.post_ids || [];
            const currentAgreementIds: string[] = cu.agreement_ids || [];

            // Remove deleted post IDs
            const updatedPostIds = currentPostIds.filter(pid => !postIds.includes(pid));
            // Remove deleted agreement ID
            const updatedAgreementIds = linkedAgreementId
              ? currentAgreementIds.filter(aid => aid !== linkedAgreementId)
              : currentAgreementIds;

            if (updatedPostIds.length === 0 && updatedAgreementIds.length === 0) {
              // No posts or agreements left — deactivate the client user
              const { error: deactivateErr } = await supabaseClient
                .from('client_users')
                .update({ status: 'inactive', post_ids: [], agreement_ids: [] })
                .eq('id', cu.id);
              if (deactivateErr) console.error('[CascadeDelete] client_users deactivation error:', deactivateErr);
              else deletedCounts.client_users_deactivated = (deletedCounts.client_users_deactivated || 0) + 1;
            } else {
              // Still has other posts/agreements — just update the arrays
              const { error: updateErr } = await supabaseClient
                .from('client_users')
                .update({ post_ids: updatedPostIds, agreement_ids: updatedAgreementIds })
                .eq('id', cu.id);
              if (updateErr) console.error('[CascadeDelete] client_users update error:', updateErr);
              else deletedCounts.client_users_updated = (deletedCounts.client_users_updated || 0) + 1;
            }
          }
        }
      } catch (e) {
        console.warn('[CascadeDelete] client_users cleanup skipped:', e);
      }
    }

    // Step 15: Clean up deletion requests from Supabase
    try {
      const { data: delReqs } = await supabaseClient
        .from('deletion_requests')
        .select('id')
        .eq('item_id', workOrderId)
        .eq('item_type', 'workorder');
      if (delReqs && delReqs.length > 0) {
        await supabaseClient
          .from('deletion_requests')
          .delete()
          .eq('item_id', workOrderId)
          .eq('item_type', 'workorder');
        deletedCounts.deletion_requests = delReqs.length;
      }
    } catch (e) {
      console.warn('[CascadeDelete] Deletion request cleanup skipped:', e);
    }

    // Step 16: Delete the work order itself
    const deleteResult = await deleteWorkOrder(workOrderId);
    if (!deleteResult.success) {
      // Work order might have FK constraints — try nullifying quotation_id first
      try {
        await supabaseClient
          .from('work_orders')
          .update({ quotation_id: null })
          .eq('id', workOrderId);
        const retryResult = await deleteWorkOrder(workOrderId);
        if (!retryResult.success) {
          return { success: false, error: retryResult.error || 'Failed to delete work order' };
        }
      } catch (e) {
        return { success: false, error: deleteResult.error || 'Failed to delete work order' };
      }
    }
    deletedCounts.work_order = 1;

    return { success: true, deletedCounts };
  } catch (error) {
    console.error('[CascadeDelete] Error in cascade delete:', error);
    return { success: false, error: (error as Error).message };
  }
};

/**
 * Helper: Check if a client has other active work orders besides the one being deleted.
 * Used to determine if receivables should be deleted (only when no other WOs exist).
 */
async function clientHasOtherActiveWorkOrders(clientName: string, excludeWorkOrderId: string): Promise<boolean> {
  try {
    // Check operational_posts for this client that belong to other work orders
    const { data: otherPosts } = await supabaseClient
      .from('operational_posts')
      .select('id, work_order_id')
      .eq('client_name', clientName)
      .neq('work_order_id', excludeWorkOrderId)
      .limit(1);

    if (otherPosts && otherPosts.length > 0) return true;

    // Also check work_orders table directly via description JSON (client info stored there)
    const { data: otherWOs } = await supabaseClient
      .from('work_orders')
      .select('id')
      .neq('id', excludeWorkOrderId)
      .limit(50);

    if (otherWOs) {
      for (const wo of otherWOs) {
        // Quick check — if any other work order's posts reference this client
        const { data: woPosts } = await supabaseClient
          .from('operational_posts')
          .select('id')
          .eq('work_order_id', wo.id)
          .eq('client_name', clientName)
          .limit(1);
        if (woPosts && woPosts.length > 0) return true;
      }
    }

    return false;
  } catch (e) {
    console.warn('[CascadeDelete] Error checking other work orders:', e);
    // Default to safe behavior — don't delete receivables if unsure
    return true;
  }
}
