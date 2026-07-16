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

/**
 * Atomically replace ALL loads for a driver with the provided items.
 * Used when promoting a historical snapshot to live cargo — the snapshot
 * items become the new live `loads` rows (with fresh client-generated IDs),
 * and any previous live loads for that driver are deleted.
 *
 * Order: delete existing → insert new. Not wrapped in a DB transaction
 * (Supabase REST API doesn't expose them), but the caller has already
 * updated local state optimistically, so a partial failure leaves the DB
 * out of sync with local state only until the next bootstrap refetch.
 */
export async function replaceDriverLoads(
  driverId: string,
  newItems: CargoItem[]
): Promise<void> {
  if (!isSupabaseConfigured) return;

  // (1) Delete all existing loads for this driver.
  const { error: delErr } = await supabase
    .from('loads')
    .delete()
    .eq('driver_id', driverId);
  if (delErr) {
    console.error('[loadRepository] replaceDriverLoads (delete):', delErr.message);
    return;
  }

  if (newItems.length === 0) return;

  // (2) Insert the new items with their caller-provided IDs.
  const rows = newItems.map((item) => ({
    id: item.id,
    driver_id: driverId,
    product_name: item.productName,
    quantity: item.quantity,
    unit_price: item.unitPrice,
  }));

  const { error: insErr } = await supabase.from('loads').insert(rows);
  if (insErr) {
    console.error('[loadRepository] replaceDriverLoads (insert):', insErr.message);
  }
}

// ── Daily snapshots ───────────────────────────────────────────────────────────
//
// Immutable end-of-day inventory history. One row per (driver, snapshot_date),
// written by finalizeYesterdayIfNeeded either from the AppContext bootstrap
// flows (reads current DB loads) or from a load/sale mutation path (uses the
// captured pre-mutation cargo so the snapshot reflects yesterday's EOD state
// even if the mutation has already applied locally).
//
// Idempotency is guaranteed by the unique (driver_id, snapshot_date) constraint
// + ON CONFLICT DO NOTHING, NOT by the read-then-write check at step 1.

type SnapshotItem = { productName: string; quantity: number; unitPrice: number };

/** Baghdad timezone for date math. UTC+3, no DST. */
const BAGHDAD_TZ = 'Asia/Baghdad';

/** Returns YYYY-MM-DD for today in Baghdad local time. */
function baghdadToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BAGHDAD_TZ });
}

/** Returns YYYY-MM-DD for yesterday in Baghdad local time. */
function baghdadYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: BAGHDAD_TZ });
}

/**
 * True if the driver had any activity on the given Baghdad-local date:
 *   - a sale with `sales.date == dateStr` (DATE column, direct equality), OR
 *   - a loads row with `updated_at` falling inside the Baghdad day window
 *     (the day starts at 00:00 Baghdad = previous day 21:00 UTC).
 */
async function hadActivityOn(driverId: string, dateStr: string): Promise<boolean> {
  // (1) Sales — DATE column, direct equality. Indexed on (driver_id, date).
  const { data: salesRows } = await supabase
    .from('sales')
    .select('id')
    .eq('driver_id', driverId)
    .eq('date', dateStr)
    .limit(1);
  if (salesRows && salesRows.length > 0) return true;

  // (2) Loads — updated_at is timestamptz; compute the UTC window that
  //     corresponds to the Baghdad-local day [00:00, next 00:00).
  const [y, m, d] = dateStr.split('-').map(Number);
  const dayStartUtc = new Date(Date.UTC(y, m - 1, d, -3, 0, 0));      // 00:00 Baghdad
  const dayEndUtc = new Date(Date.UTC(y, m - 1, d + 1, -3, 0, 0));    // 00:00 next day Baghdad

  const { data: loadRows } = await supabase
    .from('loads')
    .select('id')
    .eq('driver_id', driverId)
    .gte('updated_at', dayStartUtc.toISOString())
    .lt('updated_at', dayEndUtc.toISOString())
    .limit(1);
  return !!(loadRows && loadRows.length > 0);
}

/**
 * Idempotently write an end-of-day snapshot for yesterday (Baghdad local).
 *
 * - If `cargoSnapshot` is supplied (called from a mutation path), uses that
 *   captured pre-mutation state — provably correct regardless of concurrent
 *   DB writes.
 * - If `cargoSnapshot` is omitted (called from bootstrap), fetches current
 *   `loads` from DB — correct because no mutation has happened today yet
 *   (verified by the activity-today check).
 *
 * Skips silently when:
 *   - snapshot for yesterday already exists (idempotency)
 *   - no activity yesterday (driver inactive — honest skip, no fabrication)
 *   - activity today already exists (first-deployment mid-day safety)
 *
 * Idempotency is guaranteed by the unique (driver_id, snapshot_date) constraint
 * + ON CONFLICT DO NOTHING, NOT by the read-then-write check at step 1.
 */
export async function finalizeYesterdayIfNeeded(
  driverId: string,
  cargoSnapshot?: CargoItem[]
): Promise<void> {
  if (!isSupabaseConfigured) return;

  const today = baghdadToday();
  const yesterday = baghdadYesterday();

  // (1) Idempotency check (optimization — the real guard is the unique constraint)
  const { data: existing } = await supabase
    .from('daily_load_snapshots')
    .select('id')
    .eq('driver_id', driverId)
    .eq('snapshot_date', yesterday)
    .limit(1);
  if (existing && existing.length > 0) return;

  // (2) Activity yesterday? If neither sales nor loads touched yesterday,
  //     there is nothing to freeze — skip silently (driver was inactive).
  if (!(await hadActivityOn(driverId, yesterday))) return;

  // (3) First-deployment safety: has anything mutated today already? If yes,
  //     current loads state is no longer "yesterday's EOD" — skip silently
  //     rather than write a wrong value.
  if (await hadActivityOn(driverId, today)) return;

  // (4) Build the items array. Use captured pre-mutation state when available;
  //     otherwise fetch current loads (which == yesterday's EOD at this point).
  let items: SnapshotItem[];
  if (cargoSnapshot) {
    items = cargoSnapshot
      .filter((l) => l.driverId === driverId)
      .map((l) => ({
        productName: l.productName,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      }));
  } else {
    const { data: currentLoads, error } = await supabase
      .from('loads')
      .select('product_name, quantity, unit_price')
      .eq('driver_id', driverId);
    if (error) {
      console.error('[loadRepository] finalizeYesterdayIfNeeded (fetch loads):', error.message);
      return;
    }
    items = (currentLoads ?? []).map((l: DbLoad) => ({
      productName: l.product_name,
      quantity: l.quantity,
      unitPrice: l.unit_price,
    }));
  }
  if (items.length === 0) return;

  // (5) Insert with ON CONFLICT DO NOTHING — the sole idempotency guarantee.
  //     A second concurrent caller that passed step 1 will hit the unique
  //     constraint here and silently no-op.
  const { error } = await supabase.from('daily_load_snapshots').upsert(
    {
      driver_id: driverId,
      snapshot_date: yesterday,
      items,
    },
    { onConflict: 'driver_id,snapshot_date', ignoreDuplicates: true }
  );
  if (error) {
    console.error('[loadRepository] finalizeYesterdayIfNeeded (insert):', error.message);
  }
}

/**
 * Fetch the snapshot for a specific date. Returns CargoItem[] so the existing
 * UI render code (cargo.map(item => ...)) works without changes.
 *
 * Snapshot rows store items as JSONB; we synthesize a stable `id` for each
 * item so React keys work the same as live loads.
 */
export async function fetchDailySnapshots(
  driverIds: string[],
  date: string
): Promise<CargoItem[]> {
  if (!isSupabaseConfigured || driverIds.length === 0) return [];

  const { data, error } = await supabase
    .from('daily_load_snapshots')
    .select('driver_id, snapshot_date, items')
    .in('driver_id', driverIds)
    .eq('snapshot_date', date);

  if (error) {
    console.error('[loadRepository] fetchDailySnapshots error:', error.message);
    return [];
  }

  const out: CargoItem[] = [];
  for (const row of (data ?? []) as Array<{
    driver_id: string;
    snapshot_date: string;
    items: SnapshotItem[];
  }>) {
    for (const item of row.items) {
      out.push({
        id: `${row.driver_id}:${item.productName}:${row.snapshot_date}`,
        driverId: row.driver_id,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      });
    }
  }
  return out;
}

/**
 * Returns the earliest snapshot date for a driver, or null if none exist.
 * Used by the daily nav UI to disable the "previous" button when there's
 * no more history to show.
 */
export async function fetchEarliestSnapshotDate(driverId: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase
    .from('daily_load_snapshots')
    .select('snapshot_date')
    .eq('driver_id', driverId)
    .order('snapshot_date', { ascending: true })
    .limit(1);

  if (error) {
    console.error('[loadRepository] fetchEarliestSnapshotDate error:', error.message);
    return null;
  }
  if (!data || data.length === 0) return null;
  return (data[0] as { snapshot_date: string }).snapshot_date;
}
