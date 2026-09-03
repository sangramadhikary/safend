import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerUser } from '@/lib/auth/server-session';
import { getClientIp } from '@/lib/rateLimit';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/security-consent
 * Records a user's security consent in the database.
 * Also handles consent revocation and data deletion requests.
 */
export async function POST(request: NextRequest) {
  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await request.json();
    const { consentType, consentVersion, userName, userEmail, employeeId, deviceInfo } = body;

    const ip = getClientIp(request);
    const ua = request.headers.get('user-agent') || '';

    const { error } = await supabase.from('security_consents').insert({
      user_id: user.id,
      user_email: userEmail || user.email || '',
      user_name: userName || '',
      employee_id: employeeId || '',
      consent_type: consentType || 'unknown',
      consent_version: consentVersion || '1.0',
      ip_address: ip,
      user_agent: ua,
      device_info: deviceInfo || '',
    });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/security-consent?type=supervisor
 * Checks if the user has an active consent record for the given type+version.
 */
export async function GET(request: NextRequest) {
  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const consentType = request.nextUrl.searchParams.get('type') || 'supervisor';
  const version = request.nextUrl.searchParams.get('version') || '1.0';

  const { data } = await supabase
    .from('security_consents')
    .select('id, accepted_at')
    .eq('user_id', user.id)
    .eq('consent_type', consentType)
    .eq('consent_version', version)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Check if revoked after consent
  const { data: revocation } = await supabase
    .from('security_consents')
    .select('id, accepted_at')
    .eq('user_id', user.id)
    .eq('consent_type', 'consent_revoked')
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const hasConsent = !!data;
  const isRevoked = revocation && data && new Date(revocation.accepted_at) > new Date(data.accepted_at);

  return NextResponse.json({
    hasConsent: hasConsent && !isRevoked,
    consentedAt: data?.accepted_at || null,
    isRevoked: !!isRevoked,
  });
}
