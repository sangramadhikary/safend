import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerUser, getServerRoles } from '@/lib/auth/server-session';
import { decideAccess } from '@/lib/security/access-decision';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BFF: HR Overview & Payroll Stats
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Aggregates HR dashboard data:
 * - Employee headcount by status/department
 * - Pending leave requests
 * - Pending penalties
 * - Payroll summary (this month)
 * - Loan/advance stats
 * - Compliance filing status
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const HR_ALLOWED_ROLES = ['hr', 'admin', 'branch_admin'];

export async function GET(request: NextRequest) {
  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roles = await getServerRoles(user.id);
  const decision = decideAccess({
    sessionConfirmed: true,
    resolvedRoles: roles,
    routeAllowedRoles: HR_ALLOWED_ROLES,
  });
  if (decision !== 'allow') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const branchId = request.nextUrl.searchParams.get('branchId');
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  try {
  const [
    employeesRes,
    leavePendingRes,
    penaltiesPendingRes,
    loansActiveRes,
    complianceRes,
    recentJoinsRes,
  ] = await Promise.all([
    // All employees with status + department
    (() => {
      let q = supabase.from('employees').select('status, department, designation, joinDate');
      if (branchId) q = q.eq('branch_id', branchId);
      return q;
    })(),

    // Pending leave requests
    (() => {
      let q = supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending');
      if (branchId) q = q.eq('branch_id', branchId);
      return q;
    })(),

    // Pending penalties (HR review)
    supabase.from('penalties').select('*', { count: 'exact', head: true }).eq('status', 'Pending HR Review'),

    // Active loans/advances
    supabase.from('employee_loans').select('*', { count: 'exact', head: true }).eq('status', 'active'),

    // Compliance filings this month
    supabase.from('compliance_filings').select('status, category')
      .gte('created_at', firstOfMonth),

    // Recent joins (this month)
    (() => {
      let q = supabase.from('employees').select('*', { count: 'exact', head: true })
        .gte('joinDate', firstOfMonth.split('T')[0]);
      if (branchId) q = q.eq('branch_id', branchId);
      return q;
    })(),
  ]);

  // Process employee stats
  const employees = employeesRes.data || [];
  const statusCounts: Record<string, number> = {};
  const departmentCounts: Record<string, number> = {};

  for (const emp of employees) {
    const status = (emp.status || 'Unknown').toLowerCase();
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    const dept = emp.department || 'Unassigned';
    departmentCounts[dept] = (departmentCounts[dept] || 0) + 1;
  }

  // Compliance
  const complianceRows = complianceRes.data || [];
  const compliance = {
    total: complianceRows.length,
    completed: complianceRows.filter((c: any) => c.status === 'completed' || c.status === 'filed').length,
    pending: complianceRows.filter((c: any) => c.status === 'pending' || c.status === 'draft').length,
  };

  return NextResponse.json({
    headcount: {
      total: employees.length,
      active: statusCounts['active'] || 0,
      inactive: statusCounts['inactive'] || 0,
      terminated: statusCounts['terminated'] || 0,
      onLeave: statusCounts['on leave'] || 0,
    },
    departments: departmentCounts,
    leavePending: leavePendingRes.count ?? 0,
    penaltiesPending: penaltiesPendingRes.count ?? 0,
    activeLoans: loansActiveRes.count ?? 0,
    newJoinsThisMonth: recentJoinsRes.count ?? 0,
    compliance,
  }, {
    headers: {
      'Cache-Control': 'private, max-age=30',
    },
  });
  } catch (err: any) {
    console.error('[BFF hr-overview] Error:', err.message || err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
