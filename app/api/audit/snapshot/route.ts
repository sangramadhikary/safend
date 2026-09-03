import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerUser, getServerRoles } from '@/lib/auth/server-session';
import { decideAccess } from '@/lib/security/access-decision';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Audit snapshot storage — /api/audit/snapshot
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * POST  upload a captured UI snapshot; returns its storage path.
 * GET   exchange a stored path for a short-lived signed URL (administrators only).
 *
 * ASYMMETRIC AUTHORIZATION — the important design point
 * -----------------------------------------------------
 * Writing and reading are gated differently, on purpose:
 *
 *   WRITE  any authenticated user, because every user generates snapshots of
 *          their own actions as a side effect of using the application.
 *   READ   administrators only, because a snapshot is an image of someone's
 *          screen and may contain a colleague's personal data.
 *
 * If reads were permitted to any authenticated user, a staff member could
 * enumerate paths and view images of other people's sessions. Uploading is
 * therefore a one-way operation for ordinary users: they contribute to the
 * trail without being able to read it back.
 *
 * NO PUBLIC URLS
 * --------------
 * The `audit-snapshots` bucket is private and has no storage RLS policies, so it
 * is unreachable from any browser client. The only path to an object is a signed
 * URL minted here, valid for five minutes, issued only after the admin check
 * passes. The stored value is always a bucket path, never a URL.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const BUCKET = 'audit-snapshots';
const ADMIN_ALLOWED_ROLES = ['admin', 'branch_admin'];

/** Mirrors the bucket's file_size_limit. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Mirrors the bucket's allowed_mime_types. */
const ALLOWED_MIME = new Set(['image/webp', 'image/png', 'image/jpeg']);

const SIGNED_URL_TTL_SECONDS = 300;

function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Map a MIME type to its file extension. */
function extensionFor(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  return 'webp';
}

/**
 * Validate that a caller-supplied path is a well-formed snapshot path.
 *
 * Rejects traversal sequences and absolute paths, and requires the exact
 * `audit/YYYY-MM-DD/<uuid>.<ext>` shape this route produces. Without this an
 * administrator could coax the signer into minting a URL for an arbitrary object
 * in the bucket by passing a crafted path.
 */
function isValidSnapshotPath(path: string): boolean {
  if (path.includes('..') || path.startsWith('/') || path.length > 200) return false;
  return /^audit\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(webp|png|jpg)$/i.test(path);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — upload
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Snapshot storage not configured' }, { status: 503 });
  }

  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });
  }

  const image = form.get('image');
  if (!(image instanceof File)) {
    return NextResponse.json({ error: 'Missing image file' }, { status: 400 });
  }

  if (image.size === 0) {
    return NextResponse.json({ error: 'Empty image' }, { status: 400 });
  }
  if (image.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Image exceeds 5 MB limit' }, { status: 413 });
  }

  const mime = image.type || 'image/webp';
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json({ error: `Unsupported image type: ${mime}` }, { status: 415 });
  }

  // The path is generated server-side from the server clock and a fresh UUID.
  // A client-supplied name would let a caller overwrite an existing snapshot,
  // which would be a way to tamper with evidence in an otherwise append-only
  // system.
  const date = new Date().toISOString().slice(0, 10);
  const path = `audit/${date}/${crypto.randomUUID()}.${extensionFor(mime)}`;

  const supabase = serviceClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, image, {
    contentType: mime,
    // Never overwrite. An upsert on an audit artifact is a destructive operation.
    upsert: false,
    cacheControl: 'private, max-age=31536000',
  });

  if (error) {
    console.error('[audit-snapshot] upload failed:', error.message);
    return NextResponse.json({ error: 'Snapshot upload failed' }, { status: 500 });
  }

  return NextResponse.json(
    { path, byteSize: image.size },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — signed read URL (administrators only)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Snapshot storage not configured' }, { status: 503 });
  }

  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roles = await getServerRoles(user.id);
  const decision = decideAccess({
    sessionConfirmed: true,
    resolvedRoles: roles,
    routeAllowedRoles: ADMIN_ALLOWED_ROLES,
  });
  if (decision !== 'allow') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const path = request.nextUrl.searchParams.get('path');
  if (!path) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }
  if (!isValidSnapshotPath(path)) {
    return NextResponse.json({ error: 'Invalid snapshot path' }, { status: 400 });
  }

  const supabase = serviceClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    // A missing object is the expected outcome once retention has purged it, so
    // 404 rather than 500 keeps the UI's "snapshot expired" state distinguishable
    // from a real failure.
    return NextResponse.json({ error: 'Snapshot not available' }, { status: 404 });
  }

  return NextResponse.json(
    { url: data.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
