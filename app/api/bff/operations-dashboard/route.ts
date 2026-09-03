import { NextRequest, NextResponse } from 'next/server';
import { getServerUser, getServerRoles } from '@/lib/auth/server-session';
import { getOrLoad } from '@/lib/cache/serverCache';
import { decideAccess } from '@/lib/security/access-decision';
import { getSupabaseServiceClient } from '@/lib/supabase/server';

const OFFICE_DEPARTMENTS = [
  'admin', 'hr', 'human resources', 'finance', 'sales', 'it',
  'accounts', 'management', 'marketing', 'office', 'engineering',
];
const OPS_ALLOWED_ROLES = ['operations', 'admin', 'branch_admin'];
const BRANCH_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadDashboard(branchId: string | null, today: string) {
  const supabase = getSupabaseServiceClient();
  const results = await Promise.all([
    (() => {
      let query = supabase
        .from('employees')
        .select('id, designation, department')
        .ilike('status', 'active');
      if (branchId) query = query.eq('branch_id', branchId);
      return query;
    })(),
    (() => {
      let query = supabase
        .from('operational_posts')
        .select('id, post_name, post_code, client_name, location, total_guards, shift_type, service_instances, status')
        .eq('status', 'active')
        .order('post_name');
      if (branchId) query = query.eq('branch_id', branchId);
      return query;
    })(),
    supabase.from('rota_assignments').select('post_id').eq('rota_date', today),
    supabase.from('shift_attendance').select('status').eq('attendance_date', today),
    supabase.from('patrol_logs').select('id, status').eq('patrol_date', today),
    supabase
      .from('leave_requests')
      .select('id, employee_name')
      .eq('status', 'Approved')
      .lte('start_date', today)
      .gte('end_date', today),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;

  const [employeesRes, postsRes, rotaRes, attendanceRes, patrolRes, leaveRes] = results;
  const fieldEmployees = (employeesRes.data || []).filter(
    (employee: any) => !OFFICE_DEPARTMENTS.includes((employee.department || '').toLowerCase()),
  );

  const designations: Record<string, number> = {};
  for (const employee of fieldEmployees) {
    const designation = employee.designation || 'Unassigned';
    designations[designation] = (designations[designation] || 0) + 1;
  }

  const posts = (postsRes.data || []).map((post: any) => ({
    id: post.id,
    post_name: post.post_name,
    post_code: post.post_code,
    client_name: post.client_name,
    location: post.location,
    total_guards: post.total_guards,
    shift_type: post.shift_type,
    status: post.status,
  }));
  const rotaRows = rotaRes.data || [];
  const attendanceRows = attendanceRes.data || [];
  const patrolRows = patrolRes.data || [];

  return {
    manpower: { total: fieldEmployees.length, designations },
    posts,
    postsCount: posts.length,
    totalGuardsRequired: posts.reduce(
      (sum: number, post: any) => sum + (post.total_guards || 0),
      0,
    ),
    rota: {
      deployed: rotaRows.length,
      deployedPostIds: [...new Set(rotaRows.map((row: any) => row.post_id))],
    },
    attendance: {
      present: attendanceRows.filter((row: any) => row.status === 'present').length,
      absent: attendanceRows.filter((row: any) => row.status === 'absent').length,
      halfDay: attendanceRows.filter((row: any) => row.status === 'half_day').length,
      total: attendanceRows.length,
    },
    patrols: {
      total: patrolRows.length,
      completed: patrolRows.filter((row: any) => row.status === 'completed').length,
    },
    onLeave: (leaveRes.data || []).length,
    today,
  };
}
export async function GET(request: NextRequest) {
  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roles = await getServerRoles(user.id);
  const decision = decideAccess({
    sessionConfirmed: true,
    resolvedRoles: roles,
    routeAllowedRoles: OPS_ALLOWED_ROLES,
  });
  if (decision !== 'allow') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const branchId = request.nextUrl.searchParams.get('branchId');
  if (branchId && !BRANCH_ID_PATTERN.test(branchId)) {
    return NextResponse.json({ error: 'Invalid branch ID' }, { status: 400 });
  }

  try {
    const today = getTodayStr();
    const data = await getOrLoad({
      key: `operations-dashboard:${today}:user:${user.id}:branch:${branchId || 'all'}`,
      l1TtlMs: 5_000,
      l2TtlSeconds: 30,
      loader: () => loadDashboard(branchId, today),
    });

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'private, max-age=30',
        Vary: 'Authorization, Cookie',
      },
    });
  } catch (error: any) {
    console.error('[BFF operations-dashboard] Error:', error?.message || error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
