'use client';
// Sales Reports Tab — real data, ₹ currency, with Collections
import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import {
  TrendingUp, Users, FileText, IndianRupee,
  Target, Download, FileSpreadsheet, FileDown, Calendar,
  ArrowUpRight, ArrowDownRight, Minus, BarChart2, Eye, AlertCircle
} from "lucide-react";
import { useReportExport } from "@/services/reports/ExportService";
import { useLeadsData } from "@/contexts/LeadsDataContext";
import { useQuotationsData } from "@/contexts/QuotationsDataContext";
import { useAgreementsData } from "@/contexts/AgreementsDataContext";
import { useQuery } from "@tanstack/react-query";
import { fetchCollectionTasks, type CollectionTask } from "@/services/collections/OverdueCollectionService";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Strip ₹ / commas and parse to number */
const parseAmount = (v: string | number | undefined): number => {
  if (typeof v === "number") return v;
  if (!v) return 0;
  return parseFloat(String(v).replace(/[₹,\s]/g, "")) || 0;
};

/** Format as ₹ with Indian short-form */
const fmt = (n: number): string => {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
};

/** Filter items to a period relative to today */
function inPeriod(date: Date | string | undefined, period: string): boolean {
  if (!date) return false;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const startOf = (y: number, m: number) => new Date(y, m, 1);
  switch (period) {
    case "this-month":
      return d >= startOf(now.getFullYear(), now.getMonth());
    case "last-month": {
      const s = startOf(now.getFullYear(), now.getMonth() - 1);
      const e = startOf(now.getFullYear(), now.getMonth());
      return d >= s && d < e;
    }
    case "last-quarter": {
      const s = new Date(now); s.setMonth(s.getMonth() - 3);
      return d >= s;
    }
    case "last-year": {
      const s = startOf(now.getFullYear() - 1, 0);
      const e = startOf(now.getFullYear(), 0);
      return d >= s && d < e;
    }
    case "ytd":
    default:
      return d >= startOf(now.getFullYear(), 0);
  }
}

// ─── Report card definitions (Reports sub-tab) ────────────────────────────────

const reportDefinitions = [
  {
    id: "sales-performance",
    title: "Sales Performance Report",
    description: "Monthly revenue, deal counts and YoY comparison.",
    category: "Revenue",
    icon: IndianRupee,
    formats: ["pdf", "excel", "csv"] as const,
  },
  {
    id: "pipeline-status",
    title: "Pipeline Status Report",
    description: "Current pipeline breakdown by stage, value and probability.",
    category: "Pipeline",
    icon: BarChart2,
    formats: ["pdf", "excel"] as const,
  },
  {
    id: "conversion-rate",
    title: "Lead Conversion Report",
    description: "Lead-to-close funnel analysis with conversion rates per stage.",
    category: "Leads",
    icon: Target,
    formats: ["pdf", "excel", "csv"] as const,
  },
  {
    id: "client-revenue",
    title: "Client Revenue Report",
    description: "Revenue breakdown by client with contract count.",
    category: "Clients",
    icon: Users,
    formats: ["pdf", "excel", "csv"] as const,
  },
  {
    id: "lead-source",
    title: "Lead Source Analysis",
    description: "Distribution of leads by acquisition channel.",
    category: "Leads",
    icon: FileText,
    formats: ["pdf", "excel"] as const,
  },
  {
    id: "activity-report",
    title: "Sales Activity Report",
    description: "Follow-ups, meetings, calls and site visits per period.",
    category: "Activity",
    icon: Calendar,
    formats: ["pdf", "excel", "csv"] as const,
  },
  {
    id: "collections-report",
    title: "Collections & Overdue Report",
    description: "Aging buckets, overdue invoices, priority breakdown and resolution status.",
    category: "Collections",
    icon: AlertCircle,
    formats: ["pdf", "excel", "csv"] as const,
  },
];

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  title, value, growth, formatted, icon: Icon, subtitle,
}: {
  title: string; value: number; growth: number | null;
  formatted: string; icon: React.ElementType; subtitle?: string;
}) {
  const isPositive = growth !== null && growth > 0;
  const isNegative = growth !== null && growth < 0;
  return (
    <Card className="hover:shadow-md transition-shadow border-t-4 border-t-red-500">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-gray-100">{formatted}</p>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <Icon className="h-5 w-5 text-red-500" />
          </div>
        </div>
        {growth !== null && (
          <div className="flex items-center gap-1 mt-3">
            {isPositive ? (
              <ArrowUpRight className="h-3.5 w-3.5 text-green-500" />
            ) : isNegative ? (
              <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
            ) : (
              <Minus className="h-3.5 w-3.5 text-gray-400" />
            )}
            <span className={cn("text-xs font-medium",
              isPositive ? "text-green-600" : isNegative ? "text-red-500" : "text-gray-400"
            )}>
              {isPositive ? "+" : ""}{growth.toFixed(1)}% vs last period
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── View Sub-tab ─────────────────────────────────────────────────────────────

function ViewSubTab({ period }: { period: string }) {
  const { leads } = useLeadsData();
  const { quotations } = useQuotationsData();
  const { agreements } = useAgreementsData();

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const now = new Date();
    const ytdStart = new Date(now.getFullYear(), 0, 1);
    const prevYtdStart = new Date(now.getFullYear() - 1, 0, 1);
    const prevYtdEnd = new Date(now.getFullYear(), 0, 1);

    // Revenue = sum of active/completed/signed agreement values in period
    const activeStatuses = ["Active", "Completed", "Signed"];
    const periodAgreements = agreements.filter(a =>
      activeStatuses.includes(a.status) && inPeriod(a.createdAt, period)
    );
    const prevAgreements = agreements.filter(a =>
      activeStatuses.includes(a.status) &&
      a.createdAt && new Date(a.createdAt) >= prevYtdStart &&
      new Date(a.createdAt) < prevYtdEnd
    );
    const revenue = periodAgreements.reduce((s, a) => s + parseAmount(a.value), 0);
    const prevRevenue = prevAgreements.reduce((s, a) => s + parseAmount(a.value), 0);
    const revenueGrowth = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;

    // Avg deal size
    const avgDeal = periodAgreements.length > 0 ? revenue / periodAgreements.length : 0;

    // Pipeline = pending/sent/revised quotations
    const pipelineStatuses = ["Pending", "Sent", "Revised", "Draft"];
    const pipelineValue = quotations
      .filter(q => pipelineStatuses.includes(q.status))
      .reduce((s, q) => s + parseAmount(q.amount), 0);

    // Conversion rate = (Opportunity + Client) / total leads
    const qualified = leads.filter(l =>
      ["Qualified Lead", "Opportunity", "Client", "Converted"].includes(l.status)
    ).length;
    const conversionRate = leads.length > 0 ? (qualified / leads.length) * 100 : 0;

    // Active leads in period
    const activeLeads = leads.filter(l =>
      ["New Lead", "Qualified Lead", "Opportunity"].includes(l.status) &&
      inPeriod(l.createdAt, period)
    ).length;

    return { revenue, revenueGrowth, avgDeal, pipelineValue, conversionRate, activeLeads, closedDeals: periodAgreements.length };
  }, [leads, quotations, agreements, period]);

  // ── Monthly revenue chart ─────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const buckets = MONTHS.map((month, i) => ({ month, revenue: 0, deals: 0 }));
    agreements
      .filter(a => ["Active","Completed","Signed"].includes(a.status))
      .forEach(a => {
        const d = a.createdAt ? new Date(a.createdAt) : null;
        if (!d || d.getFullYear() !== year) return;
        const m = d.getMonth();
        buckets[m].revenue += parseAmount(a.value);
        buckets[m].deals += 1;
      });
    return buckets;
  }, [agreements]);

  // ── Conversion funnel ─────────────────────────────────────────────────────
  const funnelData = useMemo(() => {
    const periodLeads = leads.filter(l => inPeriod(l.createdAt, period));
    const total = periodLeads.length;
    const qualified = periodLeads.filter(l =>
      ["Qualified Lead","Opportunity","Client","Converted"].includes(l.status)
    ).length;
    const proposals = quotations.filter(q => inPeriod(q.createdAt, period)).length;
    const closed = agreements.filter(a =>
      ["Active","Completed","Signed"].includes(a.status) && inPeriod(a.createdAt, period)
    ).length;
    return [
      { stage: "Leads", count: total },
      { stage: "Qualified", count: qualified },
      { stage: "Proposals", count: proposals },
      { stage: "Closed", count: closed },
    ];
  }, [leads, quotations, agreements, period]);

  // ── Lead sources ──────────────────────────────────────────────────────────
  const SOURCE_COLORS: Record<string, string> = {
    Referral: "#ea384c", Website: "#1f2937", Direct: "#6b7280",
    LinkedIn: "#3b82f6", Exhibition: "#f59e0b", "Cold Call": "#10b981",
  };
  const leadSourceData = useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach(l => {
      const src = l.source || "Other";
      counts[src] = (counts[src] || 0) + 1;
    });
    const total = leads.length || 1;
    return Object.entries(counts)
      .map(([name, count]) => ({
        name, value: Math.round((count / total) * 100),
        color: SOURCE_COLORS[name] || "#9ca3af",
      }))
      .sort((a, b) => b.value - a.value);
  }, [leads]);

  // ── Pipeline stages ───────────────────────────────────────────────────────
  const STAGE_MAP: Record<string, { label: string; color: string }> = {
    Draft:      { label: "Discovery", color: "#3b82f6" },
    Pending:    { label: "Proposal",  color: "#8b5cf6" },
    Sent:       { label: "Proposal",  color: "#8b5cf6" },
    Revised:    { label: "Negotiation", color: "#f59e0b" },
    Accepted:   { label: "Closing",   color: "#10b981" },
  };
  const pipelineStages = useMemo(() => {
    const buckets: Record<string, { count: number; value: number; color: string }> = {};
    quotations.forEach(q => {
      const map = STAGE_MAP[q.status];
      if (!map) return;
      if (!buckets[map.label]) buckets[map.label] = { count: 0, value: 0, color: map.color };
      buckets[map.label].count += 1;
      buckets[map.label].value += parseAmount(q.amount);
    });
    return Object.entries(buckets).map(([stage, d]) => ({ stage, ...d }));
  }, [quotations]);

  // ── Top clients ───────────────────────────────────────────────────────────
  const topClients = useMemo(() => {
    const map: Record<string, number> = {};
    agreements
      .filter(a => ["Active","Completed","Signed"].includes(a.status) && inPeriod(a.createdAt, period))
      .forEach(a => {
        const name = a.clientName || a.companyName || "Unknown";
        map[name] = (map[name] || 0) + parseAmount(a.value);
      });
    return Object.entries(map)
      .map(([client, revenue]) => ({ client, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [agreements, period]);

  const { data: collectionTasks = [] } = useQuery<CollectionTask[]>({
    queryKey: ["collection_tasks", "All Invoices"],
    queryFn: () => fetchCollectionTasks(),
  });

  // Collections KPIs
  const collectionsKpis = useMemo(() => {
    const active = collectionTasks.filter(t => t.status !== "resolved");
    const totalOverdue = active.reduce((s, t) => s + (t.amount || 0), 0);
    const critical = active.filter(t => t.priority === "critical").length;
    const resolved = collectionTasks.filter(t => t.status === "resolved").length;
    const resolutionRate = collectionTasks.length > 0
      ? (resolved / collectionTasks.length) * 100 : 0;
    return { totalOverdue, critical, resolved, resolutionRate, activeCount: active.length };
  }, [collectionTasks]);

  // Aging buckets for bar chart
  const agingBuckets = useMemo(() => {
    const active = collectionTasks.filter(t => t.status !== "resolved");
    const sum = (min: number, max: number) =>
      active.filter(t => t.days_overdue >= min && t.days_overdue <= max)
            .reduce((s, t) => s + (t.amount || 0), 0);
    return [
      { bucket: "0–30d",  amount: sum(0, 30),   fill: "#6b7280" },
      { bucket: "31–60d", amount: sum(31, 60),  fill: "#f59e0b" },
      { bucket: "61–90d", amount: sum(61, 90),  fill: "#ef4444" },
      { bucket: "90+d",   amount: sum(91, 9999), fill: "#7f1d1d" },
    ];
  }, [collectionTasks]);

  // Priority breakdown for pie
  const priorityData = useMemo(() => {
    const active = collectionTasks.filter(t => t.status !== "resolved");
    const counts: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    active.forEach(t => { counts[t.priority] = (counts[t.priority] || 0) + 1; });
    const colors: Record<string, string> = {
      low: "#10b981", medium: "#f59e0b", high: "#ef4444", critical: "#7f1d1d"
    };
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value, color: colors[name] }));
  }, [collectionTasks]);

  const totalPipeline = pipelineStages.reduce((s, p) => s + p.value, 0);
  const maxClientRevenue = topClients[0]?.revenue || 1;

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Projected Revenue" value={kpis.revenue} growth={kpis.revenueGrowth}
          formatted={fmt(kpis.revenue)} icon={IndianRupee}
          subtitle="From signed contracts (not yet invoiced)" />
        <KpiCard title="Avg. Deal Size" value={kpis.avgDeal} growth={null}
          formatted={fmt(kpis.avgDeal)} icon={TrendingUp} />
        <KpiCard title="Conversion Rate" value={kpis.conversionRate} growth={null}
          formatted={`${kpis.conversionRate.toFixed(1)}%`} icon={Target} />
        <KpiCard title="Active Leads" value={kpis.activeLeads} growth={null}
          formatted={String(kpis.activeLeads)} icon={Users} />
      </div>

      {/* Monthly Revenue */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Projected Monthly Revenue ({new Date().getFullYear()})</CardTitle>
          <CardDescription>Contract value by month — not yet invoiced or collected</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} width={70} />
                <Tooltip formatter={(v: number) => [fmt(v), "Projected"]} />
                <Legend />
                <Bar dataKey="revenue" name="Projected" fill="#ea384c" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Conversion Funnel + Lead Sources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Conversion Funnel</CardTitle>
            <CardDescription>Leads through each sales stage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 pt-2">
              {funnelData.map((row, i) => {
                const max = funnelData[0].count || 1;
                const pct = (row.count / max) * 100;
                const colors = ["#3b82f6","#8b5cf6","#f59e0b","#10b981"];
                return (
                  <div key={row.stage}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{row.stage}</span>
                      <span className="font-semibold">{row.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: colors[i] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lead Sources</CardTitle>
            <CardDescription>Distribution by acquisition channel</CardDescription>
          </CardHeader>
          <CardContent>
            {leadSourceData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No lead data yet</p>
            ) : (
              <div className="flex items-center gap-4">
                <div className="h-52 w-52 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={leadSourceData} cx="50%" cy="50%"
                        innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                        {leadSourceData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v) => `${v}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-2 flex-1">
                  {leadSourceData.map(src => (
                    <div key={src.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: src.color }} />
                        <span className="text-gray-700 dark:text-gray-300">{src.name}</span>
                      </div>
                      <span className="font-semibold">{src.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Overview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pipeline Overview</CardTitle>
          <CardDescription>
            Total pipeline:{" "}
            <span className="font-semibold text-gray-900 dark:text-gray-100">{fmt(totalPipeline)}</span>
            {" "}across {pipelineStages.reduce((s, p) => s + p.count, 0)} opportunities
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pipelineStages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No pipeline data yet</p>
          ) : (
            <>
              <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
                {pipelineStages.map(s => (
                  <div key={s.stage} className="h-full transition-all"
                    style={{ width: `${(s.value / (totalPipeline || 1)) * 100}%`, backgroundColor: s.color }}
                    title={`${s.stage}: ${fmt(s.value)}`} />
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {pipelineStages.map(s => (
                  <div key={s.stage} className="flex flex-col gap-1 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{s.stage}</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmt(s.value)}</p>
                    <p className="text-xs text-muted-foreground">{s.count} deal{s.count !== 1 ? "s" : ""}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Top Clients */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Top Clients by Revenue</CardTitle>
          <CardDescription>Based on active and completed contracts</CardDescription>
        </CardHeader>
        <CardContent>
          {topClients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No contract data yet</p>
          ) : (
            <div className="space-y-3">
              {topClients.map((c, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-5 text-xs text-muted-foreground font-medium text-right">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate">{c.client}</span>
                      <span className="text-sm font-semibold ml-2 shrink-0">{fmt(c.revenue)}</span>
                    </div>
                    <Progress value={(c.revenue / maxClientRevenue) * 100} className="h-1.5" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Collections Overview ─────────────────────────────────────────── */}
      <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
          Collections &amp; Overdue
        </h3>
      </div>

      {/* Collections KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="hover:shadow-md transition-shadow border-t-4 border-t-orange-500">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Total Overdue</p>
                <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-gray-100">{fmt(collectionsKpis.totalOverdue)}</p>
              </div>
              <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                <AlertCircle className="h-5 w-5 text-orange-500" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">{collectionsKpis.activeCount} active tasks</p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow border-t-4 border-t-red-700">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Critical Priority</p>
                <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-gray-100">{collectionsKpis.critical}</p>
              </div>
              <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-700" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">90+ days overdue</p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow border-t-4 border-t-green-500">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Resolved</p>
                <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-gray-100">{collectionsKpis.resolved}</p>
              </div>
              <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Invoices collected</p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow border-t-4 border-t-blue-500">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Resolution Rate</p>
                <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-gray-100">{collectionsKpis.resolutionRate.toFixed(1)}%</p>
              </div>
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <Target className="h-5 w-5 text-blue-500" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Of all collection tasks</p>
          </CardContent>
        </Card>
      </div>

      {/* Aging buckets + Priority breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Overdue by Aging Bucket</CardTitle>
            <CardDescription>Outstanding amount per aging period</CardDescription>
          </CardHeader>
          <CardContent>
            {agingBuckets.every(b => b.amount === 0) ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No overdue invoices</p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agingBuckets} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} width={65} />
                    <Tooltip formatter={(v: number) => [fmt(v), "Overdue"]} />
                    <Bar dataKey="amount" name="Overdue Amount" radius={[4,4,0,0]}>
                      {agingBuckets.map((b, i) => <Cell key={i} fill={b.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Priority Breakdown</CardTitle>
            <CardDescription>Active collection tasks by urgency</CardDescription>
          </CardHeader>
          <CardContent>
            {priorityData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No active collection tasks</p>
            ) : (
              <div className="flex items-center gap-4">
                <div className="h-48 w-48 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={priorityData} cx="50%" cy="50%"
                        innerRadius={45} outerRadius={72} dataKey="value" paddingAngle={3}>
                        {priorityData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip formatter={(v) => [`${v} tasks`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-3 flex-1">
                  {priorityData.map(p => (
                    <div key={p.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                        <span className="text-gray-700 dark:text-gray-300">{p.name}</span>
                      </div>
                      <span className="font-semibold">{p.value} task{p.value !== 1 ? "s" : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Reports Sub-tab ──────────────────────────────────────────────────────────

function ReportsSubTab({ period }: { period: string }) {
  const { exportToPdf, exportToExcel } = useReportExport();
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownload = async (reportId: string, format: "pdf" | "excel" | "csv") => {
    const key = `${reportId}-${format}`;
    setDownloading(key);
    try {
      if (format === "pdf") {
        await exportToPdf(reportId, { period });
      } else {
        await exportToExcel(reportId, { period, format });
      }
    } finally {
      setDownloading(null);
    }
  };

  const categoryColors: Record<string, string> = {
    Revenue:     "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    Pipeline:    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    Leads:       "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    Clients:     "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    Activity:    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    Collections: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  };

  const formatIcons = {
    pdf:   { icon: FileDown,        label: "PDF",   className: "text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" },
    excel: { icon: FileSpreadsheet, label: "Excel", className: "text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" },
    csv:   { icon: Download,        label: "CSV",   className: "text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20" },
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Download reports for the selected period. All reports reflect live data.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reportDefinitions.map((report) => {
          const Icon = report.icon;
          return (
            <Card key={report.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg shrink-0">
                    <Icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                          {report.title}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {report.description}
                        </p>
                      </div>
                      <Badge className={cn("text-xs shrink-0", categoryColors[report.category])}>
                        {report.category}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-xs text-muted-foreground mr-1">Download as:</span>
                      {report.formats.map((fmtKey) => {
                        const { icon: FmtIcon, label, className } = formatIcons[fmtKey];
                        const key = `${report.id}-${fmtKey}`;
                        const isLoading = downloading === key;
                        return (
                          <Button key={fmtKey} variant="outline" size="sm"
                            className={cn("h-7 px-2.5 text-xs gap-1.5 border", className)}
                            onClick={() => handleDownload(report.id, fmtKey)}
                            disabled={isLoading}>
                            {isLoading
                              ? <span className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full" />
                              : <FmtIcon className="h-3 w-3" />}
                            {label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function SalesReportsTab() {
  const [subTab, setSubTab] = useState<"view" | "reports">("view");
  const [period, setPeriod] = useState("ytd");

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Sales Reports</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Analyse performance metrics and download detailed reports.
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this-month">This Month</SelectItem>
            <SelectItem value="last-month">Last Month</SelectItem>
            <SelectItem value="last-quarter">Last Quarter</SelectItem>
            <SelectItem value="ytd">Year to Date</SelectItem>
            <SelectItem value="last-year">Last Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={subTab} onValueChange={(v) => setSubTab(v as "view" | "reports")}>
        <TabsList className="w-fit">
          <TabsTrigger value="view" className="gap-2">
            <Eye className="h-4 w-4" />
            View
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <FileDown className="h-4 w-4" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="view" className="mt-5">
          <ViewSubTab period={period} />
        </TabsContent>

        <TabsContent value="reports" className="mt-5">
          <ReportsSubTab period={period} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
