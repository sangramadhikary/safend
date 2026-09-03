import { NextRequest, NextResponse } from 'next/server';
import { getServerUser, getServerRoles } from '@/lib/auth/server-session';
import { decideAccess } from '@/lib/security/access-decision';
import { rateLimit } from '@/lib/rateLimit';
import { supabaseAdmin } from '@/lib/supabase/adminClient';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Helper: verify the caller holds an admin/branch_admin/hr role, deriving
 * authorization from the server-verified session only (Req 7.2, 7.4).
 * Returns an error descriptor (401/403) or the resolved caller + roles.
 */
const CREATE_EMPLOYEE_ALLOWED_ROLES = ['admin', 'branch_admin', 'hr'];

async function verifyAdminCaller(request: NextRequest) {
  const caller = await getServerUser(request);
  if (!caller) {
    return { error: 'Unauthorised. You must be signed in.', status: 401 };
  }

  const roles = await getServerRoles(caller.id);
  const decision = decideAccess({
    sessionConfirmed: true,
    resolvedRoles: roles,
    routeAllowedRoles: CREATE_EMPLOYEE_ALLOWED_ROLES,
  });
  if (decision !== 'allow') {
    return { error: 'Forbidden. Admin or HR role required.', status: 403 };
  }

  return { caller, roles };
}

/**
 * GET /api/employee-portal/create-employee
 * Returns list of employees for the dropdown (bypasses RLS via service role).
 * Only admins/branch_admins/hr can call this.
 */
export async function GET(request: NextRequest) {
  const authResult = await verifyAdminCaller(request);
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const { data: employees, error } = await supabaseAdmin
      .from('employees')
      .select('id, employee_id, name, email, phone, designation, department, branch_id, status')
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ employees: employees || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
/**
 * POST /api/employee-portal/create-employee
 * Creates a new employee portal user (Supabase auth + employee_users row).
 * Only admins/branch_admins/hr can call this.
 */
export async function POST(request: NextRequest) {
  const authResult = await verifyAdminCaller(request);
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  // Defense-in-depth: throttle employee-account creation per caller.
  const { limited, retryAfter } = rateLimit(`create-employee:${authResult.caller.id}`, { limit: 20, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  // ── Create employee user ──
  try {
    const body = await request.json();
    const {
      email, password, name, employee_id, phone,
      designation, department, branch_id, employee_table_id,
    } = body;

    if (!email || !password || !name || !employee_id) {
      return NextResponse.json(
        { error: 'email, password, name, and employee_id are required.' },
        { status: 400 }
      );
    }

    let authUserId: string;

    // 1. Try to create a new Supabase auth user
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, type: 'employee' },
    });

    if (authErr) {
      // If user already exists (e.g. they have a client portal account), reuse their auth record
      if (authErr.message?.toLowerCase().includes('already') || authErr.message?.toLowerCase().includes('exists')) {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const existing = users?.find((u: any) => u.email === email);
        if (!existing) {
          return NextResponse.json({ error: 'Email already in use but could not locate the existing account.' }, { status: 400 });
        }
        // Ensure they don't already have an employee_users entry
        const { data: existingEmp } = await supabaseAdmin
          .from('employee_users')
          .select('id')
          .eq('auth_user_id', existing.id)
          .maybeSingle();
        if (existingEmp) {
          return NextResponse.json({ error: 'This email already has an employee portal account.' }, { status: 409 });
        }
        authUserId = existing.id;
      } else {
        return NextResponse.json({ error: authErr.message }, { status: 400 });
      }
    } else {
      authUserId = authData.user.id;
    }

    // 2. Create employee_users row
    const { error: empErr } = await supabaseAdmin
      .from('employee_users')
      .insert({
        auth_user_id: authUserId,
        employee_id,
        employee_table_id: employee_table_id || null,
        name,
        email,
        phone: phone || null,
        designation: designation || null,
        department: department || null,
        branch_id: branch_id || null,
        status: 'active',
      });

    if (empErr) {
      // Only rollback (delete auth user) if we CREATED it in this request
      if (authData?.user?.id) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      }
      return NextResponse.json({ error: `Failed to create employee record: ${empErr.message}` }, { status: 500 });
    }

    // 3. Add 'supervisor' role to user_roles (ignore if already exists)
    await supabaseAdmin.from('user_roles').upsert(
      { user_id: authUserId, role: 'supervisor', email },
      { onConflict: 'user_id,role', ignoreDuplicates: true }
    );

    return NextResponse.json({
      success: true,
      uid: authUserId,
      message: 'Employee portal user created successfully',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
