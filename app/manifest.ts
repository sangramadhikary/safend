import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { SITE } from '@/lib/seo/siteConfig';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const headersList = await headers();
  const host = headersList.get('host') || '';

  // Determine start_url based on the subdomain serving the manifest.
  // This ensures the PWA opens directly into the portal (not the marketing site)
  // and stays in standalone mode within its own scope.
  let startUrl: string = '/';
  let appName: string = SITE.name;
  let shortName: string = 'Safend';
  let description: string =
    'Safend — Security operations management. Attendance, deployments, patrols, and field operations.';

  if (host.startsWith('ops.')) {
    startUrl = '/supervisor-portal';
    appName = 'Safend Ops';
    shortName = 'Safend Ops';
    description = 'Safend Operations — Supervisor attendance approvals, patrol monitoring, and field ops.';
  } else if (host.startsWith('office.')) {
    startUrl = '/dashboard';
    appName = 'Safend Office';
    shortName = 'Safend Office';
    description = 'Safend Office — HR, accounts, sales, and admin management.';
  } else if (host.startsWith('client.')) {
    startUrl = '/client-portal';
    appName = 'Safend Client';
    shortName = 'Safend Client';
    description = 'Safend Client Portal — View deployment status, invoices, and reports.';
  }

  return {
    name: appName,
    short_name: shortName,
    description,
    start_url: startUrl,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#FFFFFF',
    theme_color: '#D71920',
    lang: 'en-IN',
    categories: ['business', 'security', 'productivity'],
    prefer_related_applications: false,
    icons: [
      {
        src: '/pwa-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-icon-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
