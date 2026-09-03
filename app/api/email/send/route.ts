import { NextRequest, NextResponse } from 'next/server';
import { resend, RESEND_FROM_EMAIL } from '@/lib/resend';
import { rateLimit } from '@/lib/rateLimit';
import { getServerUser, getServerRoles, hasStaffRole } from '@/lib/auth/server-session';

export async function POST(req: NextRequest) {
  // ── Auth guard ──────────────────────────────────────────────────────────────
  // This endpoint sends mail through the service-wide Resend account, so it must
  // never be callable anonymously (open-relay / spam / domain-reputation abuse).
  // Require a confirmed staff session.
  const user = await getServerUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised. You must be signed in.' }, { status: 401 });
  }
  if (!hasStaffRole(await getServerRoles(user.id))) {
    return NextResponse.json({ error: 'Forbidden. Staff role required.' }, { status: 403 });
  }

  // Cap per-sender throughput to blunt mass-mail abuse from a compromised session.
  const { limited, retryAfter } = rateLimit(`email-send:${user.id}`, { limit: 20, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  try {
    const body = await req.json();
    const { to, subject, html, text, cc, bcc, replyTo, attachments } = body;

    // Validate required fields
    if (!to || !subject || (!html && !text)) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, and either html or text' },
        { status: 400 }
      );
    }

    const { data, error } = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
      bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined,
      replyTo: replyTo || undefined,
      attachments: attachments || undefined,
    });

    if (error) {
      console.error('[Resend] Send error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Resend] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    );
  }
}
