'use client';

/**
 * Posts Details Tab
 *
 * Unified view of all active security posts, grouped by client.
 * Lives next to Deployments in the Operations tab bar.
 *
 * Features:
 * - KPI strip: clients, posts, total guards, shift breakdown
 * - Search by post name, client, post code or WO ID
 * - Filter by client
 * - Sort by guards / posts / client name
 * - Collapsible client groups — one card per post with full service detail
 * - Click any post to open the rich PostDetailDialog (rota, attendance, salary,
 *   patrol records, mess records, attendance code)
 */

import { useState, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BrandLoader } from '@/components/ui/brand-loader';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Card, CardContent,
} from '@/components/ui/card';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Building2, MapPin, Users, Search, ChevronDown, ChevronUp,
  Phone, Mail, Shield, Clock, Hash, RefreshCw, ExternalLink,
  Sun, Sunset, Moon, CheckCircle2, XCircle,
} from 'lucide-react';
import {
  subscribeToOperationalPosts,
  type OperationalPost,
} from '@/services/supabase/OperationalPostService';
import { PostDetailDialog } from './PostDetailDialog';
import { PostServiceDisplay } from './PostServiceDisplay';

// ─── Service / shift helpers ──────────────────────────────────────────────────

const SERVICE_LABELS: Record<string, string> = {
  unarmedGuards: 'Unarmed Guards',
  armedGuards: 'Armed Guards',
  supervisors: 'Supervisors',
  patrolOfficers: 'Patrol Officers',
  pso: 'PSO',
  bouncers: 'Bouncers',
  manpower: 'Manpower',
  eventSecurity: 'Event Security',
  personalSecurity: 'Personal Security',
};

function serviceGuardCount(si: any): { day: number; afternoon: number; night: number; total: number } {
  let day = 0, afternoon = 0, night = 0;
  if (!si) return { day, afternoon, night, total: 0 };
  Object.values(si).forEach((arr: any) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((inst: any) => {
      const s = inst?.shifts || {};
      if (s.day?.enabled) day += Number(s.day.quantity) || 0;
      if (s.afternoon?.enabled) afternoon += Number(s.afternoon.quantity) || 0;
      if (s.night?.enabled) night += Number(s.night.quantity) || 0;
    });
  });
  return { day, afternoon, night, total: day + afternoon + night };
}

function activeServiceTypes(si: any): string[] {
  if (!si) return [];
  return Object.entries(si)
    .filter(([, arr]: [string, any]) => Array.isArray(arr) && arr.some((inst: any) =>
      Object.values(inst?.shifts || {}).some((s: any) => s?.enabled && (s?.quantity || 0) > 0)
    ))
    .map(([key]) => SERVICE_LABELS[key] || key);
}

// ─── Client group aggregator ──────────────────────────────────────────────────

interface PostGroup {
  clientName: string;
  posts: OperationalPost[];
  totalGuards: number;
  day: number;
  afternoon: number;
  night: number;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
}

function groupByClient(posts: OperationalPost[]): PostGroup[] {
  const map = new Map<string, PostGroup>();
  for (const p of posts) {
    const key = p.clientName || 'Unknown Client';
    let g = map.get(key);
    if (!g) {
      g = {
        clientName: key,
        posts: [],
        totalGuards: 0, day: 0, afternoon: 0, night: 0,
        contactPerson: p.contactPerson,
        contactPhone: p.contactPhone,
        contactEmail: p.contactEmail,
      };
      map.set(key, g);
    }
    g.posts.push(p);
    const counts = serviceGuardCount(p.serviceInstances);
    g.totalGuards += counts.total || p.totalGuards || 0;
    g.day += counts.day;
    g.afternoon += counts.afternoon;
    g.night += counts.night;
  }
  return Array.from(map.values());
}

// ─── Post tile ────────────────────────────────────────────────────────────────

function PostTile({ post, onOpen }: { post: OperationalPost; onOpen: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const counts = serviceGuardCount(post.serviceInstances);
  const services = activeServiceTypes(post.serviceInstances);
  const addr = [
    post.location?.address,
    post.location?.city,
    post.location?.state,
    post.location?.pincode,
  ].filter(Boolean).join(', ');

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Tile header */}
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold truncate">{post.postName}</p>
            {post.postCode && (
              <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 shrink-0">
                {post.postCode}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={`text-[10px] shrink-0 ${post.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'text-muted-foreground'}`}
            >
              {post.status === 'active' ? <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> : <XCircle className="h-2.5 w-2.5 mr-1" />}
              {post.status}
            </Badge>
          </div>

          {addr && (
            <p className="text-xs text-muted-foreground mt-1 truncate">{addr}</p>
          )}

          {/* Shift bar */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />{post.shiftType || '8H'}
            </span>
            {counts.day > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <Sun className="h-3 w-3" />{counts.day}
              </span>
            )}
            {counts.afternoon > 0 && (
              <span className="flex items-center gap-1 text-orange-500">
                <Sunset className="h-3 w-3" />{counts.afternoon}
              </span>
            )}
            {counts.night > 0 && (
              <span className="flex items-center gap-1 text-indigo-500">
                <Moon className="h-3 w-3" />{counts.night}
              </span>
            )}
            <span className="flex items-center gap-1 text-muted-foreground font-medium">
              <Users className="h-3 w-3" />{counts.total || post.totalGuards || 0} guards
            </span>
          </div>

          {/* Service chips */}
          {services.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {services.map(s => (
                <span key={s} className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-2 py-0.5 text-[10px] font-medium">
                  <Shield className="h-2.5 w-2.5" />{s}
                </span>
              ))}
            </div>
          )}

          {post.workOrderId && (
            <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
              WO: {post.workOrderId}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={onOpen}
          >
            <ExternalLink className="h-3 w-3 mr-1" />Details
          </Button>
          {post.serviceInstances && (
            <button
              type="button"
              className="text-[10px] text-safend-red hover:underline flex items-center gap-0.5"
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? 'Hide' : 'Services'}
            </button>
          )}
        </div>
      </div>

      {/* Expandable service table */}
      {expanded && post.serviceInstances && (
        <div className="border-t px-4 pb-4 pt-3 bg-muted/20">
          <PostServiceDisplay post={post} />
        </div>
      )}
    </div>
  );
}

// ─── Client group card ────────────────────────────────────────────────────────

function ClientGroup({ group }: { group: PostGroup }) {
  const [open, setOpen] = useState(false);
  const [detailPostId, setDetailPostId] = useState<string | null>(null);

  return (
    <>
      <Card className="overflow-hidden">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="w-full text-left">
            <div className="flex items-center justify-between p-5 hover:bg-secondary/30 transition-colors">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-full bg-safend-red/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-5 w-5 text-safend-red" />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="font-bold text-base truncate">{group.clientName}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />{group.posts.length} post{group.posts.length !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />{group.totalGuards} guards
                    </span>
                    {group.day > 0 && (
                      <span className="flex items-center gap-1 text-amber-600"><Sun className="h-3 w-3" />{group.day} day</span>
                    )}
                    {group.afternoon > 0 && (
                      <span className="flex items-center gap-1 text-orange-500"><Sunset className="h-3 w-3" />{group.afternoon} eve</span>
                    )}
                    {group.night > 0 && (
                      <span className="flex items-center gap-1 text-indigo-500"><Moon className="h-3 w-3" />{group.night} night</span>
                    )}
                    {group.contactPhone && (
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{group.contactPhone}</span>
                    )}
                    {group.contactEmail && (
                      <span className="flex items-center gap-1 hidden lg:flex truncate max-w-[200px]"><Mail className="h-3 w-3" />{group.contactEmail}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <Badge className="bg-safend-red text-white text-xs">{group.posts.length}</Badge>
                {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="border-t p-5 bg-secondary/10">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {group.posts.map(post => (
                  <PostTile
                    key={post.id || post.postName}
                    post={post}
                    onOpen={() => setDetailPostId(post.id || null)}
                  />
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <PostDetailDialog postId={detailPostId} onClose={() => setDetailPostId(null)} />
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PostsDetails() {
  const [posts, setPosts] = useState<OperationalPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'guards' | 'posts' | 'name'>('guards');

  useEffect(() => {
    const unsub = subscribeToOperationalPosts(incoming => {
      const active = incoming.filter(p =>
        p.workOrderStatus === 'In Progress' ||
        p.workOrderStatus === 'Completed' ||
        p.workOrderStatus === 'in_progress' ||
        p.workOrderStatus === 'completed' ||
        p.status === 'active'
      );
      setPosts(active);
      setLoading(false);
    });
    return unsub;
  }, []);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filteredPosts = posts.filter(p => {
      if (clientFilter !== 'all' && p.clientName !== clientFilter) return false;
      if (q) {
        return [p.postName, p.clientName, p.postCode, p.workOrderId]
          .filter(Boolean)
          .some(v => String(v).toLowerCase().includes(q));
      }
      return true;
    });

    const gs = groupByClient(filteredPosts);
    if (sortBy === 'guards') return gs.sort((a, b) => b.totalGuards - a.totalGuards);
    if (sortBy === 'posts') return gs.sort((a, b) => b.posts.length - a.posts.length);
    return gs.sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [posts, search, clientFilter, sortBy]);

  const uniqueClients = useMemo(() =>
    Array.from(new Set(posts.map(p => p.clientName || 'Unknown Client'))).sort(),
    [posts]
  );

  // KPI totals (unfiltered for context)
  const totalPosts = posts.length;
  const totalGuards = posts.reduce((s, p) => {
    const c = serviceGuardCount(p.serviceInstances);
    return s + (c.total || p.totalGuards || 0);
  }, 0);
  const totalDay = posts.reduce((s, p) => s + serviceGuardCount(p.serviceInstances).day, 0);
  const totalNight = posts.reduce((s, p) => s + serviceGuardCount(p.serviceInstances).night, 0);
  const totalClients = new Set(posts.map(p => p.clientName)).size;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <BrandLoader size="md" message="Loading posts..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Clients', value: totalClients, icon: Building2, accent: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
          { label: 'Active Posts', value: totalPosts, icon: MapPin, accent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
          { label: 'Total Guards', value: totalGuards, icon: Users, accent: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
          { label: 'Day / Night', value: `${totalDay} / ${totalNight}`, icon: Sun, accent: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
        ].map(({ label, value, icon: Icon, accent }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`p-2 rounded-lg ${accent}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by post name, client, post code or WO ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-52">
            <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="All Clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {uniqueClients.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={v => setSortBy(v as 'guards' | 'posts' | 'name')}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="guards">Most Guards</SelectItem>
            <SelectItem value="posts">Most Posts</SelectItem>
            <SelectItem value="name">Client Name A–Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Groups */}
      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-16 text-center">
          <Shield className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground">
            {search || clientFilter !== 'all'
              ? 'No posts match your search.'
              : 'No active posts. Work orders with status In Progress or Completed will appear here.'}
          </p>
          {(search || clientFilter !== 'all') && (
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => { setSearch(''); setClientFilter('all'); }}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(g => <ClientGroup key={g.clientName} group={g} />)}
        </div>
      )}
    </div>
  );
}
