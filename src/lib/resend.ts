import { Resend } from 'resend';

// Lazy validation — only throw at runtime when resend is actually called,
// not at build time during page data collection.
function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }
  return new Resend(process.env.RESEND_API_KEY);
}

export const resend = new Proxy({} as Resend, {
  get(_target, prop) {
    return (getResend() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || 'Safend <noreply@update.safends.com>';

export const RESEND_DOMAIN = process.env.RESEND_DOMAIN || 'update.safends.com';
