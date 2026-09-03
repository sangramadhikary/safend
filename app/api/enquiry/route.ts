import { NextRequest, NextResponse } from 'next/server';
import { enquirySchema } from '@/lib/enquirySchema';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { resend, RESEND_FROM_EMAIL } from '@/lib/resend';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

// Where new enquiry notifications are sent.
const ENQUIRY_NOTIFY_EMAIL = process.env.ENQUIRY_NOTIFY_EMAIL || 'admin@safends.com';

/** Escape user-provided text before embedding it in the notification HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Fire a notification email to the admin inbox. Never throws — email delivery
 * is best-effort and must not block or fail the enquiry submission itself.
 */
async function sendEnquiryNotification(input: {
  id?: string;
  name: string;
  contactMethod: string;
  message: string;
}): Promise<void> {
  try {
    const safeName = escapeHtml(input.name);
    const safeContact = escapeHtml(input.contactMethod);
    const safeMessage = escapeHtml(input.message).replace(/\n/g, '<br />');
    const receivedAt = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    // If the contact method is an email, set it as reply-to for one-click replies.
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactMethod);

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color: #111111;">
        <div style="border-bottom: 3px solid #D71920; padding-bottom: 16px; margin-bottom: 24px;">
          <h1 style="font-size: 20px; margin: 0; color: #111111;">New Website Enquiry</h1>
          <p style="font-size: 13px; color: #6B6B6B; margin: 6px 0 0;">Submitted ${receivedAt} IST</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 0; color: #6B6B6B; width: 130px; vertical-align: top;">Name</td>
            <td style="padding: 8px 0; color: #111111; font-weight: 600;">${safeName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6B6B6B; vertical-align: top;">Contact</td>
            <td style="padding: 8px 0; color: #111111; font-weight: 600;">${safeContact}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6B6B6B; vertical-align: top;">Message</td>
            <td style="padding: 8px 0; color: #111111; line-height: 1.6;">${safeMessage}</td>
          </tr>
          ${input.id ? `<tr><td style="padding: 8px 0; color: #6B6B6B;">Reference</td><td style="padding: 8px 0; color: #6B6B6B; font-size: 12px;">${escapeHtml(input.id)}</td></tr>` : ''}
        </table>
        <p style="font-size: 12px; color: #9A9A9A; margin-top: 28px; border-top: 1px solid #E5E0DD; padding-top: 16px;">
          This notification was sent automatically from the Safend website contact form.
        </p>
      </div>
    `;

    const text =
      `New Website Enquiry (${receivedAt} IST)\n\n` +
      `Name: ${input.name}\n` +
      `Contact: ${input.contactMethod}\n` +
      `Message:\n${input.message}\n` +
      (input.id ? `\nReference: ${input.id}\n` : '');

    const { error } = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: [ENQUIRY_NOTIFY_EMAIL],
      subject: `New enquiry from ${input.name}`,
      html,
      text,
      replyTo: isEmail ? input.contactMethod : undefined,
    });

    if (error) {
      console.error('[enquiry] Notification email error:', error);
    }
  } catch (err: any) {
    console.error('[enquiry] Notification email unexpected error:', err?.message ?? err);
  }
}

/**
 * Send an auto-reply confirmation to the person who submitted the form, but
 * only when they provided a valid email address. Best-effort; never throws.
 */
async function sendAutoReply(input: { name: string; contactMethod: string }): Promise<void> {
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactMethod);
  if (!isEmail) return; // No email to reply to (they left a phone number).

  try {
    const safeName = escapeHtml(input.name);
    const firstName = safeName.split(' ')[0] || 'there';

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color: #111111;">
        <div style="border-bottom: 3px solid #D71920; padding-bottom: 16px; margin-bottom: 24px;">
          <h1 style="font-size: 22px; margin: 0; color: #111111;">Thanks for reaching out, ${firstName}.</h1>
        </div>
        <p style="font-size: 15px; line-height: 1.7; color: #333333; margin: 0 0 16px;">
          We&rsquo;ve received your enquiry and a member of our team will get back to
          you within 24 hours. If your requirement is urgent, you can reach us
          directly on the number below.
        </p>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 24px 0;">
          <tr>
            <td style="padding: 6px 0; color: #6B6B6B; width: 90px;">Phone</td>
            <td style="padding: 6px 0;"><a href="tel:+919777023903" style="color: #D71920; text-decoration: none; font-weight: 600;">+91 97770 23903</a></td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6B6B6B;">Email</td>
            <td style="padding: 6px 0;"><a href="mailto:info@safends.com" style="color: #D71920; text-decoration: none; font-weight: 600;">info@safends.com</a></td>
          </tr>
        </table>
        <p style="font-size: 15px; line-height: 1.7; color: #333333; margin: 0;">
          Warm regards,<br />
          <strong>The Safend Team</strong>
        </p>
        <p style="font-size: 12px; color: #9A9A9A; margin-top: 28px; border-top: 1px solid #E5E0DD; padding-top: 16px;">
          Safend Secure Solutions &middot; Responsible Security for Productive Businesses.<br />
          This is an automated confirmation — please do not reply to this email.
        </p>
      </div>
    `;

    const text =
      `Thanks for reaching out, ${input.name.split(' ')[0] || 'there'}.\n\n` +
      `We've received your enquiry and a member of our team will get back to you within 24 hours.\n\n` +
      `If your requirement is urgent, reach us directly:\n` +
      `Phone: +91 97770 23903\n` +
      `Email: info@safends.com\n\n` +
      `Warm regards,\nThe Safend Team\n\n` +
      `Safend Secure Solutions — Responsible Security for Productive Businesses.\n` +
      `This is an automated confirmation — please do not reply to this email.`;

    const { error } = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: [input.contactMethod],
      subject: 'We\u2019ve received your enquiry — Safend',
      html,
      text,
      replyTo: ENQUIRY_NOTIFY_EMAIL,
    });

    if (error) {
      console.error('[enquiry] Auto-reply email error:', error);
    }
  } catch (err: any) {
    console.error('[enquiry] Auto-reply email unexpected error:', err?.message ?? err);
  }
}

// Credentials must be set via environment variables — no hardcoded fallbacks.
// Service-role client — bypasses RLS so public enquiries can be inserted
// server-side without an authenticated session.
export async function POST(request: NextRequest) {
  // Rate limit: this endpoint is public and writes via the service-role client,
  // so cap submissions per IP to blunt spam/abuse.
  const ip = getClientIp(request);
  const { limited, retryAfter } = rateLimit(`enquiry:${ip}`, { limit: 5, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  // Parse the JSON body. Malformed JSON is treated as a bad request.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body. Expected JSON.' },
      { status: 400 }
    );
  }

  // Validate against the shared enquiry schema.
  const parsed = enquirySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        // Field-level errors so the client can identify each invalid field.
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { name, contactMethod, message, turnstileToken, website, _formLoadedAt } = parsed.data;

  // ── Honeypot check: if the hidden field is filled, it's a bot ──
  if (website && website.length > 0) {
    // Return 201 to avoid revealing the trap to pen-testers.
    return NextResponse.json(
      { success: true, message: 'Enquiry received' },
      { status: 201 }
    );
  }

  // ── Time-based check: reject instant submissions (< 2s) ──
  if (_formLoadedAt) {
    const elapsed = Date.now() - _formLoadedAt;
    if (elapsed < 2000) {
      return NextResponse.json(
        { error: 'Submission too fast. Please try again.' },
        { status: 400 }
      );
    }
  }

  // ── Turnstile verification ──
  const turnstileResult = await verifyTurnstileToken(turnstileToken, ip);
  if (!turnstileResult.success) {
    return NextResponse.json(
      { error: 'Bot verification failed. Please refresh and try again.' },
      { status: 403 }
    );
  }

  try {
    // Map camelCase form field `contactMethod` to the snake_case DB column.
    const { data, error } = await supabaseAdmin
      .from('marketing_enquiries')
      .insert({
        name,
        contact_method: contactMethod,
        message,
        status: 'new',
      })
      .select('id')
      .single();

    if (error) {
      console.error('[enquiry] Insert error:', error.message);
      return NextResponse.json(
        { error: 'Failed to submit enquiry. Please try again later.' },
        { status: 500 }
      );
    }

    // Best-effort emails — admin notification + customer auto-reply. Both have
    // their own internal error handling (never throw), run concurrently, and
    // must settle before the serverless function freezes.
    await Promise.allSettled([
      sendEnquiryNotification({ id: data?.id, name, contactMethod, message }),
      sendAutoReply({ name, contactMethod }),
    ]);

    return NextResponse.json(
      { success: true, id: data?.id, message: 'Enquiry received' },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('[enquiry] Unexpected error:', err?.message ?? err);
    return NextResponse.json(
      { error: 'Failed to submit enquiry. Please try again later.' },
      { status: 500 }
    );
  }
}
