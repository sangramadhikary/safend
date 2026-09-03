import { NextRequest, NextResponse } from 'next/server';
import { getServerUser, getServerRoles } from '@/lib/auth/server-session';
import { decideAccess, validateRequestedRoles } from '@/lib/security/access-decision';
import { rateLimit } from '@/lib/rateLimit';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

// The service-role client bypasses RLS and is created on first request rather
// than at import time. Constructing it at module scope made `next build` require
// production secrets, and one missing variable aborted the entire build.

// The role a caller must hold to create users on this route.
const CREATE_USER_ALLOWED_ROLES = ['admin', 'branch_admin'];

export async function POST(request: NextRequest) {
  // ── Auth/role guard: derive authorization from the server-verified session ──
  // The caller's identity and roles are resolved server-side only — never from
  // the request body, headers, or query (Req 7.4). Return 401 when the session
  // cannot be confirmed (Req 5.3) and 403 when the role check fails (Req 7.3).
  const callerUser = await getServerUser(request);
  if (!callerUser) {
    return NextResponse.json({ error: 'Unauthorised. You must be signed in.' }, { status: 401 });
  }

  const callerRoles = await getServerRoles(callerUser.id);
  const decision = decideAccess({
    sessionConfirmed: true,
    resolvedRoles: callerRoles,
    routeAllowedRoles: CREATE_USER_ALLOWED_ROLES,
  });
  if (decision !== 'allow') {
    return NextResponse.json({ error: 'Forbidden. Admin role required.' }, { status: 403 });
  }
  // ── End auth/role guard ─────────────────────────────────────────────────────

  // Defense-in-depth: cap account creation per admin to limit the damage of a
  // hijacked admin session being used to mass-create users.
  const { limited, retryAfter } = rateLimit(`create-user:${callerUser.id}`, { limit: 20, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  try {
    const body = await request.json();
    const { email, password, name, roles, branch, branchId } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    // Reject any requested-role set that is absent, empty, or contains a value
    // outside the assignable-roles allowlist — create no account (Req 7.5).
    const requestedRoles: string[] = Array.isArray(roles) ? roles : [];
    if (!validateRequestedRoles(requestedRoles)) {
      return NextResponse.json(
        { error: 'Invalid or missing role(s). A non-empty set of assignable roles is required.' },
        { status: 400 }
      );
    }

    // Create user with admin API - auto confirms email
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: { name, roles: requestedRoles },
    });

    if (authError) {
      // If the auth user already exists (orphaned from a previous partial failure),
      // look them up and attempt to complete the profile + roles setup.
      if (authError.message?.toLowerCase().includes('already been registered') ||
          authError.message?.toLowerCase().includes('already registered') ||
          authError.message?.toLowerCase().includes('already exists')) {

        // Find the existing user by email
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = listData?.users?.find((u) => u.email === email);

        if (!existingUser) {
          return NextResponse.json({ error: authError.message }, { status: 400 });
        }

        // Complete the profile + roles for the orphaned user
        await supabaseAdmin.from('users').upsert({
          id: existingUser.id,
          email,
          name: name || email.split('@')[0],
          roles: requestedRoles,
          branch: branch || null,
          branch_id: branchId || null,
          status: 'active',
        });

        const ENUM_ROLES_RECOVERY = new Set(['admin', 'branch_admin', 'sales', 'operations', 'accounts', 'hr', 'office-admin', 'reports', 'client']);
        const enumRolesRecovery = requestedRoles.filter((r: string) => ENUM_ROLES_RECOVERY.has(r));
        if (enumRolesRecovery.length > 0) {
          // Clear any stale partial rows first
          await supabaseAdmin.from('user_roles').delete().eq('user_id', existingUser.id);
          await supabaseAdmin.from('user_roles').insert(
            enumRolesRecovery.map((role: string) => ({ user_id: existingUser.id, role }))
          );
        }

        return NextResponse.json({
          success: true,
          uid: existingUser.id,
          message: 'User setup completed (recovered from partial failure)',
        });
      }

      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    if (authData.user) {
      // requestedRoles is guaranteed non-empty and allowlisted by the guard
      // above; never substitute a default role (Req 5.8, 7.5).
      const userRoles: string[] = requestedRoles;

      // Update user profile in users table
      const { error: profileError } = await supabaseAdmin
        .from('users')
        .upsert({
          id: authData.user.id,
          email,
          name: name || email.split('@')[0],
          roles: userRoles,
          branch: branch || null,
          branch_id: branchId || null,
          status: 'active',
        });

      if (profileError) {
        // Profile insertion failed but auth user was created — log it and continue.
        // The user_roles row (inserted next) is what gates login.
        console.error('[create-user] Profile upsert error:', profileError.message);
      }

      // The user_roles table has a check constraint covering these valid role values.
      // Filter to only those before inserting; all roles are already stored in users.roles[].
      const ENUM_ROLES = new Set(['admin', 'branch_admin', 'sales', 'operations', 'accounts', 'hr', 'office-admin', 'reports', 'client']);
      const enumRoles = userRoles.filter((r: string) => ENUM_ROLES.has(r));

      if (enumRoles.length > 0) {
        const { error: rolesError } = await supabaseAdmin
          .from('user_roles')
          .insert(enumRoles.map((role: string) => ({
            user_id: authData.user!.id,
            role,
          })));

        if (rolesError) {
          console.error('user_roles error:', rolesError);
          // Clean up the auth user so the admin can retry without "already registered" error
          await supabaseAdmin.auth.admin.deleteUser(authData.user!.id);
          return NextResponse.json({
            error: `User creation failed during role assignment: ${rolesError.message}. Please try again.`,
          }, { status: 500 });
        }
      }
      // Non-enum roles (office-admin, branch_admin) are stored only in users.roles[]
      // and are enforced via the ERP_STAFF_ROLES / hasStaffRole gate.

      return NextResponse.json({ 
        success: true, 
        uid: authData.user.id,
        message: 'User created successfully'
      });
    }

    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  } catch (error: any) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
