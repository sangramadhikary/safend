import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { clientKeyOf } from '@/utils/clientKey';

/**
 * POST /api/admin/backfill-customers
 *
 * One-time migration endpoint that gives every existing client a Customer ID.
 *
 * Before the `clients` table existed, a client was only a name string repeated
 * across work orders and invoices. This route reconstructs the customer master
 * from that history:
 *
 *   1. Group every work order and one-time invoice by normalised client name
 *      (the same `clientKeyOf` rules the app uses, so groups match what the
 *      Clients tab already shows).
 *   2. Create a `clients` row per group, ordered by first activity, so Customer
 *      IDs read in the order clients were won.
 *   3. Point each work order at its customer (`work_orders.client_id`) and
 *      mirror the Customer ID into its description JSON.
 *
 * Safe to run more than once: clients that already exist are reused, and work
 * orders that are already linked are skipped.
 *
 * Authentication: admin / branch_admin, via Authorization: Bearer <token>.
 *
 * Query params:
 *  - dry_run=true  -> report what would change, write nothing
 *
 * Prerequisite: supabase/migrations/20260731000000_create_clients_customer_ids.sql
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface ClientGroup {
  nameKey: string;
  /** Best display name seen for this client */
  name: string;
  companyName: string;
  hasWorkOrders: boolean;
  firstActivity: number;
  workOrderIds: string[];
  profile: {
    gstin?: string;
    contact_person?: string;
    contact_email?: string;
    contact_phone?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
}

const parseDescription = (description: string | null): Record<string, any> | null => {
  if (!description) return null;
  try {
    const parsed = JSON.parse(description);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    // Plain-text description (legacy) — left untouched
    return null;
  }
};

const timeOf = (...values: (string | null | undefined)[]): number => {
  for (const value of values) {
    if (!value) continue;
    const t = new Date(value).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return Number.MAX_SAFE_INTEGER;
};

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || !['admin', 'branch_admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 });
  }

  const dryRun = new URL(request.url).searchParams.get('dry_run') === 'true';

  try {
    // ── Gather the history ───────────────────────────────────────────────────
    const { data: workOrders, error: woError } = await supabase
      .from('work_orders')
      .select('id, work_order_id, client_id, description, created_at, start_date')
      .order('created_at', { ascending: true });

    if (woError) {
      return NextResponse.json({ error: `work_orders: ${woError.message}` }, { status: 500 });
    }

    const { data: invoices, error: invError } = await supabase
      .from('receivables')
      .select('id, client_name, notes, created_at')
      .eq('category', 'Invoices')
      .order('created_at', { ascending: true });

    if (invError) {
      return NextResponse.json({ error: `receivables: ${invError.message}` }, { status: 500 });
    }

    const { data: existingClients, error: clientsError } = await supabase
      .from('clients')
      .select('id, customer_id, name_key, client_type');

    if (clientsError) {
      return NextResponse.json(
        {
          error: `clients: ${clientsError.message}. Apply ` +
            'supabase/migrations/20260731000000_create_clients_customer_ids.sql first.',
        },
        { status: 500 }
      );
    }

    const clientsByKey = new Map<string, { id: string; customer_id: string; client_type: string }>();
    for (const row of existingClients || []) {
      clientsByKey.set(row.name_key, {
        id: row.id,
        customer_id: row.customer_id,
        client_type: row.client_type,
      });
    }

    // ── Group by normalised client name ──────────────────────────────────────
    const groups = new Map<string, ClientGroup>();

    const groupFor = (rawName: string, activity: number): ClientGroup | null => {
      const name = (rawName || '').trim();
      const nameKey = clientKeyOf(name);
      if (!nameKey) return null;

      let group = groups.get(nameKey);
      if (!group) {
        group = {
          nameKey,
          name,
          companyName: '',
          hasWorkOrders: false,
          firstActivity: activity,
          workOrderIds: [],
          profile: {},
        };
        groups.set(nameKey, group);
      }
      group.firstActivity = Math.min(group.firstActivity, activity);
      return group;
    };

    for (const wo of workOrders || []) {
      const d = parseDescription(wo.description) || {};
      const name = String(d.clientName || d.companyName || '').trim();
      const group = groupFor(name, timeOf(wo.start_date, wo.created_at));
      if (!group) continue;

      group.hasWorkOrders = true;
      group.workOrderIds.push(wo.id);
      group.companyName = group.companyName || String(d.companyName || '');

      // First non-empty value wins, matching how the directory enriches a client
      const put = (column: keyof ClientGroup['profile'], value: any) => {
        const v = String(value ?? '').trim();
        if (v && !group.profile[column]) group.profile[column] = v;
      };
      put('gstin', d.clientGst);
      put('contact_person', d.contactPerson);
      put('contact_email', d.contactEmail);
      put('contact_phone', d.contactPhone);
      put('address', d.address);
      put('city', d.city);
      put('state', d.state);
      put('pincode', d.pincode);
    }

    for (const invoice of invoices || []) {
      groupFor(String(invoice.client_name || ''), timeOf(invoice.created_at));
    }

    // Oldest first, so Customer IDs are handed out in the order clients arrived
    const ordered = Array.from(groups.values()).sort((a, b) => a.firstActivity - b.firstActivity);

    const toCreate = ordered.filter(g => !clientsByKey.has(g.nameKey));

    // Work orders needing a link (no client_id, or no customerId in their JSON)
    const workOrdersToLink = (workOrders || []).filter(wo => {
      const d = parseDescription(wo.description);
      return !wo.client_id || !d?.customerId;
    });

    if (dryRun) {
      return NextResponse.json({
        message: 'Dry run - no changes made',
        workOrders: (workOrders || []).length,
        invoices: (invoices || []).length,
        clientsFound: ordered.length,
        clientsExisting: ordered.length - toCreate.length,
        clientsToCreate: toCreate.length,
        workOrdersToLink: workOrdersToLink.length,
        preview: toCreate.slice(0, 50).map(g => ({
          name: g.name,
          nameKey: g.nameKey,
          type: g.hasWorkOrders ? 'regular' : 'occasional',
          workOrders: g.workOrderIds.length,
          firstActivity: g.firstActivity === Number.MAX_SAFE_INTEGER
            ? null
            : new Date(g.firstActivity).toISOString().split('T')[0],
        })),
      });
    }

    // ── Create the missing customers ─────────────────────────────────────────
    const errors: Array<{ client?: string; workOrder?: string; error: string }> = [];
    let created = 0;

    for (const group of toCreate) {
      const { data, error } = await supabase
        .from('clients')
        .insert({
          name: group.name,
          name_key: group.nameKey,
          company_name: group.companyName || group.name,
          client_type: group.hasWorkOrders ? 'regular' : 'occasional',
          created_by: 'customer-backfill',
          ...group.profile,
        })
        .select('id, customer_id, client_type')
        .single();

      if (error || !data) {
        errors.push({ client: group.name, error: error?.message || 'insert failed' });
        continue;
      }

      clientsByKey.set(group.nameKey, {
        id: data.id,
        customer_id: data.customer_id,
        client_type: data.client_type,
      });
      created++;
    }

    // A client that was billed before it was contracted is a regular client now
    for (const group of ordered) {
      const client = clientsByKey.get(group.nameKey);
      if (!client || !group.hasWorkOrders || client.client_type === 'regular') continue;

      const { error } = await supabase
        .from('clients')
        .update({ client_type: 'regular' })
        .eq('id', client.id);
      if (error) errors.push({ client: group.name, error: error.message });
      else client.client_type = 'regular';
    }

    // ── Link the work orders ─────────────────────────────────────────────────
    let linked = 0;

    for (const wo of workOrdersToLink) {
      const d = parseDescription(wo.description);
      const name = String(d?.clientName || d?.companyName || '').trim();
      const client = clientsByKey.get(clientKeyOf(name));
      if (!client) continue;

      const updates: Record<string, any> = { client_id: client.id };
      // Only rewrite JSON descriptions; plain-text ones are left as they are
      if (d) updates.description = JSON.stringify({ ...d, customerId: client.customer_id });

      const { error } = await supabase.from('work_orders').update(updates).eq('id', wo.id);
      if (error) errors.push({ workOrder: wo.work_order_id || wo.id, error: error.message });
      else linked++;
    }

    return NextResponse.json({
      message: 'Backfill complete',
      clientsFound: ordered.length,
      clientsCreated: created,
      workOrdersLinked: linked,
      workOrdersSkipped: (workOrders || []).length - linked,
      errors: errors.length > 0 ? errors.slice(0, 25) : undefined,
      sample: ordered.slice(0, 10).map(g => ({
        name: g.name,
        customerId: clientsByKey.get(g.nameKey)?.customer_id || null,
        workOrders: g.workOrderIds.length,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Backfill failed: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
