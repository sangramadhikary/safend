'use cache';

import type { Metadata } from 'next';
import { ContactContent } from '@/components/marketing/ContactContent';
import { JsonLd } from '@/components/seo/JsonLd';
import { contactPageSchema, breadcrumbSchema } from '@/lib/seo/schemas';
import { SITE } from '@/lib/seo/siteConfig';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    `Get in touch with ${SITE.name} to discuss your security requirements. Call ${SITE.phone}, email ${SITE.email}, or visit our office in ${SITE.address.locality}, ${SITE.address.region}.`,
  alternates: {
    canonical: '/contact',
  },
  openGraph: {
    url: `${SITE.url}/contact`,
    type: 'website',
    title: `Contact ${SITE.name}`,
    description: `Call ${SITE.phone} or email ${SITE.email} to discuss your security needs.`,
  },
};

export default async function ContactPage() {
  return (
    <>
      <JsonLd
        data={[
          contactPageSchema(),
          breadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: 'Contact', url: '/contact' },
          ]),
        ]}
      />
      <ContactContent />
    </>
  );
}
