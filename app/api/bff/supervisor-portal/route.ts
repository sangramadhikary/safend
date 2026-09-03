import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerUser } from '@/lib/auth/server-session';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BFF: Supervisor / Area Officer Portal Bootstrap
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Single endpoint returning everything the Supervisor Portal needs:
 * - Supervisor profile
 * - Assigned posts (with location data)
 * - Today's attendance for those posts
 * - Today's rota/deployments for those posts
 * - Today's patrol logs
 * - Active leave requests for employees at those posts
 *
 * Before: 6+ parallel browser→Supabase calls
 * After: 1 BFF call → all data server-side in ~50ms
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const today = getTodayStr();

    // 1. Get supervisor profile (try supervisor_users, fallback to employee_users)
    let profile: any = null;
    const { data: supProfile } = await supabase
      .from('supervisor_users')
      .select('*')
      .eq('auth_user_id', user.id)
      .single();

    if (supProfile) {
      profile = supProfile;
    } else {
      const { data: empProfile } = await supabase
        .from('employee_users')
        .select('*')
        .eq('auth_user_id', user.id)
        .single();
      profile = empProfile;
    }

    if (!profile) {
      return NextResponse.json({ error: 'Supervisor profile not found' }, { status: 404 });
    }

    // 2. Get assigned post IDs
    const { data: assignments } = await supabase
      .from('supervisor_post_assignments')
      .select('post_id')
      .eq('supervisor_id', profile.id);

    const postIds = (assignments || []).map((a: any) => a.post_id);

    if (postIds.length === 0) {
      return NextResponse.json({
        profile,
        posts: [],
        attendance: [],
        rota: [],
        patrols: [],
        leaves: [],
        today,
      });
    }

    // 3. Parallel queries for assigned posts' data
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const threeMonthsStr = threeMonthsAgo.toISOString().split('T')[0];

    const [postsRes, attendanceRes, rotaRes, patrolsRes, leavesRes, attendanceHistoryRes] = await Promise.all([
      // Posts with details
      supabase
        .from('operational_posts')
        .select('id, post_name, post_code, client_name, location, total_guards, shift_type, status, service_instances, contact_person, contact_phone, contact_email, created_at, work_order_id, quotation_id')
        .in('id', postIds)
        .eq('status', 'active')
        .order('post_name'),

      // Today's attendance
      supabase
        .from('shift_attendance')
        .select('id, post_id, post_name, shift_key, service_type_key, slot_index, employee_id, employee_name, employee_code, status, marked_at, marked_by')
        .in('post_id', postIds)
        .eq('attendance_date', today),

      // Today's rota
      supabase
        .from('rota_assignments')
        .select('id, post_id, post_name, shift_key, service_type_key, employee_id, employee_name, employee_code')
        .in('post_id', postIds)
        .eq('rota_date', today),

      // Today's patrols
      supabase
        .from('patrol_logs')
        .select('id, post_id, status, patrol_date, created_at')
        .in('post_id', postIds)
        .eq('patrol_date', today),

      // Active/upcoming leaves
      supabase
        .from('leave_requests')
        .select('id, employee_name, leave_type, from_date, to_date, status, post_id')
        .in('post_id', postIds)
        .gte('to_date', today)
        .in('status', ['Pending', 'Approved'])
        .order('from_date')
        .limit(30),

      // 3-month attendance history (for score calculation)
      supabase
        .from('shift_attendance')
        .select('attendance_date, status')
        .in('post_id', postIds)
        .gte('attendance_date', threeMonthsStr)
        .order('attendance_date', { ascending: true }),
    ]);

    // Compute 3-month attendance score
    const historyRows = attendanceHistoryRes.data || [];
    const totalHistorySlots = historyRows.length;
    const presentHistory = historyRows.filter((r: any) => r.status === 'present' || r.status === 'half_day').length;
    const attendanceScore = totalHistorySlots > 0
      ? Math.round((presentHistory / totalHistorySlots) * 10 * 10) / 10
      : 0;

    // Weekly attendance trend (last 7 days)
    const weeklyTrend: { date: string; present: number; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayRows = historyRows.filter((r: any) => r.attendance_date === dateStr);
      weeklyTrend.push({
        date: dateStr,
        present: dayRows.filter((r: any) => r.status === 'present' || r.status === 'half_day').length,
        total: dayRows.length,
      });
    }

    return NextResponse.json({
      profile,
      posts: postsRes.data || [],
      attendance: attendanceRes.data || [],
      rota: rotaRes.data || [],
      patrols: patrolsRes.data || [],
      leaves: leavesRes.data || [],
      attendanceScore,
      weeklyTrend,
      today,
    }, {
      headers: { 'Cache-Control': 'private, max-age=15' },
    });
  } catch (err: any) {
    console.error('[BFF supervisor-portal] Error:', err.message || err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
