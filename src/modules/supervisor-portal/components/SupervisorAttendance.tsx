'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, subDays, isSameDay, startOfDay } from 'date-fns';
import {
  CheckCircle2, XCircle, AlertCircle, Loader2, Sun, Sunset, Moon,
  RotateCcw, Users, ChevronDown, MapPin, Search, X, MoreVertical,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabaseClient } from '@/integrations/supabase/client';
import { useSupervisorBFF } from '../hooks/useSupervisorBFF';
import { useQuery } from '@tanstack/react-query';
import { upsertAttendance } from '@/services/supabase/RotaAttendanceService';
import { ApprovalQueue } from '@/modules/shared/attendance/ApprovalQueue';

const SERVICE_LABELS: Record<string, string> = {
  unarmedGuards: 'Unarmed Guards', armedGuards: 'Armed Guards', supervisors: 'Supervisors',
  patrolOfficers: 'Patrol Officers', pso: 'PSO', bouncers: 'Bouncers', manpower: 'Manpower',
  eventSecurity: 'Event Security', personalSecurity: 'Personal Security',
};

const SHIFTS = [
  { key: 'day', label: 'Day', time: '06:00–14:00', icon: Sun, color: 'text-amber-500' },
  { key: 'afternoon', label: 'Afternoon', time: '14:00–22:00', icon: Sunset, color: 'text-orange-500' },
  { key: 'night', label: 'Night', time: '22:00–06:00', icon: Moon, color: 'text-indigo-500' },
];

const STATUS_BUTTONS = [
  { value: 'present', label: 'P', fullLabel: 'Present', color: 'bg-green-500 text-white', ring: 'ring-green-500', lightBg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800', textColor: 'text-green-700 dark:text-green-400' },
  { value: 'absent', label: 'A', fullLabel: 'Absent', color: 'bg-red-500 text-white', ring: 'ring-red-500', lightBg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800', textColor: 'text-red-700 dark:text-red-400' },
  { value: 'half_day', label: '½', fullLabel: 'Half-Day', color: 'bg-amber-500 text-white', ring: 'ring-amber-500', lightBg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800', textColor: 'text-amber-700 dark:text-amber-400' },
  { value: 'half_vacant', label: 'V', fullLabel: 'Half Vacant', color: 'bg-orange-500 text-white', ring: 'ring-orange-500', lightBg: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800', textColor: 'text-orange-600 dark:text-orange-400' },
];

const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } } } as const;

export default function SupervisorAttendance() {
  const { toast } = useToast();
  const { data: bffData } = useSupervisorBFF();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [expandedShift, setExpandedShift] = useState<string | null>('day');
  const [marking, setMarking] = useState<string | null>(null);
  const [moreMenuSlot, setMoreMenuSlot] = useState<string | null>(null);
  const [showPostPicker, setShowPostPicker] = useState(false);
  const [postSearch, setPostSearch] = useState('');
  const [halfDaySwap, setHalfDaySwap] = useState<{ shiftKey: string; serviceKey: string; slotIdx: number; guard: any } | null>(null);
  const [swapSearch, setSwapSearch] = useState('');

  const posts = bffData?.posts || [];
  const currentDateKey = format(new Date(), 'yyyy-MM-dd');
  const todayDate = useMemo(() => startOfDay(new Date()), [currentDateKey]);
  const today = format(selectedDate, 'yyyy-MM-dd');
  const activePost = selectedPostId || (posts.length > 0 ? posts[0].id : null);
  const activePostData = posts.find((p: any) => p.id === activePost);
  const postIds = useMemo(() => posts.map((p: any) => p.id), [posts]);

  // Day strip: today + past 6 days (for rectifying attendance)
  const dayStrip = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => subDays(todayDate, 6 - i));
  }, [todayDate]);

  // Fetch rota for selected date
  const { data: rotaData = [] } = useQuery({
    queryKey: ['supervisor-att-rota', today, postIds],
    enabled: postIds.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const { data } = await supabaseClient
        .from('rota_assignments')
        .select('*')
        .in('post_id', postIds)
        .eq('rota_date', today);
      return data || [];
    },
  });

  // Fetch attendance for selected date
  const { data: attendanceData = [], isLoading, refetch: refetchAttendance } = useQuery({
    queryKey: ['supervisor-att-records', today, postIds],
    enabled: postIds.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const { data } = await supabaseClient
        .from('shift_attendance')
        .select('*')
        .in('post_id', postIds)
        .eq('attendance_date', today);
      return data || [];
    },
  });

  // Fetch available employees for half-day swap
  const { data: allEmployees = [] } = useQuery({
    queryKey: ['supervisor-att-employees'],
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

  const postRota = rotaData.filter((r: any) => r.post_id === activePost);
  const postAttendance = attendanceData.filter((a: any) => a.post_id === activePost);

  // Group rota by shift → service type → slots
  const shiftGroups = useMemo(() => {
    const map: Record<string, Record<string, any[]>> = {};
    SHIFTS.forEach(s => { map[s.key] = {}; });
    postRota.forEach((r: any) => {
      if (!map[r.shift_key]) map[r.shift_key] = {};
      if (!map[r.shift_key][r.service_type_key]) map[r.shift_key][r.service_type_key] = [];
      map[r.shift_key][r.service_type_key].push(r);
    });
    return map;
  }, [postRota]);

  // Get attendance record for a specific slot
  const getSlotAttendance = useCallback((shiftKey: string, serviceTypeKey: string, slotIndex: number) => {
    return postAttendance.find((a: any) =>
      a.shift_key === shiftKey && a.service_type_key === serviceTypeKey && a.slot_index === slotIndex
    );
  }, [postAttendance]);

  // Mark a single slot
  const handleMark = async (shiftKey: string, serviceTypeKey: string, slotIndex: number, status: string, employee: any) => {
    if (!activePostData) return;
    const slotId = `${shiftKey}-${serviceTypeKey}-${slotIndex}`;
    setMarking(slotId);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);

    try {
      const result = await upsertAttendance({
        attendanceDate: today,
        postId: activePost!,
        postName: activePostData.post_name,
        clientName: activePostData.client_name,
        shiftKey,
        serviceTypeKey,
        slotIndex,
        employeeId: employee.employee_id || employee.id,
        employeeName: employee.employee_name || employee.name,
        employeeCode: employee.employee_code || '',
        status: status as any,
      });
      if (!result.success) throw new Error(result.error || 'Failed');
      refetchAttendance();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setMarking(null);
    }
  };

  // Handle half-day swap confirmation (with secondary employee)
  const handleHalfDaySwapConfirm = async (secondaryEmployee: any) => {
    if (!halfDaySwap || !activePostData) return;
    const { shiftKey, serviceKey, slotIdx, guard } = halfDaySwap;
    const slotId = `${shiftKey}-${serviceKey}-${slotIdx}`;
    setMarking(slotId);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);

    try {
      const result = await upsertAttendance({
        attendanceDate: today,
        postId: activePost!,
        postName: activePostData.post_name,
        clientName: activePostData.client_name,
        shiftKey,
        serviceTypeKey: serviceKey,
        slotIndex: slotIdx,
        employeeId: guard.employee_id || guard.id,
        employeeName: guard.employee_name || guard.name,
        employeeCode: guard.employee_code || '',
        secondaryEmployeeId: secondaryEmployee.id,
        secondaryEmployeeName: secondaryEmployee.name,
        secondaryEmployeeCode: secondaryEmployee.employee_id,
        status: 'half_day' as any,
      });
      if (!result.success) throw new Error(result.error || 'Failed');
      toast({ title: 'Done', description: `Half-day swap recorded.` });
      refetchAttendance();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setMarking(null);
      setHalfDaySwap(null);
      setSwapSearch('');
    }
  };

  // Mark all pending in a shift+service as present
  const handleMarkAllPresent = async (shiftKey: string, serviceTypeKey: string) => {
    if (!activePostData) return;
    const guards = shiftGroups[shiftKey]?.[serviceTypeKey] || [];
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(15);

    // Collect all pending slots first, then execute in parallel
    const pendingSlots: { index: number; guard: any }[] = [];
    for (let i = 0; i < guards.length; i++) {
      const existing = getSlotAttendance(shiftKey, serviceTypeKey, i);
      if (!existing || existing.status === 'pending') {
        pendingSlots.push({ index: i, guard: guards[i] });
      }
    }

    if (pendingSlots.length === 0) return;

    const results = await Promise.allSettled(
      pendingSlots.map(({ index, guard }) =>
        upsertAttendance({
          attendanceDate: today,
          postId: activePost!,
          postName: activePostData.post_name,
          clientName: activePostData.client_name,
          shiftKey,
          serviceTypeKey,
          slotIndex: index,
          employeeId: guard.employee_id,
          employeeName: guard.employee_name,
          employeeCode: guard.employee_code,
          status: 'present',
        })
      )
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && (r as any).value?.success).length;
    if (successCount > 0) {
      toast({ title: 'Done', description: `${successCount} marked present.` });
      refetchAttendance();
    }
  };

  // Undo (revert to pending)
  const handleUndo = async (recordId: string) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);
    try {
      const { error } = await supabaseClient
        .from('shift_attendance')
        .update({ status: 'pending', marked_at: null, marked_by: null })
        .eq('id', recordId);
      if (error) throw error;
      refetchAttendance();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // Stats
  const totalSlots = postRota.length;
  const markedSlots = postAttendance.filter((a: any) => a.status !== 'pending').length;
  const presentCount = postAttendance.filter((a: any) => a.status === 'present').length;
  const absentCount = postAttendance.filter((a: any) => a.status === 'absent').length;

  return (
    <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }} className="space-y-5">
      <motion.div variants={fadeUp}>
        <h2 className="text-xl font-bold">Attendance</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Mark daily attendance</p>
      </motion.div>

      {/* QR Check-In approvals — pending self check-ins scanned at posts.
          The shared ApprovalQueue reads branch/role-scoped pending records
          (ambient branch scope via applyBranchScope; supervisor role gated by
          SupervisorProtectedRoute) and wires approve/reject to the resolve
          route internally (R10.1, R11.1). */}
      <motion.div
        variants={fadeUp}
        className="rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 p-4"
      >
        <ApprovalQueue title="QR Check-In Approvals" />
      </motion.div>

      {/* Date strip — past 6 days + today */}
      <motion.div variants={fadeUp} className="bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 rounded-xl p-3">
        <div className="flex gap-1.5">
          {dayStrip.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isDayToday = isSameDay(day, todayDate);
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
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
              <div className="flex-1 overflow-y-auto px-3 py-2">
                {(() => {
                  const filtered = posts.filter((p: any) =>
                    !postSearch || p.post_name.toLowerCase().includes(postSearch.toLowerCase()) || (p.client_name || '').toLowerCase().includes(postSearch.toLowerCase())
                  );
                  if (filtered.length === 0) return <p className="text-center text-xs text-gray-400 py-8">No posts found</p>;
                  return (
                    <div className="space-y-1">
                      {filtered.map((p: any) => {
                        const pAtt = attendanceData.filter((a: any) => a.post_id === p.id && a.status !== 'pending');
                        const pTotal = rotaData.filter((r: any) => r.post_id === p.id).length;
                        const isActive = activePost === p.id;
                        return (
                          <button
                            key={p.id}
                            onClick={() => { setSelectedPostId(p.id); setShowPostPicker(false); }}
                            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all active:scale-[0.98] text-left ${
                              isActive ? 'bg-[#D71920]/5 border border-[#D71920]/20' : 'hover:bg-gray-50 dark:hover:bg-white/3'
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
                              <p className={`text-xs font-bold ${pAtt.length >= pTotal && pTotal > 0 ? 'text-green-600' : 'text-gray-600 dark:text-gray-400'}`}>
                                {pAtt.length}/{pTotal}
                              </p>
                              <p className="text-[9px] text-gray-400">marked</p>
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

      {/* Stats bar */}
      {totalSlots > 0 && (
        <motion.div variants={fadeUp} className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-600" />{presentCount} present</span>
          <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-600" />{absentCount} absent</span>
          <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3 text-gray-400" />{totalSlots - markedSlots} pending</span>
        </motion.div>
      )}

      {/* Shift sections */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : postRota.length === 0 ? (
        <motion.div variants={fadeUp} className="text-center py-12 rounded-xl border border-dashed border-gray-200 dark:border-white/10">
          <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">No deployment for today</p>
          <p className="text-xs text-gray-400 mt-1">Deploy guards first from the Deploy tab</p>
        </motion.div>
      ) : (
        <motion.div variants={fadeUp} className="space-y-3">
          {SHIFTS.map(shift => {
            const shiftData = shiftGroups[shift.key] || {};
            const shiftGuards = Object.values(shiftData).flat();
            if (shiftGuards.length === 0) return null;
            const Icon = shift.icon;
            const isExpanded = expandedShift === shift.key;
            const shiftAttendance = postAttendance.filter((a: any) => a.shift_key === shift.key);
            const shiftMarked = shiftAttendance.filter((a: any) => a.status !== 'pending').length;

            return (
              <div key={shift.key} className="rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 overflow-hidden">
                {/* Shift header — tap to expand */}
                <button
                  onClick={() => setExpandedShift(isExpanded ? null : shift.key)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 dark:active:bg-white/2"
                >
                  <Icon className={`h-4 w-4 ${shift.color}`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{shift.label} Shift</p>
                    <p className="text-[10px] text-gray-500">{shift.time}</p>
                  </div>
                  <span className="text-xs text-gray-500 mr-2">{shiftMarked}/{shiftGuards.length}</span>
                  <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </motion.div>
                </button>

                {/* Expanded slots */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-gray-50 dark:border-white/5">
                        {Object.entries(shiftData).map(([serviceKey, guards]) => (
                          <div key={serviceKey} className="px-4 py-3 border-b border-gray-50 dark:border-white/5 last:border-b-0">
                            {/* Service type header + Mark All */}
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                                {SERVICE_LABELS[serviceKey] || serviceKey}
                              </p>
                              <button
                                onClick={() => handleMarkAllPresent(shift.key, serviceKey)}
                                className="text-[11px] text-green-600 font-semibold flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-900/20 active:scale-95 transition-transform"
                              >
                                <CheckCircle2 className="h-3 w-3" /> All Present
                              </button>
                            </div>

                            {/* Guard cards */}
                            <div className="space-y-2.5">
                              {(guards as any[]).map((guard, slotIdx) => {
                                const att = getSlotAttendance(shift.key, serviceKey, slotIdx);
                                const currentStatus = att?.status || 'pending';
                                const slotId = `${shift.key}-${serviceKey}-${slotIdx}`;
                                const isMarking = marking === slotId;
                                const activeBtn = STATUS_BUTTONS.find(b => b.value === currentStatus);
                                const isMoreOpen = moreMenuSlot === slotId;

                                return (
                                  <div key={slotIdx} className={`rounded-xl border p-3 transition-all ${
                                    currentStatus !== 'pending' && activeBtn
                                      ? activeBtn.lightBg
                                      : 'bg-gray-50 dark:bg-white/2 border-gray-100 dark:border-white/5'
                                  }`}>
                                    {/* Top row: name + status badge */}
                                    <div className="flex items-center gap-2 mb-2.5">
                                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-white/10 flex items-center justify-center text-xs font-bold shrink-0">
                                        {(guard.employee_name || '?').charAt(0).toUpperCase()}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold truncate">{guard.employee_name || 'Unassigned'}</p>
                                        <p className="text-[10px] text-gray-400">{guard.employee_code}</p>
                                      </div>
                                      {currentStatus !== 'pending' && activeBtn && (
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${activeBtn.color}`}>
                                          {activeBtn.fullLabel}
                                        </span>
                                      )}
                                      {isMarking && <Loader2 className="h-4 w-4 animate-spin text-gray-400 shrink-0" />}
                                    </div>

                                    {/* Bottom row: Primary actions + More */}
                                    <div className="flex items-center gap-1.5">
                                      {/* Present button */}
                                      <button
                                        disabled={isMarking}
                                        onClick={() => handleMark(shift.key, serviceKey, slotIdx, 'present', guard)}
                                        className={`flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 ${
                                          currentStatus === 'present'
                                            ? 'bg-green-500 text-white shadow-xs'
                                            : 'bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:bg-green-50 dark:hover:bg-green-900/10 hover:border-green-300 hover:text-green-700'
                                        }`}
                                      >
                                        Present
                                      </button>

                                      {/* Absent button */}
                                      <button
                                        disabled={isMarking}
                                        onClick={() => handleMark(shift.key, serviceKey, slotIdx, 'absent', guard)}
                                        className={`flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 ${
                                          currentStatus === 'absent'
                                            ? 'bg-red-500 text-white shadow-xs'
                                            : 'bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/10 hover:border-red-300 hover:text-red-700'
                                        }`}
                                      >
                                        Absent
                                      </button>

                                      {/* More options button */}
                                      <div className="relative">
                                        <button
                                          onClick={() => setMoreMenuSlot(isMoreOpen ? null : slotId)}
                                          className={`h-9 w-9 shrink-0 rounded-lg border flex items-center justify-center transition-all active:scale-90 ${
                                            (currentStatus === 'half_day' || currentStatus === 'half_vacant')
                                              ? `${activeBtn?.color || 'bg-amber-500 text-white'} border-transparent`
                                              : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-400 hover:text-gray-600'
                                          }`}
                                        >
                                          <MoreVertical className="h-4 w-4" />
                                        </button>

                                        {/* Dropdown for more options */}
                                        <AnimatePresence>
                                          {isMoreOpen && (
                                            <>
                                              {/* Invisible backdrop to close on outside click */}
                                              <div className="fixed inset-0 z-40" onClick={() => setMoreMenuSlot(null)} />
                                              <motion.div
                                                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.9, y: -4 }}
                                                transition={{ duration: 0.15 }}
                                                className="absolute right-0 bottom-full mb-1 z-50 w-40 bg-white dark:bg-[#1a1f2e] rounded-xl shadow-xl border border-gray-200 dark:border-white/10 overflow-hidden"
                                              >
                                              <button
                                                onClick={() => { setHalfDaySwap({ shiftKey: shift.key, serviceKey: serviceKey, slotIdx: slotIdx, guard }); setMoreMenuSlot(null); setSwapSearch(''); }}
                                                className={`w-full px-3 py-2.5 text-left text-xs font-medium flex items-center gap-2 transition-colors ${
                                                  currentStatus === 'half_day' ? 'bg-amber-50 text-amber-700' : 'hover:bg-gray-50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300'
                                                }`}
                                              >
                                                <span className="w-2 h-2 rounded-full bg-amber-500" />
                                                Half-Day Swap
                                              </button>
                                              <button
                                                onClick={() => { handleMark(shift.key, serviceKey, slotIdx, 'half_vacant', guard); setMoreMenuSlot(null); }}
                                                className={`w-full px-3 py-2.5 text-left text-xs font-medium flex items-center gap-2 transition-colors ${
                                                  currentStatus === 'half_vacant' ? 'bg-orange-50 text-orange-700' : 'hover:bg-gray-50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300'
                                                }`}
                                              >
                                                <span className="w-2 h-2 rounded-full bg-orange-500" />
                                                Half-Day Vacant
                                              </button>
                                            </motion.div>
                                            </>
                                          )}
                                        </AnimatePresence>
                                      </div>

                                      {/* Undo */}
                                      {att && currentStatus !== 'pending' && (
                                        <button
                                          onClick={() => handleUndo(att.id)}
                                          className="h-9 w-9 shrink-0 rounded-lg bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 flex items-center justify-center text-gray-400 hover:text-gray-600 active:scale-90 transition-all"
                                          title="Undo"
                                        >
                                          <RotateCcw className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* Half-Day Swap Modal */}
      <AnimatePresence>
        {halfDaySwap && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4"
            onClick={() => { setHalfDaySwap(null); setSwapSearch(''); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-white dark:bg-[#0B0F19] rounded-2xl shadow-xl max-h-[70vh] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-bold">Half-Day Swap</h3>
                  <button onClick={() => { setHalfDaySwap(null); setSwapSearch(''); }} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-3">Select who covers the second half of the shift.</p>

                {/* Primary employee info */}
                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-3">
                  <p className="text-[10px] text-amber-600 font-medium mb-0.5">First half</p>
                  <p className="text-sm font-semibold">{halfDaySwap.guard.employee_name} <span className="text-gray-400 font-normal">({halfDaySwap.guard.employee_code})</span></p>
                </div>

                {/* Search for second half employee */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={swapSearch}
                    onChange={e => setSwapSearch(e.target.value)}
                    placeholder="Search employee for second half..."
                    className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent text-sm focus:outline-hidden focus:ring-2 focus:ring-[#D71920]/30"
                    autoFocus
                  />
                </div>
              </div>

              {/* Employee list */}
              <div className="flex-1 overflow-y-auto px-3 py-2">
                {(() => {
                  const primaryId = halfDaySwap.guard.employee_id || halfDaySwap.guard.id;
                  const filtered = allEmployees.filter((e: any) =>
                    e.id !== primaryId &&
                    (!swapSearch || e.name.toLowerCase().includes(swapSearch.toLowerCase()) || e.employee_id.toLowerCase().includes(swapSearch.toLowerCase()))
                  );
                  if (filtered.length === 0) return <p className="text-center text-xs text-gray-400 py-8">No employees found</p>;
                  return (
                    <div className="space-y-1">
                      {filtered.slice(0, 30).map((emp: any) => (
                        <button
                          key={emp.id}
                          onClick={() => handleHalfDaySwapConfirm(emp)}
                          disabled={!!marking}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/10 active:scale-[0.98] transition-all text-left disabled:opacity-50"
                        >
                          <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center text-xs font-bold text-amber-700">
                            {emp.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{emp.name}</p>
                            <p className="text-[10px] text-gray-500">{emp.designation} · {emp.employee_id}</p>
                          </div>
                          <span className="text-[10px] text-amber-600 font-medium shrink-0">Select</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
