import '@/index.css';
import '@/styles/module-styles.css';
import '@/styles/audit-print.css';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'leaflet/dist/leaflet.css';
import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { SITE } from '@/lib/seo/siteConfig';
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} | Professional Security Services in India`,
    template: `%s | ${SITE.name}`,
  },
  description:
    `Premium security services across India — armed & unarmed guards, personal security officers, event security, K9 units, and electronic surveillance. Trusted since ${SITE.foundingDate}.`,
  applicationName: SITE.name,
  authors: [{ name: SITE.legalName, url: SITE.url }],
  creator: SITE.legalName,
  publisher: SITE.legalName,
  category: 'Security Services',
  keywords: [
    'security services India',
    'private security agency Odisha',
    'security company Cuttack',
    'security company Bhubaneswar',
    'armed security guards',
    'unarmed security guards',
    'personal security officer',
    'PSARA licensed guards',
    'event security',
    'K9 dog squad security',
    'CCTV installation',
    'electronic security',
    'corporate security',
    'bodyguard services',
    'cash in transit security',
  ],
  alternates: {
    canonical: SITE.url,
    types: {
      'application/rss+xml': '/blog/feed.xml',
    },
  },
  openGraph: {
    type: 'website',
    locale: SITE.locale,
    url: SITE.url,
    siteName: SITE.name,
    title: `${SITE.name} | Professional Security Services in India`,
    description:
      `Premium security services across India — armed & unarmed guards, personal security officers, event security, K9 units, and electronic surveillance. Trusted since ${SITE.foundingDate}.`,
    images: [
      {
        url: SITE.ogImage,
        width: SITE.ogImageWidth,
        height: SITE.ogImageHeight,
        alt: SITE.ogImageAlt,
        type: 'image/webp',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE.name} | Professional Security Services in India`,
    description:
      `Premium security services across India — armed & unarmed guards, PSOs, event security, K9 units, and electronic surveillance.`,
    images: [SITE.ogImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png' },
    ],
    apple: [
      { url: '/icon-maskable.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/favicon.png',
  },
  formatDetection: {
    email: false,
    telephone: false,
    address: false,
  },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0F19' },
  ],
  colorScheme: 'light dark',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        {/* PWA — native app feel on iOS */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Safend" />
        <link rel="apple-touch-icon" href="/pwa-icon-192.png" />
        {/* Prevent text size adjustment on orientation change */}
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body suppressHydrationWarning>
        <ServiceWorkerRegistrar />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
