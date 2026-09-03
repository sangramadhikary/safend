'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, addDays, subDays, isSameDay, startOfDay, startOfMonth, endOfMonth, getDay, subMonths, addMonths, isBefore } from 'date-fns';
import {
  Sun, Sunset, Moon, ChevronLeft, ChevronRight,
  UserPlus, X, Loader2, Save, RefreshCw, ChevronDown, CalendarDays, MapPin, Search,
} from 'lucide-react';
import { supabaseClient } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSupervisorBFF } from '../hooks/useSupervisorBFF';
import { useQuery } from '@tanstack/react-query';

const SERVICE_LABELS: Record<string, string> = {
  unarmedGuards: 'Unarmed Guards', armedGuards: 'Armed Guards', supervisors: 'Supervisors',
  patrolOfficers: 'Patrol Officers', pso: 'PSO', bouncers: 'Bouncers', manpower: 'Manpower',
  eventSecurity: 'Event Security', personalSecurity: 'Personal Security',
};

const SHIFTS = [
  { key: 'day', label: 'Day', time: '06:00–14:00', icon: Sun, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/10' },
  { key: 'afternoon', label: 'Afternoon', time: '14:00–22:00', icon: Sunset, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/10' },
  { key: 'night', label: 'Night', time: '22:00–06:00', icon: Moon, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/10' },
];

const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } } } as const;

export default function SupervisorDeployments() {
  const { toast } = useToast();
  const { data: bffData, isLoading: bffLoading } = useSupervisorBFF();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [showAddGuard, setShowAddGuard] = useState<{ shiftKey: string; serviceTypeKey: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [overStaffReason, setOverStaffReason] = useState<string | null>(null);
  const [pendingOverStaffEmployee, setPendingOverStaffEmployee] = useState<any>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [copyingPrevDay, setCopyingPrevDay] = useState(false);
  const [expandedShifts, setExpandedShifts] = useState<Record<string, boolean>>({ day: true, afternoon: false, night: false });
  const [showPastPicker, setShowPastPicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [showPostPicker, setShowPostPicker] = useState(false);
  const [postSearch, setPostSearch] = useState('');

  const toggleShift = useCallback((key: string) => {
    setExpandedShifts(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Generate today + 6 upcoming days
  const currentDateKey = format(new Date(), 'yyyy-MM-dd');
  const today = useMemo(() => startOfDay(new Date()), [currentDateKey]);
  const dayStrip = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(today, i));
  }, [today]);

  const posts = bffData?.posts || [];
  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const activePost = selectedPostId || (posts.length > 0 ? posts[0].id : null);
  const activePostData = posts.find((p: any) => p.id === activePost);
  const postIdList = useMemo(() => posts.map((p: any) => p.id), [posts]);

  // Fetch rota for selected date
  const { data: rotaData, isLoading: loadingRota, refetch: refetchRota } = useQuery({
    queryKey: ['supervisor-deployments-rota', dateStr, postIdList],
    enabled: postIdList.length > 0,
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('rota_assignments')
        .select('*')
        .in('post_id', postIdList)
        .eq('rota_date', dateStr);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch available employees (from the employees table, active field staff)
  const { data: employees = [] } = useQuery({
    queryKey: ['supervisor-available-employees'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('employees')
        .select('id, employee_id, name, designation, phone')
        .ilike('status', 'active')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const rota = rotaData || [];
  const postRota = rota.filter((r: any) => r.post_id === activePost);

  // Group by shift → service type
  const grouped = useMemo(() => {
    const map: Record<string, Record<string, any[]>> = {};
    SHIFTS.forEach(s => { map[s.key] = {}; });
    postRota.forEach((r: any) => {
      if (!map[r.shift_key]) map[r.shift_key] = {};
      if (!map[r.shift_key][r.service_type_key]) map[r.shift_key][r.service_type_key] = [];
      map[r.shift_key][r.service_type_key].push(r);
    });
    return map;
  }, [postRota]);

  // Already assigned employee IDs for this date (to prevent double-assignment)
  const assignedEmployeeIds = new Set(rota.map((r: any) => r.employee_id));

  // Filtered available employees (not already assigned on this date)
  const availableEmployees = employees.filter((e: any) =>
    !assignedEmployeeIds.has(e.id) &&
    (!employeeSearch || e.name.toLowerCase().includes(employeeSearch.toLowerCase()) || e.employee_id.toLowerCase().includes(employeeSearch.toLowerCase()))
  );

  // Add guard to a shift/service
  const handleAddGuard = async (employee: any) => {
    if (!showAddGuard || !activePost || !activePostData) return;

    // Check if over-staffing — require reason
    const serviceInstances = activePostData.service_instances || {};
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const selectedDayKey = dayKeys[selectedDate.getDay()];
    let required = 0;
    Object.entries(serviceInstances).forEach(([key, instances]: [string, any]) => {
      if (key !== showAddGuard.serviceTypeKey || !Array.isArray(instances)) return;
      instances.forEach((inst: any) => {
        // Respect serviceDays
        if (inst.serviceDays && inst.serviceDays[selectedDayKey] === false) return;
        const sc = inst?.shifts?.[showAddGuard.shiftKey];
        if (sc?.enabled) required += sc.quantity || 0;
      });
    });
    const currentCount = (grouped[showAddGuard.shiftKey]?.[showAddGuard.serviceTypeKey] || []).length;
    const isOverStaff = currentCount >= required && required > 0;

    if (isOverStaff && !overStaffReason) {
      // Store the employee and wait for the user to pick a reason
      setPendingOverStaffEmployee(employee);
      return;
    }

    setSaving(true);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);

    try {
      const { error } = await supabaseClient.from('rota_assignments').insert({
        rota_date: dateStr,
        post_id: activePost,
        post_name: activePostData.post_name,
        client_name: activePostData.client_name,
        shift_key: showAddGuard.shiftKey,
        service_type_key: showAddGuard.serviceTypeKey,
        employee_id: employee.id,
        employee_name: employee.name,
        employee_code: employee.employee_id,
        assignment_reason: isOverStaff ? overStaffReason : null,
      });
      if (error) throw error;
      toast({ title: 'Guard assigned', description: `${employee.name} added to ${SHIFTS.find(s => s.key === showAddGuard.shiftKey)?.label} shift.` });
      setShowAddGuard(null);
      setEmployeeSearch('');
      setOverStaffReason(null);
      setPendingOverStaffEmployee(null);
      setLastSaved(new Date().toISOString());
      refetchRota();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Remove guard from assignment
  const handleRemoveGuard = async (assignmentId: string, guardName: string) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);
    try {
      const { error } = await supabaseClient.from('rota_assignments').delete().eq('id', assignmentId);
      if (error) throw error;
      toast({ title: 'Removed', description: `${guardName} removed from deployment.` });
      setLastSaved(new Date().toISOString());
      refetchRota();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // Copy previous day's deployment to today
  const handleCopyPreviousDay = async () => {
    if (!activePost || !activePostData) return;
    setCopyingPrevDay(true);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(15);

    try {
      const prevDateStr = format(subDays(selectedDate, 1), 'yyyy-MM-dd');
      // Fetch previous day's rota for this post
      const { data: prevRota, error: fetchErr } = await supabaseClient
        .from('rota_assignments')
        .select('shift_key, service_type_key, employee_id, employee_name, employee_code, assignment_reason')
        .eq('post_id', activePost)
        .eq('rota_date', prevDateStr);

      if (fetchErr) throw fetchErr;
      if (!prevRota || prevRota.length === 0) {
        toast({ title: 'No data', description: 'No deployment found for the previous day.' });
        setCopyingPrevDay(false);
        return;
      }

      // Check which are already assigned today (avoid duplicates)
      const existingKeys = new Set(postRota.map((r: any) => `${r.shift_key}-${r.service_type_key}-${r.employee_id}`));
      const toInsert = prevRota
        .filter((r: any) => !existingKeys.has(`${r.shift_key}-${r.service_type_key}-${r.employee_id}`))
        .map((r: any) => ({
          rota_date: dateStr,
          post_id: activePost,
          post_name: activePostData.post_name,
          client_name: activePostData.client_name,
          shift_key: r.shift_key,
          service_type_key: r.service_type_key,
          employee_id: r.employee_id,
          employee_name: r.employee_name,
          employee_code: r.employee_code,
          assignment_reason: r.assignment_reason,
        }));

      if (toInsert.length === 0) {
        toast({ title: 'Already copied', description: 'All guards from previous day are already assigned today.' });
        setCopyingPrevDay(false);
        return;
      }

      const { error: insertErr } = await supabaseClient.from('rota_assignments').insert(toInsert);
      if (insertErr) throw insertErr;

      toast({ title: 'Copied', description: `${toInsert.length} guard${toInsert.length > 1 ? 's' : ''} copied from previous day.` });
      setLastSaved(new Date().toISOString());
      refetchRota();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setCopyingPrevDay(false);
    }
  };


  return (
    <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }} className="space-y-5">
      <motion.div variants={fadeUp} className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Deployments</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage guard assignments</p>
        </div>
        <div className="flex items-center gap-2">
          {lastSaved && (
            <span className="text-[10px] text-green-600 flex items-center gap-1">
              <Save className="h-3 w-3" /> Saved
            </span>
          )}
          <button onClick={() => refetchRota()} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 active:scale-90 transition-transform">
            <RefreshCw className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </motion.div>

      {/* Date strip — today + 8 upcoming days + calendar icon for past */}
      <motion.div variants={fadeUp} className="bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2">
          {/* Calendar icon to open past-date picker */}
          <button
            onClick={() => setShowPastPicker(prev => !prev)}
            className={`shrink-0 flex flex-col items-center justify-center w-12 h-14 rounded-lg border transition-all active:scale-95 ${
              showPastPicker
                ? 'border-[#D71920] bg-[#D71920]/5 text-[#D71920]'
                : 'border-gray-200 dark:border-white/10 text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5'
            }`}
            title="View past dates"
          >
            <CalendarDays className="h-4 w-4" />
            <span className="text-[8px] font-medium mt-0.5">Past</span>
          </button>

          {/* Scrollable day strip */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide flex-1 -mx-0.5 px-0.5">
            {dayStrip.map((day, i) => {
              const isSelected = isSameDay(day, selectedDate);
              const isDayToday = i === 0;
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => { setSelectedDate(day); setShowPastPicker(false); }}
                  className={`flex-1 min-w-0 flex flex-col items-center justify-center h-14 rounded-lg border transition-all active:scale-95 ${
                    isSelected
                      ? 'border-[#D71920] bg-[#D71920] text-white shadow-xs'
                      : 'border-gray-100 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
                  }`}
                >
                  <span className={`text-[10px] font-medium ${isSelected ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
                    {isDayToday ? 'Today' : format(day, 'EEE')}
                  </span>
                  <span className={`text-base font-bold leading-tight ${isSelected ? 'text-white' : ''}`}>
                    {format(day, 'd')}
                  </span>
                  <span className={`text-[9px] ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>
                    {format(day, 'MMM')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Past date picker — only shows past dates */}
        <AnimatePresence>
          {showPastPicker && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4"
              onClick={() => setShowPastPicker(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                onClick={e => e.stopPropagation()}
                className="w-full max-w-sm bg-white dark:bg-[#0B0F19] rounded-2xl shadow-xl overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/10">
                  <h3 className="text-base font-bold">Select Past Date</h3>
                  <button onClick={() => setShowPastPicker(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Month nav */}
                <div className="flex items-center justify-between px-5 py-3">
                  <button
                    onClick={() => setCalendarMonth(m => subMonths(m, 1))}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 active:scale-90 transition-transform"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <p className="text-sm font-semibold">{format(calendarMonth, 'MMMM yyyy')}</p>
                  <button
                    onClick={() => {
                      const next = addMonths(calendarMonth, 1);
                      if (isBefore(next, startOfMonth(today))) setCalendarMonth(next);
                    }}
                    disabled={!isBefore(addMonths(calendarMonth, 1), startOfMonth(today))}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 active:scale-90 transition-transform disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 px-4 pb-1">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                    <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7 px-4 pb-5 gap-y-1">
                  {(() => {
                    const monthStart = startOfMonth(calendarMonth);
                    const monthEnd = endOfMonth(calendarMonth);
                    const startDow = getDay(monthStart);
                    const days: (Date | null)[] = [];

                    // Leading empty cells
                    for (let i = 0; i < startDow; i++) days.push(null);
                    // Days of month
                    let d = monthStart;
                    while (d <= monthEnd) {
                      days.push(d);
                      d = addDays(d, 1);
                    }

                    return days.map((day, idx) => {
                      if (!day) return <div key={`empty-${idx}`} />;
                      const isPast = isBefore(day, today);
                      const isSelected = isSameDay(day, selectedDate);
                      return (
                        <button
                          key={day.toISOString()}
                          disabled={!isPast}
                          onClick={() => {
                            setSelectedDate(day);
                            setShowPastPicker(false);
                          }}
                          className={`h-10 w-full rounded-lg text-sm font-medium transition-all active:scale-90 ${
                            isSelected
                              ? 'bg-[#D71920] text-white'
                              : isPast
                                ? 'hover:bg-gray-100 dark:hover:bg-white/5 text-gray-800 dark:text-gray-200'
                                : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                          }`}
                        >
                          {format(day, 'd')}
                        </button>
                      );
                    });
                  })()}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Post selector */}
      <motion.div variants={fadeUp}>
        <button
          onClick={() => { setShowPostPicker(true); setPostSearch(''); }}
          className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 rounded-xl active:scale-[0.98] transition-all"
        >
          <MapPin className="h-4 w-4 text-[#D71920] shrink-0" />
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-semibold truncate">{activePostData?.post_name || 'Select Post'}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
              {activePostData?.client_name || 'Choose a post to manage'}
              {activePostData && ` · ${rota.filter((r: any) => r.post_id === activePost).length}/${activePostData.total_guards} deployed`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-gray-400 font-medium">{posts.length} posts</span>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </div>
        </button>
      </motion.div>

      {/* Post picker modal */}
      <AnimatePresence>
        {showPostPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowPostPicker(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-white dark:bg-[#0B0F19] rounded-2xl shadow-xl max-h-[70vh] flex flex-col overflow-hidden"
            >
              {/* Header + search */}
              <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold">Select Post</h3>
                  <button onClick={() => setShowPostPicker(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={postSearch}
                    onChange={e => setPostSearch(e.target.value)}
                    placeholder="Search posts..."
                    className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent text-sm focus:outline-hidden focus:ring-2 focus:ring-[#D71920]/30"
                    autoFocus
                  />
                </div>
              </div>

              {/* Post list */}
              <div className="flex-1 overflow-y-auto px-3 py-2">
                {(() => {
                  const filtered = posts.filter((p: any) =>
                    !postSearch || p.post_name.toLowerCase().includes(postSearch.toLowerCase()) || (p.client_name || '').toLowerCase().includes(postSearch.toLowerCase())
                  );
                  if (filtered.length === 0) return <p className="text-center text-xs text-gray-400 py-8">No posts found</p>;
                  return (
                    <div className="space-y-1">
                      {filtered.map((p: any) => {
                        const count = rota.filter((r: any) => r.post_id === p.id).length;
                        const isActive = activePost === p.id;
                        return (
                          <button
                            key={p.id}
                            onClick={() => { setSelectedPostId(p.id); setShowPostPicker(false); }}
                            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all active:scale-[0.98] text-left ${
                              isActive
                                ? 'bg-[#D71920]/5 border border-[#D71920]/20'
                                : 'hover:bg-gray-50 dark:hover:bg-white/3'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              isActive ? 'bg-[#D71920] text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400'
                            }`}>
                              {p.post_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-medium truncate ${isActive ? 'text-[#D71920]' : ''}`}>{p.post_name}</p>
                              <p className="text-[10px] text-gray-500 truncate">{p.client_name || 'No client'}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-xs font-bold ${count >= p.total_guards ? 'text-green-600' : 'text-gray-600 dark:text-gray-400'}`}>
                                {count}/{p.total_guards}
                              </p>
                              <p className="text-[9px] text-gray-400">deployed</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      {postRota.length === 0 && !loadingRota && activePostData && (
        <motion.div variants={fadeUp} className="flex justify-center">
          <button
            onClick={handleCopyPreviousDay}
            disabled={copyingPrevDay}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/3 active:scale-[0.97] transition-all disabled:opacity-50"
          >
            {copyingPrevDay ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Copy Previous Day
          </button>
        </motion.div>
      )}

      {loadingRota || bffLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : !activePostData ? (
        <div className="text-center py-12 text-sm text-gray-400">No posts assigned.</div>
      ) : (
        <div className="space-y-3">
          {SHIFTS.map(shift => {
            const shiftData = grouped[shift.key] || {};
            const shiftTotal = Object.values(shiftData).reduce((s: number, arr: any) => s + arr.length, 0);
            const Icon = shift.icon;
            const isExpanded = expandedShifts[shift.key] ?? false;

            // Get enabled service types for this shift from post's service_instances
            const serviceInstances = activePostData.service_instances || {};
            const _dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
            const _selectedDayKey = _dayKeys[selectedDate.getDay()];
            const enabledServices: { key: string; label: string; required: number }[] = [];
            Object.entries(serviceInstances).forEach(([key, instances]: [string, any]) => {
              if (!Array.isArray(instances)) return;
              instances.forEach((inst: any) => {
                // Respect serviceDays: skip instances not active on the selected date
                if (inst.serviceDays && inst.serviceDays[_selectedDayKey] === false) return;
                const shiftConfig = inst?.shifts?.[shift.key];
                if (shiftConfig?.enabled && (shiftConfig?.quantity || 0) > 0) {
                  enabledServices.push({ key, label: SERVICE_LABELS[key] || key, required: shiftConfig.quantity });
                }
              });
            });

            // Check if this shift has requirements on other days but not today
            const hasRequirementsIgnoringDay = (() => {
              const si = activePostData.service_instances || {};
              return Object.values(si).some((instances: any) => {
                if (!Array.isArray(instances)) return false;
                return instances.some((inst: any) => {
                  const sc = inst?.shifts?.[shift.key];
                  return sc?.enabled && (sc?.quantity || 0) > 0;
                });
              });
            })();

            if (enabledServices.length === 0 && shiftTotal === 0) {
              if (!hasRequirementsIgnoringDay) return null;
              // Has requirements but not scheduled today — show muted indicator
              return (
                <div key={shift.key} className="rounded-xl border border-dashed border-gray-100 dark:border-white/5 overflow-hidden opacity-60">
                  <div className={`flex items-center gap-3 px-4 py-3 ${shift.bg}`}>
                    <Icon className={`h-4 w-4 ${shift.color} opacity-50`} />
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-muted-foreground">{shift.label} Shift</p>
                      <p className="text-[10px] text-gray-400">{shift.time}</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-muted-foreground font-medium">
                      Not scheduled {format(selectedDate, 'EEE')}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div key={shift.key} className="rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 overflow-hidden transition-shadow duration-200 hover:shadow-xs">
                {/* Shift Tab Header — clickable */}
                <button
                  onClick={() => toggleShift(shift.key)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors duration-150 ${shift.bg} ${isExpanded ? 'border-b border-gray-100 dark:border-white/5' : ''}`}
                >
                  <Icon className={`h-5 w-5 ${shift.color}`} />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold">{shift.label} Shift</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">{shift.time}</p>
                  </div>
                  <span className="text-xs font-bold mr-2">{shiftTotal} assigned</span>
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                  >
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </motion.div>
                </button>

                {/* Collapsible content */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="divide-y divide-gray-50 dark:divide-white/5">
                        {(enabledServices.length > 0 ? enabledServices : [{ key: 'unarmedGuards', label: 'Guards', required: 0 }]).map(service => {
                          const guards = shiftData[service.key] || [];
                          const isOverStaffed = guards.length > service.required && service.required > 0;
                          return (
                            <div key={service.key} className="px-4 py-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                                    {service.label} {service.required > 0 && <span className="normal-case font-normal">({guards.length}/{service.required})</span>}
                                  </p>
                                  {isOverStaffed && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 font-medium">
                                      Over-staffed
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={() => { setShowAddGuard({ shiftKey: shift.key, serviceTypeKey: service.key }); setEmployeeSearch(''); setOverStaffReason(null); }}
                                  className="flex items-center gap-1 text-[11px] text-[#D71920] font-medium active:scale-95 transition-transform"
                                >
                                  <UserPlus className="h-3 w-3" /> Add
                                </button>
                              </div>

                              {guards.length === 0 ? (
                                <p className="text-xs text-gray-400 py-2">No guards assigned</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {guards.map((g: any) => (
                                    <div key={g.id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg bg-gray-50 dark:bg-white/2 group">
                                      <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-white/10 flex items-center justify-center text-[10px] font-bold">
                                        {(g.employee_name || '?').charAt(0).toUpperCase()}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium truncate">{g.employee_name}</p>
                                        <div className="flex items-center gap-1.5">
                                          <p className="text-[10px] text-gray-400">{g.employee_code}</p>
                                          {g.assignment_reason && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                                              {g.assignment_reason}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => handleRemoveGuard(g.id, g.employee_name)}
                                        className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 opacity-0 group-hover:opacity-100 transition-all active:scale-90"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Guard Modal */}
      <AnimatePresence>
        {showAddGuard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 flex items-end lg:items-center justify-center bg-black/50 p-4"
            onClick={() => setShowAddGuard(null)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-white dark:bg-[#0B0F19] rounded-t-2xl lg:rounded-2xl shadow-xl max-h-[70vh] flex flex-col"
            >
              <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold">Assign Guard</h3>
                    <p className="text-xs text-gray-500">
                      {SHIFTS.find(s => s.key === showAddGuard.shiftKey)?.label} · {SERVICE_LABELS[showAddGuard.serviceTypeKey] || showAddGuard.serviceTypeKey}
                    </p>
                  </div>
                  <button onClick={() => setShowAddGuard(null)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 relative">
                  <input
                    type="text"
                    value={employeeSearch}
                    onChange={e => setEmployeeSearch(e.target.value)}
                    placeholder="Search by name or ID..."
                    className="w-full h-9 pl-3 pr-3 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent text-sm focus:outline-hidden focus:ring-2 focus:ring-[#D71920]/30"
                    autoFocus
                  />
                </div>

                {/* Over-staffing reason selector — shows when adding beyond required count */}
                {(() => {
                  const serviceInstances = activePostData?.service_instances || {};
                  const __dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
                  const __selectedDayKey = __dayKeys[selectedDate.getDay()];
                  let required = 0;
                  Object.entries(serviceInstances).forEach(([key, instances]: [string, any]) => {
                    if (key !== showAddGuard.serviceTypeKey || !Array.isArray(instances)) return;
                    instances.forEach((inst: any) => {
                      if (inst.serviceDays && inst.serviceDays[__selectedDayKey] === false) return;
                      const sc = inst?.shifts?.[showAddGuard.shiftKey];
                      if (sc?.enabled) required += sc.quantity || 0;
                    });
                  });
                  const currentCount = (grouped[showAddGuard.shiftKey]?.[showAddGuard.serviceTypeKey] || []).length;
                  if (currentCount >= required && required > 0) {
                    return (
                      <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
                        <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium mb-2">
                          {pendingOverStaffEmployee
                            ? `Adding "${pendingOverStaffEmployee.name}" exceeds requirement (${currentCount}/{required}). Pick a reason:`
                            : `Exceeds requirement (${currentCount}/${required}). Select reason before adding:`
                          }
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {['Half-duty split', 'Extra guard requested', 'Training/handover', 'Leave coverage'].map(reason => (
                            <button
                              key={reason}
                              onClick={async () => {
                                setOverStaffReason(reason);
                                // If we have a pending employee, proceed with assignment immediately
                                if (pendingOverStaffEmployee && showAddGuard && activePost && activePostData) {
                                  const emp = pendingOverStaffEmployee;
                                  setPendingOverStaffEmployee(null);
                                  setSaving(true);
                                  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);
                                  try {
                                    const { error } = await supabaseClient.from('rota_assignments').insert({
                                      rota_date: dateStr,
                                      post_id: activePost,
                                      post_name: activePostData.post_name,
                                      client_name: activePostData.client_name,
                                      shift_key: showAddGuard.shiftKey,
                                      service_type_key: showAddGuard.serviceTypeKey,
                                      employee_id: emp.id,
                                      employee_name: emp.name,
                                      employee_code: emp.employee_id,
                                      assignment_reason: reason,
                                    });
                                    if (error) throw error;
                                    toast({ title: 'Guard assigned', description: `${emp.name} added with reason: ${reason}` });
                                    setShowAddGuard(null);
                                    setEmployeeSearch('');
                                    setOverStaffReason(null);
                                    setLastSaved(new Date().toISOString());
                                    refetchRota();
                                  } catch (err: any) {
                                    toast({ title: 'Error', description: err.message, variant: 'destructive' });
                                  } finally {
                                    setSaving(false);
                                  }
                                }
                              }}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all active:scale-95 ${
                                overStaffReason === reason
                                  ? 'bg-[#D71920] text-white'
                                  : 'bg-white dark:bg-white/10 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/10'
                              }`}
                            >
                              {reason}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-2">
                {availableEmployees.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 py-8">No available employees found</p>
                ) : (
                  <div className="space-y-1">
                    {availableEmployees.slice(0, 30).map((emp: any) => (
                      <button
                        key={emp.id}
                        onClick={() => handleAddGuard(emp)}
                        disabled={saving}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-white/3 active:scale-[0.98] transition-all text-left disabled:opacity-50"
                      >
                        <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-xs font-bold">
                          {emp.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{emp.name}</p>
                          <p className="text-[10px] text-gray-500">{emp.designation} · {emp.employee_id}</p>
                        </div>
                        <UserPlus className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
