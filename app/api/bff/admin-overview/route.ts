import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerUser, getServerRoles } from '@/lib/auth/server-session';
import { decideAccess } from '@/lib/security/access-decision';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BFF: Admin Dashboard Overview
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Aggregates 11 database queries into a single HTTP response.
 *
 * Before (client-side): 11 parallel requests from browser → Supabase (via internet)
 * After (BFF): 1 request from browser → Next.js API → Supabase (server-to-server, ~1ms)
 *
 * Performance improvement:
 * - Eliminates 10 network roundtrips (each ~50-150ms from browser)
 * - Server-to-Supabase is local (~1-5ms per query on the same VPS)
 * - Total: ~80ms server-side vs ~500-1500ms client-side
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ADMIN_ALLOWED_ROLES = ['admin', 'branch_admin'];

export async function GET(request: NextRequest) {
  // Auth guard — only authenticated ERP admin users
  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roles = await getServerRoles(user.id);
  const decision = decideAccess({
    sessionConfirmed: true,
    resolvedRoles: roles,
    routeAllowedRoles: ADMIN_ALLOWED_ROLES,
  });
  if (decision !== 'allow') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  // Execute ALL queries in parallel — server-to-DB is ~1ms each
  const [
    leadsRes,
    activeStaffRes,
    headcountRes,
    activePostsRes,
    penaltiesOpenRes,
    penaltiesFinancialRes,
    penaltiesMonthRes,
    receivablesRes,
    payablesRes,
    messFundRes,
    leaveRes,
  ] = await Promise.all([
    // Sales: all lead statuses
    supabase.from('leads').select('status'),
    // Operations/HR: active employees
    supabase.from('employees').select('*', { count: 'exact', head: true }).ilike('status', 'active'),
    // HR: total headcount
    supabase.from('employees').select('*', { count: 'exact', head: true }),
    // Operations: active posts
    supabase.from('operational_posts').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    // Penalties: open
    supabase.from('penalties').select('*', { count: 'exact', head: true }).eq('status', 'Pending HR Review'),
    // Penalties: financial
    supabase.from('penalties').select('*', { count: 'exact', head: true }).eq('status', 'Financial Penalty Applied'),
    // Penalties: this month
    supabase.from('penalties').select('*', { count: 'exact', head: true }).gte('created_at', firstOfMonth),
    // Accounts: receivables
    supabase.from('receivables').select('total_amount, status'),
    // Accounts: payables
    supabase.from('payables').select('total_amount, status'),
    // Mess fund pending
    supabase.from('mess_fund_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    // Leave pending
    supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  // ── Derive sales figures ──
  const leadStatuses = (leadsRes.data ?? []).map((r: any) => (r.status || '').toLowerCase().replace(/\s+/g, '_'));
  const leadsTotal = leadStatuses.length;
  const opportunities = leadStatuses.filter((s: string) => s.startsWith('opportunit')).length;
  const activeClients = leadStatuses.filter((s: string) => s === 'client').length;
  const qualified = leadStatuses.filter(
    (s: string) => s.startsWith('qualified') || s.startsWith('opportunit') || s === 'client'
  ).length;
  const conversionRate = leadsTotal > 0 ? Math.round((qualified / leadsTotal) * 100) : 0;

  // ── Derive accounts figures ──
  const recRows = (receivablesRes.data ?? []) as { total_amount: number | null; status: string }[];
  const sum = (rows: typeof recRows, statuses: string[]) =>
    rows.filter((r) => statuses.includes((r.status || '').toLowerCase()))
      .reduce((acc, r) => acc + (Number(r.total_amount) || 0), 0);

  const receivablesOutstanding = sum(recRows, ['pending', 'overdue']);
  const receivablesReceived = sum(recRows, ['received']);
  const receivablesOverdue = recRows.filter((r) => (r.status || '').toLowerCase() === 'overdue').length;
  const collectionBase = receivablesReceived + receivablesOutstanding;
  const collectionRate = collectionBase > 0 ? Math.round((receivablesReceived / collectionBase) * 100) : 0;

  const payRows = (payablesRes.data ?? []) as { total_amount: number | null; status: string }[];
  const payablesOutstanding = sum(payRows, ['pending', 'approved']);
  const payablesPending = payRows.filter((r) => (r.status || '').toLowerCase() === 'pending').length;

  // ── Derive HR figures ──
  const headcountVal = headcountRes.count ?? 0;
  const activeStaffVal = activeStaffRes.count ?? 0;
  const activeRatio = headcountVal > 0 ? Math.round((activeStaffVal / headcountVal) * 100) : 0;

  return NextResponse.json({
    leadsTotal,
    opportunities,
    activeClients,
    conversionRate,
    activePosts: activePostsRes.count ?? 0,
    activeStaff: activeStaffVal,
    penaltiesOpen: penaltiesOpenRes.count ?? 0,
    penaltiesThisMonth: penaltiesMonthRes.count ?? 0,
    receivablesOutstanding,
    receivablesOverdue,
    collectionRate,
    payablesOutstanding,
    payablesPending,
    messFundPending: messFundRes.count ?? 0,
    headcount: headcountVal,
    leavePending: leaveRes.count ?? 0,
    penaltiesFinancial: penaltiesFinancialRes.count ?? 0,
    activeRatio,
  }, {
    headers: {
      // Private — authenticated data must not be cached by shared CDN
      'Cache-Control': 'private, max-age=30',
    },
  });
  } catch (err: any) {
    console.error('[BFF admin-overview] Error:', err.message || err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
