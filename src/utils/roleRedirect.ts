/**
 * Role-based redirect utility for ERP route access control.
 *
 * Maps user roles to their default ERP destination and determines
 * whether a given role is authorized to access a protected route.
 */

const ROLE_DESTINATIONS: Record<string, string> = {
  admin: '/dashboard',
  branch_admin: '/dashboard',
  sales: '/sales',
  operations: '/operations',
  accounts: '/accounts',
  hr: '/hr',
  'office-admin': '/office-admin',
  'office_admin': '/office-admin',
  reports: '/sales',
  client: '/client-portal',
  employee_portal: '/supervisor-portal',
  supervisor: '/supervisor-portal',
};

const DEFAULT_DESTINATION = '/sales';

/**
 * Returns the ERP destination path for a given user role.
 * Unknown or null roles default to '/sales'.
 */
export function getRedirectPath(role: string | null): string {
  if (!role) return DEFAULT_DESTINATION;
  return ROLE_DESTINATIONS[role] ?? DEFAULT_DESTINATION;
}

/**
 * Set of protected ERP routes and their allowed roles.
 */
export const PROTECTED_ROUTES: Record<string, string[]> = {
  '/dashboard': ['admin', 'branch_admin'],
  '/sales': ['sales'],
  '/operations': ['operations'],
  '/accounts': ['accounts'],
  '/hr': ['hr'],
  '/profile': ['admin', 'branch_admin', 'sales', 'operations', 'accounts', 'hr'],
  '/office-admin': ['admin', 'branch_admin', 'office-admin', 'office_admin'],
  '/client-portal': ['client'],
  '/supervisor-portal': ['supervisor', 'employee_portal'],
};

/**
 * Determines if a user with the given role is authorized for a route.
 * Admin role has access to all protected routes.
 * Returns false if the route is not in PROTECTED_ROUTES.
 */
export function isAuthorizedForRoute(role: string | null, route: string): boolean {
  if (role === 'admin') return true;
  const allowedRoles = PROTECTED_ROUTES[route];
  if (!allowedRoles) return false;
  return role !== null && allowedRoles.includes(role);
}
