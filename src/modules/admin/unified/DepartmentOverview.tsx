'use client';

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  MapPin,
  Wallet,
  TrendingUp,
  ShoppingCart,
  Building2,
  IndianRupee,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  Clock,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { useAdminOverview, type AdminOverview } from "./useAdminOverview";

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Compact Indian-rupee formatting: 6240000 -> "₹62.4L", 12500000 -> "₹1.25Cr". */
function formatINR(value: number): string {
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)}Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  return `₹${value}`;
}

const num = (n: number) => n.toLocaleString("en-IN");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Status = "healthy" | "attention" | "critical";
type Tone = "default" | "positive" | "warning" | "critical";
type Severity = "critical" | "warning" | "info";

interface Metric {
  label: string;
  value: string;
  tone?: Tone;
}

interface DepartmentView {
  key: string;
  name: string;
  icon: LucideIcon;
  path: string;
  accent: { icon: string; tile: string };
  status: Status;
  summary: string;
  metrics: Metric[];
  focus: { label: string; value: number; target: number };
}

interface AttentionItem {
  dept: string;
  path: string;
  label: string;
  count: number;
  severity: Severity;
}

// ---------------------------------------------------------------------------
// Derive views from live data
// ---------------------------------------------------------------------------

function buildDepartments(d: AdminOverview): DepartmentView[] {
  const salesStatus: Status = d.opportunities > 0 ? "healthy" : "attention";
  const accountsStatus: Status =
    d.receivablesOverdue > 5 ? "critical" : d.receivablesOverdue > 0 ? "attention" : "healthy";
  const opsStatus: Status =
    d.penaltiesOpen > 10 ? "critical" : d.penaltiesOpen > 0 ? "attention" : "healthy";
  const hrStatus: Status = d.leavePending > 10 ? "attention" : "healthy";

  return [
    {
      key: "sales",
      name: "Sales & CRM",
      icon: ShoppingCart,
      path: "/sales",
      accent: { icon: "text-blue-600", tile: "bg-blue-50 dark:bg-blue-900/20" },
      status: salesStatus,
      summary: `${num(d.opportunities)} open opportunities in pipeline`,
      metrics: [
        { label: "Total Leads", value: num(d.leadsTotal) },
        { label: "Opportunities", value: num(d.opportunities) },
        { label: "Active Clients", value: num(d.activeClients), tone: "positive" },
        { label: "Conversion", value: `${d.conversionRate}%` },
      ],
      focus: { label: "Lead Conversion Rate", value: d.conversionRate, target: 35 },
    },
    {
      key: "operations",
      name: "Operations",
      icon: Building2,
      path: "/operations",
      accent: { icon: "text-indigo-600", tile: "bg-indigo-50 dark:bg-indigo-900/20" },
      status: opsStatus,
      summary:
        d.penaltiesOpen > 0
          ? `${num(d.penaltiesOpen)} penalties pending HR review`
          : "No penalties pending review",
      metrics: [
        { label: "Active Posts", value: num(d.activePosts) },
        { label: "Active Staff", value: num(d.activeStaff), tone: "positive" },
        { label: "Open Penalties", value: num(d.penaltiesOpen), tone: d.penaltiesOpen > 0 ? "warning" : "default" },
        { label: "Penalties (MTD)", value: num(d.penaltiesThisMonth) },
      ],
      focus: { label: "Active Staff Ratio", value: d.activeRatio, target: 90 },
    },
    {
      key: "accounts",
      name: "Accounts & Finance",
      icon: IndianRupee,
      path: "/accounts",
      accent: { icon: "text-emerald-600", tile: "bg-emerald-50 dark:bg-emerald-900/20" },
      status: accountsStatus,
      summary:
        d.receivablesOverdue > 0
          ? `${num(d.receivablesOverdue)} invoices overdue for collection`
          : "Collections on track",
      metrics: [
        { label: "Receivables", value: formatINR(d.receivablesOutstanding) },
        { label: "Payables", value: formatINR(d.payablesOutstanding) },
        { label: "Overdue Invoices", value: num(d.receivablesOverdue), tone: d.receivablesOverdue > 0 ? "critical" : "default" },
        { label: "Fund Requests", value: num(d.messFundPending), tone: d.messFundPending > 0 ? "warning" : "default" },
      ],
      focus: { label: "Collection Rate", value: d.collectionRate, target: 90 },
    },
    {
      key: "hr",
      name: "Human Resources",
      icon: Users,
      path: "/hr",
      accent: { icon: "text-violet-600", tile: "bg-violet-50 dark:bg-violet-900/20" },
      status: hrStatus,
      summary:
        d.leavePending > 0
          ? `${num(d.leavePending)} leave requests awaiting approval`
          : "No pending leave requests",
      metrics: [
        { label: "Headcount", value: num(d.headcount) },
        { label: "Active Staff", value: num(d.activeStaff), tone: "positive" },
        { label: "Leave Pending", value: num(d.leavePending), tone: d.leavePending > 0 ? "warning" : "default" },
        { label: "Financial Penalties", value: num(d.penaltiesFinancial), tone: d.penaltiesFinancial > 0 ? "warning" : "default" },
      ],
      focus: { label: "Active Staff Ratio", value: d.activeRatio, target: 90 },
    },
  ];
}

function buildRollup(d: AdminOverview) {
  return [
    { label: "Active Workforce", value: num(d.activeStaff), sub: `${num(d.headcount)} total headcount`, icon: Users },
    { label: "Active Posts", value: num(d.activePosts), sub: "guard deployments", icon: MapPin },
    { label: "Outstanding Receivables", value: formatINR(d.receivablesOutstanding), sub: `${num(d.receivablesOverdue)} invoices overdue`, icon: Wallet },
    { label: "Open Opportunities", value: num(d.opportunities), sub: `${num(d.leadsTotal)} total leads`, icon: TrendingUp },
  ];
}

function buildAttention(d: AdminOverview): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (d.receivablesOverdue > 0)
    items.push({ dept: "Accounts", path: "/accounts", label: "Invoices overdue for collection", count: d.receivablesOverdue, severity: "critical" });
  if (d.penaltiesOpen > 0)
    items.push({ dept: "Operations", path: "/operations", label: "Penalties pending HR review", count: d.penaltiesOpen, severity: "warning" });
  if (d.penaltiesFinancial > 0)
    items.push({ dept: "Accounts", path: "/accounts", label: "Financial penalties to process in payroll", count: d.penaltiesFinancial, severity: "warning" });
  if (d.messFundPending > 0)
    items.push({ dept: "Accounts", path: "/accounts", label: "Mess fund requests awaiting approval", count: d.messFundPending, severity: "warning" });
  if (d.payablesPending > 0)
    items.push({ dept: "Accounts", path: "/accounts", label: "Payables pending approval", count: d.payablesPending, severity: "info" });
  if (d.leavePending > 0)
    items.push({ dept: "HR", path: "/hr", label: "Leave requests awaiting approval", count: d.leavePending, severity: "info" });

  // Highest severity first, then largest count.
  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const statusConfig: Record<Status, { label: string; badge: string; dot: string; bar: string }> = {
  healthy: {
    label: "On Track",
    badge: "border-transparent bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    dot: "bg-green-500",
    bar: "[&>div]:bg-green-500",
  },
  attention: {
    label: "Needs Attention",
    badge: "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    dot: "bg-amber-500",
    bar: "[&>div]:bg-amber-500",
  },
  critical: {
    label: "Action Required",
    badge: "border-transparent bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    dot: "bg-red-500",
    bar: "[&>div]:bg-red-500",
  },
};

const toneClass: Record<Tone, string> = {
  default: "text-foreground",
  positive: "text-green-600 dark:text-green-500",
  warning: "text-amber-600 dark:text-amber-500",
  critical: "text-red-600 dark:text-red-500",
};

const severityConfig: Record<Severity, { icon: LucideIcon; text: string; badge: string }> = {
  critical: { icon: AlertCircle, text: "text-red-500", badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  warning: { icon: AlertTriangle, text: "text-amber-500", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  info: { icon: Clock, text: "text-blue-500", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CompanyRollup({ data }: { data: AdminOverview }) {
  const rollup = buildRollup(data);
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {rollup.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground truncate">
                    {item.label}
                  </p>
                  <p className="text-2xl font-bold mt-1">{item.value}</p>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{item.sub}</p>
                </div>
                <div className="rounded-lg bg-secondary p-2 shrink-0">
                  <Icon className="h-5 w-5 text-safend-red" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function DepartmentCard({ dept, onOpen }: { dept: DepartmentView; onOpen: (path: string) => void }) {
  const cfg = statusConfig[dept.status];
  const Icon = dept.icon;
  const gap = dept.focus.value - dept.focus.target;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onOpen(dept.path)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(dept.path);
        }
      }}
      className="group flex flex-col cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-hidden focus:ring-2 focus:ring-safend-red/40"
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-2 rounded-lg shrink-0 ${dept.accent.tile}`}>
              <Icon className={`h-5 w-5 ${dept.accent.icon}`} />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base truncate">{dept.name}</CardTitle>
              <p className="text-xs text-muted-foreground truncate">{dept.summary}</p>
            </div>
          </div>
          <Badge className={`${cfg.badge} shrink-0 gap-1`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col flex-1 gap-4">
        <div className="grid grid-cols-2 gap-px rounded-lg overflow-hidden bg-border">
          {dept.metrics.map((m) => (
            <div key={m.label} className="bg-card p-3">
              <p className="text-xs text-muted-foreground truncate">{m.label}</p>
              <p className={`text-lg font-bold leading-tight ${toneClass[m.tone ?? "default"]}`}>
                {m.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-auto">
          <div className="flex justify-between items-center mb-1.5 text-xs">
            <span className="text-muted-foreground">{dept.focus.label}</span>
            <span className="font-medium">
              {dept.focus.value}%
              <span className="text-muted-foreground font-normal"> / {dept.focus.target}% target</span>
            </span>
          </div>
          <Progress value={dept.focus.value} className={`h-2 ${cfg.bar}`} />
          <div className="flex items-center justify-between mt-2">
            <span
              className={`text-xs font-medium ${
                gap >= 0 ? "text-green-600 dark:text-green-500" : "text-amber-600 dark:text-amber-500"
              }`}
            >
              {gap >= 0 ? `+${gap}% above target` : `${gap}% below target`}
            </span>
            <span className="inline-flex items-center text-xs text-muted-foreground group-hover:text-safend-red transition-colors">
              Open <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AttentionPanel({ items, onOpen }: { items: AttentionItem[]; onOpen: (path: string) => void }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Needs Your Attention
          {items.length > 0 && <Badge variant="secondary" className="ml-1">{items.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="flex items-center gap-2 px-6 pb-6 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            All clear — no pending actions across departments.
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((item, i) => {
              const sev = severityConfig[item.severity];
              const SevIcon = sev.icon;
              return (
                <li
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(item.path)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(item.path);
                    }
                  }}
                  className="flex items-center gap-3 px-6 py-3 cursor-pointer transition-colors hover:bg-accent/50 focus:outline-hidden focus:bg-accent/50"
                >
                  <SevIcon className={`h-4 w-4 shrink-0 ${sev.text}`} />
                  <Badge className={`${sev.badge} border-transparent shrink-0 min-w-8 justify-center`}>
                    {item.count}
                  </Badge>
                  <span className="text-sm flex-1 min-w-0 truncate">{item.label}</span>
                  <Badge variant="outline" className="shrink-0 text-xs font-normal">
                    {item.dept}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function OverviewSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6 space-y-4">
              <Skeleton className="h-5 w-32" />
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-12 w-full" />
                ))}
              </div>
              <Skeleton className="h-2 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function DepartmentOverview() {
  const router = useRouter();
  const open = (path: string) => router.push(path);
  const data = useAdminOverview();

  if (data.isLoading) {
    return <OverviewSkeleton />;
  }

  const departments = buildDepartments(data);
  const attention = buildAttention(data);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Company at a Glance</h2>
        <CompanyRollup data={data} />
      </section>

      <Separator />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Departments</h2>
          <p className="text-sm text-muted-foreground">
            Live status across every department. Select a card to drill in.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {departments.map((dept) => (
            <DepartmentCard key={dept.key} dept={dept} onOpen={open} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <AttentionPanel items={attention} onOpen={open} />
      </section>
    </div>
  );
}
