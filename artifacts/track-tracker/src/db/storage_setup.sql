-- ─────────────────────────────────────────────────────────────────────────────
-- TrackTracker – Supabase Storage setup (buckets + RLS policies)
--
-- Run this in the Supabase Dashboard → SQL Editor → New query → Run.
--
-- Safe to re-run — every statement is idempotent (IF NOT EXISTS / drop+create).
--
-- This file is the storage-side companion to src/db/schema.sql. The original
-- schema.sql only set up Postgres tables + RLS — it never created the storage
-- buckets or storage.objects RLS policies needed for image uploads.
--
-- What this script does:
--   1. Creates the `avatars` bucket (driver profile pictures + company logos)
--      and the `sale-receipts` bucket (sale receipt images) if missing.
--   2. Sets both buckets to PUBLIC read (anyone can fetch an image by URL)
--      while requiring authentication for writes.
--   3. Creates RLS policies on storage.objects that enforce path-based
--      ownership: an authenticated user can only INSERT/UPDATE/DELETE objects
--      whose FIRST path segment equals their own auth.uid().
--
-- Path convention (must be enforced by the frontend — see src/lib/storage.ts):
--   avatars bucket:      "{auth.uid()}/{kind}-{timestamp}.{ext}"
--   sale-receipts bucket: "{auth.uid()}/receipt-{timestamp}-{rand}.{ext}"
--
-- The first path segment is the auth.uid() — this is what the RLS policies
-- below check via (storage.foldername(name))[1] = auth.uid()::text.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Create buckets ─────────────────────────────────────────────────────────
--
-- `public = true` makes objects readable by anyone with the URL — this is
-- required so <img src={publicUrl}> works without signed URLs. Writes are
-- still gated by RLS on storage.objects (see section 2).

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('sale-receipts', 'sale-receipts', true)
on conflict (id) do update set public = true;

-- ── 2. Drop existing storage.objects policies (idempotent) ────────────────────
--
-- Drop by name so re-runs are safe even if a previous version of this script
-- created policies with different expressions.

drop policy if exists "avatars_select_public"        on storage.objects;
drop policy if exists "avatars_insert_owner"         on storage.objects;
drop policy if exists "avatars_update_owner"         on storage.objects;
drop policy if exists "avatars_delete_owner"         on storage.objects;

drop policy if exists "sale_receipts_select_public"  on storage.objects;
drop policy if exists "sale_receipts_insert_owner"   on storage.objects;
drop policy if exists "sale_receipts_update_owner"   on storage.objects;
drop policy if exists "sale_receipts_delete_owner"   on storage.objects;

-- ── 3. Public-read policies ───────────────────────────────────────────────────
--
-- Anyone (including anon) can SELECT objects from these buckets. The URL
-- contains a non-guessable path component ({auth.uid()}/{timestamp}), so
-- "public read" is the same privacy posture as a signed URL with a long
-- expiry — which is what the app's <img> tags need to render.

create policy "avatars_select_public"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "sale_receipts_select_public"
  on storage.objects for select
  using (bucket_id = 'sale-receipts');

-- ── 4. Owner-write policies ───────────────────────────────────────────────────
--
-- Authenticated users can INSERT/UPDATE/DELETE objects ONLY in their own
-- first-level folder. (storage.foldername(name))[1] returns the first path
-- segment as text — we require it to equal auth.uid()::text.
--
-- This prevents:
--   - Driver A overwriting Driver B's avatar
--   - Driver A uploading receipts under another driver's path
--   - Anon (unauthenticated) uploads entirely

create policy "avatars_insert_owner"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_update_owner"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_delete_owner"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "sale_receipts_insert_owner"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sale-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "sale_receipts_update_owner"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'sale-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'sale-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "sale_receipts_delete_owner"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'sale-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 5. Verification queries ───────────────────────────────────────────────────
--
-- Run these in the SQL Editor after this script to confirm everything is in
-- place. They return rows when the setup succeeded.

-- Buckets (expect 2 rows, both public=true):
--   select id, name, public from storage.buckets where id in ('avatars', 'sale-receipts');

-- Policies (expect 8 rows total — 4 per bucket):
--   select name, command, qual, with_check
--   from pg_policies
--   where tablename = 'objects' and schemaname = 'storage'
--   order by name;
