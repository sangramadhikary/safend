'use cache';

import type { Metadata } from 'next';
import ServicesContent from '@/components/marketing/ServicesContent';
import { JsonLd } from '@/components/seo/JsonLd';
import { servicesSchema, breadcrumbSchema } from '@/lib/seo/schemas';
import { SITE } from '@/lib/seo/siteConfig';

export const metadata: Metadata = {
  title: 'Security Services',
  description:
    `Every threat, one partner. ${SITE.name} provides armed and unarmed security guards, personal security officers, event security, K9 dog squads, and electronic surveillance across India. PSARA-licensed officers, 120+ hours of training, and 24/7 operations.`,
  alternates: {
    canonical: '/services',
  },
  openGraph: {
    url: `${SITE.url}/services`,
    type: 'website',
    title: `Security Services | ${SITE.name}`,
    description:
      'Armed and unarmed security guards, personal security officers, event guards, K9 dog squads, and electronic surveillance — across India.',
  },
};

export default async function ServicesPage() {
  return (
    <>
      <JsonLd
        data={[
          ...servicesSchema(),
          breadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: 'Services', url: '/services' },
          ]),
        ]}
      />
      <ServicesContent />
    </>
  );
}
