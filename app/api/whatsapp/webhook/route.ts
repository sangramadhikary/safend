import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/whatsapp/webhook
 *
 * Receives real-time delivery status updates and incoming messages from Fast2SMS
 * WhatsApp webhooks. Configure this URL in the Fast2SMS Dashboard:
 *
 *   Dashboard → WhatsApp → Webhooks → Create Webhook → URL: https://safend.in/api/whatsapp/webhook
 *
 * Fast2SMS sends a POST request with a JSON payload. No webhook signature verification
 * is provided by Fast2SMS (unlike Resend/Svix), so we validate the shape of the payload
 * instead and optionally gate on a shared secret via the FAST2SMS_WEBHOOK_SECRET env var.
 *
 * Payload types handled:
 *   status_update    — delivery, delivered, read, failed
 *   incoming_message — customer replied to us
 *
 * See: https://docs.fast2sms.com/reference/whatsapp-webhook
 */

// ─── Webhook payload types ────────────────────────────────────────────────────

interface StatusUpdatePayload {
  webhook_type: 'status_update';
  request_id: string;
  route: string;
  mobile: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  status_description: string;
  phone_number_id: string;
  display_phone_number: string;
  waba_id: string;
  recipient_id: string;
  category?: string;
  delivery_attempt?: number;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  post_attempt?: number;
}

interface IncomingMessagePayload {
  webhook_type: 'incoming_message';
  phone_number_id: string;
  display_phone_number: string;
  waba_id: string;
  from: string;
  message_type: 'text' | 'image' | 'video' | 'document' | 'audio' | 'location' | string;
  body?: string;
  mime_type?: string;
  media_url?: string;
  caption?: string;
}

type WebhookPayload = StatusUpdatePayload | IncomingMessagePayload;

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Optional shared-secret gate. Configure FAST2SMS_WEBHOOK_SECRET and pass it
  // as a query param or x-webhook-secret header when creating the webhook in
  // Fast2SMS Dashboard. Falls open (allows all) when secret is not configured.
  const webhookSecret = process.env.FAST2SMS_WEBHOOK_SECRET;
  if (webhookSecret) {
    const providedSecret =
      req.headers.get('x-webhook-secret') ??
      req.nextUrl.searchParams.get('secret');

    if (providedSecret !== webhookSecret) {
      console.warn('[WhatsApp Webhook] Invalid or missing webhook secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Parse body
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    !('webhook_type' in payload)
  ) {
    return NextResponse.json({ error: 'Unrecognised payload shape.' }, { status: 400 });
  }

  const event = payload as WebhookPayload;

  try {
    switch (event.webhook_type) {
      case 'status_update':
        await handleStatusUpdate(event as StatusUpdatePayload);
        break;
      case 'incoming_message':
        await handleIncomingMessage(event as IncomingMessagePayload);
        break;
      default:
        console.log(`[WhatsApp Webhook] Unhandled webhook_type: ${(event as WebhookPayload).webhook_type}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Log but never return 5xx — Fast2SMS will retry on non-2xx responses,
    // which could cause duplicate processing.
    console.error('[WhatsApp Webhook] Handler error:', message);
  }

  // Always respond 200 immediately so Fast2SMS doesn't retry.
  return NextResponse.json({ received: true });
}

// ─── Event handlers ───────────────────────────────────────────────────────────

async function handleStatusUpdate(event: StatusUpdatePayload) {
  console.log(
    `[WhatsApp Webhook] Status update — ${event.request_id}: ${event.status} (${event.status_description})`,
  );

  // TODO: Persist delivery status in your database, e.g.:
  // await supabaseAdmin
  //   .from('whatsapp_message_logs')
  //   .update({ status: event.status, delivered_at: new Date().toISOString() })
  //   .eq('request_id', event.request_id);

  switch (event.status) {
    case 'delivered':
      // Message reached the recipient's device
      break;
    case 'read':
      // Recipient opened the message
      break;
    case 'failed':
      // Delivery failed — consider alerting staff or scheduling a retry
      console.error(
        `[WhatsApp Webhook] Delivery failed for ${event.mobile}: ${event.status_description}`,
      );
      break;
    default:
      break;
  }
}

async function handleIncomingMessage(event: IncomingMessagePayload) {
  console.log(
    `[WhatsApp Webhook] Incoming message from ${event.from} (type: ${event.message_type}): ${event.body ?? '[media]'}`,
  );

  // TODO: Store incoming message and notify staff, e.g.:
  // await supabaseAdmin.from('whatsapp_inbound').insert({
  //   from: event.from,
  //   message_type: event.message_type,
  //   body: event.body ?? null,
  //   media_url: event.media_url ?? null,
  //   received_at: new Date().toISOString(),
  // });

  // TODO: Optionally route to the right staff member based on event.from
  // or send an auto-acknowledgement session message using sendSessionMessage().
}
