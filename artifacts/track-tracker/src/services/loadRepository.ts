import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { CargoItem } from '@/data/mockData';

// ── Shape converters ──────────────────────────────────────────────────────────

type DbLoad = {
  id: string;
  driver_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
};

function toCargoItem(row: DbLoad): CargoItem {
  return {
    id: row.id,
    driverId: row.driver_id,
    productName: row.product_name,
    quantity: row.quantity,
    unitPrice: row.unit_price,
  };
}

// ── Repository ────────────────────────────────────────────────────────────────

/**
 * Fetch all load rows for the given driver ids.
 * Returns an empty array when Supabase is not configured.
 */
export async function fetchLoads(driverIds: string[]): Promise<CargoItem[]> {
  if (!isSupabaseConfigured || driverIds.length === 0) return [];

  const { data, error } = await supabase
    .from('loads')
    .select('*')
    .in('driver_id', driverIds)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[loadRepository] fetchLoads error:', error.message);
    return [];
  }

  return (data ?? []).map((row: DbLoad) => toCargoItem(row));
}

/**
 * Insert or update a load row. The caller must supply a client-generated UUID
 * for new rows so that local state and DB share the same id without
 * any reconciliation step. For existing rows, `id` selects the row to update.
 */
export async function upsertLoad(input: {
  id: string; // always required — caller generates UUID for new rows
  driverId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  isNew?: boolean; // true = insert, false/undefined = update existing row
}): Promise<void> {
  if (!isSupabaseConfigured) return;

  if (input.isNew) {
    // Insert with explicit id — DB uses the client UUID
    const { error } = await supabase
      .from('loads')
      .upsert(
        {
          id: input.id,
          driver_id: input.driverId,
          product_name: input.productName,
          quantity: input.quantity,
          unit_price: input.unitPrice,
        },
        { onConflict: 'driver_id,product_name', ignoreDuplicates: false }
      );

    if (error) console.error('[loadRepository] upsertLoad (insert) error:', error.message);
    return;
  }

  // Update existing row
  const { error } = await supabase
    .from('loads')
    .update({
      product_name: input.productName,
      quantity: input.quantity,
      unit_price: input.unitPrice,
    })
    .eq('id', input.id);

  if (error) console.error('[loadRepository] upsertLoad (update) error:', error.message);
}

/**
 * Decrement quantity for a sold product. Quantity floors at 0.
 */
export async function decrementLoad(
  driverId: string,
  productName: string,
  soldQty: number
): Promise<void> {
  if (!isSupabaseConfigured) return;

  const { data: row, error: fetchErr } = await supabase
    .from('loads')
    .select('id, quantity')
    .eq('driver_id', driverId)
    .eq('product_name', productName)
    .single();

  if (fetchErr || !row) {
    if (fetchErr?.code !== 'PGRST116') {
      console.error('[loadRepository] decrementLoad (fetch) error:', fetchErr?.message);
    }
    return;
  }

  const newQty = Math.max(0, (row as { id: string; quantity: number }).quantity - soldQty);

  const { error } = await supabase
    .from('loads')
    .update({ quantity: newQty })
    .eq('id', (row as { id: string }).id);

  if (error) console.error('[loadRepository] decrementLoad error:', error.message);
}

/**
 * Delete a load row by id.
 */
export async function removeLoad(id: string): Promise<void> {
  if (!isSupabaseConfigured) return;

  const { error } = await supabase.from('loads').delete().eq('id', id);
  if (error) console.error('[loadRepository] removeLoad error:', error.message);
}
