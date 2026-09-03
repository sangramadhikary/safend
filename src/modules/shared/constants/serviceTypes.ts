/**
 * Canonical security service types — single source of truth.
 *
 * The key→label map used to be copy-pasted across 8+ files with three
 * divergent label conventions, and two of those copies had gone stale (missing
 * `pso`, `bouncers`, `manpower` while still listing the retired
 * `eventSecurity` / `personalSecurity`). Anything that needs to turn a service
 * key into a label, or work out which service types a post actually uses,
 * should import from here.
 *
 * KEYS are what gets persisted. They flow unchanged from the quotation
 * (`SecurityPostsEditor.ServiceInstancesMap`) through
 * `operational_posts.service_instances` to `rota_assignments.service_type_key`
 * and `shift_attendance.service_type_key`.
 *
 * LABELS are what gets displayed — and, unfortunately, what
 * `post_salary_rates.designation` stores (its UNIQUE key is
 * `post_id,designation`). Renaming a label therefore orphans existing salary
 * rows and breaks the designation lookups in ProcessPayrollStep,
 * PostDetailDialog, Deployments and AttendanceManagement. Add keys freely;
 * do not rename labels without a data migration.
 */

/** Service types offered on new work orders, in display order. */
export const SERVICE_TYPE_KEYS = [
  'unarmedGuards',
  'armedGuards',
  'supervisors',
  'patrolOfficers',
  'pso',
  'bouncers',
  'manpower',
] as const;

export type ServiceTypeKey = (typeof SERVICE_TYPE_KEYS)[number];

/**
 * Retired service types. No longer offered by SecurityPostsEditor, but kept
 * here so historical posts that still carry them render instead of silently
 * dropping their guards.
 */
export const LEGACY_SERVICE_TYPE_KEYS = ['eventSecurity', 'personalSecurity'] as const;

export type LegacyServiceTypeKey = (typeof LEGACY_SERVICE_TYPE_KEYS)[number];

/** Every key that may appear in stored data, current first then legacy. */
export const ALL_SERVICE_TYPE_KEYS: readonly string[] = [
  ...SERVICE_TYPE_KEYS,
  ...LEGACY_SERVICE_TYPE_KEYS,
];

export const SERVICE_TYPE_LABELS: Record<string, string> = {
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

/** Display label for a service key, falling back to the raw key if unknown. */
export function serviceTypeLabel(key: string): string {
  return SERVICE_TYPE_LABELS[key] ?? key;
}

/**
 * True when a shift block represents real staffing.
 *
 * `enabled` alone is not enough. `createEmptyServiceInstances()` seeds one
 * instance for EVERY service type on EVERY post, and the editor can leave a
 * shift flagged enabled with quantity 0 once a user toggles it on and then
 * clears the count. Requiring quantity > 0 is what distinguishes "the client
 * is actually taking this service" from "this row exists because the form
 * pre-seeded it".
 */
function isShiftStaffed(shift: any): boolean {
  return Boolean(shift?.enabled) && (Number(shift?.quantity) || 0) > 0;
}

/** Accepts an instance array, a single instance object, or nothing. */
function toInstanceArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [value];
  return [];
}

/**
 * The service type keys a post actually staffs, in canonical display order.
 *
 * Works with both `operational_posts.service_instances`
 * (`Record<key, ServiceInstance[]>`) and the legacy
 * `operational_posts.security_services` (`Record<key, SecurityService>`).
 */
export function activeServiceTypeKeys(serviceInstances: unknown): string[] {
  if (!serviceInstances || typeof serviceInstances !== 'object') return [];
  const si = serviceInstances as Record<string, any>;

  // Iterate the canonical order rather than Object.keys so the UI ordering is
  // stable regardless of how the JSON happens to be serialised. Unknown keys
  // are appended so nothing in stored data is silently hidden.
  const known = ALL_SERVICE_TYPE_KEYS.filter((key) => key in si);
  const unknown = Object.keys(si).filter((key) => !ALL_SERVICE_TYPE_KEYS.includes(key));

  return [...known, ...unknown].filter((key) =>
    toInstanceArray(si[key]).some((inst) =>
      Object.values(inst?.shifts || {}).some(isShiftStaffed)
    )
  );
}

/** Same as `activeServiceTypeKeys`, mapped to display labels. */
export function activeServiceTypeLabels(serviceInstances: unknown): string[] {
  return activeServiceTypeKeys(serviceInstances).map(serviceTypeLabel);
}

/** A single billable/payable designation derived from a post's service instances. */
export interface DesignationEntry {
  /** Stable identifier for list rendering. Not persisted anywhere. */
  key: string;
  /** Display label — this is also what gets persisted as `post_salary_rates.designation`. */
  label: string;
}

/**
 * The designations a post actually needs salary rates for, in canonical order.
 *
 * This is `activeServiceTypeKeys` with one difference: `manpower` is
 * special-cased. A post can staff several functionally distinct manpower
 * roles (Driver, Cook, Electrician, Peon, ...) as separate `ServiceInstance`
 * entries that all share the single `manpower` key
 * (see `SecurityPostsEditor.ServiceInstance.manpowerRole`). Collapsing all of
 * them into one "Manpower" label — which is what `activeServiceTypeLabels`
 * does — hid that distinction: only one salary rate could ever be set for a
 * post even when it staffs both a Driver and a Cook, who are not paid the
 * same. This returns one designation per distinct role actually staffed
 * (falling back to a plain "Manpower" designation for legacy instances that
 * predate the `manpowerRole` field).
 */
export function activePostDesignations(serviceInstances: unknown): DesignationEntry[] {
  if (!serviceInstances || typeof serviceInstances !== 'object') return [];
  const si = serviceInstances as Record<string, any>;

  const known = ALL_SERVICE_TYPE_KEYS.filter((key) => key in si);
  const unknownKeys = Object.keys(si).filter((key) => !ALL_SERVICE_TYPE_KEYS.includes(key));
  const orderedKeys = [...known, ...unknownKeys];

  const entries: DesignationEntry[] = [];
  orderedKeys.forEach((key) => {
    const staffedInstances = toInstanceArray(si[key]).filter((inst) =>
      Object.values(inst?.shifts || {}).some(isShiftStaffed)
    );
    if (staffedInstances.length === 0) return;

    if (key === 'manpower') {
      // One designation per distinct role, in first-seen order. Instances
      // without a manpowerRole (legacy data) fall back to plain "Manpower".
      const seenRoles = new Set<string>();
      staffedInstances.forEach((inst) => {
        const role = String(inst?.manpowerRole || '').trim();
        const roleKey = role || '__general__';
        if (seenRoles.has(roleKey)) return;
        seenRoles.add(roleKey);
        entries.push({
          key: `manpower:${roleKey}`,
          label: role ? `Manpower - ${role}` : 'Manpower',
        });
      });
    } else {
      entries.push({ key, label: serviceTypeLabel(key) });
    }
  });

  return entries;
}
