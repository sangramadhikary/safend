import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerUser } from '@/lib/auth/server-session';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BFF: Client Portal Dashboard
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Aggregates the client portal's initial data into a single response:
 * - Client profile (from client_users)
 * - Assigned posts (from operational_posts)
 * - Recent invoices (from receivables)
 * - Open incidents count
 *
 * Before: 4 parallel requests from browser → Supabase
 * After: 1 request → BFF → 4 parallel server-side queries (~5ms total)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
  // 1. Get client profile
  const { data: profile, error: profileErr } = await supabase
    .from('client_users')
    .select('*')
    .eq('auth_user_id', user.id)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Client profile not found' }, { status: 404 });
  }

  const postIds = profile.post_ids || [];
  const clientName = profile.client_name;

  // 2. Execute remaining queries in parallel
  const [postsRes, invoicesRes, incidentsRes] = await Promise.all([
    // Posts assigned to this client
    postIds.length > 0
      ? supabase
          .from('operational_posts')
          .select('id, post_name, post_code, location, total_guards, shift_type, status, gst_number, gst_percentage, client_name')
          .in('id', postIds)
      : Promise.resolve({ data: [], error: null }),

    // Recent invoices (last 20)
    clientName
      ? supabase
          .from('receivables')
          .select('*')
          .in('category', ['Invoices', 'Invoice Adjustments'])
          .ilike('client_name', clientName)
          .order('created_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [], error: null }),

    // Open incidents count
    supabase
      .from('client_incidents')
      .select('*', { count: 'exact', head: true })
      .eq('client_user_id', profile.id)
      .in('status', ['open', 'in_progress']),
  ]);

  return NextResponse.json({
    profile,
    posts: postsRes.data || [],
    invoices: invoicesRes.data || [],
    openIncidents: incidentsRes.count ?? 0,
  }, {
    headers: {
      'Cache-Control': 'private, s-maxage=0, max-age=30',
    },
  });
  } catch (err: any) {
    console.error('[BFF client-dashboard] Error:', err.message || err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
