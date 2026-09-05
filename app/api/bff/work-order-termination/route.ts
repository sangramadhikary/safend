import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerUser, getServerRoles } from '@/lib/auth/server-session';
import { decideAccess } from '@/lib/security/access-decision';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Roles permitted to read or mutate work-order termination state. Terminating a
 * work order deactivates its operational posts (destructive, business-impacting),
 * so it is restricted to operations/admin staff.
 */
const ALLOWED_ROLES = ['admin', 'branch_admin', 'operations', 'office-admin'] as const;

/**
 * Verify the caller is authenticated and holds a permitted role. Returns a
 * 401/403 response to short-circuit the handler, or null to proceed. This route
 * uses the RLS-bypassing service-role client, so it MUST enforce its own
 * authorization — there is no edge middleware gate in front of it.
 */
async function guard(request: NextRequest): Promise<NextResponse | null> {
  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const roles = await getServerRoles(user.id);
  if (decideAccess({ sessionConfirmed: true, resolvedRoles: roles, routeAllowedRoles: ALLOWED_ROLES }) !== 'allow') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

function getServiceClient() {
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(request: NextRequest) {
  try {
    const denied = await guard(request);
    if (denied) return denied;

    const { workOrderId, terminationData, deactivatePosts } = await request.json();

    if (!workOrderId) {
      return NextResponse.json({ error: 'workOrderId is required' }, { status: 400 });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }

    // Fetch current work order to get existing description
    const { data: current, error: fetchError } = await supabase
      .from('work_orders')
      .select('description')
      .eq('id', workOrderId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // Parse existing description and merge termination data
    let existingDesc: any = {};
    try {
      existingDesc = JSON.parse(current?.description || '{}');
    } catch {
      existingDesc = { serviceDetails: current?.description || '' };
    }

    // Update termination data within description JSON
    existingDesc.terminationData = terminationData;

    const { error: updateError } = await supabase
      .from('work_orders')
      .update({
        description: JSON.stringify(existingDesc),
        updated_at: new Date().toISOString(),
      })
      .eq('id', workOrderId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // If termination is finalized, deactivate operational posts for this work order
    if (deactivatePosts) {
      const { error: postsError } = await supabase
        .from('operational_posts')
        .update({
          status: 'inactive',
          work_order_status: 'Terminated',
          updated_at: new Date().toISOString(),
        })
        .eq('work_order_id', workOrderId);

      if (postsError) {
        console.warn('[work-order-termination] Posts deactivation error:', postsError.message);
        // Non-critical — return success for the main operation
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[work-order-termination]', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}

// GET endpoint to fetch termination data for a specific work order
export async function GET(request: NextRequest) {
  try {
    const denied = await guard(request);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const workOrderId = searchParams.get('workOrderId');

    if (!workOrderId) {
      return NextResponse.json({ error: 'workOrderId is required' }, { status: 400 });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }

    const { data, error } = await supabase
      .from('work_orders')
      .select('description')
      .eq('id', workOrderId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let desc: any = {};
    try {
      desc = JSON.parse(data?.description || '{}');
    } catch {
      desc = {};
    }

    return NextResponse.json({ terminationData: desc.terminationData || null });
  } catch (err: any) {
    console.error('[work-order-termination GET]', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
