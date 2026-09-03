'use client';

/**
 * Client360 — the unified "everything about this client in one place" view.
 * Purely read-only: it aggregates records that already exist elsewhere in the
 * ERP (work orders, agreements, quotations, invoices, deployed posts, activity)
 * so sales never has to hop between tabs to understand a relationship.
 */

import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Building2,
  User,
  ClipboardList,
  FileSignature,
  FileText,
  Receipt,
  Shield,
  Activity,
  Users,
  CalendarClock,
  AlertTriangle,
  Hash,
  Info,
  TrendingUp,
  Wallet,
  ExternalLink,
} from 'lucide-react';
import { IndianRupee } from '@/components/icons/IndianRupee';
import { cn } from '@/lib/utils';
import type { UnifiedClient } from '../../hooks/useClientDirectory';
import { CallClientModal } from '../CallClientModal';
import { EmailClientModal } from '../EmailClientModal';
import { WorkOrderDetailModal } from '../WorkOrderDetailModal';
import {
  avatarGradient,
  clientStatusStyle,
  docStatusClass,
  formatDate,
  formatINR,
  formatINRCompact,
  formatMonthYear,
  formatRelative,
  initialsOf,
  prettyStatus,
} from './clientFormat';

interface Client360Props {
  client: UnifiedClient;
  onBack: () => void;
}

// ─── Small building blocks ────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  tone?: 'default' | 'danger' | 'success' | 'warning';
}) {
  const toneRing = {
    default: 'text-gray-500 bg-gray-100 dark:bg-gray-800',
    danger: 'text-red-600 bg-red-100 dark:bg-red-900/30',
    success: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
    warning: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
  }[tone];

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', toneRing)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-0.5 truncate text-xl font-bold leading-tight">{value}</p>
          {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="wrap-break-word text-sm">{value?.trim() ? value : '—'}</p>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
      <Icon className="h-7 w-7 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-safend-red" />
          {title}
        </h4>
        {action}
      </div>
      {children}
    </Card>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

interface TimelineEvent {
  at: Date;
  kind: string;
  title: string;
  detail: string;
  icon: React.ElementType;
  tone: string;
}

const buildTimeline = (client: UnifiedClient): TimelineEvent[] => {
  const events: TimelineEvent[] = [];
  const push = (
    value: any,
    kind: string,
    title: string,
    detail: string,
    icon: React.ElementType,
    tone: string,
  ) => {
    if (!value) return;
    const at = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(at.getTime())) return;
    events.push({ at, kind, title, detail, icon, tone });
  };

  client.leads.forEach((lead: any) =>
    push(
      lead.createdAt,
      'Lead',
      'Lead captured',
      [lead.source && `Source: ${lead.source}`, lead.assignedTo && `Owner: ${lead.assignedTo}`]
        .filter(Boolean)
        .join(' · ') || 'Lead created',
      User,
      'text-slate-600 bg-slate-100 dark:bg-slate-800',
    ),
  );

  client.quotations.forEach((q: any) =>
    push(
      q.createdAt || q.date,
      'Quotation',
      `Quotation ${q.quotationId || ''}`.trim(),
      `${q.amount || '₹0'} · ${q.status}`,
      FileText,
      'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
    ),
  );

  client.workOrders.forEach((wo: any) =>
    push(
      wo.createdAt || wo.startDate,
      'Work Order',
      `Work order ${wo.workOrderId || ''}`.trim(),
      `${wo.value || '₹0'} · ${wo.status}`,
      ClipboardList,
      'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30',
    ),
  );

  client.agreements.forEach((a: any) =>
    push(
      a.createdAt,
      'Agreement',
      'Agreement recorded',
      `${a.value || '₹0'} · ${a.status}`,
      FileSignature,
      'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
    ),
  );

  client.invoices.forEach((inv) =>
    push(
      inv.createdAt,
      'Invoice',
      `Invoice ${inv.ref}`,
      `${formatINR(inv.total)} · ${prettyStatus(inv.status)}`,
      Receipt,
      'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
    ),
  );

  client.followups.forEach((f: any) =>
    push(
      f.dateTime || f.createdAt,
      'Follow-up',
      f.subject || 'Follow-up',
      `${f.type || 'Follow-up'} · ${f.status}`,
      Activity,
      'text-violet-600 bg-violet-100 dark:bg-violet-900/30',
    ),
  );

  return events.sort((a, b) => b.at.getTime() - a.at.getTime());
};

// ─── Main component ───────────────────────────────────────────────────────────

export function Client360({ client, onBack }: Client360Props) {
  const [activeTab, setActiveTab] = useState('overview');
  const [showCall, setShowCall] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [workOrderDetail, setWorkOrderDetail] = useState<any | null>(null);

  const style = clientStatusStyle(client.status);
  const isRegular = client.type === 'regular';
  const timeline = useMemo(() => buildTimeline(client), [client]);

  const fullAddress = [client.address, client.city, client.state, client.pincode]
    .filter(Boolean)
    .join(', ');

  const agingTotal =
    client.aging.d30 + client.aging.d60 + client.aging.d90 + client.aging.d90plus;

  const agingRows: { label: string; amount: number; bar: string }[] = [
    { label: '0–30 days', amount: client.aging.d30, bar: 'bg-emerald-500' },
    { label: '31–60 days', amount: client.aging.d60, bar: 'bg-amber-500' },
    { label: '61–90 days', amount: client.aging.d90, bar: 'bg-orange-500' },
    { label: '90+ days', amount: client.aging.d90plus, bar: 'bg-red-500' },
  ];

  const deployedPosts = client.posts.length
    ? client.posts.map((p) => ({
        code: p.postCode,
        name: p.postName,
        location: [p.location?.address, p.location?.city].filter(Boolean).join(', '),
        guards: p.totalGuards,
        shift: p.shiftType,
        status: p.status,
      }))
    : (client.liveWorkOrders.length ? client.liveWorkOrders : client.workOrders)
        .flatMap((wo: any) => wo.posts || wo.locations || [])
        .map((p: any, i: number) => ({
          code: p.postCode || `#${i + 1}`,
          name: p.name || p.postName || `Post ${i + 1}`,
          location: [p.address || p.postAddress, p.city].filter(Boolean).join(', '),
          guards: Number(p.totalGuards ?? p.guards) || 0,
          shift: p.shiftType || '—',
          status: 'planned',
        }));

  return (
    <div className="space-y-5">
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Clients
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!client.contactPhone}
            onClick={() => setShowCall(true)}
          >
            <Phone className="h-4 w-4" />
            Call
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!client.contactEmail}
            onClick={() => setShowEmail(true)}
          >
            <Mail className="h-4 w-4" />
            Email
          </Button>
        </div>
      </div>

      {/* ── Identity header ──────────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="bg-linear-to-r from-red-50 via-white to-gray-50 p-5 dark:from-red-900/20 dark:via-gray-900 dark:to-gray-900/40">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div
                className={cn(
                  'flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br text-xl font-bold text-white shadow-md',
                  avatarGradient(client.key),
                )}
                aria-hidden="true"
              >
                {initialsOf(client.companyName || client.name)}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-2xl font-bold leading-tight">{client.name}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {/* Customer ID — the identity every work order and invoice hangs off */}
                  {client.customerId && (
                    <Badge className="bg-[#D71920] font-mono text-[11px] text-white hover:bg-[#D71920]">
                      {client.customerId}
                    </Badge>
                  )}
                  <Badge variant="outline" className={cn('text-[11px]', style.badge)}>
                    <span className={cn('mr-1.5 h-1.5 w-1.5 rounded-full', style.dot)} />
                    {client.status}
                  </Badge>
                  <Badge variant="outline" className="text-[11px]">
                    {isRegular ? 'Regular Client' : 'Occasional Client'}
                  </Badge>
                  {client.gstin && (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {client.gstin}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    Client since {formatMonthYear(client.since)}
                  </span>
                </div>
              </div>
            </div>

            {(client.isExpiring || client.isExpired) && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-800/40 dark:bg-amber-900/20">
                <CalendarClock className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  {client.isExpired
                    ? `Contract expired ${Math.abs(client.daysToExpiry ?? 0)} days ago`
                    : `Contract renews in ${client.daysToExpiry} days`}
                </span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ── KPI strip ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label={isRegular ? 'Monthly Value' : 'Avg Invoice'}
          value={formatINRCompact(
            isRegular
              ? client.monthlyValue
              : client.invoices.length
                ? client.lifetimeBilled / client.invoices.length
                : 0,
          )}
          sub={isRegular ? `${client.liveWorkOrders.length} live WO` : `${client.invoices.length} invoices`}
          icon={TrendingUp}
        />
        <KpiTile
          label="Lifetime Billed"
          value={formatINRCompact(client.lifetimeBilled)}
          sub={`${client.invoices.length} invoice${client.invoices.length !== 1 ? 's' : ''}`}
          icon={IndianRupee}
        />
        <KpiTile
          label="Collected"
          value={formatINRCompact(client.collected)}
          sub={
            client.lifetimeBilled > 0
              ? `${Math.round((client.collected / client.lifetimeBilled) * 100)}% realised`
              : 'No billing yet'
          }
          icon={Wallet}
          tone="success"
        />
        <KpiTile
          label="Outstanding"
          value={formatINRCompact(client.outstanding)}
          sub={client.outstanding > 0 ? 'Needs collection' : 'All clear'}
          icon={AlertTriangle}
          tone={client.outstanding > 0 ? 'danger' : 'success'}
        />
        <KpiTile
          label="Deployment"
          value={`${client.guardCount}`}
          sub={`${client.postCount} post${client.postCount !== 1 ? 's' : ''} covered`}
          icon={Users}
        />
        <KpiTile
          label="Open Follow-ups"
          value={String(client.openFollowups)}
          sub={client.lastActivity ? `Last activity ${formatRelative(client.lastActivity)}` : 'No activity'}
          icon={Activity}
          tone={client.openFollowups > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* ── Detail tabs ──────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <ScrollArea className="w-full">
          <TabsList className="inline-flex min-w-max gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
            <TabsTrigger value="overview" className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="workorders" className="flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" />
              Work Orders
              {client.workOrders.length > 0 && (
                <span className="ml-1 text-[10px] opacity-70">{client.workOrders.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="agreements" className="flex items-center gap-1.5">
              <FileSignature className="h-3.5 w-3.5" />
              Agreements
              {client.agreements.length > 0 && (
                <span className="ml-1 text-[10px] opacity-70">{client.agreements.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="quotations" className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Quotations
              {client.quotations.length > 0 && (
                <span className="ml-1 text-[10px] opacity-70">{client.quotations.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="invoices" className="flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5" />
              Invoices
              {client.invoices.length > 0 && (
                <span className="ml-1 text-[10px] opacity-70">{client.invoices.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="deployment" className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Deployment
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              Timeline
            </TabsTrigger>
          </TabsList>
          <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>

        {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SectionCard title="Contact & Identity" icon={Building2}>
              <div className="divide-y divide-border/60">
                <DetailRow icon={User} label="Contact Person" value={client.contactPerson} />
                <DetailRow icon={Phone} label="Phone" value={client.contactPhone} />
                <DetailRow icon={Mail} label="Email" value={client.contactEmail} />
                <DetailRow icon={Hash} label="GSTIN" value={client.gstin} />
                <DetailRow icon={MapPin} label="Address" value={fullAddress} />
              </div>
            </SectionCard>

            <SectionCard title={isRegular ? 'Contract Snapshot' : 'Engagement Snapshot'} icon={FileSignature}>
              <div className="space-y-2.5 text-sm">
                {isRegular ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Monthly value</span>
                      <span className="font-semibold">{formatINR(client.monthlyValue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Total WO value raised</span>
                      <span className="font-medium">{formatINR(client.contractValue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Live work orders</span>
                      <span className="font-medium">
                        {client.liveWorkOrders.length} of {client.workOrders.length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Agreements on file</span>
                      <span className="font-medium">{client.agreements.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Nearest contract end</span>
                      <span className="font-medium">{formatDate(client.contractEnd)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Invoices raised</span>
                      <span className="font-semibold">{client.invoices.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">First invoice</span>
                      <span className="font-medium">{formatDate(client.since)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Latest invoice</span>
                      <span className="font-medium">{formatDate(client.lastActivity)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Quotations shared</span>
                      <span className="font-medium">{client.quotations.length}</span>
                    </div>
                    <div className="rounded-md bg-muted/50 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                      Occasional client — billed via one-time invoices with no standing work
                      order. Convert to a regular client by raising a work order.
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between border-t pt-2.5">
                  <span className="text-muted-foreground">Origin</span>
                  <span className="font-medium">{client.source || 'Direct'}</span>
                </div>
                {client.assignedTo && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Account owner</span>
                    <span className="font-medium">{client.assignedTo}</span>
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Receivables Health" icon={IndianRupee}>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Billed</p>
                    <p className="mt-0.5 text-lg font-bold">{formatINRCompact(client.lifetimeBilled)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Due</p>
                    <p
                      className={cn(
                        'mt-0.5 text-lg font-bold',
                        client.outstanding > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600',
                      )}
                    >
                      {formatINRCompact(client.outstanding)}
                    </p>
                  </div>
                </div>

                {agingTotal > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Ageing of dues
                    </p>
                    {agingRows.map((row) => (
                      <div key={row.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{row.label}</span>
                          <span className="font-medium">{formatINR(row.amount)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn('h-full rounded-full transition-all', row.bar)}
                            style={{ width: `${agingTotal ? (row.amount / agingTotal) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md bg-emerald-50 p-2.5 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                    No outstanding dues. Payments are fully up to date.
                  </p>
                )}
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Recent Activity" icon={Activity}>
            {timeline.length === 0 ? (
              <EmptyState icon={Activity} message="No recorded activity for this client yet." />
            ) : (
              <div className="space-y-3">
                {timeline.slice(0, 5).map((event, i) => (
                  <div key={`${event.kind}-${i}`} className="flex items-start gap-3">
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                        event.tone,
                      )}
                    >
                      <event.icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{event.title}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {event.kind}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{event.detail}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatDate(event.at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        {/* ── WORK ORDERS ──────────────────────────────────────────────── */}
        <TabsContent value="workorders" className="mt-5">
          {client.workOrders.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              message="No work orders yet. Occasional clients are billed without a standing work order."
            />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Work Order</TableHead>
                    <TableHead>Client Ref</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Posts</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {client.workOrders.map((wo: any) => {
                    const posts = wo.posts || wo.locations || [];
                    return (
                      <TableRow key={wo.id}>
                        <TableCell className="font-mono text-xs">{wo.workOrderId || '—'}</TableCell>
                        <TableCell className="text-xs">{wo.clientWoRef || '—'}</TableCell>
                        <TableCell className="text-xs">
                          {formatDate(wo.startDate)} → {formatDate(wo.endDate)}
                        </TableCell>
                        <TableCell className="text-right font-medium">{wo.value || '₹0'}</TableCell>
                        <TableCell className="text-right">{posts.length}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[10px]', docStatusClass(wo.status))}>
                            {wo.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-xs"
                            onClick={() => setWorkOrderDetail(wo)}
                          >
                            View
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── AGREEMENTS ───────────────────────────────────────────────── */}
        <TabsContent value="agreements" className="mt-5">
          {client.agreements.length === 0 ? (
            <EmptyState icon={FileSignature} message="No agreements recorded for this client." />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Linked Quote</TableHead>
                    <TableHead>Signed / Valid Until</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {client.agreements.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs">
                        {a.agreementId || a.id?.slice(0, 8) || '—'}
                      </TableCell>
                      <TableCell className="text-xs">{a.linkedQuoteId || a.quotationRef || '—'}</TableCell>
                      <TableCell className="text-xs">
                        {formatDate(a.signedOn)} → {formatDate(a.validUntil)}
                      </TableCell>
                      <TableCell className="text-right font-medium">{a.value || '₹0'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-[10px]', docStatusClass(a.status))}>
                          {prettyStatus(a.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── QUOTATIONS ───────────────────────────────────────────────── */}
        <TabsContent value="quotations" className="mt-5">
          {client.quotations.length === 0 ? (
            <EmptyState icon={FileText} message="No quotations shared with this client." />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quotation</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Valid Until</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {client.quotations.map((q: any) => (
                    <TableRow key={q.id}>
                      <TableCell className="font-mono text-xs">{q.quotationId || '—'}</TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs">{q.service || '—'}</TableCell>
                      <TableCell className="text-xs">{formatDate(q.date)}</TableCell>
                      <TableCell className="text-xs">{formatDate(q.validUntil)}</TableCell>
                      <TableCell className="text-right font-medium">{q.amount || '₹0'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-[10px]', docStatusClass(q.status))}>
                          {q.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── INVOICES ─────────────────────────────────────────────────── */}
        <TabsContent value="invoices" className="mt-5 space-y-4">
          {client.invoices.length === 0 ? (
            <EmptyState icon={Receipt} message="No invoices raised for this client yet." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card className="border-t-4 border-t-blue-500 p-4">
                  <p className="text-xs text-muted-foreground">Invoices</p>
                  <p className="mt-1 text-2xl font-bold">{client.invoices.length}</p>
                </Card>
                <Card className="border-t-4 border-t-indigo-500 p-4">
                  <p className="text-xs text-muted-foreground">Billed</p>
                  <p className="mt-1 text-2xl font-bold">{formatINRCompact(client.lifetimeBilled)}</p>
                </Card>
                <Card className="border-t-4 border-t-emerald-500 p-4">
                  <p className="text-xs text-muted-foreground">Collected</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {formatINRCompact(client.collected)}
                  </p>
                </Card>
                <Card
                  className={cn(
                    'border-t-4 p-4',
                    client.outstanding > 0 ? 'border-t-red-500' : 'border-t-gray-300',
                  )}
                >
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                  <p
                    className={cn(
                      'mt-1 text-2xl font-bold',
                      client.outstanding > 0 && 'text-red-600 dark:text-red-400',
                    )}
                  >
                    {formatINRCompact(client.outstanding)}
                  </p>
                </Card>
              </div>

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Particulars</TableHead>
                      <TableHead>Raised</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {client.invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-xs">{inv.ref}</TableCell>
                        <TableCell className="max-w-[280px] truncate text-xs">
                          {inv.description || '—'}
                        </TableCell>
                        <TableCell className="text-xs">{formatDate(inv.createdAt)}</TableCell>
                        <TableCell className="text-xs">{formatDate(inv.dueDate)}</TableCell>
                        <TableCell className="text-right font-medium">{formatINR(inv.total)}</TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-medium',
                            inv.outstanding > 0 && 'text-red-600 dark:text-red-400',
                          )}
                        >
                          {inv.outstanding > 0 ? formatINR(inv.outstanding) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[10px]', docStatusClass(inv.status))}>
                            {prettyStatus(inv.status)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── DEPLOYMENT ───────────────────────────────────────────────── */}
        <TabsContent value="deployment" className="mt-5 space-y-4">
          {deployedPosts.length === 0 ? (
            <EmptyState icon={Shield} message="No posts or guards deployed for this client." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Card className="border-t-4 border-t-blue-500 p-4">
                  <p className="text-xs text-muted-foreground">Posts</p>
                  <p className="mt-1 text-2xl font-bold">{deployedPosts.length}</p>
                </Card>
                <Card className="border-t-4 border-t-safend-red p-4">
                  <p className="text-xs text-muted-foreground">Guards Deployed</p>
                  <p className="mt-1 text-2xl font-bold">
                    {deployedPosts.reduce((s, p) => s + (Number(p.guards) || 0), 0)}
                  </p>
                </Card>
                <Card className="border-t-4 border-t-emerald-500 p-4">
                  <p className="text-xs text-muted-foreground">Live in Operations</p>
                  <p className="mt-1 text-2xl font-bold">
                    {client.posts.filter((p) => p.status === 'active').length}
                  </p>
                </Card>
              </div>

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Post Code</TableHead>
                      <TableHead>Post Name</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-right">Guards</TableHead>
                      <TableHead>Shift</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deployedPosts.map((post, i) => (
                      <TableRow key={`${post.code}-${i}`}>
                        <TableCell className="font-mono text-xs">{post.code || '—'}</TableCell>
                        <TableCell className="text-sm">{post.name}</TableCell>
                        <TableCell className="max-w-[280px] truncate text-xs">
                          {post.location || '—'}
                        </TableCell>
                        <TableCell className="text-right font-medium">{post.guards}</TableCell>
                        <TableCell className="text-xs">{post.shift}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[10px]', docStatusClass(post.status))}>
                            {prettyStatus(post.status)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── TIMELINE ─────────────────────────────────────────────────── */}
        <TabsContent value="timeline" className="mt-5">
          {timeline.length === 0 ? (
            <EmptyState icon={Activity} message="Nothing has been recorded against this client yet." />
          ) : (
            <Card className="p-5">
              <ol className="relative space-y-5 border-l border-border pl-6">
                {timeline.map((event, i) => (
                  <li key={`${event.kind}-${i}`} className="relative">
                    <span
                      className={cn(
                        'absolute left-[-31px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background',
                        event.tone,
                      )}
                    >
                      <event.icon className="h-3 w-3" />
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{event.title}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {event.kind}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(event.at)} · {formatRelative(event.at)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{event.detail}</p>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      <CallClientModal
        isOpen={showCall}
        onClose={() => setShowCall(false)}
        clientName={client.contactPerson || client.name}
        clientPhone={client.contactPhone}
      />
      <EmailClientModal
        isOpen={showEmail}
        onClose={() => setShowEmail(false)}
        clientName={client.contactPerson || client.name}
        clientEmail={client.contactEmail}
        companyName={client.companyName || client.name}
      />
      <WorkOrderDetailModal
        isOpen={!!workOrderDetail}
        onClose={() => setWorkOrderDetail(null)}
        workOrder={workOrderDetail}
      />
    </div>
  );
}
