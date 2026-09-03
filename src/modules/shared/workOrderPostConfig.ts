/**
 * Work Order → Operational Post configuration resolution — single source of truth.
 *
 * A work order holds each post's manpower configuration in
 * `perPostServiceInstances`, keyed by post index ("0", "1", ...), with the flat
 * `serviceInstances` map as the fallback for single-post and legacy orders.
 *
 * This resolution used to be reimplemented in every consumer, and the copies
 * disagreed: the post sync ignored `perPostServiceInstances` entirely and wrote
 * one contract-wide blob onto every post, while invoicing and the payroll salary
 * screen read the per-post map correctly. That disagreement is what made
 * Operations show services the work order never ordered.
 *
 * Deliberately dependency-free (no imports, no browser or Supabase globals) so
 * the app, tests and maintenance scripts can all share exactly one copy.
 */

export interface ShiftBlock {
  enabled?: boolean;
  quantity?: number;
  rate?: number | string;
}

export interface RawServiceInstance {
  id?: string;
  shiftType?: string;
  /** Only meaningful for the `manpower` service type (Driver, Cook, ...). */
  manpowerRole?: string;
  shifts?: Record<string, ShiftBlock>;
  serviceDays?: Record<string, boolean>;
  assignedEmployeeId?: string;
}

/** `Record<serviceTypeKey, RawServiceInstance[]>`, or the legacy single-object shape. */
export type RawServiceInstancesMap = Record<string, RawServiceInstance | RawServiceInstance[]>;

export const SHIFT_KEYS = ['day', 'afternoon', 'night'] as const;

/**
 * True when a shift block represents real staffing.
 *
 * `enabled` alone is not enough: `createEmptyServiceInstances()` seeds one
 * instance for EVERY service type on EVERY post, and the editor can leave a
 * shift enabled with quantity 0. Requiring quantity > 0 separates "the client
 * actually bought this" from "the form pre-seeded this row".
 */
export function isShiftStaffed(shift: ShiftBlock | undefined): boolean {
  return Boolean(shift?.enabled) && (Number(shift?.quantity) || 0) > 0;
}

/** Accepts an instance array, a single instance object, or nothing. */
export function toInstanceArray(value: unknown): RawServiceInstance[] {
  if (Array.isArray(value)) return value as RawServiceInstance[];
  if (value && typeof value === 'object') return [value as RawServiceInstance];
  return [];
}

/** True when a service-instances map has at least one genuinely staffed shift. */
export function hasStaffedInstances(instances: unknown): boolean {
  if (!instances || typeof instances !== 'object') return false;
  return Object.values(instances as Record<string, unknown>).some((entry) =>
    toInstanceArray(entry).some((inst) =>
      Object.values(inst?.shifts || {}).some(isShiftStaffed)
    )
  );
}

/**
 * The service configuration for one post, in priority order:
 *   1. work order per-post map   — the authoritative per-post configuration
 *   2. work order flat map       — single-post / legacy work orders
 *   3. quotation per-post / flat — work order never carried its own config
 *
 * The work order outranks the quotation because the work order is what was
 * actually contracted. Reading the quotation first meant every edit made after
 * quotation stage was invisible to Operations.
 */
export function resolvePostServiceInstances(
  workOrder: any,
  quotation: any,
  postIndex: number
): RawServiceInstancesMap | null {
  const key = String(postIndex);
  const candidates = [
    workOrder?.perPostServiceInstances?.[key],
    workOrder?.serviceInstances,
    quotation?.perPostServiceInstances?.[key],
    quotation?.serviceInstances,
  ];
  for (const candidate of candidates) {
    if (hasStaffedInstances(candidate)) return candidate as RawServiceInstancesMap;
  }
  // Nothing staffed anywhere — keep a structurally present map so the post
  // retains its shape rather than losing the services block entirely.
  return (
    (candidates.find(
      (c) => c && typeof c === 'object' && Object.keys(c).length > 0
    ) as RawServiceInstancesMap | undefined) ?? null
  );
}

const normaliseName = (value: unknown) => String(value ?? '').trim().toLowerCase();

/** A work order's post/location list, preferring `locations` over legacy `posts`. */
export function workOrderLocations(workOrder: any): any[] {
  const locations = workOrder?.locations;
  if (Array.isArray(locations) && locations.length > 0) return locations;
  return Array.isArray(workOrder?.posts) ? workOrder.posts : [];
}

/**
 * Index of a post within its work order's location list, matched on name.
 * Falls back to index 0 for single-location work orders, mirroring how the
 * payroll salary screen resolves the same relationship.
 */
export function findPostIndex(workOrder: any, postName: string): number {
  const locations = workOrderLocations(workOrder);
  const target = normaliseName(postName);
  const exact = locations.findIndex(
    (loc: any) => normaliseName(loc?.name ?? loc?.postName) === target
  );
  if (exact >= 0) return exact;
  return locations.length === 1 ? 0 : -1;
}

/**
 * Normalised copy of a post's service instances for storage.
 *
 * Preserves every field downstream systems rely on. An earlier version rebuilt
 * instances from only `id`/`shiftType`/`shifts`, silently dropping `serviceDays`
 * (so the rota treated every instance as 7-day) and `manpowerRole` (so Driver and
 * Cook collapsed into one "Manpower" designation sharing a single salary rate).
 */
export function copyServiceInstancesForPost(instances: unknown): RawServiceInstancesMap {
  if (!instances || typeof instances !== 'object') return {};
  const out: RawServiceInstancesMap = {};
  Object.entries(instances as Record<string, unknown>).forEach(([key, value]) => {
    const list = toInstanceArray(value);
    if (list.length === 0) return;
    out[key] = list.map((inst, index) => {
      const copied: RawServiceInstance = {
        id: String(inst?.id || `${key}-${index + 1}`),
        shiftType: inst?.shiftType === '12H' ? '12H' : '8H',
        shifts: {
          day: {
            enabled: Boolean(inst?.shifts?.day?.enabled),
            quantity: Number(inst?.shifts?.day?.quantity) || 0,
            rate: Number(inst?.shifts?.day?.rate) || 0,
          },
          afternoon: {
            enabled: Boolean(inst?.shifts?.afternoon?.enabled),
            quantity: Number(inst?.shifts?.afternoon?.quantity) || 0,
            rate: Number(inst?.shifts?.afternoon?.rate) || 0,
          },
          night: {
            enabled: Boolean(inst?.shifts?.night?.enabled),
            quantity: Number(inst?.shifts?.night?.quantity) || 0,
            rate: Number(inst?.shifts?.night?.rate) || 0,
          },
        },
      };
      if (inst?.serviceDays && typeof inst.serviceDays === 'object') {
        copied.serviceDays = { ...inst.serviceDays };
      }
      const role = String(inst?.manpowerRole || '').trim();
      if (role) copied.manpowerRole = role;
      if (inst?.assignedEmployeeId) copied.assignedEmployeeId = inst.assignedEmployeeId;
      return copied;
    });
  });
  return out;
}

/**
 * Guards required by one post's own configuration.
 *
 * An afternoon shift only counts for 8-hour instances — a 12-hour instance
 * already covers the day with its day + night blocks. Posts previously fell back
 * to a contract-wide total whenever a location omitted `guards`, so a 3-guard
 * post could report the whole contract's 12.
 *
 * Handles both `service_instances` and the legacy `security_services` shape.
 */
export function countGuardsForInstances(instances: unknown): number {
  if (!instances || typeof instances !== 'object') return 0;
  let total = 0;
  Object.values(instances as Record<string, unknown>).forEach((entry) => {
    toInstanceArray(entry).forEach((inst) => {
      const is8H = (inst?.shiftType || '8H') !== '12H';
      if (isShiftStaffed(inst?.shifts?.day)) total += Number(inst.shifts!.day.quantity) || 0;
      if (is8H && isShiftStaffed(inst?.shifts?.afternoon)) {
        total += Number(inst.shifts!.afternoon.quantity) || 0;
      }
      if (isShiftStaffed(inst?.shifts?.night)) total += Number(inst.shifts!.night.quantity) || 0;
    });
  });
  return total;
}

/** Shift type for a post: 12H when any staffed instance on that post is 12-hour. */
export function deriveShiftTypeForInstances(instances: unknown): '8H' | '12H' {
  if (!instances || typeof instances !== 'object') return '8H';
  for (const entry of Object.values(instances as Record<string, unknown>)) {
    for (const inst of toInstanceArray(entry)) {
      const staffed = Object.values(inst?.shifts || {}).some(isShiftStaffed);
      if (staffed && inst?.shiftType === '12H') return '12H';
    }
  }
  return '8H';
}

/**
 * Content fingerprint of a post's synced configuration.
 *
 * Keys are sorted so JSON property order — which Postgres does not preserve —
 * never registers as a change. The sync's earlier idempotency check compared only
 * the NUMBER of posts, so once a post was written it was never corrected again,
 * even after its work order was fixed or split per post.
 */
export function buildPostConfigFingerprint(
  postName: string,
  totalGuards: number,
  shiftType: string,
  instances: unknown
): string {
  const parts: string[] = [];
  const map = (instances && typeof instances === 'object' ? instances : {}) as Record<string, unknown>;
  Object.keys(map).sort().forEach((key) => {
    toInstanceArray(map[key]).forEach((inst) => {
      const shifts = SHIFT_KEYS
        .map((s) => `${s}:${inst?.shifts?.[s]?.enabled ? 1 : 0}:${Number(inst?.shifts?.[s]?.quantity) || 0}`)
        .join(',');
      const days = inst?.serviceDays
        ? Object.keys(inst.serviceDays).sort().map((d) => `${d}:${inst.serviceDays![d] ? 1 : 0}`).join(',')
        : 'all';
      parts.push(
        `${key}|${inst?.id || ''}|${inst?.shiftType || '8H'}|${inst?.manpowerRole || ''}|${shifts}|${days}`
      );
    });
  });
  return [normaliseName(postName), String(totalGuards), shiftType, ...parts].join('||');
}

/** Human-readable one-line summary of a service configuration, for diffs and logs. */
export function describeServiceInstances(instances: unknown): string {
  if (!instances || typeof instances !== 'object') return '(none)';
  const parts: string[] = [];
  Object.keys(instances as Record<string, unknown>).sort().forEach((key) => {
    toInstanceArray((instances as Record<string, unknown>)[key]).forEach((inst) => {
      const shifts = SHIFT_KEYS
        .filter((s) => isShiftStaffed(inst?.shifts?.[s]))
        .map((s) => `${s}=${inst.shifts![s].quantity}`);
      if (shifts.length === 0) return;
      const role = inst?.manpowerRole ? `(${inst.manpowerRole})` : '';
      parts.push(`${key}${role} ${inst?.shiftType || '8H'} [${shifts.join(' ')}]`);
    });
  });
  return parts.length > 0 ? parts.join('; ') : '(nothing staffed)';
}

/** The full desired post configuration derived from a work order for one post index. */
export interface DerivedPostConfig {
  serviceInstances: RawServiceInstancesMap;
  totalGuards: number;
  shiftType: '8H' | '12H';
  fingerprint: string;
}

/**
 * Derive everything a post's configuration columns should hold, from the work
 * order (preferred) and quotation (fallback). One function so the live sync and
 * any backfill cannot drift apart.
 */
export function derivePostConfig(
  workOrder: any,
  quotation: any,
  postIndex: number,
  postName: string,
  location?: any
): DerivedPostConfig {
  const resolved = resolvePostServiceInstances(workOrder, quotation, postIndex);
  const serviceInstances = copyServiceInstancesForPost(resolved);
  const totalGuards =
    countGuardsForInstances(serviceInstances) ||
    countGuardsForInstances(quotation?.securityServices) ||
    Number(location?.guards) || 0;
  const shiftType = hasStaffedInstances(serviceInstances)
    ? deriveShiftTypeForInstances(serviceInstances)
    : (quotation?.shiftType === '12H' ? '12H' : '8H');
  return {
    serviceInstances,
    totalGuards,
    shiftType,
    fingerprint: buildPostConfigFingerprint(postName, totalGuards, shiftType, serviceInstances),
  };
}
