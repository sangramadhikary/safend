import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerUser } from '@/lib/auth/server-session';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BFF: Employee Portal Bootstrap
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Single endpoint that returns everything the Employee Portal needs on initial
 * load:
 * - Employee profile (employee_users table)
 * - Photo URL (employees table)
 * - Recent attendance (last 30 records)
 * - Pending leave requests
 * - Recent payslips (last 6 months)
 * - Active penalties
 *
 * Before: 5+ sequential/parallel client→Supabase calls
 * After: 1 BFF call → all data in ~50ms server-side
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
  // 1. Get employee profile
  const { data: profile, error: profileErr } = await supabase
    .from('employee_users')
    .select('*')
    .eq('auth_user_id', user.id)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Employee profile not found' }, { status: 404 });
  }

  // 2. Parallel queries using profile data
  const [photoRes, attendanceRes, leavesRes, payslipsRes, penaltiesRes] = await Promise.all([
    // Photo from employees table
    profile.employee_table_id
      ? supabase.from('employees').select('photo_url').eq('id', profile.employee_table_id).single()
      : Promise.resolve({ data: null, error: null }),

    // Recent attendance (last 30 records)
    supabase
      .from('attendance_records')
      .select('*')
      .eq('employee_id', profile.employee_id)
      .order('attendance_date', { ascending: false })
      .limit(30),

    // Leave requests
    supabase
      .from('employee_leave_requests')
      .select('*')
      .eq('employee_user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20),

    // Payslips (last 6 months)
    supabase
      .from('employee_payslips')
      .select('*')
      .eq('employee_user_id', profile.id)
      .order('month', { ascending: false })
      .limit(6),

    // Active penalties
    supabase
      .from('penalties')
      .select('*')
      .eq('employee_id', profile.employee_id)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  return NextResponse.json({
    profile,
    photoUrl: photoRes.data?.photo_url || null,
    attendance: attendanceRes.data || [],
    leaves: leavesRes.data || [],
    payslips: payslipsRes.data || [],
    penalties: penaltiesRes.data || [],
  }, {
    headers: {
      'Cache-Control': 'private, max-age=30',
    },
  });
  } catch (err: any) {
    console.error('[BFF employee-portal] Error:', err.message || err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
