// Unit tests for the audit fallback channel.
//
// Requirement 15.4: IF an audit log write fails, THEN the application SHALL
// write the entry to a fallback channel with the same minimum fields and SHALL
// NOT silently discard it.
//
// Requirement 15.1 minimum fields: actor user ID, action type, affected resource
// ID, outcome, source client IP, and a UTC timestamp.
//
// TRANSPORT CHANGE
// ----------------
// These tests previously mocked `@/integrations/supabase/client` and asserted
// that a rejected `from().insert()` reached the fallback channel. Audit writes no
// longer go from the browser to Supabase directly — they POST to
// `/api/audit/log`, so that identity, roles, IP, geolocation and the timestamp
// are re-derived server-side and cannot be supplied (or forged) by the client.
//
// The requirement is unchanged and is still what is asserted here; only the
// failure being simulated has moved. The client now has two failure modes, and
// both must reach the fallback channel:
//
//   1. the ingest request returns a non-2xx status, and
//   2. the ingest request never completes (network error).
//
// One additional consequence is asserted explicitly: `ip_address` is recorded as
// `client-unresolvable` rather than a fabricated value. A browser cannot read its
// own egress IP, and the request that would have let the server resolve it is the
// one that failed — so writing a plausible-looking IP would place an untrue value
// into an audit record.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The audit module reads the Supabase session to attach a bearer token. It never
// touches the database directly any more, so only auth needs to be stubbed.
vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'test-token' } },
      })),
    },
  })),
  supabaseClient: {
    from: vi.fn(),
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'test-token' } } })),
    },
  },
}));

// Snapshot capture pulls in html2canvas and touches the DOM; neither is relevant
// to the fallback path and both are slow to initialise under jsdom.
vi.mock('@/lib/audit/snapshot', () => ({
  captureAndUploadSnapshot: vi.fn(async () => null),
  captureSnapshotImage: vi.fn(async () => null),
  isSnapshotCaptureEnabled: vi.fn(() => false),
  setSnapshotCaptureEnabled: vi.fn(),
}));

import { logActivity, logAuditEvent, logChange } from './auditLog';

/** Pull every `[audit-fallback]` payload out of the console spy. */
function fallbackPayloads(spy: ReturnType<typeof vi.spyOn>): Record<string, any>[] {
  return spy.mock.calls
    .filter((call) => call[0] === '[audit-fallback]')
    .map((call) => JSON.parse(call[1] as string));
}

describe('audit fallback on failed delivery (Requirement 15.4)', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('userId', 'user-123');
    localStorage.setItem('userName', 'Test Actor');
    localStorage.setItem('userEmail', 'actor@safend.com');
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('routes a rejected ingest response to the fallback channel with the minimum fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    );

    // `immediate` bypasses the batching queue so the delivery attempt — and its
    // failure — happens within this test rather than on a later timer.
    await logAuditEvent({
      action: 'user.delete',
      target: 'employee-999',
      module: 'User Manager',
      outcome: 'success',
      immediate: true,
    });

    const payloads = fallbackPayloads(consoleErrorSpy);
    expect(payloads, 'expected an [audit-fallback] log line').toHaveLength(1);

    const payload = payloads[0];

    // Requirement 15.1 minimum fields.
    expect(payload.user_id).toBe('user-123');
    // The catalog code resolves to its operator-facing label before transmission.
    expect(payload.action).toBe('User Deleted');
    expect(payload.target).toBe('employee-999');
    expect(payload.outcome).toBe('success');
    expect(payload.timestamp).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/));

    // Never a fabricated IP.
    expect(payload.ip_address).toBe('client-unresolvable');

    // The reason is recorded, so the entry is not silently discarded.
    expect(payload.fallbackReason).toBe('ingest responded 503');
  });

  it('routes a network failure to the fallback channel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network unreachable');
      })
    );

    await logAuditEvent({
      action: 'auth.login.failed',
      target: 'attacker@example.com',
      outcome: 'failure',
      immediate: true,
    });

    const payloads = fallbackPayloads(consoleErrorSpy);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].action).toBe('Login Failed');
    expect(payloads[0].outcome).toBe('failure');
    expect(payloads[0].fallbackReason).toBe('network unreachable');
  });

  it('emits one fallback line per event so a failed batch stays reconstructable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    );

    // Three separate immediate deliveries, each failing.
    await logAuditEvent({ action: 'user.delete', target: 'a', immediate: true });
    await logAuditEvent({ action: 'user.delete', target: 'b', immediate: true });
    await logAuditEvent({ action: 'user.delete', target: 'c', immediate: true });

    const payloads = fallbackPayloads(consoleErrorSpy);
    expect(payloads).toHaveLength(3);
    expect(payloads.map((p) => p.target)).toEqual(['a', 'b', 'c']);
  });

  it('preserves the field-level diff in the fallback entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    );

    await logChange({
      action: 'hr.employee.update',
      target: 'Ankita Mahal',
      before: { designation: 'Guard', salary: 18000 },
      after: { designation: 'Head Guard', salary: 21000 },
      immediate: true,
    });

    const payload = fallbackPayloads(consoleErrorSpy)[0];

    // The diff is the substance of the record; losing it on the fallback path
    // would leave an entry that says an edit happened but not what it was.
    expect(payload.changed_fields).toEqual(
      expect.arrayContaining(['designation', 'salary'])
    );
    expect(payload.before_data.salary).toBe(18000);
    expect(payload.after_data.salary).toBe(21000);
  });

  it('reports success through the legacy logActivity entry point when delivery succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 202, json: async () => ({ accepted: 1 }) }))
    );

    const result = await logActivity({
      user: 'Test Actor',
      userEmail: 'actor@safend.com',
      action: 'User Deleted',
      target: 'employee-999',
      module: 'User Manager',
      outcome: 'success',
    });

    expect(result.success).toBe(true);
    expect(fallbackPayloads(consoleErrorSpy)).toHaveLength(0);
  });

  it('never lets a delivery failure surface as a thrown error to the caller', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom');
      })
    );

    // Audit logging is instrumentation: the user's actual operation must still
    // succeed even when the trail cannot be written.
    await expect(
      logAuditEvent({ action: 'user.delete', target: 'x', immediate: true })
    ).resolves.toBeUndefined();
  });
});

describe('client-supplied actor identity is not trusted', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not transmit the caller-supplied user or userEmail to the ingest route', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 202, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    await logActivity({
      user: 'Someone Else',
      userEmail: 'victim@safend.com',
      action: 'User Deleted',
      target: 'employee-999',
      module: 'User Manager',
    });
    // logActivity queues rather than delivering immediately, so the batch has to
    // be flushed before the request body can be inspected.
    const { flushAuditQueue } = await import('./auditLog');
    await flushAuditQueue();

    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body as string);

    // The legacy signature still accepts these parameters so existing call sites
    // compile, but they must never reach the wire — honouring a caller-supplied
    // actor would let any logged-in user forge entries in a colleague's name.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('Someone Else');
    expect(serialized).not.toContain('victim@safend.com');
  });
});
