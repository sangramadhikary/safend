/**
 * Schema.org / JSON-LD structured-data builders.
 * All schemas use the centralised `SITE` config so values stay consistent
 * with metadata, sitemap and visible content.
 *
 * Reference: https://schema.org and Google's Search Central guidelines.
 */
import { SITE, absoluteUrl } from './siteConfig';
import { SERVICES } from '@/data/services';
import type { BlogPost } from '@/types/blog';

const ORG_ID = `${SITE.url}/#organization`;
const WEBSITE_ID = `${SITE.url}/#website`;
const LOCAL_BUSINESS_ID = `${SITE.url}/#localbusiness`;

/* ─── Postal address (shared) ───────────────────────────────────────────── */
function postalAddress() {
  return {
    '@type': 'PostalAddress',
    streetAddress: SITE.address.street,
    addressLocality: SITE.address.locality,
    addressRegion: SITE.address.region,
    postalCode: SITE.address.postalCode,
    addressCountry: SITE.address.country,
  };
}

/* ─── Organization ──────────────────────────────────────────────────────── */
export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE.name,
    legalName: SITE.legalName,
    alternateName: SITE.shortName,
    url: SITE.url,
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl('/logo.png'),
      caption: `${SITE.name} logo`,
    },
    image: absoluteUrl(SITE.ogImage),
    description:
      'Safend Secure Solutions is a private security services company headquartered in Cuttack, Odisha, providing armed and unarmed guarding, personal security officers, event security, K9 units and electronic surveillance to clients across India since 2010.',
    foundingDate: SITE.foundingDate,
    founders: SITE.founders.map((f) => ({
      '@type': 'Person',
      name: f.name,
      jobTitle: f.role,
    })),
    address: postalAddress(),
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        telephone: SITE.phone,
        email: SITE.email,
        areaServed: 'IN',
        availableLanguage: ['en', 'hi', 'or'],
      },
      {
        '@type': 'ContactPoint',
        contactType: 'sales',
        telephone: SITE.phone,
        email: SITE.email,
        areaServed: 'IN',
        availableLanguage: ['en', 'hi', 'or'],
      },
    ],
    sameAs: [SITE.social.linkedin, SITE.social.instagram, SITE.social.facebook],
    areaServed: {
      '@type': 'Country',
      name: SITE.serviceArea,
    },
    knowsAbout: [
      'Private security',
      'PSARA compliance',
      'Armed security guards',
      'Unarmed security guards',
      'Personal security officers',
      'Event security',
      'K9 detection',
      'Electronic surveillance',
    ],
  };
}

/* ─── LocalBusiness / SecurityService ───────────────────────────────────── */
export function localBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'SecurityService'],
    '@id': LOCAL_BUSINESS_ID,
    name: SITE.name,
    image: absoluteUrl(SITE.ogImage),
    url: SITE.url,
    telephone: SITE.phone,
    email: SITE.email,
    priceRange: '₹₹',
    address: postalAddress(),
    geo: {
      '@type': 'GeoCoordinates',
      latitude: SITE.geo.latitude,
      longitude: SITE.geo.longitude,
    },
    areaServed: SITE.citiesServed.map((city) => ({
      '@type': 'City',
      name: city,
    })),
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ],
        opens: '00:00',
        closes: '23:59',
        description: '24/7 security operations centre',
      },
    ],
    sameAs: [SITE.social.linkedin, SITE.social.instagram, SITE.social.facebook],
    parentOrganization: { '@id': ORG_ID },
  };
}

/* ─── WebSite ───────────────────────────────────────────────────────────── */
export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: SITE.url,
    name: SITE.name,
    inLanguage: 'en-IN',
    publisher: { '@id': ORG_ID },
  };
}

/* ─── BreadcrumbList ────────────────────────────────────────────────────── */
export type BreadcrumbItem = { name: string; url: string };
export function breadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

/* ─── Service (one per SERVICES entry) ──────────────────────────────────── */
export function servicesSchema() {
  return SERVICES.map((s) => ({
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${SITE.url}/services#${s.id}`,
    serviceType: s.name,
    name: s.name,
    description: s.description,
    image: absoluteUrl(s.image || SITE.ogImage),
    provider: { '@id': ORG_ID },
    areaServed: {
      '@type': 'Country',
      name: SITE.serviceArea,
    },
    audience: {
      '@type': 'BusinessAudience',
      audienceType: s.useCases?.join(', '),
    },
    hasOfferCatalog: s.features
      ? {
          '@type': 'OfferCatalog',
          name: `${s.name} — capabilities`,
          itemListElement: s.features.map((f, i) => ({
            '@type': 'Offer',
            position: i + 1,
            itemOffered: {
              '@type': 'Service',
              name: f,
            },
          })),
        }
      : undefined,
    url: `${SITE.url}/services#${s.id}`,
  }));
}

/* ─── FAQPage ───────────────────────────────────────────────────────────── */
export type FaqItem = { question: string; answer: string };
export function faqPageSchema(items: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.answer,
      },
    })),
  };
}

/* ─── AboutPage ─────────────────────────────────────────────────────────── */
export function aboutPageSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    '@id': `${SITE.url}/about#aboutpage`,
    url: `${SITE.url}/about`,
    name: `About ${SITE.name}`,
    description:
      `${SITE.name} was founded in ${SITE.foundingDate} in Cuttack, Odisha. The company has grown from a single proprietorship into a properly incorporated security services organisation deploying ${SITE.stats.guards} active personnel for ${SITE.stats.clients} clients across India.`,
    mainEntity: { '@id': ORG_ID },
    breadcrumb: breadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'About', url: '/about' },
    ]),
  };
}

/* ─── Blog (CollectionPage / Blog) ──────────────────────────────────────── */
export function blogSchema(posts: BlogPost[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `${SITE.url}/blog#blog`,
    url: `${SITE.url}/blog`,
    name: `${SITE.name} Blog`,
    description:
      `Security insights, buyer guides, and practical advice from ${SITE.name} — covering private security, PSARA compliance, event safety, and protecting people and property across India.`,
    inLanguage: 'en-IN',
    publisher: { '@id': ORG_ID },
    blogPost: posts.map((p) => ({
      '@type': 'BlogPosting',
      '@id': `${SITE.url}/blog/${p.slug}#article`,
      headline: p.title,
      description: p.excerpt,
      url: `${SITE.url}/blog/${p.slug}`,
      datePublished: p.publishedDate,
      dateModified: p.updatedDate ?? p.publishedDate,
      image: absoluteUrl(p.coverImage),
      author: { '@type': 'Person', name: p.author.name },
    })),
  };
}

/* ─── BlogPosting (single article) ──────────────────────────────────────── */
export function blogPostingSchema(post: BlogPost) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${SITE.url}/blog/${post.slug}#article`,
    isPartOf: { '@id': `${SITE.url}/blog#blog` },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${SITE.url}/blog/${post.slug}`,
    },
    headline: post.title,
    description: post.excerpt,
    // AEO/GEO: a concise, self-contained answer engines can extract and cite.
    abstract: post.tldr,
    image: {
      '@type': 'ImageObject',
      url: absoluteUrl(post.coverImage),
      width: SITE.ogImageWidth,
      height: SITE.ogImageHeight,
    },
    datePublished: post.publishedDate,
    dateModified: post.updatedDate ?? post.publishedDate,
    articleSection: post.category,
    keywords: post.tags.join(', '),
    // Entity signals — help search + generative engines understand topic.
    about: [
      { '@type': 'Thing', name: post.category },
      ...post.tags.map((t) => ({ '@type': 'Thing', name: t })),
    ],
    wordCount: post.content.reduce(
      (n, s) => n + s.paragraphs.join(' ').split(/\s+/).length,
      0
    ),
    timeRequired: `PT${post.readingTime}M`,
    inLanguage: 'en-IN',
    // Free to read — a positive signal for answer/generative engines.
    isAccessibleForFree: true,
    // Point voice/answer engines at the headline and the direct answer.
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['h1', '.post-tldr'],
    },
    author: {
      '@type': 'Person',
      name: post.author.name,
      jobTitle: post.author.role,
      url: `${SITE.url}/about`,
      worksFor: { '@id': ORG_ID },
    },
    publisher: { '@id': ORG_ID },
    url: `${SITE.url}/blog/${post.slug}`,
  };
}

/* ─── ContactPage ───────────────────────────────────────────────────────── */
export function contactPageSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    '@id': `${SITE.url}/contact#contactpage`,
    url: `${SITE.url}/contact`,
    name: `Contact ${SITE.name}`,
    description: `Get in touch with ${SITE.name} to discuss your security requirements.`,
    mainEntity: { '@id': ORG_ID },
    breadcrumb: breadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'Contact', url: '/contact' },
    ]),
  };
}
