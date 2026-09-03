/**
 * Portal URL resolver — returns correct URLs for development (localhost) vs production (subdomains).
 *
 * In development, all portals are accessible on the same localhost origin via paths.
 * In production, each portal lives on its own subdomain.
 */

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'safend.in';

/**
 * Returns true when running on localhost (development).
 * Works both server-side (checks NODE_ENV) and client-side (checks window.location).
 */
function isLocalDev(): boolean {
  // Server-side (middleware, SSR)
  if (typeof window === 'undefined') {
    return process.env.NODE_ENV === 'development';
  }
  // Client-side
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

/**
 * Get the base URL for a given portal.
 *
 * In development: returns '' (empty string) so links are relative to current origin.
 * In production: returns the full subdomain URL like 'https://office.safend.in'.
 */
export function getPortalBase(portal: 'office' | 'client' | 'ops' | 'root'): string {
  if (isLocalDev()) {
    return '';
  }

  if (portal === 'root') {
    return `https://${ROOT_DOMAIN}`;
  }
  return `https://${portal}.${ROOT_DOMAIN}`;
}

/**
 * Get the full URL for a portal page.
 *
 * In development: returns just the path (e.g. '/login', '/client-login').
 * In production: returns full URL (e.g. 'https://office.safend.in/login').
 *
 * NOTE: In dev, all portals share the same localhost origin. The ERP and supervisor
 * login pages are at /login (same component — supervisor auth goes through the same form).
 * The client login is at /client-login.
 */
export function getPortalUrl(portal: 'office' | 'client' | 'ops' | 'root', path = '/'): string {
  const base = getPortalBase(portal);

  if (isLocalDev() && path === '/login') {
    // In dev, route to the correct login path for each portal
    if (portal === 'client') return '/client-login';
    // office and ops both use /login
    return '/login';
  }

  return `${base}${path}`;
}

/**
 * Mapping of login destinations for each portal.
 */
export const PORTAL_LOGIN_URLS = {
  get client() { return getPortalUrl('client', '/login'); },
  get ops() { return getPortalUrl('ops', '/login'); },
  get office() { return getPortalUrl('office', '/login'); },
};

/**
 * Get the dashboard redirect URL for a given user role.
 */
export function getDashboardUrlForRole(role: string | null): string {
  switch (role) {
    case 'client':
      return getPortalUrl('client', '/client-portal');
    case 'employee':
    case 'supervisor':
    case 'employee_portal':
      return getPortalUrl('ops', '/supervisor-portal');
    case 'admin':
    case 'branch_admin':
    case 'operations':
    case 'sales':
    case 'hr':
      return getPortalUrl('office', '/dashboard');
    default:
      return getPortalUrl('office', '/dashboard');
  }
}
