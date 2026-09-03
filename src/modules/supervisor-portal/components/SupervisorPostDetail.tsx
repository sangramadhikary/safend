'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, MapPin, Users, Shield, Clock, Phone, Mail, Building2, Calendar,
  CheckCircle2, XCircle, AlertCircle, Navigation, ClipboardList, ShieldCheck,
  AlertTriangle, UtensilsCrossed,
} from 'lucide-react';
import { supabaseClient } from '@/integrations/supabase/client';
import { differenceInDays, format } from 'date-fns';
import { useSupervisorBFF } from '../hooks/useSupervisorBFF';

const SERVICE_LABELS: Record<string, string> = {
  unarmedGuards: 'Unarmed Guards',
  armedGuards: 'Armed Guards',
  supervisors: 'Supervisors',
  patrolOfficers: 'Patrol Officers',
  pso: 'PSO',
  bouncers: 'Bouncers',
  manpower: 'Manpower',
  eventSecurity: 'Event Security', personalSecurity: 'Personal Security',
};
const SHIFT_LABELS: Record<string, string> = { day: 'Day (06–14)', afternoon: 'Afternoon (14–22)', night: 'Night (22–06)' };

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || '';

interface SupervisorPostDetailProps {
  postId: string;
  onBack: () => void;
}

export default function SupervisorPostDetail({ postId, onBack }: SupervisorPostDetailProps) {
  const { data: bffData } = useSupervisorBFF();
  const [patrols, setPatrols] = useState<any[]>([]);
  const [penalties, setPenalties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const posts = bffData?.posts || [];
  const rota = bffData?.rota || [];
  const attendance = bffData?.attendance || [];
  const leaves = bffData?.leaves || [];

  const post = posts.find((p: any) => p.id === postId) as any;

  // Fetch additional data not in BFF (patrols, penalties for this post)
  useEffect(() => {
    if (!postId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [patrolRes, penaltyRes] = await Promise.all([
          supabaseClient.from('patrol_logs').select('*').eq('post_id', postId).order('patrol_date', { ascending: false }).limit(20),
          supabaseClient.from('penalties').select('*').eq('post_id', postId).order('violation_date', { ascending: false }).limit(20),
        ]);
        if (!cancelled) {
          setPatrols(patrolRes.data || []);
          setPenalties(penaltyRes.data || []);
        }
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [postId]);

  if (!post) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-gray-500">Post not found.</p>
        <button onClick={onBack} className="mt-3 text-sm text-[#D71920] font-medium">← Go back</button>
      </div>
    );
  }

  const loc = post.location || {};
  const locStr = [loc.address, loc.city, loc.state, loc.pincode].filter(Boolean).join(', ');
  const hasCoords = loc.latitude && loc.longitude;
  const daysWithClient = post.created_at ? differenceInDays(new Date(), new Date(post.created_at)) : null;
  const postRota = rota.filter(r => r.post_id === postId);
  const postAtt = attendance.filter(a => a.post_id === postId);
  const postLeaves = leaves.filter(l => l.post_id === postId && l.status === 'Approved');
  const presentCount = postAtt.filter(a => a.status === 'present').length;
  const absentCount = postAtt.filter(a => a.status === 'absent').length;
  const serviceInstances = post.service_instances || {};

  const mapEmbedUrl = hasCoords
    ? `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_KEY}&q=${loc.latitude},${loc.longitude}&zoom=16`
    : '';

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }} className="space-y-5">
      {/* Back button + title */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 active:scale-90 transition-transform">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold truncate">{post.post_name}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{post.client_name} · {post.post_code || ''}</p>
        </div>
      </div>

      {/* Map */}
      {mapEmbedUrl && (
        <div className="rounded-xl overflow-hidden border border-gray-100 dark:border-white/10 h-[200px] md:h-[260px]">
          <iframe
            title="Post Location"
            width="100%"
            height="100%"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={mapEmbedUrl}
          />
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-2">
        <MiniCard value={post.total_guards} label="Guards" />
        <MiniCard value={postRota.length} label="Deployed" />
        <MiniCard value={presentCount} label="Present" color="text-green-600" />
        <MiniCard value={absentCount} label="Absent" color="text-red-600" />
      </div>

      {/* ─── Location ─── */}
      <Card icon={<MapPin className="h-4 w-4" />} title="Location">
        {loc.address && <p className="text-sm font-medium">{loc.address}</p>}
        <p className="text-xs text-gray-500">{[loc.city, loc.state, loc.pincode].filter(Boolean).join(', ') || 'No address'}</p>
        {hasCoords && <p className="text-[10px] text-gray-400 font-mono mt-1">{loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}</p>}
      </Card>

      {/* ─── Client Contact ─── */}
      {(post.contact_person || post.contact_phone || post.contact_email) && (
        <Card icon={<Users className="h-4 w-4" />} title="Client Contact">
          <div className="space-y-2 text-sm">
            {post.contact_person && <Row icon={<Users className="h-3.5 w-3.5" />} text={post.contact_person} bold />}
            {post.contact_phone && (
              <a href={`tel:${post.contact_phone}`} className="flex items-center gap-2 text-gray-600 dark:text-gray-400 active:text-[#D71920]">
                <Phone className="h-3.5 w-3.5 text-gray-400" />{post.contact_phone}
              </a>
            )}
            {post.contact_email && (
              <a href={`mailto:${post.contact_email}`} className="flex items-center gap-2 text-gray-600 dark:text-gray-400 active:text-[#D71920]">
                <Mail className="h-3.5 w-3.5 text-gray-400" />{post.contact_email}
              </a>
            )}
          </div>
        </Card>
      )}

      {/* ─── Duty Structure ─── */}
      {Object.keys(serviceInstances).length > 0 && (() => {
        // Build a clean list of enabled duties
        const duties: { service: string; shifts: { label: string; qty: number }[] }[] = [];
        Object.entries(serviceInstances).forEach(([key, instances]: [string, any]) => {
          if (!Array.isArray(instances)) return;
          instances.forEach((inst: any) => {
            if (!inst?.shifts) return;
            const enabledShifts = Object.entries(inst.shifts)
              .filter(([, s]: [string, any]) => s?.enabled && (s?.quantity || s?.count || 0) > 0)
              .map(([sk, s]: [string, any]) => ({
                label: sk === 'day' ? 'Day' : sk === 'afternoon' ? 'Afternoon' : sk === 'night' ? 'Night' : sk,
                qty: s?.quantity || s?.count || 0,
              }));
            if (enabledShifts.length > 0) {
              duties.push({ service: SERVICE_LABELS[key] || key, shifts: enabledShifts });
            }
          });
        });
        if (duties.length === 0) return null;
        const totalPerDay = duties.reduce((sum, d) => sum + d.shifts.reduce((s, sh) => s + sh.qty, 0), 0);
        return (
          <Card icon={<Shield className="h-4 w-4" />} title={`Duty Structure (${totalPerDay} per day)`}>
            <div className="space-y-3">
              {duties.map((d, i) => (
                <div key={i}>
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1.5">{d.service}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {d.shifts.map(sh => (
                      <div key={sh.label} className="text-center py-2 rounded-md bg-gray-50 dark:bg-white/2 border border-gray-100 dark:border-white/5">
                        <p className="text-lg font-bold">{sh.qty}</p>
                        <p className="text-[10px] text-gray-500">{sh.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })()}

      {/* ─── Today's Deployment ─── */}
      {postRota.length > 0 && (
        <Card icon={<ClipboardList className="h-4 w-4" />} title={`Today's Deployment (${postRota.length})`}>
          <div className="space-y-1.5">
            {postRota.map((r) => {
              const att = postAtt.find(a => a.employee_id === r.employee_id);
              const status = att?.status || 'pending';
              return (
                <div key={r.id} className="flex items-center gap-2 py-2 px-3 rounded-md bg-gray-50 dark:bg-white/2">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${status === 'present' ? 'bg-green-500' : status === 'absent' ? 'bg-red-500' : 'bg-gray-300'}`} />
                  <span className="text-sm font-medium flex-1 truncate">{r.employee_name}</span>
                  <span className="text-[11px] text-gray-500">{r.shift_key} · {SERVICE_LABELS[r.service_type_key] || r.service_type_key}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ─── On Leave ─── */}
      {postLeaves.length > 0 && (
        <Card icon={<AlertCircle className="h-4 w-4" />} title={`On Leave (${postLeaves.length})`}>
          {postLeaves.map(l => (
            <div key={l.id} className="flex items-center justify-between text-sm py-1.5">
              <span className="font-medium">{l.employee_name}</span>
              <span className="text-xs text-gray-500">{l.leave_type} · until {new Date(l.to_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
            </div>
          ))}
        </Card>
      )}

      {/* ─── Patrols ─── */}
      {patrols.length > 0 && (
        <Card icon={<ShieldCheck className="h-4 w-4" />} title={`Recent Patrols (${patrols.length})`}>
          {patrols.slice(0, 5).map((p: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 dark:border-white/5 last:border-0">
              <span className="text-xs">{p.patrol_date ? format(new Date(p.patrol_date), 'dd MMM') : '—'}</span>
              <span className="text-xs text-gray-600">{p.officer_name || '—'}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${p.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {p.status || 'pending'}
              </span>
            </div>
          ))}
        </Card>
      )}

      {/* ─── Penalties ─── */}
      {penalties.length > 0 && (
        <Card icon={<AlertTriangle className="h-4 w-4" />} title={`Penalties (${penalties.length})`}>
          {penalties.slice(0, 5).map((p: any, i: number) => (
            <div key={i} className="text-sm py-1.5 border-b border-gray-50 dark:border-white/5 last:border-0">
              <div className="flex items-center justify-between">
                <span className="font-medium text-xs">{p.staff_name || '—'}</span>
                <span className="text-[10px] text-gray-500">{p.violation_date ? format(new Date(p.violation_date), 'dd MMM') : '—'}</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">{p.offense || '—'}</p>
            </div>
          ))}
        </Card>
      )}

      {/* ─── Directions button ─── */}
      {hasCoords && (
        <button
          onClick={() => {
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}&travelmode=driving`, '_blank');
          }}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#D71920] text-white text-sm font-medium active:scale-[0.97] transition-transform sticky bottom-20 lg:bottom-4 shadow-lg"
        >
          <Navigation className="h-4 w-4" />
          Get Directions
        </button>
      )}
    </motion.div>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 p-4 space-y-2">
      <h4 className="text-xs font-semibold flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
        <span className="text-[#D71920]">{icon}</span>
        {title}
      </h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function MiniCard({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className="text-center p-2.5 rounded-lg bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10">
      <p className={`text-lg font-bold ${color || ''}`}>{value}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}

function Row({ icon, text, bold }: { icon: React.ReactNode; text: string; bold?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-400">{icon}</span>
      <span className={bold ? 'font-medium' : 'text-gray-600 dark:text-gray-400'}>{text}</span>
    </div>
  );
}
