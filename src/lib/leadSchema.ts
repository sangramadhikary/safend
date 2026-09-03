import { z } from 'zod';

const phoneRegex = /^\+?[\d\s\-()]{7,20}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Comprehensive lead capture schema for a proper security-industry lead.
 *
 * Mandatory: enough to qualify and follow up.
 * Optional: detailed site/scope data that lets the ops team prepare an
 * accurate quote before the first call.
 */
export const leadSchema = z.object({
  // ── Mandatory (contact + intent) ──────────────────────────────────
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or fewer'),
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .regex(phoneRegex, 'Enter a valid phone number'),
  email: z
    .string()
    .min(1, 'Email is required')
    .regex(emailRegex, 'Enter a valid email address'),
  securityNeed: z
    .string()
    .min(1, 'Please select a security need'),
  siteType: z
    .string()
    .min(1, 'Please select a site type'),

  // ── Optional (qualification & scope) ──────────────────────────────
  companyName: z.string().max(120).optional(),
  designation: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(60).optional(),
  siteAddress: z.string().max(300).optional(),
  numberOfSites: z.string().max(20).optional(),
  numberOfGuards: z.string().max(20).optional(),
  shiftType: z.string().optional(),
  startDate: z.string().optional(),
  contractDuration: z.string().optional(),
  currentProvider: z.string().max(120).optional(),
  budget: z.string().optional(),
  howDidYouHear: z.string().optional(),
  message: z.string().max(2000).optional(),

  // ── Bot protection ────────────────────────────────────────────────
  // Cloudflare Turnstile token — required for server-side verification.
  turnstileToken: z.string().min(1, 'Verification is required'),
  // Honeypot field — must be empty (bots auto-fill hidden fields).
  website: z.string().max(0, 'Bot detected').optional().default(''),
});

export type LeadInput = z.infer<typeof leadSchema>;

export const SECURITY_NEED_OPTIONS = [
  'Unarmed Security Guards',
  'Armed Security Personnel',
  'Personal Security Officers (PSO)',
  'Event Guards & Bouncers',
  'Dog Squads (K9)',
  'Electronic Security (CCTV / Alarms)',
  'Patrol & Mobile Response',
  'Complete Site Security (Mixed)',
  'Not sure — need an assessment',
] as const;

export const SITE_TYPE_OPTIONS = [
  'Corporate Office / IT Park',
  'Residential Complex / Gated Community',
  'Factory / Industrial / Warehouse',
  'Retail / Shopping Mall',
  'Hospital / Healthcare',
  'Educational Institution',
  'Event / Venue (Temporary)',
  'Construction Site',
  'Hotel / Hospitality',
  'Bank / Financial Institution',
  'Government / PSU',
  'Other',
] as const;

export const SHIFT_OPTIONS = [
  '24×7 (All shifts)',
  'Day shift only (6 AM – 6 PM)',
  'Night shift only (6 PM – 6 AM)',
  'Custom / Rotational',
] as const;

export const CONTRACT_DURATION_OPTIONS = [
  'Less than 3 months',
  '3 – 6 months',
  '6 – 12 months',
  '1 – 2 years',
  '2+ years',
  'One-time event',
] as const;

export const BUDGET_OPTIONS = [
  'Below ₹50,000 / month',
  '₹50,000 – ₹1,00,000 / month',
  '₹1,00,000 – ₹3,00,000 / month',
  '₹3,00,000 – ₹5,00,000 / month',
  'Above ₹5,00,000 / month',
  'Not sure yet',
] as const;

export const SOURCE_OPTIONS = [
  'Google search',
  'Social media (LinkedIn, Instagram, Facebook)',
  'Referral from a friend / colleague',
  'Industry event / conference',
  'Newspaper / magazine',
  'Other',
] as const;
