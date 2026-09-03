'use cache';

import type { Metadata } from 'next';
import CareersContent from '@/components/marketing/CareersContent';
import { JsonLd } from '@/components/seo/JsonLd';
import { breadcrumbSchema } from '@/lib/seo/schemas';
import { SITE } from '@/lib/seo/siteConfig';

export const metadata: Metadata = {
  title: 'Careers',
  description:
    `Join ${SITE.name} — we're hiring security guards, armed personnel, supervisors, PSOs, and managers across Odisha, Telangana, and West Bengal. Competitive pay, full statutory benefits, and growth from the ground up.`,
  alternates: {
    canonical: '/careers',
  },
  openGraph: {
    url: `${SITE.url}/careers`,
    type: 'website',
    title: `Careers | ${SITE.name}`,
    description:
      'Security industry careers with competitive pay and statutory benefits. Apply for guard, supervisor, PSO, and management roles.',
  },
};

export default async function CareersPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: 'Careers', url: '/careers' },
          ]),
        ]}
      />
      <CareersContent />
    </>
  );
}
