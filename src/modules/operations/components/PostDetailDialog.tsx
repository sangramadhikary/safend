'use client';

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  MapPin, Building2, Calendar as CalendarIcon, Users, Shield, Clock, Phone, Mail,
  IndianRupee, TrendingUp, CheckCircle2, XCircle, AlertCircle, Loader2,
  ClipboardList, CalendarCheck, ShieldCheck, AlertTriangle, UtensilsCrossed,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@/integrations/supabase/client";
import { format, startOfDay, subDays, differenceInDays } from "date-fns";
import { PostServiceDisplay } from "./PostServiceDisplay";
import { buildMapsEmbedUrl, GOOGLE_MAPS_EMBED_KEY } from "@/lib/googleMaps";
import { BrandedPostCode } from "@/components/attendance/BrandedPostCode";
import type { OperationalPost } from "@/services/supabase/OperationalPostService";

interface SalaryRate {
  post_id: string;
  designation: string;
  monthly_salary: number;
}

const SERVICE_LABELS: Record<string, string> = {
  unarmedGuards: 'Unarmed Guards',
  armedGuards: 'Armed Guards',
  supervisors: 'Supervisors',
  patrolOfficers: 'Patrol Officers',
  pso: 'PSO',
  bouncers: 'Bouncers',
  manpower: 'Manpower',
  eventSecurity: 'Event Security',
  personalSecurity: 'Personal Security',
};

const SHIFT_LABELS: Record<string, string> = {
  day: 'Day', afternoon: 'Afternoon', night: 'Night',
};

function monthLabel(ym: string): string {
  // ym = "YYYY-MM"
  const [y, m] = ym.split('-').map(Number);
  return format(new Date(y, (m || 1) - 1, 1), 'MMM yyyy');
}

// Map a raw operational_posts row to the shape the display components expect.
function mapRowToPost(row: any): OperationalPost {
  return {
    id: row.id,
    quotationId: row.quotation_id || '',
    workOrderId: row.work_order_id,
    postCode: row.post_code || '',
    postName: row.post_name || '',
    clientName: row.client_name || '',
    contactPerson: row.contact_person,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    location: row.location || {},
    totalGuards: row.total_guards || 0,
    shiftType: row.shift_type || '8H',
    securityServices: row.security_services || {},
    serviceInstances: row.service_instances,
    gstNumber: row.gst_number,
    gstPercentage: row.gst_percentage,
    gstExempt: row.gst_exempt,
    status: row.status || 'active',
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
  } as OperationalPost;
}

export function PostDetailDialog({
  postId,
  onClose,
}: {
  postId: string | null;
  onClose: () => void;
}) {
  const [post, setPost] = useState<OperationalPost | null>(null);
  const [salaryRates, setSalaryRates] = useState<SalaryRate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!postId) {
      setPost(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [postRes, ratesRes] = await Promise.all([
          supabaseClient.from('operational_posts').select('*').eq('id', postId).maybeSingle(),
          supabaseClient.from('post_salary_rates').select('post_id, designation, monthly_salary').eq('post_id', postId),
        ]);
        if (cancelled) return;
        setPost(postRes.data ? mapRowToPost(postRes.data) : null);
        setSalaryRates((ratesRes.data as SalaryRate[]) || []);
      } catch {
        if (!cancelled) { setPost(null); setSalaryRates([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [postId]);

  const locationQuery = post
    ? encodeURIComponent(
        [post.location?.address, post.location?.city, post.location?.state, post.location?.pincode]
          .filter(Boolean).join(', ')
      )
    : '';

  // Use exact coordinates if available (pinpointed on map during WO creation)
  const hasExactLocation = !!(post?.location?.latitude && post?.location?.longitude);
  const mapEmbedUrl = post
    ? hasExactLocation
      ? `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_EMBED_KEY}&q=${post.location!.latitude},${post.location!.longitude}&zoom=17`
      : locationQuery ? buildMapsEmbedUrl(locationQuery) : ''
    : '';

  return (
    <Dialog open={!!postId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden p-0" aria-describedby="post-detail-description">
        {loading || !post ? (
          <div className="flex items-center justify-center h-[400px]">
            <DialogHeader className="sr-only">
              <DialogTitle>Post details</DialogTitle>
            </DialogHeader>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] h-full">
            {/* Left: Post details with tabs */}
            <div className="p-6 overflow-y-auto max-h-[85vh]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-[#D71920]" />
                  {post.postName}
                </DialogTitle>
                <div id="post-detail-description" className="text-sm text-muted-foreground flex flex-wrap items-center gap-2 mt-1">
                  <Building2 className="h-3.5 w-3.5" />{post.clientName}
                  {post.postCode && <Badge variant="outline" className="text-xs">{post.postCode}</Badge>}
                </div>
              </DialogHeader>

              <Tabs defaultValue="overview" className="mt-4">
                <TabsList className="flex flex-wrap h-auto justify-start gap-1">
                  <TabsTrigger value="overview" className="gap-1.5"><Building2 className="h-3.5 w-3.5" />Overview</TabsTrigger>
                  <TabsTrigger value="rota" className="gap-1.5"><CalendarCheck className="h-3.5 w-3.5" />Rota &amp; Attendance</TabsTrigger>
                  <TabsTrigger value="records" className="gap-1.5"><ClipboardList className="h-3.5 w-3.5" />Records</TabsTrigger>
                </TabsList>

                {/* ── Overview ── */}
                <TabsContent value="overview" className="space-y-6 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg border p-4 space-y-2">
                      <h5 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4 text-[#D71920]" /> Post Location
                      </h5>
                      <div className="space-y-1 text-sm">
                        {post.location?.address && <p className="font-medium">{post.location.address}</p>}
                        <p className="text-muted-foreground">
                          {[post.location?.city, post.location?.state, post.location?.pincode].filter(Boolean).join(', ') || 'No address details'}
                        </p>
                        {hasExactLocation && (
                          <div className="flex items-center gap-1.5 mt-2">
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                              <MapPin className="h-3 w-3 mr-1" />
                              Post Exact Location
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {post.location!.latitude!.toFixed(6)}, {post.location!.longitude!.toFixed(6)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border p-4 space-y-2">
                      <h5 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground">
                        <CalendarIcon className="h-4 w-4 text-[#D71920]" /> Engagement
                      </h5>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Working since</span>
                          <span className="font-medium">{post.createdAt ? format(new Date(post.createdAt), 'dd MMM yyyy') : '—'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Days with client</span>
                          <span className="text-2xl font-bold text-[#D71920]">{post.createdAt ? differenceInDays(new Date(), new Date(post.createdAt)) : '—'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {(post.contactPerson || post.contactPhone || post.contactEmail) && (
                    <div className="rounded-lg border p-4 space-y-2">
                      <h5 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground">
                        <Users className="h-4 w-4 text-[#D71920]" /> Client Contact
                      </h5>
                      <div className="flex flex-wrap gap-4 text-sm">
                        {post.contactPerson && (
                          <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-medium">{post.contactPerson}</span></span>
                        )}
                        {post.contactPhone && (
                          <span className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3.5 w-3.5" />{post.contactPhone}</span>
                        )}
                        {post.contactEmail && (
                          <span className="flex items-center gap-1.5 text-muted-foreground"><Mail className="h-3.5 w-3.5" />{post.contactEmail}</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-[#D71920]" /> Duty Structure &amp; Service Requirements
                    </h5>
                    <PostServiceDisplay post={post} />
                  </div>

                  <PostSalaryInfo postId={post.id || ''} salaryRates={salaryRates} />
                  <PostPerformanceInfo postId={post.id || ''} />

                  {/* Attendance Code — branded, HMAC-signed */}
                  <div>
                    <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-[#D71920]" /> Attendance Code
                    </h5>
                    <BrandedPostCode postId={post.id || ''} postName={post.postName} postCode={post.postCode} clientName={post.clientName} />
                  </div>
                </TabsContent>

                {/* ── Rota & Attendance ── */}
                <TabsContent value="rota" className="mt-4">
                  <RotaAttendanceTab postId={post.id || ''} />
                </TabsContent>

                {/* ── Patrol, Penalty & Mess ── */}
                <TabsContent value="records" className="mt-4 space-y-6">
                  <section>
                    <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-[#D71920]" /> Patrolling
                    </h5>
                    <PatrolTab postName={post.postName} location={post.location} />
                  </section>
                  <section>
                    <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-[#D71920]" /> Penalties
                    </h5>
                    <PenaltyTab postId={post.id || ''} />
                  </section>
                  <section>
                    <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <UtensilsCrossed className="h-4 w-4 text-[#D71920]" /> Mess
                    </h5>
                    <MessTab postId={post.id || ''} />
                  </section>
                </TabsContent>
              </Tabs>
            </div>

            {/* Right: Map */}
            <div className="hidden lg:flex flex-col border-l bg-gray-50 dark:bg-gray-900">
              <div className="p-3 border-b bg-white dark:bg-gray-800">
                <h5 className="font-semibold text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[#D71920]" />
                  {hasExactLocation ? 'Post Exact Location' : 'Location Map'}
                </h5>
                {hasExactLocation && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Pinpointed during work order creation
                  </p>
                )}
              </div>
              <div className="flex-1 min-h-[400px]">
                {mapEmbedUrl ? (
                  <iframe
                    title="Post Location"
                    width="100%"
                    height="100%"
                    style={{ border: 0, minHeight: '400px' }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={mapEmbedUrl}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    <div className="text-center">
                      <MapPin className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p>No location data available</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Shared loading / empty helpers ──────────────────────────────────────────

function TabLoading() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 flex flex-col items-center justify-center text-center text-muted-foreground">
      {icon}
      <p className="text-sm mt-2">{message}</p>
    </div>
  );
}

// ─── Rota & Attendance tab ───────────────────────────────────────────────────

function RotaAttendanceTab({ postId }: { postId: string }) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);

  const monthStart = `${selectedMonth}-01`;
  const [yy, mm] = selectedMonth.split('-').map(Number);
  const lastDay = new Date(yy, mm, 0).getDate();
  const monthEnd = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

  const { data, isLoading } = useQuery({
    queryKey: ['post-detail', 'rota-attendance', postId, selectedMonth],
    enabled: !!postId && !!selectedMonth,
    queryFn: async () => {
      const [rotaRes, attRes] = await Promise.all([
        supabaseClient
          .from('rota_assignments')
          .select('rota_date, employee_name, employee_code, service_type_key, shift_key')
          .eq('post_id', postId)
          .gte('rota_date', monthStart)
          .lte('rota_date', monthEnd)
          .order('rota_date', { ascending: false }),
        supabaseClient
          .from('shift_attendance')
          .select('attendance_date, employee_name, status')
          .eq('post_id', postId)
          .gte('attendance_date', monthStart)
          .lte('attendance_date', monthEnd)
          .order('attendance_date', { ascending: false }),
      ]);
      if (rotaRes.error) throw rotaRes.error;
      if (attRes.error) throw attRes.error;

      const rotaRows = rotaRes.data ?? [];
      // Latest rota date within the month → roster for that month
      const latestDate = rotaRows[0]?.rota_date ?? null;
      const assigned = latestDate
        ? rotaRows.filter((r: any) => r.rota_date === latestDate)
        : [];

      // Month totals + day-wise breakdown
      const totals = { present: 0, absent: 0, half_day: 0, half_vacant: 0, pending: 0, total: 0 };
      const byDay: Record<string, Record<string, number>> = {};
      (attRes.data ?? []).forEach((r: any) => {
        const d = r.attendance_date;
        if (!d) return;
        if (!byDay[d]) byDay[d] = { present: 0, absent: 0, half_day: 0, half_vacant: 0, pending: 0, total: 0 };
        if (r.status in byDay[d]) { byDay[d][r.status]++; (totals as any)[r.status]++; }
        byDay[d].total++;
        totals.total++;
      });
      const days = Object.entries(byDay)
        .map(([date, c]) => ({ date, ...c }))
        .sort((a, b) => b.date.localeCompare(a.date));

      return { latestDate, assigned, totals, days };
    },
  });

  const totals = data?.totals ?? { present: 0, absent: 0, half_day: 0, half_vacant: 0, pending: 0, total: 0 };
  const half = totals.half_day + totals.half_vacant;
  const rate = totals.total > 0 ? Math.round(((totals.present + half * 0.5) / totals.total) * 100) : 0;
  const assigned = data?.assigned ?? [];
  const days = data?.days ?? [];

  return (
    <div className="space-y-6">
      {/* Month picker */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-[#D71920]" /> Select Month
        </label>
        <input
          type="month"
          value={selectedMonth}
          max={defaultMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-ring"
        />
        <span className="text-sm text-muted-foreground">Showing details for {monthLabel(selectedMonth)}</span>
      </div>

      {isLoading ? (
        <TabLoading />
      ) : (
        <>
          {/* Assigned personnel */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h5 className="font-semibold text-sm flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-[#D71920]" /> Assigned Personnel
              </h5>
              {data?.latestDate && (
                <span className="text-xs text-muted-foreground">
                  Roster as of {format(new Date(data.latestDate), 'dd MMM yyyy')}
                </span>
              )}
            </div>
            {assigned.length === 0 ? (
              <EmptyState icon={<ClipboardList className="h-7 w-7" />} message={`No rota assignments in ${monthLabel(selectedMonth)}.`} />
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>Shift</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assigned.map((r: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.employee_name || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.employee_code || '—'}</TableCell>
                        <TableCell>{SERVICE_LABELS[r.service_type_key] || r.service_type_key || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{SHIFT_LABELS[r.shift_key] || r.shift_key || '—'}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Attendance for selected month */}
          <div>
            <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-[#D71920]" /> Attendance — {monthLabel(selectedMonth)}
            </h5>
            {days.length === 0 ? (
              <EmptyState icon={<CalendarCheck className="h-7 w-7" />} message={`No attendance recorded in ${monthLabel(selectedMonth)}.`} />
            ) : (
              <div className="space-y-3">
                {/* Month summary cards */}
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  <SummaryCard label="Rate" value={`${rate}%`} className="text-green-600" />
                  <SummaryCard label="Present" value={totals.present} />
                  <SummaryCard label="Absent" value={totals.absent} className="text-red-600" />
                  <SummaryCard label="Half" value={half} className="text-amber-600" />
                  <SummaryCard label="Pending" value={totals.pending} />
                </div>
                {/* Day-wise breakdown */}
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-center">Present</TableHead>
                        <TableHead className="text-center">Absent</TableHead>
                        <TableHead className="text-center">Half</TableHead>
                        <TableHead className="text-center">Pending</TableHead>
                        <TableHead className="text-center">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {days.map((d: any) => (
                        <TableRow key={d.date}>
                          <TableCell className="font-medium">{format(new Date(d.date), 'dd MMM (EEE)')}</TableCell>
                          <TableCell className="text-center text-green-600">{d.present}</TableCell>
                          <TableCell className="text-center text-red-600">{d.absent}</TableCell>
                          <TableCell className="text-center text-amber-600">{(d.half_day || 0) + (d.half_vacant || 0)}</TableCell>
                          <TableCell className="text-center text-muted-foreground">{d.pending}</TableCell>
                          <TableCell className="text-center">{d.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="rounded-lg border p-2.5 text-center">
      <div className={`text-xl font-bold ${className ?? ''}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

// ─── Patrolling tab ──────────────────────────────────────────────────────────

function PatrolTab({ postName, location }: { postName: string; location: any }) {
  const { data, isLoading } = useQuery({
    queryKey: ['post-detail', 'patrol', postName],
    enabled: !!postName,
    queryFn: async () => {
      // patrol_logs are not linked to a post by id — match on the site name.
      const terms = [postName, location?.city].filter(Boolean) as string[];
      const orFilter = terms.map((t) => `sites_visited.ilike.%${t}%`).join(',');
      let query = supabaseClient
        .from('patrol_logs')
        .select('patrol_date, officer_name, sites_visited, status, issues_found, observations')
        .order('patrol_date', { ascending: false })
        .limit(100);
      if (orFilter) query = query.or(orFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <TabLoading />;
  const rows = data ?? [];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Patrol visits matched by site name. Patrol logs are recorded against site names rather than post IDs.
      </p>
      {rows.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="h-7 w-7" />} message="No patrolling records found for this post." />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Officer</TableHead>
                <TableHead>Sites Visited</TableHead>
                <TableHead>Issues</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="text-sm">{r.patrol_date ? format(new Date(r.patrol_date), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="font-medium">{r.officer_name || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate" title={r.sites_visited}>{r.sites_visited || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate" title={r.issues_found}>{r.issues_found || '—'}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-xs">{r.status || '—'}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Penalties tab ───────────────────────────────────────────────────────────

function PenaltyTab({ postId }: { postId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['post-detail', 'penalties', postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('penalties')
        .select('violation_date, staff_name, offense, offense_type, status, source_of_information')
        .eq('post_id', postId)
        .order('violation_date', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <TabLoading />;
  const rows = data ?? [];

  if (rows.length === 0) {
    return <EmptyState icon={<AlertTriangle className="h-7 w-7" />} message="No penalties recorded for this post." />;
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Staff</TableHead>
            <TableHead>Offense</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r: any, i: number) => (
            <TableRow key={i}>
              <TableCell className="text-sm">{r.violation_date ? format(new Date(r.violation_date), 'dd MMM yyyy') : '—'}</TableCell>
              <TableCell className="font-medium">{r.staff_name || '—'}</TableCell>
              <TableCell>{r.offense || '—'}</TableCell>
              <TableCell><Badge variant="outline" className="text-xs">{r.offense_type || '—'}</Badge></TableCell>
              <TableCell className="text-center"><Badge className="bg-amber-500 text-xs">{r.status || '—'}</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Mess tab ────────────────────────────────────────────────────────────────

function MessTab({ postId }: { postId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['post-detail', 'mess', postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('mess_meal_records')
        .select('created_at, employee_name, meal_count, per_meal_cost, total_charge')
        .eq('post_id', postId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <TabLoading />;
  const rows = data ?? [];

  if (rows.length === 0) {
    return <EmptyState icon={<UtensilsCrossed className="h-7 w-7" />} message="No mess records found for this post." />;
  }

  const totalMeals = rows.reduce((s: number, r: any) => s + (r.meal_count || 0), 0);
  const totalCharge = rows.reduce((s: number, r: any) => s + (Number(r.total_charge) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">Total meals: {totalMeals}</Badge>
        <Badge variant="outline">Total charge: ₹{totalCharge.toLocaleString('en-IN')}</Badge>
      </div>
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead className="text-center">Meals</TableHead>
              <TableHead className="text-right">Per Meal</TableHead>
              <TableHead className="text-right">Total Charge</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r: any, i: number) => (
              <TableRow key={i}>
                <TableCell className="text-sm">{r.created_at ? format(new Date(r.created_at), 'dd MMM yyyy') : '—'}</TableCell>
                <TableCell className="font-medium">{r.employee_name || '—'}</TableCell>
                <TableCell className="text-center">{r.meal_count ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums">{r.per_meal_cost != null ? `₹${Number(r.per_meal_cost).toLocaleString('en-IN')}` : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{r.total_charge != null ? `₹${Number(r.total_charge).toLocaleString('en-IN')}` : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Salary & Performance (Overview) ─────────────────────────────────────────

function PostSalaryInfo({ postId, salaryRates }: { postId: string; salaryRates: SalaryRate[] }) {
  const rates = salaryRates.filter(r => r.post_id === postId && r.monthly_salary > 0);

  if (rates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-900/10 p-4">
        <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-4 w-4" />
          <span>No salary rates defined for this post. Define in HR → Payroll &amp; Salary → Post-wise Salary.</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <IndianRupee className="h-4 w-4 text-[#D71920]" /> Assigned Salary Rates
      </h5>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b">
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Designation</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Monthly Salary</th>
              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Daily Rate (this month)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rates.map(r => {
              const now = new Date();
              const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
              const dailyRate = r.monthly_salary / daysInMonth;
              return (
                <tr key={r.designation} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-2.5 font-medium">{r.designation}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">₹{r.monthly_salary.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">₹{dailyRate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs opacity-60">({daysInMonth}d)</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PostPerformanceInfo({ postId }: { postId: string }) {
  const [stats, setStats] = useState<{ totalSlots: number; present: number; absent: number; halfDay: number; pending: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const today = format(startOfDay(new Date()), 'yyyy-MM-dd');
        const ninetyDaysAgo = format(subDays(startOfDay(new Date()), 90), 'yyyy-MM-dd');
        const { data } = await supabaseClient
          .from('attendance_records')
          .select('status')
          .eq('post_id', postId)
          .gte('attendance_date', ninetyDaysAgo)
          .lte('attendance_date', today);

        if (cancelled) return;

        if (data && data.length > 0) {
          const present = data.filter((d: any) => d.status === 'present').length;
          const absent = data.filter((d: any) => d.status === 'absent').length;
          const halfDay = data.filter((d: any) => d.status === 'half_day' || d.status === 'half_vacant').length;
          const pending = data.filter((d: any) => d.status === 'pending').length;
          setStats({ totalSlots: data.length, present, absent, halfDay, pending });
        } else {
          setStats(null);
        }
      } catch {
        setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [postId]);

  if (loading) {
    return (
      <div className="rounded-lg border p-4 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-lg border border-dashed p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          <span>No attendance data available for the last 90 days.</span>
        </div>
      </div>
    );
  }

  const attendanceRate = stats.totalSlots > 0 ? Math.round(((stats.present + stats.halfDay * 0.5) / stats.totalSlots) * 100) : 0;

  return (
    <div>
      <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-[#D71920]" /> Performance (Last 90 Days)
      </h5>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{attendanceRate}%</div>
          <div className="text-xs text-muted-foreground mt-0.5">Attendance Rate</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-2xl font-bold">{stats.present}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Present</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-2xl font-bold">{stats.absent}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Absent</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-2xl font-bold">{stats.halfDay}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Half Day</div>
        </div>
      </div>
      {stats.pending > 0 && (
        <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {stats.pending} slot{stats.pending > 1 ? 's' : ''} still pending attendance marking
        </p>
      )}
    </div>
  );
}
