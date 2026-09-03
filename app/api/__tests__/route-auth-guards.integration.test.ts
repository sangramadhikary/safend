// Integration tests for the server-side auth/role guards added to the
// privileged API routes (task 10.2), exercised here through their real route
// handlers (task 10.4).
//
// These tests verify, end-to-end through each route's exported handler, that
// authorization is derived from the *server-verified* session only
// (`getServerUser` / `getServerRoles`) and that the guards return:
//   - HTTP 401 for an unauthenticated caller (no resolvable session),
//   - HTTP 403 for an authenticated caller whose role is not authorized,
//   - HTTP 400 for a requested role outside the assignable allowlist, and
//   - allow (not 401/403) for a caller holding a valid role.
//
// Validates: Requirements 5.3, 7.3, 7.5, 9.1
//
// The required server secrets must be present before the route modules load
// (the upload route calls `assertRequiredSecrets()` at module-evaluation time,
// and the create-* routes throw at load when the Supabase URL/service key are
// absent). These assignments run before the dynamic `import()` calls in the
// tests below, so every route module sees a fully populated environment.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.R2_ACCOUNT_ID = 'test-account';
process.env.R2_ACCESS_KEY_ID = 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.R2_BUCKET_NAME = 'test-bucket';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mutable mock state for the server-side session resolver ──────────────────
// `getServerUser` / `getServerRoles` are the *only* source of authorization for
// the guarded routes. By mocking them we can simulate an unauthenticated
// caller, a wrong-role caller, and a valid-role caller without any real
// Supabase calls — exactly mirroring how the guards consume them in production.
const { getServerUserMock, getServerRolesMock } = vi.hoisted(() => ({
  getServerUserMock: vi.fn(),
  getServerRolesMock: vi.fn(),
}));

vi.mock('@/lib/auth/server-session', async () => {
  // Keep the real `hasStaffRole` (a pure predicate) so the upload route's
  // destructive-operation gate behaves authentically against our mocked roles.
  const actual = await vi.importActual<typeof import('@/lib/auth/server-session')>(
    '@/lib/auth/server-session',
  );
  return {
    getServerUser: getServerUserMock,
    getServerRoles: getServerRolesMock,
    hasStaffRole: actual.hasStaffRole,
  };
});

// ── Stub the Supabase admin client so the allow-path never hits the network ──
// The guards run *before* any database access, so for the 401/403/400 cases
// these stubs are never reached. For the allow-path they let the handler
// complete successfully so we can assert a non-denied status.
const { supabaseAdminStub } = vi.hoisted(() => {
  const queryBuilder: Record<string, unknown> = {};
  queryBuilder.select = () => queryBuilder;
  queryBuilder.eq = () => queryBuilder;
  queryBuilder.upsert = async () => ({ error: null });
  queryBuilder.insert = async () => ({ error: null });
  queryBuilder.order = async () => ({ data: [], error: null });
  queryBuilder.maybeSingle = async () => ({ data: null, error: null });

  // Supabase Storage stub — the upload route's DELETE/GET/POST allow-paths call
  // `client.storage.from(bucket).{remove,list,upload,getPublicUrl}`.
  const storageBuilder: Record<string, unknown> = {};
  storageBuilder.remove = async () => ({ data: [], error: null });
  storageBuilder.list = async () => ({ data: [{ name: 'file' }], error: null });
  storageBuilder.upload = async () => ({ data: { path: 'uploads/file' }, error: null });
  storageBuilder.getPublicUrl = () => ({ data: { publicUrl: 'https://example.test/file' } });

  return {
    supabaseAdminStub: {
      auth: {
        admin: {
          createUser: vi.fn(async () => ({ data: { user: { id: 'new-user-id' } }, error: null })),
          listUsers: vi.fn(async () => ({ data: { users: [] } })),
          deleteUser: vi.fn(async () => ({ error: null })),
        },
      },
      from: vi.fn(() => queryBuilder),
      storage: { from: vi.fn(() => storageBuilder) },
    },
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabaseAdminStub),
}));

// ── Stub the R2 / S3 client so the upload allow-path resolves without I/O ─────
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: vi.fn(async () => ({})) })),
  PutObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
}));

// A fixed verified user; identity never comes from the request itself.
const VERIFIED_USER = { id: 'caller-123' } as { id: string };

/** Configure the mocks for an unauthenticated caller (no resolvable session). */
function asUnauthenticated() {
  getServerUserMock.mockResolvedValue(null);
  getServerRolesMock.mockResolvedValue([]);
}

/** Configure the mocks for an authenticated caller holding the given roles. */
function asUserWithRoles(roles: string[]) {
  getServerUserMock.mockResolvedValue(VERIFIED_USER);
  getServerRolesMock.mockResolvedValue(roles);
}

/** Build a JSON POST request to an arbitrary in-app URL. */
function jsonPost(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/admin/create-user auth/role guard (Req 5.3, 7.3, 7.5)', () => {
  async function loadPost() {
    return (await import('../admin/create-user/route')).POST;
  }

  it('returns 401 for an unauthenticated caller', async () => {
    asUnauthenticated();
    const POST = await loadPost();
    const res = await POST(
      jsonPost('http://localhost/api/admin/create-user', {
        email: 'new@safend.com',
        password: 'pw',
        roles: ['hr'],
      }),
    );
    expect(res.status).toBe(401);
    // No privileged Supabase admin call was attempted.
    expect(supabaseAdminStub.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('returns 403 for an authenticated caller without the admin role', async () => {
    asUserWithRoles(['hr']); // admin route requires the 'admin' role
    const POST = await loadPost();
    const res = await POST(
      jsonPost('http://localhost/api/admin/create-user', {
        email: 'new@safend.com',
        password: 'pw',
        roles: ['hr'],
      }),
    );
    expect(res.status).toBe(403);
    expect(supabaseAdminStub.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('returns 400 when an admin requests a role outside the assignable allowlist', async () => {
    asUserWithRoles(['admin']);
    const POST = await loadPost();
    const res = await POST(
      jsonPost('http://localhost/api/admin/create-user', {
        email: 'new@safend.com',
        password: 'pw',
        roles: ['super-duper-admin'], // not an assignable role
      }),
    );
    expect(res.status).toBe(400);
    expect(supabaseAdminStub.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('allows an admin caller with a valid requested role', async () => {
    asUserWithRoles(['admin']);
    const POST = await loadPost();
    const res = await POST(
      jsonPost('http://localhost/api/admin/create-user', {
        email: 'new@safend.com',
        password: 'pw',
        roles: ['hr'],
      }),
    );
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/client-portal/create-client auth/role guard (Req 5.3, 7.3)', () => {
  async function loadPost() {
    return (await import('../client-portal/create-client/route')).POST;
  }

  const validBody = {
    email: 'client@acme.com',
    password: 'pw',
    client_name: 'Acme',
    contact_person: 'Jane',
  };

  it('returns 401 for an unauthenticated caller', async () => {
    asUnauthenticated();
    const POST = await loadPost();
    const res = await POST(jsonPost('http://localhost/api/client-portal/create-client', validBody));
    expect(res.status).toBe(401);
    expect(supabaseAdminStub.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('returns 403 for an authenticated caller with an unauthorized role', async () => {
    asUserWithRoles(['sales']); // route allows admin / branch_admin only
    const POST = await loadPost();
    const res = await POST(jsonPost('http://localhost/api/client-portal/create-client', validBody));
    expect(res.status).toBe(403);
    expect(supabaseAdminStub.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('allows an admin caller through the guard', async () => {
    asUserWithRoles(['admin']);
    const POST = await loadPost();
    const res = await POST(jsonPost('http://localhost/api/client-portal/create-client', validBody));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('/api/employee-portal/create-employee auth/role guard (Req 5.3, 7.3)', () => {
  async function loadHandlers() {
    const mod = await import('../employee-portal/create-employee/route');
    return { POST: mod.POST, GET: mod.GET };
  }

  const validBody = {
    email: 'emp@safend.com',
    password: 'pw',
    name: 'Bob',
    employee_id: 'E-1',
  };

  it('POST returns 401 for an unauthenticated caller', async () => {
    asUnauthenticated();
    const { POST } = await loadHandlers();
    const res = await POST(jsonPost('http://localhost/api/employee-portal/create-employee', validBody));
    expect(res.status).toBe(401);
    expect(supabaseAdminStub.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('POST returns 403 for an authenticated caller with an unauthorized role', async () => {
    asUserWithRoles(['operations']); // route allows admin / branch_admin / hr
    const { POST } = await loadHandlers();
    const res = await POST(jsonPost('http://localhost/api/employee-portal/create-employee', validBody));
    expect(res.status).toBe(403);
    expect(supabaseAdminStub.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('POST allows an hr caller through the guard', async () => {
    asUserWithRoles(['hr']);
    const { POST } = await loadHandlers();
    const res = await POST(jsonPost('http://localhost/api/employee-portal/create-employee', validBody));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  it('GET returns 401 for an unauthenticated caller', async () => {
    asUnauthenticated();
    const { GET } = await loadHandlers();
    const req = new NextRequest('http://localhost/api/employee-portal/create-employee', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('GET returns 403 for an authenticated caller with an unauthorized role', async () => {
    asUserWithRoles(['sales']);
    const { GET } = await loadHandlers();
    const req = new NextRequest('http://localhost/api/employee-portal/create-employee', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('GET allows an admin caller through the guard', async () => {
    asUserWithRoles(['admin']);
    const { GET } = await loadHandlers();
    const req = new NextRequest('http://localhost/api/employee-portal/create-employee', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('/api/upload auth/role guards (Req 9.1, 7.6, 7.7)', () => {
  async function loadHandlers() {
    const mod = await import('../upload/route');
    return { POST: mod.POST, DELETE: mod.DELETE, GET: mod.GET };
  }

  // POST requires only an authenticated session (any user may upload).
  it('POST returns 401 for an unauthenticated caller', async () => {
    asUnauthenticated();
    const { POST } = await loadHandlers();
    const req = new NextRequest('http://localhost/api/upload', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('POST passes the auth guard for an authenticated caller (no role required)', async () => {
    asUserWithRoles(['client']); // a non-staff portal user may still upload
    const { POST } = await loadHandlers();
    // The POST upload guard requires only an authenticated session — any role
    // is permitted. An authenticated caller must therefore not be blocked with
    // 401/403; the handler proceeds past the guard into body handling (whose
    // exact downstream status depends on the body and is not what this guard
    // test asserts).
    const form = new FormData();
    form.set('folder', 'uploads');
    const req = new NextRequest(new Request('http://localhost/api/upload', { method: 'POST', body: form }));
    const res = await POST(req);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  // DELETE is a destructive operation restricted to ERP staff roles.
  it('DELETE returns 401 for an unauthenticated caller', async () => {
    asUnauthenticated();
    const { DELETE } = await loadHandlers();
    const res = await DELETE(jsonPost('http://localhost/api/upload', { key: 'uploads/x.png' }));
    expect(res.status).toBe(401);
  });

  it('DELETE returns 403 for an authenticated non-staff caller', async () => {
    asUserWithRoles(['client']); // not an ERP staff role
    const { DELETE } = await loadHandlers();
    const res = await DELETE(jsonPost('http://localhost/api/upload', { key: 'uploads/x.png' }));
    expect(res.status).toBe(403);
  });

  it('DELETE allows an ERP staff caller through the guard', async () => {
    asUserWithRoles(['operations']);
    const { DELETE } = await loadHandlers();
    const res = await DELETE(jsonPost('http://localhost/api/upload', { key: 'uploads/x.png' }));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });

  // GET (metadata probe) is likewise restricted to ERP staff roles.
  it('GET returns 401 for an unauthenticated caller', async () => {
    asUnauthenticated();
    const { GET } = await loadHandlers();
    const req = new NextRequest('http://localhost/api/upload?key=uploads/x.png', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('GET returns 403 for an authenticated non-staff caller', async () => {
    asUserWithRoles(['employee_portal']);
    const { GET } = await loadHandlers();
    const req = new NextRequest('http://localhost/api/upload?key=uploads/x.png', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('GET allows an ERP staff caller through the guard', async () => {
    asUserWithRoles(['admin']);
    const { GET } = await loadHandlers();
    const req = new NextRequest('http://localhost/api/upload?key=uploads/x.png', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });
});
