'use client';

import { motion } from 'framer-motion';
import { MapPin, Users, Clock, Shield, CheckCircle2, XCircle, AlertCircle, TrendingUp, CalendarOff } from 'lucide-react';
import { useSupervisorBFF } from '../hooks/useSupervisorBFF';

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
} as const;
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
} as const;

export default function SupervisorDashboard() {
  const { data, isLoading } = useSupervisorBFF();

  const profile = data?.profile;
  const posts = data?.posts || [];
  const attendance = data?.attendance || [];
  const rota = data?.rota || [];
  const patrols = data?.patrols || [];
  const leaves = data?.leaves || [];
  const attendanceScore = data?.attendanceScore ?? 0;
  const weeklyTrend = data?.weeklyTrend || [];

  const totalGuards = posts.reduce((s, p) => s + (p.total_guards || 0), 0);
  const presentCount = attendance.filter(a => a.status === 'present').length;
  const absentCount = attendance.filter(a => a.status === 'absent').length;
  const deployed = rota.length;
  const vacancyPct = totalGuards > 0 ? Math.round(((totalGuards - deployed) / totalGuards) * 100) : 0;
  const rotaCompletionPct = posts.length > 0
    ? Math.round((new Set(rota.map(r => r.post_id)).size / posts.length) * 100)
    : 0;
  const onLeaveToday = leaves.filter(l => l.status === 'Approved').length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-14 rounded-xl bg-gray-100 dark:bg-white/5" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-gray-100 dark:bg-white/5" />)}
        </div>
        <div className="h-40 rounded-xl bg-gray-100 dark:bg-white/5" />
        <div className="h-48 rounded-xl bg-gray-100 dark:bg-white/5" />
      </div>
    );
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
      {/* Greeting */}
      <motion.div variants={fadeUp}>
        <h2 className="text-xl md:text-2xl font-bold">
          {greeting}, {profile?.name?.split(' ')[0] || 'Supervisor'}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {posts.length} post{posts.length !== 1 ? 's' : ''} · {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
        </p>
      </motion.div>

      {/* ─── Key Metrics Row ─── */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Post Vacancy"
          value={`${vacancyPct}%`}
          sub={`${deployed}/${totalGuards} deployed`}
          color={vacancyPct > 30 ? 'text-red-600' : vacancyPct > 10 ? 'text-amber-600' : 'text-green-600'}
        />
        <MetricCard
          label="Rota Completion"
          value={`${rotaCompletionPct}%`}
          sub={`${new Set(rota.map(r => r.post_id)).size}/${posts.length} posts`}
          color={rotaCompletionPct === 100 ? 'text-green-600' : rotaCompletionPct > 50 ? 'text-amber-600' : 'text-red-600'}
        />
        <MetricCard
          label="Attendance Score"
          value={`${attendanceScore}/10`}
          sub="Last 3 months"
          color={attendanceScore >= 8 ? 'text-green-600' : attendanceScore >= 5 ? 'text-amber-600' : 'text-red-600'}
        />
        <MetricCard
          label="On Leave"
          value={onLeaveToday}
          sub="Today"
          color={onLeaveToday > 0 ? 'text-amber-600' : 'text-gray-500'}
        />
      </motion.div>

      {/* ─── Weekly Attendance Chart ─── */}
      {weeklyTrend.length > 0 && (
        <motion.div variants={fadeUp} className="p-4 rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-gray-500" />
              Weekly Attendance
            </h3>
            <span className="text-[11px] text-gray-400">Last 7 days</span>
          </div>
          <div className="flex items-end gap-1.5 h-20">
            {weeklyTrend.map((day, i) => {
              const pct = day.total > 0 ? (day.present / day.total) * 100 : 0;
              const isToday = i === weeklyTrend.length - 1;
              const dayLabel = new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short' }).charAt(0);
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full relative rounded-t-sm overflow-hidden bg-gray-100 dark:bg-white/5" style={{ height: '60px' }}>
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${pct}%` }}
                      transition={{ duration: 0.4, delay: i * 0.05, ease: 'easeOut' }}
                      className={`absolute bottom-0 left-0 right-0 rounded-t-sm ${
                        isToday ? 'bg-[#D71920]' : pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'
                      }`}
                    />
                  </div>
                  <span className={`text-[10px] ${isToday ? 'font-bold text-[#D71920]' : 'text-gray-400'}`}>
                    {dayLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* ─── On Leave Today ─── */}
      {onLeaveToday > 0 && (
        <motion.div variants={fadeUp} className="p-4 rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <CalendarOff className="h-4 w-4 text-amber-500" />
            On Leave Today ({onLeaveToday})
          </h3>
          <div className="space-y-2">
            {leaves.filter(l => l.status === 'Approved').slice(0, 5).map((leave) => (
              <div key={leave.id} className="flex items-center justify-between py-1.5">
                <div>
                  <p className="text-sm font-medium">{leave.employee_name}</p>
                  <p className="text-[11px] text-gray-500">{leave.leave_type} · until {new Date(leave.to_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                  Leave
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ─── Post Status ─── */}
      <motion.div variants={fadeUp} className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 px-1">Post Status</h3>
        {posts.length === 0 ? (
          <div className="text-center py-10 rounded-xl border border-dashed border-gray-200 dark:border-white/10">
            <MapPin className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-400">No posts assigned yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map((post) => {
              const postAtt = attendance.filter(a => a.post_id === post.id);
              const present = postAtt.filter(a => a.status === 'present').length;
              const absent = postAtt.filter(a => a.status === 'absent').length;
              const pending = postAtt.filter(a => a.status === 'pending').length;
              const postRota = rota.filter(r => r.post_id === post.id);

              return (
                <motion.div
                  key={post.id}
                  variants={fadeUp}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 active:scale-[0.98] transition-transform"
                >
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    present > 0 && absent === 0 && pending === 0 ? 'bg-green-500' :
                    absent > 0 ? 'bg-red-500' :
                    pending > 0 ? 'bg-gray-400' : 'bg-gray-300'
                  }`} />

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{post.post_name}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {post.client_name} · {postRota.length}/{post.total_guards} deployed
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {present > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[11px] text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded-full">
                        <CheckCircle2 className="h-3 w-3" />{present}
                      </span>
                    )}
                    {absent > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[11px] text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded-full">
                        <XCircle className="h-3 w-3" />{absent}
                      </span>
                    )}
                    {pending > 0 && postAtt.length > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5 px-1.5 py-0.5 rounded-full">
                        <AlertCircle className="h-3 w-3" />{pending}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: React.ReactNode; sub: string; color: string }) {
  return (
    <div className="p-3.5 rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10">
      <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium mb-1">{label}</p>
      <p className={`text-xl font-bold leading-tight ${color}`}>{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}
