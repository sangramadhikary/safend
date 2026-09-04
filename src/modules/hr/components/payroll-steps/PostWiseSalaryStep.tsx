'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabaseClient } from '@/integrations/supabase/client';
import { getWorkOrders } from '@/services/supabase/WorkOrderFirebaseService';
import { ALL_SERVICE_TYPE_KEYS, serviceTypeLabel } from '@/modules/shared/constants/serviceTypes';
import { CONVENTIONAL_BASIS_DAYS } from '@/lib/invoice/rateBasis';
import {
  AlertCircle,
  Briefcase,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Pencil,
  Save,
  Search,
  X,
} from 'lucide-react';

/** Get actual number of days in a given YYYY-MM month string. */
function daysInMonth(monthStr: string): number {
  const [year, month] = monthStr.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

/**
 * The basis used to convert a monthly salary into a per-day rate.
 * 'fixed26' = always divide by 26 (conventional Indian manpower contracts).
 * 'calendar' = divide by the actual number of days in the current calendar month.
 */
export type SalaryRateBasis = 'fixed26' | 'calendar';

export function divisorForBasis(basis: SalaryRateBasis | null | undefined, monthStr: string): number {
  if (basis === 'fixed26') return CONVENTIONAL_BASIS_DAYS;
  return daysInMonth(monthStr);
}

type StoredPostRates = {
  byInstance: Record<string, number>;
  byDesignation: Record<string, number>;
};

type SalaryPost = {
  id: string;
  post_name?: string;
  client_name?: string;
  work_order_id?: string;
  service_instances?: Record<string, unknown>;
  security_services?: Record<string, unknown>;
  configurationSource?: 'work-order' | 'operational-post';
};

type ServiceInstanceRate = {
  /** Stable key saved in post_salary_rates.service_instance_key. */
  rateKey: string;
  /** Human-readable name saved for compatibility with existing reports. */
  designation: string;
  /** Pre-instance name used only when safely reading a legacy rate. */
  legacyDesignation: string;
  /** A legacy post+designation rate is unambiguous only for one active instance. */
  legacyCompatible: boolean;
};

const normaliseName = (value: unknown) => String(value || '').trim().toLocaleLowerCase();

const isStaffedShift = (shift: any) => Boolean(shift?.enabled) && (Number(shift?.quantity) || 0) > 0;

const asInstances = (value: unknown): any[] => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [value];
  return [];
};

/**
 * Creates one salary row per configured Work Order service instance. A service
 * type alone is intentionally not enough: a post can have both 8H and 12H
 * Unarmed Guard instances, each requiring its own pay rate.
 */
function getServiceInstanceRates(post: SalaryPost): ServiceInstanceRate[] {
  const source = post.service_instances && Object.keys(post.service_instances).length > 0
    ? post.service_instances
    : post.security_services;
  if (!source || typeof source !== 'object') return [];

  const sourceMap = source as Record<string, unknown>;
  const knownKeys = ALL_SERVICE_TYPE_KEYS.filter((key) => key in sourceMap);
  const unknownKeys = Object.keys(sourceMap).filter((key) => !ALL_SERVICE_TYPE_KEYS.includes(key));
  const entries: ServiceInstanceRate[] = [];

  [...knownKeys, ...unknownKeys].forEach((serviceTypeKey) => {
    const staffedInstances = asInstances(sourceMap[serviceTypeKey]).filter((instance) =>
      Object.values(instance?.shifts || {}).some(isStaffedShift)
    );

    const roleCounts = new Map<string, number>();
    staffedInstances.forEach((instance) => {
      const role = serviceTypeKey === 'manpower' ? String(instance?.manpowerRole || '').trim() : '';
      const roleKey = role || '__general__';
      roleCounts.set(roleKey, (roleCounts.get(roleKey) || 0) + 1);
    });

    staffedInstances.forEach((instance, index) => {
      const role = serviceTypeKey === 'manpower' ? String(instance?.manpowerRole || '').trim() : '';
      const roleKey = role || '__general__';
      const label = role ? `Manpower - ${role}` : serviceTypeLabel(serviceTypeKey);
      const shiftType = instance?.shiftType === '12H' ? '12-Hour' : '8-Hour';
      const instanceId = String(instance?.id || `${serviceTypeKey}-${index + 1}`);

      entries.push({
        rateKey: `${serviceTypeKey}:${instanceId}`,
        designation: `${label} · ${shiftType}`,
        legacyDesignation: label,
        legacyCompatible: (roleCounts.get(roleKey) || 0) === 1,
      });
    });
  });

  return entries;
}

/** Select the exact post's saved Work Order configuration when it is available. */
function resolveWorkOrderConfiguration(posts: SalaryPost[], workOrders: any[]): SalaryPost[] {
  const workOrdersById = new Map<string, any>();
  workOrders.forEach((workOrder) => {
    [workOrder.id, workOrder.workOrderId].filter(Boolean).forEach((id) => {
      workOrdersById.set(String(id), workOrder);
    });
  });

  return posts.map((post) => {
    const workOrder = post.work_order_id ? workOrdersById.get(String(post.work_order_id)) : undefined;
    if (!workOrder) return { ...post, configurationSource: 'operational-post' };

    const locations = Array.isArray(workOrder.locations) && workOrder.locations.length > 0
      ? workOrder.locations
      : (workOrder.posts || []);
    let postIndex = locations.findIndex((location: any) =>
      normaliseName(location?.name || location?.postName) === normaliseName(post.post_name)
    );
    if (postIndex < 0 && locations.length === 1) postIndex = 0;
    if (postIndex < 0) return { ...post, configurationSource: 'operational-post' };

    const configuredInstances = workOrder.perPostServiceInstances?.[String(postIndex)] || workOrder.serviceInstances;
    if (!configuredInstances || typeof configuredInstances !== 'object' || Object.keys(configuredInstances).length === 0) {
      return { ...post, configurationSource: 'operational-post' };
    }

    return {
      ...post,
      service_instances: configuredInstances,
      configurationSource: 'work-order',
    };
  });
}

export function PostWiseSalaryStep() {
  const [posts, setPosts] = useState<SalaryPost[]>([]);
  const [rates, setRates] = useState<Record<string, StoredPostRates>>({});
  const [postBasis, setPostBasis] = useState<Record<string, SalaryRateBasis>>({});
  const [savingBasis, setSavingBasis] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [draftSalary, setDraftSalary] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const { toast } = useToast();
  const currentMonthStr = new Date().toISOString().slice(0, 7);

  useEffect(() => { void fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [postResult, workOrderResult] = await Promise.all([
        supabaseClient
          .from('operational_posts')
          .select('id, post_name, client_name, work_order_id, service_instances, security_services, status')
          .eq('status', 'active')
          .order('client_name', { ascending: true }),
        getWorkOrders(),
      ]);
      if (postResult.error) throw postResult.error;

      // The new column is additive. Fall back to legacy rows until the migration
      // has been applied, so this screen remains usable during rollout.
      let rateRows: any[] = [];
      const instanceRateResult = await supabaseClient
        .from('post_salary_rates')
        .select('post_id, designation, monthly_salary, service_instance_key');
      if (instanceRateResult.error) {
        const legacyRateResult = await supabaseClient
          .from('post_salary_rates')
          .select('post_id, designation, monthly_salary');
        if (legacyRateResult.error) throw legacyRateResult.error;
        rateRows = legacyRateResult.data || [];
      } else {
        rateRows = instanceRateResult.data || [];
      }

      const ratesMap: Record<string, StoredPostRates> = {};
      rateRows.forEach((rate: any) => {
        if (!ratesMap[rate.post_id]) ratesMap[rate.post_id] = { byInstance: {}, byDesignation: {} };
        const value = Number(rate.monthly_salary) || 0;
        ratesMap[rate.post_id].byDesignation[rate.designation] = value;
        if (rate.service_instance_key) ratesMap[rate.post_id].byInstance[rate.service_instance_key] = value;
      });

      const basisMap: Record<string, SalaryRateBasis> = {};
      try {
        const { data: basisRows } = await supabaseClient
          .from('operational_posts')
          .select('id, salary_rate_basis')
          .eq('status', 'active');
        (basisRows || []).forEach((post: any) => {
          if (post.salary_rate_basis === 'fixed26' || post.salary_rate_basis === 'calendar') {
            basisMap[post.id] = post.salary_rate_basis;
          }
        });
      } catch {
        // Older databases safely use the calendar-month default.
      }

      setPosts(resolveWorkOrderConfiguration(postResult.data || [], workOrderResult.success ? workOrderResult.data : []));
      setRates(ratesMap);
      setPostBasis(basisMap);
    } catch (error) {
      console.error('Error fetching post salary data:', error);
      setPosts([]);
      toast({ title: 'Could not load post salary rates', description: 'Please refresh and try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const getSavedSalary = (postId: string, rate: ServiceInstanceRate): number => {
    const postRates = rates[postId];
    if (!postRates) return 0;
    if (postRates.byInstance[rate.rateKey] !== undefined) return postRates.byInstance[rate.rateKey];
    if (postRates.byDesignation[rate.designation] !== undefined) return postRates.byDesignation[rate.designation];
    // A plain historical service-type rate is usable only when one configured
    // instance exists. Multiple instances must be set independently.
    if (rate.legacyCompatible && postRates.byDesignation[rate.legacyDesignation] !== undefined) {
      return postRates.byDesignation[rate.legacyDesignation];
    }
    return 0;
  };

  const handleBasisChange = async (postId: string, basis: SalaryRateBasis) => {
    setPostBasis((previous) => ({ ...previous, [postId]: basis }));
    setSavingBasis(postId);
    try {
      const { error } = await supabaseClient
        .from('operational_posts')
        .update({ salary_rate_basis: basis })
        .eq('id', postId);
      if (error) throw error;
    } catch {
      setPostBasis((previous) => {
        const next = { ...previous };
        delete next[postId];
        return next;
      });
      toast({ title: 'Basis not saved', description: 'Apply the pending database migration, then try again.', variant: 'destructive' });
    } finally {
      setSavingBasis(null);
    }
  };

  const handleSave = async (postId: string, rate: ServiceInstanceRate) => {
    const parsed = Number(draftSalary);
    if (Number.isNaN(parsed) || parsed < 0) {
      toast({ title: 'Invalid', description: 'Enter a valid salary amount', variant: 'destructive' });
      return;
    }

    const cellKey = `${postId}|${rate.rateKey}`;
    setSavingKey(cellKey);
    try {
      const payload = {
        post_id: postId,
        designation: rate.designation,
        monthly_salary: parsed,
        updated_at: new Date().toISOString(),
      };
      const instanceResult = await supabaseClient
        .from('post_salary_rates')
        .upsert({ ...payload, service_instance_key: rate.rateKey }, { onConflict: 'post_id,service_instance_key' });

      // During deployment, allow salary entry before the additive migration is
      // applied. The readable designation remains distinct for 8H/12H rows.
      if (instanceResult.error) {
        const legacyResult = await supabaseClient
          .from('post_salary_rates')
          .upsert(payload, { onConflict: 'post_id,designation' });
        if (legacyResult.error) throw legacyResult.error;
      }

      setRates((previous) => {
        const existing = previous[postId] || { byInstance: {}, byDesignation: {} };
        return {
          ...previous,
          [postId]: {
            byInstance: { ...existing.byInstance, [rate.rateKey]: parsed },
            byDesignation: { ...existing.byDesignation, [rate.designation]: parsed },
          },
        };
      });
      const divisor = divisorForBasis(postBasis[postId] ?? 'calendar', currentMonthStr);
      toast({
        title: 'Salary Set',
        description: `${rate.designation}: ₹${parsed.toLocaleString('en-IN')}/month → ₹${Math.round(parsed / divisor).toLocaleString('en-IN')}/day (÷${divisor})`,
      });
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed to save rate', variant: 'destructive' });
    } finally {
      setSavingKey(null);
      setEditingCell(null);
      setDraftSalary('');
    }
  };

  const postsWithMissing = posts.filter((post) =>
    getServiceInstanceRates(post).some((rate) => !(getSavedSalary(post.id, rate) > 0))
  );

  const filteredPosts = posts.filter((post) => {
    const term = searchTerm.trim().toLowerCase();
    if (term && !(post.post_name || '').toLowerCase().includes(term) && !(post.client_name || '').toLowerCase().includes(term)) return false;
    return !showMissingOnly || postsWithMissing.some((missingPost) => missingPost.id === post.id);
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Post-wise Salary Rates</CardTitle>
          <CardDescription>
            Define a monthly salary for every configured Work Order service instance. Separate 8-hour and 12-hour instances are shown independently; the linked Work Order configuration takes priority over an older operational-post copy.
          </CardDescription>
        </CardHeader>
      </Card>

      {postsWithMissing.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-200">{postsWithMissing.length} post{postsWithMissing.length > 1 ? 's have' : ' has'} missing salary rates</p>
            <p className="mt-0.5 text-amber-700 dark:text-amber-300">Set a rate for every 8-hour, 12-hour, and repeated service instance before processing payroll.</p>
          </div>
        </div>
      )}

      {!loading && posts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by post or client..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="h-9 pl-9" />
          </div>
          <Button type="button" variant={showMissingOnly ? 'default' : 'outline'} size="sm" className="h-9" onClick={() => setShowMissingOnly((value) => !value)}>
            <AlertCircle className="mr-1.5 h-3.5 w-3.5" />Missing only {postsWithMissing.length > 0 ? `(${postsWithMissing.length})` : ''}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-40 w-full" />)}</div>
      ) : posts.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No active operational posts found. Posts appear here after work orders are started.</CardContent></Card>
      ) : filteredPosts.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No posts match your filters.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {filteredPosts.map((post) => {
            const serviceRates = getServiceInstanceRates(post);
            if (serviceRates.length === 0) return null;
            const basis = postBasis[post.id] ?? 'calendar';
            const days = divisorForBasis(basis, currentMonthStr);
            const hasMissing = serviceRates.some((rate) => !(getSavedSalary(post.id, rate) > 0));
            const isExpanded = expandedPosts.has(post.id);
            const isSavingBasis = savingBasis === post.id;
            const toggleExpand = () => setExpandedPosts((previous) => {
              const next = new Set(previous);
              if (next.has(post.id)) next.delete(post.id); else next.add(post.id);
              return next;
            });

            return (
              <Card key={post.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-3" onClick={toggleExpand}>
                      <div className="shrink-0 rounded-lg bg-safend-red/10 p-2"><Briefcase className="h-4 w-4 text-safend-red" /></div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="truncate text-base">{post.post_name}</CardTitle>
                          <Badge variant="outline" className={`shrink-0 text-[10px] ${hasMissing ? 'border-amber-300 bg-amber-100 text-amber-700' : 'border-green-300 bg-green-50 text-green-700'}`}>
                            {hasMissing ? <AlertCircle className="mr-1 h-3 w-3" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}{hasMissing ? 'Missing rates' : 'All set'}
                          </Badge>
                          <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                            {post.configurationSource === 'work-order' ? 'Work Order configuration' : 'Operational configuration'}
                          </Badge>
                        </div>
                        <CardDescription className="truncate">{post.client_name}</CardDescription>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <div className={`flex items-center rounded-lg border bg-muted/40 p-0.5 ${isSavingBasis ? 'pointer-events-none opacity-60' : ''}`} onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => void handleBasisChange(post.id, 'fixed26')} className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${basis === 'fixed26' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`} title="Divide monthly salary by a fixed 26-day month">
                          <CalendarRange className="h-3.5 w-3.5" />26 days
                        </button>
                        <button type="button" onClick={() => void handleBasisChange(post.id, 'calendar')} className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${basis === 'calendar' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'}`} title="Divide monthly salary by current calendar days">
                          <CalendarDays className="h-3.5 w-3.5" />{daysInMonth(currentMonthStr)} days
                        </button>
                      </div>
                      <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" onClick={toggleExpand}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader><TableRow><TableHead>Work Order service instance</TableHead><TableHead className="text-right">Monthly Salary (₹)</TableHead><TableHead className="text-right">Per Day (₹) — ÷{days}</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {serviceRates.map((rate) => {
                          const cellKey = `${post.id}|${rate.rateKey}`;
                          const salary = getSavedSalary(post.id, rate);
                          const isDefined = salary > 0;
                          const isEditing = editingCell === cellKey;
                          const perDay = isDefined ? Math.round(salary / days) : 0;
                          return (
                            <TableRow key={rate.rateKey} className={!isDefined ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}>
                              <TableCell className="font-medium"><div className="flex items-center gap-2">{rate.designation}{!isDefined && <Badge variant="outline" className="border-amber-300 bg-amber-100 text-[10px] text-amber-700">Not Set</Badge>}</div></TableCell>
                              <TableCell className="text-right">
                                {isEditing ? <Input autoFocus type="number" value={draftSalary} onChange={(event) => setDraftSalary(event.target.value)} className="ml-auto h-8 w-32 text-right" onKeyDown={(event) => { if (event.key === 'Enter') void handleSave(post.id, rate); if (event.key === 'Escape') { setEditingCell(null); setDraftSalary(''); } }} /> : <span className="font-semibold">{isDefined ? `₹${salary.toLocaleString('en-IN')}` : '—'}</span>}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">{perDay > 0 ? `₹${perDay.toLocaleString('en-IN')}` : '—'}</TableCell>
                              <TableCell className="text-right">
                                {isEditing ? <div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => void handleSave(post.id, rate)} disabled={savingKey === cellKey}><Save className="h-4 w-4" /></Button><Button variant="ghost" size="sm" onClick={() => { setEditingCell(null); setDraftSalary(''); }}><X className="h-4 w-4" /></Button></div> : <Button variant="ghost" size="sm" onClick={() => { setEditingCell(cellKey); setDraftSalary(isDefined ? String(salary) : ''); }}><Pencil className="mr-1 h-4 w-4" />{isDefined ? 'Edit' : 'Set Rate'}</Button>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
