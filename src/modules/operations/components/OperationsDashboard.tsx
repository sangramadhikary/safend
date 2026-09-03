'use client';

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Users, MapPin, ClipboardCheck, ShieldCheck, CalendarCheck,
  UserCheck, CalendarOff, Loader2, AlertCircle, Eye,
  ChevronDown, ChevronUp, TrendingUp, TrendingDown, Activity,
  Map as MapIcon, Minimize2, Maximize2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@/integrations/supabase/client";
import { applyBranchScope, getBranchScopeFilter } from "@/utils/branchScope";
import { PostDetailDialog } from "./PostDetailDialog";
import dynamic from 'next/dynamic';
import { cn } from "@/lib/utils";

const PostsMap = dynamic(
  () => import('./dashboard/PostsMap').then(mod => ({ default: mod.PostsMap })),
  { ssr: false, loading: () => <div className="h-[200px] rounded-lg border bg-muted animate-pulse" /> }
);

// Departments considered "office staff" — these are excluded from field manpower.
const OFFICE_DEPARTMENTS = new Set([
  'admin', 'hr', 'human resources', 'finance', 'sales', 'it',
  'accounts', 'management', 'marketing', 'office', 'engineering',
]);

const DESIGNATION_COLORS = [
  '#2563eb', '#dc2626', '#7c3aed', '#f59e0b', '#16a34a', '#0891b2', '#db2777',
];

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ATTENDANCE_META: Record<string, { label: string; color: string; bgColor: string }> = {
  present: { label: 'Present', color: 'text-green-700 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' },
  absent: { label: 'Absent', color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' },
  half_day: { label: 'Half Day', color: 'text-amber-700 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' },
  half_vacant: { label: 'Half Vacant', color: 'text-orange-700 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800' },
  pending: { label: 'Pending', color: 'text-slate-600 dark:text-slate-400', bgColor: 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700' },
};

interface OperationsDashboardProps {
  lastMessage?: { type: string; payload: any } | null;
}

interface PostRow {
  id: string;
  post_name: string;
  post_code: string;
  client_name: string;
  location: any;
  total_guards: number;
  shift_type: string;
  status: string;
}

/**
 * Derive the actual shift type from service_instances data.
 */
function deriveActualShiftType(serviceInstances: any, fallback: string): string {
  if (!serviceInstances || typeof serviceInstances !== 'object') return fallback || '8H';
  for (const key of Object.keys(serviceInstances)) {
    const instances = serviceInstances[key];
    if (!Array.isArray(instances)) continue;
    for (const inst of instances) {
      if (!inst?.shifts) continue;
      const hasEnabledShift = Object.values(inst.shifts).some((s: any) => s?.enabled);
      if (hasEnabledShift && inst.shiftType) {
        return inst.shiftType;
      }
    }
  }
  return fallback || '8H';
}

export function OperationsDashboard(_props: OperationsDashboardProps = {}) {
  const branchKey = getBranchScopeFilter();
  const today = getTodayStr();
  const [viewPostId, setViewPostId] = useState<string | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [showAllPosts, setShowAllPosts] = useState(false);

  // --- Active field manpower + designation breakdown (excludes office staff) ---
  const { data: manpower, isLoading: lManpower } = useQuery({
    queryKey: ['ops-dash', 'field-manpower', branchKey],
    queryFn: async () => {
      let q = supabaseClient
        .from('employees')
        .select('id, designation, department')
        .ilike('status', 'active');
      q = applyBranchScope(q);
      const { data, error } = await q;
      if (error) throw error;

      const field = (data ?? []).filter(
        (e: any) => !OFFICE_DEPARTMENTS.has((e.department ?? '').trim().toLowerCase())
      );
      const byDesignation: Record<string, number> = {};
      field.forEach((e: any) => {
        const key = e.designation?.trim() || 'Unassigned';
        byDesignation[key] = (byDesignation[key] ?? 0) + 1;
      });
      return {
        total: field.length,
        byDesignation: Object.entries(byDesignation)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value),
      };
    },
  });

  // --- Active posts ---
  const { data: posts = [], isLoading: lPosts } = useQuery<PostRow[]>({
    queryKey: ['ops-dash', 'active-posts', branchKey],
    queryFn: async () => {
      let q = supabaseClient
        .from('operational_posts')
        .select('id, post_name, post_code, client_name, location, total_guards, shift_type, service_instances, status')
        .eq('status', 'active')
        .order('post_name', { ascending: true });
      q = applyBranchScope(q);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        shift_type: deriveActualShiftType(row.service_instances, row.shift_type),
      })) as PostRow[];
    },
  });

  // --- Today's rota assignments ---
  const { data: rotaToday, isLoading: lRota } = useQuery({
    queryKey: ['ops-dash', 'rota-today', today],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('rota_assignments')
        .select('post_id')
        .eq('rota_date', today);
      if (error) throw error;
      const rows = data ?? [];
      const postIds = Array.from(new Set(rows.map((r: any) => r.post_id)));
      return { deployed: rows.length, postIds };
    },
  });

  // --- Today's attendance breakdown ---
  const { data: attendanceToday, isLoading: lAtt } = useQuery({
    queryKey: ['ops-dash', 'attendance-today', today],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('shift_attendance')
        .select('status')
        .eq('attendance_date', today);
      if (error) throw error;
      const counts: Record<string, number> = {
        present: 0, absent: 0, half_day: 0, half_vacant: 0, pending: 0,
      };
      (data ?? []).forEach((r: any) => {
        if (r.status in counts) counts[r.status]++;
      });
      return { counts, total: (data ?? []).length };
    },
  });

  // --- Attendance grouped by post (for map) ---
  const { data: attendanceByPost = {}, isLoading: lAttByPost } = useQuery<Record<string, { present: number; absent: number; half_day: number; half_vacant: number; pending: number; total: number }>>({
    queryKey: ['ops-dash', 'attendance-by-post', today],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('shift_attendance')
        .select('post_id, status')
        .eq('attendance_date', today);
      if (error) throw error;
      const map: Record<string, { present: number; absent: number; half_day: number; half_vacant: number; pending: number; total: number }> = {};
      (data ?? []).forEach((r: any) => {
        if (!r.post_id) return;
        if (!map[r.post_id]) {
          map[r.post_id] = { present: 0, absent: 0, half_day: 0, half_vacant: 0, pending: 0, total: 0 };
        }
        map[r.post_id].total++;
        if (r.status in map[r.post_id]) {
          (map[r.post_id] as any)[r.status]++;
        }
      });
      return map;
    },
  });

  // --- Today's patrolling status ---
  const { data: patrolToday, isLoading: lPatrol } = useQuery({
    queryKey: ['ops-dash', 'patrol-today', today],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('patrol_logs')
        .select('id, status')
        .eq('patrol_date', today);
      if (error) throw error;
      return { count: (data ?? []).length };
    },
  });

  // --- Employees currently on leave today ---
  const { data: leaveToday, isLoading: lLeave } = useQuery({
    queryKey: ['ops-dash', 'leave-today', today, branchKey],
    queryFn: async () => {
      const runQuery = (select: string) => {
        let q = supabaseClient
          .from('leave_requests')
          .select(select)
          .eq('status', 'Approved')
          .lte('from_date', today)
          .gte('to_date', today);
        return applyBranchScope(q);
      };

      let { data, error } = await runQuery(
        'leave_type, from_date, to_date, status, employees!leave_requests_employee_id_fkey(name)'
      );
      if (error) {
        ({ data, error } = await runQuery('leave_type, from_date, to_date, status, employee_id'));
        if (error) throw error;
      }

      const rows = (data ?? []).map((r: any) => ({
        employeeName: r.employees?.name || r.employee_id || 'Unknown',
        leaveType: r.leave_type || 'Other',
        toDate: r.to_date,
      }));
      const byType: Record<string, number> = {};
      rows.forEach((r) => {
        byType[r.leaveType] = (byType[r.leaveType] ?? 0) + 1;
      });
      return { rows, total: rows.length, byType };
    },
  });

  // --- Derived top-level stats ---
  const activeManpower = manpower?.total ?? 0;
  const activePosts = posts.length;
  const requiredManpower = posts.reduce((s, p) => s + (Number(p.total_guards) || 0), 0);
  const deployed = rotaToday?.deployed ?? 0;
  const vacancyPct = requiredManpower > 0
    ? Math.max(0, Math.min(100, Math.round(((requiredManpower - deployed) / requiredManpower) * 100)))
    : 0;
  const patrolCount = patrolToday?.count ?? 0;
  const rotaCompletionPct = activePosts > 0
    ? Math.round(((rotaToday?.postIds.length ?? 0) / activePosts) * 100)
    : 0;
  const onLeaveCount = leaveToday?.total ?? 0;

  // Posts to display in table
  const displayedPosts = showAllPosts ? posts : posts.slice(0, 5);

  return (
    <div className="space-y-5">
      {/* ─── Header with live indicator ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight">Ground Reality</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Live field operations overview for today</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <span className="text-xs text-muted-foreground font-medium">Live</span>
        </div>
      </div>

      {/* ─── Hero Stats Grid ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <HeroStat
          icon={<Users className="h-5 w-5" />}
          iconBg="bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400"
          value={lManpower ? '—' : activeManpower}
          label="Field Manpower"
          subtext={`${manpower?.byDesignation.length ?? 0} designations`}
          loading={lManpower}
        />
        <HeroStat
          icon={<MapPin className="h-5 w-5" />}
          iconBg="bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400"
          value={lPosts ? '—' : activePosts}
          label="Active Posts"
          subtext={`${requiredManpower} guards required`}
          loading={lPosts}
        />
        <HeroStat
          icon={<Activity className="h-5 w-5" />}
          iconBg={vacancyPct > 20 ? "bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400" : "bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400"}
          value={lPosts || lRota ? '—' : `${100 - vacancyPct}%`}
          label="Deployment Rate"
          subtext={`${deployed}/${requiredManpower} deployed`}
          loading={lPosts || lRota}
          trend={vacancyPct <= 10 ? 'up' : vacancyPct >= 30 ? 'down' : undefined}
        />
        <HeroStat
          icon={<ShieldCheck className="h-5 w-5" />}
          iconBg={patrolCount > 0 ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400" : "bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400"}
          value={lPatrol ? '—' : (patrolCount > 0 ? `${patrolCount}` : '0')}
          label="Patrols Today"
          subtext={patrolCount > 0 ? 'Completed' : 'Not started'}
          loading={lPatrol}
        />
        <HeroStat
          icon={<CalendarOff className="h-5 w-5" />}
          iconBg={onLeaveCount > 5 ? "bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400" : "bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400"}
          value={lLeave ? '—' : onLeaveCount}
          label="On Leave"
          subtext="Approved today"
          loading={lLeave}
        />
      </div>

      {/* ─── Main Content: Two-column layout ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Left Column: Key Operational Metrics */}
        <div className="xl:col-span-2 space-y-4">
          {/* Attendance + Rota Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Attendance Overview */}
            <Card className="border-0 shadow-xs bg-white dark:bg-gray-900">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4 text-blue-600" />
                  Today's Attendance
                  {!lAtt && (attendanceToday?.total ?? 0) > 0 && (
                    <Badge variant="outline" className="ml-auto text-[10px] font-normal">
                      {attendanceToday?.total} marked
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {lAtt ? (
                  <div className="h-24 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (attendanceToday?.total ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No attendance marked yet today.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(ATTENDANCE_META).map(([key, meta]) => (
                      <div key={key} className={cn("rounded-lg border p-2 text-center transition-colors", meta.bgColor)}>
                        <p className={cn("text-lg font-bold tabular-nums", meta.color)}>
                          {attendanceToday?.counts[key] ?? 0}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-medium">{meta.label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Rota Completion */}
            <Card className="border-0 shadow-xs bg-white dark:bg-gray-900">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                  Rota Coverage
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {lRota || lPosts ? (
                  <div className="h-24 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-end justify-between">
                      <div>
                        <span className="text-3xl font-bold tabular-nums">{rotaCompletionPct}%</span>
                        <span className="text-sm text-muted-foreground ml-1">coverage</span>
                      </div>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {rotaToday?.postIds.length ?? 0}/{activePosts} posts
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-700 ease-out",
                          rotaCompletionPct >= 80 ? "bg-emerald-500" : rotaCompletionPct >= 50 ? "bg-amber-500" : "bg-red-500"
                        )}
                        style={{ width: `${rotaCompletionPct}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {deployed} personnel deployed across {rotaToday?.postIds.length ?? 0} posts
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Expandable Map */}
          <Card className="border-0 shadow-xs bg-white dark:bg-gray-900 overflow-hidden">
            <CardHeader className="pb-0 pt-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MapIcon className="h-4 w-4 text-violet-600" />
                  Post Locations
                  <Badge variant="outline" className="text-[10px] font-normal ml-1">
                    {posts.filter(p => p.location?.latitude && p.location?.longitude).length} mapped
                  </Badge>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setMapExpanded(!mapExpanded)}
                  aria-label={mapExpanded ? "Collapse map" : "Expand map"}
                >
                  {mapExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3">
              <div
                className={cn(
                  "transition-all duration-500 ease-in-out overflow-hidden rounded-lg",
                  mapExpanded ? "h-[500px]" : "h-[200px]"
                )}
              >
                <PostsMap
                  posts={posts}
                  attendanceByPost={attendanceByPost}
                  isLoading={lPosts || lAttByPost}
                  onViewDetails={(postId) => setViewPostId(postId)}
                />
              </div>
              {/* Map Legend — compact */}
              <div className="flex flex-wrap items-center gap-3 mt-2 px-1">
                {[
                  { color: '#16A34A', label: 'All Present' },
                  { color: '#F59E0B', label: 'Partial' },
                  { color: '#DC2626', label: 'Absent' },
                  { color: '#6B7280', label: 'Pending' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Posts Table — compact */}
          <Card className="border-0 shadow-xs bg-white dark:bg-gray-900">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-rose-600" />
                  Posts Overview
                </CardTitle>
                {posts.length > 5 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setShowAllPosts(!showAllPosts)}
                  >
                    {showAllPosts ? 'Show Less' : `View All (${posts.length})`}
                    {showAllPosts ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {lPosts ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
              ) : posts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No active posts.</p>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs">Post</TableHead>
                        <TableHead className="text-xs">Client</TableHead>
                        <TableHead className="text-xs text-center">Strength</TableHead>
                        <TableHead className="text-xs text-center">Shift</TableHead>
                        <TableHead className="text-xs text-center">Status</TableHead>
                        <TableHead className="text-xs text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedPosts.map((post) => {
                        const hasRota = rotaToday?.postIds.includes(post.id);
                        const attData = attendanceByPost[post.id];
                        const attStatus = attData
                          ? attData.present === attData.total
                            ? 'full'
                            : attData.present > 0
                            ? 'partial'
                            : 'none'
                          : 'unknown';
                        return (
                          <TableRow key={post.id} className="hover:bg-muted/20">
                            <TableCell className="py-2">
                              <div>
                                <span className="font-medium text-sm">{post.post_name}</span>
                                {post.post_code && (
                                  <span className="text-[10px] text-muted-foreground ml-1">({post.post_code})</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground py-2">{post.client_name || '—'}</TableCell>
                            <TableCell className="text-center py-2">
                              <span className="text-sm font-medium tabular-nums">{post.total_guards || 0}</span>
                            </TableCell>
                            <TableCell className="text-center py-2">
                              <Badge variant="outline" className="text-[10px] px-1.5">{post.shift_type || '—'}</Badge>
                            </TableCell>
                            <TableCell className="text-center py-2">
                              <div className="flex items-center justify-center gap-1">
                                {lRota ? (
                                  <span className="text-xs text-muted-foreground">—</span>
                                ) : hasRota ? (
                                  <span className={cn(
                                    "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                                    attStatus === 'full' ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" :
                                    attStatus === 'partial' ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" :
                                    attStatus === 'none' ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" :
                                    "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                                  )}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                    {attStatus === 'full' ? 'Active' : attStatus === 'partial' ? 'Partial' : attStatus === 'none' ? 'Absent' : 'Planned'}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                    No Rota
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right py-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => setViewPostId(post.id)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Quick Info Panels */}
        <div className="space-y-4">
          {/* Active Personnel Breakdown */}
          <Card className="border-0 shadow-xs bg-white dark:bg-gray-900">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-blue-600" />
                Personnel Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {lManpower ? (
                <div className="h-32 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (manpower?.byDesignation.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No active field personnel.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {(manpower?.byDesignation ?? []).slice(0, 6).map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between py-1.5 group">
                      <span className="flex items-center gap-2 text-sm">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: DESIGNATION_COLORS[i % DESIGNATION_COLORS.length] }}
                        />
                        <span className="truncate max-w-[140px]">{d.name}</span>
                      </span>
                      <span className="font-semibold text-sm tabular-nums">{d.value}</span>
                    </div>
                  ))}
                  {(manpower?.byDesignation.length ?? 0) > 6 && (
                    <p className="text-[10px] text-muted-foreground pt-1 text-center">
                      +{(manpower?.byDesignation.length ?? 0) - 6} more designations
                    </p>
                  )}
                  <div className="flex items-center justify-between pt-2 mt-1 border-t">
                    <span className="text-sm font-medium">Total</span>
                    <span className="font-bold tabular-nums">{activeManpower}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Leave Summary */}
          <Card className="border-0 shadow-xs bg-white dark:bg-gray-900">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarOff className="h-4 w-4 text-amber-600" />
                On Leave Today
                {!lLeave && onLeaveCount > 0 && (
                  <Badge className="ml-auto bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 text-[10px] border-0">
                    {onLeaveCount}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {lLeave ? (
                <div className="h-20 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : onLeaveCount === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No staff on leave today.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(leaveToday?.byType ?? {}).map(([type, count]) => (
                      <Badge key={type} variant="outline" className="text-[10px]">
                        {type}: {count}
                      </Badge>
                    ))}
                  </div>
                  <div className="max-h-32 overflow-auto space-y-1">
                    {(leaveToday?.rows ?? []).slice(0, 5).map((r, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-b-0 border-dashed">
                        <span className="truncate max-w-[120px] font-medium">{r.employeeName}</span>
                        <Badge variant="outline" className="text-[9px] shrink-0">{r.leaveType}</Badge>
                      </div>
                    ))}
                    {(leaveToday?.rows.length ?? 0) > 5 && (
                      <p className="text-[10px] text-muted-foreground text-center pt-1">
                        +{(leaveToday?.rows.length ?? 0) - 5} more
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Alerts / Issues */}
          <Card className="border-0 shadow-xs bg-white dark:bg-gray-900">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                Attention Required
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {/* Posts without rota */}
                {!lRota && !lPosts && (() => {
                  const unplannedPosts = posts.filter(p => !rotaToday?.postIds.includes(p.id));
                  if (unplannedPosts.length === 0) return null;
                  return (
                    <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                      <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-red-700 dark:text-red-400">
                          {unplannedPosts.length} post{unplannedPosts.length > 1 ? 's' : ''} without rota
                        </p>
                        <p className="text-[10px] text-red-600/70 dark:text-red-400/60">
                          {unplannedPosts.slice(0, 3).map(p => p.post_name).join(', ')}
                          {unplannedPosts.length > 3 ? ` +${unplannedPosts.length - 3} more` : ''}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* High vacancy */}
                {!lRota && !lPosts && vacancyPct > 20 && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
                    <TrendingDown className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        High vacancy rate ({vacancyPct}%)
                      </p>
                      <p className="text-[10px] text-amber-600/70 dark:text-amber-400/60">
                        {requiredManpower - deployed} positions unfilled
                      </p>
                    </div>
                  </div>
                )}

                {/* Patrol not done */}
                {!lPatrol && patrolCount === 0 && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700">
                    <ShieldCheck className="h-3.5 w-3.5 text-slate-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        No patrols recorded yet
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Field patrolling has not started today
                      </p>
                    </div>
                  </div>
                )}

                {/* All good state */}
                {!lRota && !lPosts && !lPatrol && 
                  vacancyPct <= 20 && patrolCount > 0 && 
                  posts.filter(p => !rotaToday?.postIds.includes(p.id)).length === 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 text-center justify-center">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      All operations running smoothly
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <PostDetailDialog postId={viewPostId} onClose={() => setViewPostId(null)} />
    </div>
  );
}

// ─── Hero Stat Component ─────────────────────────────────────────────────────

function HeroStat({
  icon,
  iconBg,
  value,
  label,
  subtext,
  loading,
  trend,
}: {
  icon: React.ReactNode;
  iconBg: string;
  value: React.ReactNode;
  label: string;
  subtext?: string;
  loading?: boolean;
  trend?: 'up' | 'down';
}) {
  return (
    <Card className="border-0 shadow-xs bg-white dark:bg-gray-900 hover:shadow-md transition-shadow">
      <CardContent className="p-3.5">
        <div className="flex items-start justify-between mb-2">
          <div className={cn("p-2 rounded-lg", iconBg)}>
            {icon}
          </div>
          {trend && (
            <span className={cn(
              "text-[10px] flex items-center gap-0.5 font-medium",
              trend === 'up' ? "text-emerald-600" : "text-red-500"
            )}>
              {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            </span>
          )}
        </div>
        {loading ? (
          <div className="h-8 w-12 rounded bg-muted animate-pulse mt-1" />
        ) : (
          <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5 font-medium">{label}</p>
        {subtext && <p className="text-[10px] text-muted-foreground/70">{subtext}</p>}
      </CardContent>
    </Card>
  );
}
