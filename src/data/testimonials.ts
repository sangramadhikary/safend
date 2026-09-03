export interface Testimonial {
  id: string;
  quote: string;
  author: string;
  role: string;
  rating: number; // 1-5
}

/**
 * Social-proof testimonials shown on the landing page.
 *
 * NOTE: These are representative placeholders written from the kind of
 * feedback security clients give. Replace `author`/`role`/`quote` with real,
 * permission-cleared client testimonials before going live — real names and
 * companies convert significantly better than anonymous quotes.
 */
export const TESTIMONIALS: Testimonial[] = [
  {
    id: 'corporate-park',
    quote:
      'Safend transformed how we think about site security. Their guards are professional, punctual, and genuinely vigilant. Incidents dropped to zero within the first quarter.',
    author: 'Facilities Director',
    role: 'Corporate Business Park, Bhubaneswar',
    rating: 5,
  },
  {
    id: 'event-management',
    quote:
      'We handle large events and crowd control is everything. Safend’s team manages access and de-escalation flawlessly. They are now our default security partner.',
    author: 'Operations Head',
    role: 'Event Management Company, Cuttack',
    rating: 5,
  },
  {
    id: 'residential',
    quote:
      'Reliable, courteous, and always reachable. Switching to Safend gave our residents real peace of mind, and their response time is the fastest we have seen.',
    author: 'Secretary',
    role: 'Residential Welfare Association, Odisha',
    rating: 5,
  },
];

export const TRUST_LOGOS = [
  'Corporate Parks',
  'Retail Chains',
  'Event Venues',
  'Residential Complexes',
  'Industrial Sites',
];
