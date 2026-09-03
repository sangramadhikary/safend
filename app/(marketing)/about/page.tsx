'use cache';

import type { Metadata } from 'next';
import { AboutContent } from '@/components/marketing/AboutContent';
import { JsonLd } from '@/components/seo/JsonLd';
import { aboutPageSchema, breadcrumbSchema } from '@/lib/seo/schemas';
import { SITE } from '@/lib/seo/siteConfig';

export const metadata: Metadata = {
  title: 'About',
  description:
    `${SITE.name} was founded in ${SITE.foundingDate} in Cuttack, Odisha. From frontline guarding to a fully incorporated security organisation deploying ${SITE.stats.guards} personnel for ${SITE.stats.clients} clients — built on respect, professionalism, and reliability.`,
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    url: `${SITE.url}/about`,
    type: 'website',
    title: `About ${SITE.name}`,
    description:
      `Founded in ${SITE.foundingDate} in Cuttack, Odisha. Today ${SITE.name} protects businesses, events, and residences across India with ${SITE.stats.guards} active personnel.`,
  },
};

export default async function AboutPage() {
  return (
    <>
      <JsonLd
        data={[
          aboutPageSchema(),
          breadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: 'About', url: '/about' },
          ]),
        ]}
      />
      <AboutContent />
    </>
  );
}
