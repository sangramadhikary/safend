import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { workOrderId, terminationData, deactivatePosts } = await request.json();

    if (!workOrderId) {
      return NextResponse.json({ error: 'workOrderId is required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

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
    const { searchParams } = new URL(request.url);
    const workOrderId = searchParams.get('workOrderId');

    if (!workOrderId) {
      return NextResponse.json({ error: 'workOrderId is required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

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
