import { NextRequest, NextResponse } from 'next/server';
import { careerApplicationSchema } from '@/lib/careerSchema';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { resend, RESEND_FROM_EMAIL } from '@/lib/resend';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { JOB_POSTINGS } from '@/data/careers';

const HR_EMAIL = 'hr@safends.com';

/** Max resume file size: 5 MB */
const MAX_RESUME_SIZE = 5 * 1024 * 1024;
const ALLOWED_RESUME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/** Escape user-provided text before embedding it in HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { limited, retryAfter } = rateLimit(`career:${ip}`, { limit: 5, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request. Expected form data.' },
      { status: 400 }
    );
  }

  // Extract fields from FormData
  const fields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      fields[key] = value;
    }
  }

  // Parse _formLoadedAt as number
  const bodyForValidation = {
    ...fields,
    _formLoadedAt: fields._formLoadedAt ? Number(fields._formLoadedAt) : undefined,
  };

  const parsed = careerApplicationSchema.safeParse(bodyForValidation);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const d = parsed.data;

  // Honeypot
  if (d.website && d.website.length > 0) {
    return NextResponse.json({ success: true, message: 'Application received' }, { status: 201 });
  }

  // Timing check
  if (d._formLoadedAt) {
    const elapsed = Date.now() - d._formLoadedAt;
    if (elapsed < 2000) {
      return NextResponse.json(
        { error: 'Submission too fast. Please try again.' },
        { status: 400 }
      );
    }
  }

  // Turnstile verification
  const turnstile = await verifyTurnstileToken(d.turnstileToken, ip);
  if (!turnstile.success) {
    return NextResponse.json(
      { error: 'Bot verification failed. Please refresh and try again.' },
      { status: 403 }
    );
  }

  // Handle resume file
  const resumeFile = formData.get('resume') as File | null;
  let resumeAttachment: { filename: string; content: Buffer } | null = null;

  if (resumeFile && resumeFile.size > 0) {
    if (!ALLOWED_RESUME_TYPES.includes(resumeFile.type)) {
      return NextResponse.json(
        { error: 'Resume must be a PDF or Word document (.pdf, .doc, .docx).' },
        { status: 400 }
      );
    }
    if (resumeFile.size > MAX_RESUME_SIZE) {
      return NextResponse.json(
        { error: 'Resume file is too large. Maximum size is 5 MB.' },
        { status: 400 }
      );
    }
    const buffer = Buffer.from(await resumeFile.arrayBuffer());
    resumeAttachment = { filename: resumeFile.name, content: buffer };
  }

  // Resolve job title
  const job = JOB_POSTINGS.find((j) => j.id === d.jobId);
  const jobTitle = job?.title ?? d.jobId;

  // Build notification email
  const receivedAt = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const safeName = escapeHtml(d.name);
  const safeEmail = escapeHtml(d.email);
  const safePhone = escapeHtml(d.phone);
  const safeExp = escapeHtml(d.experience);
  const safeLocation = escapeHtml(d.currentLocation);
  const safeMessage = d.message ? escapeHtml(d.message).replace(/\n/g, '<br />') : '—';

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color: #111111;">
      <div style="border-bottom: 3px solid #D71920; padding-bottom: 16px; margin-bottom: 24px;">
        <h1 style="font-size: 20px; margin: 0; color: #111111;">New Job Application</h1>
        <p style="font-size: 13px; color: #6B6B6B; margin: 6px 0 0;">Received ${receivedAt} IST</p>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; color: #6B6B6B; width: 140px; vertical-align: top;">Position</td>
          <td style="padding: 8px 0; color: #D71920; font-weight: 600;">${escapeHtml(jobTitle)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B6B6B; vertical-align: top;">Name</td>
          <td style="padding: 8px 0; color: #111111; font-weight: 600;">${safeName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B6B6B; vertical-align: top;">Email</td>
          <td style="padding: 8px 0;"><a href="mailto:${safeEmail}" style="color: #D71920;">${safeEmail}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B6B6B; vertical-align: top;">Phone</td>
          <td style="padding: 8px 0;"><a href="tel:${safePhone}" style="color: #111111;">${safePhone}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B6B6B; vertical-align: top;">Experience</td>
          <td style="padding: 8px 0; color: #111111;">${safeExp}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B6B6B; vertical-align: top;">Location</td>
          <td style="padding: 8px 0; color: #111111;">${safeLocation}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B6B6B; vertical-align: top;">Message</td>
          <td style="padding: 8px 0; color: #111111; line-height: 1.6;">${safeMessage}</td>
        </tr>
      </table>
      <p style="font-size: 12px; color: #9A9A9A; margin-top: 28px; border-top: 1px solid #E5E0DD; padding-top: 16px;">
        This notification was sent automatically from the Safend careers page.
      </p>
    </div>
  `;

  const text =
    `New Job Application (${receivedAt} IST)\n\n` +
    `Position: ${jobTitle}\n` +
    `Name: ${d.name}\n` +
    `Email: ${d.email}\n` +
    `Phone: ${d.phone}\n` +
    `Experience: ${d.experience}\n` +
    `Location: ${d.currentLocation}\n` +
    `Message: ${d.message || '—'}\n`;

  try {
    const { error } = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: [HR_EMAIL],
      subject: `Job Application: ${jobTitle} — ${d.name}`,
      html,
      text,
      replyTo: d.email,
      ...(resumeAttachment && {
        attachments: [
          {
            filename: resumeAttachment.filename,
            content: resumeAttachment.content,
          },
        ],
      }),
    });

    if (error) {
      console.error('[career-apply] Email send error:', error);
      return NextResponse.json(
        { error: 'Failed to submit application. Please try again later.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Application submitted successfully' },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('[career-apply] Unexpected error:', err?.message ?? err);
    return NextResponse.json(
      { error: 'Failed to submit application. Please try again later.' },
      { status: 500 }
    );
  }
}
