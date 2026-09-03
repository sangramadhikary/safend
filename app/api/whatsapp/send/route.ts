import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/lib/rateLimit';
import { getServerUser, getServerRoles, hasStaffRole } from '@/lib/auth/server-session';
import {
  sendTemplateSimple,
  sendVariableTemplate,
  sendSessionMessage,
  sendTextTemplate,
} from '@/lib/whatsapp';

/**
 * POST /api/whatsapp/send
 *
 * Staff-authenticated endpoint for sending WhatsApp messages via Fast2SMS.
 * Supports four modes selected via the `mode` field:
 *
 *   "simple"   — Fast2SMS simple template (GET /dev/whatsapp) using message_id
 *   "template" — META-format text template (no variables)
 *   "variable" — META-format template with body variables
 *   "session"  — Free-form session message (within 24h of customer reply)
 *
 * All modes require a valid staff session. Rate-limited to 30 sends/min per user.
 */

const templateVariableSchema = z.object({
  type: z.enum(['text', 'currency', 'date_time']),
  text: z.string().optional(),
  currency: z
    .object({
      fallback_value: z.string(),
      code: z.string(),
      amount_1000: z.number(),
    })
    .optional(),
  date_time: z.object({ fallback_value: z.string() }).optional(),
});

const sendSchema = z.discriminatedUnion('mode', [
  // Simple template — uses Fast2SMS message_id
  z.object({
    mode: z.literal('simple'),
    numbers: z.string().min(10, 'Recipient number is required'),
    message_id: z.number().int().positive('message_id must be a positive integer'),
    variables_values: z.string().optional(),
    media_url: z.string().url().optional(),
    document_filename: z.string().optional(),
    udf1: z.string().max(50).optional(),
    udf2: z.string().max(50).optional(),
    udf3: z.string().max(50).optional(),
  }),

  // META format — plain text template (no variables)
  z.object({
    mode: z.literal('template'),
    to: z.string().min(10, 'Recipient number is required'),
    templateName: z.string().min(1, 'templateName is required'),
    languageCode: z.string().default('en'),
  }),

  // META format — template with body variables
  z.object({
    mode: z.literal('variable'),
    to: z.string().min(10, 'Recipient number is required'),
    templateName: z.string().min(1, 'templateName is required'),
    languageCode: z.string().default('en'),
    bodyVariables: z
      .array(templateVariableSchema)
      .min(1, 'At least one body variable is required'),
  }),

  // Session message — free-form text reply (within 24h window)
  z.object({
    mode: z.literal('session'),
    to: z.string().min(10, 'Recipient number is required'),
    text: z.string().min(1, 'Message text is required').max(4096),
    udf1: z.string().max(50).optional(),
    udf2: z.string().max(50).optional(),
    udf3: z.string().max(50).optional(),
  }),
]);

export async function POST(req: NextRequest) {
  // ── Auth guard ──────────────────────────────────────────────────────────────
  const user = await getServerUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised. You must be signed in.' }, { status: 401 });
  }
  if (!hasStaffRole(await getServerRoles(user.id))) {
    return NextResponse.json({ error: 'Forbidden. Staff role required.' }, { status: 403 });
  }

  // ── Rate limit ──────────────────────────────────────────────────────────────
  const { limited, retryAfter } = rateLimit(`whatsapp-send:${user.id}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  // ── Parse & validate ────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // ── Dispatch to Fast2SMS ────────────────────────────────────────────────────
  try {
    let result;

    switch (data.mode) {
      case 'simple':
        result = await sendTemplateSimple({
          message_id: data.message_id,
          numbers: data.numbers,
          variables_values: data.variables_values,
          media_url: data.media_url,
          document_filename: data.document_filename,
          udf1: data.udf1,
          udf2: data.udf2,
          udf3: data.udf3,
        });
        break;

      case 'template':
        result = await sendTextTemplate({
          to: data.to,
          templateName: data.templateName,
          languageCode: data.languageCode,
        });
        break;

      case 'variable':
        result = await sendVariableTemplate({
          to: data.to,
          templateName: data.templateName,
          languageCode: data.languageCode,
          bodyVariables: data.bodyVariables,
        });
        break;

      case 'session':
        result = await sendSessionMessage({
          to: data.to,
          text: data.text,
          udf1: data.udf1,
          udf2: data.udf2,
          udf3: data.udf3,
        });
        break;
    }

    if (!result.success) {
      console.error('[WhatsApp] Fast2SMS error:', result);
      return NextResponse.json(
        { error: result.message ?? 'Fast2SMS rejected the request.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[WhatsApp] Unexpected error:', message);
    return NextResponse.json({ error: 'Failed to send WhatsApp message.' }, { status: 500 });
  }
}
