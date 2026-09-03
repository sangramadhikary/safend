'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  Shield, AlertTriangle, Plus, Search, ChevronDown, Loader2,
  CheckCircle2, Clock, Eye, XCircle, Clipboard,
} from 'lucide-react';
import { supabaseClient } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSupervisorBFF } from '../hooks/useSupervisorBFF';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } } } as const;

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  low: 'bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400',
};

const STATUS_COLORS: Record<string, string> = {
  Open: 'bg-red-100 text-red-700', open: 'bg-red-100 text-red-700',
  Resolved: 'bg-green-100 text-green-700', resolved: 'bg-green-100 text-green-700',
  in_progress: 'bg-amber-100 text-amber-700',
  acknowledged: 'bg-blue-100 text-blue-700',
};

type Tab = 'discipline' | 'incidents';

export default function SupervisorPatrols() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: bffData } = useSupervisorBFF();
  const [activeTab, setActiveTab] = useState<Tab>('discipline');
  const [showPenaltyForm, setShowPenaltyForm] = useState(false);
  const [showIncidentForm, setShowIncidentForm] = useState(false);

  const posts = bffData?.posts || [];
  const postIds = posts.map((p: any) => p.id);
  const profile = bffData?.profile;

  return (
    <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }} className="space-y-5">
      <motion.div variants={fadeUp}>
        <h2 className="text-xl font-bold">Field Operations</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Discipline, compliance & incidents</p>
      </motion.div>

      {/* Tab pills */}
      <motion.div variants={fadeUp} className="flex gap-2">
        <button
          onClick={() => setActiveTab('discipline')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-all active:scale-95 ${
            activeTab === 'discipline' ? 'bg-[#D71920] text-white' : 'bg-white dark:bg-white/3 text-gray-600 border border-gray-200 dark:border-white/10'
          }`}
        >
          <Clipboard className="h-3.5 w-3.5" /> Discipline
        </button>
        <button
          onClick={() => setActiveTab('incidents')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-all active:scale-95 ${
            activeTab === 'incidents' ? 'bg-[#D71920] text-white' : 'bg-white dark:bg-white/3 text-gray-600 border border-gray-200 dark:border-white/10'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" /> Incidents
        </button>
      </motion.div>

      {activeTab === 'discipline' ? (
        <DisciplineSection postIds={postIds} posts={posts} profile={profile} />
      ) : (
        <IncidentsSection postIds={postIds} posts={posts} profile={profile} />
      )}
    </motion.div>
  );
}

// ─── Discipline / Penalties Section ─────────────────────────────────────────

function DisciplineSection({ postIds, posts, profile }: { postIds: string[]; posts: any[]; profile: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ postId: '', staffName: '', offense: '', offenseType: 'Minor', notes: '' });
  const [saving, setSaving] = useState(false);

  const { data: penalties = [], isLoading } = useQuery({
    queryKey: ['supervisor-penalties', postIds],
    enabled: postIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('penalties')
        .select('*')
        .in('post_id', postIds)
        .order('violation_date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const handleSubmit = async () => {
    if (!formData.postId || !formData.staffName || !formData.offense) {
      toast({ title: 'Missing fields', description: 'Post, staff name, and offense are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);
    try {
      const post = posts.find((p: any) => p.id === formData.postId);
      const { error } = await supabaseClient.from('penalties').insert({
        post_id: formData.postId,
        post_name: post?.post_name || '',
        client_name: post?.client_name || '',
        staff_name: formData.staffName,
        offense: formData.offense,
        offense_type: formData.offenseType,
        source_of_information: 'Supervisor',
        reported_by: profile?.name || 'Supervisor',
        violation_date: format(new Date(), 'yyyy-MM-dd'),
        status: 'Open',
        notes: formData.notes || null,
      });
      if (error) throw error;
      toast({ title: 'Recorded', description: 'Penalty entry saved.' });
      setShowForm(false);
      setFormData({ postId: '', staffName: '', offense: '', offenseType: 'Minor', notes: '' });
      queryClient.invalidateQueries({ queryKey: ['supervisor-penalties'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{penalties.length} records</p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#D71920] text-white text-xs font-medium active:scale-95 transition-transform"
        >
          <Plus className="h-3.5 w-3.5" /> Record Penalty
        </button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="p-4 rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 space-y-3">
              <select value={formData.postId} onChange={e => setFormData({ ...formData, postId: e.target.value })} className="w-full h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 text-sm">
                <option value="">Select post...</option>
                {posts.map((p: any) => <option key={p.id} value={p.id}>{p.post_name}</option>)}
              </select>
              <input value={formData.staffName} onChange={e => setFormData({ ...formData, staffName: e.target.value })} placeholder="Staff name" className="w-full h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 text-sm" />
              <input value={formData.offense} onChange={e => setFormData({ ...formData, offense: e.target.value })} placeholder="Offense / violation" className="w-full h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 text-sm" />
              <div className="flex gap-2">
                <select value={formData.offenseType} onChange={e => setFormData({ ...formData, offenseType: e.target.value })} className="flex-1 h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 text-sm">
                  <option value="Minor">Minor</option>
                  <option value="Major">Major</option>
                  <option value="Critical">Critical</option>
                </select>
                <input value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Notes (optional)" className="flex-1 h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 text-sm" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg border border-gray-200 dark:border-white/10 text-sm font-medium active:scale-97 transition-transform">Cancel</button>
                <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2 rounded-lg bg-[#D71920] text-white text-sm font-medium active:scale-97 transition-transform disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : penalties.length === 0 ? (
        <div className="text-center py-10 rounded-xl border border-dashed border-gray-200 dark:border-white/10">
          <Clipboard className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">No discipline records</p>
        </div>
      ) : (
        <div className="space-y-2">
          {penalties.map((p: any) => (
            <div key={p.id} className="p-3.5 rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{p.staff_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{p.offense}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{p.post_name} · {p.violation_date ? format(new Date(p.violation_date), 'dd MMM yyyy') : '—'}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600'}`}>
                    {p.status}
                  </span>
                  <span className="text-[10px] text-gray-400">{p.offense_type}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Incidents Section ──────────────────────────────────────────────────────

function IncidentsSection({ postIds, posts, profile }: { postIds: string[]; posts: any[]; profile: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ postId: '', title: '', description: '', severity: 'medium', type: 'security_breach' });
  const [saving, setSaving] = useState(false);

  // Fetch patrol-based incidents (issues found during patrols)
  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ['supervisor-incidents', postIds],
    enabled: postIds.length > 0,
    queryFn: async () => {
      // Patrol logs with issues
      const { data: patrolIssues } = await supabaseClient
        .from('patrol_logs')
        .select('*')
        .in('post_id', postIds)
        .neq('issues_found', '')
        .not('issues_found', 'is', null)
        .order('patrol_date', { ascending: false })
        .limit(30);

      // Client incidents
      const { data: clientIncidents } = await supabaseClient
        .from('client_incidents')
        .select('*')
        .in('post_id', postIds)
        .order('created_at', { ascending: false })
        .limit(30);

      const mapped = [
        ...(patrolIssues || []).map((p: any) => ({
          id: p.id,
          source: 'patrol',
          date: p.patrol_date,
          title: `Issue at ${p.sites_visited || 'site'}`,
          description: p.issues_found,
          severity: 'medium',
          status: p.incident_status || 'open',
          officer: p.officer_name,
          post_name: p.post_name || p.sites_visited,
        })),
        ...(clientIncidents || []).map((c: any) => ({
          id: c.id,
          source: 'client',
          date: c.incident_date || c.created_at?.split('T')[0],
          title: c.title || c.incident_type || 'Client Incident',
          description: c.description,
          severity: c.severity || 'medium',
          status: c.status || 'open',
          post_name: c.post_name,
        })),
      ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      return mapped;
    },
  });

  const handleSubmit = async () => {
    if (!formData.postId || !formData.title || !formData.description) {
      toast({ title: 'Missing fields', variant: 'destructive' });
      return;
    }
    setSaving(true);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);
    try {
      const post = posts.find((p: any) => p.id === formData.postId);
      // Insert as a patrol log with issues
      const { error } = await supabaseClient.from('patrol_logs').insert({
        post_id: formData.postId,
        post_name: post?.post_name || '',
        patrol_date: format(new Date(), 'yyyy-MM-dd'),
        officer_name: profile?.name || 'Supervisor',
        sites_visited: post?.post_name || '',
        issues_found: `[${formData.severity.toUpperCase()}] ${formData.title}: ${formData.description}`,
        status: 'completed',
        incident_status: 'open',
      });
      if (error) throw error;
      toast({ title: 'Incident reported', description: 'Logged successfully.' });
      setShowForm(false);
      setFormData({ postId: '', title: '', description: '', severity: 'medium', type: 'security_breach' });
      queryClient.invalidateQueries({ queryKey: ['supervisor-incidents'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{incidents.length} incidents</p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#D71920] text-white text-xs font-medium active:scale-95 transition-transform"
        >
          <Plus className="h-3.5 w-3.5" /> Report Incident
        </button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="p-4 rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 space-y-3">
              <select value={formData.postId} onChange={e => setFormData({ ...formData, postId: e.target.value })} className="w-full h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 text-sm">
                <option value="">Select post...</option>
                {posts.map((p: any) => <option key={p.id} value={p.id}>{p.post_name}</option>)}
              </select>
              <input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Incident title" className="w-full h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 text-sm" />
              <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Describe the incident..." rows={3} className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 py-2 text-sm resize-none" />
              <select value={formData.severity} onChange={e => setFormData({ ...formData, severity: e.target.value })} className="w-full h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 text-sm">
                <option value="low">Low severity</option>
                <option value="medium">Medium severity</option>
                <option value="high">High severity</option>
                <option value="critical">Critical</option>
              </select>
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg border border-gray-200 dark:border-white/10 text-sm font-medium active:scale-97 transition-transform">Cancel</button>
                <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2 rounded-lg bg-[#D71920] text-white text-sm font-medium active:scale-97 transition-transform disabled:opacity-50">
                  {saving ? 'Saving...' : 'Report'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-10 rounded-xl border border-dashed border-gray-200 dark:border-white/10">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">No incidents reported</p>
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map((inc: any) => (
            <div key={inc.id} className="p-3.5 rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{inc.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{inc.description}</p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {inc.post_name} · {inc.date ? format(new Date(inc.date), 'dd MMM yyyy') : '—'}
                    {inc.officer && <> · {inc.officer}</>}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[inc.severity] || SEVERITY_COLORS.medium}`}>
                    {inc.severity}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[inc.status] || 'bg-gray-100 text-gray-600'}`}>
                    {inc.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
