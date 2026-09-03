import { NextRequest, NextResponse } from 'next/server';
import { leadSchema, type LeadInput } from '@/lib/leadSchema';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

// Map the single "security need" selection onto the boolean shape the Sales
// lead UI expects (see LeadFirebaseService.LeadData.securityNeeds).
function mapSecurityNeeds(need: string) {
  const n = need.toLowerCase();
  return {
    armedGuards: n.includes('armed') && !n.includes('unarmed'),
    unarmedGuards: n.includes('unarmed') || n.includes('complete'),
    supervisors: n.includes('complete'),
    patrolOfficers: n.includes('patrol') || n.includes('mobile'),
    eventSecurity: n.includes('event') || n.includes('bouncer'),
    personalSecurity: n.includes('personal') || n.includes('pso'),
  };
}

export async function POST(request: NextRequest) {
  // Rate limit: public endpoint backed by the service-role client.
  const ip = getClientIp(request);
  const { limited, retryAfter } = rateLimit(`lead:${ip}`, { limit: 10, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body. Expected JSON.' },
      { status: 400 },
    );
  }

  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const d: LeadInput = parsed.data;

  // ── Honeypot check: if the hidden field is filled, it's a bot. Return a
  // fake success so the trap isn't revealed to pen-testers. ──
  if (d.website && d.website.length > 0) {
    return NextResponse.json(
      { success: true, message: 'Lead captured' },
      { status: 201 },
    );
  }

  // ── Turnstile verification ──
  const turnstile = await verifyTurnstileToken(d.turnstileToken, ip);
  if (!turnstile.success) {
    return NextResponse.json(
      { error: 'Bot verification failed. Please refresh and try again.' },
      { status: 403 },
    );
  }

  try {
    // Capture details that have no dedicated column in `leads` as free-text notes,
    // so nothing the prospect entered is lost.
    const notes = [
      `Security need: ${d.securityNeed}`,
      `Site type: ${d.siteType}`,
      d.designation && `Designation: ${d.designation}`,
      d.contractDuration && `Contract duration: ${d.contractDuration}`,
      d.currentProvider && `Current provider: ${d.currentProvider}`,
      d.shiftType && `Shift coverage: ${d.shiftType}`,
      d.howDidYouHear && `Heard about us via: ${d.howDidYouHear}`,
      d.message && `Notes: ${d.message}`,
    ]
      .filter(Boolean)
      .join('\n');

    // Map the marketing form onto the `leads` table columns. `lead_id` and
    // `company_name` are NOT NULL, so both always get a value.
    const insertData = {
      lead_id: `LEAD-${Date.now()}`,
      company_name: d.companyName || d.name,
      contact_person: d.name,
      phone: d.phone,
      email: d.email,
      // Leads captured through this public form always originate from the website.
      source: 'Website',
      status: 'new',
      assigned_to: null,
      notes,
      address: d.siteAddress || null,
      city: d.city || null,
      state: d.state || null,
      pincode: null,
      budget: d.budget || null,
      target_start_date: d.startDate || null,
      urgency: null,
      security_needs: mapSecurityNeeds(d.securityNeed),
      manpower_requirements: {
        totalGuardsNeeded: d.numberOfGuards || '',
        shiftType: d.shiftType || '',
      },
      site_information: {
        siteCount: d.numberOfSites || '',
        locationType: d.siteType,
        primaryLocation: [d.city, d.state].filter(Boolean).join(', '),
      },
      created_by: 'Marketing Website',
    };

    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert(insertData)
      .select('id')
      .single();

    if (error) {
      console.error('[lead] Insert error:', error.message);
      return NextResponse.json(
        { error: 'Failed to submit. Please try again later.' },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { success: true, id: data?.id, message: 'Lead captured' },
      { status: 201 },
    );
  } catch (err: any) {
    console.error('[lead] Unexpected error:', err?.message ?? err);
    return NextResponse.json(
      { error: 'Failed to submit. Please try again later.' },
      { status: 500 },
    );
  }
}
