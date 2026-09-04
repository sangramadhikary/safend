'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AttendanceManagement — mark who actually turned up
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This screen is used once a day against every staffed post, so its cost is
 * measured in clicks per post, not in features. The rewrite is organised around
 * four problems the previous version had.
 *
 * 1. THE DATE STRIP POINTED AT DATES THE SERVER REFUSES.
 *    It offered today plus the next six days, while `upsertAttendance` rejects any
 *    future date. Attendance is a record of what happened, so six of the seven
 *    one-click options could only produce an error. The strip now runs backwards:
 *    today and the six days behind it, which is where the actual work is — the
 *    "1 day with pending attendance" banner always points into the past.
 *
 * 2. VACANT SLOTS WERE A DEAD END.
 *    A required slot with nobody rostered rendered "Unassigned / No employee" with
 *    no control of any kind. The post could never reach 100%, and there was no
 *    path to record who covered. Those slots are now first-class: they are counted
 *    separately from pending, explained, and fillable in place.
 *
 * 3. CANDIDATE LISTS CAME BACK EMPTY.
 *    Half-day swap and replace matched HR designations against a UI label with
 *    `===`. See `rota/rotaShared.ts` for why that could not work. Every flow now
 *    shares one picker that ranks all active staff instead of filtering to a set
 *    that could be empty.
 *
 * 4. IT RE-SCANNED EVERYTHING ON EVERY RENDER.
 *    Post statistics were computed with `array.find` inside a loop over
 *    posts × 3 shifts × 6 service types, so each keystroke in the search box cost
 *    a full scan of every attendance row roughly eighteen times per post. At the
 *    scale this is built for that is the difference between typing and waiting.
 *    Lookups are now indexed and the post list is windowed.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { BrandLoader } from '@/components/ui/brand-loader';
import { Calendar } from '@/components/ui/calendar';
import { VirtualList } from '@/components/ui/virtual-list';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  MapPin, Building2, Calendar as CalendarIcon, Users, Sun, Sunset, Moon,
  ChevronDown, Check, X, AlertCircle, AlertTriangle, RotateCcw, Search,
  Keyboard, SkipForward, MoreVertical, UserPlus, UserX, Inbox, Zap,
  CheckCheck, Ban, Shield,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { subscribeToOperationalPosts, type OperationalPost } from '@/services/supabase/OperationalPostService';
import { subscribeToHREmployees, type HREmployee } from '@/services/supabase/HREmployeeService';
import {
  getRotaAssignmentsForDate,
  getAttendanceForDate,
  bulkUpsertAttendance,
  canUndoAttendance,
  undoAttendance,
  type AttendanceStatus,
  type ShiftAttendance,
  type RotaAssignment,
  type BulkAttendanceSlot,
} from '@/services/supabase/RotaAttendanceService';
import { format, startOfDay, parseISO, subDays, isSameDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabaseClient } from '@/integrations/supabase/client';
import { applyBranchScope, onBranchScopeChange } from '@/utils/branchScope';
import { ApprovalQueue } from '@/modules/shared/attendance/ApprovalQueue';
import {
  SHIFTS,
  SERVICE_TYPES_ORDERED,
  getServiceLabel,
  getRequiredCount,
  getRequiredCountAnyDay,
  buildRotaIndex,
  buildAttendanceIndex,
  buildShiftConflictIndex,
  buildCandidates,
  computePostAttendanceStats,
  groupKey,
  slotKey,
  isActiveEmployee,
  initialsOf,
  ATTENDANCE_STATUS_META,
  type RotaIndex,
  type AttendanceIndex,
  type PostAttendanceStats,
} from './rota/rotaShared';
import { EmployeePickerList, type RecentWorkMap } from './rota/EmployeePicker';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AttendanceManagementProps {
  presetDate?: string | null;
}

interface SlotRef {
  postId: string;
  shiftKey: string;
  serviceTypeKey: string;
  slotIndex: number;
}

/** A required slot, resolved against the roster and today's marks. */
interface ResolvedSlot extends SlotRef {
  key: string;
  rotaEmployee?: RotaAssignment;
  attendance?: ShiftAttendance;
  status: AttendanceStatus;
  /** Required, but nobody was rostered and nobody has been recorded. */
  isUndeployed: boolean;
}

type PostFilter = 'all' | 'pending' | 'done' | 'undeployed';

/**
 * Which picker dialog is open, and what it is for.
 *
 * There is deliberately no "assign somebody to this empty slot" mode. Attendance
 * records what a deployment produced, so creating the deployment from here would
 * let this screen invent billable, payable duty that nobody planned or approved.
 * Undeployed slots route to Deployments instead — and
 * `RotaAttendanceService.assertDeployed` rejects the write regardless of what any
 * UI attempts.
 */
type PickerIntent =
  | { mode: 'half_day'; slot: SlotRef; primary?: RotaAssignment }
  | { mode: 'replace'; slot: SlotRef; primary?: RotaAssignment };

type SidebarRow =
  | { kind: 'client'; key: string; clientName: string; postCount: number; marked: number; required: number }
  | { kind: 'post'; key: string; post: OperationalPost; stats: PostAttendanceStats };

const SHIFT_ICONS = { sun: Sun, sunset: Sunset, moon: Moon } as const;

// ─────────────────────────────────────────────────────────────────────────────
// QR approvals — collapsed by default
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `ApprovalQueue` renders a tall centred empty state when nothing is pending,
 * which put roughly 150px of "no pending check-ins" above the primary task on
 * every single visit. It is real work when it has items and pure cost when it
 * does not, and it does not expose a count, so disclosure is the honest fix:
 * one row when idle, full queue on demand.
 */
function CollapsibleApprovals() {
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Inbox className="h-4 w-4 text-[#D71920]" />
          QR Check-In Approvals
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {open ? 'Hide' : 'Review'}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      {open && (
        <div className="border-t px-4 pb-2">
          <ApprovalQueue />
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export function AttendanceManagement({ presetDate }: AttendanceManagementProps) {
  const [posts, setPosts] = useState<OperationalPost[]>([]);
  const [employees, setEmployees] = useState<HREmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDayLoading, setIsDayLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(presetDate ? parseISO(presetDate) : startOfDay(new Date()));
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [rota, setRota] = useState<RotaAssignment[]>([]);
  const [attendance, setAttendance] = useState<ShiftAttendance[]>([]);
  const [postSalaryRates, setPostSalaryRates] = useState<{ post_id: string; designation: string; monthly_salary: number }[]>([]);
  const [recentWork, setRecentWork] = useState<RecentWorkMap>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [postFilter, setPostFilter] = useState<PostFilter>('all');
  const [collapsedClients, setCollapsedClients] = useState<Set<string>>(new Set());
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [picker, setPicker] = useState<PickerIntent | null>(null);
  const [confirmBulk, setConfirmBulk] = useState<{ scope: 'post' | 'day'; slots: BulkAttendanceSlot[]; label: string } | null>(null);
  const [focusedSlotKey, setFocusedSlotKey] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const dateKey = format(selectedDate, 'yyyy-MM-dd');
  const today = useMemo(() => startOfDay(new Date()), []);
  const isToday = isSameDay(selectedDate, today);

  // ─── Data ──────────────────────────────────────────────────────────────────

  useEffect(() => { if (presetDate) setSelectedDate(startOfDay(parseISO(presetDate))); }, [presetDate]);

  useEffect(() => {
    const unsub = subscribeToOperationalPosts((ops) => {
      setPosts(ops.filter((p) =>
        p.workOrderStatus === 'In Progress' || p.workOrderStatus === 'Completed' ||
        p.workOrderStatus === 'in_progress' || p.workOrderStatus === 'completed' ||
        p.status === 'active'
      ));
      setIsLoading(false);
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
    })();
  }, []);

  /**
   * Last-30-day duty history, shown in the picker so swaps are informed.
   *
   * Branch-scoped like every other read in this module. Without the scope this
   * query would surface other branches' deployment history to the picker.
   */
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

  const loadDay = useCallback(async (key: string) => {
    const [r, a] = await Promise.all([getRotaAssignmentsForDate(key), getAttendanceForDate(key)]);
    return { rota: r.success ? r.data : [], attendance: a.success ? a.data : [] };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsDayLoading(true);
    (async () => {
      const { rota: r, attendance: a } = await loadDay(dateKey);
      if (cancelled) return;
      setRota(r);
      setAttendance(a);
      setIsDayLoading(false);
    })();
    return () => { cancelled = true; };
  }, [dateKey, loadDay]);

  /** Refresh marks only, to pick up server-assigned ids and `marked_at`. */
  const syncAttendance = useCallback(async () => {
    const a = await getAttendanceForDate(dateKey);
    if (a.success) setAttendance(a.data);
  }, [dateKey]);

  /**
   * Current marks, readable without becoming a dependency.
   *
   * The optimistic write needs the pre-write state to roll back to, but taking it
   * from the closure would make every mark-related callback — and therefore the
   * global key handler — tear down and re-register after each keystroke.
   */
  const attendanceRef = useRef<ShiftAttendance[]>([]);
  useEffect(() => { attendanceRef.current = attendance; }, [attendance]);

  // ─── Indexes ───────────────────────────────────────────────────────────────

  const rotaIndex: RotaIndex = useMemo(() => buildRotaIndex(rota), [rota]);
  const attendanceIndex: AttendanceIndex = useMemo(() => buildAttendanceIndex(attendance), [attendance]);

  /**
   * Employees with no pay rate from any source.
   *
   * Surfaced in the picker rather than used to filter, because a guard who
   * physically stood at a post was present whether or not payroll is configured.
   * Suppressing them would make attendance lie to protect a payroll gap.
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

  /**
   * Posts that need attention today: anything with a requirement for this
   * weekday, plus anything with a roster.
   *
   * The old screen listed only posts that had a roster, which hid exactly the
   * posts that most needed looking at — a post required to be staffed but never
   * rostered simply vanished from attendance.
   */
  const relevantPosts = useMemo(() => {
    const withRota = new Set(rota.map((r) => r.postId));
    return posts.filter((p) => {
      if (withRota.has(p.id || '')) return true;
      return SHIFTS.some((s) => SERVICE_TYPES_ORDERED.some((st) => getRequiredCount(p, s.key, st.key, selectedDate) > 0));
    });
  }, [posts, rota, selectedDate]);

  const statsByPost = useMemo(() => {
    const map = new Map<string, PostAttendanceStats>();
    for (const p of relevantPosts) {
      map.set(p.id || '', computePostAttendanceStats(p, selectedDate, rotaIndex, attendanceIndex));
    }
    return map;
  }, [relevantPosts, selectedDate, rotaIndex, attendanceIndex]);

  const summary = useMemo(() => {
    let totalSlots = 0, marked = 0, present = 0, absent = 0, partial = 0, vacant = 0, donePosts = 0, pendingPosts = 0, undeployedPosts = 0;
    for (const p of relevantPosts) {
      const s = statsByPost.get(p.id || '');
      if (!s) continue;
      totalSlots += s.totalRequired; marked += s.totalMarked; present += s.present;
      absent += s.absent; partial += s.partial; vacant += s.vacant;
      if (s.vacant > 0) undeployedPosts++;
      if (s.isComplete) donePosts++; else if (s.totalRequired > 0) pendingPosts++;
    }
    return { totalSlots, marked, present, absent, partial, vacant, donePosts, pendingPosts, undeployedPosts, totalPosts: relevantPosts.length };
  }, [relevantPosts, statsByPost]);

  // ─── Sidebar rows ──────────────────────────────────────────────────────────

  const sidebarRows = useMemo<SidebarRow[]>(() => {
    const term = searchTerm.trim().toLowerCase();

    const passesFilter = (s: PostAttendanceStats | undefined) => {
      if (!s) return false;
      if (postFilter === 'pending') return s.totalRequired > 0 && !s.isComplete;
      if (postFilter === 'done') return s.isComplete;
      if (postFilter === 'undeployed') return s.vacant > 0;
      return true;
    };

    const byClient = new Map<string, OperationalPost[]>();
    for (const p of relevantPosts) {
      const s = statsByPost.get(p.id || '');
      if (!passesFilter(s)) continue;
      if (term) {
        const hay = `${p.postName} ${p.clientName} ${p.postCode || ''} ${p.location?.city || ''}`.toLowerCase();
        if (!hay.includes(term)) continue;
      }
      const client = p.clientName || 'Unknown client';
      const bucket = byClient.get(client);
      if (bucket) bucket.push(p);
      else byClient.set(client, [p]);
    }

    const rows: SidebarRow[] = [];
    for (const clientName of Array.from(byClient.keys()).sort((a, b) => a.localeCompare(b))) {
      const clientPosts = byClient.get(clientName)!.sort((a, b) => a.postName.localeCompare(b.postName));
      let marked = 0, required = 0;
      for (const p of clientPosts) {
        const s = statsByPost.get(p.id || '');
        if (s) { marked += s.totalMarked + s.vacant; required += s.totalRequired; }
      }
      rows.push({ kind: 'client', key: `c:${clientName}`, clientName, postCount: clientPosts.length, marked, required });
      if (collapsedClients.has(clientName)) continue;
      for (const p of clientPosts) {
        rows.push({ kind: 'post', key: `p:${p.id}`, post: p, stats: statsByPost.get(p.id || '')! });
      }
    }
    return rows;
  }, [relevantPosts, statsByPost, searchTerm, postFilter, collapsedClients]);

  const visiblePosts = useMemo(
    () => sidebarRows.filter((r): r is Extract<SidebarRow, { kind: 'post' }> => r.kind === 'post').map((r) => r.post),
    [sidebarRows]
  );

  const selectedPost = useMemo(
    () => relevantPosts.find((p) => p.id === selectedPostId),
    [relevantPosts, selectedPostId]
  );

  /**
   * Keep a valid post selected.
   *
   * The old version seeded selection from `posts[0]` inside a subscription
   * callback, so it routinely selected a post that was not in the sidebar at all
   * and the detail panel disagreed with the list beside it.
   */
  useEffect(() => {
    if (selectedPostId && relevantPosts.some((p) => p.id === selectedPostId)) return;
    const firstPending = visiblePosts.find((p) => !statsByPost.get(p.id || '')?.isComplete);
    const next = firstPending || visiblePosts[0];
    setSelectedPostId(next?.id ?? null);
  }, [selectedPostId, relevantPosts, visiblePosts, statsByPost]);

  // ─── Slot resolution for the selected post ─────────────────────────────────

  /** Requirements for the selected post, grouped shift → service type. */
  const shiftGroups = useMemo(() => {
    if (!selectedPost) return [];
    const postId = selectedPost.id || '';
    return SHIFTS.map((shift) => {
      const groups = SERVICE_TYPES_ORDERED.map((st) => {
        const required = getRequiredCount(selectedPost, shift.key, st.key, selectedDate);
        if (required === 0) return null;
        const rotaList = rotaIndex.get(groupKey(postId, shift.key, st.key)) || [];
        const slots: ResolvedSlot[] = Array.from({ length: required }, (_, slotIndex) => {
          const att = attendanceIndex.get(slotKey(postId, shift.key, st.key, slotIndex));
          const rotaEmployee = rotaList[slotIndex];
          const status: AttendanceStatus = att?.status || 'pending';
          return {
            key: slotKey(postId, shift.key, st.key, slotIndex),
            postId, shiftKey: shift.key, serviceTypeKey: st.key, slotIndex,
            rotaEmployee,
            attendance: att,
            status,
            isUndeployed: !rotaEmployee && !att?.employeeId && status === 'pending',
          };
        });
        return { serviceType: st, required, slots };
      }).filter(Boolean) as { serviceType: typeof SERVICE_TYPES_ORDERED[number]; required: number; slots: ResolvedSlot[] }[];

      const configuredAnyDay = SERVICE_TYPES_ORDERED.some((st) => getRequiredCountAnyDay(selectedPost, shift.key, st.key) > 0);
      return { shift, groups, configuredAnyDay };
    }).filter((s) => s.groups.length > 0 || s.configuredAnyDay);
  }, [selectedPost, selectedDate, rotaIndex, attendanceIndex]);

  /** Flattened slot order, so keyboard traversal matches what is on screen. */
  const flatSlots = useMemo(
    () => shiftGroups.flatMap((sg) => sg.groups.flatMap((g) => g.slots)),
    [shiftGroups]
  );

  useEffect(() => {
    if (focusedSlotKey && flatSlots.some((s) => s.key === focusedSlotKey)) return;
    setFocusedSlotKey(flatSlots.find((s) => s.status === 'pending')?.key ?? flatSlots[0]?.key ?? null);
  }, [flatSlots, focusedSlotKey]);

  // ─── Writing marks ─────────────────────────────────────────────────────────

  const buildSlotPayload = useCallback((
    slot: SlotRef,
    status: AttendanceStatus,
    employee?: { id?: string; name?: string; code?: string },
    secondary?: { id?: string; name?: string; code?: string }
  ): BulkAttendanceSlot | null => {
    const post = posts.find((p) => p.id === slot.postId);
    if (!post) return null;
    return {
      attendanceDate: dateKey,
      postId: slot.postId,
      postName: post.postName,
      clientName: post.clientName,
      shiftKey: slot.shiftKey,
      serviceTypeKey: slot.serviceTypeKey,
      slotIndex: slot.slotIndex,
      employeeId: employee?.id,
      employeeName: employee?.name,
      employeeCode: employee?.code,
      secondaryEmployeeId: secondary?.id,
      secondaryEmployeeName: secondary?.name,
      secondaryEmployeeCode: secondary?.code,
      status,
    };
  }, [posts, dateKey]);

  /**
   * Write marks with an optimistic local update.
   *
   * Marking is the inner loop of this screen — a supervisor clicks it hundreds of
   * times — so the row must settle instantly rather than after a network round
   * trip. The previous state is captured first and restored verbatim on failure,
   * so a rejected write can never leave the UI claiming something the database
   * does not hold.
   */
  const commitSlots = useCallback(async (
    payloads: (BulkAttendanceSlot | null)[],
    opts: { successMessage?: string; showToast?: boolean } = {}
  ) => {
    const slots = payloads.filter((p): p is BulkAttendanceSlot => p !== null);
    if (slots.length === 0) return false;

    const previous = attendanceRef.current;
    setIsBusy(true);

    const optimistic = new Map(previous.map((a) => [slotKey(a.postId, a.shiftKey, a.serviceTypeKey, a.slotIndex), a]));
    for (const s of slots) {
      const k = slotKey(s.postId, s.shiftKey, s.serviceTypeKey, s.slotIndex);
      optimistic.set(k, {
        ...(optimistic.get(k) || {}),
        ...s,
        markedAt: new Date().toISOString(),
      } as ShiftAttendance);
    }
    setAttendance(Array.from(optimistic.values()));

    const result = await bulkUpsertAttendance(slots);
    setIsBusy(false);

    if (!result.success) {
      setAttendance(previous);
      toast({ title: 'Could not save', description: result.error || 'Attendance was not recorded.', variant: 'destructive' });
      return false;
    }

    if (opts.showToast !== false) {
      toast({
        title: opts.successMessage || `${slots.length} slot${slots.length > 1 ? 's' : ''} marked`,
        description: 'Undo is available for 12 hours from the row menu.',
      });
    }
    // Re-read so rows carry real ids and server timestamps, which undo depends on.
    void syncAttendance();
    return true;
  }, [toast, syncAttendance]);

  const markSlot = useCallback((slot: ResolvedSlot, status: AttendanceStatus) => {
    const emp = slot.rotaEmployee;
    const existing = slot.attendance;
    const employee = emp
      ? { id: emp.employeeId, name: emp.employeeName, code: emp.employeeCode }
      : { id: existing?.employeeId, name: existing?.employeeName, code: existing?.employeeCode };
    return commitSlots([buildSlotPayload(slot, status, employee)], { showToast: false });
  }, [buildSlotPayload, commitSlots]);

  /** Pending, rostered slots for a post — the ones a bulk action can legitimately touch. */
  const collectMarkableSlots = useCallback((post: OperationalPost, status: AttendanceStatus): BulkAttendanceSlot[] => {
    const postId = post.id || '';
    const out: BulkAttendanceSlot[] = [];
    for (const { key: shiftKey } of SHIFTS) {
      for (const { key: stKey } of SERVICE_TYPES_ORDERED) {
        const required = getRequiredCount(post, shiftKey, stKey, selectedDate);
        if (required === 0) continue;
        const rotaList = rotaIndex.get(groupKey(postId, shiftKey, stKey)) || [];
        for (let i = 0; i < required; i++) {
          const att = attendanceIndex.get(slotKey(postId, shiftKey, stKey, i));
          if (att && att.status !== 'pending') continue;   // never silently overwrite a decision
          const emp = rotaList[i];
          if (!emp) continue;                              // vacant slots need a person chosen first
          const payload = buildSlotPayload(
            { postId, shiftKey, serviceTypeKey: stKey, slotIndex: i },
            status,
            { id: emp.employeeId, name: emp.employeeName, code: emp.employeeCode }
          );
          if (payload) out.push(payload);
        }
      }
    }
    return out;
  }, [selectedDate, rotaIndex, attendanceIndex, buildSlotPayload]);

  const requestPostBulk = useCallback(() => {
    if (!selectedPost) return;
    const slots = collectMarkableSlots(selectedPost, 'present');
    if (slots.length === 0) {
      toast({ title: 'Nothing to mark', description: 'Every rostered slot at this post is already marked.' });
      return;
    }
    setConfirmBulk({ scope: 'post', slots, label: selectedPost.postName });
  }, [selectedPost, collectMarkableSlots, toast]);

  /**
   * Mark every remaining rostered slot across every visible post.
   *
   * The single biggest lever on this screen. Presence is the overwhelming norm,
   * so the efficient shape of the job is "confirm the norm everywhere, then
   * correct the handful of exceptions" — not "visit several hundred posts".
   * Scoped to the filtered/searched set so the blast radius is exactly what the
   * operator can see.
   */
  const requestDayBulk = useCallback(() => {
    const slots = visiblePosts.flatMap((p) => collectMarkableSlots(p, 'present'));
    if (slots.length === 0) {
      toast({ title: 'Nothing to mark', description: 'Every rostered slot in view is already marked.' });
      return;
    }
    const postCount = new Set(slots.map((s) => s.postId)).size;
    setConfirmBulk({ scope: 'day', slots, label: `${postCount} post${postCount > 1 ? 's' : ''} in view` });
  }, [visiblePosts, collectMarkableSlots, toast]);

  const handleUndo = useCallback(async (att: ShiftAttendance) => {
    if (!att.id) return;
    const result = await undoAttendance(att.id);
    if (result.success) {
      toast({ title: 'Reverted to pending' });
      void syncAttendance();
    } else {
      toast({ title: 'Cannot undo', description: result.error, variant: 'destructive' });
    }
  }, [toast, syncAttendance]);

  // ─── Picker-driven flows ───────────────────────────────────────────────────

  /** Who is already committed elsewhere on this shift, for conflict warnings. */
  const conflictsForShift = useCallback((shiftKey: string, postId: string) =>
    buildShiftConflictIndex(rota, shiftKey, postId), [rota]);

  const pickerCandidates = useMemo(() => {
    if (!picker) return [];
    const { slot } = picker;
    const excludeIds: string[] = [];
    if (picker.mode === 'half_day' || picker.mode === 'replace') {
      const primaryId = picker.primary?.employeeId;
      if (primaryId) excludeIds.push(primaryId);
    }
    // Anyone already rostered into this same group cannot fill a second slot in it.
    const group = rotaIndex.get(groupKey(slot.postId, slot.shiftKey, slot.serviceTypeKey)) || [];
    for (const r of group) {
      if (r.employeeId && !excludeIds.includes(r.employeeId)) excludeIds.push(r.employeeId);
    }
    return buildCandidates({
      employees,
      serviceTypeKey: slot.serviceTypeKey,
      excludeIds,
      conflicts: conflictsForShift(slot.shiftKey, slot.postId),
      missingSalaryIds,
    });
  }, [picker, employees, rotaIndex, conflictsForShift, missingSalaryIds]);

  const handlePickerSelect = useCallback(async (employee: HREmployee) => {
    if (!picker) return;
    const { slot } = picker;
    const chosen = { id: employee.id, name: employee.name, code: employee.employeeId };

    if (picker.mode === 'half_day') {
      const primary = picker.primary;
      const ok = await commitSlots([
        buildSlotPayload(
          slot, 'half_day',
          { id: primary?.employeeId, name: primary?.employeeName, code: primary?.employeeCode },
          chosen
        ),
      ], { successMessage: `Half-day split recorded with ${employee.name}` });
      if (ok) setPicker(null);
      return;
    }

    // mode === 'replace' — a different guard covered a slot that *was* deployed.
    // Permitted because the slot exists in the plan; only its occupant changed.
    const ok = await commitSlots(
      [buildSlotPayload(slot, 'present', chosen)],
      { successMessage: `${employee.name} recorded present in place of ${picker.primary?.employeeName ?? 'the rostered guard'}` }
    );
    if (ok) setPicker(null);
  }, [picker, buildSlotPayload, commitSlots]);

  /**
   * Hand off to Deployments for a post that has undeployed slots.
   *
   * The only route out of an undeployed slot. Carries the date so the operator
   * lands on the day they were marking rather than on today.
   */
  const deployPost = useCallback((postId: string) => {
    setSelectedPostId(postId);
    window.dispatchEvent(new CustomEvent('switchOpsTab', { detail: { tab: 'deployments', date: dateKey } }));
  }, [dateKey]);

  // ─── Navigation ────────────────────────────────────────────────────────────

  const jumpToNextPending = useCallback(() => {
    const order = visiblePosts;
    const currentIdx = order.findIndex((p) => p.id === selectedPostId);
    for (let step = 1; step <= order.length; step++) {
      const candidate = order[(currentIdx + step + order.length) % order.length];
      if (!candidate) continue;
      const s = statsByPost.get(candidate.id || '');
      if (s && s.totalRequired > 0 && !s.isComplete) {
        setSelectedPostId(candidate.id || null);
        return;
      }
    }
    toast({ title: 'All caught up', description: 'Every post in view is fully marked.' });
  }, [visiblePosts, selectedPostId, statsByPost, toast]);

  const stepPost = useCallback((delta: number) => {
    const idx = visiblePosts.findIndex((p) => p.id === selectedPostId);
    if (idx < 0) return;
    const next = visiblePosts[idx + delta];
    if (next) setSelectedPostId(next.id || null);
  }, [visiblePosts, selectedPostId]);

  const stepSlot = useCallback((delta: number) => {
    if (flatSlots.length === 0) return;
    const idx = flatSlots.findIndex((s) => s.key === focusedSlotKey);
    const nextIdx = Math.min(Math.max((idx < 0 ? 0 : idx) + delta, 0), flatSlots.length - 1);
    setFocusedSlotKey(flatSlots[nextIdx].key);
  }, [flatSlots, focusedSlotKey]);

  // ─── Keyboard ──────────────────────────────────────────────────────────────

  /**
   * Every value the handler reads is in its dependency list.
   *
   * The previous handler declared `[selectedPost, jumpToNextPending]` while
   * reading `rota` and `attendance`, so after the first mark the Enter shortcut
   * was acting on a stale snapshot and re-marking slots that had already moved on.
   */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement || el?.isContentEditable;

      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === 'Escape' && typing) { (el as HTMLElement).blur(); return; }
      if (typing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Dialogs own the keyboard while open.
      if (picker || confirmBulk || showShortcuts) return;

      const focused = flatSlots.find((s) => s.key === focusedSlotKey);

      switch (e.key) {
        case '?': e.preventDefault(); setShowShortcuts(true); break;
        case 'n': case 'N': e.preventDefault(); jumpToNextPending(); break;
        case 'j': case 'ArrowDown': e.preventDefault(); stepSlot(1); break;
        case 'k': case 'ArrowUp': e.preventDefault(); stepSlot(-1); break;
        case '[': e.preventDefault(); stepPost(-1); break;
        case ']': e.preventDefault(); stepPost(1); break;
        case 'p': case 'P':
          if (focused && !focused.isUndeployed) { e.preventDefault(); void markSlot(focused, 'present'); stepSlot(1); }
          break;
        case 'a': case 'A':
          if (focused && !focused.isUndeployed) { e.preventDefault(); void markSlot(focused, 'absent'); stepSlot(1); }
          break;
        case 'Enter': e.preventDefault(); requestPostBulk(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [flatSlots, focusedSlotKey, picker, confirmBulk, showShortcuts, jumpToNextPending, stepSlot, stepPost, markSlot, requestPostBulk]);

  // ─── Date strip ────────────────────────────────────────────────────────────

  /**
   * Today and the six days behind it.
   *
   * Attendance records the past; the server rejects future dates outright. The
   * old forward-facing strip made six of its seven shortcuts dead ends.
   */
  const dayPills = useMemo(() => Array.from({ length: 7 }, (_, i) => subDays(today, i)), [today]);

  // ─── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <div className="flex items-center justify-center h-96"><BrandLoader size="lg" message="Loading attendance..." /></div>;
  }

  const progressPct = summary.totalSlots > 0 ? ((summary.marked + summary.vacant) / summary.totalSlots) * 100 : 0;

  return (
    <div className="space-y-3">
      <CollapsibleApprovals />

      {/*
        Undeployed slots are the one thing this screen cannot resolve on its own.
        Surfacing the count up front stops an operator working down a list only to
        discover the last few posts are unmarkable.
      */}
      {summary.vacant > 0 && (
        <Card className="p-3 border-orange-200/60 bg-orange-50/60 dark:bg-orange-900/10">
          <div className="flex items-start gap-3 flex-wrap">
            <UserX className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-orange-800 dark:text-orange-300">
                <strong>{summary.vacant}</strong> required slot{summary.vacant > 1 ? 's' : ''} across{' '}
                <strong>{summary.undeployedPosts}</strong> post{summary.undeployedPosts > 1 ? 's' : ''} had nobody deployed
                on {format(selectedDate, 'dd MMM')}.
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Attendance can only be recorded against a deployed slot. Assign staff in Deployments to make these markable.
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-orange-300 text-orange-700 dark:border-orange-800 dark:text-orange-300" onClick={() => setPostFilter('undeployed')}>
                Show them
              </Button>
              <Button
                size="sm" variant="outline" className="h-7 text-xs gap-1"
                onClick={() => window.dispatchEvent(new CustomEvent('switchOpsTab', { detail: { tab: 'deployments', date: dateKey } }))}
              >
                <Shield className="h-3 w-3" />Open Deployments
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ═══ Command bar ═══ */}
      <Card className="p-3 sticky top-0 z-30 bg-white/90 dark:bg-gray-900/85 backdrop-blur-md">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <h3 className="font-bold text-base leading-tight">Attendance</h3>
              <p className="text-xs text-muted-foreground">
                {format(selectedDate, 'EEE, dd MMM yyyy')}
                {!isToday && <span className="ml-1 text-amber-600">· backdated</span>}
              </p>
            </div>

            <div className="flex gap-1 overflow-x-auto">
              {dayPills.map((day, idx) => {
                const active = isSameDay(day, selectedDate);
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      'flex flex-col items-center min-w-[44px] px-1.5 py-1 rounded-lg border transition-all',
                      active
                        ? 'bg-[#D71920] border-[#D71920] text-white shadow-[0_0_12px_rgba(215,25,32,0.35)]'
                        : 'bg-white/70 dark:bg-gray-800/70 border-gray-200/60 dark:border-gray-700/60 hover:border-[#D71920]/50'
                    )}
                    title={format(day, 'EEEE, dd MMM yyyy')}
                  >
                    <span className={cn('text-[10px] font-medium', active ? 'text-white/80' : 'text-muted-foreground')}>
                      {idx === 0 ? 'Today' : format(day, 'EEE')}
                    </span>
                    <span className="text-sm font-bold leading-tight">{format(day, 'dd')}</span>
                    <span className={cn('text-[10px]', active ? 'text-white/80' : 'text-muted-foreground')}>
                      {format(day, 'MMM')}
                    </span>
                  </button>
                );
              })}
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="px-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 text-muted-foreground hover:border-[#D71920]/50 hover:text-[#D71920]"
                    title="Pick an older date"
                    aria-label="Pick an older date"
                  >
                    <CalendarIcon className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => { if (d) { setSelectedDate(startOfDay(d)); setDatePickerOpen(false); } }}
                    disabled={(d) => d > today}
                    endMonth={today}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-300"
              onClick={requestDayBulk}
              disabled={isBusy || summary.totalSlots === 0}
              title="Mark every remaining rostered slot in view as present"
            >
              <Zap className="h-3.5 w-3.5" />Mark all in view present
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts (?)">
              <Keyboard className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Progress */}
        {summary.totalSlots > 0 && (
          <div className="mt-2.5">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-linear-to-r from-[#D71920] to-green-500 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-xs font-semibold tabular-nums whitespace-nowrap">
                {summary.marked}/{summary.totalSlots} marked
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs flex-wrap">
              <span className="flex items-center gap-1 text-green-600"><Check className="h-3 w-3" />{summary.present} present</span>
              <span className="flex items-center gap-1 text-red-600"><X className="h-3 w-3" />{summary.absent} absent</span>
              {summary.partial > 0 && <span className="flex items-center gap-1 text-amber-600">½ {summary.partial} partial</span>}
              {summary.vacant > 0 && (
                <button
                  onClick={() => setPostFilter('undeployed')}
                  className="flex items-center gap-1 text-orange-600 hover:underline"
                  title="Show only posts with slots that were never deployed"
                >
                  <UserX className="h-3 w-3" />{summary.vacant} not deployed
                </button>
              )}
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{summary.donePosts} posts done</span>
              <span className="text-muted-foreground">{summary.pendingPosts} pending</span>
            </div>
          </div>
        )}
      </Card>

      {/* ═══ Body ═══ */}
      {relevantPosts.length === 0 ? (
        <Card className="p-8 text-center border-amber-200 bg-amber-50/50 dark:bg-amber-900/10">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-amber-500" />
          <h3 className="font-semibold mb-1">Nothing scheduled</h3>
          <p className="text-sm text-muted-foreground">
            No post requires staff on {format(selectedDate, 'EEEE, dd MMM yyyy')}, and no roster exists for that date.
            Assign staff in Deployments to start marking attendance.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3 items-start">
          {/* ─── Sidebar ─── */}
          <Card className="overflow-hidden lg:sticky lg:top-[168px]">
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
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="px-2.5 py-2 border-b flex items-center justify-between gap-2">
              <div className="flex gap-1 flex-wrap">
                {([
                  ['all', `All ${summary.totalPosts}`],
                  ['pending', `Pending ${summary.pendingPosts}`],
                  ['done', `Done ${summary.donePosts}`],
                  ...(summary.undeployedPosts > 0
                    ? [['undeployed', `Not deployed ${summary.undeployedPosts}`] as [PostFilter, string]]
                    : []),
                ] as [PostFilter, string][]).map(([f, label]) => (
                  <button
                    key={f}
                    onClick={() => setPostFilter(f)}
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors',
                      postFilter === f
                        ? 'bg-[#D71920] text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-muted-foreground hover:bg-gray-200 dark:hover:bg-gray-700'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost" size="sm"
                className="h-6 px-1.5 text-[11px] gap-1 text-[#D71920] shrink-0"
                onClick={jumpToNextPending}
                title="Next pending post (N)"
              >
                <SkipForward className="h-3 w-3" />Next
              </Button>
            </div>

            {sidebarRows.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Search className="h-5 w-5 mx-auto mb-1.5" />
                No posts match this view
                <button className="block mx-auto mt-1.5 text-xs text-[#D71920] hover:underline" onClick={() => { setSearchTerm(''); setPostFilter('all'); }}>
                  Reset filters
                </button>
              </div>
            ) : (
              /* Windowed: several hundred posts render as a handful of DOM rows. */
              <VirtualList
                items={sidebarRows}
                height="calc(100vh - 340px)"
                estimateSize={62}
                overscan={8}
                getKey={(row) => row.key}
                renderItem={(row) => {
                  if (row.kind === 'client') {
                    const collapsed = collapsedClients.has(row.clientName);
                    const complete = row.required > 0 && row.marked >= row.required;
                    return (
                      <button
                        onClick={() => setCollapsedClients((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.clientName)) next.delete(row.clientName); else next.add(row.clientName);
                          return next;
                        })}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-2 bg-gray-50/70 dark:bg-gray-900/40 border-y border-gray-100 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors text-left"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform', collapsed && '-rotate-90')} />
                          <Building2 className="h-3.5 w-3.5 text-[#D71920] shrink-0" />
                          <span className="font-semibold text-xs truncate">{row.clientName}</span>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{row.postCount}</Badge>
                        </div>
                        {complete
                          ? <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                          : <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{row.marked}/{row.required}</span>}
                      </button>
                    );
                  }

                  const { post, stats } = row;
                  const selected = post.id === selectedPostId;
                  const pct = stats.totalRequired > 0 ? ((stats.totalMarked + stats.vacant) / stats.totalRequired) * 100 : 0;
                  return (
                    <button
                      onClick={() => setSelectedPostId(post.id || null)}
                      className={cn(
                        'w-full text-left px-2.5 py-2 mx-1 my-0.5 rounded-lg transition-all',
                        selected
                          ? 'bg-[#D71920]/10 ring-1 ring-[#D71920]/30'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      )}
                      aria-current={selected}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-xs truncate">{post.postName}</span>
                        <span className="flex items-center gap-1 shrink-0">
                          {stats.absent > 0 && <span className="text-[10px] text-red-600 tabular-nums">{stats.absent}✗</span>}
                          {stats.vacant > 0 && (
                            <span title={`${stats.vacant} slot(s) never deployed — cannot be marked`} className="flex items-center">
                              <UserX className="h-3 w-3 text-orange-500" />
                            </span>
                          )}
                          {stats.isComplete
                            ? <Check className="h-3.5 w-3.5 text-green-600" />
                            : <span className="text-[10px] font-medium text-amber-600 tabular-nums">{stats.totalMarked}/{stats.totalRequired}</span>}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                        <MapPin className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{post.location?.city || post.location?.address || 'No location'}</span>
                      </div>
                      {stats.totalRequired > 0 && (
                        <div className="mt-1 h-0.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all', stats.isComplete ? 'bg-green-500' : 'bg-amber-500')}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </button>
                  );
                }}
              />
            )}
          </Card>

          {/* ─── Marking panel ─── */}
          <Card className="overflow-hidden">
            {!selectedPost ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Users className="h-12 w-12 text-muted-foreground mb-3" />
                <h4 className="font-semibold">Select a post</h4>
                <p className="text-sm text-muted-foreground mt-1">Choose a post on the left to mark attendance</p>
              </div>
            ) : (
              <div>
                <div className="p-3.5 border-b bg-linear-to-r from-[#D71920]/5 to-transparent flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <h4 className="font-bold text-base truncate">{selectedPost.postName}</h4>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{selectedPost.clientName}</span>
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{selectedPost.location?.city || selectedPost.location?.address || 'No location'}</span>
                      {selectedPost.postCode && <Badge variant="outline" className="text-[10px]">{selectedPost.postCode}</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm" variant="outline"
                      className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-300"
                      onClick={requestPostBulk}
                      disabled={isBusy}
                      title="Mark all remaining rostered slots at this post present (Enter)"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />All present
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={jumpToNextPending} title="Next pending post (N)">
                      <SkipForward className="h-3.5 w-3.5" />Next
                    </Button>
                  </div>
                </div>

                {isDayLoading ? (
                  <div className="py-16 flex justify-center"><BrandLoader message="Loading roster..." /></div>
                ) : shiftGroups.length === 0 ? (
                  <div className="py-16 text-center px-6">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium">No shifts scheduled on {format(selectedDate, 'EEEE')}</p>
                    <p className="text-xs text-muted-foreground mt-1">This post's service days exclude {format(selectedDate, 'EEE')}.</p>
                  </div>
                ) : (
                  <div className="p-3 space-y-3 max-h-[calc(100vh-330px)] overflow-y-auto">
                    {shiftGroups.map(({ shift, groups, configuredAnyDay }) => {
                      const ShiftIcon = SHIFT_ICONS[shift.iconName];

                      if (groups.length === 0 && configuredAnyDay) {
                        return (
                          <div key={shift.key} className="rounded-lg border border-dashed bg-gray-50/50 dark:bg-gray-900/20 px-3.5 py-2.5 flex items-center gap-2">
                            <ShiftIcon className={cn('h-4 w-4 opacity-40', shift.color)} />
                            <span className="font-semibold text-sm text-muted-foreground">{shift.label}</span>
                            <span className="text-xs text-muted-foreground">{shift.time}</span>
                            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-muted-foreground font-medium">
                              Not scheduled {format(selectedDate, 'EEE')}
                            </span>
                          </div>
                        );
                      }

                      const shiftSlots = groups.flatMap((g) => g.slots);
                      const shiftMarked = shiftSlots.filter((s) => s.status !== 'pending').length;

                      return (
                        <div key={shift.key} className="rounded-lg border overflow-hidden">
                          <div className="flex items-center justify-between px-3.5 py-2 bg-white dark:bg-gray-800 border-b gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <ShiftIcon className={cn('h-4 w-4 shrink-0', shift.color)} />
                              <span className="font-semibold text-sm">{shift.label}</span>
                              <span className="text-xs text-muted-foreground hidden sm:inline">{shift.time}</span>
                            </div>
                            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                              {shiftMarked}/{shiftSlots.length}
                            </span>
                          </div>

                          <div className="divide-y bg-gray-50/50 dark:bg-gray-900/30">
                            {groups.map(({ serviceType, required, slots }) => {
                              const pendingRostered = slots.filter((s) => s.status === 'pending' && s.rotaEmployee);
                              return (
                                <div key={serviceType.key} className="p-2.5">
                                  <div className="flex items-center justify-between mb-1.5 gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <Badge className={cn('text-[11px]', serviceType.color)}>{serviceType.label}</Badge>
                                      <span className="text-[11px] text-muted-foreground">{required} required</span>
                                    </div>
                                    {/* Available whenever anything is left, not only when nothing is marked. */}
                                    {pendingRostered.length > 0 && (
                                      <Button
                                        size="sm" variant="outline"
                                        className="h-6 text-[11px] gap-1 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-300 shrink-0"
                                        disabled={isBusy}
                                        onClick={() => void commitSlots(
                                          pendingRostered.map((s) => buildSlotPayload(s, 'present', {
                                            id: s.rotaEmployee?.employeeId, name: s.rotaEmployee?.employeeName, code: s.rotaEmployee?.employeeCode,
                                          })),
                                          { successMessage: `${pendingRostered.length} marked present` }
                                        )}
                                      >
                                        <Check className="h-3 w-3" />
                                        {pendingRostered.length === slots.length ? 'All present' : `${pendingRostered.length} present`}
                                      </Button>
                                    )}
                                  </div>

                                  <div className="space-y-1.5">
                                    {slots.map((slot) => (
                                      <SlotRow
                                        key={slot.key}
                                        slot={slot}
                                        focused={slot.key === focusedSlotKey}
                                        busy={isBusy}
                                        onFocus={() => setFocusedSlotKey(slot.key)}
                                        onMark={(status) => void markSlot(slot, status)}
                                        onUndo={() => slot.attendance && void handleUndo(slot.attendance)}
                                        onHalfDay={() => setPicker({ mode: 'half_day', slot, primary: slot.rotaEmployee })}
                                        onReplace={() => setPicker({ mode: 'replace', slot, primary: slot.rotaEmployee })}
                                        onDeploy={() => deployPost(selectedPost.id || '')}
                                      />
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ═══ Picker dialog: half-day / replace / fill ═══ */}
      <Dialog open={!!picker} onOpenChange={(open) => { if (!open) setPicker(null); }}>
        <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden">
          {picker && (() => {
            const serviceLabel = getServiceLabel(picker.slot.serviceTypeKey);
            const title =
              picker.mode === 'half_day' ? 'Half-day swap'
              : picker.mode === 'replace' ? 'Replace rostered guard'
              : 'Assign someone to this slot';
            const description =
              picker.mode === 'half_day'
                ? `Choose who covers the second half of the ${picker.slot.shiftKey} shift.`
                : picker.mode === 'replace'
                ? `Record a different guard as present in place of the rostered one.`
                : `Nobody was rostered for this ${serviceLabel.toLowerCase()} slot. Choose who actually covered it.`;

            return (
              <>
                <DialogHeader className="p-4 pb-3 border-b">
                  <DialogTitle className="text-base">{title}</DialogTitle>
                  <DialogDescription className="text-xs">{description}</DialogDescription>
                </DialogHeader>

                {(picker.mode === 'half_day' || picker.mode === 'replace') && picker.primary && (
                  <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border-b flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#D71920]/10 text-[#D71920] flex items-center justify-center text-xs font-semibold shrink-0">
                      {initialsOf(picker.primary.employeeName)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {picker.mode === 'half_day' ? 'First half' : 'Rostered (being replaced)'}
                      </p>
                      <p className="text-sm font-medium truncate">
                        {picker.primary.employeeName}
                        <span className="text-muted-foreground font-normal ml-1.5 font-mono text-xs">{picker.primary.employeeCode}</span>
                      </p>
                    </div>
                  </div>
                )}

                <EmployeePickerList
                  candidates={pickerCandidates}
                  serviceTypeKey={picker.slot.serviceTypeKey}
                  onSelect={handlePickerSelect}
                  recentWork={recentWork}
                  maxHeight={360}
                  emptyMessage="No active employees on record"
                />
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ═══ Bulk confirmation ═══ */}
      <Dialog open={!!confirmBulk} onOpenChange={(open) => { if (!open) setConfirmBulk(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />Confirm bulk marking
            </DialogTitle>
            <DialogDescription className="text-sm">
              Mark <strong>{confirmBulk?.slots.length ?? 0}</strong> rostered slot
              {(confirmBulk?.slots.length ?? 0) > 1 ? 's' : ''} as <strong>present</strong> across{' '}
              <strong>{confirmBulk?.label}</strong> for {format(selectedDate, 'dd MMM yyyy')}.
            </DialogDescription>
          </DialogHeader>
          <div className="text-xs text-muted-foreground space-y-1 py-1">
            <p className="flex items-start gap-1.5">
              <Check className="h-3.5 w-3.5 text-green-600 mt-px shrink-0" />
              Slots you already marked are left untouched.
            </p>
            <p className="flex items-start gap-1.5">
              <Ban className="h-3.5 w-3.5 text-orange-500 mt-px shrink-0" />
              Slots with nobody rostered are skipped — assign a person first.
            </p>
            <p className="flex items-start gap-1.5">
              <RotateCcw className="h-3.5 w-3.5 text-muted-foreground mt-px shrink-0" />
              Each row can be undone for 12 hours.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmBulk(null)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={isBusy}
              onClick={async () => {
                const batch = confirmBulk;
                setConfirmBulk(null);
                if (batch) {
                  await commitSlots(batch.slots, { successMessage: `${batch.slots.length} slots marked present` });
                }
              }}
            >
              <Check className="h-4 w-4 mr-1" />Mark present
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Shortcuts ═══ */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Keyboard className="h-4 w-4 text-[#D71920]" />Keyboard shortcuts
            </DialogTitle>
            <DialogDescription className="text-sm">
              Attendance is repetitive by nature. These keep both hands off the mouse.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            {[
              ['P', 'Mark focused row present, then advance'],
              ['A', 'Mark focused row absent, then advance'],
              ['J / ↓', 'Focus next row'],
              ['K / ↑', 'Focus previous row'],
              ['Enter', 'Mark all remaining at this post present'],
              ['N', 'Jump to next pending post'],
              ['[ / ]', 'Previous / next post'],
              ['/', 'Focus the post search'],
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
              <strong className="text-foreground">Fastest path:</strong> use <kbd className="px-1 rounded bg-gray-100 dark:bg-gray-800 border text-[10px] font-mono">Mark all in view present</kbd>,
              then correct the exceptions with <kbd className="px-1 rounded bg-gray-100 dark:bg-gray-800 border text-[10px] font-mono">A</kbd>.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Slot row
// ─────────────────────────────────────────────────────────────────────────────

interface SlotRowProps {
  slot: ResolvedSlot;
  focused: boolean;
  busy: boolean;
  onFocus: () => void;
  onMark: (status: AttendanceStatus) => void;
  onUndo: () => void;
  onHalfDay: () => void;
  onReplace: () => void;
  onDeploy: () => void;
}

/**
 * One required slot.
 *
 * Three distinct situations share this row, and the old version only handled the
 * first: a deployed guard awaiting a decision, an already-marked slot, and a
 * required slot nobody was deployed to. The third rendered a dead "No employee"
 * label with no control of any kind; it now states plainly why it cannot be
 * marked and offers the one action that resolves it.
 */
function SlotRow({ slot, focused, busy, onFocus, onMark, onUndo, onHalfDay, onReplace, onDeploy }: SlotRowProps) {
  const meta = ATTENDANCE_STATUS_META[slot.status];
  const emp = slot.rotaEmployee;
  const att = slot.attendance;
  const displayName = emp?.employeeName || att?.employeeName;
  const displayCode = emp?.employeeCode || att?.employeeCode;
  const canUndo = att?.markedAt ? canUndoAttendance(att.markedAt) : false;
  const isMarked = slot.status !== 'pending';

  return (
    <div
      onMouseEnter={onFocus}
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg border p-2 transition-colors',
        slot.isUndeployed
          ? 'bg-orange-50/70 border-orange-200 border-dashed dark:bg-orange-900/10 dark:border-orange-900'
          : meta.rowClass,
        focused && 'ring-2 ring-[#D71920]/40'
      )}
    >
      {/* Identity */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0',
          slot.isUndeployed ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300' : meta.avatarClass
        )}>
          {slot.isUndeployed ? <UserX className="h-4 w-4" /> : initialsOf(displayName)}
        </div>
        <div className="min-w-0">
          {slot.isUndeployed ? (
            <>
              <div className="text-sm font-medium text-orange-700 dark:text-orange-300">Not deployed</div>
              <div className="text-[11px] text-muted-foreground">
                Slot {slot.slotIndex + 1} · nobody was scheduled, so there is nothing to mark
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-medium truncate">
                {displayName || <span className="italic text-muted-foreground">Unassigned</span>}
              </div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                {displayCode && <span className="font-mono">{displayCode}</span>}
                {att?.secondaryEmployeeName && (
                  <span className="text-amber-700 dark:text-amber-400">
                    + {att.secondaryEmployeeName} (2nd half)
                  </span>
                )}
                {isMarked && att?.markedBy && <span className="hidden sm:inline">· by {att.markedBy}</span>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {slot.isUndeployed ? (
          /*
            No marking controls at all. This slot was never deployed, so there is
            no duty to attest to — recording one here would create billable,
            payable work that nobody scheduled. The only correct move is to go and
            deploy someone, so that is the only action offered.
          */
          <Button
            size="sm" variant="outline"
            className="h-7 text-[11px] gap-1 border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-800 dark:text-orange-300"
            onClick={onDeploy}
          >
            <Shield className="h-3 w-3" />Deploy in Deployments
          </Button>
        ) : !isMarked ? (
          <>
            <button
              onClick={() => onMark('present')}
              disabled={busy}
              className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 transition-colors disabled:opacity-50"
              title="Mark present (P)"
            >
              Present
            </button>
            <button
              onClick={() => onMark('absent')}
              disabled={busy}
              className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 transition-colors disabled:opacity-50"
              title="Mark absent (A)"
            >
              Absent
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" aria-label={`More actions for ${displayName || 'this slot'}`}>
                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={onHalfDay}>
                  <Users className="h-4 w-4 mr-2 text-amber-600" />Half-day swap…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onMark('half_vacant')}>
                  <AlertTriangle className="h-4 w-4 mr-2 text-orange-600" />Half-day vacant
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onReplace}>
                  <UserPlus className="h-4 w-4 mr-2 text-blue-600" />Someone else covered…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            <Badge className={cn('text-[11px]', meta.badgeClass)}>
              {meta.short} {meta.label}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" aria-label={`Change mark for ${displayName || 'this slot'}`}>
                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Amend this mark
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {slot.status !== 'present' && (
                  <DropdownMenuItem onClick={() => onMark('present')}>
                    <Check className="h-4 w-4 mr-2 text-green-600" />Change to present
                  </DropdownMenuItem>
                )}
                {slot.status !== 'absent' && (
                  <DropdownMenuItem onClick={() => onMark('absent')}>
                    <X className="h-4 w-4 mr-2 text-red-600" />Change to absent
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={onHalfDay}>
                  <Users className="h-4 w-4 mr-2 text-amber-600" />Half-day swap…
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onReplace}>
                  <UserPlus className="h-4 w-4 mr-2 text-blue-600" />Someone else covered…
                </DropdownMenuItem>
                {canUndo && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onUndo}>
                      <RotateCcw className="h-4 w-4 mr-2 text-muted-foreground" />Undo (back to pending)
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </div>
  );
}
