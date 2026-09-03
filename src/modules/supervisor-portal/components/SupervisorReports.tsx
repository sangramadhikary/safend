'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { format, subDays } from 'date-fns';
import {
  Download, Loader2, Users, AlertTriangle, CheckCircle2,
  FileText,
} from 'lucide-react';
import { supabaseClient } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSupervisorBFF } from '../hooks/useSupervisorBFF';
import { useQuery } from '@tanstack/react-query';

const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } } } as const;

type ReportType = 'attendance' | 'penalty' | 'deployment';

export default function SupervisorReports() {
  const { toast } = useToast();
  const { data: bffData } = useSupervisorBFF();
  const [reportType, setReportType] = useState<ReportType>('attendance');
  const [fromDate, setFromDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [postFilter, setPostFilter] = useState('all');
  const [generating, setGenerating] = useState(false);

  const posts = bffData?.posts || [];
  const postIds = posts.map((p: any) => p.id);
  const profile = bffData?.profile;

  // Quick stats for the supervisor's posts
  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['supervisor-report-stats', postIds],
    enabled: postIds.length > 0,
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const monthAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

      const [attRes, penRes, rotaRes] = await Promise.all([
        supabaseClient
          .from('shift_attendance')
          .select('status')
          .in('post_id', postIds)
          .gte('attendance_date', monthAgo)
          .lte('attendance_date', today),
        supabaseClient
          .from('penalties')
          .select('id')
          .in('post_id', postIds)
          .gte('violation_date', monthAgo),
        supabaseClient
          .from('rota_assignments')
          .select('id')
          .in('post_id', postIds)
          .eq('rota_date', today),
      ]);

      const attData = attRes.data || [];
      const presentCount = attData.filter((a: any) => a.status === 'present' || a.status === 'half_day').length;
      const totalSlots = attData.length;
      const attendanceRate = totalSlots > 0 ? Math.round((presentCount / totalSlots) * 100) : 0;

      return {
        attendanceRate,
        totalSlots,
        presentCount,
        penaltiesThisMonth: (penRes.data || []).length,
        deployedToday: (rotaRes.data || []).length,
      };
    },
  });

  // Generate CSV report
  const handleGenerate = async () => {
    if (!fromDate || !toDate) {
      toast({ title: 'Select dates', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);

    // CSV escape: wrap in quotes if value contains comma, quote, or newline
    const esc = (val: string | null | undefined): string => {
      const s = (val || '').toString();
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    try {
      const filterPostIds = postFilter === 'all' ? postIds : [postFilter];
      let csvContent = '';
      let filename = '';

      switch (reportType) {
        case 'attendance': {
          const { data } = await supabaseClient
            .from('shift_attendance')
            .select('attendance_date, post_name, shift_key, service_type_key, employee_name, employee_code, status, marked_at, marked_by')
            .in('post_id', filterPostIds)
            .gte('attendance_date', fromDate)
            .lte('attendance_date', toDate)
            .order('attendance_date', { ascending: false });

          const rows = data || [];
          csvContent = 'Date,Post,Shift,Service Type,Employee,Code,Status,Marked At,Marked By\n';
          rows.forEach((r: any) => {
            csvContent += `${esc(r.attendance_date)},${esc(r.post_name)},${esc(r.shift_key)},${esc(r.service_type_key)},${esc(r.employee_name)},${esc(r.employee_code)},${esc(r.status)},${esc(r.marked_at)},${esc(r.marked_by)}\n`;
          });
          filename = `attendance_${fromDate}_to_${toDate}.csv`;
          break;
        }
        case 'penalty': {
          const { data } = await supabaseClient
            .from('penalties')
            .select('violation_date, post_name, staff_name, offense, offense_type, status, source_of_information, reported_by')
            .in('post_id', filterPostIds)
            .gte('violation_date', fromDate)
            .lte('violation_date', toDate)
            .order('violation_date', { ascending: false });

          const rows = data || [];
          csvContent = 'Date,Post,Staff,Offense,Type,Status,Source,Reported By\n';
          rows.forEach((r: any) => {
            csvContent += `${esc(r.violation_date)},${esc(r.post_name)},${esc(r.staff_name)},${esc(r.offense)},${esc(r.offense_type)},${esc(r.status)},${esc(r.source_of_information)},${esc(r.reported_by)}\n`;
          });
          filename = `penalties_${fromDate}_to_${toDate}.csv`;
          break;
        }
        case 'deployment': {
          const { data } = await supabaseClient
            .from('rota_assignments')
            .select('rota_date, post_name, client_name, shift_key, service_type_key, employee_name, employee_code')
            .in('post_id', filterPostIds)
            .gte('rota_date', fromDate)
            .lte('rota_date', toDate)
            .order('rota_date', { ascending: false });

          const rows = data || [];
          csvContent = 'Date,Post,Client,Shift,Service Type,Employee,Code\n';
          rows.forEach((r: any) => {
            csvContent += `${esc(r.rota_date)},${esc(r.post_name)},${esc(r.client_name)},${esc(r.shift_key)},${esc(r.service_type_key)},${esc(r.employee_name)},${esc(r.employee_code)}\n`;
          });
          filename = `deployments_${fromDate}_to_${toDate}.csv`;
          break;
        }
      }

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = filename;
      link.click();
      // Delay revoke to ensure browser starts download
      setTimeout(() => URL.revokeObjectURL(url), 1500);

      toast({ title: 'Report downloaded', description: filename });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }} className="space-y-5">
      <motion.div variants={fadeUp}>
        <h2 className="text-xl font-bold">Reports</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Generate and download reports for your posts</p>
      </motion.div>

      {/* Stats */}
      <motion.div variants={fadeUp} className="grid grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 text-center">
          <p className={`text-xl font-bold ${(stats?.attendanceRate || 0) >= 80 ? 'text-green-600' : 'text-amber-600'}`}>
            {loadingStats ? '—' : `${stats?.attendanceRate}%`}
          </p>
          <p className="text-[10px] text-gray-500">Attendance Rate</p>
          <p className="text-[9px] text-gray-400">Last 30 days</p>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 text-center">
          <p className="text-xl font-bold text-red-600">
            {loadingStats ? '—' : stats?.penaltiesThisMonth}
          </p>
          <p className="text-[10px] text-gray-500">Penalties</p>
          <p className="text-[9px] text-gray-400">This month</p>
        </div>
        <div className="p-3.5 rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 text-center">
          <p className="text-xl font-bold">
            {loadingStats ? '—' : stats?.deployedToday}
          </p>
          <p className="text-[10px] text-gray-500">Deployed</p>
          <p className="text-[9px] text-gray-400">Today</p>
        </div>
      </motion.div>

      {/* Report Generator */}
      <motion.div variants={fadeUp} className="p-4 rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#D71920]" />
          <p className="text-sm font-semibold">Generate Report</p>
        </div>

        {/* Report type */}
        <div className="flex gap-2 overflow-x-auto">
          {([
            { key: 'attendance', label: 'Attendance', icon: CheckCircle2 },
            { key: 'penalty', label: 'Penalties', icon: AlertTriangle },
            { key: 'deployment', label: 'Deployments', icon: Users },
          ] as const).map(rt => (
            <button
              key={rt.key}
              onClick={() => setReportType(rt.key)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                reportType === rt.key
                  ? 'bg-[#D71920] text-white'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400'
              }`}
            >
              <rt.icon className="h-3.5 w-3.5" /> {rt.label}
            </button>
          ))}
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-gray-500 mb-0.5 block">From</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 mb-0.5 block">To</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 text-sm" />
          </div>
        </div>

        {/* Post filter */}
        <select value={postFilter} onChange={e => setPostFilter(e.target.value)} className="w-full h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 text-sm">
          <option value="all">All my posts</option>
          {posts.map((p: any) => <option key={p.id} value={p.id}>{p.post_name}</option>)}
        </select>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={generating || !fromDate || !toDate}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#D71920] text-white text-sm font-medium active:scale-[0.97] transition-transform disabled:opacity-50"
        >
          {generating ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
          ) : (
            <><Download className="h-4 w-4" /> Download CSV</>
          )}
        </button>

        <p className="text-[10px] text-gray-400 text-center">Report covers only your assigned posts</p>
      </motion.div>

      {/* Report info cards */}
      <motion.div variants={fadeUp} className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 px-1">Available Reports</p>
        <div className="space-y-2">
          <ReportInfoCard
            icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
            title="Attendance Summary"
            description="Daily attendance records — date, post, shift, employee, status"
          />
          <ReportInfoCard
            icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
            title="Penalty Report"
            description="Discipline records — violations, offense type, status, reporter"
          />
          <ReportInfoCard
            icon={<Users className="h-4 w-4 text-gray-600" />}
            title="Deployment Report"
            description="Guard assignments — date, post, shift, service type, employee"
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

function ReportInfoCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10">
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-[11px] text-gray-500">{description}</p>
      </div>
    </div>
  );
}
