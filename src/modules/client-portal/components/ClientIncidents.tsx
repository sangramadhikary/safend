'use client';

import { useState } from 'react';
import { useClientProfile, useClientIncidents, useClientPosts } from '../hooks/useClientData';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Plus, Clock, CheckCircle2, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const INCIDENT_TYPES = [
  { value: 'theft', label: 'Theft' },
  { value: 'trespassing', label: 'Trespassing' },
  { value: 'guard_misconduct', label: 'Guard Misconduct' },
  { value: 'absent_guard', label: 'Absent Guard' },
  { value: 'property_damage', label: 'Property Damage' },
  { value: 'safety_hazard', label: 'Safety Hazard' },
  { value: 'unauthorized_entry', label: 'Unauthorized Entry' },
  { value: 'other', label: 'Other' },
];

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-700' },
  { value: 'medium', label: 'Medium', color: 'bg-amber-100 text-amber-700' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-700' },
  { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-700' },
];

export default function ClientIncidents() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: profile } = useClientProfile();
  const { data: posts } = useClientPosts(profile?.post_ids);
  const { data: incidents, isLoading } = useClientIncidents(profile?.id);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [form, setForm] = useState({
    post_id: '',
    incident_type: 'other',
    severity: 'medium',
    title: '',
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSubmitting(true);

    try {
      const client = getSupabaseClient();
      const post = posts?.find((p: any) => p.id === form.post_id);

      const { error } = await client.from('client_incidents').insert({
        client_user_id: profile.id,
        client_name: profile.client_name,
        post_id: form.post_id || null,
        post_name: post?.post_name || null,
        incident_type: form.incident_type,
        severity: form.severity,
        title: form.title,
        description: form.description,
      });

      if (error) throw error;

      // Reset form and refresh
      setForm({ post_id: '', incident_type: 'other', severity: 'medium', title: '', description: '' });
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['client-incidents'] });
      toast({ title: 'Incident reported', description: 'Our team will review and respond shortly.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to submit incident', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with New button */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground dark:text-white">Incident Reports</h3>
        <Button
          onClick={() => setShowForm(!showForm)}
          size="sm"
          className="bg-[#D71920] hover:bg-[#b8151b] text-white"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Report Incident
        </Button>
      </div>

      {/* New Incident Form */}
      {showForm && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-xs">
          <h4 className="font-medium text-foreground dark:text-white mb-4">New Incident Report</h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Post / Site</Label>
                <select
                  value={form.post_id}
                  onChange={(e) => setForm({ ...form, post_id: e.target.value })}
                  className="w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 text-sm"
                >
                  <option value="">Select a post...</option>
                  {(posts || []).map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.post_name || p.post_code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Incident Type</Label>
                <select
                  value={form.incident_type}
                  onChange={(e) => setForm({ ...form, incident_type: e.target.value })}
                  required
                  className="w-full h-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 text-sm"
                >
                  {INCIDENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Severity</Label>
              <div className="flex gap-2">
                {SEVERITY_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setForm({ ...form, severity: s.value })}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      form.severity === s.value
                        ? `${s.color} border-current ring-1 ring-current/20`
                        : 'bg-white text-muted-foreground border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Brief description of the incident"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Detailed Description</Label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What happened? When? Any witnesses?"
                required
                rows={4}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm resize-none focus:outline-hidden focus:ring-2 focus:ring-[#D71920]/20 focus:border-[#D71920]"
              />
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-[#D71920] hover:bg-[#b8151b] text-white"
              >
                {submitting ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Submitting...
                  </div>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-1.5" />
                    Submit Report
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Incident History */}
      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : (incidents || []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <AlertTriangle className="h-12 w-12 mb-3 opacity-40" />
          <p className="font-medium">No incidents reported</p>
          <p className="text-sm mt-1">Click "Report Incident" to log a new one</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(incidents || []).map((inc: any) => (
            <div
              key={inc.id}
              className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      inc.severity === 'critical' ? 'bg-red-100 text-red-700' :
                      inc.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                      inc.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {inc.severity}
                    </span>
                    <span className="text-xs text-gray-400 capitalize">
                      {inc.incident_type.replace('_', ' ')}
                    </span>
                  </div>
                  <h4 className="font-medium text-foreground dark:text-white text-sm">{inc.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{inc.description}</p>
                  {inc.post_name && (
                    <p className="text-xs text-gray-400 mt-1">📍 {inc.post_name}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 ml-4">
                  <IncidentStatusBadge status={inc.status} />
                  <span className="text-[10px] text-gray-400">
                    {new Date(inc.created_at).toLocaleDateString('en-IN')}
                  </span>
                </div>
              </div>
              {inc.resolution_notes && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    <span className="font-medium">Resolution:</span> {inc.resolution_notes}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IncidentStatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: any; style: string }> = {
    open: { icon: Clock, style: 'bg-red-50 text-red-600 border-red-200' },
    acknowledged: { icon: Clock, style: 'bg-blue-50 text-blue-600 border-blue-200' },
    in_progress: { icon: Clock, style: 'bg-amber-50 text-amber-600 border-amber-200' },
    resolved: { icon: CheckCircle2, style: 'bg-green-50 text-green-600 border-green-200' },
    closed: { icon: CheckCircle2, style: 'bg-gray-50 text-muted-foreground border-gray-200' },
  };
  const { icon: Icon, style } = config[status] || config.open;

  return (
    <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${style}`}>
      <Icon className="h-3 w-3" />
      {status.replace('_', ' ')}
    </span>
  );
}
