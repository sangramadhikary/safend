import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertRequiredSecrets } from '@/lib/security/env-bootstrap';
import { getServerUser, getServerRoles, hasStaffRole } from '@/lib/auth/server-session';
import { isAllowedFolder, sanitizeKeySegment } from '@/lib/security/path-sanitizer';
import {
  isAllowedType,
  maxSizeForType,
  contentMatchesDeclaredType,
  requiresAttachment,
} from '@/lib/security/content-type';
import { resolveAllowOrigin, NO_ALLOW_ORIGIN } from '@/lib/security/cors';
import { rateLimit } from '@/lib/rateLimit';

// Fail fast at server module load
assertRequiredSecrets();

// Supabase Storage configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const DEFAULT_BUCKET = 'uploads';
const PROFILE_BUCKET = 'profile-pictures';

function getStorageClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised. You must be signed in to upload files.' }, { status: 401 });
  }

  // Throttle uploads per user — this path buffers the whole file in memory and
  // verifies its content, so it is comparatively expensive.
  const { limited, retryAfter } = rateLimit(`upload:${user.id}`, { limit: 30, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: 'Too many uploads. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = formData.get('folder') as string || 'uploads';
    const prefix = formData.get('prefix') as string || '';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!isAllowedFolder(folder)) {
      return NextResponse.json({ error: 'Invalid upload folder.' }, { status: 400 });
    }

    if (!isAllowedType(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Allowed: images, videos, PDF, Word, Excel, PowerPoint, text files` },
        { status: 400 }
      );
    }

    const maxSize = maxSizeForType(file.type);
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File too large. Maximum size for this file type: ${maxSize / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Generate unique key
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const sanitizedName = sanitizeKeySegment(file.name);
    const safePrefix = sanitizeKeySegment(prefix);
    const prefixStr = safePrefix ? `${safePrefix}_` : '';
    const filePath = `${folder}/${prefixStr}${timestamp}_${randomStr}_${sanitizedName}`;

    // Convert file to buffer for content verification
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!contentMatchesDeclaredType(buffer, file.type)) {
      return NextResponse.json(
        { error: 'File content does not match its declared type.' },
        { status: 400 }
      );
    }

    // Determine bucket
    const bucket = folder === 'profile-pictures' ? PROFILE_BUCKET : DEFAULT_BUCKET;
    const storagePath = folder === 'profile-pictures' 
      ? `${prefixStr}${timestamp}_${randomStr}_${sanitizedName}`
      : filePath;

    // Upload to Supabase Storage
    const supabase = getStorageClient();
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('[Upload API] Supabase Storage error:', error);
      return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
    const key = bucket === PROFILE_BUCKET ? `profile-pictures/${data.path}` : data.path;

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      key,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type,
    });
  } catch (error: any) {
    console.error('[Upload API] Error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}

export async function OPTIONS(request: NextRequest) {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '';
  const allowOrigin = resolveAllowOrigin(
    request.headers.get('origin'),
    configuredOrigin,
  );
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
  if (allowOrigin !== NO_ALLOW_ORIGIN) {
    headers['Access-Control-Allow-Origin'] = allowOrigin;
  }
  return new NextResponse(null, { status: 200, headers });
}

export async function DELETE(request: NextRequest) {
  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised. You must be signed in.' }, { status: 401 });
  }
  if (!hasStaffRole(await getServerRoles(user.id))) {
    return NextResponse.json({ error: 'Forbidden. Insufficient permissions.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { key } = body;

    if (!key) {
      return NextResponse.json({ error: 'No file key provided' }, { status: 400 });
    }

    // Determine bucket from key
    const bucket = key.startsWith('profile-pictures') ? PROFILE_BUCKET : DEFAULT_BUCKET;
    const path = key.startsWith('profile-pictures/') ? key.replace('profile-pictures/', '') : key;

    const supabase = getStorageClient();
    const { error } = await supabase.storage.from(bucket).remove([path]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'File deleted successfully', key });
  } catch (error: any) {
    console.error('[Upload API] Delete error:', error);
    return NextResponse.json({ error: error.message || 'Delete failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const user = await getServerUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised. You must be signed in.' }, { status: 401 });
  }
  if (!hasStaffRole(await getServerRoles(user.id))) {
    return NextResponse.json({ error: 'Forbidden. Insufficient permissions.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json({ error: 'No file key provided' }, { status: 400 });
    }

    const bucket = key.startsWith('profile-pictures') ? PROFILE_BUCKET : DEFAULT_BUCKET;
    const path = key.startsWith('profile-pictures/') ? key.replace('profile-pictures/', '') : key;

    const supabase = getStorageClient();
    const { data, error } = await supabase.storage.from(bucket).list(
      path.split('/').slice(0, -1).join('/'),
      { search: path.split('/').pop() }
    );

    if (error) {
      return NextResponse.json({ exists: false, key });
    }

    return NextResponse.json({
      exists: data && data.length > 0,
      key,
    });
  } catch (error: any) {
    console.error('[Upload API] Check error:', error);
    return NextResponse.json({ error: error.message || 'Check failed' }, { status: 500 });
  }
}
