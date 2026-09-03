import { z } from 'zod';

const phoneRegex = /^\+?[\d\s\-()]{7,20}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const enquirySchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or fewer'),
  contactMethod: z.string()
    .min(1, 'Contact method is required')
    .refine(
      (val) => emailRegex.test(val) || phoneRegex.test(val),
      'Must be a valid email address or phone number'
    ),
  message: z.string()
    .min(1, 'Message is required')
    .max(2000, 'Message must be 2000 characters or fewer'),
  // Cloudflare Turnstile token — required for bot protection.
  turnstileToken: z.string().min(1, 'Verification is required'),
  // Honeypot field — must be empty (bots auto-fill hidden fields).
  website: z.string().max(0, 'Bot detected').optional().default(''),
  // Timestamp when the form was rendered (ms since epoch). Used to reject
  // submissions that arrive suspiciously fast (< 2s after render).
  _formLoadedAt: z.number().optional(),
});

export type EnquiryInput = z.infer<typeof enquirySchema>;
