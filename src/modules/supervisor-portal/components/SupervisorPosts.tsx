'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Users, Navigation, ChevronDown, CheckCircle2, XCircle, AlertCircle, Info,
} from 'lucide-react';
import { useSupervisorBFF } from '../hooks/useSupervisorBFF';

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } } as const;
const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } } } as const;

interface SupervisorPostsProps {
  onOpenPostDetail?: (postId: string) => void;
}

export default function SupervisorPosts({ onOpenPostDetail }: SupervisorPostsProps) {
  const { data, isLoading } = useSupervisorBFF();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const posts = data?.posts || [];
  const rota = data?.rota || [];
  const attendance = data?.attendance || [];
  const leaves = data?.leaves || [];

  const toggleExpand = (id: string) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8);
    setExpandedId(prev => prev === id ? null : id);
  };

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-8 w-32 rounded bg-gray-100 dark:bg-white/5" />
        {[0, 1].map(i => <div key={i} className="h-24 rounded-xl bg-gray-100 dark:bg-white/5" />)}
      </div>
    );
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
      <motion.div variants={fadeUp}>
        <h2 className="text-xl font-bold">My Posts</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{posts.length} post{posts.length !== 1 ? 's' : ''} under your supervision</p>
      </motion.div>

      {posts.length === 0 ? (
        <motion.div variants={fadeUp} className="text-center py-16 rounded-xl border border-dashed border-gray-200 dark:border-white/10">
          <MapPin className="h-10 w-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500">No posts assigned yet</p>
          <p className="text-xs text-gray-400 mt-1">Contact your administrator</p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {posts.map((post: any) => {
            const isExpanded = expandedId === post.id;
            const loc = post.location || {};
            const locStr = [loc.city, loc.state].filter(Boolean).join(', ');
            const hasCoords = loc.latitude && loc.longitude;
            const postRota = rota.filter(r => r.post_id === post.id);
            const postAtt = attendance.filter(a => a.post_id === post.id);
            const postLeaves = leaves.filter(l => l.post_id === post.id && l.status === 'Approved');
            const presentCount = postAtt.filter(a => a.status === 'present').length;
            const absentCount = postAtt.filter(a => a.status === 'absent').length;
            const pendingCount = postAtt.filter(a => a.status === 'pending').length;

            return (
              <motion.div
                key={post.id}
                variants={fadeUp}
                className="rounded-xl bg-white dark:bg-white/3 border border-gray-100 dark:border-white/10 overflow-hidden"
              >
                {/* Header — tap to expand */}
                <button
                  onClick={() => toggleExpand(post.id)}
                  className="w-full text-left p-4 flex items-center gap-3 active:bg-gray-50 dark:active:bg-white/2 transition-colors"
                >
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    presentCount > 0 && absentCount === 0 ? 'bg-green-500' :
                    absentCount > 0 ? 'bg-red-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{post.post_name}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {post.client_name} · {post.total_guards} guards{locStr ? ` · ${locStr}` : ''}
                    </p>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 shrink-0 font-medium mr-2">
                    {post.shift_type}
                  </span>
                  <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </motion.div>
                </button>

                {/* Expanded — quick glance + action buttons */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-4 border-t border-gray-100 dark:border-white/5 pt-4">

                        {/* Today's quick stats */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="text-center p-2.5 rounded-lg bg-gray-50 dark:bg-white/2">
                            <p className="text-lg font-bold text-green-600">{presentCount}</p>
                            <p className="text-[10px] text-gray-500">Present</p>
                          </div>
                          <div className="text-center p-2.5 rounded-lg bg-gray-50 dark:bg-white/2">
                            <p className="text-lg font-bold text-red-600">{absentCount}</p>
                            <p className="text-[10px] text-gray-500">Absent</p>
                          </div>
                          <div className="text-center p-2.5 rounded-lg bg-gray-50 dark:bg-white/2">
                            <p className="text-lg font-bold text-gray-500">{pendingCount}</p>
                            <p className="text-[10px] text-gray-500">Pending</p>
                          </div>
                        </div>

                        {/* Deployed today */}
                        <div className="text-xs text-gray-600 dark:text-gray-400 flex items-center justify-between">
                          <span>Deployed today</span>
                          <span className="font-semibold">{postRota.length} / {post.total_guards} guards</span>
                        </div>

                        {/* On leave */}
                        {postLeaves.length > 0 && (
                          <div className="text-xs text-amber-700 dark:text-amber-400 flex items-center justify-between">
                            <span>On leave today</span>
                            <span className="font-semibold">{postLeaves.length} employee{postLeaves.length > 1 ? 's' : ''}</span>
                          </div>
                        )}

                        {/* Contact quick info */}
                        {post.contact_phone && (
                          <a
                            href={`tel:${post.contact_phone}`}
                            className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 active:text-[#D71920]"
                          >
                            <span className="text-gray-400">Client:</span>
                            <span className="font-medium">{post.contact_person || post.client_name}</span>
                            <span className="ml-auto underline">{post.contact_phone}</span>
                          </a>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);
                              if (onOpenPostDetail) {
                                onOpenPostDetail(post.id);
                              } else {
                                // Fallback: navigate to hash-based detail
                                window.location.hash = `post-detail-${post.id}`;
                              }
                            }}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-200 dark:border-white/10 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/3 active:scale-[0.97] transition-all"
                          >
                            <Info className="h-4 w-4" />
                            More Information
                          </button>
                          {hasCoords && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);
                                window.open(
                                  `https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}&travelmode=driving`,
                                  '_blank'
                                );
                              }}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#D71920] text-white text-sm font-medium active:scale-[0.97] transition-transform"
                            >
                              <Navigation className="h-4 w-4" />
                              Directions
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
