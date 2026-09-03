import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerUser, getServerRoles } from '@/lib/auth/server-session';
import { decideAccess } from '@/lib/security/access-decision';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BFF: Sales Pipeline Stats
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Pre-computed pipeline statistics for the Sales module header:
 * - Total leads / opportunities / clients
 * - Quotation pipeline value
 * - Agreement/contract stats
 * - Conversion funnel percentages
 * - This month's new leads + follow-up compliance
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const SALES_ALLOWED_ROLES = ['sales', 'admin', 'branch_admin'];

export async function GET(request: NextRequest) {
  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roles = await getServerRoles(user.id);
  const decision = decideAccess({
    sessionConfirmed: true,
    resolvedRoles: roles,
    routeAllowedRoles: SALES_ALLOWED_ROLES,
  });
  if (decision !== 'allow') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  // Optional branch filter
  const branchId = request.nextUrl.searchParams.get('branchId');

  try {
  const [leadsRes, quotationsRes, agreementsRes, workOrdersRes, followupsRes] = await Promise.all([
    // Leads with status
    (() => {
      let q = supabase.from('leads').select('status, created_at');
      if (branchId) q = q.eq('branch_id', branchId);
      return q;
    })(),

    // Quotations with value + status
    (() => {
      let q = supabase.from('quotations').select('status, value, created_at');
      if (branchId) q = q.eq('branch_id', branchId);
      return q;
    })(),

    // Agreements
    (() => {
      let q = supabase.from('agreements').select('status, value, created_at');
      if (branchId) q = q.eq('branch_id', branchId);
      return q;
    })(),

    // Work orders
    (() => {
      let q = supabase.from('work_orders').select('status, created_at');
      if (branchId) q = q.eq('branch_id', branchId);
      return q;
    })(),

    // Follow-ups due today/overdue
    (() => {
      const today = new Date().toISOString().split('T')[0];
      let q = supabase.from('followups')
        .select('status, date')
        .lte('date', today)
        .neq('status', 'Completed');
      if (branchId) q = q.eq('branch_id', branchId);
      return q;
    })(),
  ]);

  // Process leads
  const leads = leadsRes.data || [];
  const normalize = (s: string) => (s || '').toLowerCase().replace(/\s+/g, '_');
  const leadStatuses = leads.map((l: any) => normalize(l.status));
  const leadsThisMonth = leads.filter((l: any) => l.created_at >= firstOfMonth).length;

  const pipeline = {
    total: leads.length,
    new: leadStatuses.filter((s: string) => s === 'new' || s === 'new_lead').length,
    contacted: leadStatuses.filter((s: string) => s === 'contacted' || s === 'in_progress').length,
    qualified: leadStatuses.filter((s: string) => s.startsWith('qualified')).length,
    opportunity: leadStatuses.filter((s: string) => s.startsWith('opportunit')).length,
    client: leadStatuses.filter((s: string) => s === 'client').length,
    lost: leadStatuses.filter((s: string) => s === 'lost' || s === 'closed_lost').length,
  };

  // Process quotations
  const quotations = quotationsRes.data || [];
  const quotationStats = {
    total: quotations.length,
    pending: quotations.filter((q: any) => normalize(q.status) === 'pending' || normalize(q.status) === 'sent').length,
    approved: quotations.filter((q: any) => normalize(q.status) === 'approved' || normalize(q.status) === 'accepted').length,
    totalValue: quotations.reduce((sum: number, q: any) => sum + (Number(q.value) || 0), 0),
    pipelineValue: quotations
      .filter((q: any) => ['pending', 'sent'].includes(normalize(q.status)))
      .reduce((sum: number, q: any) => sum + (Number(q.value) || 0), 0),
  };

  // Process agreements
  const agreements = agreementsRes.data || [];
  const agreementStats = {
    total: agreements.length,
    active: agreements.filter((a: any) => normalize(a.status) === 'active' || normalize(a.status) === 'signed').length,
    totalValue: agreements.reduce((sum: number, a: any) => sum + (Number(a.value) || 0), 0),
  };

  // Process work orders
  const workOrders = workOrdersRes.data || [];
  const workOrderStats = {
    total: workOrders.length,
    active: workOrders.filter((w: any) => normalize(w.status) === 'active' || normalize(w.status) === 'in_progress').length,
  };

  // Follow-ups
  const overdueFollowups = (followupsRes.data || []).length;

  // Conversion rate
  const conversionRate = leads.length > 0
    ? Math.round((pipeline.client / leads.length) * 100)
    : 0;

  return NextResponse.json({
    pipeline,
    leadsThisMonth,
    conversionRate,
    quotationStats,
    agreementStats,
    workOrderStats,
    overdueFollowups,
  }, {
    headers: {
      'Cache-Control': 'private, max-age=30',
    },
  });
  } catch (err: any) {
    console.error('[BFF sales-pipeline] Error:', err.message || err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
