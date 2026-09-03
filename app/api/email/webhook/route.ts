import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';

// All Resend webhook event types
type ResendWebhookEvent =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.bounced'
  | 'email.complained'
  | 'email.opened'
  | 'email.clicked'
  | 'email.failed'
  | 'email.received'
  | 'email.scheduled'
  | 'email.suppressed'
  | 'domain.created'
  | 'domain.updated'
  | 'domain.deleted'
  | 'contact.created'
  | 'contact.updated'
  | 'contact.deleted';

interface WebhookPayload {
  type: ResendWebhookEvent;
  created_at: string;
  data: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[Webhook] RESEND_WEBHOOK_SECRET is not set');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  try {
    // Get raw body for signature verification
    const payload = await req.text();

    // Get Svix headers
    const svixId = req.headers.get('svix-id');
    const svixTimestamp = req.headers.get('svix-timestamp');
    const svixSignature = req.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error('[Webhook] Missing svix headers');
      return NextResponse.json(
        { error: 'Missing webhook verification headers' },
        { status: 400 }
      );
    }

    // Verify the webhook signature
    const wh = new Webhook(webhookSecret);
    const event = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookPayload;

    // Route event to appropriate handler
    switch (event.type) {
      // Email events
      case 'email.sent':
        await handleEmailSent(event);
        break;
      case 'email.delivered':
        await handleEmailDelivered(event);
        break;
      case 'email.delivery_delayed':
        await handleEmailDeliveryDelayed(event);
        break;
      case 'email.bounced':
        await handleEmailBounced(event);
        break;
      case 'email.complained':
        await handleEmailComplained(event);
        break;
      case 'email.opened':
        await handleEmailOpened(event);
        break;
      case 'email.clicked':
        await handleEmailClicked(event);
        break;
      case 'email.failed':
        await handleEmailFailed(event);
        break;
      case 'email.received':
        await handleEmailReceived(event);
        break;
      case 'email.scheduled':
        await handleEmailScheduled(event);
        break;
      case 'email.suppressed':
        await handleEmailSuppressed(event);
        break;

      // Domain events
      case 'domain.created':
        await handleDomainCreated(event);
        break;
      case 'domain.updated':
        await handleDomainUpdated(event);
        break;
      case 'domain.deleted':
        await handleDomainDeleted(event);
        break;

      // Contact events
      case 'contact.created':
        await handleContactCreated(event);
        break;
      case 'contact.updated':
        await handleContactUpdated(event);
        break;
      case 'contact.deleted':
        await handleContactDeleted(event);
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Webhook] Verification failed:', error);
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 400 }
    );
  }
}

// ============================================
// Email Event Handlers
// ============================================

async function handleEmailSent(event: WebhookPayload) {
  console.log('[Webhook] Email sent:', event.data);
  // TODO: Update email status in your database
  // Example: await supabase.from('email_logs').update({ status: 'sent' }).eq('email_id', event.data.email_id);
}

async function handleEmailDelivered(event: WebhookPayload) {
  console.log('[Webhook] Email delivered:', event.data);
  // TODO: Mark email as delivered in your database
}

async function handleEmailDeliveryDelayed(event: WebhookPayload) {
  console.log('[Webhook] Email delivery delayed:', event.data);
  // TODO: Log delay, possibly retry or alert admin
}

async function handleEmailBounced(event: WebhookPayload) {
  console.error('[Webhook] Email bounced:', event.data);
  // TODO: Handle bounce - mark recipient as invalid, update suppression list
}

async function handleEmailComplained(event: WebhookPayload) {
  console.error('[Webhook] Email complaint (spam):', event.data);
  // TODO: Unsubscribe recipient, log complaint
}

async function handleEmailOpened(event: WebhookPayload) {
  console.log('[Webhook] Email opened:', event.data);
  // TODO: Track open rate, update analytics
}

async function handleEmailClicked(event: WebhookPayload) {
  console.log('[Webhook] Email link clicked:', event.data);
  // TODO: Track click-through rate, log which link was clicked
}

async function handleEmailFailed(event: WebhookPayload) {
  console.error('[Webhook] Email failed to send:', event.data);
  // TODO: Log failure reason, alert admin, possibly retry
}

async function handleEmailReceived(event: WebhookPayload) {
  console.log('[Webhook] Email received (inbound):', event.data);
  // TODO: Process inbound email - parse reply, update ticket/conversation
}

async function handleEmailScheduled(event: WebhookPayload) {
  console.log('[Webhook] Email scheduled:', event.data);
  // TODO: Log scheduled email
}

async function handleEmailSuppressed(event: WebhookPayload) {
  console.log('[Webhook] Email suppressed:', event.data);
  // TODO: Log suppression reason
}

// ============================================
// Domain Event Handlers
// ============================================

async function handleDomainCreated(event: WebhookPayload) {
  console.log('[Webhook] Domain created:', event.data);
}

async function handleDomainUpdated(event: WebhookPayload) {
  console.log('[Webhook] Domain updated:', event.data);
}

async function handleDomainDeleted(event: WebhookPayload) {
  console.log('[Webhook] Domain deleted:', event.data);
}

// ============================================
// Contact Event Handlers
// ============================================

async function handleContactCreated(event: WebhookPayload) {
  console.log('[Webhook] Contact created:', event.data);
}

async function handleContactUpdated(event: WebhookPayload) {
  console.log('[Webhook] Contact updated:', event.data);
}

async function handleContactDeleted(event: WebhookPayload) {
  console.log('[Webhook] Contact deleted:', event.data);
}
