import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { CompanyProfile } from '@/types';

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
 * Validate a join code via the validate_join_code security-definer RPC.
 * Returns a minimal { id, name } object — only what driverSignUp needs.
 * No direct companies table SELECT required, so no over-permissive RLS policy.
 */
export async function fetchCompanyByJoinCode(
  joinCode: string
): Promise<{ id: string; name: string } | null> {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase.rpc('validate_join_code', {
    p_join_code: joinCode.toUpperCase(),
  });

  if (error) {
    console.error('[companyRepository] fetchCompanyByJoinCode (rpc) error:', error.message);
    return null;
  }

  const rows = data as Array<{ company_id: string; company_name: string }> | null;
  if (!rows || rows.length === 0) return null;

  return { id: rows[0].company_id, name: rows[0].company_name };
}

/**
 * Update mutable company fields by id. Now includes logoUrl — the caller
 * passes a durable Supabase Storage public URL (NOT a blob URL) obtained
 * via uploadProfileImage(file, 'company').
 */
export async function updateCompany(
  id: string,
  patch: Partial<Pick<CompanyProfile, 'name' | 'email' | 'joinCode' | 'logoUrl'>>
): Promise<void> {
  if (!isSupabaseConfigured) return;

  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.email !== undefined) dbPatch.email = patch.email;
  if (patch.joinCode !== undefined) dbPatch.join_code = patch.joinCode.toUpperCase();
  if (patch.logoUrl !== undefined) dbPatch.logo_url = patch.logoUrl;

  if (Object.keys(dbPatch).length === 0) return;

  const { error } = await supabase.from('companies').update(dbPatch).eq('id', id);
  if (error) console.error('[companyRepository] updateCompany error:', error.message);
}
