/**
 * Fast2SMS WhatsApp (WABA) client
 *
 * Wraps the Fast2SMS WhatsApp APIs:
 *  Messaging:
 *    sendTemplateSimple     GET  /dev/whatsapp                              (Fast2SMS simple format, message_id based)
 *    sendTextTemplate       POST /dev/whatsapp/{version}/{phone_id}/messages (META — no variables)
 *    sendVariableTemplate   POST /dev/whatsapp/{version}/{phone_id}/messages (META — with body variables)
 *    sendSessionMessage     POST /dev/whatsapp-session                      (free-form, within 24h window)
 *
 *  Template management:
 *    getAllTemplates         GET  /dev/whatsapp/{version}/{waba_id}/message_templates  (paginated)
 *    getTemplateById        GET  /dev/whatsapp/{version}/{template_id}
 *    getTemplateByName      GET  /dev/whatsapp/{version}/{waba_id}/message_templates?name=
 *
 *  Account:
 *    getWabaDetails         GET  /dev/dlt_manager/whatsapp  (phone numbers + Fast2SMS message_ids)
 *
 * Authorization: plain API key in the `Authorization` header (no "Bearer" prefix).
 *
 * Required env vars:
 *   FAST2SMS_API_KEY           — API key from Fast2SMS Dev API panel
 *   FAST2SMS_PHONE_NUMBER_ID   — WABA phone number ID (from WhatsApp Manager panel)
 *   FAST2SMS_WABA_ID           — WABA Account ID (needed for template listing)
 *
 * Optional env vars:
 *   FAST2SMS_API_VERSION       — defaults to v24.0
 */

import 'server-only';

const BASE_URL = 'https://www.fast2sms.com/dev';
const WABA_VERSION = process.env.FAST2SMS_API_VERSION ?? 'v24.0';

function getApiKey(): string {
  const key = process.env.FAST2SMS_API_KEY;
  if (!key) throw new Error('FAST2SMS_API_KEY environment variable is not set');
  return key;
}

function getPhoneNumberId(): string {
  const id = process.env.FAST2SMS_PHONE_NUMBER_ID;
  if (!id) throw new Error('FAST2SMS_PHONE_NUMBER_ID environment variable is not set');
  return id;
}

/** Shared headers for every Fast2SMS request */
function headers(): HeadersInit {
  return {
    Authorization: getApiKey(),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// ─── Response types ───────────────────────────────────────────────────────────

export interface Fast2SMSSuccess {
  success: true;
  request_id?: string;
  message?: string;
  [key: string]: unknown;
}

export interface Fast2SMSError {
  success: false;
  message: string;
  status_code?: number;
}

export type Fast2SMSResult = Fast2SMSSuccess | Fast2SMSError;

// ─── 1. Simple Template Message ───────────────────────────────────────────────
// GET https://www.fast2sms.com/dev/whatsapp
// Use when you have an approved template and know its Fast2SMS message_id.

export interface SendTemplateSimpleOptions {
  /** Fast2SMS Message ID of the approved template (from WhatsApp Manager panel or Get WABA API) */
  message_id: number;
  /** WABA Phone Number ID — defaults to FAST2SMS_PHONE_NUMBER_ID env var */
  phone_number_id?: string;
  /** Recipient mobile number (E.164 or 10-digit Indian) */
  numbers: string;
  /** Pipe-separated variable values if template has {{1}}, {{2}} etc. e.g. "John|INV-001|500" */
  variables_values?: string;
  /** URL for header media (image/video/PDF) if template has a media header */
  media_url?: string;
  /** Custom filename for PDF header media */
  document_filename?: string;
  /** Optional tracking field 1 */
  udf1?: string;
  /** Optional tracking field 2 */
  udf2?: string;
  /** Optional tracking field 3 */
  udf3?: string;
}

export async function sendTemplateSimple(
  opts: SendTemplateSimpleOptions,
): Promise<Fast2SMSResult> {
  const phone_number_id = opts.phone_number_id ?? getPhoneNumberId();

  const params = new URLSearchParams({
    message_id: String(opts.message_id),
    phone_number_id,
    numbers: opts.numbers,
  });

  if (opts.variables_values) params.set('variables_values', opts.variables_values);
  if (opts.media_url) params.set('media_url', opts.media_url);
  if (opts.document_filename) params.set('document_filename', opts.document_filename);
  if (opts.udf1) params.set('udf1', opts.udf1);
  if (opts.udf2) params.set('udf2', opts.udf2);
  if (opts.udf3) params.set('udf3', opts.udf3);

  const res = await fetch(`${BASE_URL}/whatsapp?${params.toString()}`, {
    method: 'GET',
    headers: headers(),
  });

  return res.json() as Promise<Fast2SMSResult>;
}

// ─── 2. META Format — Text Template (no variables) ───────────────────────────
// POST https://www.fast2sms.com/dev/whatsapp/{version}/{phone_number_id}/messages

export interface SendTextTemplateOptions {
  /** Recipient phone number with country code, e.g. "+919999999999" */
  to: string;
  /** Approved template name (exact match) */
  templateName: string;
  /** Template language code, e.g. "en" or "en_US" */
  languageCode?: string;
  /** WABA Phone Number ID — defaults to FAST2SMS_PHONE_NUMBER_ID env var */
  phone_number_id?: string;
}

export async function sendTextTemplate(
  opts: SendTextTemplateOptions,
): Promise<Fast2SMSResult> {
  const phone_number_id = opts.phone_number_id ?? getPhoneNumberId();

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: opts.to,
    type: 'template',
    template: {
      name: opts.templateName,
      language: { code: opts.languageCode ?? 'en' },
    },
  };

  const res = await fetch(
    `${BASE_URL}/whatsapp/${WABA_VERSION}/${phone_number_id}/messages`,
    { method: 'POST', headers: headers(), body: JSON.stringify(body) },
  );

  return res.json() as Promise<Fast2SMSResult>;
}

// ─── 3. META Format — Template with Variables ─────────────────────────────────

export interface TemplateVariable {
  type: 'text' | 'currency' | 'date_time';
  text?: string;
  currency?: { fallback_value: string; code: string; amount_1000: number };
  date_time?: { fallback_value: string };
}

export interface SendVariableTemplateOptions {
  /** Recipient phone number with country code */
  to: string;
  /** Approved template name */
  templateName: string;
  /** Template language code */
  languageCode?: string;
  /** Body variables — maps to {{1}}, {{2}}, ... in order */
  bodyVariables: TemplateVariable[];
  /** WABA Phone Number ID — defaults to FAST2SMS_PHONE_NUMBER_ID env var */
  phone_number_id?: string;
}

export async function sendVariableTemplate(
  opts: SendVariableTemplateOptions,
): Promise<Fast2SMSResult> {
  const phone_number_id = opts.phone_number_id ?? getPhoneNumberId();

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: opts.to,
    type: 'template',
    template: {
      name: opts.templateName,
      language: { code: opts.languageCode ?? 'en' },
      components: [
        {
          type: 'body',
          parameters: opts.bodyVariables,
        },
      ],
    },
  };

  const res = await fetch(
    `${BASE_URL}/whatsapp/${WABA_VERSION}/${phone_number_id}/messages`,
    { method: 'POST', headers: headers(), body: JSON.stringify(body) },
  );

  return res.json() as Promise<Fast2SMSResult>;
}

// ─── 4. Session Message (free-form text) ──────────────────────────────────────
// POST https://www.fast2sms.com/dev/whatsapp-session
// Only usable within 24h of the customer messaging you first.

export interface SendSessionMessageOptions {
  /** WABA Phone Number ID — defaults to FAST2SMS_PHONE_NUMBER_ID env var */
  phone_number_id?: string;
  /** Recipient mobile number with country code */
  to: string;
  /** Message text */
  text: string;
  /** Optional tracking fields */
  udf1?: string;
  udf2?: string;
  udf3?: string;
}

export async function sendSessionMessage(
  opts: SendSessionMessageOptions,
): Promise<Fast2SMSResult> {
  const phone_number_id = opts.phone_number_id ?? getPhoneNumberId();

  const params = new URLSearchParams({ phone_number_id, to: opts.to });

  const body: Record<string, string> = { type: 'text', text: opts.text };
  if (opts.udf1) body.udf1 = opts.udf1;
  if (opts.udf2) body.udf2 = opts.udf2;
  if (opts.udf3) body.udf3 = opts.udf3;

  const res = await fetch(
    `${BASE_URL}/whatsapp-session?${params.toString()}`,
    { method: 'POST', headers: headers(), body: JSON.stringify(body) },
  );

  return res.json() as Promise<Fast2SMSResult>;
}

// ─── 5. Get WABA & Template Details ──────────────────────────────────────────
// GET /dev/dlt_manager/whatsapp
// Returns phone number IDs, WABA IDs, and optionally Fast2SMS message_ids for templates.

export async function getWabaDetails(
  type: 'number' | 'template' = 'number',
  phone_number_id?: string,
): Promise<Fast2SMSResult> {
  const params = new URLSearchParams({ type });
  if (phone_number_id) params.set('phone_number_id', phone_number_id);

  const res = await fetch(`${BASE_URL}/dlt_manager/whatsapp?${params.toString()}`, {
    method: 'GET',
    headers: headers(),
  });

  return res.json() as Promise<Fast2SMSResult>;
}

// ─── 6. Template Management ───────────────────────────────────────────────────

/** Shape of a single component inside a template */
export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
  text?: string;
  example?: {
    header_text?: string[];
    body_text?: string[][];
    header_handle?: string[];
  };
  buttons?: Array<{
    type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'OTP';
    text: string;
    url?: string;
    phone_number?: string;
  }>;
}

/** Shape of a single WhatsApp message template */
export interface WhatsAppTemplate {
  id: string;
  name: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED' | string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | string;
  language: string;
  previous_category?: string;
  components: TemplateComponent[];
}

/** Paginated template list response */
export interface TemplateListResponse {
  data: WhatsAppTemplate[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
    previous?: string;
  };
}

function getWabaId(): string {
  const id = process.env.FAST2SMS_WABA_ID;
  if (!id) throw new Error('FAST2SMS_WABA_ID environment variable is not set');
  return id;
}

/**
 * Get all templates for the WABA account.
 * Supports cursor-based pagination (pass `after` cursor for next page).
 *
 * GET /dev/whatsapp/{version}/{waba_id}/message_templates
 */
export async function getAllTemplates(opts?: {
  waba_id?: string;
  limit?: number;
  after?: string;
  before?: string;
}): Promise<TemplateListResponse> {
  const waba_id = opts?.waba_id ?? getWabaId();
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.after) params.set('after', opts.after);
  if (opts?.before) params.set('before', opts.before);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(
    `${BASE_URL}/whatsapp/${WABA_VERSION}/${waba_id}/message_templates${qs}`,
    { method: 'GET', headers: headers() },
  );

  return res.json() as Promise<TemplateListResponse>;
}

/**
 * Get a single template by its Meta template ID.
 *
 * GET /dev/whatsapp/{version}/{template_id}
 */
export async function getTemplateById(
  template_id: string,
): Promise<WhatsAppTemplate> {
  const res = await fetch(
    `${BASE_URL}/whatsapp/${WABA_VERSION}/${template_id}`,
    { method: 'GET', headers: headers() },
  );

  return res.json() as Promise<WhatsAppTemplate>;
}

/**
 * Find templates by exact name.
 * Returns an array — multiple language variants of the same name may exist.
 *
 * GET /dev/whatsapp/{version}/{waba_id}/message_templates?name={name}
 */
export async function getTemplateByName(
  name: string,
  waba_id?: string,
): Promise<TemplateListResponse> {
  const resolvedWabaId = waba_id ?? getWabaId();
  const params = new URLSearchParams({ name });

  const res = await fetch(
    `${BASE_URL}/whatsapp/${WABA_VERSION}/${resolvedWabaId}/message_templates?${params.toString()}`,
    { method: 'GET', headers: headers() },
  );

  return res.json() as Promise<TemplateListResponse>;
}

/**
 * Fetch ALL templates across all pages, auto-paginating until exhausted.
 * Use carefully — accounts with hundreds of templates will make multiple requests.
 */
export async function getAllTemplatesPaginated(opts?: {
  waba_id?: string;
  pageSize?: number;
}): Promise<WhatsAppTemplate[]> {
  const all: WhatsAppTemplate[] = [];
  let after: string | undefined;

  do {
    const page = await getAllTemplates({
      waba_id: opts?.waba_id,
      limit: opts?.pageSize ?? 25,
      after,
    });

    all.push(...page.data);
    after = page.paging?.cursors?.after;

    // Stop if no more pages or no next cursor
    if (!after || !page.paging?.next) break;
  } while (true);

  return all;
}

// ─── 7. Convenience helpers for common Safend use cases ──────────────────────

/**
 * Send a WhatsApp notification to a phone number using a template with text variables.
 * This is the most common use case — wraps sendTemplateSimple for conciseness.
 *
 * @param to         - 10-digit Indian number or E.164 e.g. "9999999999"
 * @param message_id - Fast2SMS Message ID of the approved template
 * @param variables  - Array of variable values in order ({{1}}, {{2}}, ...)
 * @param udf1       - Optional tracking ID (e.g. lead ID, client ID)
 */
export async function sendWhatsAppNotification(
  to: string,
  message_id: number,
  variables: string[] = [],
  udf1?: string,
): Promise<Fast2SMSResult> {
  return sendTemplateSimple({
    message_id,
    numbers: to,
    variables_values: variables.length > 0 ? variables.join('|') : undefined,
    udf1,
  });
}
