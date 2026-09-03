'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Utensils, MapPin, Search, ChevronDown, Loader2, Save, Minus, Plus, Info } from 'lucide-react';
import { supabaseClient } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSupervisorBFF } from '../hooks/useSupervisorBFF';
import { useQuery } from '@tanstack/react-query';

const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } } } as const;

export default function SupervisorMess() {
  const { toast } = useToast();
  const { data: bffData } = useSupervisorBFF();
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [showPostPicker, setShowPostPicker] = useState(false);
  const [postSearch, setPostSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, number>>({});

  const posts = bffData?.posts || [];
  const activePost = selectedPostId || (posts.length > 0 ? posts[0].id : null);
  const activePostData = posts.find((p: any) => p.id === activePost);

  // Active monthly mess cycle that includes this post (created by Operations).
  const { data: messWeek, isLoading: loadingWeek } = useQuery({
    queryKey: ['supervisor-mess-cycle', activePost],
    enabled: !!activePost,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('mess_week_posts')
        .select('mess_week_id, mess_weeks!inner(id, week_start_date, week_end_date, status)')
        .eq('post_id', activePost);
      if (error) throw error;
      const active = (data || [])
        .map((r: any) => r.mess_weeks)
        .filter((w: any) => w && w.status !== 'deducted')
        .sort((a: any, b: any) => (a.week_start_date < b.week_start_date ? 1 : -1));
      return active[0] || null;
    },
  });

  // Guards deployed at this post
  const { data: guards = [], isLoading: loadingGuards } = useQuery({
    queryKey: ['supervisor-mess-guards', activePost],
    enabled: !!activePost,
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('rota_assignments')
        .select('employee_id, employee_name, employee_code')
        .eq('post_id', activePost);
      if (error) throw error;
      const seen = new Set<string>();
      return (data || []).filter((r: any) => {
        if (!r.employee_id || seen.has(r.employee_id)) return false;
        seen.add(r.employee_id);
        return true;
      });
    },
  });

  // Existing meal records for this cycle + post
  const { data: records = [], refetch } = useQuery({
    queryKey: ['supervisor-mess-records', messWeek?.id, activePost],
    enabled: !!messWeek?.id && !!activePost,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('mess_meal_records')
        .select('id, employee_id, meal_count')
        .eq('mess_week_id', messWeek.id)
        .eq('post_id', activePost);
      if (error) throw error;
      return data || [];
    },
  });

  const recordMap = useMemo(() => {
    const m: Record<string, { id: string; meal_count: number }> = {};
    records.forEach((r: any) => { m[r.employee_id] = { id: r.id, meal_count: r.meal_count }; });
    return m;
  }, [records]);

  const getValue = (empId: string) => drafts[empId] ?? recordMap[empId]?.meal_count ?? 0;
  const totalMeals = useMemo(
    () => guards.reduce((s: number, g: any) => s + getValue(g.employee_id), 0),
    [guards, drafts, recordMap]
  );

  const setValue = (empId: string, val: number) => setDrafts((prev) => ({ ...prev, [empId]: Math.max(0, val) }));

  const saveMeal = async (guard: any) => {
    if (!activePostData || !messWeek) return;
    setSavingId(guard.employee_id);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8);
    try {
      const existing = recordMap[guard.employee_id];
      if (existing) {
        const { error } = await supabaseClient
          .from('mess_meal_records')
          .update({ meal_count: getValue(guard.employee_id) })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseClient.from('mess_meal_records').insert({
          mess_week_id: messWeek.id,
          post_id: activePost,
          post_name: activePostData.post_name,
          employee_id: guard.employee_id,
          employee_name: guard.employee_name,
          meal_count: getValue(guard.employee_id),
        });
        if (error) throw error;
      }
      toast({ title: 'Saved', description: `${guard.employee_name}: ${getValue(guard.employee_id)} meals` });
      refetch();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  const filteredPosts = posts.filter((p: any) => !postSearch || p.post_name.toLowerCase().includes(postSearch.toLowerCase()));

  return (
    <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }} className="space-y-5">
      <motion.div variants={fadeUp}>
        <h2 className="text-xl font-bold">Mess Meals</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Log meals per guard
          {messWeek && ` · ${format(new Date(messWeek.week_start_date), 'MMM yyyy')} cycle`}
        </p>
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
            <p className="text-[10px] text-gray-500 truncate">{guards.length} guards · {totalMeals} meals logged</p>
          </div>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </button>
      </motion.div>

      {/* No active cycle */}
      {!loadingWeek && !messWeek && activePost && (
        <motion.div variants={fadeUp} className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">No active mess cycle for this post</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Operations needs to open this month&apos;s mess cycle before meals can be logged.</p>
          </div>
        </motion.div>
      )}

      {/* Guards list */}
      {messWeek && (loadingGuards ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : guards.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">No guards deployed at this post.</div>
      ) : (
        <motion.div variants={fadeUp} className="space-y-2.5">
          {guards.map((g: any) => {
            const val = getValue(g.employee_id);
            const dirty = drafts[g.employee_id] !== undefined && drafts[g.employee_id] !== (recordMap[g.employee_id]?.meal_count ?? 0);
            return (
              <div key={g.employee_id} className="rounded-xl border border-gray-100 dark:border-white/10 bg-white dark:bg-white/3 p-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-white/10 flex items-center justify-center text-xs font-bold shrink-0">
                    {(g.employee_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{g.employee_name}</p>
                    <p className="text-[10px] text-gray-400">{g.employee_code}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setValue(g.employee_id, val - 1)} className="w-8 h-8 rounded-lg border border-gray-200 dark:border-white/10 flex items-center justify-center active:scale-90">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <input type="number" min="0" value={val} onChange={(e) => setValue(g.employee_id, parseInt(e.target.value) || 0)}
                      className="w-12 h-8 text-center rounded-lg border border-gray-200 dark:border-white/10 bg-transparent text-sm font-bold" />
                    <button onClick={() => setValue(g.employee_id, val + 1)} className="w-8 h-8 rounded-lg border border-gray-200 dark:border-white/10 flex items-center justify-center active:scale-90">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => saveMeal(g)} disabled={!dirty || savingId === g.employee_id}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-colors ${dirty ? 'bg-[#D71920] text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-300'}`}>
                      {savingId === g.employee_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </motion.div>
      ))}

      {/* Post picker modal */}
      {showPostPicker && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowPostPicker(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white dark:bg-[#0B0F19] rounded-2xl shadow-xl max-h-[70vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input value={postSearch} onChange={(e) => setPostSearch(e.target.value)} placeholder="Search posts..." autoFocus
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent text-sm focus:outline-hidden focus:ring-2 focus:ring-[#D71920]/30" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {filteredPosts.map((p: any) => (
                <button key={p.id} onClick={() => { setSelectedPostId(p.id); setShowPostPicker(false); setDrafts({}); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-white/3 text-left">
                  <Utensils className="h-4 w-4 text-gray-400" />
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{p.post_name}</p><p className="text-[10px] text-gray-500 truncate">{p.client_name}</p></div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
