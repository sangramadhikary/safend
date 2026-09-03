import { NextRequest, NextResponse } from 'next/server';
import { getServerUser, getServerRoles } from '@/lib/auth/server-session';
import { decideAccess } from '@/lib/security/access-decision';
import { rateLimit } from '@/lib/rateLimit';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/client-portal/create-client
 * Creates a new client user (Supabase auth + client_users row).
 * Only admins can call this.
 */
// Roles permitted to create client-portal users.
const CREATE_CLIENT_ALLOWED_ROLES = ['admin', 'branch_admin'];

export async function POST(request: NextRequest) {
  // ── Auth/role guard: derive authorization from the server-verified session ──
  // Identity and roles are resolved server-side only (Req 7.4). Return 401 when
  // the session cannot be confirmed (Req 5.3) and 403 when the role check fails
  // (Req 7.3).
  const caller = await getServerUser(request);
  if (!caller) {
    return NextResponse.json({ error: 'Unauthorised. You must be signed in.' }, { status: 401 });
  }

  const callerRoles = await getServerRoles(caller.id);
  const decision = decideAccess({
    sessionConfirmed: true,
    resolvedRoles: callerRoles,
    routeAllowedRoles: CREATE_CLIENT_ALLOWED_ROLES,
  });
  if (decision !== 'allow') {
    return NextResponse.json({ error: 'Forbidden. Admin role required.' }, { status: 403 });
  }
  // ── End auth/role guard ─────────────────────────────────────────────────────

  // Defense-in-depth: throttle client-account creation per caller.
  const { limited, retryAfter } = rateLimit(`create-client:${caller.id}`, { limit: 20, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  // ── Create client ──
  try {
    const body = await request.json();
    const {
      email, password, client_name, company_name, contact_person,
      phone, agreement_ids, post_ids,
    } = body;

    if (!email || !password || !client_name || !contact_person) {
      return NextResponse.json(
        { error: 'email, password, client_name, and contact_person are required.' },
        { status: 400 }
      );
    }

    let authUserId: string;

    // 1. Try to create a new Supabase auth user
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: contact_person, type: 'client' },
    });

    if (authErr) {
      // If user already exists (e.g. they have an employee portal account), reuse their auth record
      if (authErr.message?.toLowerCase().includes('already') || authErr.message?.toLowerCase().includes('exists')) {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const existing = users?.find((u: any) => u.email === email);
        if (!existing) {
          return NextResponse.json({ error: 'Email already in use but could not locate the existing account.' }, { status: 400 });
        }
        // Ensure they don't already have a client_users entry
        const { data: existingClient } = await supabaseAdmin
          .from('client_users')
          .select('id')
          .eq('auth_user_id', existing.id)
          .maybeSingle();
        if (existingClient) {
          return NextResponse.json({ error: 'This email already has a client portal account.' }, { status: 409 });
        }
        authUserId = existing.id;
      } else {
        return NextResponse.json({ error: authErr.message }, { status: 400 });
      }
    } else {
      authUserId = authData.user.id;
    }

    // 2. Create client_users row
    const { error: clientErr } = await supabaseAdmin
      .from('client_users')
      .insert({
        auth_user_id: authUserId,
        client_name,
        company_name: company_name || null,
        contact_person,
        email,
        phone: phone || null,
        agreement_ids: agreement_ids || [],
        post_ids: post_ids || [],
        status: 'active',
      });

    if (clientErr) {
      // Only rollback (delete auth user) if we CREATED it in this request
      if (authData?.user?.id) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      }
      return NextResponse.json({ error: `Failed to create client record: ${clientErr.message}` }, { status: 500 });
    }

    // 3. Add 'client' role to user_roles (ignore if already exists)
    await supabaseAdmin.from('user_roles').upsert(
      { user_id: authUserId, role: 'client', email },
      { onConflict: 'user_id,role', ignoreDuplicates: true }
    );

    return NextResponse.json({
      success: true,
      uid: authUserId,
      message: 'Client user created successfully',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
