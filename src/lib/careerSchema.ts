import { z } from 'zod';

const phoneRegex = /^\+?[\d\s\-()]{7,20}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const careerApplicationSchema = z.object({
  name: z
    .string()
    .min(1, 'Full name is required')
    .max(100, 'Name must be 100 characters or fewer'),
  email: z
    .string()
    .min(1, 'Email is required')
    .regex(emailRegex, 'Enter a valid email address'),
  phone: z
    .string()
    .min(1, 'Phone number is required')
    .regex(phoneRegex, 'Enter a valid phone number'),
  jobId: z
    .string()
    .min(1, 'Please select a position'),
  experience: z
    .string()
    .min(1, 'Please mention your experience'),
  currentLocation: z
    .string()
    .min(1, 'Current location is required')
    .max(100),
  message: z
    .string()
    .max(2000, 'Message must be 2000 characters or fewer')
    .optional()
    .default(''),

  // Bot protection
  turnstileToken: z.string().min(1, 'Verification is required'),
  website: z.string().max(0, 'Bot detected').optional().default(''),
  _formLoadedAt: z.number().optional(),
});

export type CareerApplicationInput = z.infer<typeof careerApplicationSchema>;

export const EXPERIENCE_OPTIONS = [
  'Fresher (no prior experience)',
  'Less than 1 year',
  '1–3 years',
  '3–5 years',
  '5–10 years',
  '10+ years',
  'Ex-serviceman',
] as const;
