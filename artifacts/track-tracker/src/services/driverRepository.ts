import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { Driver } from '@/data/mockData';

// ── Shape converters ──────────────────────────────────────────────────────────

type DbDriver = {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string | null;
  vehicle_number: string;
  location: string;
  lat: number;
  lng: number;
  profile_picture_url: string | null;
  company_id: string;
};

function toDriver(row: DbDriver, companyName?: string): Driver {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? undefined,
    vehicleNumber: row.vehicle_number,
    location: row.location,
    lat: row.lat,
    lng: row.lng,
    profilePictureUrl: row.profile_picture_url,
    companyName,
  };
}

// ── Repository ────────────────────────────────────────────────────────────────

/**
 * Fetch all non-deleted drivers for the given company.
 * Returns an empty array when Supabase is not configured.
 */
export async function fetchDrivers(companyId: string, companyName: string): Promise<Driver[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[driverRepository] fetchDrivers error:', error.message);
    return [];
  }

  return (data as DbDriver[]).map((row) => toDriver(row, companyName));
}

/**
 * Fetch a single driver by their Supabase auth user id.
 * Returns null when not found or Supabase is not configured.
 * Also returns the company_id so AppContext can scope data correctly.
 */
export async function fetchDriverByAuthUserId(
  authUserId: string
): Promise<(Driver & { companyId: string; companyName: string }) | null> {
  if (!isSupabaseConfigured) return null;

  // Join to companies to get the company name for display
  const { data, error } = await supabase
    .from('drivers')
    .select('*, companies!inner(name)')
    .eq('auth_user_id', authUserId)
    .is('deleted_at', null)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[driverRepository] fetchDriverByAuthUserId error:', error.message);
    }
    return null;
  }

  const row = data as DbDriver & { companies: { name: string } };
  const companyName = row.companies?.name ?? '';

  return {
    ...toDriver(row, companyName),
    companyId: row.company_id,
    companyName,
  };
}

/**
 * Partially update a driver row by id.
 */
export async function updateDriver(
  id: string,
  patch: Partial<Pick<Driver, 'name' | 'email' | 'vehicleNumber' | 'profilePictureUrl'>>
): Promise<void> {
  if (!isSupabaseConfigured) return;

  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.email !== undefined) dbPatch.email = patch.email;
  if (patch.vehicleNumber !== undefined) dbPatch.vehicle_number = patch.vehicleNumber;
  // profilePictureUrl is now a permanent Supabase Storage public URL (see
  // src/lib/storage.ts) — safe to persist, unlike the old blob: URL approach.
  if (patch.profilePictureUrl !== undefined) dbPatch.profile_picture_url = patch.profilePictureUrl;

  if (Object.keys(dbPatch).length === 0) return;

  const { error } = await supabase.from('drivers').update(dbPatch).eq('id', id);
  if (error) console.error('[driverRepository] updateDriver error:', error.message);
}
