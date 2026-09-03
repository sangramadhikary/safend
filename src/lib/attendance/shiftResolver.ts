/**
 * Shift resolution over matched deployments (pure, dependency-free).
 *
 * The verification route (`POST /api/attendance/checkin/verify`) looks up the
 * deployments in `rota_assignments` that match an employee, a post, and the
 * current calendar date. This module turns that raw set of matched
 * deployments into the response the Scanner needs:
 *
 *   - the distinct matched shift keys (each ∈ {day, afternoon, night}, at most
 *     three, since only those three shift keys exist), and
 *   - an `autoSelect` flag that is true exactly when a single distinct shift
 *     matched, so the Scanner can select it automatically (R3.6) and otherwise
 *     require the user to choose one before capturing the photo (R3.7).
 *
 * The resolver is order-insensitive and de-duplicates by shift key. When the
 * same shift key appears on more than one matched deployment, the first
 * occurrence's `serviceTypeKey` is retained so the caller still has a concrete
 * service type to record for an auto-selected shift.
 *
 * Requirements: 3.6, 3.7
 */

/** The three shift keys a deployment can carry. */
export const SHIFT_KEYS = ['day', 'afternoon', 'night'] as const;

export type ShiftKey = (typeof SHIFT_KEYS)[number];

/** Returns true when `value` is one of the three valid shift keys. */
export function isShiftKey(value: unknown): value is ShiftKey {
  return (
    typeof value === 'string' &&
    (SHIFT_KEYS as readonly string[]).includes(value)
  );
}

/**
 * A deployment matched for the employee/post/today lookup. Only the fields the
 * resolver needs are modelled here; the route may pass richer rows.
 */
export interface MatchedDeployment {
  shiftKey: ShiftKey;
  serviceTypeKey: string;
}

/** A single resolved, distinct shift the Scanner can present or auto-select. */
export interface ResolvedShift {
  shiftKey: ShiftKey;
  serviceTypeKey: string;
}

export interface ShiftResolution {
  /** The distinct matched shifts (at most three), in {day, afternoon, night}. */
  shifts: ResolvedShift[];
  /** True iff exactly one distinct shift matched (Scanner auto-selects it). */
  autoSelect: boolean;
}

/**
 * Resolve the distinct shifts from a set of matched deployments.
 *
 * De-duplicates by `shiftKey` (retaining the first-seen `serviceTypeKey`) and
 * sets `autoSelect` when — and only when — a single distinct shift remains.
 * With zero matches the result has no shifts and `autoSelect` is false.
 */
export function resolveShifts(
  deployments: readonly MatchedDeployment[],
): ShiftResolution {
  const seen = new Set<ShiftKey>();
  const shifts: ResolvedShift[] = [];

  for (const deployment of deployments) {
    if (!deployment || !isShiftKey(deployment.shiftKey)) {
      continue;
    }
    if (seen.has(deployment.shiftKey)) {
      continue;
    }
    seen.add(deployment.shiftKey);
    shifts.push({
      shiftKey: deployment.shiftKey,
      serviceTypeKey: deployment.serviceTypeKey,
    });
  }

  return { shifts, autoSelect: shifts.length === 1 };
}
