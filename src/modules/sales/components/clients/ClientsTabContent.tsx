'use client';

/**
 * ClientsTabContent — Sales ▸ Clients.
 *
 * Read-only directory (no create button by design): every client here is
 * auto-derived from work already recorded in the system.
 *   • Regular Clients    ← auto-created from work orders
 *   • Occasional Clients ← auto-created from one-time invoices raised for new customers
 *
 * Selecting a client opens the unified 360° profile.
 */

import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TablePagination } from '@/components/ui/table-pagination';
import { BrandLoader } from '@/components/ui/brand-loader';
import {
  Building2,
  Repeat,
  Receipt,
  Users,
  AlertTriangle,
  CalendarClock,
  TrendingUp,
  SearchX,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useClientDirectory, type UnifiedClient } from '../../hooks/useClientDirectory';
import { ClientsTable } from './ClientsTable';
import { Client360 } from './Client360';
import { formatINRCompact } from './clientFormat';

interface ClientsTabContentProps {
  activeFilter: string;
  searchTerm: string;
}

type SortKey = 'value' | 'outstanding' | 'name' | 'recent';

const SORT_LABELS: Record<SortKey, string> = {
  value: 'Highest value',
  outstanding: 'Highest dues',
  recent: 'Recent activity',
  name: 'Name (A–Z)',
};

/** Days considered "still engaged" for an occasional client. */
const OCCASIONAL_ACTIVE_WINDOW_DAYS = 90;

const matchesSearch = (client: UnifiedClient, term: string): boolean => {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return [
    client.name,
    client.customerId,
    client.companyName,
    client.contactPerson,
    client.contactPhone,
    client.contactEmail,
    client.city,
    client.gstin,
    ...client.workOrders.map((wo: any) => wo.workOrderId || ''),
    ...client.invoices.map((inv) => inv.ref),
  ]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(q));
};

const matchesFilter = (client: UnifiedClient, filter: string): boolean => {
  switch (filter) {
    case 'Active':
      if (client.type === 'regular') return client.status === 'Active';
      if (!client.lastActivity) return false;
      return (
        (Date.now() - client.lastActivity.getTime()) / 86400000 <= OCCASIONAL_ACTIVE_WINDOW_DAYS
      );
    case 'Expiring Soon':
      return client.isExpiring || client.isExpired;
    case 'Dues Pending':
      return client.outstanding > 0;
    case 'Inactive':
      if (client.type === 'regular')
        return client.status === 'Inactive' || client.status === 'Terminated';
      if (!client.lastActivity) return true;
      return (
        (Date.now() - client.lastActivity.getTime()) / 86400000 > OCCASIONAL_ACTIVE_WINDOW_DAYS
      );
    default:
      return true;
  }
};

const sortClients = (list: UnifiedClient[], key: SortKey, type: 'regular' | 'occasional') => {
  const sorted = [...list];
  switch (key) {
    case 'outstanding':
      return sorted.sort((a, b) => b.outstanding - a.outstanding);
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'recent':
      return sorted.sort(
        (a, b) => (b.lastActivity?.getTime() || 0) - (a.lastActivity?.getTime() || 0),
      );
    default:
      return sorted.sort((a, b) =>
        type === 'regular' ? b.monthlyValue - a.monthlyValue : b.lifetimeBilled - a.lifetimeBilled,
      );
  }
};

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  accent: string;
  highlight?: boolean;
}) {
  return (
    <Card
      className={cn(
        'p-4 transition-shadow hover:shadow-md border-t-4',
        accent,
        highlight && 'bg-amber-50/50 dark:bg-amber-900/10',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</p>
          <p className="mt-1 truncate text-2xl font-bold">{value}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>
        </div>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground/60" />
      </div>
    </Card>
  );
}

// ─── Per-sub-tab list ─────────────────────────────────────────────────────────

function ClientListPanel({
  clients,
  type,
  sortKey,
  searchTerm,
  activeFilter,
  onOpen,
}: {
  clients: UnifiedClient[];
  type: 'regular' | 'occasional';
  sortKey: SortKey;
  searchTerm: string;
  activeFilter: string;
  onOpen: (client: UnifiedClient) => void;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const filtered = useMemo(() => {
    const result = clients.filter(
      (c) => matchesFilter(c, activeFilter) && matchesSearch(c, searchTerm),
    );
    return sortClients(result, sortKey, type);
  }, [clients, activeFilter, searchTerm, sortKey, type]);

  // Reset to page 1 whenever the filtered set changes
  const prevFilterKey = React.useRef('');
  const filterKey = `${activeFilter}|${searchTerm}|${sortKey}`;
  if (prevFilterKey.current !== filterKey) {
    prevFilterKey.current = filterKey;
    if (currentPage !== 1) setCurrentPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          {type === 'regular' ? (
            <Building2 className="h-5 w-5 text-muted-foreground" />
          ) : (
            <Receipt className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div>
          <p className="font-medium">
            No {type === 'regular' ? 'regular' : 'occasional'} clients yet
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {type === 'regular'
              ? 'Regular clients appear here automatically as soon as a work order is raised in Contracts.'
              : 'Occasional clients appear here automatically when a one-time invoice is raised for a new customer in Accounts.'}
          </p>
        </div>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <SearchX className="h-8 w-8 text-muted-foreground/50" />
        <div>
          <p className="font-medium">No clients match your view</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Adjust the search term or active filter.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ClientsTable clients={visible} variant={type} onOpen={onOpen} />

      {filtered.length > pageSize && (
        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
        />
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ClientsTabContent({ activeFilter, searchTerm }: ClientsTabContentProps) {
  const { regularClients, occasionalClients, totals, isLoading } = useClientDirectory();
  const [activeSubTab, setActiveSubTab] = useState<'regular' | 'occasional'>('regular');
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [selected, setSelected] = useState<UnifiedClient | null>(null);

  const liveSelected = useMemo(() => {
    if (!selected) return null;
    return (
      [...regularClients, ...occasionalClients].find((c) => c.key === selected.key) ?? selected
    );
  }, [selected, regularClients, occasionalClients]);

  if (isLoading) {
    return (
      <div className="flex h-[360px] items-center justify-center">
        <BrandLoader size="md" message="Building client directory..." />
      </div>
    );
  }

  if (liveSelected) {
    return <Client360 client={liveSelected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-red-100 bg-linear-to-r from-red-50 to-gray-50 p-6 dark:border-red-800/30 dark:from-red-900/20 dark:to-gray-900/20">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="mb-1 text-lg font-medium">Client Directory</h3>
            <p className="text-sm text-muted-foreground">
              One place for everything about a client — contracts, deployment, billing and
              activity. Records here are created automatically: <strong>Regular</strong> from work
              orders, <strong>Occasional</strong> from one-time invoices.
            </p>
          </div>
          {totals.outstanding > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-100 px-4 py-2 dark:border-red-800/40 dark:bg-red-900/30">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div className="leading-tight">
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                  {formatINRCompact(totals.outstanding)} outstanding
                </p>
                <p className="text-[11px] text-red-600/80 dark:text-red-400/70">across all clients</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Total Clients"
          value={String(totals.total)}
          sub={`${totals.regular} regular · ${totals.occasional} occasional`}
          icon={Building2}
          accent="border-t-red-500"
        />
        <StatCard
          label="Active"
          value={String(totals.active)}
          sub="With live work orders"
          icon={TrendingUp}
          accent="border-t-emerald-500"
        />
        <StatCard
          label="Monthly Recurring"
          value={formatINRCompact(totals.monthlyValue)}
          sub="From live work orders"
          icon={Repeat}
          accent="border-t-indigo-500"
        />
        <StatCard
          label="Deployment"
          value={String(totals.guards)}
          sub={`Guards across ${totals.posts} posts`}
          icon={Users}
          accent="border-t-blue-500"
        />
        <StatCard
          label="Renewals Due"
          value={String(totals.expiring)}
          sub="Contracts within 30 days"
          icon={CalendarClock}
          accent={totals.expiring > 0 ? 'border-t-amber-500' : 'border-t-gray-300'}
          highlight={totals.expiring > 0}
        />
      </div>

      {/* Sub-tabs + sort control */}
      <Tabs
        value={activeSubTab}
        onValueChange={(v) => setActiveSubTab(v as 'regular' | 'occasional')}
        className="w-full"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="grid w-full grid-cols-2 lg:w-[420px]">
            <TabsTrigger value="regular" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Regular Clients
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {regularClients.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="occasional" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Occasional Clients
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {occasionalClients.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {SORT_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="regular" className="mt-4 space-y-4">
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Auto-created from work orders. Contract value, deployment and dues roll up across every
            work order raised for the client.
          </p>
          <ClientListPanel
            clients={regularClients}
            type="regular"
            sortKey={sortKey}
            searchTerm={searchTerm}
            activeFilter={activeFilter}
            onOpen={setSelected}
          />
        </TabsContent>

        <TabsContent value="occasional" className="mt-4 space-y-4">
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Auto-created from one-time invoices raised for new customers — no standing work order
            behind them yet.
          </p>
          <ClientListPanel
            clients={occasionalClients}
            type="occasional"
            sortKey={sortKey}
            searchTerm={searchTerm}
            activeFilter={activeFilter}
            onOpen={setSelected}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
