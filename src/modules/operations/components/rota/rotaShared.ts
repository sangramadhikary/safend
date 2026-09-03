'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Shared rota domain logic — Deployments + Attendance
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Deployments and Attendance are two views of one thing: which guard stands at
 * which post, on which shift, on which day. They had drifted into two private
 * copies of that model, and the copies disagreed.
 *
 * The disagreement was not cosmetic. Deployments matched an employee to a service
 * type with a fuzzy comparison; Attendance used `===` against a UI label. HR
 * writes "Unarmed Guards" from its dropdown but "Unarmed Guard" from CSV import,
 * so the strict comparison found nobody, and every Attendance flow that needed a
 * list of candidates (half-day swap, replace, filling a vacant slot) rendered an
 * empty dropdown with no explanation. This module is the single definition both
 * screens now read from.
 *
 * Three ideas carry the design:
 *
 *   1. DESIGNATION MATCHING IS WORD-BASED, NOT SUBSTRING-BASED. "unarmed"
 *      contains "armed", so any `includes` test conflates the two most
 *      safety-relevant categories in the business. Matching compares sets of
 *      normalised words instead.
 *
 *   2. AN EMPLOYEE RESOLVES TO EXACTLY ONE CATEGORY. Overlapping predicates
 *      would let one guard appear in two pickers and be double-booked.
 *
 *   3. A CANDIDATE LIST IS NEVER SILENTLY EMPTY. Free-text designations that
 *      resolve to nothing are surfaced as "unrecognised", not hidden. Hiding
 *      staff is what produced the original bug report; an operator needs to see
 *      that someone exists and why they were ranked lower.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { HREmployee } from '@/services/supabase/HREmployeeService';
import type { OperationalPost } from '@/services/supabase/OperationalPostService';
import type { RotaAssignment, ShiftAttendance, AttendanceStatus } from '@/services/supabase/RotaAttendanceService';

// ─────────────────────────────────────────────────────────────────────────────
// Shifts
// ─────────────────────────────────────────────────────────────────────────────

export interface ShiftDef {
  key: string;
  label: string;
  time: string;
  /** Lucide icon name, resolved by the consuming component. */
  iconName: 'sun' | 'sunset' | 'moon';
  color: string;
  /** Tailwind classes for a filled chip in this shift's colour. */
  chipClass: string;
}

export const SHIFTS: ShiftDef[] = [
  { key: 'day', label: 'Day', time: '06:00 – 14:00', iconName: 'sun', color: 'text-amber-500', chipClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  { key: 'afternoon', label: 'Afternoon', time: '14:00 – 22:00', iconName: 'sunset', color: 'text-orange-500', chipClass: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
  { key: 'night', label: 'Night', time: '22:00 – 06:00', iconName: 'moon', color: 'text-indigo-500', chipClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300' },
];

export const SHIFT_KEYS = SHIFTS.map((s) => s.key);

// ─────────────────────────────────────────────────────────────────────────────
// Designation normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reduce a designation to a set of comparable words.
 *
 * Punctuation and separators become spaces, and a trailing plural "s" is removed
 * per word so "Guards" and "Guard" collapse together. Words are kept discrete
 * rather than concatenated, which is what makes the armed/unarmed distinction
 * survivable — see {@link SERVICE_TYPES}.
 */
export function designationWords(designation?: string | null): Set<string> {
  if (!designation) return new Set();
  return new Set(
    designation
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
      // Singularise, but never shorten a 2-letter token ("ps" -> "ps").
      .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
  );
}

export interface ServiceTypeDef {
  key: string;
  /** Human label shown in the UI. */
  label: string;
  /** Canonical designation string written by the HR employee form. */
  designation: string;
  color: string;
  /** Solid dot colour for compact indicators. */
  dot: string;
  /**
   * Does this set of designation words identify this service type?
   *
   * Written as predicates rather than alias lists because the categories are not
   * mutually distinguishable by substring: "unarmed guard" and "armed guard"
   * share every word but one, and that one word is the whole distinction.
   */
  matches: (words: Set<string>) => boolean;
}

/**
 * Service types in **specificity order**, most specific first.
 *
 * {@link resolveServiceTypeKey} returns the first match, so a plain "Security
 * Guard" falls through to the unarmed bucket only after every armed, supervisory
 * and specialist reading has been ruled out. Reordering this array changes
 * business behaviour.
 */
export const SERVICE_TYPES: ServiceTypeDef[] = [
  {
    key: 'armedGuards',
    label: 'Armed Guards',
    designation: 'Armed Guards',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    dot: 'bg-red-500',
    // "unarmed" normalises to the word `unarmed`, never `armed`, so a bare
    // `has('armed')` cannot capture an unarmed guard.
    matches: (w) => w.has('armed') || w.has('gunman') || w.has('gunner') || w.has('rifleman'),
  },
  {
    key: 'supervisors',
    label: 'Supervisors',
    designation: 'Supervisors',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    dot: 'bg-purple-500',
    matches: (w) => w.has('supervisor') || w.has('spv') || w.has('incharge') || (w.has('shift') && w.has('lead')),
  },
  {
    key: 'patrolOfficers',
    label: 'Patrol Officers',
    designation: 'Patrol Officers',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    dot: 'bg-amber-500',
    matches: (w) => w.has('patrol') || w.has('patrolling') || w.has('rounder'),
  },
  {
    // Current key sold by SecurityPostsEditor. Must precede the retired
    // `personalSecurity` entry so a PSO designation resolves to the live key.
    key: 'pso',
    label: 'PSO',
    designation: 'PSO',
    color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
    dot: 'bg-teal-500',
    matches: (w) => w.has('pso') || w.has('personal') || w.has('bodyguard') || (w.has('close') && w.has('protection')),
  },
  {
    // Current key. Precedes the retired `eventSecurity` entry for the same reason.
    key: 'bouncers',
    label: 'Bouncers',
    designation: 'Bouncers',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    dot: 'bg-orange-500',
    matches: (w) => w.has('bouncer') || w.has('crowd'),
  },
  {
    // Non-security roles sold on the same work order. A post may staff several
    // distinct manpower roles (Driver, Cook, Housekeeping); they share this one
    // key and are distinguished by `ServiceInstance.manpowerRole`.
    key: 'manpower',
    label: 'Manpower',
    designation: 'Manpower',
    color: 'bg-slate-100 text-slate-800 dark:bg-slate-800/40 dark:text-slate-300',
    dot: 'bg-slate-500',
    matches: (w) =>
      w.has('manpower') || w.has('driver') || w.has('cook') || w.has('housekeeping') ||
      w.has('housekeeper') || w.has('attendant') || w.has('caretaker') || w.has('peon') ||
      w.has('electrician') || w.has('plumber') || w.has('gardener') || w.has('sweeper') ||
      w.has('helper') || w.has('cleaner'),
  },
  {
    // Retired: no longer offered, kept so historical posts still render.
    key: 'personalSecurity',
    label: 'Personal Security',
    designation: 'Personal Security',
    color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
    dot: 'bg-indigo-500',
    matches: () => false,
  },
  {
    // Retired: no longer offered, kept so historical posts still render.
    key: 'eventSecurity',
    label: 'Event Security',
    designation: 'Event Security',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    dot: 'bg-green-500',
    matches: (w) => w.has('event'),
  },
  {
    key: 'unarmedGuards',
    label: 'Unarmed Guards',
    designation: 'Unarmed Guards',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    dot: 'bg-blue-500',
    // Deliberately last and deliberately broad: an unqualified guard is unarmed.
    matches: (w) => w.has('unarmed') || w.has('guard') || w.has('gaurd') || w.has('sentry') || w.has('watchman'),
  },
];

/**
 * Display order for the UI, independent of the matching precedence above.
 *
 * This list is what Deployments and AttendanceManagement iterate, so a key
 * missing here is a service the rota cannot render at all. It previously omitted
 * `pso`, `bouncers` and `manpower` — those work-order services showed as an empty
 * post in the deployment view. Retired keys stay last so historical posts render.
 */
export const SERVICE_TYPES_DISPLAY_ORDER = [
  'unarmedGuards', 'armedGuards', 'supervisors', 'patrolOfficers',
  'pso', 'bouncers', 'manpower',
  'eventSecurity', 'personalSecurity',
];

export const SERVICE_TYPES_ORDERED: ServiceTypeDef[] = SERVICE_TYPES_DISPLAY_ORDER
  .map((k) => SERVICE_TYPES.find((s) => s.key === k)!)
  .filter(Boolean);

export const getServiceType = (key: string): ServiceTypeDef | undefined =>
  SERVICE_TYPES.find((s) => s.key === key);

export const getServiceLabel = (key: string): string => getServiceType(key)?.label ?? key;

/**
 * Which single service type does this designation belong to?
 *
 * Returns `null` for free-text HR data that matches nothing. Callers must treat
 * `null` as "unrecognised, still a real employee" rather than "not eligible" —
 * excluding them is what made the swap/replace pickers appear broken.
 */
export function resolveServiceTypeKey(designation?: string | null): string | null {
  const words = designationWords(designation);
  if (words.size === 0) return null;
  for (const st of SERVICE_TYPES) {
    if (st.matches(words)) return st.key;
  }
  return null;
}

/** Strict eligibility: the employee's designation resolves to exactly this service type. */
export function matchesServiceType(designation: string | null | undefined, serviceTypeKey: string): boolean {
  return resolveServiceTypeKey(designation) === serviceTypeKey;
}

export const isActiveEmployee = (emp: HREmployee): boolean =>
  (emp.status || '').toLowerCase() === 'active';

// ─────────────────────────────────────────────────────────────────────────────
// Candidate ranking
// ─────────────────────────────────────────────────────────────────────────────

export type CandidateTier = 'exact' | 'unrecognised' | 'other';

export interface Candidate {
  employee: HREmployee;
  /**
   * `exact` — designation resolves to the requested service type.
   * `unrecognised` — designation resolves to nothing; eligibility unknown.
   * `other` — qualified for a different service type.
   */
  tier: CandidateTier;
  /** Already on duty somewhere else on this date+shift. Assignable, but flagged. */
  conflict?: { postName: string; shiftKey: string };
  /** No salary configured, so payroll cannot price this duty. */
  missingSalary?: boolean;
}

export interface BuildCandidatesArgs {
  employees: HREmployee[];
  serviceTypeKey: string;
  /** Employee ids to omit entirely (already in this slot group). */
  excludeIds?: string[];
  /** employeeId -> where they are already deployed on this date+shift. */
  conflicts?: Map<string, { postName: string; shiftKey: string }>;
  /** employeeId -> true when neither a personal nor a post salary rate exists. */
  missingSalaryIds?: Set<string>;
  /** Include employees qualified for other service types. Default true. */
  includeOtherDesignations?: boolean;
}

/**
 * Build a ranked, tiered candidate list for a slot.
 *
 * Every active employee who is not explicitly excluded appears somewhere in the
 * result. Suitability is expressed as ordering and tier, not as omission — an
 * operator covering an unstaffed post at 22:00 needs to see that a
 * differently-designated guard exists and decide for themselves.
 */
export function buildCandidates({
  employees,
  serviceTypeKey,
  excludeIds = [],
  conflicts,
  missingSalaryIds,
  includeOtherDesignations = true,
}: BuildCandidatesArgs): Candidate[] {
  const excluded = new Set(excludeIds.filter(Boolean));

  const candidates: Candidate[] = [];
  for (const emp of employees) {
    const id = emp.id || '';
    if (!id || excluded.has(id)) continue;
    if (!isActiveEmployee(emp)) continue;

    const resolved = resolveServiceTypeKey(emp.designation);
    const tier: CandidateTier = resolved === serviceTypeKey ? 'exact' : resolved === null ? 'unrecognised' : 'other';
    if (tier === 'other' && !includeOtherDesignations) continue;

    candidates.push({
      employee: emp,
      tier,
      conflict: conflicts?.get(id),
      missingSalary: missingSalaryIds?.has(id) || undefined,
    });
  }

  const tierRank: Record<CandidateTier, number> = { exact: 0, unrecognised: 1, other: 2 };
  candidates.sort((a, b) => {
    if (tierRank[a.tier] !== tierRank[b.tier]) return tierRank[a.tier] - tierRank[b.tier];
    // A free guard outranks one who would have to be pulled off another post.
    const aConflict = a.conflict ? 1 : 0;
    const bConflict = b.conflict ? 1 : 0;
    if (aConflict !== bConflict) return aConflict - bConflict;
    const aSalary = a.missingSalary ? 1 : 0;
    const bSalary = b.missingSalary ? 1 : 0;
    if (aSalary !== bSalary) return aSalary - bSalary;
    return a.employee.name.localeCompare(b.employee.name);
  });

  return candidates;
}

export function filterCandidates(candidates: Candidate[], search: string): Candidate[] {
  const q = search.trim().toLowerCase();
  if (!q) return candidates;
  return candidates.filter(({ employee: e }) =>
    e.name.toLowerCase().includes(q) ||
    (e.employeeId || '').toLowerCase().includes(q) ||
    (e.phone || '').includes(q) ||
    (e.designation || '').toLowerCase().includes(q)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Requirement maths
// ─────────────────────────────────────────────────────────────────────────────

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/**
 * How many people this post needs for one shift + service type on a given date.
 *
 * Honours each service instance's `serviceDays` map: an absent map means every
 * day is active, an explicit `false` excludes that weekday.
 */
export function getRequiredCount(
  post: OperationalPost | undefined,
  shiftKey: string,
  serviceTypeKey: string,
  date: Date
): number {
  if (!post?.serviceInstances) return 0;
  const instances = (post.serviceInstances as any)[serviceTypeKey] || [];
  const dayKey = DAY_KEYS[date.getDay()];
  return instances.reduce((sum: number, inst: any) => {
    if (inst?.serviceDays && inst.serviceDays[dayKey] === false) return sum;
    const shift = inst?.shifts?.[shiftKey];
    return sum + (shift?.enabled ? (shift.quantity || 0) : 0);
  }, 0);
}

/** Requirement ignoring `serviceDays`, used to say "configured, but not today". */
export function getRequiredCountAnyDay(
  post: OperationalPost | undefined,
  shiftKey: string,
  serviceTypeKey: string
): number {
  if (!post?.serviceInstances) return 0;
  const instances = (post.serviceInstances as any)[serviceTypeKey] || [];
  return instances.reduce((sum: number, inst: any) => {
    const shift = inst?.shifts?.[shiftKey];
    return sum + (shift?.enabled ? (shift.quantity || 0) : 0);
  }, 0);
}

export interface ShiftRequirement {
  shiftKey: string;
  serviceTypeKey: string;
  required: number;
}

/** Every non-zero requirement for a post on a date, flattened. */
export function getPostRequirements(post: OperationalPost | undefined, date: Date): ShiftRequirement[] {
  const out: ShiftRequirement[] = [];
  for (const { key: shiftKey } of SHIFTS) {
    for (const { key: serviceTypeKey } of SERVICE_TYPES_ORDERED) {
      const required = getRequiredCount(post, shiftKey, serviceTypeKey, date);
      if (required > 0) out.push({ shiftKey, serviceTypeKey, required });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Both screens previously answered "what is in this slot?" with
 * `array.find(...)`, inside a loop over posts × 3 shifts × 6 service types. At a
 * few dozen posts that is invisible; at the several hundred this system is built
 * for it is a full scan of every attendance row for every one of ~18 cells of
 * every post, on every keystroke in the search box. These indexes turn that into
 * a hash lookup, which is the difference between a responsive screen and a
 * multi-second stall.
 */

export const groupKey = (postId: string, shiftKey: string, serviceTypeKey: string): string =>
  `${postId}|${shiftKey}|${serviceTypeKey}`;

export const slotKey = (postId: string, shiftKey: string, serviceTypeKey: string, slotIndex: number): string =>
  `${postId}|${shiftKey}|${serviceTypeKey}|${slotIndex}`;

export type RotaIndex = Map<string, RotaAssignment[]>;
export type AttendanceIndex = Map<string, ShiftAttendance>;

export function buildRotaIndex(rota: RotaAssignment[]): RotaIndex {
  const index: RotaIndex = new Map();
  for (const r of rota) {
    const k = groupKey(r.postId, r.shiftKey, r.serviceTypeKey);
    const list = index.get(k);
    if (list) list.push(r);
    else index.set(k, [r]);
  }
  return index;
}

export function buildAttendanceIndex(records: ShiftAttendance[]): AttendanceIndex {
  const index: AttendanceIndex = new Map();
  for (const a of records) {
    index.set(slotKey(a.postId, a.shiftKey, a.serviceTypeKey, a.slotIndex), a);
  }
  return index;
}

/** postId -> post, so sidebar rendering does not re-scan the post array per row. */
export function buildPostIndex(posts: OperationalPost[]): Map<string, OperationalPost> {
  const index = new Map<string, OperationalPost>();
  for (const p of posts) if (p.id) index.set(p.id, p);
  return index;
}

/**
 * employeeId -> the post that already claims them on this shift.
 *
 * Used to warn before double-booking. A guard cannot be at two posts on one
 * shift, and nothing in the schema prevents recording that they were.
 */
export function buildShiftConflictIndex(
  rota: RotaAssignment[],
  shiftKey: string,
  ignorePostId?: string
): Map<string, { postName: string; shiftKey: string }> {
  const index = new Map<string, { postName: string; shiftKey: string }>();
  for (const r of rota) {
    if (r.shiftKey !== shiftKey) continue;
    if (ignorePostId && r.postId === ignorePostId) continue;
    if (!r.employeeId) continue;
    if (!index.has(r.employeeId)) {
      index.set(r.employeeId, { postName: r.postName || 'another post', shiftKey: r.shiftKey });
    }
  }
  return index;
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-level statistics
// ─────────────────────────────────────────────────────────────────────────────

export interface PostAttendanceStats {
  totalRequired: number;
  totalMarked: number;
  present: number;
  absent: number;
  partial: number;
  /** Required slots with no employee on the rota — cannot be marked as-is. */
  vacant: number;
  pending: number;
  isComplete: boolean;
}

/**
 * Attendance progress for one post, counted against **today's requirement** and
 * the rota, using indexes.
 *
 * `vacant` is tracked separately from `pending` on purpose. A slot nobody was
 * rostered to is not the same as a slot awaiting a decision, and the old screen
 * conflated them: an unstaffed post could never reach 100%, so the progress bar
 * stuck below full with no explanation of which slots were unfillable.
 */
export function computePostAttendanceStats(
  post: OperationalPost,
  date: Date,
  rotaIndex: RotaIndex,
  attendanceIndex: AttendanceIndex
): PostAttendanceStats {
  const postId = post.id || '';
  let totalRequired = 0, totalMarked = 0, present = 0, absent = 0, partial = 0, vacant = 0;

  for (const { key: shiftKey } of SHIFTS) {
    for (const { key: stKey } of SERVICE_TYPES_ORDERED) {
      const required = getRequiredCount(post, shiftKey, stKey, date);
      if (required === 0) continue;
      totalRequired += required;
      const rotaList = rotaIndex.get(groupKey(postId, shiftKey, stKey)) || [];
      for (let i = 0; i < required; i++) {
        const att = attendanceIndex.get(slotKey(postId, shiftKey, stKey, i));
        const status = att?.status;
        if (status && status !== 'pending') {
          totalMarked++;
          if (status === 'present') present++;
          else if (status === 'absent') absent++;
          else partial++;
        } else if (!rotaList[i]) {
          vacant++;
        }
      }
    }
  }

  return {
    totalRequired,
    totalMarked,
    present,
    absent,
    partial,
    vacant,
    pending: Math.max(0, totalRequired - totalMarked - vacant),
    isComplete: totalRequired > 0 && totalMarked + vacant >= totalRequired,
  };
}

export interface PostStaffingStats {
  totalRequired: number;
  totalAssigned: number;
  isFullyStaffed: boolean;
  shortfall: number;
}

/** Deployment coverage for one post: how many required slots have someone on them. */
export function computePostStaffing(
  post: OperationalPost,
  date: Date,
  getAssignedCount: (postId: string, shiftKey: string, serviceTypeKey: string) => number
): PostStaffingStats {
  const postId = post.id || '';
  let totalRequired = 0, totalAssigned = 0;
  for (const { key: shiftKey } of SHIFTS) {
    for (const { key: stKey } of SERVICE_TYPES_ORDERED) {
      const required = getRequiredCount(post, shiftKey, stKey, date);
      if (required === 0) continue;
      totalRequired += required;
      // Never count over-assignment as coverage; it would mask a gap elsewhere.
      totalAssigned += Math.min(required, getAssignedCount(postId, shiftKey, stKey));
    }
  }
  return {
    totalRequired,
    totalAssigned,
    isFullyStaffed: totalRequired > 0 && totalAssigned >= totalRequired,
    shortfall: Math.max(0, totalRequired - totalAssigned),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Presentation helpers
// ─────────────────────────────────────────────────────────────────────────────

export function calcAge(dob?: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}

export const ATTENDANCE_STATUS_META: Record<AttendanceStatus, {
  label: string;
  short: string;
  badgeClass: string;
  rowClass: string;
  avatarClass: string;
}> = {
  pending: {
    label: 'Pending', short: '—',
    badgeClass: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    rowClass: 'bg-white dark:bg-gray-800/60 border-gray-200 dark:border-gray-700',
    avatarClass: 'bg-[#D71920]/10 text-[#D71920]',
  },
  present: {
    label: 'Present', short: '✓',
    badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    rowClass: 'bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800',
    avatarClass: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  },
  absent: {
    label: 'Absent', short: '✗',
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    rowClass: 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800',
    avatarClass: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  },
  half_day: {
    label: 'Half-Day Swap', short: '½',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    rowClass: 'bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800',
    avatarClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
  half_vacant: {
    label: 'Half-Day Vacant', short: '½',
    badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    rowClass: 'bg-orange-50 border-orange-200 dark:bg-orange-900/10 dark:border-orange-800',
    avatarClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  },
};

export const initialsOf = (name?: string): string => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

export const genderSymbol = (gender?: string): string =>
  gender === 'male' ? '♂' : gender === 'female' ? '♀' : gender ? '⚧' : '';
