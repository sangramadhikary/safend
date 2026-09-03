import { NextRequest, NextResponse } from 'next/server';
import { gateSearchTerm } from '@/lib/security/search-sanitizer';
import { projectVerificationFields } from '@/lib/security/pii';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

// Credentials must be provided via environment variables — no hardcoded fallbacks.
// Uses service role to bypass RLS — this endpoint is the trusted
// backend for the public employee verification page.
export async function GET(request: NextRequest) {
  // Rate limit: public, service-role-backed endpoint that searches employee
  // records — cap per IP to prevent enumeration/scraping of staff data.
  const ip = getClientIp(request);
  const { limited, retryAfter } = rateLimit(`verify-employee:${ip}`, { limit: 15, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { employees: [], error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  const { searchParams } = new URL(request.url);
  const rawQ = searchParams.get('q') || '';
  // Sanitize the free-text term (filter-injection mitigation) and gate on the
  // minimum query length: a term shorter than 2 chars yields no query (Req
  // 8.2, 12.3, 12.4).
  const q = gateSearchTerm(rawQ);

  if (!q) {
    return NextResponse.json({ employees: [] });
  }

  // ── Turnstile verification ── This endpoint exposes staff records, so each
  // search must carry a valid, single-use token supplied via a request header.
  const turnstileToken = request.headers.get('cf-turnstile-token') || '';
  if (!turnstileToken) {
    return NextResponse.json(
      { employees: [], error: 'Verification required.' },
      { status: 403 }
    );
  }
  const turnstile = await verifyTurnstileToken(turnstileToken, ip);
  if (!turnstile.success) {
    return NextResponse.json(
      { employees: [], error: 'Verification failed. Please try again.' },
      { status: 403 }
    );
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('employees')
      .select('id, employee_id, name, department, designation, join_date, status, photo_url, gender, branch_id')
      .or(`name.ilike.%${q}%,employee_id.ilike.%${q}%,designation.ilike.%${q}%,department.ilike.%${q}%`)
      .order('name', { ascending: true })
      .limit(20);

    if (error) {
      console.error('[verify-employee] DB error:', error.message);
      return NextResponse.json({ employees: [], error: error.message }, { status: 500 });
    }

    // Project each row onto the verification-field allowlist so internal/
    // sensitive attributes (e.g. id, branch_id) are never exposed to the
    // unauthenticated caller (Req 12.2).
    const employees = (data || []).map((row) =>
      projectVerificationFields(row as Record<string, unknown>)
    );

    return NextResponse.json({ employees });
  } catch (err: any) {
    console.error('[verify-employee] Exception:', err.message);
    return NextResponse.json({ employees: [], error: err.message }, { status: 500 });
  }
}
