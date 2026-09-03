'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  CalendarDays, Plus, Loader2, CheckCircle2, XCircle, Clock, UserCircle,
} from 'lucide-react';
import { supabaseClient } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSupervisorBFF } from '../hooks/useSupervisorBFF';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } } } as const;

const STATUS_CONFIG: Record<string, { color: string; icon: any }> = {
  Pending: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400', icon: Clock },
  Approved: { color: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400', icon: CheckCircle2 },
  Rejected: { color: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400', icon: XCircle },
};

type FilterTab = 'all' | 'Pending' | 'Approved' | 'Rejected';

export default function SupervisorLeaves() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: bffData } = useSupervisorBFF();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    postId: '',
    employeeName: '',
    employeeId: '',
    type: 'Planned Leave',
    subType: 'Unpaid',
    fromDate: format(new Date(), 'yyyy-MM-dd'),
    toDate: format(new Date(), 'yyyy-MM-dd'),
    reason: '',
  });

  const posts = bffData?.posts || [];
  const postIds = posts.map((p: any) => p.id);
  const profile = bffData?.profile;

  // Fetch leave requests for assigned posts
  const { data: leaves = [], isLoading } = useQuery({
    queryKey: ['supervisor-leaves-full', postIds],
    enabled: postIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('leave_requests')
        .select('*')
        .in('post_id', postIds)
        .order('from_date', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch employees assigned to these posts (from rota) for the dropdown
  const { data: postEmployees = [] } = useQuery({
    queryKey: ['supervisor-post-employees', postIds],
    enabled: postIds.length > 0,
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data } = await supabaseClient
        .from('rota_assignments')
        .select('employee_id, employee_name, employee_code, post_id')
        .in('post_id', postIds)
        .eq('rota_date', today);
      // Dedupe by employee_id
      const map = new Map();
      (data || []).forEach((r: any) => {
        if (!map.has(r.employee_id)) map.set(r.employee_id, r);
      });
      return Array.from(map.values());
    },
  });

  const filteredLeaves = activeFilter === 'all' ? leaves : leaves.filter((l: any) => l.status === activeFilter);

  const handleSubmit = async () => {
    if (!formData.postId || !formData.employeeName || !formData.fromDate || !formData.toDate) {
      toast({ title: 'Missing fields', description: 'Post, employee, and dates are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);

    try {
      const post = posts.find((p: any) => p.id === formData.postId);
      const leaveId = `LV-${Date.now().toString(36).toUpperCase()}`;
      const { error } = await supabaseClient.from('leave_requests').insert({
        leave_id: leaveId,
        post_id: formData.postId,
        post_name: post?.post_name || '',
        employee_id: formData.employeeId || null,
        employee_name: formData.employeeName,
        leave_type: `${formData.type} - ${formData.subType}`,
        from_date: formData.fromDate,
        to_date: formData.toDate,
        reason: formData.reason || null,
        status: 'Pending',
        applied_by: profile?.name || 'Supervisor',
      });
      if (error) throw error;
      toast({ title: 'Leave applied', description: 'Request submitted for HR approval.' });
      setShowForm(false);
      setFormData({ postId: '', employeeName: '', employeeId: '', type: 'Planned Leave', subType: 'Unpaid', fromDate: format(new Date(), 'yyyy-MM-dd'), toDate: format(new Date(), 'yyyy-MM-dd'), reason: '' });
      queryClient.invalidateQueries({ queryKey: ['supervisor-leaves-full'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Stats
  const pendingCount = leaves.filter((l: any) => l.status === 'Pending').length;
  const approvedCount = leaves.filter((l: any) => l.status === 'Approved').length;

  return (
    <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }} className="space-y-5">
      <motion.div variants={fadeUp} className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Leave Management</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Apply leave on behalf of employees. HR approves.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#D71920] text-white text-xs font-medium active:scale-95 transition-transform"
        >
          <Plus className="h-3.5 w-3.5" /> Apply Leave
        </button>
      </motion.div>

      {/* Stats */}
      <motion.div variants={fadeUp} className="flex gap-3">
        <div className="flex-1 p-3 rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 text-center">
          <p className="text-lg font-bold text-amber-600">{pendingCount}</p>
          <p className="text-[10px] text-gray-500">Pending</p>
        </div>
        <div className="flex-1 p-3 rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 text-center">
          <p className="text-lg font-bold text-green-600">{approvedCount}</p>
          <p className="text-[10px] text-gray-500">Approved</p>
        </div>
        <div className="flex-1 p-3 rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 text-center">
          <p className="text-lg font-bold">{leaves.length}</p>
          <p className="text-[10px] text-gray-500">Total</p>
        </div>
      </motion.div>

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="p-4 rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 space-y-3">
              <p className="text-sm font-semibold">New Leave Request</p>

              {/* Post */}
              <select value={formData.postId} onChange={e => setFormData({ ...formData, postId: e.target.value })} className="w-full h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 text-sm">
                <option value="">Select post...</option>
                {posts.map((p: any) => <option key={p.id} value={p.id}>{p.post_name}</option>)}
              </select>

              {/* Employee — from rota or manual */}
              <select
                value={formData.employeeId}
                onChange={e => {
                  const emp = postEmployees.find((pe: any) => pe.employee_id === e.target.value);
                  setFormData({ ...formData, employeeId: e.target.value, employeeName: emp?.employee_name || '' });
                }}
                className="w-full h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 text-sm"
              >
                <option value="">Select employee...</option>
                {postEmployees.filter((pe: any) => !formData.postId || pe.post_id === formData.postId).map((pe: any) => (
                  <option key={pe.employee_id} value={pe.employee_id}>{pe.employee_name} ({pe.employee_code})</option>
                ))}
              </select>

              {/* Type + SubType */}
              <div className="flex gap-2">
                <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className="flex-1 h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 text-sm">
                  <option value="Planned Leave">Planned Leave</option>
                  <option value="Sick Leave">Sick Leave</option>
                  <option value="Abscond">Abscond</option>
                </select>
                <select value={formData.subType} onChange={e => setFormData({ ...formData, subType: e.target.value })} className="flex-1 h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 text-sm">
                  <option value="Paid">Paid</option>
                  <option value="Unpaid">Unpaid</option>
                </select>
              </div>

              {/* Dates */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-gray-500 mb-0.5 block">From</label>
                  <input type="date" value={formData.fromDate} onChange={e => setFormData({ ...formData, fromDate: e.target.value })} className="w-full h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 text-sm" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-gray-500 mb-0.5 block">To</label>
                  <input type="date" value={formData.toDate} onChange={e => setFormData({ ...formData, toDate: e.target.value })} className="w-full h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 text-sm" />
                </div>
              </div>

              {/* Reason */}
              <textarea value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} placeholder="Reason for leave..." rows={2} className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 py-2 text-sm resize-none" />

              {/* Info */}
              <p className="text-[10px] text-gray-400">Operations can only request. HR is the final approver.</p>

              {/* Actions */}
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 text-sm font-medium active:scale-[0.97] transition-transform">Cancel</button>
                <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-[#D71920] text-white text-sm font-medium active:scale-[0.97] transition-transform disabled:opacity-50">
                  {saving ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter pills */}
      <motion.div variants={fadeUp} className="flex gap-2 overflow-x-auto pb-1">
        {(['all', 'Pending', 'Approved', 'Rejected'] as FilterTab[]).map(f => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 ${
              activeFilter === f
                ? 'bg-[#D71920] text-white'
                : 'bg-white dark:bg-white/3 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-white/10'
            }`}
          >
            {f === 'all' ? 'All' : f} {f !== 'all' && `(${leaves.filter((l: any) => l.status === f).length})`}
          </button>
        ))}
      </motion.div>

      {/* Leave list */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : filteredLeaves.length === 0 ? (
        <div className="text-center py-10 rounded-xl border border-dashed border-gray-200 dark:border-white/10">
          <CalendarDays className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">No leave requests {activeFilter !== 'all' ? `with status "${activeFilter}"` : ''}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLeaves.map((leave: any) => {
            const statusConf = STATUS_CONFIG[leave.status] || STATUS_CONFIG.Pending;
            const Icon = statusConf.icon;
            return (
              <div key={leave.id} className="p-3.5 rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${statusConf.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{leave.employee_name || 'Employee'}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${statusConf.color}`}>
                        {leave.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-xs text-gray-500">{leave.leave_type}</p>
                      {(leave.source === 'employee_self_service' || !leave.applied_by) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                          <UserCircle className="h-2.5 w-2.5" />
                          Employee Submitted
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                      <span>{leave.from_date} → {leave.to_date}</span>
                      {leave.post_name && <><span>·</span><span>{leave.post_name}</span></>}
                    </div>
                    {leave.reason && <p className="text-[11px] text-gray-500 mt-1.5 line-clamp-1">{leave.reason}</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
