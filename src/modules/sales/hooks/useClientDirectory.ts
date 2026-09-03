'use client';

/**
 * useClientDirectory — builds the unified client directory for the Sales ▸ Clients tab.
 *
 * Clients live in the `clients` table, each with a permanent Customer ID, and
 * are enriched from the work they have on the books:
 *   • REGULAR clients have work orders behind them (a work order points at its
 *     customer via `client_id`; the rest of its detail is JSON-packed into the
 *     `description` column).
 *   • OCCASIONAL clients come from one-time invoices (`receivables` with
 *     category = 'Invoices') raised for a "New Customer" — i.e. a billed client
 *     name that has no work order behind it.
 *
 * Everything else in the system keys off the client NAME string (agreements,
 * quotations, leads, follow-ups, operational posts, invoices), so this hook
 * normalises the name into a match key and folds every related record into a
 * single UnifiedClient record — the 360° view.
 *
 * Since the `clients` table was introduced, a client IS a durable record with a
 * permanent Customer ID, and it seeds the directory. Work orders are matched on
 * `client_id` first; the name fallback stays so records raised before Customer
 * IDs existed (or not yet backfilled) never drop out of the directory.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';
import { useWorkOrdersData } from '@/contexts/WorkOrdersDataContext';
import { useAgreementsData } from '@/contexts/AgreementsDataContext';
import { useQuotationsData } from '@/contexts/QuotationsDataContext';
import { useLeadsData } from '@/contexts/LeadsDataContext';
import { useFollowupsData } from '@/contexts/FollowupsDataContext';
import { getOperationalPosts } from '@/services/supabase/OperationalPostService';
import type { OperationalPost } from '@/services/supabase/OperationalPostService';
import { getClients, type Client } from '@/services/supabase/ClientService';
import { clientKeyOf } from '@/utils/clientKey';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClientType = 'regular' | 'occasional';

export interface ClientInvoice {
  id: string;
  ref: string;
  description: string;
  total: number;
  outstanding: number;
  status: string;
  dueDate: string | null;
  createdAt: string | null;
  lineItems: any[];
}

export interface AgingBuckets {
  d30: number;
  d60: number;
  d90: number;
  d90plus: number;
}

export interface UnifiedClient {
  /** Normalised match key (also used as React key). */
  key: string;
  /** Permanent Customer ID (SF<seq>-YYMMDD, e.g. SF01-260801). Blank until the client is backfilled. */
  customerId: string;
  /** clients.id — what work_orders.client_id points at. */
  clientId: string;
  name: string;
  companyName: string;
  type: ClientType;
  /** Active | Onboarding | Inactive | Terminated | Repeat | One-time */
  status: string;

  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;

  since: Date | null;
  lastActivity: Date | null;

  /** Sum of live work order values (monthly contract value). */
  monthlyValue: number;
  /** Sum of every work order value ever raised. */
  contractValue: number;
  lifetimeBilled: number;
  collected: number;
  outstanding: number;
  aging: AgingBuckets;

  /** Nearest upcoming contract end across live work orders. */
  contractEnd: Date | null;
  daysToExpiry: number | null;
  isExpiring: boolean;
  isExpired: boolean;

  workOrders: any[];
  liveWorkOrders: any[];
  agreements: any[];
  quotations: any[];
  leads: any[];
  followups: any[];
  invoices: ClientInvoice[];
  posts: OperationalPost[];

  postCount: number;
  guardCount: number;
  openFollowups: number;
  /** Lead source, when the client can be traced back to a lead. */
  source: string;
  assignedTo: string;
}

export interface ClientDirectoryTotals {
  total: number;
  regular: number;
  occasional: number;
  active: number;
  monthlyValue: number;
  outstanding: number;
  expiring: number;
  guards: number;
  posts: number;
}

// ─── Matching helpers ─────────────────────────────────────────────────────────

/**
 * Name normalisation now lives in `@/utils/clientKey` so the server-side
 * customer backfill can use the exact same rules. Re-exported here to keep the
 * existing import surface intact.
 */
export { clientKeyOf };

const parseAmount = (value: any): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = parseFloat(String(value ?? '0').replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const toDate = (value: any): Date | null => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const maxDate = (a: Date | null, b: Date | null): Date | null => {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
};

const minDate = (a: Date | null, b: Date | null): Date | null => {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
};

/** Work order statuses that mean "this contract is live / earning". */
const LIVE_WO_STATUS = new Set(['Active', 'In Progress', 'Completed', 'Scheduled']);
/** Statuses that mean the relationship for that work order has ended. */
const DEAD_WO_STATUS = new Set(['Terminated', 'Cancelled', 'Termination Initiated']);
/** Statuses that mean the paperwork is still in flight. */
const ONBOARDING_WO_STATUS = new Set(['Draft', 'Pending', 'On Hold']);

const UNPAID_INVOICE_STATUS = new Set(['pending', 'overdue', 'partially_paid']);

/** Partial payments are recorded in `notes` as "Balance: ₹X" — honour it. */
const invoiceOutstanding = (row: any): number => {
  const status = String(row.status || '').toLowerCase();
  if (!UNPAID_INVOICE_STATUS.has(status)) return 0;
  const balanceMatch = String(row.notes || '').match(/Balance:\s*₹?([\d,]+(?:\.\d+)?)/);
  if (balanceMatch) return Math.max(0, parseAmount(balanceMatch[1]));
  return Math.max(0, parseAmount(row.total_amount));
};

const extractFromNotes = (notes: string, pattern: RegExp): string => {
  const m = String(notes || '').match(pattern);
  return m ? m[1].trim() : '';
};

const emptyAging = (): AgingBuckets => ({ d30: 0, d60: 0, d90: 0, d90plus: 0 });

const addToAging = (aging: AgingBuckets, amount: number, reference: Date | null) => {
  if (amount <= 0) return;
  const days = reference ? Math.floor((Date.now() - reference.getTime()) / 86400000) : 0;
  if (days <= 30) aging.d30 += amount;
  else if (days <= 60) aging.d60 += amount;
  else if (days <= 90) aging.d90 += amount;
  else aging.d90plus += amount;
};

// ─── Draft record used while folding ──────────────────────────────────────────

const blankClient = (name: string, key: string, type: ClientType): UnifiedClient => ({
  key,
  customerId: '',
  clientId: '',
  name,
  companyName: '',
  type,
  status: type === 'regular' ? 'Inactive' : 'One-time',
  contactPerson: '',
  contactEmail: '',
  contactPhone: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  gstin: '',
  since: null,
  lastActivity: null,
  monthlyValue: 0,
  contractValue: 0,
  lifetimeBilled: 0,
  collected: 0,
  outstanding: 0,
  aging: emptyAging(),
  contractEnd: null,
  daysToExpiry: null,
  isExpiring: false,
  isExpired: false,
  workOrders: [],
  liveWorkOrders: [],
  agreements: [],
  quotations: [],
  leads: [],
  followups: [],
  invoices: [],
  posts: [],
  postCount: 0,
  guardCount: 0,
  openFollowups: 0,
  source: '',
  assignedTo: '',
});

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useClientDirectory() {
  const { workOrders, isLoading: woLoading } = useWorkOrdersData();
  const { agreements } = useAgreementsData();
  const { quotations } = useQuotationsData();
  const { leads } = useLeadsData();
  const { followups } = useFollowupsData();

  // One-time invoices live in `receivables`; there is no `invoices` table.
  const { data: invoiceRows = [], isLoading: invoicesLoading } = useQuery<any[]>({
    queryKey: ['client_directory_invoices'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('receivables')
        .select('id, client_name, description, reference_number, amount, gst_amount, total_amount, status, due_date, notes, line_items, created_at')
        .eq('category', 'Invoices')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('[useClientDirectory] invoices:', error.message);
        return [];
      }
      return data ?? [];
    },
    staleTime: 60_000,
  });

  // Deployed posts give the true guard footprint per client.
  const { data: postRows = [], isLoading: postsLoading } = useQuery<OperationalPost[]>({
    queryKey: ['client_directory_posts'],
    queryFn: async () => {
      const result = await getOperationalPosts();
      return result.success ? result.data : [];
    },
    staleTime: 60_000,
  });

  // The customer master. This is the only durable client identity in the system;
  // everything else still carries the client NAME, so records are matched on
  // client_id where available and fall back to the normalised name.
  const { data: clientRows = [], isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ['client_directory_customers'],
    queryFn: async () => {
      const result = await getClients();
      return result.success ? result.data : [];
    },
    staleTime: 60_000,
  });

  const { clients, regular, occasional, totals } = useMemo(() => {
    const byKey = new Map<string, UnifiedClient>();
    /** alias key → canonical key (client name AND company name both resolve). */
    const aliases = new Map<string, string>();

    const register = (client: UnifiedClient, ...names: (string | undefined | null)[]) => {
      byKey.set(client.key, client);
      for (const n of names) {
        const k = clientKeyOf(n);
        if (k && !aliases.has(k)) aliases.set(k, client.key);
      }
    };

    const resolve = (...names: (string | undefined | null)[]): UnifiedClient | undefined => {
      for (const n of names) {
        const k = clientKeyOf(n);
        if (!k) continue;
        const canonical = aliases.get(k) ?? (byKey.has(k) ? k : undefined);
        if (canonical) return byKey.get(canonical);
      }
      return undefined;
    };

    // ── 0. The customer master seeds the directory ───────────────────────────
    // Seeding first means a customer appears with its Customer ID even before
    // any work order or invoice exists, and gives work orders something to
    // match against by client_id rather than by name.
    const byClientId = new Map<string, UnifiedClient>();

    for (const row of clientRows) {
      const key = row.nameKey || clientKeyOf(row.name);
      if (!key) continue;

      const client = blankClient(row.name, key, row.clientType);
      client.customerId = row.customerId;
      client.clientId = row.id;
      client.companyName = row.companyName || '';
      client.contactPerson = row.contactPerson || '';
      client.contactEmail = row.contactEmail || '';
      client.contactPhone = row.contactPhone || '';
      client.address = row.address || '';
      client.city = row.city || '';
      client.state = row.state || '';
      client.pincode = row.pincode || '';
      client.gstin = row.gstin || '';
      client.since = toDate(row.createdAt);

      register(client, row.name, row.companyName);
      byClientId.set(row.id, client);
    }

    // ── 1. REGULAR clients — work orders, matched by customer then by name ───
    for (const wo of workOrders as any[]) {
      const displayName = (wo.clientName || wo.companyName || '').trim();
      const key = clientKeyOf(displayName);

      // client_id is authoritative; the name is the fallback for rows raised
      // before Customer IDs existed (or not yet backfilled).
      let client = (wo.clientId && byClientId.get(wo.clientId))
        || (key ? byKey.get(aliases.get(key) ?? key) : undefined);

      if (!client) {
        if (!displayName || !key) continue;
        client = blankClient(displayName, key, 'regular');
        client.customerId = wo.customerId || '';
        register(client, displayName, wo.companyName);
      } else if (!client.customerId && wo.customerId) {
        client.customerId = wo.customerId;
      }

      // A customer that was only ever billed now has contracted work
      if (client.type !== 'regular') client.type = 'regular';

      client.workOrders.push(wo);
      client.companyName = client.companyName || wo.companyName || '';
      client.contactPerson = client.contactPerson || wo.contactPerson || '';
      client.contactEmail = client.contactEmail || wo.contactEmail || '';
      client.contactPhone = client.contactPhone || wo.contactPhone || '';
      client.address = client.address || wo.address || '';
      client.city = client.city || wo.city || '';
      client.state = client.state || wo.state || '';
      client.pincode = client.pincode || wo.pincode || '';
      client.gstin = client.gstin || wo.clientGst || '';

      const value = parseAmount(wo.value);
      client.contractValue += value;

      const start = toDate(wo.startDate) || toDate(wo.createdAt);
      client.since = minDate(client.since, start);
      client.lastActivity = maxDate(client.lastActivity, toDate(wo.updatedAt) || toDate(wo.createdAt));

      if (LIVE_WO_STATUS.has(wo.status)) {
        client.liveWorkOrders.push(wo);
        client.monthlyValue += value;
        const end = toDate(wo.endDate);
        if (end) client.contractEnd = minDate(client.contractEnd, end);
      }
    }

    // Lifecycle status for regular clients
    for (const client of byKey.values()) {
      if (client.type !== 'regular') continue;
      if (client.liveWorkOrders.length > 0) client.status = 'Active';
      else if (client.workOrders.some((wo) => ONBOARDING_WO_STATUS.has(wo.status))) client.status = 'Onboarding';
      else if (client.workOrders.some((wo) => DEAD_WO_STATUS.has(wo.status))) client.status = 'Terminated';
      else client.status = 'Inactive';

      if (client.contractEnd) {
        const days = Math.ceil((client.contractEnd.getTime() - Date.now()) / 86400000);
        client.daysToExpiry = days;
        client.isExpired = days < 0;
        client.isExpiring = days >= 0 && days <= 30;
      }
    }

    // ── 2. Invoices — attach to regular, or create OCCASIONAL clients ───────
    for (const row of invoiceRows) {
      const billedName = (row.client_name || '').trim();
      if (!billedName) continue;

      let client = resolve(billedName);
      if (!client) {
        const key = clientKeyOf(billedName);
        if (!key) continue;
        client = blankClient(billedName, key, 'occasional');
        register(client, billedName);
      }

      const total = parseAmount(row.total_amount);
      const outstanding = invoiceOutstanding(row);
      const created = toDate(row.created_at);

      client.invoices.push({
        id: row.id,
        ref: row.reference_number || '—',
        description: row.description || '',
        total,
        outstanding,
        status: row.status || 'pending',
        dueDate: row.due_date ?? null,
        createdAt: row.created_at ?? null,
        lineItems: Array.isArray(row.line_items) ? row.line_items : [],
      });

      client.lifetimeBilled += total;
      client.outstanding += outstanding;
      addToAging(client.aging, outstanding, toDate(row.due_date) || created);
      client.since = minDate(client.since, created);
      client.lastActivity = maxDate(client.lastActivity, created);

      if (client.type === 'occasional') {
        if (!client.gstin) client.gstin = extractFromNotes(row.notes, /(?:Client )?GSTIN:\s*([^\s|]+)/);
        if (!client.address) client.address = extractFromNotes(row.notes, /(?:Client )?(?:Address|Addr):\s*([^|]+)/);
      }
    }

    // Occasional lifecycle: repeat buyer vs single purchase
    for (const client of byKey.values()) {
      if (client.type !== 'occasional') continue;
      client.status = client.invoices.length > 1 ? 'Repeat' : 'One-time';
    }

    // Collected is derived so it always reconciles with billed − outstanding.
    for (const client of byKey.values()) {
      client.collected = Math.max(0, client.lifetimeBilled - client.outstanding);
    }

    // ── 3. Fold in every other related record ──────────────────────────────
    for (const agreement of agreements as any[]) {
      const client = resolve(agreement.clientName, agreement.companyName);
      if (!client) continue;
      client.agreements.push(agreement);
      client.lastActivity = maxDate(client.lastActivity, toDate(agreement.createdAt));
    }

    for (const quotation of quotations as any[]) {
      const client = resolve(quotation.client, quotation.companyName);
      if (!client) continue;
      client.quotations.push(quotation);
      client.lastActivity = maxDate(client.lastActivity, toDate(quotation.createdAt));
    }

    for (const lead of leads as any[]) {
      const client = resolve(lead.companyName, lead.name);
      if (!client) continue;
      client.leads.push(lead);
      client.source = client.source || lead.source || '';
      client.assignedTo = client.assignedTo || lead.assignedTo || '';
      client.contactEmail = client.contactEmail || lead.email || '';
      client.contactPhone = client.contactPhone || lead.phone || '';
      client.since = minDate(client.since, toDate(lead.createdAt));
    }

    for (const followup of followups as any[]) {
      const client = resolve(followup.company, followup.contact);
      if (!client) continue;
      client.followups.push(followup);
      if (followup.status === 'Pending' || followup.status === 'Overdue' || followup.status === 'Scheduled') {
        client.openFollowups += 1;
      }
    }

    for (const post of postRows) {
      const client = resolve(post.clientName);
      if (!client) continue;
      client.posts.push(post);
    }

    // ── 4. Derived footprint + sort inner collections newest-first ──────────
    for (const client of byKey.values()) {
      if (client.posts.length) {
        client.postCount = client.posts.length;
        client.guardCount = client.posts.reduce((s, p) => s + (Number(p.totalGuards) || 0), 0);
      } else {
        const woPosts = client.liveWorkOrders.length ? client.liveWorkOrders : client.workOrders;
        const flattened = woPosts.flatMap((wo: any) => wo.posts || wo.locations || []);
        client.postCount = flattened.length;
        client.guardCount = flattened.reduce(
          (s: number, p: any) => s + (Number(p.totalGuards ?? p.guards) || 0),
          0,
        );
      }

      client.companyName = client.companyName || client.name;
      client.workOrders.sort(
        (a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0),
      );
      client.invoices.sort(
        (a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0),
      );
      client.quotations.sort(
        (a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0),
      );
      client.agreements.sort(
        (a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0),
      );
      client.followups.sort(
        (a, b) => (toDate(b.dateTime)?.getTime() || 0) - (toDate(a.dateTime)?.getTime() || 0),
      );
    }

    const all = Array.from(byKey.values());
    const regularList = all.filter((c) => c.type === 'regular');
    const occasionalList = all.filter((c) => c.type === 'occasional');

    const directoryTotals: ClientDirectoryTotals = {
      total: all.length,
      regular: regularList.length,
      occasional: occasionalList.length,
      active: all.filter((c) => c.status === 'Active').length,
      monthlyValue: regularList.reduce((s, c) => s + c.monthlyValue, 0),
      outstanding: all.reduce((s, c) => s + c.outstanding, 0),
      expiring: regularList.filter((c) => c.isExpiring || c.isExpired).length,
      guards: all.reduce((s, c) => s + c.guardCount, 0),
      posts: all.reduce((s, c) => s + c.postCount, 0),
    };

    return {
      clients: all,
      regular: regularList,
      occasional: occasionalList,
      totals: directoryTotals,
    };
  }, [workOrders, agreements, quotations, leads, followups, invoiceRows, postRows, clientRows]);

  return {
    clients,
    regularClients: regular,
    occasionalClients: occasional,
    totals,
    isLoading: woLoading || invoicesLoading || postsLoading || clientsLoading,
  };
}
