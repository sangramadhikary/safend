'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PostInfoDialog — reference view for a single post
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Extracted from `Deployments.tsx`, where it accounted for roughly a fifth of the
 * file while having nothing to do with assigning staff. It is a read-only
 * reference panel, so it belongs beside the other rota components rather than
 * inside the editor.
 *
 * The extraction surfaced a live bug: the performance panel read from
 * `attendance_records`, which is the legacy table with no post dimension. Filtered
 * by `post_id` it always matched zero rows, so every post in the system reported
 * "No attendance data available for the last 90 days". Post-wise attendance lives
 * in `shift_attendance`.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  MapPin, Building2, Calendar as CalendarIcon, Users, Shield, Clock, Phone, Mail,
  AlertCircle, IndianRupee, TrendingUp, CheckCircle2, XCircle,
} from 'lucide-react';
import { format, startOfDay, subDays, differenceInDays } from 'date-fns';
import { supabaseClient } from '@/integrations/supabase/client';
import { applyBranchScope } from '@/utils/branchScope';
import { buildMapsEmbedUrl } from '@/lib/googleMaps';
import { CountUp } from '@/components/dashboard/CountUp';
import type { OperationalPost } from '@/services/supabase/OperationalPostService';
import { PostServiceDisplay } from '../PostServiceDisplay';

export interface PostSalaryRate {
  post_id: string;
  designation: string;
  monthly_salary: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Salary rates
// ─────────────────────────────────────────────────────────────────────────────

export function PostSalaryInfo({
  postId, postSalaryRates, loading,
}: { postId: string; postSalaryRates: PostSalaryRate[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="rounded-lg border p-4 flex items-center justify-center">
        <div className="safend-loader" style={{ transform: 'scale(0.75)' }} />
      </div>
    );
  }

  const rates = postSalaryRates.filter((r) => r.post_id === postId && r.monthly_salary > 0);

  if (rates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-900/10 p-4">
        <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>No salary rates defined for this post. Define them in HR → Payroll &amp; Salary → Post-wise Salary.</span>
        </div>
      </div>
    );
  }

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  return (
    <div>
      <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <IndianRupee className="h-4 w-4 text-[#D71920]" />
        Assigned Salary Rates
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
            {rates.map((r) => (
              <tr key={r.designation} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                <td className="px-4 py-2.5 font-medium">{r.designation}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">₹{r.monthly_salary.toLocaleString('en-IN')}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  ₹{(r.monthly_salary / daysInMonth).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className="text-xs opacity-60"> ({daysInMonth}d)</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 90-day performance
// ─────────────────────────────────────────────────────────────────────────────

function PostPerformanceInfo({ postId }: { postId: string }) {
  const [stats, setStats] = useState<{ marked: number; present: number; absent: number; halfDay: number; pending: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const to = format(startOfDay(new Date()), 'yyyy-MM-dd');
        const from = format(subDays(startOfDay(new Date()), 90), 'yyyy-MM-dd');

        // `shift_attendance`, not `attendance_records`. The latter is the legacy
        // table without a post dimension, so filtering it by `post_id` matched
        // nothing and this panel was permanently empty for every post.
        let query = supabaseClient
          .from('shift_attendance')
          .select('status')
          .eq('post_id', postId)
          .gte('attendance_date', from)
          .lte('attendance_date', to);
        query = applyBranchScope(query);

        const { data } = await query;
        if (cancelled) return;

        const rows = (data || []) as { status: string }[];
        if (rows.length === 0) { setStats(null); return; }

        const present = rows.filter((d) => d.status === 'present').length;
        const absent = rows.filter((d) => d.status === 'absent').length;
        const halfDay = rows.filter((d) => d.status === 'half_day' || d.status === 'half_vacant').length;
        const pending = rows.filter((d) => d.status === 'pending').length;
        setStats({ marked: present + absent + halfDay, present, absent, halfDay, pending });
      } catch {
        if (!cancelled) setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [postId]);

  if (loading) {
    return (
      <div className="rounded-lg border p-4 flex items-center justify-center">
        <div className="safend-loader" style={{ transform: 'scale(0.75)' }} />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-lg border border-dashed p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          <span>No attendance recorded for this post in the last 90 days.</span>
        </div>
      </div>
    );
  }

  // Rate is measured over slots that were actually decided. Counting unmarked
  // slots against the post would report a data-entry backlog as poor attendance.
  const rate = stats.marked > 0 ? Math.round(((stats.present + stats.halfDay * 0.5) / stats.marked) * 100) : 0;

  return (
    <div>
      <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-[#D71920]" />
        Performance (Last 90 Days)
      </h5>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <div className="text-2xl font-bold text-green-600"><CountUp to={rate} duration={2} separator="," />%</div>
          <div className="text-xs text-muted-foreground mt-0.5">Attendance Rate</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-2xl font-bold"><CountUp to={stats.present} duration={2} separator="," /></span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Present</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-2xl font-bold"><CountUp to={stats.absent} duration={2} separator="," /></span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Absent</div>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-2xl font-bold"><CountUp to={stats.halfDay} duration={2} separator="," /></span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Half Day</div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Based on {stats.marked} marked slot{stats.marked === 1 ? '' : 's'}.
        {stats.pending > 0 && (
          <span className="text-amber-600 ml-1 inline-flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {stats.pending} still awaiting marking.
          </span>
        )}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialog
// ─────────────────────────────────────────────────────────────────────────────

export function PostInfoDialog({
  post, open, onOpenChange, postSalaryRates, salaryRatesLoaded,
}: {
  post: OperationalPost | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postSalaryRates: PostSalaryRate[];
  salaryRatesLoaded: boolean;
}) {
  const locationQuery = post
    ? encodeURIComponent([post.location?.address, post.location?.city, post.location?.state, post.location?.pincode].filter(Boolean).join(', '))
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden p-0" aria-describedby="post-info-description">
        {post && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] h-full">
            <div className="p-6 overflow-y-auto max-h-[85vh]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-[#D71920]" />
                  {post.postName}
                </DialogTitle>
                <div id="post-info-description" className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                  <Building2 className="h-3.5 w-3.5" />{post.clientName}
                  {post.postCode && <Badge variant="outline" className="text-xs">{post.postCode}</Badge>}
                </div>
              </DialogHeader>

              <div className="space-y-6 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4 space-y-2">
                    <h5 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4 text-[#D71920]" />Post Location
                    </h5>
                    <div className="space-y-1 text-sm">
                      {post.location?.address && <p className="font-medium">{post.location.address}</p>}
                      <p className="text-muted-foreground">
                        {[post.location?.city, post.location?.state, post.location?.pincode].filter(Boolean).join(', ') || 'No address details'}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border p-4 space-y-2">
                    <h5 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground">
                      <CalendarIcon className="h-4 w-4 text-[#D71920]" />Engagement
                    </h5>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Working since</span>
                        <span className="font-medium">{post.createdAt ? format(new Date(post.createdAt), 'dd MMM yyyy') : '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Days with client</span>
                        <span className="text-2xl font-bold text-[#D71920]">
                          {post.createdAt ? differenceInDays(new Date(), new Date(post.createdAt)) : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {(post.contactPerson || post.contactPhone || post.contactEmail) && (
                  <div className="rounded-lg border p-4 space-y-2">
                    <h5 className="font-semibold text-sm flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4 text-[#D71920]" />Client Contact
                    </h5>
                    <div className="flex flex-wrap gap-4 text-sm">
                      {post.contactPerson && (
                        <span className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{post.contactPerson}</span>
                        </span>
                      )}
                      {post.contactPhone && (
                        <a href={`tel:${post.contactPhone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-[#D71920]">
                          <Phone className="h-3.5 w-3.5" />{post.contactPhone}
                        </a>
                      )}
                      {post.contactEmail && (
                        <a href={`mailto:${post.contactEmail}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-[#D71920]">
                          <Mail className="h-3.5 w-3.5" />{post.contactEmail}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-[#D71920]" />Duty Structure &amp; Service Requirements
                  </h5>
                  <PostServiceDisplay post={post} />
                </div>

                <PostSalaryInfo postId={post.id || ''} postSalaryRates={postSalaryRates} loading={!salaryRatesLoaded} />
                <PostPerformanceInfo postId={post.id || ''} />
              </div>
            </div>

            <div className="hidden lg:flex flex-col border-l bg-gray-50 dark:bg-gray-900">
              <div className="p-3 border-b bg-white dark:bg-gray-800">
                <h5 className="font-semibold text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[#D71920]" />Location Map
                </h5>
              </div>
              <div className="flex-1 min-h-[400px]">
                {locationQuery ? (
                  <iframe
                    title="Post location map"
                    width="100%"
                    height="100%"
                    style={{ border: 0, minHeight: '400px' }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={buildMapsEmbedUrl(locationQuery)}
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
