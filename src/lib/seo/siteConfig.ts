/**
 * Single source of truth for site-wide SEO/metadata constants.
 * Update values here once and they propagate through metadata, sitemap,
 * structured data, and content.
 */
export const SITE = {
  name: 'Safend Secure Solutions',
  shortName: 'Safend',
  legalName: 'Safend Secure Solutions',
  url: 'https://www.safend.in',
  domain: 'safend.in',
  locale: 'en_IN',
  // Year the company was founded (used in About + structured data)
  foundingDate: '2010',
  founders: [
    { name: 'Chitta Ranjan Adhikary', role: 'Executive Director' },
    { name: 'Sangram Keshari Adhikary', role: 'Director Operations' },
  ],
  // Public-facing contact details (must match src/data/contact.ts)
  phone: '+91-9777023903',
  email: 'info@safends.com',
  address: {
    street: 'Plot No - 1760, 1st Floor, Sai Balaji Complex, Pratap Nagari',
    locality: 'Cuttack',
    region: 'Odisha',
    postalCode: '753011',
    country: 'IN',
  },
  geo: {
    // Approximate Cuttack centroid — refine if exact office coordinates are needed
    latitude: 20.4625,
    longitude: 85.8828,
  },
  social: {
    linkedin: 'https://www.linkedin.com/company/safends',
    instagram: 'https://www.instagram.com/safendsecuresolutions',
    facebook: 'https://www.facebook.com/safendsecuresolutions',
  },
  // Headline stats reused across structured data and marketing copy
  stats: {
    guards: '2700+',
    clients: '260+',
    years: '14+',
    awards: 4,
  },
  // Default OG image
  ogImage: '/Images/all-guards.webp',
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: 'Safend Secure Solutions — Professional Security Team',
  // Geographic service area
  serviceArea: 'India',
  // Major Indian cities served (for LocalBusiness/Service area markup)
  citiesServed: [
    'Cuttack',
    'Bhubaneswar',
    'Kolkata',
    'Delhi',
    'Mumbai',
    'Bangalore',
    'Hyderabad',
    'Chennai',
  ],
} as const;

export const absoluteUrl = (path = ''): string => {
  if (!path) return SITE.url;
  if (path.startsWith('http')) return path;
  return `${SITE.url}${path.startsWith('/') ? path : `/${path}`}`;
};
