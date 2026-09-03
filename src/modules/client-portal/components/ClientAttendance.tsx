'use client';

import { useState, useMemo } from 'react';
import { useClientProfile, useClientAttendance, useClientPosts } from '../hooks/useClientData';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Calendar, CheckCircle2, XCircle, Clock } from 'lucide-react';

export default function ClientAttendance() {
  const { data: profile } = useClientProfile();
  const { data: posts } = useClientPosts(profile?.post_ids);

  // Default date range: last 30 days
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(todayStr);
  const [selectedPost, setSelectedPost] = useState<string>('all');

  // Convert UUID post_ids to strings for the attendance query (post_id in attendance_records is TEXT)
  const postIds = selectedPost === 'all'
    ? profile?.post_ids?.map(String)
    : [selectedPost];

  const { data: attendance, isLoading } = useClientAttendance(postIds, dateFrom, dateTo);

  // Group by date
  const groupedByDate = useMemo(() => {
    if (!attendance) return {};
    const groups: Record<string, any[]> = {};
    attendance.forEach((rec: any) => {
      const date = rec.attendance_date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(rec);
    });
    return groups;
  }, [attendance]);

  // Summary stats
  const summary = useMemo(() => {
    if (!attendance || attendance.length === 0) return { present: 0, absent: 0, halfDay: 0, total: 0 };
    const present = attendance.filter((r: any) => r.status === 'present').length;
    const absent = attendance.filter((r: any) => r.status === 'absent').length;
    const halfDay = attendance.filter((r: any) => r.status === 'half_day' || r.status === 'half_vacant').length;
    return { present, absent, halfDay, total: attendance.length };
  }, [attendance]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Post / Site</Label>
            <select
              value={selectedPost}
              onChange={(e) => setSelectedPost(e.target.value)}
              className="w-full h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 text-sm"
            >
              <option value="all">All Posts</option>
              {(posts || []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.post_name || p.post_code || p.id}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={Users} label="Total Records" value={summary.total} color="text-blue-600 bg-blue-50" />
        <SummaryCard icon={CheckCircle2} label="Present" value={summary.present} color="text-green-600 bg-green-50" />
        <SummaryCard icon={XCircle} label="Absent" value={summary.absent} color="text-red-600 bg-red-50" />
        <SummaryCard icon={Clock} label="Half Day" value={summary.halfDay} color="text-amber-600 bg-amber-50" />
      </div>

      {/* Attendance Records */}
      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : Object.keys(groupedByDate).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Calendar className="h-12 w-12 mb-3 opacity-40" />
          <p className="font-medium">No attendance records</p>
          <p className="text-sm mt-1">Records will appear once attendance is marked</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByDate)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, records]) => (
              <div key={date} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {new Date(date).toLocaleDateString('en-IN', {
                      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">
                    ({records.length} record{records.length !== 1 ? 's' : ''})
                  </span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {records.map((rec: any) => {
                    const post = posts?.find((p: any) => p.id === rec.post_id);
                    return (
                      <div key={rec.id} className="px-4 py-3 flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground dark:text-white truncate">
                            {post?.post_name || rec.post_id}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Shift: {rec.shift_key} · Employee: {rec.employee_id}
                          </p>
                        </div>
                        <StatusBadge status={rec.status} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${color}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground dark:text-white">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    present: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    absent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    half_day: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    half_vacant: 'bg-orange-100 text-orange-700',
    pending: 'bg-gray-100 text-gray-600',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${styles[status] || styles.pending}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
