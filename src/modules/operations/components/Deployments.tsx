'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Deployments — decide who stands where, before the day happens
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Deployment is the upstream half of the pair: attendance can only record what
 * was deployed (enforced in `RotaAttendanceService.assertDeployed`), so a gap here
 * becomes an unmarkable slot there. That makes gap *visibility* the primary job of
 * this screen, and filling gaps quickly its primary verb.
 *
 * The rewrite addresses problems in three categories.
 *
 * CORRECTNESS
 *
 *   - Saving deleted people. The working copy was built by looking each rostered
 *     employee up in the loaded `employees` array and skipping anyone not found.
 *     Save then wrote the working copy as the complete roster, so a guard whose
 *     record was deactivated, filtered out by branch scope, or simply not loaded
 *     yet was silently removed from the roster on the next save. Unknown employees
 *     are now reconstructed from the roster row itself and round-trip intact.
 *
 *   - Save rewrote every post. It looped over every post with any assignment for
 *     the date and called `saveRotaAssignments` on each — a read, an upsert, a
 *     delete and an audit entry per post, several hundred times, to persist one
 *     edit. Only genuinely modified posts are saved now.
 *
 *   - Editing was lost on date change. Loading a date overwrote the working copy
 *     for that date, so any unsaved edit vanished when the operator looked at
 *     another day and came back. Loads now merge around modified posts.
 *
 *   - Over-assignment hid gaps. Coverage summed raw assigned counts, so three
 *     guards on a two-person requirement cancelled out a gap elsewhere in the
 *     post and it reported as fully staffed.
 *
 *   - The calendar contradicted the day strip. The strip offered the next seven
 *     days while the calendar refused every date after today, so planning beyond
 *     a week was impossible even though `maxDate` was computed for it. Deployment
 *     is forward-looking; the range now reflects that.
 *
 * SPEED AT SCALE
 *
 *   Three bulk verbs — copy a previous day, auto-fill gaps, repeat forward — plus
 *   a windowed post list. Building several hundred rosters a slot at a time was
 *   the real cost of this screen, and rosters repeat almost entirely day to day.
 *
 * HONESTY
 *
 *   Nothing is hidden to keep a list tidy. Double bookings, unrecognised
 *   designations and missing salary configuration are shown and ranked rather than
 *   filtered out — the previous picker silently excluded anyone without a pay rate,
 *   which is how a fully staffed system could offer an empty list.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { BrandLoader } from '@/components/ui/brand-loader';
import { Calendar } from '@/components/ui/calendar';
import { VirtualList } from '@/components/ui/virtual-list';
import { AnimatedActionButton } from '@/components/ui/animated-action-button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  MapPin, Building2, Calendar as CalendarIcon, Sun, Sunset, Moon,
  ChevronDown, ChevronLeft, ChevronRight, Check, UserPlus, X, AlertCircle,
  AlertTriangle, Search, Shield, Info, IndianRupee, Copy as CopyIcon,
  Wand2, Trash2, Keyboard, CalendarPlus, Users, TriangleAlert, CircleSlash,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { subscribeToOperationalPosts, type OperationalPost } from '@/services/supabase/OperationalPostService';
import { subscribeToHREmployees, type HREmployee } from '@/services/supabase/HREmployeeService';
import { supabaseClient } from '@/integrations/supabase/client';
import { applyBranchScope, onBranchScopeChange } from '@/utils/branchScope';
import {
  saveRotaAssignments, getRotaAssignmentsForDate, getRotaAssignmentsForDateRange,
  getDatesWithAttendance, type RotaAssignment,
} from '@/services/supabase/RotaAttendanceService';
import { addDays, format, startOfDay, isSameDay, subDays, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  SHIFTS,
  SERVICE_TYPES_ORDERED,
  getRequiredCount,
  getRequiredCountAnyDay,
  computePostStaffing,
  buildShiftConflictIndex,
  buildCandidates,
  isActiveEmployee,
  calcAge,
  genderSymbol,
  groupKey,
  type Candidate,
  type PostStaffingStats,
} from './rota/rotaShared';
import { EmployeePickerPopover, EmployeeAvatar, type RecentWorkMap } from './rota/EmployeePicker';
import { EmployeeDetailDialog } from './rota/EmployeeDetailDialog';
import { PostInfoDialog, type PostSalaryRate } from './rota/PostInfoDialog';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SHIFT_ICONS = { sun: Sun, sunset: Sunset, moon: Moon } as const;

/**
 * How far the date picker reaches.
 *
 * Backwards to correct a roster that was never entered; forwards because planning
 * ahead is the entire point of a deployment screen. The old calendar blocked every
 * future date while the day strip advertised them.
 */
const PAST_WINDOW_DAYS = 60;
const FUTURE_WINDOW_DAYS = 60;

/** Day-strip length. One week is what an operator reasons about at a time. */
const STRIP_DAYS = 7;

type FilterMode = 'all' | 'gaps' | 'unstaffed' | 'no-salary';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AssignedEmployee {
  employeeId: string;
  employee: HREmployee;
  /**
   * The employee record could not be found, so this was reconstructed from the
   * roster row. Kept rather than dropped so saving cannot delete them.
   */
  unresolved?: boolean;
}

/** postId → shiftKey → serviceTypeKey → assigned */
type PostAssignments = Record<string, Record<string, Record<string, AssignedEmployee[]>>>;

/** dateKey → {@link PostAssignments} */
type DailyAssignments = Record<string, PostAssignments>;

interface ClientGroup {
  clientName: string;
  posts: OperationalPost[];
  totalRequired: number;
  totalAssigned: number;
}

type SidebarRow =
  | { kind: 'client'; key: string; group: ClientGroup }
  | { kind: 'post'; key: string; post: OperationalPost; staffing: PostStaffingStats };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rebuild a roster row into a minimal employee record.
 *
 * The row carries the name and code that were captured when the assignment was
 * made, which is enough to render the chip and to write the row back unchanged.
 * Without this the guard vanishes from the editor and the next save deletes them.
 */
function unresolvedEmployee(a: RotaAssignment): HREmployee {
  return {
    id: a.employeeId,
    employeeId: a.employeeCode || '',
    name: a.employeeName || 'Unknown employee',
    email: '', phone: '', gender: 'male',
    department: '', designation: '', joinDate: '',
    employmentType: 'Full-Time', status: 'Active',
  } as HREmployee;
}

/** Convert flat roster rows into the nested working copy, de-duplicated. */
function nestRota(rows: RotaAssignment[], employeeById: Map<string, HREmployee>): PostAssignments {
  const nested: PostAssignments = {};
  const seen = new Set<string>();
  for (const a of rows) {
    if (!a.employeeId) continue;
    const dedupe = `${a.postId}|${a.shiftKey}|${a.serviceTypeKey}|${a.employeeId}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const byShift = nested[a.postId] || (nested[a.postId] = {});
    const byService = byShift[a.shiftKey] || (byShift[a.shiftKey] = {});
    const list = byService[a.serviceTypeKey] || (byService[a.serviceTypeKey] = []);

    const known = employeeById.get(a.employeeId);
    list.push(known
      ? { employeeId: a.employeeId, employee: known }
      : { employeeId: a.employeeId, employee: unresolvedEmployee(a), unresolved: true });
  }
  return nested;
}

/** Flatten one post's working copy into roster rows ready to persist. */
function flattenPost(postAssignments: Record<string, Record<string, AssignedEmployee[]>>, post: OperationalPost, dateKey: string): RotaAssignment[] {
  const rows: RotaAssignment[] = [];
  const seen = new Set<string>();
  for (const [shiftKey, byService] of Object.entries(postAssignments || {})) {
    for (const [serviceTypeKey, list] of Object.entries(byService || {})) {
      for (const a of list) {
        const k = `${shiftKey}|${serviceTypeKey}|${a.employeeId}`;
        if (seen.has(k)) continue;
        seen.add(k);
        rows.push({
          rotaDate: dateKey,
          postId: post.id || '',
          postName: post.postName,
          clientName: post.clientName,
          shiftKey,
          serviceTypeKey,
          employeeId: a.employeeId,
          employeeName: a.employee.name,
          employeeCode: a.employee.employeeId,
        });
      }
    }
  }
  return rows;
}

const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export interface DeploymentsProps {
  /**
   * Date to open on, as `yyyy-MM-dd`.
   *
   * Set when Attendance hands off an undeployed post. Without it the operator
   * would land on today and have to find the date they were actually marking.
   */
  presetDate?: string | null;
}

export function Deployments({ presetDate }: DeploymentsProps = {}) {
  const initialDate = useMemo(
    () => (presetDate ? startOfDay(new Date(`${presetDate}T00:00:00`)) : startOfDay(new Date())),
    // Only the mount-time value seeds state; later changes are handled by an effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [posts, setPosts] = useState<OperationalPost[]>([]);
  const [employees, setEmployees] = useState<HREmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDayLoading, setIsDayLoading] = useState(false);

  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
  const [stripStart, setStripStart] = useState<Date>(initialDate);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [collapsedShifts, setCollapsedShifts] = useState<Set<string>>(new Set());
  const [collapsedClients, setCollapsedClients] = useState<Set<string>>(new Set());

  const [assignments, setAssignments] = useState<DailyAssignments>({});
  /** dateKey → postIds edited but not yet saved. The unit of saving. */
  const [dirty, setDirty] = useState<Record<string, string[]>>({});
  const [savedRota, setSavedRota] = useState<RotaAssignment[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  const [postSalaryRates, setPostSalaryRates] = useState<PostSalaryRate[]>([]);
  const [salaryRatesLoaded, setSalaryRatesLoaded] = useState(false);
  const [recentWork, setRecentWork] = useState<RecentWorkMap>({});
  const [missedDates, setMissedDates] = useState<string[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const [employeeDetail, setEmployeeDetail] = useState<HREmployee | null>(null);
  const [infoPostId, setInfoPostId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [conflictConfirm, setConflictConfirm] = useState<{
    employee: HREmployee; postId: string; shiftKey: string; serviceTypeKey: string; conflictPostName: string;
  } | null>(null);
  const [confirmClear, setConfirmClear] = useState<OperationalPost | null>(null);
  const [repeatForward, setRepeatForward] = useState<{ days: number } | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const dateKey = format(selectedDate, 'yyyy-MM-dd');
  const today = useMemo(() => startOfDay(new Date()), []);
  const minDate = useMemo(() => subDays(today, PAST_WINDOW_DAYS), [today]);
  const maxDate = useMemo(() => addDays(today, FUTURE_WINDOW_DAYS), [today]);

  // Follow later hand-offs from Attendance, not just the mount-time value.
  useEffect(() => {
    if (!presetDate) return;
    const target = startOfDay(new Date(`${presetDate}T00:00:00`));
    if (Number.isNaN(target.getTime())) return;
    setSelectedDate(target);
    setStripStart(subDays(target, 1));
  }, [presetDate]);

  /** Read dirty state without making every callback depend on it. */
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const employeeById = useMemo(() => {
    const map = new Map<string, HREmployee>();
    for (const e of employees) if (e.id) map.set(e.id, e);
    return map;
  }, [employees]);

  /**
   * The employee map, readable without becoming a dependency.
   *
   * `subscribeToHREmployees` is a realtime feed, so a new array arrives on every
   * HR edit anywhere in the business. Depending on it directly would make
   * `loadDate` a new function each time and refetch the roster on every one.
   */
  const employeeByIdRef = useRef(employeeById);
  useEffect(() => { employeeByIdRef.current = employeeById; }, [employeeById]);

  // ─── Data ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const unsub = subscribeToOperationalPosts((all) => {
      const active = all.filter((p) =>
        p.workOrderStatus === 'In Progress' || p.workOrderStatus === 'Completed' ||
        p.workOrderStatus === 'in_progress' || p.workOrderStatus === 'completed' ||
        p.status === 'active'
      );
      setPosts(active);
      setIsLoading(false);
      // Read through the updater rather than the closure: with `[]` deps the
      // captured `selectedPostId` is permanently null, so every realtime update
      // used to yank the operator back to the first post mid-edit.
      setSelectedPostId((current) =>
        current && active.some((p) => p.id === current) ? current : active[0]?.id || null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeToHREmployees(setEmployees);
    return () => unsub();
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabaseClient.from('post_salary_rates').select('post_id, designation, monthly_salary');
      setPostSalaryRates(data || []);
      setSalaryRatesLoaded(true);
    })();
  }, []);

  /** Recent duty history for the picker. Branch-scoped like every other read. */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let query = supabaseClient
        .from('rota_assignments')
        .select('employee_id, post_name, rota_date')
        .gte('rota_date', format(subDays(new Date(), 30), 'yyyy-MM-dd'))
        .order('rota_date', { ascending: false });
      query = applyBranchScope(query);
      const { data } = await query;
      if (cancelled) return;
      const map: RecentWorkMap = {};
      for (const r of (data || []) as any[]) {
        if (!r.employee_id) continue;
        const list = map[r.employee_id] || (map[r.employee_id] = []);
        if (list.length < 5 && !list.some((e) => e.postName === r.post_name && e.date === r.rota_date)) {
          list.push({ postName: r.post_name || '', date: r.rota_date });
        }
      }
      setRecentWork(map);
    };
    load();
    const off = onBranchScopeChange(load);
    return () => { cancelled = true; off(); };
  }, []);

  /**
   * Load the selected date's roster, preserving unsaved edits.
   *
   * Posts the operator has modified keep their working copy; everything else is
   * replaced with what the database holds. Previously the whole date was
   * overwritten, so glancing at another day and coming back discarded the edit.
   */
  const loadDate = useCallback(async (key: string) => {
    const result = await getRotaAssignmentsForDate(key);
    if (!result.success) return false;
    setSavedRota(result.data);
    const fresh = nestRota(result.data, employeeByIdRef.current);
    setAssignments((prev) => {
      const keep = new Set(dirtyRef.current[key] || []);
      const merged: PostAssignments = fresh;
      const existing = prev[key];
      if (existing) for (const postId of keep) if (existing[postId]) merged[postId] = existing[postId];
      return { ...prev, [key]: merged };
    });
    return true;
  }, []);

  /**
   * Re-resolve the roster once the employee list arrives.
   *
   * Rows load before employees do, so on a cold start every chip would render as
   * "record n/a". Keyed on the count rather than the array so ordinary HR edits do
   * not trigger a refetch.
   */
  const employeeIdsKey = employees.length;
  useEffect(() => {
    let cancelled = false;
    setIsDayLoading(true);
    (async () => {
      await loadDate(dateKey);
      if (!cancelled) setIsDayLoading(false);
    })();
    const off = onBranchScopeChange(() => { void loadDate(dateKey); });
    return () => { cancelled = true; off(); };
  }, [dateKey, employeeIdsKey, loadDate]);

  /** Days that have a roster but no attendance — the reason to backfill. */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const from = format(subDays(today, 14), 'yyyy-MM-dd');
      const to = format(subDays(today, 1), 'yyyy-MM-dd');
      let query = supabaseClient
        .from('rota_assignments')
        .select('rota_date')
        .gte('rota_date', from)
        .lte('rota_date', to);
      query = applyBranchScope(query);
      const { data } = await query;
      const rostered = Array.from(new Set(((data || []) as any[]).map((r) => r.rota_date)));
      const attended = new Set((await getDatesWithAttendance(from, to)).dates);
      if (!cancelled) setMissedDates(rostered.filter((d) => !attended.has(d)).sort());
    };
    load();
    const off = onBranchScopeChange(load);
    return () => { cancelled = true; off(); };
  }, [today]);

  // ─── Dirty tracking ────────────────────────────────────────────────────────

  const markDirty = useCallback((key: string, postId: string) => {
    setDirty((prev) => {
      const list = prev[key] || [];
      if (list.includes(postId)) return prev;
      return { ...prev, [key]: [...list, postId] };
    });
  }, []);

  const dirtyPostCount = useMemo(
    () => Object.values(dirty).reduce((n, list) => n + list.length, 0),
    [dirty]
  );
  const dirtyDates = useMemo(() => Object.keys(dirty).filter((k) => (dirty[k] || []).length > 0), [dirty]);
  const hasUnsavedChanges = dirtyPostCount > 0;

  /**
   * Unsaved deployment edits are not recoverable, and this screen is reached
   * through a tab rather than a route, so there is no navigation guard to lean on.
   */
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  // ─── Assignment reads ──────────────────────────────────────────────────────

  const getAssigned = useCallback((postId: string, shiftKey: string, serviceTypeKey: string): AssignedEmployee[] =>
    assignments[dateKey]?.[postId]?.[shiftKey]?.[serviceTypeKey] || [],
  [assignments, dateKey]);

  const staffingByPost = useMemo(() => {
    const map = new Map<string, PostStaffingStats>();
    const day = assignments[dateKey] || {};
    for (const post of posts) {
      const id = post.id || '';
      map.set(id, computePostStaffing(post, selectedDate, (pid, sk, stk) =>
        (day[pid]?.[sk]?.[stk] || []).length));
    }
    return map;
  }, [posts, assignments, dateKey, selectedDate]);

  const coverage = useMemo(() => {
    let required = 0, assigned = 0, postsWithGaps = 0, unstaffed = 0, relevant = 0;
    for (const post of posts) {
      const s = staffingByPost.get(post.id || '');
      if (!s || s.totalRequired === 0) continue;
      relevant++;
      required += s.totalRequired;
      assigned += s.totalAssigned;
      if (!s.isFullyStaffed) postsWithGaps++;
      if (s.totalAssigned === 0) unstaffed++;
    }
    return { required, assigned, gap: required - assigned, postsWithGaps, unstaffed, relevant };
  }, [posts, staffingByPost]);

  // ─── Conflicts and candidates ──────────────────────────────────────────────

  /**
   * Everyone already committed on a shift, from both the working copy and the
   * persisted roster. A double booking created minutes ago in this session is as
   * impossible as one already in the database.
   */
  const conflictsByShift = useMemo(() => {
    const perShift = new Map<string, Map<string, { postName: string; shiftKey: string }>>();
    const day = assignments[dateKey] || {};
    const postNameById = new Map(posts.map((p) => [p.id || '', p.postName]));

    for (const { key: shiftKey } of SHIFTS) {
      const map = new Map<string, { postName: string; shiftKey: string }>();
      for (const [postId, byShift] of Object.entries(day)) {
        const byService = byShift[shiftKey];
        if (!byService) continue;
        const postName = postNameById.get(postId) || 'another post';
        for (const list of Object.values(byService)) {
          for (const a of list) if (a.employeeId && !map.has(a.employeeId)) map.set(a.employeeId, { postName, shiftKey });
        }
      }
      // Persisted rosters for posts the working copy has not touched.
      for (const [id, info] of buildShiftConflictIndex(savedRota, shiftKey)) {
        if (!map.has(id)) map.set(id, info);
      }
      perShift.set(shiftKey, map);
    }
    return perShift;
  }, [assignments, dateKey, posts, savedRota]);

  /** Conflicts excluding the post being edited, since assigning there is the goal. */
  const conflictsFor = useCallback((postId: string, shiftKey: string) => {
    const all = new Map(conflictsByShift.get(shiftKey) || []);
    for (const st of SERVICE_TYPES_ORDERED) {
      for (const a of getAssigned(postId, shiftKey, st.key)) all.delete(a.employeeId);
    }
    return all;
  }, [conflictsByShift, getAssigned]);

  /**
   * Staff with no pay rate from any source.
   *
   * Shown, never filtered. The old picker excluded them outright, which is how a
   * fully staffed system could present an empty list and why the "no salary"
   * banner counted 130 people who were quietly undeployable.
   */
  const missingSalaryIds = useMemo(() => {
    const rated = new Set(postSalaryRates.filter((r) => r.monthly_salary > 0).map((r) => r.designation));
    const ids = new Set<string>();
    for (const e of employees) {
      if (!isActiveEmployee(e)) continue;
      if ((e.monthlySalary || 0) > 0) continue;
      if (e.designation && rated.has(e.designation)) continue;
      if (e.id) ids.add(e.id);
    }
    return ids;
  }, [employees, postSalaryRates]);

  /** Staff actually deployed today who cannot be priced — the actionable subset. */
  const deployedWithoutSalary = useMemo(() => {
    const day = assignments[dateKey] || {};
    const ids = new Set<string>();
    for (const byShift of Object.values(day)) {
      for (const byService of Object.values(byShift)) {
        for (const list of Object.values(byService)) {
          for (const a of list) if (missingSalaryIds.has(a.employeeId)) ids.add(a.employeeId);
        }
      }
    }
    return ids;
  }, [assignments, dateKey, missingSalaryIds]);

  const getCandidates = useCallback((postId: string, shiftKey: string, serviceTypeKey: string): Candidate[] =>
    buildCandidates({
      employees,
      serviceTypeKey,
      excludeIds: getAssigned(postId, shiftKey, serviceTypeKey).map((a) => a.employeeId),
      conflicts: conflictsFor(postId, shiftKey),
      missingSalaryIds,
    }),
  [employees, getAssigned, conflictsFor, missingSalaryIds]);

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const applyAssignment = useCallback((postId: string, shiftKey: string, serviceTypeKey: string, employeeId: string) => {
    const employee = employeeById.get(employeeId);
    if (!employee) return;
    const post = posts.find((p) => p.id === postId);
    const required = getRequiredCount(post, shiftKey, serviceTypeKey, selectedDate);

    setAssignments((prev) => {
      const next = deepClone(prev);
      const day = next[dateKey] || (next[dateKey] = {});
      const byShift = day[postId] || (day[postId] = {});
      const byService = byShift[shiftKey] || (byShift[shiftKey] = {});
      const list = byService[serviceTypeKey] || [];
      if (list.some((a) => a.employeeId === employeeId)) return prev;
      if (list.length >= required) return prev;
      byService[serviceTypeKey] = [...list, { employeeId, employee }];
      return next;
    });
    markDirty(dateKey, postId);
  }, [employeeById, posts, selectedDate, dateKey, markDirty]);

  /** Assign, stopping first if it would put one guard at two posts at once. */
  const assignEmployee = useCallback((postId: string, shiftKey: string, serviceTypeKey: string, employeeId: string) => {
    const employee = employeeById.get(employeeId);
    if (!employee) return;

    const existing = getAssigned(postId, shiftKey, serviceTypeKey);
    if (existing.some((a) => a.employeeId === employeeId)) {
      toast({ title: 'Already assigned', description: `${employee.name} is already on this slot group.`, variant: 'destructive' });
      return;
    }
    const post = posts.find((p) => p.id === postId);
    if (existing.length >= getRequiredCount(post, shiftKey, serviceTypeKey, selectedDate)) {
      toast({ title: 'Slot group full', description: 'Remove someone before adding another.', variant: 'destructive' });
      return;
    }

    const conflict = conflictsFor(postId, shiftKey).get(employeeId);
    if (conflict) {
      setConflictConfirm({ employee, postId, shiftKey, serviceTypeKey, conflictPostName: conflict.postName });
      return;
    }
    applyAssignment(postId, shiftKey, serviceTypeKey, employeeId);
  }, [employeeById, getAssigned, posts, selectedDate, conflictsFor, applyAssignment, toast]);

  const unassignEmployee = useCallback((postId: string, shiftKey: string, serviceTypeKey: string, employeeId: string) => {
    setAssignments((prev) => {
      const list = prev[dateKey]?.[postId]?.[shiftKey]?.[serviceTypeKey];
      if (!list) return prev;
      const next = deepClone(prev);
      next[dateKey][postId][shiftKey][serviceTypeKey] = list.filter((a) => a.employeeId !== employeeId);
      return next;
    });
    markDirty(dateKey, postId);
  }, [dateKey, markDirty]);

  const clearPost = useCallback((post: OperationalPost) => {
    const postId = post.id || '';
    setAssignments((prev) => {
      const next = deepClone(prev);
      if (next[dateKey]) next[dateKey][postId] = {};
      return next;
    });
    markDirty(dateKey, postId);
    toast({ title: 'Roster cleared', description: `${post.postName} has no staff for ${format(selectedDate, 'dd MMM')}. Save to apply.` });
  }, [dateKey, selectedDate, markDirty, toast]);

  // ─── Save ──────────────────────────────────────────────────────────────────

  /**
   * Persist only the posts that were actually edited.
   *
   * `saveRotaAssignments` replaces one post-day and writes an audit entry, so the
   * previous "save every post that has any assignment" loop cost hundreds of
   * round trips and buried the one real change in hundreds of no-op audit rows.
   */
  const handleSave = useCallback(async () => {
    const work = Object.entries(dirtyRef.current).flatMap(([key, postIds]) => postIds.map((postId) => ({ key, postId })));
    if (work.length === 0) return;

    setIsSaving(true);
    const failures: string[] = [];
    const savedByDate: Record<string, string[]> = {};

    for (const { key, postId } of work) {
      const post = posts.find((p) => p.id === postId);
      if (!post) continue;
      const rows = flattenPost(assignments[key]?.[postId] || {}, post, key);
      const result = await saveRotaAssignments(key, postId, rows);
      if (result.success) (savedByDate[key] || (savedByDate[key] = [])).push(postId);
      else failures.push(`${post.postName}: ${result.error || 'unknown error'}`);
    }

    setIsSaving(false);

    // Clear only what actually persisted, so a partial failure leaves the failed
    // posts marked and retryable instead of silently dropping their edits.
    setDirty((prev) => {
      const next: Record<string, string[]> = {};
      for (const [key, list] of Object.entries(prev)) {
        const done = new Set(savedByDate[key] || []);
        const remaining = list.filter((id) => !done.has(id));
        if (remaining.length > 0) next[key] = remaining;
      }
      return next;
    });

    if (failures.length > 0) {
      toast({
        title: `${failures.length} post${failures.length > 1 ? 's' : ''} failed to save`,
        description: failures.slice(0, 3).join(' · '),
        variant: 'destructive',
      });
      throw new Error('save-failed');
    }

    void loadDate(dateKey);
  }, [posts, assignments, dateKey, loadDate, toast]);

  // ─── Bulk verbs ────────────────────────────────────────────────────────────

  /** Post ids currently visible, so bulk actions match what the operator sees. */
  const visiblePostIdsRef = useRef<string[]>([]);

  /**
   * Copy a previous day's roster into empty slot groups.
   *
   * Fills only genuinely empty groups, re-checks each group against the target
   * date's own requirement so a post with different service days does not inherit
   * staff it does not need, skips anyone now inactive, and refuses to create a
   * double booking.
   */
  const copyFromDay = useCallback(async (source: Date, targetPostIds: string[]) => {
    const sourceKey = format(source, 'yyyy-MM-dd');
    setBusyLabel('Copying');

    const result = await getRotaAssignmentsForDate(sourceKey);
    if (!result.success) {
      setBusyLabel(null);
      toast({ title: 'Could not load', description: result.error || `No roster for ${format(source, 'dd MMM')}.`, variant: 'destructive' });
      return;
    }

    const wanted = new Set(targetPostIds.filter(Boolean));
    const grouped = new Map<string, RotaAssignment[]>();
    for (const a of result.data) {
      if (!wanted.has(a.postId)) continue;
      const k = groupKey(a.postId, a.shiftKey, a.serviceTypeKey);
      (grouped.get(k) || grouped.set(k, []).get(k)!).push(a);
    }

    let copied = 0, skippedNotRequired = 0, skippedFilled = 0, skippedInactive = 0, skippedConflict = 0;
    const touched: string[] = [];

    setAssignments((prev) => {
      const next = deepClone(prev);
      const day = next[dateKey] || (next[dateKey] = {});
      const claimed = new Map<string, Set<string>>();
      for (const { key } of SHIFTS) claimed.set(key, new Set((conflictsByShift.get(key) || new Map()).keys()));

      for (const [k, sourceList] of grouped) {
        const [postId, shiftKey, serviceTypeKey] = k.split('|');
        const post = posts.find((p) => p.id === postId);
        const required = getRequiredCount(post, shiftKey, serviceTypeKey, selectedDate);
        if (required === 0) { skippedNotRequired += sourceList.length; continue; }

        const byShift = day[postId] || (day[postId] = {});
        const byService = byShift[shiftKey] || (byShift[shiftKey] = {});
        const existing = byService[serviceTypeKey] || [];
        if (existing.length >= required) { skippedFilled += sourceList.length; continue; }

        const claimedOnShift = claimed.get(shiftKey)!;
        const additions: AssignedEmployee[] = [];
        for (const a of sourceList) {
          if (existing.length + additions.length >= required) break;
          if (!a.employeeId) continue;
          if (existing.some((e) => e.employeeId === a.employeeId)) continue;
          if (claimedOnShift.has(a.employeeId)) { skippedConflict++; continue; }
          const emp = employeeById.get(a.employeeId);
          if (!emp || !isActiveEmployee(emp)) { skippedInactive++; continue; }
          additions.push({ employeeId: a.employeeId, employee: emp });
          claimedOnShift.add(a.employeeId);
          copied++;
        }
        if (additions.length > 0) {
          byService[serviceTypeKey] = [...existing, ...additions];
          if (!touched.includes(postId)) touched.push(postId);
        }
      }
      return next;
    });

    for (const postId of touched) markDirty(dateKey, postId);
    setBusyLabel(null);

    if (copied > 0) {
      const notes = [
        skippedNotRequired > 0 && `${skippedNotRequired} not required today`,
        skippedFilled > 0 && `${skippedFilled} already filled`,
        skippedConflict > 0 && `${skippedConflict} double-booked`,
        skippedInactive > 0 && `${skippedInactive} inactive`,
      ].filter(Boolean).join(' · ');
      toast({
        title: `Copied ${copied} assignment${copied > 1 ? 's' : ''}`,
        description: `From ${format(source, 'EEE dd MMM')} into ${touched.length} post${touched.length > 1 ? 's' : ''}. Review, then Save.${notes ? ` Skipped: ${notes}.` : ''}`,
      });
    } else {
      toast({
        title: 'Nothing copied',
        description: skippedFilled > 0
          ? 'Those slots are already filled for this date.'
          : `No usable assignments found on ${format(source, 'EEE dd MMM')}.`,
      });
    }
  }, [dateKey, selectedDate, posts, employeeById, conflictsByShift, markDirty, toast]);

  /**
   * Fill every gap with the best available candidate.
   *
   * Greedy over the ranked candidate list: correct designation, not already
   * committed on that shift, pay rate configured where possible. It is a draft —
   * nothing is written until Save — which is what makes an automatic choice
   * acceptable here when it would not be for attendance.
   */
  const autoFillGaps = useCallback((targetPostIds: string[]) => {
    setBusyLabel('Filling');
    let filled = 0, unfilled = 0;
    const touched: string[] = [];

    setAssignments((prev) => {
      const next = deepClone(prev);
      const day = next[dateKey] || (next[dateKey] = {});
      const claimed = new Map<string, Set<string>>();
      for (const { key } of SHIFTS) claimed.set(key, new Set((conflictsByShift.get(key) || new Map()).keys()));

      for (const postId of targetPostIds) {
        const post = posts.find((p) => p.id === postId);
        if (!post) continue;

        for (const { key: shiftKey } of SHIFTS) {
          const claimedOnShift = claimed.get(shiftKey)!;
          for (const st of SERVICE_TYPES_ORDERED) {
            const required = getRequiredCount(post, shiftKey, st.key, selectedDate);
            if (required === 0) continue;

            const byShift = day[postId] || (day[postId] = {});
            const byService = byShift[shiftKey] || (byShift[shiftKey] = {});
            const existing = byService[st.key] || [];
            let gap = required - existing.length;
            if (gap <= 0) continue;

            const ranked = buildCandidates({
              employees,
              serviceTypeKey: st.key,
              excludeIds: existing.map((a) => a.employeeId),
              conflicts: conflictsByShift.get(shiftKey),
              missingSalaryIds,
              // Auto-fill must not put a supervisor on a guard post. A human can
              // choose to; an automatic pass has no basis for it.
              includeOtherDesignations: false,
            });

            const additions: AssignedEmployee[] = [];
            for (const c of ranked) {
              if (gap === 0) break;
              const id = c.employee.id || '';
              if (!id || claimedOnShift.has(id)) continue;
              if (c.tier !== 'exact') continue;
              additions.push({ employeeId: id, employee: c.employee });
              claimedOnShift.add(id);
              gap--; filled++;
            }
            unfilled += gap;
            if (additions.length > 0) {
              byService[st.key] = [...existing, ...additions];
              if (!touched.includes(postId)) touched.push(postId);
            }
          }
        }
      }
      return next;
    });

    for (const postId of touched) markDirty(dateKey, postId);
    setBusyLabel(null);

    if (filled > 0) {
      toast({
        title: `Filled ${filled} slot${filled > 1 ? 's' : ''}`,
        description: `Across ${touched.length} post${touched.length > 1 ? 's' : ''}. ${unfilled > 0 ? `${unfilled} still unfilled — no qualified staff free. ` : ''}Review, then Save.`,
      });
    } else {
      toast({
        title: 'No slots filled',
        description: unfilled > 0
          ? `${unfilled} gap${unfilled > 1 ? 's' : ''} remain but no qualified, unassigned staff are available.`
          : 'There are no gaps to fill.',
      });
    }
  }, [dateKey, selectedDate, posts, employees, conflictsByShift, missingSalaryIds, markDirty, toast]);

  /**
   * Repeat the selected post's roster forward.
   *
   * Reads the target range first and fills only empty groups, because
   * `saveRotaAssignments` replaces a whole post-day — writing blind would destroy
   * any roster already planned for those dates.
   */
  const repeatPostForward = useCallback(async (post: OperationalPost, days: number) => {
    const postId = post.id || '';
    const sourceGroups = assignments[dateKey]?.[postId] || {};
    const hasAny = Object.values(sourceGroups).some((byService) => Object.values(byService).some((l) => l.length > 0));
    if (!hasAny) {
      toast({ title: 'Nothing to repeat', description: 'This post has no staff assigned on the selected date.' });
      return;
    }

    setBusyLabel('Repeating');
    const targets = Array.from({ length: days }, (_, i) => addDays(selectedDate, i + 1));
    const fromKey = format(targets[0], 'yyyy-MM-dd');
    const toKey = format(targets[targets.length - 1], 'yyyy-MM-dd');

    const existingRange = await getRotaAssignmentsForDateRange(fromKey, toKey);
    if (!existingRange.success) {
      setBusyLabel(null);
      toast({ title: 'Could not read target dates', description: existingRange.error, variant: 'destructive' });
      return;
    }

    let applied = 0, skippedDays = 0;
    const touchedDates: string[] = [];

    setAssignments((prev) => {
      const next = deepClone(prev);
      for (const target of targets) {
        const key = format(target, 'yyyy-MM-dd');
        const alreadyThere = nestRota(existingRange.byDate[key] || [], employeeById);
        const day = next[key] || (next[key] = {});
        // Seed from the database for posts we have not loaded, so a save of this
        // post-day cannot wipe assignments made elsewhere.
        for (const [pid, byShift] of Object.entries(alreadyThere)) if (!day[pid]) day[pid] = byShift;

        const byShiftTarget = day[postId] || (day[postId] = {});
        let dayApplied = 0;

        for (const [shiftKey, byService] of Object.entries(sourceGroups)) {
          for (const [serviceTypeKey, list] of Object.entries(byService)) {
            if (list.length === 0) continue;
            const required = getRequiredCount(post, shiftKey, serviceTypeKey, target);
            if (required === 0) continue;
            const targetService = byShiftTarget[shiftKey] || (byShiftTarget[shiftKey] = {});
            const existing = targetService[serviceTypeKey] || [];
            if (existing.length >= required) continue;

            const additions: AssignedEmployee[] = [];
            for (const a of list) {
              if (existing.length + additions.length >= required) break;
              if (existing.some((e) => e.employeeId === a.employeeId)) continue;
              const emp = employeeById.get(a.employeeId);
              if (!emp || !isActiveEmployee(emp)) continue;
              additions.push({ employeeId: a.employeeId, employee: emp });
              dayApplied++;
            }
            if (additions.length > 0) targetService[serviceTypeKey] = [...existing, ...additions];
          }
        }

        if (dayApplied > 0) { applied += dayApplied; touchedDates.push(key); }
        else skippedDays++;
      }
      return next;
    });

    for (const key of touchedDates) markDirty(key, postId);
    setBusyLabel(null);
    setRepeatForward(null);

    if (applied > 0) {
      toast({
        title: `Applied to ${touchedDates.length} day${touchedDates.length > 1 ? 's' : ''}`,
        description: `${applied} assignment${applied > 1 ? 's' : ''} queued for ${post.postName}.${skippedDays > 0 ? ` ${skippedDays} day(s) skipped — not required or already staffed.` : ''} Save to apply.`,
      });
    } else {
      toast({ title: 'Nothing applied', description: 'Those days are already staffed, or the post is not scheduled on them.' });
    }
  }, [assignments, dateKey, selectedDate, employeeById, markDirty, toast]);

  // ─── Filtering ─────────────────────────────────────────────────────────────

  /** Service types this post is configured for on any day. */
  const configuredServices = useCallback((post: OperationalPost) =>
    SERVICE_TYPES_ORDERED.filter((st) => SHIFTS.some((s) => getRequiredCountAnyDay(post, s.key, st.key) > 0)),
  []);

  const postsMissingSalaryConfig = useMemo(() => {
    const set = new Set<string>();
    for (const post of posts) {
      const services = configuredServices(post);
      const anyMissing = services.some((st) =>
        !postSalaryRates.some((r) => r.post_id === post.id && r.designation === st.designation && r.monthly_salary > 0));
      if (anyMissing && services.length > 0) set.add(post.id || '');
    }
    return set;
  }, [posts, postSalaryRates, configuredServices]);

  const sidebarRows = useMemo<SidebarRow[]>(() => {
    const term = searchTerm.trim().toLowerCase();

    const passes = (post: OperationalPost) => {
      const s = staffingByPost.get(post.id || '');
      if (filterMode === 'gaps') return !!s && s.totalRequired > 0 && !s.isFullyStaffed;
      if (filterMode === 'unstaffed') return !!s && s.totalRequired > 0 && s.totalAssigned === 0;
      if (filterMode === 'no-salary') return postsMissingSalaryConfig.has(post.id || '');
      return true;
    };

    const byClient = new Map<string, OperationalPost[]>();
    for (const post of posts) {
      if (!passes(post)) continue;
      if (term) {
        const hay = `${post.postName} ${post.clientName} ${post.postCode || ''} ${post.location?.city || ''} ${post.location?.address || ''}`.toLowerCase();
        if (!hay.includes(term)) continue;
      }
      const client = post.clientName || 'Unknown client';
      const bucket = byClient.get(client);
      if (bucket) bucket.push(post); else byClient.set(client, [post]);
    }

    const rows: SidebarRow[] = [];
    for (const clientName of Array.from(byClient.keys()).sort((a, b) => a.localeCompare(b))) {
      const clientPosts = byClient.get(clientName)!.sort((a, b) => a.postName.localeCompare(b.postName));
      let totalRequired = 0, totalAssigned = 0;
      for (const p of clientPosts) {
        const s = staffingByPost.get(p.id || '');
        if (s) { totalRequired += s.totalRequired; totalAssigned += s.totalAssigned; }
      }
      rows.push({ kind: 'client', key: `c:${clientName}`, group: { clientName, posts: clientPosts, totalRequired, totalAssigned } });
      if (collapsedClients.has(clientName)) continue;
      for (const p of clientPosts) {
        rows.push({ kind: 'post', key: `p:${p.id}`, post: p, staffing: staffingByPost.get(p.id || '')! });
      }
    }
    return rows;
  }, [posts, staffingByPost, searchTerm, filterMode, collapsedClients, postsMissingSalaryConfig]);

  const visiblePosts = useMemo(
    () => sidebarRows.filter((r): r is Extract<SidebarRow, { kind: 'post' }> => r.kind === 'post').map((r) => r.post),
    [sidebarRows]
  );
  useEffect(() => { visiblePostIdsRef.current = visiblePosts.map((p) => p.id || ''); }, [visiblePosts]);

  const selectedPost = useMemo(() => posts.find((p) => p.id === selectedPostId) || null, [posts, selectedPostId]);

  // ─── Navigation ────────────────────────────────────────────────────────────

  const stepPost = useCallback((delta: number) => {
    const idx = visiblePosts.findIndex((p) => p.id === selectedPostId);
    const next = visiblePosts[(idx < 0 ? 0 : idx) + delta];
    if (next) setSelectedPostId(next.id || null);
  }, [visiblePosts, selectedPostId]);

  const jumpToNextGap = useCallback(() => {
    const order = visiblePosts;
    if (order.length === 0) return;
    const idx = order.findIndex((p) => p.id === selectedPostId);
    for (let step = 1; step <= order.length; step++) {
      const candidate = order[(idx + step + order.length) % order.length];
      const s = staffingByPost.get(candidate.id || '');
      if (s && s.totalRequired > 0 && !s.isFullyStaffed) { setSelectedPostId(candidate.id || null); return; }
    }
    toast({ title: 'Fully staffed', description: 'Every post in view has all its slots filled.' });
  }, [visiblePosts, selectedPostId, staffingByPost, toast]);

  const goToDate = useCallback((d: Date) => {
    const clamped = d < minDate ? minDate : d > maxDate ? maxDate : d;
    setSelectedDate(startOfDay(clamped));
  }, [minDate, maxDate]);

  const dayStrip = useMemo(
    () => Array.from({ length: STRIP_DAYS }, (_, i) => addDays(stripStart, i)),
    [stripStart]
  );

  // Keep the strip around the selected date when it is chosen from the calendar.
  useEffect(() => {
    const inStrip = dayStrip.some((d) => isSameDay(d, selectedDate));
    if (!inStrip) setStripStart(subDays(selectedDate, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // ─── Keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement || el?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (hasUnsavedChanges && !isSaving) void handleSave().catch(() => {});
        return;
      }
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === 'Escape' && typing) { (el as HTMLElement).blur(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (conflictConfirm || confirmClear || repeatForward || showShortcuts || infoPostId || employeeDetail) return;

      switch (e.key) {
        case '?': e.preventDefault(); setShowShortcuts(true); break;
        case 'g': case 'G': e.preventDefault(); jumpToNextGap(); break;
        case '[': e.preventDefault(); stepPost(-1); break;
        case ']': e.preventDefault(); stepPost(1); break;
        case 'ArrowLeft': e.preventDefault(); goToDate(subDays(selectedDate, 1)); break;
        case 'ArrowRight': e.preventDefault(); goToDate(addDays(selectedDate, 1)); break;
        default: break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hasUnsavedChanges, isSaving, handleSave, conflictConfirm, confirmClear, repeatForward,
      showShortcuts, infoPostId, employeeDetail, jumpToNextGap, stepPost, goToDate, selectedDate]);

  // ─── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <div className="flex items-center justify-center h-96"><BrandLoader size="lg" message="Loading deployments..." /></div>;
  }

  if (posts.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Shield className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
        <h3 className="font-semibold text-lg mb-1">No deployments</h3>
        <p className="text-sm text-muted-foreground">Posts appear here once clients are onboarded through Sales.</p>
      </Card>
    );
  }

  const coveragePct = coverage.required > 0 ? (coverage.assigned / coverage.required) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* ═══ Alerts ═══ */}
      {missedDates.length > 0 && (
        <Card className="p-3 border-orange-200/60 bg-orange-50/60 dark:bg-orange-900/10">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-orange-800 dark:text-orange-300">
                <strong>{missedDates.length}</strong> day{missedDates.length > 1 ? 's' : ''} deployed but never marked
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {missedDates.slice(0, 6).map((d) => (
                  <button
                    key={d}
                    onClick={() => window.dispatchEvent(new CustomEvent('switchOpsTab', { detail: { tab: 'attendance', date: d } }))}
                    className="text-xs px-2 py-0.5 rounded-full border border-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                  >
                    {format(new Date(d), 'MMM dd')} · {differenceInDays(today, new Date(d))}d ago
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {deployedWithoutSalary.size > 0 && (
        <Card className="p-3 border-red-200/60 bg-red-50/60 dark:bg-red-900/10">
          <div className="flex items-center gap-3">
            <IndianRupee className="h-4 w-4 text-red-600 shrink-0" />
            <p className="text-sm text-red-800 dark:text-red-300">
              <strong>{deployedWithoutSalary.size}</strong> staff deployed on {format(selectedDate, 'dd MMM')} have no salary rate,
              so their duty cannot be priced.
              <span className="text-xs text-muted-foreground ml-1">HR → Payroll &amp; Salary → Post-wise Salary</span>
            </p>
          </div>
        </Card>
      )}

      {/* ═══ Command bar ═══ */}
      <Card className="p-3 sticky top-0 z-30 bg-white/90 dark:bg-gray-900/85 backdrop-blur-md">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <h3 className="font-bold text-base leading-tight">Deployments</h3>
              <p className="text-xs text-muted-foreground">
                {format(selectedDate, 'EEE, dd MMM yyyy')}
                {isSameDay(selectedDate, today)
                  ? ' · today'
                  : selectedDate > today
                  ? ` · planning ${differenceInDays(selectedDate, today)}d ahead`
                  : ` · ${differenceInDays(today, selectedDate)}d ago`}
              </p>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setStripStart(subDays(stripStart, STRIP_DAYS))}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
                aria-label="Previous week"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex gap-1">
                {dayStrip.map((day) => {
                  const active = isSameDay(day, selectedDate);
                  const isToday = isSameDay(day, today);
                  const outOfRange = day < minDate || day > maxDate;
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => goToDate(day)}
                      disabled={outOfRange}
                      className={cn(
                        'flex flex-col items-center min-w-[44px] px-1.5 py-1 rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed',
                        active
                          ? 'bg-[#D71920] border-[#D71920] text-white shadow-[0_0_12px_rgba(215,25,32,0.35)]'
                          : isToday
                          ? 'bg-white dark:bg-gray-800 border-[#D71920]/40'
                          : 'bg-white/70 dark:bg-gray-800/70 border-gray-200/60 dark:border-gray-700/60 hover:border-[#D71920]/50'
                      )}
                      title={format(day, 'EEEE, dd MMM yyyy')}
                    >
                      <span className={cn('text-[10px] font-medium', active ? 'text-white/80' : isToday ? 'text-[#D71920]' : 'text-muted-foreground')}>
                        {isToday ? 'Today' : format(day, 'EEE')}
                      </span>
                      <span className="text-sm font-bold leading-tight">{format(day, 'dd')}</span>
                      <span className={cn('text-[10px]', active ? 'text-white/80' : 'text-muted-foreground')}>{format(day, 'MMM')}</span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setStripStart(addDays(stripStart, STRIP_DAYS))}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button className="p-1.5 rounded hover:bg-muted text-muted-foreground" aria-label="Pick a date">
                    <CalendarIcon className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  {/* Past for backfill, future for planning — the old calendar
                      refused every future date while the strip offered them. */}
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => { if (d) { goToDate(d); setDatePickerOpen(false); } }}
                    disabled={(d) => d < minDate || d > maxDate}
                    startMonth={minDate}
                    endMonth={maxDate}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>

              {!isSameDay(selectedDate, today) && (
                <button onClick={() => goToDate(today)} className="text-xs text-[#D71920] hover:underline ml-1 whitespace-nowrap">
                  Today
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Bulk verbs. Building hundreds of rosters slot by slot was the
                actual cost of this screen; rosters repeat almost entirely. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" disabled={!!busyLabel}>
                  <CopyIcon className="h-3.5 w-3.5" />{busyLabel === 'Copying' ? 'Copying…' : 'Copy'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Fills empty slots only · never replaces existing assignments
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void copyFromDay(subDays(selectedDate, 1), selectedPostId ? [selectedPostId] : [])} disabled={!selectedPost}>
                  <MapPin className="h-4 w-4 mr-2 text-[#D71920]" />Yesterday → this post
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void copyFromDay(subDays(selectedDate, 1), visiblePostIdsRef.current)}>
                  <Building2 className="h-4 w-4 mr-2 text-[#D71920]" />Yesterday → all {visiblePosts.length} in view
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void copyFromDay(subDays(selectedDate, 7), visiblePostIdsRef.current)}>
                  <CalendarIcon className="h-4 w-4 mr-2 text-[#D71920]" />
                  Same weekday last week ({format(subDays(selectedDate, 7), 'dd MMM')})
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline" size="sm"
                  className="h-8 text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300"
                  disabled={!!busyLabel || coverage.gap === 0}
                >
                  <Wand2 className="h-3.5 w-3.5" />{busyLabel === 'Filling' ? 'Filling…' : `Fill ${coverage.gap} gap${coverage.gap === 1 ? '' : 's'}`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Picks qualified, unassigned staff. Draft only — nothing is written until you Save.
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => selectedPostId && autoFillGaps([selectedPostId])} disabled={!selectedPost}>
                  <MapPin className="h-4 w-4 mr-2 text-blue-600" />This post
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => autoFillGaps(visiblePostIdsRef.current)}>
                  <Building2 className="h-4 w-4 mr-2 text-blue-600" />All {visiblePosts.length} posts in view
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {hasUnsavedChanges && (
              <span className="text-xs text-amber-600 flex items-center gap-1 whitespace-nowrap">
                <AlertCircle className="h-3 w-3" />
                {dirtyPostCount} post{dirtyPostCount > 1 ? 's' : ''}
                {dirtyDates.length > 1 && ` · ${dirtyDates.length} dates`}
              </span>
            )}
            <AnimatedActionButton
              onClick={handleSave}
              disabled={!hasUnsavedChanges || isSaving}
              idleLabel={hasUnsavedChanges ? `Save ${dirtyPostCount}` : 'Save'}
              loadingLabel="Saving..."
              successLabel="Saved!"
              errorLabel="Failed"
              variant="save"
              size="sm"
              idleIcon={<Check className="h-3.5 w-3.5" />}
            />
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts (?)">
              <Keyboard className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Coverage */}
        {coverage.required > 0 && (
          <div className="mt-2.5">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-500',
                    coverage.gap === 0 ? 'bg-green-500' : 'bg-linear-to-r from-[#D71920] to-amber-500')}
                  style={{ width: `${coveragePct}%` }}
                />
              </div>
              <span className="text-xs font-semibold tabular-nums whitespace-nowrap">
                {coverage.assigned}/{coverage.required} slots filled
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs flex-wrap">
              {coverage.gap > 0 ? (
                <button onClick={() => setFilterMode('gaps')} className="flex items-center gap-1 text-amber-600 hover:underline">
                  <TriangleAlert className="h-3 w-3" />{coverage.gap} unfilled across {coverage.postsWithGaps} post{coverage.postsWithGaps > 1 ? 's' : ''}
                </button>
              ) : (
                <span className="flex items-center gap-1 text-green-600"><Check className="h-3 w-3" />Fully staffed</span>
              )}
              {coverage.unstaffed > 0 && (
                <button onClick={() => setFilterMode('unstaffed')} className="flex items-center gap-1 text-red-600 hover:underline">
                  <CircleSlash className="h-3 w-3" />{coverage.unstaffed} with nobody at all
                </button>
              )}
              <span className="text-muted-foreground">{coverage.relevant} posts scheduled {format(selectedDate, 'EEE')}</span>
            </div>
          </div>
        )}
      </Card>

      {/* ═══ Body ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3 items-start">
        {/* ─── Post navigator ─── */}
        <Card className="overflow-hidden lg:sticky lg:top-[176px]">
          <div className="p-2.5 border-b bg-gray-50/80 dark:bg-gray-900/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchRef}
                placeholder="Search posts, clients, cities... (/)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs bg-white dark:bg-gray-800"
                aria-label="Search posts"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="px-2.5 py-2 border-b flex items-center justify-between gap-2">
            <div className="flex gap-1 flex-wrap">
              {([
                ['all', `All ${posts.length}`],
                ['gaps', `Gaps ${coverage.postsWithGaps}`],
                ...(coverage.unstaffed > 0 ? [['unstaffed', `Empty ${coverage.unstaffed}`] as [FilterMode, string]] : []),
                ...(postsMissingSalaryConfig.size > 0 ? [['no-salary', `No rate ${postsMissingSalaryConfig.size}`] as [FilterMode, string]] : []),
              ] as [FilterMode, string][]).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors',
                    filterMode === mode
                      ? 'bg-[#D71920] text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-muted-foreground hover:bg-gray-200 dark:hover:bg-gray-700')}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px] gap-1 text-[#D71920] shrink-0" onClick={jumpToNextGap} title="Next post with a gap (G)">
              <TriangleAlert className="h-3 w-3" />Gap
            </Button>
          </div>

          {sidebarRows.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Search className="h-5 w-5 mx-auto mb-1.5" />
              No posts match this view
              <button className="block mx-auto mt-1.5 text-xs text-[#D71920] hover:underline" onClick={() => { setSearchTerm(''); setFilterMode('all'); }}>
                Reset filters
              </button>
            </div>
          ) : (
            /* Windowed: several hundred posts stay a handful of DOM nodes. */
            <VirtualList
              items={sidebarRows}
              height="calc(100vh - 360px)"
              estimateSize={72}
              overscan={8}
              getKey={(row) => row.key}
              renderItem={(row) => {
                if (row.kind === 'client') {
                  const { clientName, posts: clientPosts, totalRequired, totalAssigned } = row.group;
                  const collapsed = collapsedClients.has(clientName);
                  const full = totalRequired > 0 && totalAssigned >= totalRequired;
                  return (
                    <button
                      onClick={() => setCollapsedClients((prev) => {
                        const next = new Set(prev);
                        if (next.has(clientName)) next.delete(clientName); else next.add(clientName);
                        return next;
                      })}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-2 bg-gray-50/70 dark:bg-gray-900/40 border-y border-gray-100 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors text-left"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform', collapsed && '-rotate-90')} />
                        <Building2 className="h-3.5 w-3.5 text-[#D71920] shrink-0" />
                        <span className="font-semibold text-xs truncate">{clientName}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{clientPosts.length}</Badge>
                      </div>
                      {totalRequired > 0 && (full
                        ? <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        : <span className="text-[11px] text-amber-600 tabular-nums shrink-0">{totalAssigned}/{totalRequired}</span>)}
                    </button>
                  );
                }

                const { post, staffing } = row;
                const selected = post.id === selectedPostId;
                const isDirty = (dirty[dateKey] || []).includes(post.id || '');
                const pct = staffing.totalRequired > 0 ? (staffing.totalAssigned / staffing.totalRequired) * 100 : 0;
                const services = configuredServices(post);

                return (
                  <div
                    onClick={() => setSelectedPostId(post.id || null)}
                    className={cn('cursor-pointer px-2.5 py-2 mx-1 my-0.5 rounded-lg transition-all',
                      selected ? 'bg-[#D71920]/10 ring-1 ring-[#D71920]/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-xs truncate">{post.postName}</span>
                          {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Unsaved changes" />}
                          <button
                            onClick={(e) => { e.stopPropagation(); setInfoPostId(post.id || null); }}
                            className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 shrink-0"
                            aria-label={`Details for ${post.postName}`}
                          >
                            <Info className="h-3 w-3 text-muted-foreground hover:text-[#D71920]" />
                          </button>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{post.location?.city || post.location?.address || 'No location'}</span>
                        </div>
                        {services.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {services.map((st) => (
                              <span key={st.key} className={cn('inline-block w-1.5 h-1.5 rounded-full', st.dot)} title={st.label} />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0">
                        {staffing.totalRequired === 0
                          ? <Badge variant="outline" className="text-[9px]">Not today</Badge>
                          : staffing.isFullyStaffed
                          ? <Check className="h-3.5 w-3.5 text-green-600" />
                          : <span className="text-[10px] font-medium text-amber-600 tabular-nums">{staffing.totalAssigned}/{staffing.totalRequired}</span>}
                      </div>
                    </div>
                    {staffing.totalRequired > 0 && (
                      <div className="mt-1 h-0.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', staffing.isFullyStaffed ? 'bg-green-500' : 'bg-amber-500')} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                );
              }}
            />
          )}
        </Card>

        {/* ─── Assignment panel ─── */}
        <Card className="overflow-hidden">
          <AnimatePresence mode="wait">
            {!selectedPost ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-center">
                <Shield className="h-12 w-12 text-muted-foreground mb-3" />
                <h4 className="font-semibold">Select a post</h4>
                <p className="text-sm text-muted-foreground mt-1">Choose a post on the left to build its roster</p>
              </motion.div>
            ) : (
              <motion.div key={selectedPost.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
                <div className="p-3.5 border-b bg-linear-to-r from-[#D71920]/5 to-transparent flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-base truncate">{selectedPost.postName}</h4>
                      <button onClick={() => setInfoPostId(selectedPost.id || null)} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700" aria-label="Post details">
                        <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-[#D71920]" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{selectedPost.clientName}</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {[selectedPost.location?.address, selectedPost.location?.city].filter(Boolean).join(', ') || 'No address'}
                      </span>
                      {selectedPost.postCode && <Badge variant="outline" className="text-[10px]">{selectedPost.postCode}</Badge>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setRepeatForward({ days: 7 })}>
                      <CalendarPlus className="h-3.5 w-3.5" />Repeat forward
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-xs px-2">⋯</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onClick={() => autoFillGaps([selectedPost.id || ''])}>
                          <Wand2 className="h-4 w-4 mr-2 text-blue-600" />Fill this post's gaps
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void copyFromDay(subDays(selectedDate, 1), [selectedPost.id || ''])}>
                          <CopyIcon className="h-4 w-4 mr-2 text-[#D71920]" />Copy yesterday
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setConfirmClear(selectedPost)}>
                          <Trash2 className="h-4 w-4 mr-2" />Clear this roster
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {isDayLoading ? (
                  <div className="py-16 flex justify-center"><BrandLoader message="Loading roster..." /></div>
                ) : (
                  <ShiftAssignmentPanel
                    post={selectedPost}
                    date={selectedDate}
                    collapsedShifts={collapsedShifts}
                    onToggleShift={(shiftKey) => setCollapsedShifts((prev) => {
                      const next = new Set(prev);
                      if (next.has(shiftKey)) next.delete(shiftKey); else next.add(shiftKey);
                      return next;
                    })}
                    getAssigned={getAssigned}
                    getCandidates={getCandidates}
                    onAssign={assignEmployee}
                    onUnassign={unassignEmployee}
                    onShowEmployee={setEmployeeDetail}
                    recentWork={recentWork}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>

      {/* ═══ Double-booking confirmation ═══ */}
      <Dialog open={!!conflictConfirm} onOpenChange={(open) => { if (!open) setConflictConfirm(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-red-500" />Already deployed this shift
            </DialogTitle>
            <DialogDescription className="text-sm">
              <strong>{conflictConfirm?.employee.name}</strong> is already assigned to{' '}
              <strong>{conflictConfirm?.conflictPostName}</strong> on the {conflictConfirm?.shiftKey} shift for{' '}
              {format(selectedDate, 'dd MMM yyyy')}. One person cannot cover two posts at once.
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Continue only if you are also removing them from the other post. Otherwise the roster will
            report a post as staffed when nobody is there — and attendance will be marked against it.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConflictConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (conflictConfirm) {
                  applyAssignment(conflictConfirm.postId, conflictConfirm.shiftKey, conflictConfirm.serviceTypeKey, conflictConfirm.employee.id || '');
                }
                setConflictConfirm(null);
              }}
            >
              Assign anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Clear roster ═══ */}
      <Dialog open={!!confirmClear} onOpenChange={(open) => { if (!open) setConfirmClear(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-4 w-4 text-red-500" />Clear this roster?
            </DialogTitle>
            <DialogDescription className="text-sm">
              Removes everyone from <strong>{confirmClear?.postName}</strong> for {format(selectedDate, 'dd MMM yyyy')}.
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            An unstaffed post cannot have attendance marked against it. Nothing is written until you Save.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmClear(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (confirmClear) clearPost(confirmClear); setConfirmClear(null); }}>
              Clear roster
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Repeat forward ═══ */}
      <Dialog open={!!repeatForward} onOpenChange={(open) => { if (!open) setRepeatForward(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CalendarPlus className="h-4 w-4 text-[#D71920]" />Repeat this roster forward
            </DialogTitle>
            <DialogDescription className="text-sm">
              Copy <strong>{selectedPost?.postName}</strong>'s roster from {format(selectedDate, 'EEE dd MMM')} onto the following days.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <div className="flex flex-wrap gap-1.5">
              {[1, 3, 6, 7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setRepeatForward({ days: d })}
                  className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                    repeatForward?.days === d ? 'bg-[#D71920] text-white' : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700')}
                >
                  {d} day{d > 1 ? 's' : ''}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Only empty slots are filled, and only on days this post is actually scheduled.
              Existing rosters on those dates are left alone. Nothing is written until you Save.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRepeatForward(null)}>Cancel</Button>
            <Button
              className="bg-[#D71920] hover:bg-[#B01419]"
              disabled={!!busyLabel}
              onClick={() => { if (selectedPost && repeatForward) void repeatPostForward(selectedPost, repeatForward.days); }}
            >
              Apply to next {repeatForward?.days ?? 7} day{(repeatForward?.days ?? 7) > 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Shortcuts ═══ */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Keyboard className="h-4 w-4 text-[#D71920]" />Keyboard shortcuts
            </DialogTitle>
            <DialogDescription className="text-sm">Move through posts and days without the mouse.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            {[
              ['G', 'Jump to the next post with a gap'],
              ['[ / ]', 'Previous / next post'],
              ['← / →', 'Previous / next day'],
              ['/', 'Focus the post search'],
              ['Ctrl/⌘ + S', 'Save all pending changes'],
              ['?', 'Show this panel'],
            ].map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">{desc}</span>
                <kbd className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border text-xs font-mono font-semibold shrink-0">{key}</kbd>
              </div>
            ))}
          </div>
          <div className="mt-1 p-2.5 rounded-lg bg-[#D71920]/5 border border-[#D71920]/20">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Fastest path for a new day:</strong> Copy yesterday across all posts in view,
              then Fill gaps, then Save. Correct the exceptions individually.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <EmployeeDetailDialog
        employee={employeeDetail}
        open={!!employeeDetail}
        onOpenChange={(open) => { if (!open) setEmployeeDetail(null); }}
        recentWork={recentWork}
      />

      <PostInfoDialog
        post={posts.find((p) => p.id === infoPostId) || null}
        open={!!infoPostId}
        onOpenChange={(open) => { if (!open) setInfoPostId(null); }}
        postSalaryRates={postSalaryRates}
        salaryRatesLoaded={salaryRatesLoaded}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shift assignment panel
// ─────────────────────────────────────────────────────────────────────────────

interface ShiftAssignmentPanelProps {
  post: OperationalPost;
  date: Date;
  collapsedShifts: Set<string>;
  onToggleShift: (shiftKey: string) => void;
  getAssigned: (postId: string, shiftKey: string, serviceTypeKey: string) => AssignedEmployee[];
  getCandidates: (postId: string, shiftKey: string, serviceTypeKey: string) => Candidate[];
  onAssign: (postId: string, shiftKey: string, serviceTypeKey: string, employeeId: string) => void;
  onUnassign: (postId: string, shiftKey: string, serviceTypeKey: string, employeeId: string) => void;
  onShowEmployee: (employee: HREmployee) => void;
  recentWork: RecentWorkMap;
}

/**
 * Shifts are expanded by default.
 *
 * They used to start collapsed, so reaching any control cost one click per shift
 * before work could begin — multiplied across every post, the dominant cost of
 * the screen, for a maximum of three shifts.
 */
function ShiftAssignmentPanel({
  post, date, collapsedShifts, onToggleShift, getAssigned, getCandidates,
  onAssign, onUnassign, onShowEmployee, recentWork,
}: ShiftAssignmentPanelProps) {
  const postId = post.id || '';

  const shifts = useMemo(() => SHIFTS.map((shift) => {
    const groups = SERVICE_TYPES_ORDERED
      .map((st) => ({ st, required: getRequiredCount(post, shift.key, st.key, date) }))
      .filter((g) => g.required > 0);
    const configuredAnyDay = SERVICE_TYPES_ORDERED.some((st) => getRequiredCountAnyDay(post, shift.key, st.key) > 0);
    return { shift, groups, configuredAnyDay };
  }).filter((s) => s.groups.length > 0 || s.configuredAnyDay), [post, date]);

  if (shifts.length === 0) {
    return (
      <div className="py-16 text-center px-6">
        <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">No shift requirements configured</p>
        <p className="text-xs text-muted-foreground mt-1">Configure services in the agreement to enable scheduling for this post.</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 max-h-[calc(100vh-340px)] overflow-y-auto">
      {shifts.map(({ shift, groups, configuredAnyDay }) => {
        const ShiftIcon = SHIFT_ICONS[shift.iconName];
        const collapsed = collapsedShifts.has(shift.key);

        if (groups.length === 0 && configuredAnyDay) {
          return (
            <div key={shift.key} className="rounded-lg border border-dashed bg-gray-50/50 dark:bg-gray-900/20 px-3.5 py-2.5 flex items-center gap-2">
              <ShiftIcon className={cn('h-4 w-4 opacity-40', shift.color)} />
              <span className="font-semibold text-sm text-muted-foreground">{shift.label}</span>
              <span className="text-xs text-muted-foreground">{shift.time}</span>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-muted-foreground font-medium">
                Not scheduled {format(date, 'EEE')}
              </span>
            </div>
          );
        }

        let shiftRequired = 0, shiftAssigned = 0;
        for (const g of groups) {
          shiftRequired += g.required;
          shiftAssigned += Math.min(g.required, getAssigned(postId, shift.key, g.st.key).length);
        }
        const shiftFull = shiftRequired > 0 && shiftAssigned >= shiftRequired;

        return (
          <div key={shift.key} className="rounded-lg border overflow-hidden">
            <button
              onClick={() => onToggleShift(shift.key)}
              className="w-full flex items-center justify-between px-3.5 py-2 bg-white dark:bg-gray-800 border-b gap-2 hover:bg-gray-50 dark:hover:bg-gray-800/70 transition-colors"
              aria-expanded={!collapsed}
            >
              <div className="flex items-center gap-2 min-w-0">
                <ShiftIcon className={cn('h-4 w-4 shrink-0', shift.color)} />
                <span className="font-semibold text-sm">{shift.label}</span>
                <span className="text-xs text-muted-foreground hidden sm:inline">{shift.time}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn('text-xs tabular-nums font-medium', shiftFull ? 'text-green-600' : 'text-amber-600')}>
                  {shiftAssigned}/{shiftRequired}
                </span>
                <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', collapsed && '-rotate-90')} />
              </div>
            </button>

            {!collapsed && (
              <div className="divide-y bg-gray-50/50 dark:bg-gray-900/30">
                {groups.map(({ st, required }) => {
                  const assigned = getAssigned(postId, shift.key, st.key);
                  const gap = required - assigned.length;
                  const candidates = gap > 0 ? getCandidates(postId, shift.key, st.key) : [];

                  return (
                    <div key={st.key} className="p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge className={cn('text-[11px]', st.color)}>{st.label}</Badge>
                          <span className="text-[11px] text-muted-foreground">
                            <strong className={gap === 0 ? 'text-green-600' : 'text-amber-600'}>{assigned.length}</strong>
                            <span> / {required}</span>
                          </span>
                        </div>
                        {gap > 0 && (
                          <span className="text-[11px] text-amber-600 font-medium shrink-0">
                            {gap} short
                          </span>
                        )}
                      </div>

                      {assigned.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {assigned.map(({ employeeId, employee, unresolved }) => {
                            const age = calcAge(employee.dateOfBirth);
                            return (
                              <div
                                key={employeeId}
                                className={cn(
                                  'inline-flex items-center gap-1.5 pl-1.5 pr-1 py-1 rounded-md border text-xs bg-white/80 dark:bg-gray-800/80',
                                  unresolved
                                    ? 'border-amber-300 dark:border-amber-800'
                                    : 'border-gray-200/60 dark:border-white/10'
                                )}
                              >
                                <button
                                  className="flex items-center gap-1.5 hover:opacity-80 transition-opacity min-w-0"
                                  onClick={() => onShowEmployee(employee)}
                                  title={unresolved ? 'Employee record unavailable — kept so the roster is not altered' : `Details for ${employee.name}`}
                                >
                                  <EmployeeAvatar employee={employee} size="sm" />
                                  <span className="text-left min-w-0">
                                    <span className="font-medium leading-tight block truncate max-w-[140px]">{employee.name}</span>
                                    <span className="text-[10px] text-muted-foreground leading-tight flex items-center gap-1">
                                      {employee.employeeId && <span className="font-mono">{employee.employeeId}</span>}
                                      {genderSymbol(employee.gender) && <span>{genderSymbol(employee.gender)}</span>}
                                      {age != null && <span>{age}yr</span>}
                                      {unresolved && <span className="text-amber-600">record n/a</span>}
                                    </span>
                                  </span>
                                </button>
                                <button
                                  onClick={() => onUnassign(postId, shift.key, st.key, employeeId)}
                                  className="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 rounded p-0.5 shrink-0"
                                  aria-label={`Remove ${employee.name}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {gap > 0 && (
                        <EmployeePickerPopover
                          candidates={candidates}
                          serviceTypeKey={st.key}
                          recentWork={recentWork}
                          onSelect={(emp) => onAssign(postId, shift.key, st.key, emp.id || '')}
                          onShowDetail={onShowEmployee}
                          width={400}
                        >
                          <Button variant="outline" size="sm" className="w-full h-8 justify-start text-xs text-muted-foreground">
                            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                            Assign {st.label.toLowerCase()} — {gap} needed
                          </Button>
                        </EmployeePickerPopover>
                      )}

                      {gap === 0 && assigned.length === 0 && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" />Not required on {format(date, 'EEE')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
