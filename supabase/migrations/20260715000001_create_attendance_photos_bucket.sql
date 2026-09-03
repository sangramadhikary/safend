-- ═══════════════════════════════════════════════════════════════════════════════
-- Attendance Photos — Private Storage Bucket
-- ═══════════════════════════════════════════════════════════════════════════════
-- Provisions the private `attendance-photos` Supabase Storage bucket that holds
-- QR field-attendance check-in self-photos. These photos are biometric-adjacent
-- personal data, so the bucket MUST NOT allow public read access. Objects are
-- reached only through short-lived signed URLs generated server-side (expiresIn
-- = 300s) by the authorized photo route, and are auto-deleted 30 days after a
-- check-in is resolved by the retention job.
--
-- Path convention (one object per check-in):
--
--   attendance/{check_in_date}/{check_in_id}.{ext}
--
--   - {check_in_date}  the check-in's app-timezone calendar date (YYYY-MM-DD)
--   - {check_in_id}    the qr_check_ins.id UUID of the owning record
--   - {ext}            the image extension matching the stored content type
--                      (`jpg` for image/jpeg, `png` for image/png)
--
-- Uploads and deletions are performed server-side with the service-role key,
-- which bypasses storage RLS exactly like the existing public API routes.
--
-- Requirements: 8.3 (private, no public read), 8.7 (store path, never a public URL)
--
-- Run this in the Supabase SQL Editor or via `supabase db push`.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create the bucket as PRIVATE (public = false → no public read access).
-- file_size_limit and allowed_mime_types provide defense-in-depth alongside the
-- server-side photo validation (≤ 10 MiB, image/jpeg | image/png).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attendance-photos',
  'attendance-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No storage.objects RLS policies are created for this bucket: there is no anon
-- or authenticated read/write policy, so the bucket is inaccessible to clients.
-- All access is mediated by server-side routes using the service-role key
-- (uploads, retention deletions) or server-generated signed URLs (approver reads).
