'use cache';

import type { Metadata } from 'next';
import PricingContent from '@/components/marketing/PricingContent';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbSchema } from '@/lib/seo/schemas';
import { SITE } from '@/lib/seo/siteConfig';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    `Transparent security guard pricing from ${SITE.name}. See the all-in per 8-hour duty cost for unarmed guards, armed personnel, supervisors, and patrol officers — built on the Odisha 2026 minimum wage, PF, ESI, bonus, and a flat 10% service charge.`,
  alternates: {
    canonical: '/pricing',
  },
  openGraph: {
    url: `${SITE.url}/pricing`,
    type: 'website',
    title: `Security Guard Pricing | ${SITE.name}`,
    description:
      'Clear, minimum-wage-based rates for security guards and officers. Per 8-hour duty pricing with a full statutory breakdown and a flat 10% service charge.',
  },
};

export default async function PricingPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: 'Pricing', url: '/pricing' },
          ]),
        ]}
      />
      <PricingContent />
    </>
  );
}
