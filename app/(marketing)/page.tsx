'use cache';

import type { Metadata } from 'next';
import HeroSection from '@/components/marketing/HeroSection';
import ServiceHighlights from '@/components/marketing/ServiceHighlights';
import { StatementBand } from '@/components/marketing/StatementBand';
import { Industries } from '@/components/marketing/Industries';
import WhySafend from '@/components/marketing/WhySafend';
import { ClientLogos } from '@/components/marketing/ClientLogos';
import { Testimonials } from '@/components/marketing/Testimonials';
import { FAQ } from '@/components/marketing/FAQ';
import { HomeCta } from '@/components/marketing/HomeCta';
import { JsonLd } from '@/components/seo/JsonLd';
import { faqPageSchema } from '@/lib/seo/schemas';
import { FAQ_ITEMS } from '@/data/faq';
import { SITE } from '@/lib/seo/siteConfig';

export const metadata: Metadata = {
  title: `${SITE.name} | Professional Security Services in India`,
  description:
    `Protecting people, property, and peace of mind across India since ${SITE.foundingDate}. Armed guards, unarmed guards, PSOs, event security, dog squads, and electronic surveillance from ${SITE.name}, headquartered in Cuttack, Odisha.`,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    url: SITE.url,
    type: 'website',
  },
};

export default async function MarketingHomePage() {
  return (
    <>
      {/* FAQ schema — derived from the same list rendered in <FAQ />,
          so visible answers and structured data never drift apart. */}
      <JsonLd data={faqPageSchema([...FAQ_ITEMS])} />

      <HeroSection />
      <StatementBand
        text="We show up on time, stay alert, and give you one less thing to worry about."
      />
      <ServiceHighlights />
      <Industries />
      <WhySafend />
      <ClientLogos />
      <Testimonials />
      <FAQ />
      <HomeCta />
    </>
  );
}
