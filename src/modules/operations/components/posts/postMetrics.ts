import type { OperationalPost } from "@/services/supabase/OperationalPostService";

/**
 * Shared metrics + presentation helpers for the Operational Posts UI.
 *
 * All figures are derived from the real post data (serviceInstances /
 * securityServices). No mock values. Both the new (serviceInstances) and the
 * legacy (securityServices) shapes are normalised to a single structure first,
 * mirroring the logic already used by PostServiceDisplay.
 */

export type ShiftKey = "day" | "afternoon" | "night";

export interface ServiceMeta {
  key: string;
  label: string;
  /** Tailwind classes for a soft chip/badge. */
  badgeClass: string;
  /** Tailwind bg class for a legend dot. */
  dot: string;
  /** Concrete hex for stacked bars / rings. */
  hex: string;
}

export const SERVICE_META: ServiceMeta[] = [
  { key: "unarmedGuards", label: "Unarmed Guards", badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", dot: "bg-blue-500", hex: "#3b82f6" },
  { key: "armedGuards", label: "Armed Guards", badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", dot: "bg-red-500", hex: "#ef4444" },
  { key: "supervisors", label: "Supervisors", badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300", dot: "bg-purple-500", hex: "#a855f7" },
  { key: "patrolOfficers", label: "Patrol Officers", badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", dot: "bg-amber-500", hex: "#f59e0b" },
  { key: "eventSecurity", label: "Event Security", badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", dot: "bg-green-500", hex: "#22c55e" },
  { key: "personalSecurity", label: "Personal Security", badgeClass: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300", dot: "bg-indigo-500", hex: "#6366f1" },
];

export const SERVICE_META_MAP: Record<string, ServiceMeta> = SERVICE_META.reduce(
  (acc, m) => {
    acc[m.key] = m;
    return acc;
  },
  {} as Record<string, ServiceMeta>
);

export const SHIFT_META: { key: ShiftKey; label: string; hex: string; dot: string }[] = [
  { key: "day", label: "Day", hex: "#f59e0b", dot: "bg-amber-500" },
  { key: "afternoon", label: "Afternoon", hex: "#fb923c", dot: "bg-orange-400" },
  { key: "night", label: "Night", hex: "#6366f1", dot: "bg-indigo-500" },
];

export interface PostMetrics {
  totalGuards: number;
  byShift: Record<ShiftKey, number>;
  byService: Record<string, number>;
  activeServiceKeys: string[];
  /** Sum of quantity × rate across enabled shifts; null when no rate data. */
  monthlyValue: number | null;
}

/** Normalise either data shape to: { serviceKey: instance[] }. */
function normaliseServiceData(post: OperationalPost): Record<string, any[]> {
  let data: any = post.serviceInstances;

  if (!data || Object.keys(data).length === 0) {
    const legacy = post.securityServices;
    if (legacy && Object.keys(legacy).length > 0) {
      data = {};
      Object.keys(legacy).forEach((key) => {
        const svc = (legacy as any)[key];
        if (svc) {
          data[key] = [
            {
              id: `${key}-1`,
              shiftType: svc.shiftType || "8H",
              shifts: svc.shifts || {
                day: { enabled: false, quantity: 0, rate: 0 },
                afternoon: { enabled: false, quantity: 0, rate: 0 },
                night: { enabled: false, quantity: 0, rate: 0 },
              },
            },
          ];
        }
      });
    }
  }

  return data && typeof data === "object" ? data : {};
}

export function getPostMetrics(post: OperationalPost): PostMetrics {
  const data = normaliseServiceData(post);

  const byShift: Record<ShiftKey, number> = { day: 0, afternoon: 0, night: 0 };
  const byService: Record<string, number> = {};
  const activeServiceKeys: string[] = [];
  let monthlyValue = 0;
  let hasRate = false;

  for (const meta of SERVICE_META) {
    const instances = data[meta.key];
    if (!Array.isArray(instances) || instances.length === 0) continue;

    let serviceCount = 0;
    let serviceActive = false;

    for (const inst of instances) {
      const shifts = inst?.shifts;
      if (!shifts) continue;
      for (const { key } of SHIFT_META) {
        const slot = shifts[key];
        if (slot?.enabled) {
          const qty = Number(slot.quantity) || 0;
          byShift[key] += qty;
          serviceCount += qty;
          if (qty > 0) serviceActive = true;
          const rate = Number(slot.rate) || 0;
          if (rate > 0) {
            hasRate = true;
            monthlyValue += qty * rate;
          }
        }
      }
    }

    if (serviceCount > 0) byService[meta.key] = serviceCount;
    if (serviceActive) activeServiceKeys.push(meta.key);
  }

  const derivedTotal = byShift.day + byShift.afternoon + byShift.night;
  // Prefer the stored field when present; fall back to the derived sum.
  const totalGuards = post.totalGuards && post.totalGuards > 0 ? post.totalGuards : derivedTotal;

  return {
    totalGuards,
    byShift,
    byService,
    activeServiceKeys,
    monthlyValue: hasRate ? monthlyValue : null,
  };
}

export interface ClientMetrics {
  totalGuards: number;
  byShift: Record<ShiftKey, number>;
  byService: Record<string, number>;
  activeServiceKeys: string[];
  monthlyValue: number | null;
}

export function aggregatePostMetrics(posts: OperationalPost[]): ClientMetrics {
  const byShift: Record<ShiftKey, number> = { day: 0, afternoon: 0, night: 0 };
  const byService: Record<string, number> = {};
  let totalGuards = 0;
  let monthlyValue = 0;
  let hasRate = false;

  for (const post of posts) {
    const m = getPostMetrics(post);
    totalGuards += m.totalGuards;
    byShift.day += m.byShift.day;
    byShift.afternoon += m.byShift.afternoon;
    byShift.night += m.byShift.night;
    for (const [k, v] of Object.entries(m.byService)) {
      byService[k] = (byService[k] || 0) + v;
    }
    if (m.monthlyValue !== null) {
      hasRate = true;
      monthlyValue += m.monthlyValue;
    }
  }

  const activeServiceKeys = SERVICE_META.filter((m) => byService[m.key] > 0).map((m) => m.key);

  return {
    totalGuards,
    byShift,
    byService,
    activeServiceKeys,
    monthlyValue: hasRate ? monthlyValue : null,
  };
}

/** Compact Indian-rupee formatting: 6240000 → "₹62.4L", 12500000 → "₹1.25Cr". */
export function formatINRCompact(value: number): string {
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)}Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  return `₹${value}`;
}
