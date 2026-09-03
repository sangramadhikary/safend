/**
 * Access-decision and role utilities (Req 5.8, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7).
 *
 * These are the pure-function building blocks for server-side authorization.
 * They make decisions exclusively from a *server-verified* session-confirmation
 * flag and a server-resolved role set — never from client-supplied role data,
 * and never by substituting a default or hardcoded role when the session is
 * unconfirmed (Req 5.8, 7.4).
 *
 *  - {@link decideAccess} gates a protected operation: "allow" only when the
 *    session is confirmed AND the resolved roles intersect the route-allowed
 *    set (or that set is empty, meaning "any authenticated caller"). Whenever
 *    the session is not confirmed it returns "deny".
 *  - {@link validateRequestedRoles} enforces the non-empty assignable-roles
 *    allowlist for user-creation routes (Req 7.5).
 *  - {@link hasStaffRole} is the destructive-operation gate for the concrete
 *    ERP staff role set (Req 7.6, 7.7).
 */

/**
 * The concrete ERP staff roles permitted to perform destructive operations
 * (file delete, metadata probe, destructive data operations), system-wide
 * regardless of route (Req 7.6).
 */
export const ERP_STAFF_ROLES = [
  'admin',
  'branch_admin',
  'hr',
  'accounts',
  'operations',
  'sales',
  'office-admin',
  'reports',
] as const;

export type StaffRole = (typeof ERP_STAFF_ROLES)[number];

/**
 * The allowlist of roles that may be assigned when creating a user (Req 7.5).
 * A user-creation request is rejected unless it requests a non-empty set of
 * roles drawn entirely from this allowlist. It mirrors the concrete ERP staff
 * role set so that no privilege string outside the known set can be minted.
 */
export const ASSIGNABLE_ROLES: readonly string[] = ERP_STAFF_ROLES;

/** The outcome of an access decision. */
export type AccessDecision = 'allow' | 'deny';

/** Inputs to {@link decideAccess}, all derived from the server-verified session. */
export interface AccessDecisionInput {
  /** True only when the server has confirmed an authenticated session. */
  sessionConfirmed: boolean;
  /** Roles resolved server-side for the caller. Never client-supplied. */
  resolvedRoles: readonly string[];
  /**
   * The roles a route permits. An empty set means "any authenticated caller"
   * is allowed (authorization reduces to authentication).
   */
  routeAllowedRoles: readonly string[];
}

/**
 * Decide whether a protected operation may proceed.
 *
 * Returns "allow" if and only if the session is confirmed AND either the
 * route-allowed set is empty (any authenticated caller) or the resolved roles
 * intersect the route-allowed set. When the session is not confirmed this
 * always returns "deny" and no default/hardcoded role is ever substituted
 * (Req 5.8, 7.2, 7.3, 7.4).
 */
export function decideAccess(input: AccessDecisionInput): AccessDecision {
  const { sessionConfirmed, resolvedRoles, routeAllowedRoles } = input;

  // Unconfirmed session: deny unconditionally, never assume a role (Req 5.8, 7.4).
  if (!sessionConfirmed) {
    return 'deny';
  }

  // Empty allowed set => any authenticated caller is permitted.
  if (routeAllowedRoles.length === 0) {
    return 'allow';
  }

  const allowed = new Set(routeAllowedRoles);
  const intersects = resolvedRoles.some((role) => allowed.has(role));
  return intersects ? 'allow' : 'deny';
}

/**
 * Validate a requested-role array against the assignable-roles allowlist
 * (Req 7.5).
 *
 * Returns true if and only if the array is non-empty and every element is a
 * member of {@link ASSIGNABLE_ROLES}. Any absent, empty, or out-of-allowlist
 * value causes rejection.
 */
export function validateRequestedRoles(roles: readonly string[]): boolean {
  if (!Array.isArray(roles) || roles.length === 0) {
    return false;
  }
  const allowed = new Set(ASSIGNABLE_ROLES);
  return roles.every((role) => allowed.has(role));
}

/**
 * The destructive-operation gate: returns true if and only if the resolved
 * role set intersects the concrete ERP staff role set (Req 7.6, 7.7).
 */
export function hasStaffRole(roles: readonly string[]): boolean {
  if (!Array.isArray(roles) || roles.length === 0) {
    return false;
  }
  const staff = new Set<string>(ERP_STAFF_ROLES);
  return roles.some((role) => staff.has(role));
}
