import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Uploads a company logo / driver profile picture to the shared public
 * `avatars` Supabase Storage bucket and returns its permanent public URL.
 *
 * Files are stored at `${folder}/${authUserId}/${timestamp}.${ext}` — keyed
 * by the Supabase auth user id (not the companies/drivers row id) so the
 * storage RLS policy (see schema.sql) can authorize the upload with a plain
 * `auth.uid()` check, no cross-table lookup required.
 *
 * Throws on any failure (not configured, network error, storage error) so
 * callers can surface a real error state instead of silently doing nothing.
 */
export async function uploadAvatar(
  file: File,
  folder: 'companies' | 'drivers',
  authUserId: string
): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase غير مُهيّأ — لا يمكن رفع الصورة.');
  }

  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${folder}/${authUserId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type || undefined });

  if (uploadError) {
    console.error('[storage] uploadAvatar error:', uploadError.message);
    throw uploadError;
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error('تعذّر الحصول على رابط الصورة.');
  }

  return data.publicUrl;
}
