-- Add phone and photo_url columns to the users table.
-- Mirrors scripts/alter_users_add_phone_photo.sql so the change is tracked
-- in the Supabase migration history. Idempotent via IF NOT EXISTS.

alter table public.users
  add column if not exists phone     text,
  add column if not exists photo_url text;
