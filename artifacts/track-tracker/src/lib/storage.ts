// src/lib/storage.ts
//
// Supabase Storage upload helpers for profile images and sale receipts.
//
// Path convention (REQUIRED by storage RLS — see src/db/storage_setup.sql):
//   avatars bucket:      "{auth.uid()}/{kind}-{timestamp}.{ext}"
//   sale-receipts bucket: "{auth.uid()}/receipt-{timestamp}-{rand}.{ext}"
//
// RLS policies (storage_setup.sql) require the FIRST path segment to equal
// the authenticated user's auth.uid(). Any other prefix is rejected with
// 403 "new row violates row-level security policy". This is intentional —
// it prevents a driver from overwriting another driver's avatar.
//
// Both buckets are PUBLIC-READ (anyone can fetch by URL) but AUTH-WRITE
// (only the owning user can upload/update/delete their own files).

import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/image';

export const AVATARS_BUCKET = 'avatars';
export const RECEIPTS_BUCKET = 'sale-receipts';

/**
 * Resolve the current authenticated user's id (auth.uid()).
 * Returns null if no session — callers should bail out gracefully.
 */
async function currentAuthUid(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[storage] getSession error:', error.message);
    return null;
  }
  return data.session?.user.id ?? null;
}

/**
 * Extract the file extension from a File's name. Defaults to 'jpg'.
 */
function fileExt(file: File): string {
  const m = file.name.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : 'jpg';
}

/**
 * Build the public URL for an object in a public bucket. Uses the standard
 * Supabase URL shape: {SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}.
 */
function publicUrlFor(bucket: string, path: string): string {
  const u = (import.meta.env.VITE_SUPABASE_URL as string) ?? '';
  return `${u}/storage/v1/object/public/${bucket}/${path}`;
}

// ── Profile images (driver avatar / company logo) ────────────────────────────

/**
 * Upload a profile image (driver avatar or company logo) to the `avatars`
 * bucket. Compresses the image before upload. Returns the public URL of
 * the uploaded object, or null on failure (no session, upload error, etc.).
 *
 * `kind` is purely cosmetic — it goes into the filename so logs and the
 * Supabase Storage dashboard read more clearly. It does NOT affect the
 * storage path's first segment (which is always the auth.uid()).
 */
export async function uploadProfileImage(
  file: File,
  kind: 'driver' | 'company'
): Promise<string | null> {
  const uid = await currentAuthUid();
  if (!uid) {
    console.error('[storage] uploadProfileImage: no authenticated session');
    return null;
  }

  const compressed = await compressImage(file);
  const ext = fileExt(compressed);
  const path = `${uid}/${kind}-${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, compressed, {
      contentType: compressed.type || 'image/jpeg',
      cacheControl: '3600',
      upsert: false, // each upload is a new object — old ones can be GC'd later
    });

  if (error) {
    console.error(
      `[storage] uploadProfileImage (${kind}) error:`,
      error.statusCode,
      error.message
    );
    return null;
  }

  return publicUrlFor(AVATARS_BUCKET, data.path);
}

// ── Sale receipts ─────────────────────────────────────────────────────────────

/**
 * Upload a sale receipt image to the `sale-receipts` bucket. Compresses the
 * image before upload. Returns the public URL, or null on failure.
 *
 * `saleId` (optional) is included in the filename for traceability in the
 * Supabase Storage dashboard — it does NOT affect the RLS-enforced path
 * prefix (which is always the auth.uid()).
 */
export async function uploadReceiptImage(
  file: File,
  saleId?: string
): Promise<string | null> {
  const uid = await currentAuthUid();
  if (!uid) {
    console.error('[storage] uploadReceiptImage: no authenticated session');
    return null;
  }

  const compressed = await compressImage(file);
  const ext = fileExt(compressed);
  const saleSuffix = saleId ? `-${saleId.slice(0, 8)}` : '';
  const path = `${uid}/receipt${saleSuffix}-${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, compressed, {
      contentType: compressed.type || 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error(
      '[storage] uploadReceiptImage error:',
      error.statusCode,
      error.message
    );
    return null;
  }

  return publicUrlFor(RECEIPTS_BUCKET, data.path);
}
