import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { CompanyProfile } from '@/store/AppContext';

// ── Shape converters ──────────────────────────────────────────────────────────

type DbCompany = {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  join_code: string;
  logo_url: string | null;
};

function toCompanyProfile(row: DbCompany): CompanyProfile & { id: string } {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    joinCode: row.join_code,
    logoUrl: row.logo_url,
  };
}

// ── Repository ────────────────────────────────────────────────────────────────

/**
 * Create a new company record linked to a Supabase auth user.
 * Returns the company UUID on success, null on failure.
 */
export async function createCompany(
  authUserId: string,
  name: string,
  email: string,
  joinCode: string
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase
    .from('companies')
    .insert({
      auth_user_id: authUserId,
      name,
      email,
      join_code: joinCode.toUpperCase(),
      logo_url: null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[companyRepository] createCompany error:', error.message);
    return null;
  }

  return (data as { id: string }).id;
}

/**
 * Fetch a company row by its Supabase auth user id.
 * Called during session restore to reconnect the profile.
 */
export async function fetchCompanyByAuthUserId(
  authUserId: string
): Promise<(CompanyProfile & { id: string }) | null> {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('auth_user_id', authUserId)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[companyRepository] fetchCompanyByAuthUserId error:', error.message);
    }
    return null;
  }

  return toCompanyProfile(data as DbCompany);
}

/**
 * Fetch a company by its join code.
 * Returns null when not found or when Supabase is not configured.
 */
export async function fetchCompanyByJoinCode(
  joinCode: string
): Promise<(CompanyProfile & { id: string }) | null> {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('join_code', joinCode.toUpperCase())
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[companyRepository] fetchCompanyByJoinCode error:', error.message);
    }
    return null;
  }

  return toCompanyProfile(data as DbCompany);
}

/**
 * Upsert a company by join_code (used for legacy/mock-mode bootstrap).
 * Returns the company id (UUID) on success, null on error or unconfigured.
 */
export async function upsertCompany(
  profile: CompanyProfile
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase
    .from('companies')
    .upsert(
      {
        name: profile.name,
        email: profile.email,
        join_code: profile.joinCode.toUpperCase(),
        logo_url: null,
      },
      { onConflict: 'join_code', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (error) {
    console.error('[companyRepository] upsertCompany error:', error.message);
    return null;
  }

  return (data as { id: string }).id;
}

/**
 * Update mutable company fields by id.
 */
export async function updateCompany(
  id: string,
  patch: Partial<Pick<CompanyProfile, 'name' | 'email' | 'joinCode'>>
): Promise<void> {
  if (!isSupabaseConfigured) return;

  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.email !== undefined) dbPatch.email = patch.email;
  if (patch.joinCode !== undefined) dbPatch.join_code = patch.joinCode.toUpperCase();

  if (Object.keys(dbPatch).length === 0) return;

  const { error } = await supabase.from('companies').update(dbPatch).eq('id', id);
  if (error) console.error('[companyRepository] updateCompany error:', error.message);
}
